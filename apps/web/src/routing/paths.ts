export const paths = {
  home: '/',
  learning: '/learning',
  orders: '/orders',
  tutor: '/tutor',
  newCourse: '/tutor/courses/new',
  course: (id: string) => `/courses/${encodeURIComponent(id)}`,
  classroom: (id: string, lessonId?: string) =>
    `/learning/${encodeURIComponent(id)}${lessonId ? `/lessons/${encodeURIComponent(lessonId)}` : ''}`,
  mistakes: (id: string) => `/learning/${encodeURIComponent(id)}/mistakes`,
  exam: (id: string, attemptId?: string) =>
    `/learning/${encodeURIComponent(id)}/exam${attemptId ? `/${encodeURIComponent(attemptId)}` : ''}`,
  edit: (id: string) => `/tutor/courses/${encodeURIComponent(id)}/edit`,
};
export function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return paths.learning;
  const url = new URL(value, 'https://learnly.local');
  if (
    url.origin !== 'https://learnly.local' ||
    !/^\/(?:$|learning(?:\/|$)|courses\/|tutor(?:\/|$)|orders$)/.test(url.pathname)
  )
    return paths.learning;
  return url.pathname + url.search + url.hash;
}
export const loginPath = (returnTo = paths.learning) =>
  `/login?returnTo=${encodeURIComponent(returnTo)}`;
export const validCourseId = (id: string | undefined) =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
