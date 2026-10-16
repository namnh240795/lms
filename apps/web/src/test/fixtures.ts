import type { Course } from '@/lib/api';
export const course: Course = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Learn something useful',
  description: 'A practical course about building thoughtful interfaces.',
  category: 'Development',
  price: 2900,
  published: false,
  tutor_name: 'Test Tutor',
  thumbnail: null,
  version: 1,
  sections: [
    {
      id: 'first',
      title: 'Getting started',
      lessons: [{ id: 'completed', title: 'First lesson', content: 'Useful lesson content.' }],
    },
    {
      id: 'second',
      title: 'Practice skills',
      lessons: [{ id: 'practice', title: 'Second lesson', content: 'More useful lesson content.' }],
    },
  ],
  lessons: [
    { id: 'completed', title: 'First lesson', content: 'Useful lesson content.' },
    { id: 'practice', title: 'Second lesson', content: 'More useful lesson content.' },
  ],
};
