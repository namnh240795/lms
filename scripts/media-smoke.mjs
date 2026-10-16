import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = 'http://localhost:5173';
let cookie = '';
async function request(path, method = 'GET', body, expected = 200, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      origin: base,
      cookie,
      'content-type': Buffer.isBuffer(body) ? 'video/mp4' : 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  assert.equal(
    response.status,
    expected,
    Buffer.isBuffer(data) ? data.toString() : JSON.stringify(data),
  );
  return data;
}
async function wait(id, status) {
  for (let i = 0; i < 60; i++) {
    const asset = await request(`/api/media/${id}`);
    if (asset.status === status) return asset;
    if (asset.status === 'failed' && status !== 'failed') throw new Error(asset.error);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Processing timeout');
}
await request('/api/media/uploads', 'POST', {}, 401);
await request('/api/auth/sign-up/email', 'POST', {
  name: 'Media Test Tutor',
  email: `media-${Date.now()}@example.com`,
  password: 'Media-test-12345',
});
await request('/api/role', 'POST', { role: 'tutor' });
const course = await request('/api/courses', 'POST', {
  title: 'Media integration test',
  description: 'A private course for testing video upload and playback.',
  category: 'Development',
  price: 0,
  lessons: [{ id: 'video', title: 'Video lesson', content: '' }],
});
const data = await readFile(process.argv[2] || '/private/tmp/learnly-video-test.mp4');
const upload = {
  courseId: course.id,
  lessonId: 'video',
  filename: 'test.mp4',
  mime: 'video/mp4',
  size: data.length,
};
await request('/api/media/uploads', 'POST', { ...upload, size: 2147483647 }, 413);
await request('/api/media/uploads', 'POST', { ...upload, lessonId: 'missing' }, 400);
const issued = await request('/api/media/uploads', 'POST', upload, 201);
await request(issued.uploadUrl.replace(/token=.*/, 'token=invalid'), 'PUT', data, 403);
await request(`/api/media/${issued.assetId}/playback`, 'POST', {}, 409);
await request(issued.uploadUrl, 'PUT', data);
await request(issued.uploadUrl, 'PUT', data, 409);
const asset = await wait(issued.assetId, 'ready');
assert.ok(asset.duration >= 2.9);
assert.ok(asset.width > 0);
const updated = await request(`/api/courses/${course.id}`, 'PUT', {
  ...course,
  sections: course.sections.map((s) => ({
    ...s,
    lessons: s.lessons.map((l) => ({ ...l, mediaId: issued.assetId })),
  })),
});
await request(`/api/courses/${course.id}/publish`, 'POST', { published: true });
const tutorCookie = cookie;
await request('/api/auth/sign-up/email', 'POST', {
  name: 'Media Test Student',
  email: `video-student-${Date.now()}@example.com`,
  password: 'Media-test-12345',
});
await request('/api/media/uploads', 'POST', upload, 404);
await request(`/api/media/${issued.assetId}/playback`, 'POST', {}, 403);
const tutorToken = await (async () => {
  const current = cookie;
  cookie = tutorCookie;
  const result = await request(`/api/media/${issued.assetId}/playback`, 'POST', {}, 201);
  cookie = current;
  return result;
})();
await request(tutorToken.url, 'GET', undefined, 403);
await request('/api/orders', 'POST', { courseId: course.id, outcome: 'success' });
for (let i = 0; i < 30; i++) {
  if ((await request('/api/learning')).some((e) => e.course_id === course.id)) break;
  await new Promise((r) => setTimeout(r, 500));
}
const playback = await request(`/api/media/${issued.assetId}/playback`, 'POST', {}, 201);
const range = await request(playback.url, 'GET', undefined, 206, { range: 'bytes=0-99' });
assert.equal(range.length, 100);
await request(playback.url, 'GET', undefined, 416, { range: 'bytes=999999999-' });
await request(`/api/learning/${course.id}/position/video`, 'PUT', { position: 1.5 });
assert.equal((await request(`/api/learning/${course.id}/position/video`)).position, 1.5);
const studentCookie = cookie;
cookie = '';
await request(playback.url, 'GET', undefined, 401);
cookie = tutorCookie;
const bad = Buffer.from('not a video');
const invalid = await request('/api/media/uploads', 'POST', { ...upload, size: bad.length }, 201);
await request(invalid.uploadUrl, 'PUT', bad);
await wait(invalid.assetId, 'failed');
await request(`/api/courses/${course.id}/publish`, 'POST', { published: false });
cookie = studentCookie;
await request(playback.url, 'GET', undefined, 206, { range: 'bytes=0-9' });
console.log(
  'PASS: video upload, processing, malformed video failure, single-use tokens, owner/enrollment checks, session-bound playback, byte ranges, and resume position.',
);
