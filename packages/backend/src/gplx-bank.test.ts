import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { quizSchema, gradeQuiz, studentQuiz } from './quiz.js';
const questions = JSON.parse(
  readFileSync(new URL('../../../data/gplx/questions.json', import.meta.url), 'utf8'),
);
const critical = JSON.parse(
  readFileSync(new URL('../../../data/gplx/critical-questions.json', import.meta.url), 'utf8'),
);
test('official GPLX bank has 600 ordered questions, unique answer keys, and available illustration assets', () => {
  assert.deepEqual(
    questions.map((q: any) => q.number),
    Array.from({ length: 600 }, (_, i) => i + 1),
  );
  assert.equal(critical.length, 60);
  assert.equal(new Set(critical).size, 60);
  for (const q of questions) {
    assert.ok(q.prompt.length >= 5);
    assert.ok(q.options.length >= 2);
    assert.equal(q.answerCandidates.length, 1);
    assert.ok(q.options.some((option: any) => option.id === q.correctOptionId));
    if (q.image)
      assert.ok(existsSync(new URL(`../../../apps/web/public${q.image}`, import.meta.url)));
  }
});
test('a wrong critical answer fails even above the score threshold, while student payload retains images without keys', () => {
  const quiz = quizSchema.parse({
    title: 'Luyện câu điểm liệt',
    passingScore: 50,
    questions: [
      {
        id: 'critical',
        prompt: 'Câu quan trọng về an toàn',
        critical: true,
        image: '/gplx/question-352.png',
        options: [
          { id: 'a', text: 'Đúng' },
          { id: 'b', text: 'Sai' },
        ],
        correctOptionId: 'a',
      },
      {
        id: 'normal',
        prompt: 'Câu hỏi luyện tập khác',
        options: [
          { id: 'a', text: 'Đúng' },
          { id: 'b', text: 'Sai' },
        ],
        correctOptionId: 'a',
      },
    ],
  });
  const result = gradeQuiz(quiz, { critical: 'b', normal: 'a' });
  assert.equal(result.score, 50);
  assert.equal(result.passed, false);
  assert.equal(result.criticalFailed, true);
  const publicQuiz = studentQuiz(quiz, 'test-key');
  assert.equal(publicQuiz.questions[0].image, '/gplx/question-352.png');
  assert.equal(publicQuiz.questions[0].critical, true);
  assert.ok(!JSON.stringify(publicQuiz).includes('correctOptionId'));
});
