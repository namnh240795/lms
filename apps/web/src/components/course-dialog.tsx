import { Link } from 'react-router-dom';
import { paths } from '@/routing/paths';
import { RouteSurface } from '@/routing/route-surface';
import { NavigationGuard } from '@/routing/navigation-guard';
import { SectionProgress } from '@/components/section-progress';
import { sectionProgress } from '@/lib/course-completion';
import { CourseProgress } from '@/components/course-progress';
import { LessonNotes, toolsKey } from '@/components/lesson-notes';
import { api, type LessonTool } from '@/lib/api';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Check, CheckCircle2, Play, ChevronRight, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { FormMessage } from '@/components/ui/form-message';
import { QueryState } from '@/components/query-state';
import { CourseArtwork } from '@/components/course-card';
import { VideoPlayer } from '@/components/video-player';
import { QuizRunner } from '@/components/quiz-runner';
import { contentOptions, dashboardOptions, dashboardKey } from '@/lib/query';
import { money, type Course, type Enrollment } from '@/lib/api';
import { useMarketplaceActions } from '@/hooks/use-marketplace';
export function CourseDialog({
  course,
  userId,
  enrolled,
  onClose,
  onLogin,
  onCheckout,
  initialLessonId,
  standalone = false,
  onLessonChange,
}: {
  course: Course;
  userId: string;
  enrolled?: Enrollment;
  initialLessonId?: string;
  standalone?: boolean;
  onLessonChange?: (lessonId: string, replace?: boolean) => void;
  onClose: () => void;
  onLogin: () => void;
  onCheckout: (id: string, outcome: string) => Promise<void>;
}) {
  const content = useQuery({
    ...contentOptions(userId, course.id),
    enabled: !!enrolled && !!userId,
    staleTime: 0,
  });
  const selected = enrolled && content.data ? content.data : course;
  const dashboard = useQuery({ ...dashboardOptions(userId), enabled: !!enrolled && !!userId });
  const client = useQueryClient();
  const [chosenLesson, setLesson] = useState<number | null>(null);
  const resumeId =
    initialLessonId ||
    dashboard.data?.visits.find((visit) => visit.course_id === course.id)?.lesson_id;
  const lesson =
    chosenLesson ??
    Math.max(
      0,
      selected.lessons.findIndex((item) => item.id === resumeId),
    );
  const activity = useMutation({
    mutationFn: (lessonId: string) =>
      api(`/learning/${course.id}/activity/${encodeURIComponent(lessonId)}`, 'POST', {}),
    onSuccess: () => client.invalidateQueries({ queryKey: dashboardKey(userId) }),
  });
  const activeLessonId = content.data?.lessons[lesson]?.id;
  useEffect(() => {
    if (enrolled && activeLessonId && !dashboard.isPending && !dashboard.isError)
      activity.mutate(activeLessonId);
  }, [userId, course.id, activeLessonId, !!enrolled, dashboard.isPending]);

  useEffect(() => {
    if (
      standalone &&
      !initialLessonId &&
      activeLessonId &&
      !dashboard.isPending &&
      !dashboard.isError
    )
      onLessonChange?.(activeLessonId, true);
  }, [
    standalone,
    initialLessonId,
    activeLessonId,
    dashboard.isPending,
    dashboard.isError,
    onLessonChange,
  ]);
  const sectionSummaries = sectionProgress(selected, enrolled);
  const [noteDirty, setNoteDirty] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const tools = useQuery({
    queryKey: toolsKey(userId, course.id),
    enabled: !!enrolled && !!userId,
    queryFn: ({ signal }) =>
      api<LessonTool[]>(`/learning/${course.id}/tools`, 'GET', undefined, { signal }),
  });
  function changeLesson(index: number) {
    if (standalone && onLessonChange) {
      const target = selected.lessons[index];
      if (target) onLessonChange(target.id);
      return;
    }
    if (!noteDirty || window.confirm('Discard unsaved lesson notes?')) setLesson(index);
  }
  function close() {
    if (standalone) {
      onClose();
      return;
    }
    if (!noteDirty || window.confirm('Discard unsaved lesson notes?')) onClose();
  }
  const { complete } = useMarketplaceActions(userId);
  const busy = complete.isPending;
  const error = complete.error?.message;
  const checkoutForm = useForm({ defaultValues: { outcome: 'success' } });
  const Surface = standalone ? RouteSurface : Modal;
  return (
    <Surface title={selected.title} className={enrolled ? 'lesson-modal' : ''} onClose={close}>
      {standalone && <NavigationGuard dirty={noteDirty} message="Discard unsaved lesson notes?" />}
      <button className="modal-close" aria-label="Close" onClick={close}>
        <X />
      </button>
      {enrolled &&
      (content.isPending || content.isError || dashboard.isPending || dashboard.isError) ? (
        <QueryState
          loading={content.isPending || dashboard.isPending}
          error={content.error || dashboard.error}
          onRetry={() => {
            void content.refetch();
            void dashboard.refetch();
          }}
        />
      ) : enrolled ? (
        <>
          <div className="eyebrow">YOUR CLASSROOM</div>
          <h2>{selected.title}</h2>
          {standalone && enrolled && selected.lessons.some((l) => l.quiz) && (
            <div className="exam-course-link">
              <Button asChild variant="outline">
                <Link to={paths.exam(course.id)}>Timed practice exam</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={paths.mistakes(course.id)}>Practice your mistakes</Link>
              </Button>
              <p className="small muted">
                Practice across the course with a countdown and saved results.
              </p>
            </div>
          )}
          <div className="classroom-progress">
            <CourseProgress course={selected} enrollment={enrolled} showQuizzes />
          </div>
          <SectionProgress
            course={selected}
            enrollment={enrolled}
            onOpenLesson={(target) =>
              changeLesson(selected.lessons.findIndex((item) => item.id === target.id))
            }
          />
          <div className="lesson-layout">
            <aside>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={savedOnly}
                onClick={() => setSavedOnly((value) => !value)}
              >
                {savedOnly ? 'Show all lessons' : 'Bookmarked lessons'}
              </Button>
              {savedOnly && !tools.data?.some((tool) => tool.bookmarked) && (
                <p className="muted small">No bookmarks yet.</p>
              )}
              {selected.sections
                .filter(
                  (section) =>
                    !savedOnly ||
                    section.lessons.some((lesson) =>
                      tools.data?.some((tool) => tool.lesson_id === lesson.id && tool.bookmarked),
                    ),
                )
                .map((section) => {
                  const summary = sectionSummaries.find((item) => item.section.id === section.id)!;
                  const index = selected.sections.findIndex((item) => item.id === section.id);
                  return (
                    <div
                      key={section.id}
                      className={`classroom-section${summary.status === 'Completed' ? ' section-complete' : ''}`}
                    >
                      <h3 className="classroom-section-title">
                        {index + 1}. {section.title}
                      </h3>
                      <div className="classroom-section-summary">
                        <span
                          className={`section-status ${summary.status === 'Completed' ? 'complete' : summary.status === 'In progress' ? 'started' : ''}`}
                        >
                          {summary.status === 'Completed' && <CheckCircle2 size={12} />}
                          {summary.status}
                        </span>
                        <div className="classroom-section-count">
                          <span>
                            {summary.completed}/{summary.total} lessons complete
                          </span>
                          <strong>{summary.percent}%</strong>
                        </div>
                        <div
                          className="progress"
                          role="progressbar"
                          aria-label={`${section.title} section completion`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={summary.percent}
                        >
                          <span style={{ width: `${summary.percent}%` }} />
                        </div>
                        {summary.remainingQuizzes.length > 0 && (
                          <p className="small muted">
                            {summary.remainingQuizzes.length}{' '}
                            {summary.remainingQuizzes.length === 1 ? 'quiz' : 'quizzes'} still to
                            pass
                          </p>
                        )}
                      </div>
                      {section.lessons
                        .filter(
                          (l) =>
                            !savedOnly ||
                            tools.data?.some((tool) => tool.lesson_id === l.id && tool.bookmarked),
                        )
                        .map((l) => {
                          const i = selected.lessons.findIndex((item) => item.id === l.id);
                          const completed = enrolled.completed.includes(l.id);
                          return (
                            <button
                              key={l.id}
                              className={`lesson-nav-item${completed ? ' completed' : ''}${lesson === i ? ' current' : ''}`}
                              aria-current={lesson === i ? 'step' : undefined}
                              onClick={() => changeLesson(i)}
                            >
                              {completed ? <CheckCircle2 size={17} /> : <Play size={17} />}
                              <span className="lesson-nav-title">
                                {l.title}
                                {completed && (
                                  <small className="lesson-completed-label">Completed</small>
                                )}
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
            </aside>
            {selected.lessons[lesson] ? (
              <article>
                <span className="pill">
                  Lesson {lesson + 1} of {selected.lessons.length}
                </span>
                <h2>{selected.lessons[lesson].title}</h2>
                {selected.lessons[lesson].mediaId && (
                  <VideoPlayer
                    userId={userId}
                    key={`video:${selected.lessons[lesson].id}`}
                    courseId={selected.id}
                    lessonId={selected.lessons[lesson].id}
                    mediaId={selected.lessons[lesson].mediaId!}
                    captions={selected.lessons[lesson].captions}
                  />
                )}
                <p className="lesson-text">{selected.lessons[lesson].content}</p>
                {selected.lessons[lesson].quiz && (
                  <QuizRunner
                    key={`quiz:${selected.lessons[lesson].id}`}
                    quiz={selected.lessons[lesson].quiz!}
                    courseId={selected.id}
                    lessonId={selected.lessons[lesson].id}
                    userId={userId}
                  />
                )}
                {tools.isPending || tools.isError ? (
                  <QueryState
                    loading={tools.isPending}
                    error={tools.error}
                    onRetry={() => void tools.refetch()}
                  />
                ) : (
                  <LessonNotes
                    key={`notes:${selected.lessons[lesson].id}`}
                    userId={userId}
                    courseId={selected.id}
                    lessonId={selected.lessons[lesson].id}
                    tool={tools.data?.find(
                      (tool) => tool.lesson_id === selected.lessons[lesson].id,
                    )}
                    onDirty={setNoteDirty}
                  />
                )}
                <Button
                  disabled={
                    busy ||
                    noteDirty ||
                    !!selected.lessons[lesson].quiz ||
                    enrolled.completed.includes(selected.lessons[lesson].id)
                  }
                  onClick={() =>
                    void complete
                      .mutateAsync({ courseId: selected.id, lessonId: selected.lessons[lesson].id })
                      .then(() => {
                        if (lesson < selected.lessons.length - 1) changeLesson(lesson + 1);
                      })
                      .catch(() => {})
                  }
                >
                  <Check size={17} />
                  {enrolled.completed.includes(selected.lessons[lesson].id)
                    ? 'Completed'
                    : selected.lessons[lesson].quiz
                      ? 'Pass quiz to complete'
                      : 'Complete lesson'}
                </Button>
              </article>
            ) : (
              <article>
                <h2>Lessons are being updated.</h2>
                <p className="muted">
                  Your enrollment is safe. Check back when your tutor adds content.
                </p>
              </article>
            )}
          </div>
        </>
      ) : (
        <>
          <CourseArtwork course={selected} />
          <div className="course-meta">
            {selected.category}
            <span>{selected.lessons.length} lessons</span>
          </div>
          <h2>{selected.title}</h2>
          <p className="muted">By {selected.tutor_name}</p>
          <p>{selected.description}</p>
          <h3>What’s inside</h3>
          <ul className="curriculum">
            {selected.sections
              .filter(
                (section) =>
                  !savedOnly ||
                  section.lessons.some((lesson) =>
                    tools.data?.some((tool) => tool.lesson_id === lesson.id && tool.bookmarked),
                  ),
              )
              .map((section, index) => (
                <li className="public-section" key={section.id}>
                  <h4>
                    {index + 1}. {section.title}
                  </h4>
                  <ul>
                    {section.lessons.map((l) => (
                      <li key={l.id}>
                        <Play size={15} />
                        {l.title}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
          <form
            className="checkout-form"
            onSubmit={checkoutForm.handleSubmit(async (values) => {
              if (!userId) {
                onLogin();
                return;
              }
              try {
                await onCheckout(selected.id, values.outcome);
              } catch (error) {
                checkoutForm.setError('root', { message: (error as Error).message });
              }
            })}
          >
            <div className="checkout-row">
              <strong>{money(selected.price)}</strong>
              <Button type="submit" disabled={checkoutForm.formState.isSubmitting}>
                {selected.price === 0 ? 'Enroll for free' : 'Enroll now'}
                <ArrowRight size={16} />
              </Button>
            </div>
            <div className="mock-note">
              Test payment — no money charged.
              <label>
                Simulated outcome
                <Controller
                  control={checkoutForm.control}
                  name="outcome"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={checkoutForm.formState.isSubmitting}
                    >
                      <SelectTrigger aria-label="Simulated outcome">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failure">Failure</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </label>
            </div>
            <FormMessage message={checkoutForm.formState.errors.root?.message} />
          </form>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Surface>
  );
}
