import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, it, expect, vi } from 'vitest';
import { SectionProgress } from './section-progress';
import { course } from '@/test/fixtures';
afterEach(cleanup);
it('shows section percentages/statuses and navigates to the unfinished quiz', async () => {
  const quizLesson = {
    ...course.lessons[1],
    quiz: { title: 'Final check', passingScore: 70, questions: [] },
  };
  const detailed = {
    ...course,
    sections: [course.sections[0], { ...course.sections[1], lessons: [quizLesson] }],
  };
  const open = vi.fn();
  render(
    <SectionProgress
      course={detailed}
      enrollment={{ course_id: course.id, completed: ['completed'] }}
      onOpenLesson={open}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: `Next unfinished lesson in ${course.title}` }),
  );
  expect(open).toHaveBeenCalledWith(quizLesson);
  await user.click(screen.getByText('Section progress · 2 sections'));
  expect(screen.getByText('Completed')).toBeTruthy();
  expect(screen.getByText('Not started')).toBeTruthy();
  expect(
    screen
      .getByRole('progressbar', { name: 'Getting started section completion' })
      .getAttribute('aria-valuenow'),
  ).toBe('100');
  await user.click(screen.getByRole('button', { name: 'Pass quiz: Second lesson' }));
  expect(open).toHaveBeenLastCalledWith(quizLesson);
});
