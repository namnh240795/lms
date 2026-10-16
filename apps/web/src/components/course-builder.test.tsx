import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseBuilder } from './course-builder';
import { api, type Course } from '@/lib/api';
import { course } from '@/test/fixtures';
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: vi.fn() };
});
function setup(value: Course | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const saved = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <CourseBuilder course={value} userId="tutor" onClose={vi.fn()} onSaved={saved} />
    </QueryClientProvider>,
  );
  return { client, saved };
}
describe('course form', () => {
  it('shows useful validation without sending invalid drafts', async () => {
    const { client } = setup(null);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(
        screen.getAllByText('Course titles need at least 5 characters.').length,
      ).toBeGreaterThan(0),
    );
    expect(api).not.toHaveBeenCalled();
    client.clear();
  });
  it('preserves lesson IDs while reordering and resets unsaved state after saving', async () => {
    vi.mocked(api).mockImplementation(async (_path, _method, body) => ({
      ...course,
      ...(body as object),
      version: 2,
    }));
    const { client, saved } = setup(course);
    await userEvent.click(screen.getByRole('button', { name: 'Move section 2 up' }));
    expect(screen.getByText('Unsaved changes')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const payload = vi.mocked(api).mock.calls[0][2] as Course;
    expect(payload.sections.map((s) => s.id)).toEqual(['second', 'first']);
    expect(payload.sections.flatMap((s) => s.lessons).map((l) => l.id)).toEqual([
      'practice',
      'completed',
    ]);
    expect(screen.getByText('All changes saved')).toBeDefined();
    client.clear();
  });
});
