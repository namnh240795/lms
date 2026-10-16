import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, it, expect, vi } from 'vitest';
import { LessonNotes, toolsKey } from './lesson-notes';
import { useQuery } from '@tanstack/react-query';
import { api, type LessonTool } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
afterEach(cleanup);
it('bookmarking keeps unsaved note text and sends only the bookmark field', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const saved = {
    lesson_id: 'lesson',
    note: 'Previously saved note',
    bookmarked: false,
    updated_at: '',
  };
  client.setQueryData(toolsKey('student', 'course'), [saved]);
  vi.mocked(api).mockResolvedValue({ ...saved, bookmarked: true });
  function Wrapper() {
    const data = useQuery<LessonTool[]>({
      queryKey: toolsKey('student', 'course'),
      queryFn: async () => [saved],
      staleTime: Infinity,
    });
    return (
      <LessonNotes
        userId="student"
        courseId="course"
        lessonId="lesson"
        tool={data.data?.[0]}
        onDirty={vi.fn()}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Wrapper />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Notes'));
  await user.type(screen.getByLabelText('Notes'), 'Unsaved new idea');
  await user.click(screen.getByRole('button', { name: 'Bookmark lesson' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Bookmarked' })).toBeTruthy());
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Unsaved new idea');
  expect(api).toHaveBeenCalledWith('/learning/course/tools/lesson', 'PATCH', { bookmarked: true });
  expect(screen.getByText('Unsaved notes')).toBeTruthy();
});
