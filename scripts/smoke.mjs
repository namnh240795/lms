import assert from 'node:assert/strict';
const base = 'http://localhost:5173/api';
let cookie = '';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:5173',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
async function waitFor(fn) {
  for (let i = 0; i < 30; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Event processing timed out');
}
const courses = await request('/courses');
assert.ok(courses.length >= 4);
assert.ok(courses.every((c) => c.lessons.every((l) => !('content' in l))));
await request(`/courses/${courses[0].id}/content`, 'GET', undefined, 401);
await request('/auth/sign-up/email', 'POST', {
  name: 'Smoke Test Tutor',
  email: `smoke-${Date.now()}@example.com`,
  password: 'Test-password-12345',
});
await request(`/courses/${courses[0].id}/content`, 'GET', undefined, 403);
const order = await request('/orders', 'POST', { courseId: courses[0].id, outcome: 'success' });
await waitFor(async () => {
  const e = await request('/learning');
  return e.some((e) => e.course_id === courses[0].id);
});
const content = await request(`/courses/${courses[0].id}/content`);
assert.ok(content.lessons[0].content);
await request(`/learning/${courses[0].id}/progress`, 'POST', { lessonId: content.lessons[0].id });
await request(`/learning/${courses[0].id}/progress`, 'POST', { lessonId: content.lessons[0].id });
const learning = await request('/learning');
assert.equal(learning.find((e) => e.course_id === courses[0].id).completed.length, 1);
const repeat = await request('/orders', 'POST', { courseId: courses[0].id, outcome: 'success' });
assert.equal(order.id, repeat.id);
await request('/orders', 'POST', { courseId: courses[1].id, outcome: 'failure' });
await waitFor(async () => {
  const o = await request('/orders');
  return o.some((o) => o.course_id === courses[1].id && o.status === 'failed');
});
assert.ok(!(await request('/learning')).some((e) => e.course_id === courses[1].id));
await request('/role', 'POST', { role: 'tutor' });
const created = await request('/courses', 'POST', {
  title: 'Smoke test course',
  description: 'A course created to verify tutor publishing and ownership.',
  category: 'Development',
  price: 0,
  lessons: [
    { id: 'one', title: 'First lesson', content: 'Learn something useful in this test lesson.' },
  ],
});

const original = await request(`/courses/${created.id}/edit`);
const thumbnail =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=';
const draft = await request(`/courses/${created.id}`, 'PUT', {
  ...original,
  sections: [{ id: 'start', title: 'Getting started', lessons: [] }],
  thumbnail,
});
await request(`/courses/${created.id}/publish`, 'POST', { published: true }, 400);
const curriculum = [
  {
    id: 'practice',
    title: 'Practice first',
    lessons: [
      {
        id: 'second',
        title: 'Second lesson',
        content: 'Practice this concept with a concrete example.',
      },
    ],
  },
  {
    id: 'start',
    title: 'Getting started',
    lessons: [
      {
        id: 'one',
        title: 'First lesson updated',
        content: 'Updated content for your first lesson.',
      },
    ],
  },
];
const updated = await request(`/courses/${created.id}`, 'PUT', {
  ...draft,
  title: 'Updated smoke course',
  price: 2500,
  sections: curriculum,
});
assert.deepEqual(
  updated.lessons.map((l) => l.id),
  ['second', 'one'],
);
assert.equal(updated.thumbnail, thumbnail);
await request(`/courses/${created.id}`, 'PUT', { ...draft, sections: curriculum }, 409);
await request(
  `/courses/${created.id}`,
  'PUT',
  { ...updated, thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' },
  400,
);

await request(`/courses/${created.id}/publish`, 'POST', { published: true });
assert.ok((await request('/courses')).some((c) => c.id === created.id));
const published = (await request('/courses')).find((c) => c.id === created.id);
assert.equal(published.title, 'Updated smoke course');
assert.equal(published.sections[0].lessons[0].content, undefined);
assert.equal(published.thumbnail, thumbnail);

await request(`/courses/${created.id}/publish`, 'POST', { published: false });
await request('/auth/sign-out', 'POST', {});
await request('/auth/sign-up/email', 'POST', {
  name: 'Second Student',
  email: `second-${Date.now()}@example.com`,
  password: 'Test-password-12345',
});
await request(`/courses/${created.id}/publish`, 'POST', { published: false }, 404);
await request(`/courses/${created.id}/edit`, 'GET', undefined, 404);
await request(`/courses/${created.id}`, 'PUT', { ...updated, sections: curriculum }, 404);

await request(`/courses/${created.id}/content`, 'GET', undefined, 403);
console.log(
  'PASS: authentication, private lessons, payment success/failure, enrollment, idempotency, progress, curriculum editing, thumbnails, draft validation, optimistic concurrency, publishing, and ownership.',
);
