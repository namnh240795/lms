import { useRef } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, authClient, type Course, type Enrollment, type Order } from '@/lib/api';
import {
  catalogOptions,
  enrollmentOptions,
  orderOptions,
  mineOptions,
  contentOptions,
  keys,
  refreshCourses,
  refreshLearning,
  clearPrivateQueries,
} from '@/lib/query';
export function useMarketplace(
  userId: string,
  page: 'explore' | 'learning' | 'orders' | 'tutor' = 'explore',
) {
  const client = useQueryClient();
  const catalog = useQuery(catalogOptions);
  const orders = useQuery({
    ...orderOptions(userId),
    enabled: !!userId,
    refetchInterval: (query) => {
      const enrolled = client.getQueryData<Enrollment[]>(keys.enrollments(userId)) || [];
      return query.state.data?.some(
        (o) =>
          o.status === 'pending' ||
          (o.status === 'paid' && !enrolled.some((e) => e.course_id === o.course_id)),
      )
        ? 1500
        : false;
    },
  });
  const awaiting =
    orders.data?.some(
      (o) =>
        o.status === 'pending' ||
        (o.status === 'paid' &&
          !(client.getQueryData<Enrollment[]>(keys.enrollments(userId)) || []).some(
            (e) => e.course_id === o.course_id,
          )),
    ) || false;
  const enrollments = useQuery({
    ...enrollmentOptions(userId),
    enabled: !!userId,
    refetchInterval: awaiting ? 1500 : false,
  });
  const mine = useQuery({ ...mineOptions(userId), enabled: !!userId && page === 'tutor' });
  const libraryQueries = useQueries({
    queries:
      userId && page === 'learning'
        ? (enrollments.data || []).map((e) => ({
            ...contentOptions(userId, e.course_id),
            enabled: !!userId,
          }))
        : [],
  });
  return {
    catalog,
    orders,
    enrollments,
    mine,
    library: libraryQueries.flatMap((query) => (query.data ? [query.data] : [])),
    libraryLoading: libraryQueries.some((q) => q.isPending),
    libraryError: libraryQueries.find((q) => q.isError)?.error || null,
  };
}
export function useMarketplaceActions(userId: string) {
  const client = useQueryClient();
  const activeUser = useRef(userId);
  activeUser.current = userId;
  return {
    checkout: useMutation({
      mutationFn: ({ courseId, outcome }: { courseId: string; outcome: string; userId: string }) =>
        api<Order>('/orders', 'POST', { courseId, outcome }),
      onSuccess: async (order, variables) => {
        if (activeUser.current !== variables.userId) return;
        client.setQueryData<Order[]>(keys.orders(variables.userId), (old) => [
          order,
          ...(old || []).filter((o) => o.id !== order.id),
        ]);
        await Promise.all([
          client.invalidateQueries({ queryKey: keys.orders(variables.userId) }),
          refreshLearning(client, variables.userId),
        ]);
      },
    }),
    publish: useMutation({
      mutationFn: ({ id, published }: { id: string; published: boolean }) =>
        api<Course>(`/courses/${id}/publish`, 'POST', { published }),
      onSuccess: () => refreshCourses(client, userId),
    }),
    complete: useMutation({
      mutationFn: ({ courseId, lessonId }: { courseId: string; lessonId: string }) =>
        api(`/learning/${courseId}/progress`, 'POST', { lessonId }),
      onSuccess: () => refreshLearning(client, userId),
    }),
    tutor: useMutation({
      mutationFn: () => api('/role', 'POST', { role: 'tutor' }),
      onSuccess: () => client.invalidateQueries({ queryKey: keys.mine(userId) }),
    }),
    signOut: useMutation({
      mutationFn: async () => {
        const result = await authClient.signOut();
        if (result.error) throw new Error(result.error.message);
        await clearPrivateQueries(client);
      },
    }),
  };
}
