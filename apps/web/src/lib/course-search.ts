import type { Course } from './api';
export type CourseFilters = { query: string; category: string; price: string; sort: string };
export function searchCourses(courses: Course[], filters: CourseFilters) {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = courses.filter((course) => {
    const searchable =
      `${course.title} ${course.description} ${course.tutor_name} ${course.category}`.toLowerCase();
    return (
      (filters.category === 'All courses' || course.category === filters.category) &&
      (filters.price === 'all' ||
        (filters.price === 'free' ? course.price === 0 : course.price > 0)) &&
      terms.every((term) => searchable.includes(term))
    );
  });
  return filtered.sort((a, b) =>
    filters.sort === 'price-low'
      ? a.price - b.price
      : filters.sort === 'price-high'
        ? b.price - a.price
        : filters.sort === 'title'
          ? a.title.localeCompare(b.title)
          : filters.sort === 'lessons'
            ? b.lessons.length - a.lessons.length
            : 0,
  );
}
