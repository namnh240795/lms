import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizSchema, gradeQuiz, studentQuiz, quizRevision } from './quiz.js';
const quiz = quizSchema.parse({
  title: 'Check your skills',
  passingScore: 70,
  questions: [
    {
      id: 'one',
      prompt: 'Which answer is correct?',
      options: [
        { id: 'a', text: 'First answer' },
        { id: 'b', text: 'Second answer' },
      ],
      correctOptionId: 'b',
      explanation: 'The second answer is correct.',
    },
    {
      id: 'two',
      prompt: 'What should you select?',
      options: [
        { id: 'c', text: 'Third answer' },
        { id: 'd', text: 'Fourth answer' },
      ],
      correctOptionId: 'c',
    },
  ],
});
test('grading scores only known, complete answers and returns feedback', () => {
  assert.equal(gradeQuiz(quiz, { one: 'b', two: 'c' }).score, 100);
  assert.equal(gradeQuiz(quiz, { one: 'a', two: 'c' }).passed, false);
  assert.equal(gradeQuiz(quiz, { one: 'a', two: 'c' }).feedback[0].correctOptionId, 'b');
  assert.throws(() => gradeQuiz(quiz, { one: 'b' }));
  assert.throws(() => gradeQuiz(quiz, { one: 'x', two: 'c' }));
  assert.throws(() => gradeQuiz(quiz, { one: 'b', two: 'c', extra: 'a' }));
});
test('student payload omits answer keys and revisions change when the quiz changes', () => {
  const safe = studentQuiz(quiz, 'key');
  assert.ok(!JSON.stringify(safe).includes('correctOptionId'));
  assert.ok(!JSON.stringify(safe).includes('explanation'));
  assert.notEqual(quizRevision(quiz, 'key'), quizRevision({ ...quiz, passingScore: 90 }, 'key'));
  assert.notEqual(quizRevision(quiz, 'key'), quizRevision(quiz, 'other-key'));
});
test('invalid correct options and duplicated questions are rejected', () => {
  assert.throws(() =>
    quizSchema.parse({
      ...quiz,
      questions: [{ ...quiz.questions[0], correctOptionId: 'missing' }],
    }),
  );
  assert.throws(() =>
    quizSchema.parse({ ...quiz, questions: [quiz.questions[0], quiz.questions[0]] }),
  );
});

test('quiz revisions are stable across PostgreSQL JSONB key ordering', () => {
  const reordered = JSON.parse(JSON.stringify(quiz), (_key, value) =>
    value && !Array.isArray(value) && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse())
      : value,
  );
  assert.equal(quizRevision(quiz, 'key'), quizRevision(reordered, 'key'));
});
