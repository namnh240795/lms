import { createHash } from 'node:crypto';
import type { Quiz } from './quiz.js';
type Question = Quiz['questions'][number];
export function mistakeKey(question: Question) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: question.id,
        prompt: question.prompt,
        image: question.image || '',
        critical: !!question.critical,
        options: question.options.map((o) => ({ id: o.id, text: o.text })),
        correctOptionId: question.correctOptionId,
        explanation: question.explanation || '',
      }),
    )
    .digest('hex');
}
export function collectMistakes(
  attempts: { quiz: Quiz; result: any; submitted_at: string | Date }[],
) {
  const items = new Map<
    string,
    { key: string; question: Question; missed: number; unanswered: number; lastMissedAt: string }
  >();
  for (const attempt of attempts) {
    if (!attempt.result) continue;
    for (const feedback of attempt.result.feedback) {
      if (feedback.correct) continue;
      const question = attempt.quiz.questions.find((q) => q.id === feedback.questionId);
      if (!question) continue;
      const key = mistakeKey(question),
        previous = items.get(key);
      const time = new Date(attempt.submitted_at).toISOString();
      items.set(key, {
        key,
        question,
        missed: (previous?.missed || 0) + 1,
        unanswered: (previous?.unanswered || 0) + (feedback.selectedOptionId ? 0 : 1),
        lastMissedAt: previous && previous.lastMissedAt > time ? previous.lastMissedAt : time,
      });
    }
  }
  return [...items.values()].sort(
    (a, b) => b.lastMissedAt.localeCompare(a.lastMissedAt) || a.key.localeCompare(b.key),
  );
}
export function mistakeResolved(
  item: { lastMissedAt: string },
  practice?: { correct: boolean; practiced_at: string | Date },
) {
  return (
    !!practice?.correct &&
    new Date(practice.practiced_at).getTime() >= new Date(item.lastMissedAt).getTime()
  );
}
