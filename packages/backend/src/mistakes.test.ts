import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectMistakes, mistakeResolved, mistakeKey } from './mistakes.js';
import type { Quiz } from './quiz.js';
const question = {
  id: '["lesson","q1"]',
  prompt: 'Which answer is correct?',
  options: [
    { id: 'a', text: 'First' },
    { id: 'b', text: 'Second' },
  ],
  correctOptionId: 'a',
  explanation: '',
};
const quiz: Quiz = { title: 'Exam', passingScore: 90, questions: [question] };
const attempt = (time: string, correct = false, selectedOptionId = '') => ({
  quiz,
  result: { feedback: [{ questionId: question.id, correct, selectedOptionId }] },
  submitted_at: time,
});
test('mistakes combine repeat misses, count unanswered, and exclude correct and active exams', () => {
  const items = collectMistakes([
    attempt('2026-10-16T00:00:00Z'),
    attempt('2026-10-17T00:00:00Z', false, 'b'),
    attempt('2026-10-18T00:00:00Z', true, 'a'),
    { quiz, result: null, submitted_at: '' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].missed, 2);
  assert.equal(items[0].unanswered, 1);
  assert.equal(items[0].lastMissedAt, '2026-10-17T00:00:00.000Z');
  assert.equal(
    mistakeResolved(items[0], { correct: true, practiced_at: '2026-10-18T00:00:00Z' }),
    true,
  );
  assert.equal(
    mistakeResolved(items[0], { correct: true, practiced_at: '2026-10-16T12:00:00Z' }),
    false,
  );
  assert.equal(
    mistakeResolved(items[0], { correct: false, practiced_at: '2026-10-18T00:00:00Z' }),
    false,
  );
});
test('question snapshots stay distinct when their answer key changes and ignore JSONB key order', () => {
  assert.notEqual(mistakeKey(question), mistakeKey({ ...question, correctOptionId: 'b' }));
  assert.equal(
    mistakeKey(question),
    mistakeKey(Object.fromEntries(Object.entries(question).reverse()) as typeof question),
  );
  const changed = {
    ...attempt('2026-10-19T00:00:00Z'),
    quiz: { ...quiz, questions: [{ ...question, correctOptionId: 'b' }] },
  };
  assert.equal(collectMistakes([attempt('2026-10-16T00:00:00Z'), changed]).length, 2);
});
