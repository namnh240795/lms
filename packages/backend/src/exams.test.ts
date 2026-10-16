import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExam, gradeExam } from './exams.js';
import { type Quiz, studentQuiz } from './quiz.js';
const question = (id: string, critical = false) => ({
  id,
  prompt: 'Which answer is correct?',
  critical,
  options: [
    { id: 'a', text: 'Correct' },
    { id: 'b', text: 'Incorrect' },
  ],
  correctOptionId: 'a',
  explanation: 'Review the rule.',
});
test('exam samples up to 30 unique questions across lessons and exactly one critical question', () => {
  const quiz: Quiz = {
    title: 'Quiz bank',
    passingScore: 100,
    questions: Array.from({ length: 25 }, (_, i) => question(String(i), i < 3)),
  };
  for (let n = 0; n < 20; n++) {
    const exam = buildExam([
      { lessonId: 'one', quiz },
      { lessonId: 'two', quiz },
    ]);
    assert.equal(exam.questions.length, 30);
    assert.equal(new Set(exam.questions.map((q) => q.id)).size, 30);
    assert.equal(exam.questions.filter((q) => q.critical).length, 1);
    assert.ok(exam.questions.some((q) => JSON.parse(q.id)[0] === 'one'));
    assert.ok(exam.questions.some((q) => JSON.parse(q.id)[0] === 'two'));
    assert.ok(!JSON.stringify(studentQuiz(exam, 'key')).includes('correctOptionId'));
  }
  assert.throws(() => buildExam([]));
});
test('exam grading accepts unanswered questions but rejects forged question and option IDs', () => {
  const quiz: Quiz = {
    title: 'Practice',
    passingScore: 90,
    questions: [question('one'), question('critical', true)],
  };
  const blank = gradeExam(quiz, {});
  assert.equal(blank.score, 0);
  assert.equal(blank.unanswered, 2);
  assert.equal(blank.criticalFailed, true);
  assert.equal(blank.feedback[0].selectedOptionId, '');
  assert.equal(gradeExam(quiz, { one: 'a', critical: 'a' }).passed, true);
  assert.throws(() => gradeExam(quiz, { unknown: 'a' }));
  assert.throws(() => gradeExam(quiz, { one: 'x' }));
});
test('critical errors fail even at the passing threshold; small banks retain their actual total', () => {
  const quiz: Quiz = {
    title: 'Practice',
    passingScore: 90,
    questions: Array.from({ length: 10 }, (_, i) => question(String(i), i === 0)),
  };
  const answers = Object.fromEntries(quiz.questions.slice(1).map((q) => [q.id, 'a']));
  const result = gradeExam(quiz, answers);
  assert.equal(result.score, 90);
  assert.equal(result.passed, false);
  assert.equal(result.unanswered, 1);
  assert.equal(buildExam([{ lessonId: 'small', quiz }]).questions.length, 10);
});

test('question namespaces cannot collide when tutor IDs contain delimiters', () => {
  const exam = buildExam([
    {
      lessonId: 'a:b',
      quiz: { title: 'First quiz', passingScore: 90, questions: [question('c')] },
    },
    {
      lessonId: 'a',
      quiz: { title: 'Second quiz', passingScore: 90, questions: [question('b:c')] },
    },
  ]);
  assert.equal(new Set(exam.questions.map((q) => q.id)).size, 2);
});
