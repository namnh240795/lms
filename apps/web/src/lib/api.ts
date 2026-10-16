import { createAuthClient } from 'better-auth/react';
export const authClient = createAuthClient({ baseURL: window.location.origin });
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = 'GET',
  body?: unknown,
  options?: { signal?: AbortSignal; keepalive?: boolean },
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    signal: options?.signal,
    keepalive: options?.keepalive,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('Connection interrupted. Please try again.', response.status || 503);
  }
  if (!response.ok) throw new ApiError(data.message || 'Something went wrong', response.status);
  return data;
}
export type QuizQuestion = {
  id: string;
  prompt: string;
  image?: string;
  critical?: boolean;
  sourcePage?: number;
  options: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
};
export type Quiz = {
  title: string;
  passingScore: number;
  questions: QuizQuestion[];
  revision?: string;
};
export type QuizResult = {
  criticalFailed?: boolean;
  id?: string;
  revision?: string;
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  passingScore: number;
  feedback: {
    questionId: string;
    prompt: string;
    image?: string;
    critical?: boolean;
    options: { id: string; text: string }[];
    selectedOptionId: string;
    correctOptionId: string;
    correct: boolean;
    explanation: string;
  }[];
};
export type Captions = { label: string; language: string; vtt: string };
export type LessonTool = {
  lesson_id: string;
  note: string;
  bookmarked: boolean;
  updated_at: string;
};
export type Lesson = {
  id: string;
  title: string;
  content?: string;
  mediaId?: string | null;
  quiz?: Quiz | null;
  captions?: Captions | null;
};
export type Section = { id: string; title: string; lessons: Lesson[] };
export type Course = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  published: boolean;
  tutor_name: string;
  lessons: Lesson[];
  sections: Section[];
  thumbnail: string | null;
  version: number;
};
export type Enrollment = { course_id: string; completed: string[] };
export type Order = {
  id: string;
  course_id: string;
  title: string;
  amount: number;
  status: string;
};
export const money = (cents: number) =>
  cents === 0
    ? 'Free'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export type LearningVisit = {
  course_id: string;
  lesson_id: string;
  course_title: string;
  lesson_title: string;
  updated_at: string;
};
export type LearningDashboard = { visits: LearningVisit[]; saved: (LessonTool & LearningVisit)[] };
