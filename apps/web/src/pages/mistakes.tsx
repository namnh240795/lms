import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api, type QuizQuestion } from '@/lib/api';
import { useApp } from '@/routing/app-context';
import { paths, validCourseId } from '@/routing/paths';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export type Mistake = {
  key: string;
  question: QuizQuestion;
  sectionId: string;
  sectionTitle: string;
  missed: number;
  unanswered: number;
  lastMissedAt: string;
  resolved: boolean;
};
export function filterMistakes(
  items: Mistake[],
  filters: { section: string; status: string; type: string },
) {
  return items.filter(
    (item) =>
      (filters.section === 'all' || item.sectionId === filters.section) &&
      (filters.status === 'all' || item.resolved === (filters.status === 'corrected')) &&
      (filters.type === 'all' || item.question.critical),
  );
}
function PracticeQuestion({
  item,
  courseId,
  onSaved,
  onClose,
  onNext,
}: {
  item: Mistake;
  courseId: string;
  onSaved: () => Promise<unknown>;
  onClose: () => void;
  onNext?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [item.key]);
  const form = useForm<{ answer: string }>({ defaultValues: { answer: '' } });
  const answer = form.watch('answer');
  const practice = useMutation({
    mutationFn: ({ answer }: { answer: string }) =>
      api<{ correct: boolean; correctOptionId: string; explanation: string }>(
        `/learning/${courseId}/mistakes/${item.key}/practice`,
        'POST',
        { optionId: answer },
      ),
    onSuccess: () => onSaved(),
  });
  const result = practice.data;
  return (
    <div className="mistake-practice" aria-label="Practice question">
      <div className="exam-question-heading">
        <div>
          <span className="eyebrow">UNTIMED PRACTICE</span>
          <p className="small muted">{item.sectionTitle}</p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Back to collection
        </Button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {item.question.prompt}
      </h2>
      {item.question.critical && <span className="critical-question">Critical question</span>}
      {item.question.image && (
        <img
          className="quiz-question-image"
          src={item.question.image}
          alt="Question illustration"
        />
      )}
      {result ? (
        <>
          <div className={`quiz-result ${result.correct ? 'passed' : 'failed'}`} role="status">
            <strong>
              {result.correct
                ? 'Correct — mistake corrected!'
                : 'Not quite. Review the answer and try again.'}
            </strong>
            <p>Your answer: {item.question.options.find((o) => o.id === answer)?.text}</p>
            <p>
              Correct answer:{' '}
              {item.question.options.find((o) => o.id === result.correctOptionId)?.text}
            </p>
            {result.explanation && <p>{result.explanation}</p>}
          </div>
          <div className="exam-actions">
            <Button
              variant="outline"
              onClick={() => {
                practice.reset();
                form.reset({ answer: '' });
              }}
            >
              Try again
            </Button>
            {onNext && <Button onClick={onNext}>Next mistake</Button>}
          </div>
        </>
      ) : (
        <form onSubmit={form.handleSubmit((values) => practice.mutate(values))}>
          <Controller
            control={form.control}
            name="answer"
            rules={{ required: 'Choose an answer.' }}
            render={({ field }) => (
              <div
                role="radiogroup"
                aria-label="Choose your answer"
                className="quiz-answer-options"
              >
                {item.question.options.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    disabled={practice.isPending}
                    aria-checked={field.value === option.id}
                    tabIndex={
                      field.value ? (field.value === option.id ? 0 : -1) : index === 0 ? 0 : -1
                    }
                    className={`quiz-answer ${field.value === option.id ? 'selected' : ''}`}
                    onClick={() => field.onChange(option.id)}
                    onKeyDown={(event) => {
                      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key))
                        return;
                      event.preventDefault();
                      const next =
                        (index +
                          (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) +
                          item.question.options.length) %
                        item.question.options.length;
                      field.onChange(item.question.options[next].id);
                      event.currentTarget.parentElement
                        ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                        [next]?.focus();
                    }}
                  >
                    <span className="quiz-radio-dot" />
                    {option.text}
                  </button>
                ))}
              </div>
            )}
          />
          <div className="exam-actions">
            <Button type="submit" disabled={!answer || practice.isPending}>
              {practice.isPending ? 'Checking…' : 'Check answer'}
            </Button>
          </div>
        </form>
      )}
      {practice.error && (
        <p className="form-error" role="alert">
          {practice.error.message}
        </p>
      )}
    </div>
  );
}
export function MistakesPage() {
  const { courseId = '' } = useParams(),
    { userId } = useApp(),
    client = useQueryClient();
  const key = ['user', userId, 'mistakes', courseId];
  const query = useQuery({
    queryKey: key,
    enabled: validCourseId(courseId),
    queryFn: ({ signal }) =>
      api<{ title: string; items: Mistake[] }>(`/learning/${courseId}/mistakes`, 'GET', undefined, {
        signal,
      }),
  });
  const form = useForm({ defaultValues: { section: 'all', status: 'remaining', type: 'all' } }),
    filters = form.watch();
  const [selected, setSelected] = useState<Mistake | null>(null);
  const items = query.data?.items || [],
    filtered = filterMistakes(items, filters);
  const sections = [...new Map(items.map((item) => [item.sectionId, item.sectionTitle])).entries()];
  const next = filtered.find((item) => item.key !== selected?.key);
  if (!validCourseId(courseId))
    return (
      <section className="workspace">
        <h1>Course not found</h1>
        <Link to={paths.learning}>My learning</Link>
      </section>
    );
  return (
    <section className="workspace exam-page mistakes-page">
      <Link className="exam-back" to={paths.exam(courseId)}>
        <ArrowLeft size={16} /> Back to exams
      </Link>
      <div className="eyebrow">TURN MISTAKES INTO PROGRESS</div>
      <h1>Practice your mistakes</h1>
      <p className="muted">{query.data?.title}</p>
      <p>Retry incorrect and unanswered questions from submitted exams. No timer, no pressure.</p>
      {query.isPending || query.error ? (
        <QueryState
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="mistake-stats">
            <div>
              <strong>{items.length}</strong>
              <span>Questions to revisit</span>
            </div>
            <div>
              <strong>{items.filter((i) => !i.resolved).length}</strong>
              <span>Still practicing</span>
            </div>
            <div>
              <strong>{items.filter((i) => i.resolved).length}</strong>
              <span>Corrected</span>
            </div>
          </div>
          <div className="mistake-filters">
            {(['section', 'status', 'type'] as const).map((name) => (
              <label key={name}>
                <span>
                  {name === 'section'
                    ? 'Section'
                    : name === 'status'
                      ? 'Progress'
                      : 'Question type'}
                </span>
                <Controller
                  name={name}
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelected(null);
                      }}
                    >
                      <SelectTrigger
                        aria-label={
                          name === 'section'
                            ? 'Filter by section'
                            : name === 'status'
                              ? 'Filter by progress'
                              : 'Filter by question type'
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {name === 'section' ? (
                          <>
                            <SelectItem value="all">All sections</SelectItem>
                            {sections.map(([id, title]) => (
                              <SelectItem key={id} value={id}>
                                {title}
                              </SelectItem>
                            ))}
                          </>
                        ) : name === 'status' ? (
                          <>
                            <SelectItem value="remaining">Still practicing</SelectItem>
                            <SelectItem value="corrected">Corrected</SelectItem>
                            <SelectItem value="all">All mistakes</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="all">All questions</SelectItem>
                            <SelectItem value="critical">Critical questions</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </label>
            ))}
            <Button
              variant="ghost"
              onClick={() => {
                form.reset();
                setSelected(null);
              }}
            >
              Reset filters
            </Button>
          </div>
          {selected && (
            <PracticeQuestion
              key={selected.key}
              item={selected}
              courseId={courseId}
              onSaved={() => client.invalidateQueries({ queryKey: key })}
              onClose={() => setSelected(null)}
              onNext={next ? () => setSelected(next) : undefined}
            />
          )}
          <div className="mistake-collection-heading">
            <h2>
              {filtered.length} {filtered.length === 1 ? 'question' : 'questions'}
            </h2>
            <p className="small muted">
              A correct retry marks a mistake corrected. Missing it in a later exam puts it back
              into practice.
            </p>
          </div>
          {filtered.length ? (
            <div className="mistake-list">
              {filtered.map((item) => (
                <article className="mistake-card" key={item.key}>
                  <div>
                    <p className="small muted">
                      {item.sectionTitle} · Missed {item.missed}{' '}
                      {item.missed === 1 ? 'time' : 'times'}
                      {item.unanswered ? ` · ${item.unanswered} unanswered` : ''}
                    </p>
                    <h3>{item.question.prompt}</h3>
                    <div className="mistake-badges">
                      {item.question.critical && (
                        <span className="critical-question">Critical question</span>
                      )}
                      {item.resolved && (
                        <span className="section-status complete">
                          <CheckCircle2 size={13} />
                          Corrected
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={selected?.key === item.key ? 'secondary' : 'outline'}
                    onClick={() => setSelected(item)}
                  >
                    {selected?.key === item.key ? 'Practicing' : 'Practice'}
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="exam-intro">
              <h2>{items.length ? 'Nothing here for these filters.' : 'No mistakes yet.'}</h2>
              <p>
                {items.length
                  ? 'Try another section or view corrected questions.'
                  : 'Finish a practice exam to collect incorrect and unanswered questions here.'}
              </p>
              <Button asChild variant="outline">
                <Link to={paths.exam(courseId)}>Open exams</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
