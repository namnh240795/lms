import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet, Link } from 'react-router-dom';
import { RequireSession, AuthRoute } from './route-pages';
import type { AppContext } from './app-context';
afterEach(cleanup);
function shell(session: AppContext['session']) {
  return (
    <>
      <Link to="/orders">Orders</Link>
      <Outlet
        context={
          {
            session,
            isPending: false,
            role: 'student',
            busy: false,
            teach: vi.fn(),
          } as unknown as AppContext
        }
      />
    </>
  );
}
it('redirects a signed-out deep link to login with its exact return address', async () => {
  const router = createMemoryRouter(
    [
      {
        element: shell(null),
        children: [
          {
            path: '/learning/:courseId/lessons/:lessonId',
            element: (
              <RequireSession>
                <h1>Private lesson</h1>
              </RequireSession>
            ),
          },
          { path: '/login', element: <h1>Login</h1> },
        ],
      },
    ],
    { initialEntries: ['/learning/course/lessons/lesson?mode=practice'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Login' });
  expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
    '/learning/course/lessons/lesson?mode=practice',
  );
});
it('prevents student accounts from entering the tutor builder', async () => {
  const router = createMemoryRouter(
    [
      {
        element: shell({ user: { id: 'student' } } as AppContext['session']),
        children: [
          {
            path: '/tutor/courses/new',
            element: (
              <RequireSession tutor>
                <h1>Private builder</h1>
              </RequireSession>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/tutor/courses/new'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole('button', { name: 'Become a tutor' });
  expect(screen.queryByRole('heading', { name: 'Private builder' })).toBeNull();
});
it('restores page routes with browser-style back and forward navigation', async () => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <h1>Explore</h1> },
      { path: '/orders', element: <h1>Orders</h1> },
    ],
    { initialEntries: ['/', '/orders'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  expect(screen.getByRole('heading', { name: 'Orders' })).toBeTruthy();
  await act(() => router.navigate(-1));
  expect(screen.getByRole('heading', { name: 'Explore' })).toBeTruthy();
  await act(() => router.navigate(1));
  expect(screen.getByRole('heading', { name: 'Orders' })).toBeTruthy();
});
