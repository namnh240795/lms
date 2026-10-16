import { captionsSchema } from './captions.js';
import { quizSchema } from './quiz.js';
import { z } from 'zod';
const lessonSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(2).max(150),
  content: z.string().max(10000),
  mediaId: z.uuid().nullable().optional(),
  captions: captionsSchema.nullable().optional(),
  quiz: quizSchema.nullable().optional(),
});
export const sectionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(2).max(150),
  lessons: z.array(lessonSchema).max(100),
});
export type Section = z.infer<typeof sectionSchema>;
const thumbnail = z
  .string()
  .max(700000)
  .nullable()
  .optional()
  .refine((value) => {
    if (!value) return true;
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[2], 'base64');
    return match[1] === 'jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : match[1] === 'png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  }, 'Upload a valid JPEG, PNG, or WebP thumbnail under 500 KB.');
export const courseSchema = z
  .object({
    title: z.string().trim().min(5).max(150),
    description: z.string().trim().min(20).max(3000),
    category: z.enum(['Development', 'Design', 'Business', 'Driving']),
    price: z.number().int().min(0).max(1000000),
    thumbnail,
    sections: z.array(sectionSchema).max(30).optional(),
    lessons: z.array(lessonSchema).max(100).optional(),
    version: z.number().int().min(1).optional(),
  })
  .transform((data) => ({
    ...data,
    sections: data.sections ?? [
      { id: 'overview', title: 'Course overview', lessons: data.lessons ?? [] },
    ],
  }))
  .superRefine((data, ctx) => {
    const lessons = data.sections.flatMap((s) => s.lessons);
    if (lessons.length > 100)
      ctx.addIssue({ code: 'custom', message: 'A course may contain at most 100 lessons.' });
    if (
      new Set(data.sections.map((s) => s.id)).size !== data.sections.length ||
      new Set(lessons.map((l) => l.id)).size !== lessons.length
    )
      ctx.addIssue({ code: 'custom', message: 'Sections and lessons must have unique IDs.' });
  });
export function publishProblems(sections: Section[]) {
  const issues: string[] = [];
  if (!sections.length) issues.push('Add at least one section.');
  for (const section of sections) {
    if (!section.lessons.length) issues.push(`Add a lesson to “${section.title}”.`);
    for (const lesson of section.lessons)
      if (!lesson.quiz && !lesson.mediaId && lesson.content.trim().length < 10)
        issues.push(`Add at least 10 characters of content to “${lesson.title}”.`);
  }
  return issues;
}
export function normalizeCourse(course: any) {
  const sections: Section[] = course.sections ?? [
    { id: 'overview', title: 'Course overview', lessons: course.lessons },
  ];
  return { ...course, sections, lessons: sections.flatMap((s) => s.lessons) };
}
export function publicCourse(course: any) {
  const normalized = normalizeCourse(course);
  return {
    ...normalized,
    sections: normalized.sections.map((s: Section) => ({
      ...s,
      lessons: s.lessons.map((l) => ({ id: l.id, title: l.title })),
    })),
    lessons: normalized.lessons.map((l: any) => ({ id: l.id, title: l.title })),
  };
}
