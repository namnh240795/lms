import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { NavigationGuard } from './navigation-guard';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps unsaved edits when canceled and allows a confirmed route change', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const router = createMemoryRouter(
    [
      {
        path: '/edit',
        element: (
          <>
            <NavigationGuard dirty message="Discard changes?" />
            <h1>Editing</h1>
            <Link to="/learning">My learning</Link>
          </>
        ),
      },
      { path: '/learning', element: <h1>Learning</h1> },
    ],
    { initialEntries: ['/edit'] },
  );
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'My learning' }));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(router.state.location.pathname).toBe('/edit');
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('link', { name: 'My learning' }));
  await screen.findByRole('heading', { name: 'Learning' });
  expect(router.state.location.pathname).toBe('/learning');
});
