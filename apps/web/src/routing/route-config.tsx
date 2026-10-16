import App from '@/App';
import {
  MistakesRoute,
  ExamRoute,
  ExploreRoute,
  LearningRoute,
  TutorRoute,
  OrdersRoute,
  AuthRoute,
  LogoutRoute,
  CourseRoute,
  BuilderRoute,
  RequireSession,
  NotFoundRoute,
  RouteError,
} from './route-pages';
export const routes = [
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <ExploreRoute /> },
      { path: 'login', element: <AuthRoute /> },
      { path: 'logout', element: <LogoutRoute /> },
      {
        path: 'learning',
        element: (
          <RequireSession>
            <LearningRoute />
          </RequireSession>
        ),
      },
      {
        path: 'orders',
        element: (
          <RequireSession>
            <OrdersRoute />
          </RequireSession>
        ),
      },
      {
        path: 'tutor',
        element: (
          <RequireSession tutor>
            <TutorRoute />
          </RequireSession>
        ),
      },
      {
        path: 'tutor/courses/new',
        element: (
          <RequireSession tutor>
            <BuilderRoute />
          </RequireSession>
        ),
      },
      {
        path: 'tutor/courses/:courseId/edit',
        element: (
          <RequireSession tutor>
            <BuilderRoute />
          </RequireSession>
        ),
      },
      { path: 'courses/:courseId', element: <CourseRoute /> },
      {
        path: 'learning/:courseId',
        element: (
          <RequireSession>
            <CourseRoute classroom />
          </RequireSession>
        ),
      },
      {
        path: 'learning/:courseId/lessons/:lessonId',
        element: (
          <RequireSession>
            <CourseRoute classroom />
          </RequireSession>
        ),
      },
      {
        path: 'learning/:courseId/exam',
        element: (
          <RequireSession>
            <ExamRoute />
          </RequireSession>
        ),
      },
      {
        path: 'learning/:courseId/exam/:attemptId',
        element: (
          <RequireSession>
            <ExamRoute />
          </RequireSession>
        ),
      },
      {
        path: 'learning/:courseId/mistakes',
        element: (
          <RequireSession>
            <MistakesRoute />
          </RequireSession>
        ),
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
];
