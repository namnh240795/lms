import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { keys, clearPrivateQueries, contentOptions } from './query';
import { useMarketplace, useMarketplaceActions } from '@/hooks/use-marketplace';
import { api } from './api';
import { course } from '@/test/fixtures';
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, api: vi.fn() };
});
describe('private query cache', () => {
  it('keeps keys scoped to each signed-in account and clears private data on logout', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.catalog, [course]);
    client.setQueryData(keys.enrollments('first'), [
      { course_id: course.id, completed: ['completed'] },
    ]);
    client.setQueryData(keys.enrollments('second'), []);
    expect(client.getQueryData(keys.enrollments('second'))).toEqual([]);
    await clearPrivateQueries(client);
    expect(client.getQueryData(keys.enrollments('first'))).toBeUndefined();
    expect(client.getQueryData(keys.enrollments('second'))).toBeUndefined();
    expect(client.getQueryData(keys.catalog)).toEqual([course]);
    client.clear();
  });
  it('deduplicates shared lesson reads and does not show the previous account library after switching', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path === '/courses'
        ? [course]
        : path === '/learning'
          ? [{ course_id: course.id, completed: [] }]
          : path === '/orders'
            ? []
            : path === '/courses/mine'
              ? []
              : { ...course },
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30000 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(({ id }) => useMarketplace(id, 'learning'), {
      initialProps: { id: 'first' },
      wrapper,
    });
    await waitFor(() => expect(hook.result.current.library.length).toBe(1));
    await client.fetchQuery(contentOptions('first', course.id));
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path === `/courses/${course.id}/content`).length,
    ).toBe(1);
    hook.rerender({ id: 'second' });
    expect(hook.result.current.library).toEqual([]);
    await waitFor(() => expect(hook.result.current.library.length).toBe(1));
    hook.unmount();
    client.clear();
  });
});

it('does not restore another account’s orders when checkout finishes after an account switch', async () => {
  let resolve: (value: unknown) => void = () => {};
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ id }) => useMarketplaceActions(id), {
    initialProps: { id: 'first' },
    wrapper,
  });
  let pending: Promise<unknown>;
  act(() => {
    pending = hook.result.current.checkout.mutateAsync({
      userId: 'first',
      courseId: course.id,
      outcome: 'success',
    });
  });
  await waitFor(() => expect(hook.result.current.checkout.isPending).toBe(true));
  hook.rerender({ id: 'second' });
  await act(async () => {
    resolve({
      id: 'order',
      course_id: course.id,
      status: 'paid',
      title: course.title,
      amount: course.price,
    });
    await pending!;
  });
  expect(client.getQueryData(keys.orders('first'))).toBeUndefined();
  expect(client.getQueryData(keys.orders('second'))).toBeUndefined();
  hook.unmount();
  client.clear();
});
