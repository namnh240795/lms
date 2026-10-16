import { CourseProgress } from '@/components/course-progress';
import { ArrowRight, Code2, Layers, Sparkles, CarFront } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { money, type Course, type Enrollment } from '@/lib/api';
export function CourseArtwork({ course }: { course: Course }) {
  if (course.thumbnail)
    return (
      <div className="course-art">
        <img className="course-thumbnail" src={course.thumbnail} alt="" />
        <span className="art-tag">{course.category}</span>
      </div>
    );
  return (
    <div className={`course-art ${course.category.toLowerCase()}`}>
      <span className="art-tag">{course.category}</span>
      {course.category === 'Driving' ? (
        <CarFront size={72} strokeWidth={1.3} />
      ) : course.category === 'Development' ? (
        <Code2 size={72} strokeWidth={1.3} />
      ) : course.category === 'Design' ? (
        <Layers size={72} strokeWidth={1.3} />
      ) : (
        <Sparkles size={72} strokeWidth={1.3} />
      )}
      <span className="art-caption">
        {course.category === 'Driving'
          ? 'LÁI XE AN TOÀN'
          : course.category === 'Development'
            ? 'BUILD SOMETHING GREAT'
            : course.category === 'Design'
              ? 'MAKE IDEAS VISIBLE'
              : 'THINK BIG. START SMALL.'}
      </span>
      <div className="art-orbit" />
    </div>
  );
}
export function CourseCard({
  course,
  enrollment,
  onOpen,
  showProgressSummary = false,
}: {
  course: Course;
  enrollment?: Enrollment;
  onOpen: (course: Course) => void;
  showProgressSummary?: boolean;
}) {
  return (
    <Card className="course-card">
      <button
        className="course-open"
        onClick={() => onOpen(course)}
        aria-label={`View ${course.title}`}
      >
        <CourseArtwork course={course} />
        <CardContent>
          <div className="course-meta">
            {course.category}
            <span>
              {course.lessons.length} {course.lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
          </div>
          <h3>{course.title}</h3>
          <p className="tutor-name">{course.tutor_name}</p>
          {enrollment ? (
            <CourseProgress
              course={course}
              enrollment={enrollment}
              showQuizzes={showProgressSummary}
            />
          ) : (
            <div className="course-bottom">
              <strong>{money(course.price)}</strong>
              <span>
                View course <ArrowRight size={15} />
              </span>
            </div>
          )}
        </CardContent>
      </button>
    </Card>
  );
}
