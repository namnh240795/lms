import { useForm, useWatch, type ResolverResult } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { keys, refreshLearning } from '@/lib/query';
import { FormMessage } from '@/components/ui/form-message';
import { useEffect } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { api, type Quiz, type QuizResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
export function QuizRunner({
  quiz,
  courseId,
  lessonId,
  userId = '',
  onPassed,
  preview = false,
}: {
  quiz: Quiz;
  courseId?: string;
  lessonId?: string;
  userId?: string;
  onPassed?: () => Promise<void>;
  preview?: boolean;
}) {
  const client = useQueryClient();
  const form = useForm<{ answers: Record<string, string> }>({
    defaultValues: { answers: {} },
    resolver: async (values): Promise<ResolverResult<{ answers: Record<string, string> }>> => {
      const incomplete = quiz.questions.some(
        (question) => !question.options.some((option) => option.id === values.answers[question.id]),
      );
      return incomplete
        ? {
            values: {},
            errors: {
              root: {
                incomplete: {
                  type: 'required',
                  message: 'Answer every question before submitting.',
                },
              },
            },
          }
        : { values, errors: {} };
    },
  });
  const answers = useWatch({ control: form.control, name: 'answers' });
  const attemptsQuery = useQuery({
    queryKey: [...keys.attempts(userId, courseId || '', lessonId || ''), quiz.revision],
    enabled: !preview && !!userId && !!courseId && !!lessonId,
    queryFn: ({ signal }) =>
      api<
        {
          id: string;
          revision: string;
          score: number;
          passed: boolean;
          result: QuizResult;
          created_at: string;
        }[]
      >(`/learning/${courseId}/quiz/${encodeURIComponent(lessonId!)}/attempts`, 'GET', undefined, {
        signal,
      }),
  });
  const mutation = useMutation({
    mutationFn: async (values: { answers: Record<string, string> }) => {
      const answers = values.answers;
      if (!preview)
        return api<QuizResult>(
          `/learning/${courseId}/quiz/${encodeURIComponent(lessonId!)}/attempts`,
          'POST',
          { revision: quiz.revision, answers },
        );
      const correct = quiz.questions.filter((q) => answers[q.id] === q.correctOptionId).length;
      return {
        score: Math.round((correct / quiz.questions.length) * 10000) / 100,
        passed:
          correct * 100 >= quiz.passingScore * quiz.questions.length &&
          !quiz.questions.some((q) => q.critical && answers[q.id] !== q.correctOptionId),
        criticalFailed: quiz.questions.some(
          (q) => q.critical && answers[q.id] !== q.correctOptionId,
        ),
        correct,
        total: quiz.questions.length,
        passingScore: quiz.passingScore,
        feedback: quiz.questions.map((q) => ({
          questionId: q.id,
          prompt: q.prompt,
          image: q.image,
          critical: q.critical,
          options: q.options,
          selectedOptionId: answers[q.id],
          correctOptionId: q.correctOptionId || '',
          correct: answers[q.id] === q.correctOptionId,
          explanation: q.explanation || '',
        })),
      } as QuizResult;
    },
    onSuccess: async (graded) => {
      if (!preview) {
        await client.invalidateQueries({ queryKey: keys.attempts(userId, courseId!, lessonId!) });
        if (graded.passed) {
          await refreshLearning(client, userId);
          await onPassed?.();
        }
      }
    },
  });
  const result = mutation.data;
  const busy = mutation.isPending;
  const error = mutation.error?.message || attemptsQuery.error?.message;
  const attempts = attemptsQuery.data || [];
  function setAnswers(update: (answers: Record<string, string>) => Record<string, string>) {
    form.setValue('answers', update(form.getValues('answers')), { shouldDirty: true });
  }
  useEffect(() => {
    form.reset({ answers: {} });
    mutation.reset();
  }, [quiz.revision]);
  const currentAttempts = attempts.filter((a) => a.revision === quiz.revision);
  const hasPassed = currentAttempts.some((a) => a.passed);
  return (
    <form
      className="quiz-runner"
      aria-label={quiz.title}
      noValidate
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <div className="quiz-heading">
        <div>
          <div className="eyebrow">
            {preview ? 'QUIZ PREVIEW · RESULTS ARE NOT SAVED' : 'CHECK YOUR UNDERSTANDING'}
          </div>
          <h3>{quiz.title}</h3>
          <p className="small muted">
            {quiz.questions.length} questions · {quiz.passingScore}% to pass
          </p>
        </div>
        {hasPassed && (
          <span className="pill paid">
            <CheckCircle2 size={14} />
            Passed
          </span>
        )}
      </div>
      {result ? (
        <>
          <div className={`quiz-result ${result.passed ? 'passed' : 'failed'}`} role="status">
            <strong>
              {result.score}% · {result.passed ? 'You passed!' : 'Keep practicing.'}
            </strong>
            <p>
              {result.correct} of {result.total} correct.{' '}
              {result.passed ? 'This lesson is complete.' : 'Review the feedback and try again.'}
            </p>
          </div>
          {result.criticalFailed && (
            <p className="form-error" role="alert">
              Bạn trả lời sai câu điểm liệt. Cần ôn lại trước khi hoàn thành bài.
            </p>
          )}
          {result.feedback.map((feedback, i) => (
            <div className="quiz-feedback" key={feedback.questionId}>
              <strong>
                {i + 1}. {feedback.prompt}
              </strong>
              {feedback.image && (
                <img
                  className="quiz-question-image"
                  src={feedback.image}
                  alt="Hình minh hoạ câu hỏi"
                />
              )}
              <p className={feedback.correct ? 'correct-answer' : 'incorrect-answer'}>
                {feedback.correct ? 'Correct' : 'Incorrect'} · Your answer:{' '}
                {feedback.options.find((o) => o.id === feedback.selectedOptionId)?.text}
              </p>
              {!feedback.correct && (
                <p>
                  Correct answer:{' '}
                  {feedback.options.find((o) => o.id === feedback.correctOptionId)?.text}
                </p>
              )}
              {feedback.explanation && <p className="muted">{feedback.explanation}</p>}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              mutation.reset();
              form.reset({ answers: {} });
            }}
          >
            <RotateCcw size={15} />
            Try again
          </Button>
        </>
      ) : (
        <>
          {quiz.questions.map((question, index) => (
            <fieldset className="quiz-question" key={question.id} disabled={busy}>
              <legend>
                {index + 1}. {question.prompt}
              </legend>
              {question.critical && <span className="critical-question">Câu điểm liệt</span>}
              {question.image && (
                <img
                  className="quiz-question-image"
                  src={question.image}
                  alt="Hình minh hoạ biển báo hoặc sa hình"
                  loading="lazy"
                />
              )}
              <div
                role="radiogroup"
                aria-label={`Question ${index + 1}: ${question.prompt}`}
                className="quiz-answer-options"
              >
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={answers[question.id] === option.id}
                    tabIndex={
                      answers[question.id]
                        ? answers[question.id] === option.id
                          ? 0
                          : -1
                        : question.options[0].id === option.id
                          ? 0
                          : -1
                    }
                    className={`quiz-answer ${answers[question.id] === option.id ? 'selected' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, [question.id]: option.id }))}
                    onKeyDown={(event) => {
                      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key))
                        return;
                      event.preventDefault();
                      const index = question.options.findIndex((o) => o.id === option.id);
                      const next =
                        (index +
                          (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) +
                          question.options.length) %
                        question.options.length;
                      setAnswers((a) => ({ ...a, [question.id]: question.options[next].id }));
                      const buttons =
                        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                          '[role="radio"]',
                        );
                      buttons?.[next].focus();
                    }}
                  >
                    <span className="quiz-radio-dot" />
                    {option.text}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <Button type="submit" disabled={busy || quiz.questions.some((q) => !answers[q.id])}>
            {busy ? 'Checking answers…' : 'Submit answers'}
          </Button>
        </>
      )}
      {currentAttempts.length > 0 && (
        <details className="quiz-history">
          <summary>
            Recent attempts ({currentAttempts.length}) · Best score{' '}
            {Math.max(...currentAttempts.map((a) => Number(a.score)))}%
          </summary>
          <ul>
            {currentAttempts.map((a) => (
              <li key={a.id}>
                {Number(a.score)}% · {a.passed ? 'Passed' : 'Not passed'} ·{' '}
                {new Date(a.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
      <FormMessage message={form.formState.errors.root?.incomplete?.message} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
