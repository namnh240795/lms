import { it, expect } from 'vitest';
import { isCourseComplete } from './course-completion';
import { course } from '@/test/fixtures';
it('requires each current lesson instead of a matching progress count', () => {
  expect(
    isCourseComplete(course, [{ course_id: course.id, completed: ['completed', 'deleted'] }]),
  ).toBe(false);
  expect(
    isCourseComplete(course, [{ course_id: course.id, completed: ['completed', 'practice'] }]),
  ).toBe(true);
  expect(
    isCourseComplete({ ...course, lessons: [] }, [{ course_id: course.id, completed: [] }]),
  ).toBe(false);
});

import { courseProgress, learningProgress, completionPercent } from './course-completion';
it('ignores duplicate and removed progress IDs and counts outstanding quiz lessons', () => {
  const quizCourse = {
    ...course,
    lessons: [
      course.lessons[0],
      {
        ...course.lessons[1],
        quiz: { title: 'Check understanding', passingScore: 70, questions: [] },
      },
    ],
  };
  const progress = courseProgress(quizCourse, {
    course_id: course.id,
    completed: ['completed', 'completed', 'removed'],
  });
  expect(progress.completed).toBe(1);
  expect(progress.percent).toBe(50);
  expect(progress.remainingQuizzes.map((lesson) => lesson.id)).toEqual(['practice']);
  expect(
    courseProgress(quizCourse, { course_id: course.id, completed: ['completed', 'practice'] })
      .remainingQuizzes,
  ).toEqual([]);
});
it('weights overall completion by lessons and never rounds unfinished work to 100%', () => {
  const short = { ...course, id: 'short', lessons: [course.lessons[0]] };
  const result = learningProgress(
    [course, short],
    [
      { course_id: course.id, completed: [] },
      { course_id: 'short', completed: ['completed'] },
    ],
  );
  expect(result).toEqual({ completed: 1, total: 3, remainingQuizzes: 0 });
  expect(completionPercent(result.completed, result.total)).toBe(33);
  expect(completionPercent(999, 1000)).toBe(99);
  expect(completionPercent(0, 0)).toBe(0);
});

import { sectionProgress, nextUnfinishedLesson } from './course-completion';
it('reports each section status and chooses the first unfinished lesson in curriculum order', () => {
  const detailed = {
    ...course,
    sections: [
      course.sections[0],
      {
        ...course.sections[1],
        lessons: [
          course.lessons[1],
          {
            id: 'final',
            title: 'Final quiz',
            quiz: { title: 'Quiz', passingScore: 70, questions: [] },
          },
        ],
      },
      { id: 'empty', title: 'Coming soon', lessons: [] },
    ],
  };
  const enrollment = {
    course_id: course.id,
    completed: ['completed', 'practice', 'deleted', 'completed'],
  };
  const sections = sectionProgress(detailed, enrollment);
  expect(sections.map((section) => section.status)).toEqual([
    'Completed',
    'In progress',
    'Not started',
  ]);
  expect(sections.map((section) => section.percent)).toEqual([100, 50, 0]);
  expect(sections[1].remainingQuizzes.map((lesson) => lesson.id)).toEqual(['final']);
  expect(nextUnfinishedLesson(detailed, enrollment)?.id).toBe('final');
  expect(
    nextUnfinishedLesson(detailed, {
      ...enrollment,
      completed: [...enrollment.completed, 'final'],
    }),
  ).toBeUndefined();
});
