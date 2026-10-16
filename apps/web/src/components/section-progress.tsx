import type { Course, Enrollment, Lesson } from '@/lib/api';
import { sectionProgress, nextUnfinishedLesson } from '@/lib/course-completion';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
export function SectionProgress({
  course,
  enrollment,
  onOpenLesson,
}: {
  course: Course;
  enrollment?: Enrollment;
  onOpenLesson: (lesson: Lesson) => void;
}) {
  const sections = sectionProgress(course, enrollment);
  const next = nextUnfinishedLesson(course, enrollment);
  return (
    <div className="section-progress-tools">
      {next && (
        <Button
          variant="outline"
          className="next-unfinished"
          onClick={() => onOpenLesson(next)}
          aria-label={`Next unfinished lesson in ${course.title}`}
        >
          <span>Next unfinished lesson</span>
          <ArrowRight size={16} />
        </Button>
      )}
      <details className="section-progress-panel">
        <summary>
          Section progress · {sections.length} {sections.length === 1 ? 'section' : 'sections'}
        </summary>
        <ol>
          {sections.map(
            (
              { section, completed, total, percent, status, nextLesson, remainingQuizzes },
              index,
            ) => (
              <li key={section.id}>
                <div className="section-progress-heading">
                  <h3>
                    {index + 1}. {section.title}
                  </h3>
                  <span
                    className={`section-status ${status === 'Completed' ? 'complete' : status === 'In progress' ? 'started' : ''}`}
                  >
                    {status === 'Completed' && <CheckCircle2 size={12} />} {status}
                  </span>
                </div>
                <div className="course-progress-label">
                  <span>
                    {completed} of {total} {total === 1 ? 'lesson' : 'lessons'} complete
                  </span>
                  <strong>{percent}%</strong>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`${section.title} section completion`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
                {nextLesson && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="section-next"
                    onClick={() => onOpenLesson(nextLesson)}
                    aria-label={`Continue section ${section.title}: ${nextLesson.title}`}
                  >
                    Continue section
                    <ArrowRight size={14} />
                  </Button>
                )}
                {remainingQuizzes.length > 0 && (
                  <div className="section-quiz-list">
                    <p>Quizzes still to pass</p>
                    {remainingQuizzes.map((lesson) => (
                      <Button
                        key={lesson.id}
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenLesson(lesson)}
                        aria-label={`Pass quiz: ${lesson.title}`}
                      >
                        {lesson.title}
                        <ArrowRight size={14} />
                      </Button>
                    ))}
                  </div>
                )}
                {total === 0 && <p className="small muted">Your tutor hasn’t added lessons yet.</p>}
              </li>
            ),
          )}
        </ol>
      </details>
    </div>
  );
}
