import type { Course, Enrollment } from './api';
export function completionPercent(completed: number, total: number) {
  return total
    ? Math.min(completed === total ? 100 : 99, Math.round((completed / total) * 100))
    : 0;
}
export function courseProgress(course: Course, enrollment?: Enrollment) {
  const ids = new Set(enrollment?.completed || []);
  const completed = course.lessons.filter((lesson) => ids.has(lesson.id)).length;
  const total = course.lessons.length;
  const quizzes = course.lessons.filter((lesson) => lesson.quiz);
  const remainingQuizzes = quizzes.filter((lesson) => !ids.has(lesson.id));
  return {
    completed,
    total,
    percent: completionPercent(completed, total),
    quizCount: quizzes.length,
    remainingQuizzes,
  };
}
export function learningProgress(library: Course[], enrollments: Enrollment[]) {
  return library.reduce(
    (summary, course) => {
      const progress = courseProgress(
        course,
        enrollments.find((item) => item.course_id === course.id),
      );
      return {
        completed: summary.completed + progress.completed,
        total: summary.total + progress.total,
        remainingQuizzes: summary.remainingQuizzes + progress.remainingQuizzes.length,
      };
    },
    { completed: 0, total: 0, remainingQuizzes: 0 },
  );
}
export function isCourseComplete(course: Course, enrollments: Enrollment[]) {
  const progress = courseProgress(
    course,
    enrollments.find((item) => item.course_id === course.id),
  );
  return progress.total > 0 && progress.completed === progress.total;
}

export function sectionProgress(course: Course, enrollment?: Enrollment) {
  const ids = new Set(enrollment?.completed || []);
  return course.sections.map((section) => {
    const completed = section.lessons.filter((lesson) => ids.has(lesson.id)).length;
    const total = section.lessons.length;
    return {
      section,
      completed,
      total,
      percent: completionPercent(completed, total),
      status:
        total > 0 && completed === total
          ? 'Completed'
          : completed > 0
            ? 'In progress'
            : 'Not started',
      nextLesson: section.lessons.find((lesson) => !ids.has(lesson.id)),
      remainingQuizzes: section.lessons.filter((lesson) => lesson.quiz && !ids.has(lesson.id)),
    };
  });
}
export function nextUnfinishedLesson(course: Course, enrollment?: Enrollment) {
  return sectionProgress(course, enrollment).find((section) => section.nextLesson)?.nextLesson;
}
