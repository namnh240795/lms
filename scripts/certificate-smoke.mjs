import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
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
async function account(name) {
  cookie = '';
  await request('/auth/sign-up/email', 'POST', {
    name,
    email: `certificate-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'Certificate-test-12345',
  });
}
await account('Certificate Tutor');
await request('/role', 'POST', { role: 'tutor' });
const quiz = {
  title: 'Final knowledge check',
  passingScore: 70,
  questions: [
    {
      id: 'q',
      prompt: 'Which answer is correct?',
      options: [
        { id: 'yes', text: 'Correct' },
        { id: 'no', text: 'Incorrect' },
      ],
      correctOptionId: 'yes',
      explanation: 'Choose the correct answer.',
    },
  ],
};
const course = await request('/courses', 'POST', {
  title: 'Certificate integration course',
  description: 'Verify completion certificates and learner eligibility.',
  category: 'Development',
  price: 0,
  lessons: [
    { id: 'text', title: 'Practice lesson', content: 'Practice the concepts in this lesson.' },
    { id: 'quiz', title: 'Final quiz', content: '', quiz },
  ],
});
await request(`/courses/${course.id}/publish`, 'POST', { published: true });
const tutorCookie = cookie;
await account('Nguyễn Minh Anh');
const studentCookie = cookie;
await request(`/learning/${course.id}/certificate`, 'POST', {}, 403);
await request('/orders', 'POST', { courseId: course.id, outcome: 'success' });
let enrolled = false;
for (let i = 0; i < 30; i++) {
  enrolled = (await request('/learning')).some((e) => e.course_id === course.id);
  if (enrolled) break;
  await new Promise((r) => setTimeout(r, 500));
}
assert.ok(enrolled);
await request(`/learning/${course.id}/certificate`, 'POST', {}, 409);
await request(`/learning/${course.id}/progress`, 'POST', { lessonId: 'text' });
let content = await request(`/courses/${course.id}/content`);
await request(`/learning/${course.id}/quiz/quiz/attempts`, 'POST', {
  revision: content.lessons[1].quiz.revision,
  answers: { q: 'no' },
});
await request(`/learning/${course.id}/certificate`, 'POST', {}, 409);
await request(`/learning/${course.id}/quiz/quiz/attempts`, 'POST', {
  revision: content.lessons[1].quiz.revision,
  answers: { q: 'yes' },
});
const certificate = await request(`/learning/${course.id}/certificate`, 'POST', {});
assert.equal(certificate.learner_name, 'Nguyễn Minh Anh');
assert.equal(certificate.lesson_count, 2);
const pdf = Buffer.from(certificate.pdf, 'base64');
assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
await writeFile('/private/tmp/learnly-certificate-test.pdf', pdf);
const again = await request(`/learning/${course.id}/certificate`, 'POST', {});
assert.equal(again.id, certificate.id);
assert.equal(again.issued_at, certificate.issued_at);
await account('Other Student');
await request(`/learning/${course.id}/certificate`, 'POST', {}, 403);
cookie = tutorCookie;
const edit = await request(`/courses/${course.id}/edit`);
edit.sections[0].lessons[1].quiz.questions[0].explanation =
  'The revised course requires a new quiz pass.';
await request(`/courses/${course.id}`, 'PUT', {
  title: edit.title,
  description: edit.description,
  category: edit.category,
  price: edit.price,
  sections: edit.sections,
  version: edit.version,
});
cookie = studentCookie;
await request(`/learning/${course.id}/certificate`, 'POST', {}, 409);
content = await request(`/courses/${course.id}/content`);
await request(`/learning/${course.id}/quiz/quiz/attempts`, 'POST', {
  revision: content.lessons[1].quiz.revision,
  answers: { q: 'yes' },
});
const revised = await request(`/learning/${course.id}/certificate`, 'POST', {});
assert.notEqual(revised.id, certificate.id);
cookie = tutorCookie;
await request(`/courses/${course.id}/publish`, 'POST', { published: false });
console.log(
  'PASS: enrollment, full completion and current quiz gating, stable certificate identity/date, PDF download, learner privacy, and revised curriculum issuance.',
);
