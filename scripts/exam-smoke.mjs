import assert from 'node:assert/strict';
const { database } = await import('../packages/backend/src/config.ts');
const db = database('learning');
const base = 'http://localhost:5173';
let cookie = '';
let cleanupCourse, cleanupCookie;
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
try {
  const stamp = Date.now();
  await request('/auth/sign-up/email', 'POST', {
    name: 'Exam Test Tutor',
    email: `exam-tutor-${stamp}@example.com`,
    password: 'Exam-test-12345',
  });
  await request('/role', 'POST', { role: 'tutor' });
  const quiz = {
    title: 'Exam smoke questions',
    passingScore: 100,
    questions: Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      prompt: `Which option is correct for question ${i + 1}?`,
      critical: i === 0,
      options: [
        { id: 'a', text: 'Correct option' },
        { id: 'b', text: 'Incorrect option' },
      ],
      correctOptionId: 'a',
      explanation: 'First option is correct.',
    })),
  };
  const course = await request('/courses', 'POST', {
    title: `Exam smoke ${stamp}`,
    description: 'A disposable course verifying timed exams, ownership, and expiry.',
    category: 'Development',
    price: 0,
    lessons: [{ id: 'quiz', title: 'Exam practice', content: '', quiz }],
  });
  await request(`/courses/${course.id}/publish`, 'POST', { published: true });
  const tutorCookie = cookie;
  cleanupCourse = course.id;
  cleanupCookie = cookie;
  await request('/auth/sign-up/email', 'POST', {
    name: 'Exam Test Student',
    email: `exam-student-${stamp}@example.com`,
    password: 'Exam-test-12345',
  });
  const route = `/learning/${course.id}/exams`;
  await request(route, 'POST', {}, 403);
  await request('/orders', 'POST', { courseId: course.id, outcome: 'success' });
  let enrolled = false;
  for (let n = 0; n < 30; n++) {
    if ((await request('/learning')).some((e) => e.course_id === course.id)) {
      enrolled = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(enrolled);
  const [started, parallel] = await Promise.all([
    request(route, 'POST', {}),
    request(route, 'POST', {}),
  ]);
  assert.equal(started.id, parallel.id);
  assert.equal(Date.parse(started.expiresAt) - Date.parse(started.startedAt), 20 * 60 * 1000);
  assert.ok(!JSON.stringify(started).includes('correctOptionId'));
  const url = `${route}/${started.id}`;
  const studentCookie = cookie;
  cookie = tutorCookie;
  await request(url, 'GET', undefined, 403);
  cookie = studentCookie;
  await request(url, 'PATCH', { questionId: 'fake', optionId: 'a' }, 400);
  const first = started.quiz.questions[0];
  await request(url, 'PATCH', { questionId: first.id, optionId: 'a' });
  assert.equal((await request(url)).answers[first.id], 'a');
  // Fast-forward only this synthetic test's deadline; never change real learner exams.
  await db.query("UPDATE exam_attempts SET expires_at=now()-interval '1 second' WHERE id=$1", [
    started.id,
  ]);
  const expired = await request(url, 'PATCH', {
    questionId: started.quiz.questions[1].id,
    optionId: 'a',
  });
  assert.equal(expired.result.timedOut, true);
  assert.equal(expired.result.unanswered, 9);
  assert.equal(expired.result.correct, 1);
  const again = await request(url + '/submit', 'POST', {});
  assert.deepEqual(again.result, expired.result);
  assert.equal(
    (await request('/learning')).find((e) => e.course_id === course.id).completed.length,
    0,
  );
  const mistakesRoute = `/learning/${course.id}/mistakes`;
  const mistakes = await request(mistakesRoute);
  assert.equal(mistakes.items.length, 9);
  assert.ok(!JSON.stringify(mistakes).includes('correctOptionId'));
  const target = mistakes.items[0];
  await request(`${mistakesRoute}/${target.key}/practice`, 'POST', { optionId: 'fake' }, 400);
  await request(`${mistakesRoute}/${target.key}/practice`, 'POST', { optionId: 'b' });
  assert.equal(
    (await request(mistakesRoute)).items.find((i) => i.key === target.key).resolved,
    false,
  );
  await request(`${mistakesRoute}/${target.key}/practice`, 'POST', { optionId: 'a' });
  assert.equal(
    (await request(mistakesRoute)).items.find((i) => i.key === target.key).resolved,
    true,
  );
  const repeat = await request(route, 'POST', {});
  await request(`${route}/${repeat.id}/submit`, 'POST', {});
  assert.equal(
    (await request(mistakesRoute)).items.find((i) => i.key === target.key).resolved,
    false,
  );
  const retry = await request(route, 'POST', {});
  assert.notEqual(retry.id, started.id);
  for (const q of retry.quiz.questions)
    await request(`${route}/${retry.id}`, 'PATCH', { questionId: q.id, optionId: 'a' });
  // Snapshot survives changes to the course's quizzes.
  cookie = tutorCookie;
  const edit = await request(`/courses/${course.id}/edit`);
  await request(`/courses/${course.id}`, 'PUT', {
    version: edit.version,
    title: course.title,
    description: course.description,
    category: course.category,
    price: course.price,
    lessons: [
      {
        id: 'quiz',
        title: 'Changed quiz',
        content: '',
        quiz: { ...quiz, questions: quiz.questions.map((q) => ({ ...q, correctOptionId: 'b' })) },
      },
    ],
  });
  cookie = studentCookie;
  const passed = await request(`${route}/${retry.id}/submit`, 'POST', {});
  assert.equal(passed.result.score, 100);
  assert.equal(passed.result.passed, true);
  assert.equal(passed.result.timedOut, false);
  await request('/auth/sign-up/email', 'POST', {
    name: 'Other Exam Student',
    email: `exam-other-${stamp}@example.com`,
    password: 'Exam-test-12345',
  });
  await request('/orders', 'POST', { courseId: course.id, outcome: 'success' });
  for (let n = 0; n < 30; n++) {
    if ((await request('/learning')).some((e) => e.course_id === course.id)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await request(url, 'GET', undefined, 404);
  assert.equal((await request(route)).length, 0);
  assert.equal((await request(mistakesRoute)).items.length, 0);
  await request(`${mistakesRoute}/${target.key}/practice`, 'POST', { optionId: 'a' }, 404);
  cookie = studentCookie;
  const history = await request(route);
  assert.equal(history.length, 3);
  assert.ok(history.every((h) => !h.active));
  const third = await request(route, 'POST', {});
  await db.query("UPDATE exam_attempts SET expires_at=now()-interval '1 second' WHERE id=$1", [
    third.id,
  ]);
  await request(mistakesRoute);
  assert.ok((await request(route)).every((h) => !h.active));
  assert.equal((await request(`${route}/${third.id}`)).result.unanswered, 10);
  cookie = '';
  await request(route, 'GET', undefined, 401);
  console.log(
    'Exam smoke passed: enrollment, concurrent start, hidden keys, saved answers, deadline, idempotency, snapshots, history, account isolation, and no lesson completion.',
  );
} finally {
  if (cleanupCourse && cleanupCookie) {
    cookie = cleanupCookie;
    await request(`/courses/${cleanupCourse}/publish`, 'POST', { published: false });
  }
  await db.end();
}
