import { describe, it, expect } from 'vitest';
import { authFormSchema, courseFormSchema } from './form-schemas';
import { course } from '@/test/fixtures';
describe('form validation', () => {
  it('accepts incomplete text drafts while validating metadata and money', () => {
    const draft = {
      ...course,
      price: '29.00',
      sections: [
        {
          id: 'one',
          title: 'Intro section',
          lessons: [{ id: 'one', title: 'A lesson', content: '' }],
        },
      ],
    };
    expect(courseFormSchema.safeParse(draft).success).toBe(true);
    expect(courseFormSchema.safeParse({ ...draft, price: '1.234' }).success).toBe(false);
    expect(courseFormSchema.safeParse({ ...draft, title: 'x' }).success).toBe(false);
  });
  it('rejects incomplete quizzes and mismatched correct answers', () => {
    const quiz = {
      title: 'A quiz',
      passingScore: 70,
      questions: [
        {
          id: 'q',
          prompt: 'Which option is correct?',
          options: [
            { id: 'a', text: 'First' },
            { id: 'b', text: 'Second' },
          ],
          correctOptionId: 'missing',
        },
      ],
    };
    expect(
      courseFormSchema.safeParse({
        ...course,
        price: '29',
        sections: [
          {
            id: 'one',
            title: 'Intro section',
            lessons: [{ id: 'one', title: 'A lesson', content: '', quiz }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('requires a name only for sign-up', () => {
    const values = { name: '', email: 'student@example.com', password: 'password123' };
    expect(authFormSchema(false).safeParse(values).success).toBe(true);
    expect(authFormSchema(true).safeParse(values).success).toBe(false);
    expect(authFormSchema(true).safeParse({ ...values, name: 'Student' }).success).toBe(true);
  });
});
