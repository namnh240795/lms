import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { it, expect, vi, afterEach } from 'vitest';
import { LearningPage } from './learning';
import { dashboardKey } from '@/lib/query';
import { course } from '@/test/fixtures';
vi.mock('@/lib/api', async () => ({ ...(await vi.importActual('@/lib/api')), api: vi.fn() }));
afterEach(cleanup);
it('resumes the precise recent lesson and searches saved notes across courses', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const visit = {
    course_id: course.id,
    course_title: course.title,
    lesson_id: 'practice',
    lesson_title: 'Second lesson',
    updated_at: new Date().toISOString(),
  };
  client.setQueryData(dashboardKey('learner'), {
    visits: [visit],
    saved: [
      { ...visit, note: 'Practice semantic HTML', bookmarked: true },
      {
        ...visit,
        lesson_id: 'completed',
        lesson_title: 'First lesson',
        note: 'Review TypeScript',
        bookmarked: false,
      },
    ],
  });
  const open = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LearningPage
        userId="learner"
        library={[course]}
        enrollments={[{ course_id: course.id, completed: [] }]}
        loading={false}
        error={null}
        onOpen={open}
        onExplore={vi.fn()}
        onRetry={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Resume lesson' }));
  expect(open).toHaveBeenCalledWith(course, 'practice');
  await user.type(screen.getByLabelText('Search saved learning'), 'semantic');
  expect(screen.getByText('Practice semantic HTML')).toBeTruthy();
  expect(screen.queryByText('Review TypeScript')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Open lesson' }));
  expect(open).toHaveBeenLastCalledWith(course, 'practice');
});

it('separates completed courses and offers certificates only in the completed view', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(dashboardKey('learner'), { visits: [], saved: [] });
  render(
    <QueryClientProvider client={client}>
      <LearningPage
        userId="learner"
        library={[course]}
        enrollments={[{ course_id: course.id, completed: ['completed', 'practice'] }]}
        loading={false}
        error={null}
        onOpen={vi.fn()}
        onExplore={vi.fn()}
        onRetry={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('button', { name: 'View certificate' })).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Completed courses (1)' }));
  expect(screen.getByRole('button', { name: 'View certificate' })).toBeTruthy();
  expect(screen.getByRole('button', { name: `View ${course.title}` })).toBeTruthy();
});

it('shows course progress and opens an outstanding quiz lesson directly', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(dashboardKey('learner'), { visits: [], saved: [] });
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
  quizCourse.sections = quizCourse.sections.map((section) => ({
    ...section,
    lessons: section.lessons.map((lesson) =>
      quizCourse.lessons.find((item) => item.id === lesson.id)!,
    ),
  }));
  const open = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LearningPage
        userId="learner"
        library={[quizCourse]}
        enrollments={[{ course_id: course.id, completed: ['completed'] }]}
        loading={false}
        error={null}
        onOpen={open}
        onExplore={vi.fn()}
        onRetry={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(
    screen
      .getByRole('progressbar', { name: `${course.title} completion` })
      .getAttribute('aria-valuenow'),
  ).toBe('50');
  expect(screen.getByText('1 quiz remaining')).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByText('Section progress · 2 sections'));
  await user.click(screen.getByRole('button', { name: 'Pass quiz: Second lesson' }));
  expect(open).toHaveBeenCalledWith(quizCourse, 'practice');
});
