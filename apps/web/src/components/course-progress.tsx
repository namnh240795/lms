import { courseProgress } from '@/lib/course-completion';
import type { Course, Enrollment } from '@/lib/api';
export function CourseProgress({
  course,
  enrollment,
  showQuizzes = false,
}: {
  course: Course;
  enrollment: Enrollment;
  showQuizzes?: boolean;
}) {
  const progress = courseProgress(course, enrollment);
  return (
    <div className="course-progress-summary">
      <div className="course-progress-label">
        <span>
          {progress.completed} of {progress.total} {progress.total === 1 ? 'lesson' : 'lessons'}{' '}
          complete
        </span>
        <strong>{progress.percent}%</strong>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={`${course.title} completion`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.completed} of ${progress.total} lessons complete`}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      {showQuizzes && (
        <p className="small muted">
          {progress.quizCount
            ? `${progress.remainingQuizzes.length} ${progress.remainingQuizzes.length === 1 ? 'quiz' : 'quizzes'} remaining`
            : 'No required quizzes'}
        </p>
      )}
    </div>
  );
}
