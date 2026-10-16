import { z } from 'zod';
import type { FieldErrors, FieldValues } from 'react-hook-form';
const question = z.object({
  id: z.string(),
  image: z
    .string()
    .regex(/^\/gplx\/question-\d{3}\.png$/)
    .optional(),
  critical: z.boolean().optional(),
  sourcePage: z.number().int().min(1).max(188).optional(),
  prompt: z.string().trim().min(5, 'Question prompts need at least 5 characters.').max(1000),
  options: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().trim().min(1, 'Fill in every answer option.').max(1000),
      }),
    )
    .min(2)
    .max(6),
  correctOptionId: z.string().min(1, 'Choose the correct answer.'),
  explanation: z.string().max(2000).optional(),
});
const quiz = z
  .object({
    title: z.string().trim().min(3, 'Quiz titles need at least 3 characters.').max(150),
    passingScore: z.number().int().min(1, 'Passing score must be between 1 and 100.').max(100),
    questions: z.array(question).min(1).max(25),
  })
  .superRefine((quiz, context) => {
    quiz.questions.forEach((question, index) => {
      if (!question.options.some((o) => o.id === question.correctOptionId))
        context.addIssue({
          code: 'custom',
          path: ['questions', index, 'correctOptionId'],
          message: 'Choose one of the available answers.',
        });
    });
  });
export const courseFormSchema = z
  .object({
    title: z.string().trim().min(5, 'Course titles need at least 5 characters.').max(150),
    description: z
      .string()
      .trim()
      .min(20, 'Describe your course in at least 20 characters.')
      .max(3000),
    category: z.enum(['Development', 'Design', 'Business', 'Driving']),
    price: z
      .string()
      .refine(
        (value) =>
          value.trim() !== '' &&
          Number.isFinite(Number(value)) &&
          Number(value) >= 0 &&
          Number(value) <= 10000 &&
          Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 0.00001,
        'Enter a price from 0 to 10,000 with no more than two decimal places.',
      ),
    thumbnail: z.string().nullable(),
    sections: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().trim().min(2, 'Section titles need at least 2 characters.').max(150),
          lessons: z
            .array(
              z.object({
                id: z.string(),
                title: z
                  .string()
                  .trim()
                  .min(2, 'Lesson titles need at least 2 characters.')
                  .max(150),
                content: z.string().max(10000).optional(),
                mediaId: z.string().nullable().optional(),
                quiz: quiz.nullable().optional(),
                captions: z
                  .object({
                    label: z.string().trim().min(1).max(50),
                    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
                    vtt: z
                      .string()
                      .max(100000)
                      .refine((v) => /^WEBVTT/.test(v), 'Start captions with WEBVTT.'),
                  })
                  .nullable()
                  .optional(),
              }),
            )
            .max(100),
        }),
      )
      .max(30),
  })
  .superRefine((course, ctx) => {
    if (course.sections.flatMap((s) => s.lessons).length > 100)
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'A course may contain at most 100 lessons.',
      });
  });
export const authFormSchema = (signup: boolean) =>
  z
    .object({
      name: z.string(),
      email: z.email('Enter a valid email address.'),
      password: z.string().min(8, 'Use at least 8 characters for your password.'),
    })
    .superRefine((values, ctx) => {
      if (signup && values.name.trim().length < 2)
        ctx.addIssue({
          code: 'custom',
          path: ['name'],
          message: 'Enter your name (at least 2 characters).',
        });
    });
export function formMessages<T extends FieldValues>(errors: FieldErrors<T>): string[] {
  const messages = new Set<string>();
  function walk(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const error = value as Record<string, unknown>;
    if (typeof error.message === 'string') messages.add(error.message);
    for (const [key, item] of Object.entries(error))
      if (!['ref', 'type', 'message', 'types'].includes(key)) walk(item);
  }
  walk(errors);
  return [...messages];
}
