import { QueryClient, queryOptions } from '@tanstack/react-query';
import { api, ApiError, type Course, type Enrollment, type Order } from './api';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: (count, error) => count < 1 && (!(error instanceof ApiError) || error.status >= 500),
    },
    mutations: { retry: false },
  },
});
export const keys = {
  catalog: ['catalog'] as const,
  user: (id: string) => ['user', id] as const,
  enrollments: (id: string) => ['user', id, 'enrollments'] as const,
  orders: (id: string) => ['user', id, 'orders'] as const,
  mine: (id: string) => ['user', id, 'courses'] as const,
  content: (id: string, courseId: string) => ['user', id, 'content', courseId] as const,
  edit: (id: string, courseId: string) => ['user', id, 'edit', courseId] as const,
  attempts: (id: string, courseId: string, lessonId: string) =>
    ['user', id, 'attempts', courseId, lessonId] as const,
  media: (id: string, assetId: string) => ['user', id, 'media', assetId] as const,
  playback: (id: string, courseId: string, lessonId: string, assetId: string, preview: boolean) =>
    ['user', id, 'playback', courseId, lessonId, assetId, preview] as const,
};
export const catalogOptions = queryOptions({
  queryKey: keys.catalog,
  queryFn: ({ signal }) => api<Course[]>('/courses', 'GET', undefined, { signal }),
});
export const enrollmentOptions = (id: string) =>
  queryOptions({
    queryKey: keys.enrollments(id),
    queryFn: ({ signal }) => api<Enrollment[]>('/learning', 'GET', undefined, { signal }),
  });
export const orderOptions = (id: string) =>
  queryOptions({
    queryKey: keys.orders(id),
    queryFn: ({ signal }) => api<Order[]>('/orders', 'GET', undefined, { signal }),
  });
export const mineOptions = (id: string) =>
  queryOptions({
    queryKey: keys.mine(id),
    queryFn: ({ signal }) => api<Course[]>('/courses/mine', 'GET', undefined, { signal }),
  });
export const contentOptions = (id: string, courseId: string) =>
  queryOptions({
    queryKey: keys.content(id, courseId),
    queryFn: ({ signal }) =>
      api<Course>(`/courses/${courseId}/content`, 'GET', undefined, { signal }),
  });
export const editOptions = (id: string, courseId: string) =>
  queryOptions({
    queryKey: keys.edit(id, courseId),
    staleTime: 0,
    queryFn: ({ signal }) => api<Course>(`/courses/${courseId}/edit`, 'GET', undefined, { signal }),
  });
export async function refreshLearning(client: QueryClient, userId: string) {
  await client.invalidateQueries({ queryKey: keys.enrollments(userId) });
}
export async function refreshCourses(client: QueryClient, userId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.catalog }),
    client.invalidateQueries({ queryKey: keys.mine(userId) }),
    client.invalidateQueries({ queryKey: ['user', userId, 'content'] }),
    client.invalidateQueries({ queryKey: ['user', userId, 'edit'] }),
    client.invalidateQueries({ queryKey: keys.enrollments(userId) }),
  ]);
}
export async function clearPrivateQueries(client: QueryClient) {
  await client.cancelQueries({ queryKey: ['user'] });
  client.removeQueries({ queryKey: ['user'] });
}

export const dashboardKey = (userId: string) => ['user', userId, 'dashboard'] as const;
export const dashboardOptions = (userId: string) =>
  queryOptions({
    queryKey: dashboardKey(userId),
    queryFn: ({ signal }) =>
      api<import('./api').LearningDashboard>('/learning/dashboard', 'GET', undefined, { signal }),
  });
