import assert from 'node:assert/strict';
const base = 'http://localhost:5173';
let cookie = '';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: { origin: base, cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.headers.getSetCookie().length)
    cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
const account = async (name) => {
  cookie = '';
  await request('/auth/sign-up/email', 'POST', {
    name,
    email: `tools-${name}-${Date.now()}@example.com`,
    password: 'Learning-tools-12345',
  });
};
await account('Tutor');
await request('/role', 'POST', { role: 'tutor' });
const captions = {
  label: 'English',
  language: 'en',
  vtt: 'WEBVTT\n\n00:00.000 --> 00:03.000\nA useful learning tip.\n',
};
const draft = {
  title: 'Learning tools integration test',
  description: 'Verify private lesson notes, bookmarks, and captions.',
  category: 'Development',
  price: 0,
  lessons: [
    { id: 'first', title: 'First lesson', content: 'Practice writing a short summary.', captions },
  ],
};
await request(
  '/courses',
  'POST',
  { ...draft, lessons: [{ ...draft.lessons[0], captions: { ...captions, vtt: 'invalid' } }] },
  400,
);
const course = await request('/courses', 'POST', draft);
await request(`/courses/${course.id}/publish`, 'POST', { published: true });
const tutorCookie = cookie;
assert.ok(!JSON.stringify(await request(`/courses/${course.id}`)).includes('WEBVTT'));
await request(`/learning/${course.id}/tools`, 'GET', undefined, 403);
await account('Student');
await request(`/learning/${course.id}/tools`, 'GET', undefined, 403);
await request('/orders', 'POST', { courseId: course.id, outcome: 'success' });
let enrolled = false;
for (let i = 0; i < 30; i++) {
  enrolled = (await request('/learning')).some((e) => e.course_id === course.id);
  if (enrolled) break;
  await new Promise((r) => setTimeout(r, 500));
}
assert.ok(enrolled);
assert.equal(
  (await request(`/courses/${course.id}/content`)).lessons[0].captions.vtt,
  captions.vtt,
);
const path = `/learning/${course.id}/tools/first`;
await request(path, 'PATCH', { note: 'My private practice plan.' });
await request(path, 'PATCH', { bookmarked: true });
let tools = await request(`/learning/${course.id}/tools`);
assert.equal(tools[0].note, 'My private practice plan.');
assert.equal(tools[0].bookmarked, true);
await request(path, 'PATCH', { note: 'n'.repeat(10001) }, 400);
await request(`/learning/${course.id}/tools/missing`, 'PATCH', { note: 'unknown' }, 404);
await request(path, 'PATCH', {}, 400);
await request(`/learning/${course.id}/activity/first`, 'POST', {});
let dashboard = await request('/learning/dashboard');
assert.equal(dashboard.visits[0].lesson_id, 'first');
assert.equal(dashboard.visits[0].course_title, course.title);
assert.equal(dashboard.saved[0].note, 'My private practice plan.');
assert.equal(dashboard.saved[0].bookmarked, true);
await request(`/learning/${course.id}/activity/missing`, 'POST', {}, 404);
const studentCookie = cookie;
await account('Other');
await request(path, 'PATCH', { note: 'not allowed' }, 403);
await request(`/learning/${course.id}/activity/first`, 'POST', {}, 403);
assert.deepEqual(await request('/learning/dashboard'), { visits: [], saved: [] });
await request('/orders', 'POST', { courseId: course.id, outcome: 'success' });
for (let i = 0; i < 30; i++) {
  if ((await request('/learning')).some((e) => e.course_id === course.id)) break;
  await new Promise((r) => setTimeout(r, 500));
}
assert.deepEqual(await request(`/learning/${course.id}/tools`), []);
assert.deepEqual(await request('/learning/dashboard'), { visits: [], saved: [] });
cookie = studentCookie;
await request(path, 'PATCH', { note: '', bookmarked: false });
tools = await request(`/learning/${course.id}/tools`);
assert.equal(tools[0].note, '');
assert.equal(tools[0].bookmarked, false);
assert.deepEqual((await request('/learning/dashboard')).saved, []);
assert.equal((await request('/learning/dashboard')).visits.length, 1);
cookie = tutorCookie;
await request(`/courses/${course.id}/publish`, 'POST', { published: false });
console.log(
  'PASS: private notes/bookmarks, enrollment and lesson checks, partial updates, clearing, student isolation, caption validation, and caption privacy.',
);
