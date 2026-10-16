import { it, expect } from 'vitest';
import { paths, safeReturnTo, validCourseId, loginPath } from './paths';
it('builds encoded lesson addresses and preserves internal login destinations', () => {
  const target = paths.classroom('course', 'lesson / 1');
  expect(target).toBe('/learning/course/lessons/lesson%20%2F%201');
  expect(safeReturnTo(target + '?mode=practice')).toBe(target + '?mode=practice');
  expect(loginPath('/orders')).toBe('/login?returnTo=%2Forders');
  expect(validCourseId('11111111-1111-4111-8111-111111111111')).toBe(true);
  expect(validCourseId('../mine')).toBe(false);
});
it('rejects external and recursive login return destinations', () => {
  for (const target of [
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/login?returnTo=/login',
    'javascript:alert(1)',
    null,
  ])
    expect(safeReturnTo(target)).toBe('/learning');
});
