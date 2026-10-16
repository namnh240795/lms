import { randomInt } from 'node:crypto';
import { gradeQuiz, type Quiz } from './quiz.js';
export function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function buildExam(quizzes: { lessonId: string; quiz: Quiz }[]): Quiz {
  const bank = quizzes.flatMap(({ lessonId, quiz }) =>
    quiz.questions.map((q) => ({ ...q, id: JSON.stringify([lessonId, q.id]) })),
  );
  if (!bank.length)
    throw Object.assign(new Error('This course has no quiz questions yet.'), { status: 400 });
  const critical = shuffled(bank.filter((q) => q.critical)).slice(0, 1);
  const ordinary = shuffled(bank.filter((q) => !q.critical));
  // Keep one critical question where available; smaller banks remain usable.
  const questions = shuffled([...critical, ...ordinary.slice(0, 30 - critical.length)]);
  return { title: 'Timed practice exam', passingScore: 90, questions };
}
export function gradeExam(quiz: Quiz, answers: Record<string, string>) {
  const invalid = Object.entries(answers).some(
    ([id, answer]) =>
      !quiz.questions.some((q) => q.id === id && q.options.some((o) => o.id === answer)),
  );
  if (invalid) throw Object.assign(new Error('Invalid exam answer.'), { status: 400 });
  // Missing answers are incorrect, including an unanswered critical question.
  const complete = Object.fromEntries(
    quiz.questions.map((q) => [
      q.id,
      answers[q.id] || q.options.find((o) => o.id !== q.correctOptionId)!.id,
    ]),
  );
  const result = gradeQuiz(quiz, complete);
  return {
    ...result,
    unanswered: quiz.questions.filter((q) => !answers[q.id]).length,
    feedback: result.feedback.map((f) => ({ ...f, selectedOptionId: answers[f.questionId] || '' })),
  };
}
