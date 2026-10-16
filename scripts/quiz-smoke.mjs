import assert from 'node:assert/strict';
const base = 'http://localhost:5173';
let cookie = '';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: { origin: base, cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
await request('/auth/sign-up/email', 'POST', {
  name: 'Quiz Test Tutor',
  email: `quiz-tutor-${Date.now()}@example.com`,
  password: 'Quiz-test-12345',
});
await request('/role', 'POST', { role: 'tutor' });
const quiz = {
  title: 'React basics',
  passingScore: 70,
  questions: [
    {
      id: 'q1',
      prompt: 'Which hook stores state?',
      options: [
        { id: 'a', text: 'useState' },
        { id: 'b', text: 'useEffect' },
      ],
      correctOptionId: 'a',
      explanation: 'useState holds local component state.',
    },
    {
      id: 'q2',
      prompt: 'Which hook runs side effects?',
      options: [
        { id: 'c', text: 'useEffect' },
        { id: 'd', text: 'useState' },
      ],
      correctOptionId: 'c',
      explanation: 'useEffect synchronizes side effects.',
    },
  ],
};
const course = await request('/courses', 'POST', {
  title: 'Quiz testing course',
  description: 'A course for verifying quiz grading, privacy, and progress.',
  category: 'Development',
  price: 0,
  lessons: [{ id: 'quiz', title: 'React basics quiz', content: '', quiz }],
});
await request(`/courses/${course.id}/publish`, 'POST', { published: true });
const tutorCookie = cookie;
await request('/auth/sign-up/email', 'POST', {
  name: 'Quiz Test Student',
  email: `quiz-student-${Date.now()}@example.com`,
  password: 'Quiz-test-12345',
});
await request(`/learning/${course.id}/quiz/quiz/attempts`, 'GET', undefined, 403);
await request(`/courses/${course.id}/assessment/quiz`, 'GET', undefined, 403);
await request('/orders', 'POST', { courseId: course.id, outcome: 'success' });
for (let i = 0; i < 30; i++) {
  if ((await request('/learning')).some((e) => e.course_id === course.id)) break;
  await new Promise((r) => setTimeout(r, 500));
}
const content = await request(`/courses/${course.id}/content`);
const studentQuiz = content.lessons[0].quiz;
assert.ok(studentQuiz.revision);
assert.ok(!JSON.stringify(studentQuiz).includes('correctOptionId'));
assert.ok(!JSON.stringify(studentQuiz).includes('explanation'));
await request(`/learning/${course.id}/progress`, 'POST', { lessonId: 'quiz' }, 403);
await request(
  `/learning/${course.id}/quiz/quiz/attempts`,
  'POST',
  { revision: studentQuiz.revision, answers: { q1: 'a' } },
  400,
);
const failed = await request(`/learning/${course.id}/quiz/quiz/attempts`, 'POST', {
  revision: studentQuiz.revision,
  answers: { q1: 'b', q2: 'c' },
});
assert.equal(failed.score, 50);
assert.equal(failed.passed, false);
assert.equal(failed.feedback[0].correctOptionId, 'a');
await request(`/learning/${course.id}/progress`, 'POST', { lessonId: 'quiz' }, 403);
const passed = await request(`/learning/${course.id}/quiz/quiz/attempts`, 'POST', {
  revision: studentQuiz.revision,
  answers: { q1: 'a', q2: 'c' },
});
assert.equal(passed.score, 100);
assert.equal(passed.passed, true);
assert.ok(
  (await request('/learning')).find((e) => e.course_id === course.id).completed.includes('quiz'),
);
assert.equal((await request(`/learning/${course.id}/quiz/quiz/attempts`)).length, 2);
const studentCookie = cookie;
cookie = tutorCookie;
const editing = await request(`/courses/${course.id}/edit`);
await request(`/courses/${course.id}`, 'PUT', {
  ...editing,
  sections: editing.sections.map((s) => ({
    ...s,
    lessons: s.lessons.map((l) => ({ ...l, quiz: { ...quiz, passingScore: 90 } })),
  })),
});
cookie = studentCookie;
assert.ok(
  !(await request('/learning')).find((e) => e.course_id === course.id).completed.includes('quiz'),
);
await request(
  `/learning/${course.id}/quiz/quiz/attempts`,
  'POST',
  { revision: studentQuiz.revision, answers: { q1: 'a', q2: 'c' } },
  409,
);
await request(`/courses/${course.id}/assessment/quiz`, 'GET', undefined, 403);
await request(`/courses/${course.id}`, 'PUT', editing, 404);
cookie = tutorCookie;
await request(`/courses/${course.id}/publish`, 'POST', { published: false });
console.log(
  'PASS: quiz-only publishing, private answer keys, enrollment checks, failed/pass attempts, feedback, history, completion gating, and quiz revision invalidation.',
);
