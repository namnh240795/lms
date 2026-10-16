import { z } from 'zod';
import { createHmac } from 'node:crypto';
export const quizSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    passingScore: z.number().int().min(1).max(100),
    questions: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          image: z
            .string()
            .regex(/^\/gplx\/question-\d{3}\.png$/)
            .optional(),
          critical: z.boolean().optional(),
          sourcePage: z.number().int().min(1).max(188).optional(),
          prompt: z.string().trim().min(5).max(1000),
          options: z
            .array(
              z.object({
                id: z.string().min(1).max(100),
                text: z.string().trim().min(1).max(1000),
              }),
            )
            .min(2)
            .max(6),
          correctOptionId: z.string().min(1).max(100),
          explanation: z.string().max(2000).default(''),
        }),
      )
      .min(1)
      .max(25),
  })
  .superRefine((quiz, ctx) => {
    if (new Set(quiz.questions.map((q) => q.id)).size !== quiz.questions.length)
      ctx.addIssue({ code: 'custom', message: 'Question IDs must be unique.' });
    for (const q of quiz.questions) {
      if (
        new Set(q.options.map((o) => o.id)).size !== q.options.length ||
        !q.options.some((o) => o.id === q.correctOptionId)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Each question needs unique options and a valid correct answer.',
        });
    }
  });
export type Quiz = z.infer<typeof quizSchema>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function quizRevision(quiz: Quiz, key: string) {
  return createHmac('sha256', key)
    .update(JSON.stringify(canonical(quiz)))
    .digest('hex');
}
export function studentQuiz(quiz: Quiz, key: string) {
  return {
    title: quiz.title,
    passingScore: quiz.passingScore,
    revision: quizRevision(quiz, key),
    questions: quiz.questions.map(({ id, prompt, options, image, critical, sourcePage }) => ({
      id,
      prompt,
      options,
      image,
      critical,
      sourcePage,
    })),
  };
}
export function gradeQuiz(quiz: Quiz, answers: Record<string, string>) {
  if (
    Object.keys(answers).length !== quiz.questions.length ||
    quiz.questions.some((q) => !q.options.some((o) => o.id === answers[q.id])) ||
    Object.keys(answers).some((id) => !quiz.questions.some((q) => q.id === id))
  )
    throw Object.assign(new Error('Answer every question using one of its available options.'), {
      status: 400,
    });
  const correct = quiz.questions.filter((q) => answers[q.id] === q.correctOptionId).length;
  const score = Math.round((correct / quiz.questions.length) * 10000) / 100;
  return {
    score,
    passed:
      correct * 100 >= quiz.passingScore * quiz.questions.length &&
      !quiz.questions.some((q) => q.critical && answers[q.id] !== q.correctOptionId),
    criticalFailed: quiz.questions.some((q) => q.critical && answers[q.id] !== q.correctOptionId),
    correct,
    total: quiz.questions.length,
    passingScore: quiz.passingScore,
    feedback: quiz.questions.map((q) => ({
      questionId: q.id,
      prompt: q.prompt,
      image: q.image,
      critical: q.critical,
      options: q.options,
      selectedOptionId: answers[q.id],
      correctOptionId: q.correctOptionId,
      correct: answers[q.id] === q.correctOptionId,
      explanation: q.explanation,
    })),
  };
}
