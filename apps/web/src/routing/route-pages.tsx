import { lazy, useEffect, useState, useRef, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from './app-context';
import { paths, loginPath, safeReturnTo, validCourseId } from './paths';
import { api, type Course } from '@/lib/api';
import { editOptions, refreshCourses } from '@/lib/query';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
const MistakesPage = lazy(() =>
  import('@/pages/mistakes').then((module) => ({ default: module.MistakesPage })),
);
export function MistakesRoute() {
  return <MistakesPage />;
}
const ExamPage = lazy(() =>
  import('@/pages/exam').then((module) => ({ default: module.ExamPage })),
);
export function ExamRoute() {
  return <ExamPage />;
}
const ExplorePage = lazy(() =>
  import('@/pages/explore').then((module) => ({ default: module.ExplorePage })),
);
const LearningPage = lazy(() =>
  import('@/pages/learning').then((module) => ({ default: module.LearningPage })),
);
const TutorPage = lazy(() =>
  import('@/pages/tutor').then((module) => ({ default: module.TutorPage })),
);
const OrdersPage = lazy(() =>
  import('@/pages/orders').then((module) => ({ default: module.OrdersPage })),
);
const AuthDialog = lazy(() =>
  import('@/components/auth-dialog').then((module) => ({ default: module.AuthDialog })),
);
const CourseDialog = lazy(() =>
  import('@/components/course-dialog').then((module) => ({ default: module.CourseDialog })),
);
const CourseBuilder = lazy(() =>
  import('@/components/course-builder').then((module) => ({ default: module.CourseBuilder })),
);
export function RequireSession({
  children,
  tutor = false,
}: {
  children: ReactNode;
  tutor?: boolean;
}) {
  const { session, isPending, role, teach, busy } = useApp();
  const location = useLocation();
  if (isPending)
    return (
      <section className="workspace">
        <QueryState loading />
      </section>
    );
  if (!session) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  if (tutor && role !== 'tutor')
    return (
      <section className="workspace empty">
        <h1>Start teaching</h1>
        <p>Create your tutor workspace to manage courses.</p>
        <Button disabled={busy} onClick={teach}>
          Become a tutor
        </Button>
      </section>
    );
  return children;
}
export function ExploreRoute() {
  const { data, openCourse, teach } = useApp();
  return (
    <ExplorePage
      courses={data.catalog.data || []}
      enrollments={data.enrollments.data || []}
      loading={data.catalog.isPending}
      error={data.catalog.error}
      onOpen={openCourse}
      onTeach={teach}
      onRefresh={() => void data.catalog.refetch()}
    />
  );
}
export function LearningRoute() {
  const { data, userId, openCourse } = useApp();
  const navigate = useNavigate(),
    client = useQueryClient();
  return (
    <LearningPage
      userId={userId}
      library={data.library}
      enrollments={data.enrollments.data || []}
      loading={data.enrollments.isPending || data.libraryLoading}
      error={data.enrollments.error || data.libraryError}
      onOpen={openCourse}
      onExplore={() => navigate(paths.home)}
      onRetry={() => void client.invalidateQueries({ queryKey: ['user', userId] })}
    />
  );
}
export function TutorRoute() {
  const { data, actions, busy, report } = useApp();
  const navigate = useNavigate();
  return (
    <TutorPage
      mine={data.mine.data || []}
      loading={data.mine.isPending}
      error={data.mine.error}
      busy={busy}
      onCreate={() => navigate(paths.newCourse)}
      onEdit={(course) => navigate(paths.edit(course.id))}
      onPublish={(course) =>
        actions.publish.mutate(
          { id: course.id, published: !course.published },
          { onError: (error) => report(error.message) },
        )
      }
      onRetry={() => void data.mine.refetch()}
    />
  );
}
export function OrdersRoute() {
  const { data } = useApp();
  const navigate = useNavigate();
  return (
    <OrdersPage
      orders={data.orders.data || []}
      enrollments={data.enrollments.data || []}
      loading={data.orders.isPending}
      error={data.orders.error}
      onLearning={() => navigate(paths.learning)}
      onExplore={() => navigate(paths.home)}
      onRetryOrder={(id) => navigate(paths.course(id))}
      onRetry={() => void data.orders.refetch()}
    />
  );
}
export function AuthRoute() {
  const { session, isPending, notify } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const target = safeReturnTo(params.get('returnTo'));
  if (isPending) return <QueryState loading />;
  if (session) return <Navigate to={target} replace />;
  return (
    <AuthDialog
      standalone
      onClose={() => navigate(paths.home)}
      onSuccess={() => {
        notify('Welcome to Learnly. Your next chapter starts here.');
        navigate(target, { replace: true });
      }}
    />
  );
}
export function CourseRoute({ classroom = false }: { classroom?: boolean }) {
  const { courseId, lessonId } = useParams();
  const { userId, session, data, actions, notify } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const valid = validCourseId(courseId);
  const course = useQuery({
    queryKey: ['user', userId, 'course-details', courseId],
    enabled: valid,
    queryFn: ({ signal }) => api<Course>(`/courses/${courseId}`, 'GET', undefined, { signal }),
  });
  if (!valid) return <NotFoundRoute />;
  if (course.isPending || (session && data.enrollments.isPending))
    return (
      <section className="workspace">
        <QueryState loading />
      </section>
    );
  if (course.isError || data.enrollments.isError)
    return (
      <section className="workspace">
        <QueryState
          error={course.error || data.enrollments.error}
          onRetry={() => {
            void course.refetch();
            void data.enrollments.refetch();
          }}
        />
        <Button asChild variant="outline">
          <Link to={paths.home}>Explore courses</Link>
        </Button>
      </section>
    );
  const enrollment = data.enrollments.data?.find((item) => item.course_id === courseId);
  if (classroom && !enrollment) return <Navigate to={paths.course(courseId!)} replace />;
  if (!classroom && enrollment) return <Navigate to={paths.classroom(courseId!)} replace />;
  if (lessonId && !course.data.lessons.some((lesson) => lesson.id === lessonId))
    return (
      <section className="workspace empty">
        <h1>Lesson not found</h1>
        <p>This lesson may have been removed or moved.</p>
        <Button asChild>
          <Link to={paths.classroom(courseId!)}>Open course</Link>
        </Button>
      </section>
    );
  return (
    <CourseDialog
      key={`${userId}:${courseId}`}
      standalone
      course={course.data}
      userId={userId}
      enrolled={enrollment}
      initialLessonId={lessonId}
      onLessonChange={(id, replace = false) =>
        navigate(paths.classroom(courseId!, id), { replace })
      }
      onClose={() => navigate(classroom ? paths.learning : paths.home)}
      onLogin={() => navigate(loginPath(location.pathname))}
      onCheckout={async (id, outcome) => {
        await actions.checkout.mutateAsync({ courseId: id, outcome, userId });
        notify('Test checkout submitted. No money was charged.');
        navigate(paths.orders);
      }}
    />
  );
}
export function BuilderRoute() {
  const { courseId } = useParams();
  const { userId } = useApp();
  const navigate = useNavigate(),
    client = useQueryClient();
  const [created, setCreated] = useState<Course | null>(null);
  const course = useQuery({
    ...editOptions(userId, courseId || ''),
    enabled: !!courseId && validCourseId(courseId),
  });
  useEffect(() => {
    if (!courseId && created) navigate(paths.edit(created.id), { replace: true });
  }, [courseId, created, navigate]);
  if (courseId && !validCourseId(courseId)) return <NotFoundRoute />;
  if (courseId && (course.isPending || course.isError))
    return (
      <section className="workspace">
        <QueryState
          loading={course.isPending}
          error={course.error}
          onRetry={() => void course.refetch()}
        />
      </section>
    );
  return (
    <CourseBuilder
      key={`${userId}:${courseId || 'new'}`}
      standalone
      course={courseId ? course.data! : null}
      userId={userId}
      onClose={() => navigate(paths.tutor)}
      onSaved={async (saved) => {
        client.setQueryData(editOptions(userId, saved.id).queryKey, saved);
        await refreshCourses(client, userId);
        if (!courseId) setCreated(saved);
      }}
    />
  );
}
export function NotFoundRoute() {
  return (
    <section className="workspace empty">
      <h1>Page not found</h1>
      <p>The address may be incorrect or the page may have moved.</p>
      <Button asChild>
        <Link to={paths.home}>Explore courses</Link>
      </Button>
    </section>
  );
}
export function RouteError() {
  const error = useRouteError();
  return (
    <section className="workspace empty">
      <h1>
        {isRouteErrorResponse(error) && error.status === 404
          ? 'Page not found'
          : 'Something went wrong'}
      </h1>
      <p>Please reload the page and try again.</p>
      <Button asChild>
        <a href="/">Return to Learnly</a>
      </Button>
    </section>
  );
}

export function LogoutRoute() {
  const { actions, notify } = useApp();
  const navigate = useNavigate();
  const started = useRef(false);
  const signOut = () =>
    actions.signOut.mutate(undefined, {
      onSuccess: () => {
        notify('');
        navigate(paths.home, { replace: true });
      },
    });
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      signOut();
    }
  }, []);
  return (
    <section className="workspace">
      <QueryState
        loading={!actions.signOut.isError}
        error={actions.signOut.error}
        onRetry={signOut}
      />
    </section>
  );
}
