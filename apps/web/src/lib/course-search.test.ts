import { describe, it, expect } from 'vitest';
import { searchCourses } from './course-search';
import { course } from '@/test/fixtures';
describe('course discovery', () => {
  const courses = [
    course,
    {
      ...course,
      id: 'free',
      title: 'TypeScript basics',
      description: 'Learn reliable backend APIs',
      price: 0,
    },
    { ...course, id: 'design', category: 'Design', title: 'Interface design', price: 3900 },
  ];
  it('combines case-insensitive topic terms, category, and price', () => {
    expect(
      searchCourses(courses, {
        query: '  reliable API  ',
        category: 'Development',
        price: 'free',
        sort: 'featured',
      }).map((c) => c.id),
    ).toEqual(['free']);
    expect(
      searchCourses(courses, { query: 'API', category: 'Design', price: 'free', sort: 'featured' }),
    ).toEqual([]);
  });
  it('sorts without changing catalog order', () => {
    const filters = { query: '', category: 'All courses', price: 'all', sort: 'price-high' };
    expect(searchCourses(courses, filters).map((c) => c.id)).toEqual(['design', course.id, 'free']);
    expect(courses[0]).toBe(course);
  });
});
