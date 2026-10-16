import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Clock3, Flag, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, type Quiz, type QuizResult } from '@/lib/api';
import { useApp } from '@/routing/app-context';
import { paths, validCourseId } from '@/routing/paths';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/query-state';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export type ExamAttempt = {
  id: string;
  startedAt: string;
  expiresAt: string;
  submittedAt?: string;
  serverNow: string;
  answers: Record<string, string>;
  quiz: Quiz;
  result: (QuizResult & { unanswered: number; timedOut: boolean }) | null;
};
type History = {
  id: string;
  startedAt: string;
  expiresAt: string;
  active: boolean;
  score?: number;
  passed?: boolean;
  correct?: number;
  total: number;
};
export function secondsRemaining(expiresAt: string, now: number) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}
export function ExamPage() {
  const { courseId = '', attemptId } = useParams();
  const { userId } = useApp();
  const navigate = useNavigate(),
    client = useQueryClient();
  const base = `/learning/${courseId}/exams`;
  const historyKey = ['user', userId, 'exams', courseId];
  const attemptKey = [...historyKey, attemptId];
  const course = useQuery({
    queryKey: ['user', userId, 'course-details', courseId],
    enabled: validCourseId(courseId),
    queryFn: ({ signal }) =>
      api<{ title: string }>(`/courses/${courseId}`, 'GET', undefined, { signal }),
  });
  const history = useQuery({
    queryKey: historyKey,
    enabled: validCourseId(courseId) && !attemptId,
    queryFn: ({ signal }) => api<History[]>(base, 'GET', undefined, { signal }),
  });
  const attempt = useQuery({
    queryKey: attemptKey,
    enabled: validCourseId(courseId) && !!attemptId && validCourseId(attemptId),
    queryFn: ({ signal }) => api<ExamAttempt>(`${base}/${attemptId}`, 'GET', undefined, { signal }),
    refetchInterval: (query) => (query.state.data?.result ? false : 10000),
  });
  const start = useMutation({
    mutationFn: () => api<ExamAttempt>(base, 'POST', {}),
    onSuccess: (data) => {
      client.setQueryData([...historyKey, data.id], data);
      navigate(paths.exam(courseId, data.id));
    },
  });
  const save = useMutation({
    onMutate: async () => {
      await client.cancelQueries({ queryKey: attemptKey, exact: true });
    },
    mutationFn: (answer: { questionId: string; optionId: string }) =>
      api<ExamAttempt>(`${base}/${attemptId}`, 'PATCH', answer),
    onSuccess: (data) => {
      client.setQueryData(attemptKey, data);
    },
  });
  const submit = useMutation({
    onMutate: async () => {
      await client.cancelQueries({ queryKey: attemptKey, exact: true });
    },
    mutationFn: () => api<ExamAttempt>(`${base}/${attemptId}/submit`, 'POST', {}),
    onSuccess: (data) => {
      client.setQueryData(attemptKey, data);
      void client.invalidateQueries({ queryKey: historyKey, exact: true });
    },
  });
  const data = attempt.data;
  useEffect(() => {
    if (data?.result)
      void client.invalidateQueries({ queryKey: ['user', userId, 'mistakes', courseId] });
  }, [data?.id, !!data?.result, userId, courseId, client]);
  const [index, setIndex] = useState(0),
    [flagged, setFlagged] = useState<Set<string>>(new Set()),
    [confirm, setConfirm] = useState(false);
  const form = useForm<{ review: string }>({ defaultValues: { review: 'all' } });
  const filter = form.watch('review');
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0),
    expired = useRef('');
  useEffect(() => {
    if (data) {
      offset.current = new Date(data.serverNow).getTime() - Date.now();
      setNow(Date.now() + offset.current);
    }
  }, [data]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setIndex(0);
    setFlagged(new Set());
    setConfirm(false);
    form.reset({ review: 'all' });
    expired.current = '';
  }, [attemptId]);
  const remaining = data ? secondsRemaining(data.expiresAt, now) : 0;
  useEffect(() => {
    if (data && !data.result && remaining === 0 && expired.current !== data.id) {
      expired.current = data.id;
      submit.mutate();
    }
  }, [data?.id, !!data?.result, remaining]);
  if (!validCourseId(courseId) || (attemptId && !validCourseId(attemptId)))
    return (
      <section className="workspace">
        <h1>Exam not found</h1>
        <Link to={paths.learning}>My learning</Link>
      </section>
    );
  const loading = course.isPending || (attemptId ? attempt.isPending : history.isPending);
  const loadError = course.error || (attemptId ? attempt.error : history.error);
  const error = save.error || submit.error || start.error;
  const answered = data ? Object.keys(data.answers).length : 0;
  const question = data?.quiz.questions[index];
  const result = data?.result;
  return (
    <section className="workspace exam-page">
      <div className="exam-page-heading">
        <div>
          <Link className="exam-back" to={paths.classroom(courseId)}>
            <ArrowLeft size={16} /> Back to course
          </Link>
          <div className="eyebrow">TEST YOUR KNOWLEDGE</div>
          <h1>Timed practice exam</h1>
          <Button asChild variant="outline">
            <Link to={paths.mistakes(courseId)}>Practice your mistakes</Link>
          </Button>
          <p className="muted">{course.data?.title}</p>
        </div>
        {data && !result && (
          <div
            className={`exam-clock ${remaining < 120 ? 'exam-clock-warning' : ''}`}
            role="timer"
            aria-label="Time remaining"
          >
            <Clock3 size={20} />
            <strong>
              {Math.floor(remaining / 60)
                .toString()
                .padStart(2, '0')}
              :{(remaining % 60).toString().padStart(2, '0')}
            </strong>
            <span>remaining</span>
          </div>
        )}
      </div>
      {loading || loadError ? (
        <QueryState
          loading={loading}
          error={loadError}
          onRetry={() => {
            void course.refetch();
            if (attemptId) void attempt.refetch();
            else void history.refetch();
          }}
        />
      ) : !attemptId ? (
        <>
          <div className="exam-intro">
            <h2>A fresh challenge, every time.</h2>
            <p>Up to 30 randomly selected questions from this course · 20 minutes · 90% to pass.</p>
            <p>
              Where available, one critical question is included. A wrong or unanswered critical
              question means a failed attempt.
            </p>
            <p>
              Your answers save when selected. Refreshing or leaving does not pause the timer.
              Unanswered questions count as incorrect when time runs out.
            </p>
            <p className="small muted">
              This is a practice exam, with random question selection rather than the official exam
              distribution. Exam scores do not complete lessons or issue certificates.
            </p>
            <Button disabled={start.isPending} onClick={() => start.mutate()}>
              <Clock3 size={16} />
              {start.isPending
                ? 'Preparing exam…'
                : history.data?.some((a) => a.active)
                  ? 'Resume active exam'
                  : 'Start practice exam'}
            </Button>
          </div>
          <div className="exam-history">
            <h2>Your attempts</h2>
            <p className="muted">
              Review your latest 20 exams, including incorrect and unanswered questions.
            </p>
            {history.data?.length ? (
              <div className="exam-history-list">
                {history.data.map((item) => (
                  <div className="exam-history-row" key={item.id}>
                    <div>
                      <strong>
                        {item.active
                          ? 'In progress'
                          : `${item.correct}/${item.total} correct · ${item.passed ? 'Passed' : 'Not passed'}`}
                      </strong>
                      <p className="small muted">{new Date(item.startedAt).toLocaleString()}</p>
                    </div>
                    <Button asChild variant="outline">
                      <Link to={paths.exam(courseId, item.id)}>
                        {item.active ? 'Resume' : 'Review results'}
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p>No exams yet. Your first attempt starts here.</p>
            )}
          </div>
        </>
      ) : data && result ? (
        <>
          <div className={`quiz-result ${result.passed ? 'passed' : 'failed'}`} role="status">
            <h2>{result.passed ? 'You passed!' : 'Keep practicing.'}</h2>
            <p>
              <strong>
                {result.correct} / {result.total} correct · {result.score}%
              </strong>
            </p>
            <p>
              {result.unanswered} unanswered ·{' '}
              {result.timedOut
                ? 'Time expired — saved answers were submitted automatically.'
                : 'Submitted by you.'}
            </p>
            {result.criticalFailed && (
              <p className="form-error">
                Critical question failed: a critical question was incorrect or unanswered.
              </p>
            )}
          </div>
          <div className="exam-review-toolbar">
            <div>
              <h2>Review your answers</h2>
              <p className="small muted">Compare your choices with the correct answers.</p>
            </div>
            <Select value={filter} onValueChange={(value) => form.setValue('review', value)}>
              <SelectTrigger aria-label="Filter exam results">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All questions</SelectItem>
                <SelectItem value="incorrect">Incorrect & unanswered</SelectItem>
                <SelectItem value="critical">Critical questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {result.feedback
            .filter((f) => filter === 'all' || (filter === 'incorrect' ? !f.correct : f.critical))
            .map((f) => (
              <article className="quiz-feedback" key={f.questionId}>
                <strong>
                  {result.feedback.indexOf(f) + 1}. {f.prompt}
                </strong>
                {f.critical && <span className="critical-question">Critical question</span>}
                {f.image && (
                  <img className="quiz-question-image" src={f.image} alt="Question illustration" />
                )}
                <p className={f.correct ? 'correct-answer' : 'incorrect-answer'}>
                  {f.correct ? 'Correct' : f.selectedOptionId ? 'Incorrect' : 'Unanswered'} · Your
                  answer: {f.options.find((o) => o.id === f.selectedOptionId)?.text || 'No answer'}
                </p>
                <p>Correct answer: {f.options.find((o) => o.id === f.correctOptionId)?.text}</p>
                {f.explanation && <p className="muted">{f.explanation}</p>}
              </article>
            ))}
          {!result.feedback.some(
            (f) => filter === 'all' || (filter === 'incorrect' ? !f.correct : f.critical),
          ) && <p className="exam-intro">No questions match this filter.</p>}
          <div className="exam-actions">
            <Button asChild>
              <Link to={paths.exam(courseId)}>Back to exam overview</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={paths.classroom(courseId)}>Continue learning</Link>
            </Button>
          </div>
        </>
      ) : data && question ? (
        <>
          <p className="exam-save-status" role="status">
            {save.isPending
              ? 'Saving your answer…'
              : `${answered} of ${data.quiz.questions.length} answers saved`}{' '}
            · {flagged.size} flagged for review
          </p>
          <div className="exam-layout">
            <aside className="exam-navigation" aria-label="Exam questions">
              <h2>Questions</h2>
              <p className="small muted">Filled = answered · ⚑ = flagged</p>
              <div className="exam-question-grid">
                {data.quiz.questions.map((q, i) => (
                  <Button
                    key={q.id}
                    variant={i === index ? 'default' : data.answers[q.id] ? 'secondary' : 'outline'}
                    aria-label={`Question ${i + 1}${data.answers[q.id] ? ', answered' : ', unanswered'}${flagged.has(q.id) ? ', flagged' : ''}`}
                    aria-current={i === index ? 'step' : undefined}
                    onClick={() => setIndex(i)}
                  >
                    {i + 1}
                    {flagged.has(q.id) && <Flag size={11} />}
                  </Button>
                ))}
              </div>
            </aside>
            <div className="exam-question-panel">
              <div className="exam-question-heading">
                <span className="pill">
                  Question {index + 1} of {data.quiz.questions.length}
                </span>
                <Button
                  variant="ghost"
                  aria-pressed={flagged.has(question.id)}
                  onClick={() =>
                    setFlagged((old) => {
                      const next = new Set(old);
                      if (next.has(question.id)) next.delete(question.id);
                      else next.add(question.id);
                      return next;
                    })
                  }
                >
                  <Flag size={15} />
                  {flagged.has(question.id) ? 'Flagged' : 'Flag for review'}
                </Button>
              </div>
              <h2>{question.prompt}</h2>
              {question.image && (
                <img
                  className="quiz-question-image"
                  src={question.image}
                  alt="Question illustration"
                />
              )}
              <div
                role="radiogroup"
                aria-label={`Answer question ${index + 1}`}
                className="quiz-answer-options"
              >
                {question.options.map((option, i) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={data.answers[question.id] === option.id}
                    disabled={save.isPending || submit.isPending || remaining === 0}
                    tabIndex={
                      data.answers[question.id]
                        ? data.answers[question.id] === option.id
                          ? 0
                          : -1
                        : i === 0
                          ? 0
                          : -1
                    }
                    className={`quiz-answer ${data.answers[question.id] === option.id ? 'selected' : ''}`}
                    onClick={() => save.mutate({ questionId: question.id, optionId: option.id })}
                    onKeyDown={(event) => {
                      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key))
                        return;
                      event.preventDefault();
                      const next =
                        (i +
                          (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) +
                          question.options.length) %
                        question.options.length;
                      event.currentTarget.parentElement
                        ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                        [next]?.focus();
                      save.mutate({ questionId: question.id, optionId: question.options[next].id });
                    }}
                  >
                    <span className="quiz-radio-dot" />
                    {option.text}
                  </button>
                ))}
              </div>
              <div className="exam-actions">
                <Button
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  <ArrowLeft size={16} /> Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={index === data.quiz.questions.length - 1}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  Next <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          </div>
          {remaining === 0 ? (
            <div className="exam-intro" role="status">
              <h2>Time is up</h2>
              <p>
                {submit.isPending
                  ? 'Submitting your saved answers…'
                  : 'Your deadline has passed. Reconnect or retry to load your result; late answers cannot be accepted.'}
              </p>
              <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
                Load results
              </Button>
            </div>
          ) : confirm ? (
            <div className="exam-intro">
              <h2>Ready to submit?</h2>
              <p>
                {data.quiz.questions.length - answered} unanswered questions will count as
                incorrect. Submission is final.
              </p>
              <div className="exam-actions">
                <Button
                  disabled={submit.isPending || save.isPending}
                  onClick={() => submit.mutate()}
                >
                  Confirm submission
                </Button>
                <Button variant="outline" onClick={() => setConfirm(false)}>
                  Keep working
                </Button>
              </div>
            </div>
          ) : (
            <div className="exam-submit">
              <p className="small muted">
                You can review any question before submitting. The timer continues if you leave.
              </p>
              <Button
                disabled={save.isPending || submit.isPending}
                onClick={() => setConfirm(true)}
              >
                <CheckCircle2 size={16} /> Submit exam
              </Button>
            </div>
          )}
        </>
      ) : null}
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}
