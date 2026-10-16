import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExamPage, secondsRemaining, type ExamAttempt } from './exam';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const courseId = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222';
const base = `/learning/${courseId}/exams`;
function sample(): ExamAttempt {
  return {
    id,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1200000).toISOString(),
    serverNow: new Date().toISOString(),
    result: null,
    answers: {},
    quiz: {
      title: 'Timed practice',
      passingScore: 90,
      questions: [
        {
          id: 'q1',
          prompt: 'Which answer should you choose?',
          options: [
            { id: 'a', text: 'First choice' },
            { id: 'b', text: 'Second choice' },
          ],
        },
        {
          id: 'q2',
          prompt: 'What is the next answer?',
          options: [
            { id: 'c', text: 'Third choice' },
            { id: 'd', text: 'Fourth choice' },
          ],
        },
      ],
    },
  };
}
let saved: ExamAttempt;
beforeEach(() => {
  saved = sample();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path === `/courses/${courseId}`) return { title: 'Exam course' };
    if (path === base && (!method || method === 'GET')) return [];
    if (method === 'PATCH') {
      const answer = body as { questionId: string; optionId: string };
      saved = { ...saved, answers: { ...saved.answers, [answer.questionId]: answer.optionId } };
      return saved;
    }
    if (path.endsWith('/submit')) {
      saved = {
        ...saved,
        result: {
          correct: 0,
          total: 2,
          score: 0,
          passed: false,
          passingScore: 90,
          unanswered: 2,
          timedOut: true,
          feedback: [],
        },
      };
      return saved;
    }
    return saved;
  });
});
function mount(attempt = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={{ userId: 'student' }} />,
        children: [{ path: '/learning/:courseId/exam/:attemptId?', element: <ExamPage /> }],
      },
    ],
    { initialEntries: [`/learning/${courseId}/exam${attempt ? `/${id}` : ''}`] },
  );
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, client, router };
}
it('keeps countdown bounded and expires exactly at the deadline', () => {
  expect(secondsRemaining('2026-10-15T00:00:01Z', Date.parse('2026-10-15T00:00:00Z'))).toBe(1);
  expect(secondsRemaining('2026-10-15T00:00:01Z', Date.parse('2026-10-15T00:00:01Z'))).toBe(0);
  expect(secondsRemaining('2026-10-15T00:00:01Z', Date.parse('2026-10-16T00:00:01Z'))).toBe(0);
});
it('saves selected answers, tracks unanswered questions, and restores them after remount', async () => {
  const view = mount();
  fireEvent.click(await screen.findByRole('radio', { name: 'First choice' }));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'First choice' }).getAttribute('aria-checked')).toBe(
      'true',
    ),
  );
  expect(vi.mocked(api)).toHaveBeenCalledWith(`${base}/${id}`, 'PATCH', {
    questionId: 'q1',
    optionId: 'a',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'What is the next answer?' });
  expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Question 2, unanswered' })).toBeTruthy();
  view.unmount();
  mount();
  expect(
    (await screen.findByRole('radio', { name: 'First choice' })).getAttribute('aria-checked'),
  ).toBe('true');
});
it('requires confirmation before submitting unanswered questions', async () => {
  mount();
  await screen.findByRole('radio', { name: 'First choice' });
  fireEvent.click(screen.getByRole('button', { name: 'Submit exam' }));
  expect(
    screen.getByText('2 unanswered questions will count as incorrect. Submission is final.'),
  ).toBeTruthy();
  expect(vi.mocked(api).mock.calls.some(([p]) => p.endsWith('/submit'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm submission' }));
  await screen.findByRole('heading', { name: 'Keep practicing.' });
});
it('automatically submits an expired attempt once and displays its result', async () => {
  saved.expiresAt = new Date(Date.now() - 1000).toISOString();
  mount();
  await screen.findByRole('heading', { name: 'Keep practicing.' });
  expect(screen.getByText(/Time expired/)).toBeTruthy();
  expect(vi.mocked(api).mock.calls.filter(([p]) => p.endsWith('/submit')).length).toBe(1);
});
it('restores historical feedback with explicit unanswered and critical failure states', async () => {
  saved.result = {
    correct: 0,
    total: 1,
    score: 0,
    passed: false,
    passingScore: 90,
    unanswered: 1,
    timedOut: true,
    criticalFailed: true,
    feedback: [
      {
        questionId: 'q1',
        prompt: 'A critical question to review',
        critical: true,
        options: [{ id: 'a', text: 'Correct choice' }],
        selectedOptionId: '',
        correctOptionId: 'a',
        correct: false,
        explanation: '',
      },
    ],
  };
  mount();
  await screen.findByText(/Critical question failed/);
  expect(screen.getByText('Unanswered · Your answer: No answer')).toBeTruthy();
  expect(screen.getByText('Correct answer: Correct choice')).toBeTruthy();
});
