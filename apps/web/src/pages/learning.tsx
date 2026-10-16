import { SectionProgress } from '@/components/section-progress';
import { useState } from 'react';
import { CourseCertificate } from '@/components/course-certificate';
import { isCourseComplete, learningProgress, completionPercent } from '@/lib/course-completion';
import { useQuery } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { dashboardOptions } from '@/lib/query';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Bookmark, NotebookPen, Play } from 'lucide-react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CourseCard } from '@/components/course-card';
import { QueryState } from '@/components/query-state';
import type { Course, Enrollment } from '@/lib/api';
export function LearningPage({
  userId,
  library,
  enrollments,
  loading,
  error,
  onOpen,
  onExplore,
  onRetry,
}: {
  userId: string;
  library: Course[];
  enrollments: Enrollment[];
  loading: boolean;
  error: Error | null;
  onOpen: (course: Course, lessonId?: string) => void;
  onExplore: () => void;
  onRetry: () => void;
}) {
  const [courseView, setCourseView] = useState<'active' | 'completed'>('active');
  const completedCourses = library.filter((course) => isCourseComplete(course, enrollments));
  const activeCourses = library.filter((course) => !isCourseComplete(course, enrollments));
  const visibleCourses = courseView === 'active' ? activeCourses : completedCourses;
  const overall = learningProgress(library, enrollments);
  const dashboard = useQuery({ ...dashboardOptions(userId), enabled: !!userId });
  const filters = useForm({ defaultValues: { query: '', kind: 'all', course: 'all' } });
  const filter = filters.watch();
  const saved = (dashboard.data?.saved || []).filter(
    (item) =>
      (filter.course === 'all' || item.course_id === filter.course) &&
      (filter.kind === 'all' || (filter.kind === 'notes' ? !!item.note.trim() : item.bookmarked)) &&
      `${item.course_title} ${item.lesson_title} ${item.note}`
        .toLowerCase()
        .includes(filter.query.trim().toLowerCase()),
  );
  const latest = dashboard.data?.visits.find((visit) =>
    activeCourses.some((course) => course.id === visit.course_id),
  );
  function openLesson(courseId: string, lessonId: string) {
    const course = library.find((course) => course.id === courseId);
    if (course) onOpen(course, lessonId);
  }
  const courseCard = (course: Course) => (
    <CourseCard
      key={course.id}
      course={course}
      enrollment={enrollments.find((e) => e.course_id === course.id)}
      onOpen={onOpen}
      showProgressSummary
    />
  );
  return (
    <section className="workspace">
      <div className="eyebrow">KEEP YOUR MOMENTUM</div>
      <h1>My learning</h1>
      <p className="muted">Small steps, lasting skills. Pick up where you left off.</p>
      {loading || error ? (
        <QueryState loading={loading} error={error} onRetry={onRetry} />
      ) : enrollments.length ? (
        <>
          <div className="learning-progress-overview" aria-label="Learning progress summary">
            <div>
              <span>Overall completion</span>
              <strong>{completionPercent(overall.completed, overall.total)}%</strong>
              <p>Across all current lessons</p>
            </div>
            <div>
              <span>Lessons completed</span>
              <strong>
                {overall.completed}
                <small> / {overall.total}</small>
              </strong>
              <p>
                {overall.total - overall.completed}{' '}
                {overall.total - overall.completed === 1 ? 'lesson' : 'lessons'} left to complete
              </p>
            </div>
            <div>
              <span>Quizzes remaining</span>
              <strong>{overall.remainingQuizzes}</strong>
              <p>
                {overall.remainingQuizzes
                  ? 'Pass these to finish your courses'
                  : 'No outstanding quizzes'}
              </p>
            </div>
          </div>
          <section className="learning-dashboard" aria-label="Learning dashboard">
            {dashboard.isPending || dashboard.isError ? (
              <QueryState
                loading={dashboard.isPending}
                error={dashboard.error}
                onRetry={() => void dashboard.refetch()}
              />
            ) : (
              <>
                {latest ? (
                  <div className="resume-learning">
                    <div>
                      <div className="eyebrow">CONTINUE LEARNING</div>
                      <h2>{latest.course_title}</h2>
                      <p className="muted">{latest.lesson_title}</p>
                    </div>
                    <Button onClick={() => openLesson(latest.course_id, latest.lesson_id)}>
                      <Play size={16} />
                      Resume lesson
                    </Button>
                  </div>
                ) : (
                  <div className="resume-learning">
                    <div>
                      <h2>
                        {activeCourses.length ? 'Ready for your next lesson?' : 'All caught up!'}
                      </h2>
                      <p className="muted">
                        {activeCourses.length
                          ? 'Open an active course below. Your last lesson will appear here.'
                          : 'Your completed courses and certificates are ready below.'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="saved-learning-head">
                  <div>
                    <h2>Saved notes &amp; bookmarks</h2>
                    <p className="muted small">Your private learning collection across courses.</p>
                  </div>
                  <Input
                    aria-label="Search saved learning"
                    placeholder="Search notes, lessons, or courses"
                    {...filters.register('query')}
                  />
                </div>
                <div className="catalog-filters">
                  <label>
                    Show
                    <Controller
                      control={filters.control}
                      name="kind"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Saved item type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Notes and bookmarks</SelectItem>
                            <SelectItem value="notes">Notes only</SelectItem>
                            <SelectItem value="bookmarks">Bookmarks only</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </label>
                  <label>
                    Course
                    <Controller
                      control={filters.control}
                      name="course"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Saved items course">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All courses</SelectItem>
                            {library.map((course) => (
                              <SelectItem key={course.id} value={course.id}>
                                {course.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </label>
                  <Button variant="ghost" onClick={() => filters.reset()}>
                    Clear saved filters
                  </Button>
                  <span className="muted small" role="status">
                    {saved.length} saved {saved.length === 1 ? 'lesson' : 'lessons'}
                  </span>
                </div>
                {saved.length ? (
                  <div className="saved-learning-list">
                    {saved.map((item) => (
                      <article
                        className="saved-learning-card"
                        key={`${item.course_id}:${item.lesson_id}`}
                      >
                        <div>
                          <p className="eyebrow">{item.course_title}</p>
                          <h3>{item.lesson_title}</h3>
                          <div className="saved-item-tags">
                            {item.bookmarked && (
                              <span>
                                <Bookmark size={14} />
                                Bookmarked
                              </span>
                            )}
                            {!!item.note.trim() && (
                              <span>
                                <NotebookPen size={14} />
                                Notes saved
                              </span>
                            )}
                          </div>
                          {item.note.trim() && <p className="saved-note-preview">{item.note}</p>}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => openLesson(item.course_id, item.lesson_id)}
                        >
                          Open lesson
                          <ArrowRight size={15} />
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty saved-learning-empty">
                    <NotebookPen size={28} />
                    <h3>
                      {dashboard.data?.saved.length
                        ? 'No matching saved lessons'
                        : 'Keep your useful ideas close'}
                    </h3>
                    <p>
                      {dashboard.data?.saved.length
                        ? 'Try another search or filter.'
                        : 'Save notes or bookmark a lesson in the classroom to find it here.'}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
          <h2 className="library-heading">Your courses</h2>
          <div className="learning-course-tabs" role="group" aria-label="Course status">
            <Button
              variant={courseView === 'active' ? 'default' : 'outline'}
              aria-pressed={courseView === 'active'}
              onClick={() => setCourseView('active')}
            >
              Active courses ({activeCourses.length})
            </Button>
            <Button
              variant={courseView === 'completed' ? 'default' : 'outline'}
              aria-pressed={courseView === 'completed'}
              onClick={() => setCourseView('completed')}
            >
              Completed courses ({completedCourses.length})
            </Button>
          </div>
          {visibleCourses.length ? (
            <div className="course-grid">
              {visibleCourses.map((course) => (
                <div className="learning-course-item" key={`${userId}:${course.id}`}>
                  {courseCard(course)}
                  <SectionProgress
                    course={course}
                    enrollment={enrollments.find((item) => item.course_id === course.id)}
                    onOpenLesson={(lesson) => onOpen(course, lesson.id)}
                  />
                  {courseView === 'completed' && <CourseCertificate courseId={course.id} />}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <BookOpen size={30} />
              <h3>
                {courseView === 'active' ? 'No active courses' : 'Your first completion is ahead'}
              </h3>
              <p>
                {courseView === 'active'
                  ? 'Explore a new course or review your completed learning.'
                  : 'Finish all current lessons and pass the required quizzes to earn a certificate.'}
              </p>
              {courseView === 'active' && (
                <Button onClick={onExplore}>
                  Explore courses
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="empty">
          <BookOpen size={36} />
          <h3>Your next chapter is waiting</h3>
          <p>Enroll in a course to start building your skills.</p>
          <Button onClick={() => onExplore()}>
            Explore courses <ArrowRight size={16} />
          </Button>
        </div>
      )}
    </section>
  );
}
