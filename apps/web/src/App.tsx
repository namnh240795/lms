import { useEffect, useState, Suspense } from 'react';
import {
  NavLink,
  Link,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ArrowRight, GraduationCap, LogOut, ShoppingBag, X } from 'lucide-react';
import { authClient, type Course } from '@/lib/api';
import { useMarketplace, useMarketplaceActions } from '@/hooks/use-marketplace';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/query-state';
import { paths, loginPath } from '@/routing/paths';
import type { AppContext } from '@/routing/app-context';
export default function App() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id || '';
  const location = useLocation(),
    navigate = useNavigate();
  const page = location.pathname.startsWith(paths.learning)
    ? 'learning'
    : location.pathname.startsWith(paths.tutor)
      ? 'tutor'
      : location.pathname === paths.orders
        ? 'orders'
        : 'explore';
  const data = useMarketplace(userId, page),
    actions = useMarketplaceActions(userId);
  const [role, setRole] = useState('student'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    setRole((session?.user as { role?: string } | undefined)?.role || 'student');
  }, [session?.user.id]);
  useEffect(() => {
    document.title = `${page === 'learning' ? 'My learning' : page === 'tutor' ? 'Tutor workspace' : page === 'orders' ? 'Orders' : location.pathname.startsWith('/courses/') ? 'Course' : 'Learn something great'} · Learnly`;
  }, [location.pathname, page]);
  const busy = actions.publish.isPending || actions.tutor.isPending || actions.signOut.isPending;
  function teach() {
    if (!session) {
      navigate(loginPath(paths.tutor));
      return;
    }
    if (role === 'tutor') {
      navigate(paths.tutor);
      return;
    }
    actions.tutor.mutate(undefined, {
      onSuccess: () => {
        setRole('tutor');
        navigate(paths.tutor);
        setNotice('Your tutor workspace is ready. Create your first course.');
      },
      onError: (error) => setError(error.message),
    });
  }
  function openCourse(course: Course, lessonId?: string) {
    const enrolled = data.enrollments.data?.some((item) => item.course_id === course.id);
    navigate(enrolled ? paths.classroom(course.id, lessonId) : paths.course(course.id));
  }
  const context: AppContext = {
    session,
    isPending,
    userId,
    role,
    data,
    actions,
    busy,
    teach,
    openCourse,
    notify: setNotice,
    report: setError,
  };
  return (
    <div className="app-shell">
      <header>
        <div className="header-inner">
          <Link className="brand" to={paths.home}>
            <span className="brand-icon">
              <GraduationCap size={25} />
            </span>
            learnly<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to={paths.home} end>
              Explore
            </NavLink>
            <NavLink to={paths.learning}>My learning</NavLink>
          </nav>
          <div className="header-actions">
            <button className="teach-link" disabled={busy} onClick={teach}>
              Teach on Learnly
            </button>
            {session ? (
              <>
                <Button asChild variant="ghost" size="icon">
                  <NavLink to={paths.orders} aria-label="Orders">
                    <ShoppingBag size={19} />
                  </NavLink>
                </Button>
                <button
                  className="avatar"
                  title={session.user.name}
                  aria-label={`Log out ${session.user.name}`}
                  disabled={busy}
                  onClick={() => navigate('/logout')}
                >
                  {session.user.name.slice(0, 1).toUpperCase()}
                  <LogOut size={12} />
                </button>
              </>
            ) : (
              <Button asChild variant="outline" disabled={isPending}>
                <Link
                  to={loginPath(
                    location.pathname === '/login'
                      ? new URLSearchParams(location.search).get('returnTo') || paths.learning
                      : location.pathname + location.search,
                  )}
                >
                  Log in
                  <ArrowRight size={15} />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main id="main-content">
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice}
            <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <Suspense
          fallback={
            <section className="workspace">
              <QueryState loading />
            </section>
          }
        >
          <Outlet context={context} />
        </Suspense>
      </main>
      <footer>
        <Link className="brand" to={paths.home}>
          <GraduationCap size={22} />
          learnly.
        </Link>
        <p>A little learning can change a lot.</p>
        <span>Made for curious minds.</span>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
