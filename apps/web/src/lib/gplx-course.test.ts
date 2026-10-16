import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { courseFormSchema } from './form-schemas';
it('the full imported bank survives tutor form validation with image, critical, and source-page metadata', () => {
  const draft = JSON.parse(
    readFileSync(`${process.cwd()}/../../data/gplx/course-draft.json`, 'utf8'),
  );
  const parsed = courseFormSchema.parse({ ...draft, price: '0', thumbnail: null });
  const lessons = parsed.sections.flatMap((section) => section.lessons);
  const questions = lessons.flatMap((lesson) => lesson.quiz?.questions || []);
  expect(lessons).toHaveLength(27);
  expect(questions).toHaveLength(600);
  expect(questions.filter((question) => question.critical)).toHaveLength(60);
  expect(questions.filter((question) => question.image)).toHaveLength(317);
  expect(questions.every((question) => question.sourcePage)).toBe(true);
});
