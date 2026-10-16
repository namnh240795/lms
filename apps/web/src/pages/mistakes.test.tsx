import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MistakesPage, filterMistakes, type Mistake } from './mistakes';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const courseId = '11111111-1111-4111-8111-111111111111';
const item: Mistake = {
  key: 'a'.repeat(64),
  question: {
    id: 'q1',
    prompt: 'Which answer is the right choice?',
    critical: true,
    options: [
      { id: 'a', text: 'First answer' },
      { id: 'b', text: 'Second answer' },
    ],
  },
  sectionId: 'chapter1',
  sectionTitle: 'First chapter',
  missed: 2,
  unanswered: 1,
  lastMissedAt: '2026-10-16T00:00:00Z',
  resolved: false,
};
let items: Mistake[];
beforeEach(() => {
  items = [structuredClone(item)];
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (_path, method, body) => {
    if (method === 'POST') {
      const correct = (body as { optionId: string }).optionId === 'a';
      items = [{ ...items[0], resolved: correct }];
      return { correct, correctOptionId: 'a', explanation: 'First answer is correct.' };
    }
    return { title: 'Test course', items: structuredClone(items) };
  });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={{ userId: 'student' }} />,
        children: [{ path: '/learning/:courseId/mistakes', element: <MistakesPage /> }],
      },
    ],
    { initialEntries: [`/learning/${courseId}/mistakes`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
it('combines section, critical-question and correction filters', () => {
  const other = {
    ...item,
    key: 'other',
    sectionId: 'chapter2',
    resolved: true,
    question: { ...item.question, critical: false },
  };
  expect(
    filterMistakes([item, other], { section: 'chapter1', status: 'remaining', type: 'critical' }),
  ).toEqual([item]);
  expect(
    filterMistakes([item, other], { section: 'all', status: 'corrected', type: 'all' }),
  ).toEqual([other]);
  expect(filterMistakes([other], { section: 'all', status: 'all', type: 'critical' })).toEqual([]);
});
it('grades an untimed retry, retains feedback after the collection refresh, and remembers correction', async () => {
  const view = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Practice' }));
  fireEvent.click(screen.getByRole('radio', { name: 'First answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  await screen.findByText('Correct — mistake corrected!');
  await waitFor(() => expect(items[0].resolved).toBe(true));
  expect(screen.getByText('Correct answer: First answer')).toBeTruthy();
  view.unmount();
  mount();
  await screen.findByText('Nothing here for these filters.');
  expect(screen.queryByRole('button', { name: 'Practice' })).toBeNull();
});
it('shows a helpful empty state before any mistakes exist', async () => {
  items = [];
  mount();
  await screen.findByRole('heading', { name: 'No mistakes yet.' });
  expect(screen.getByRole('link', { name: 'Open exams' })).toBeTruthy();
});
