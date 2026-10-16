import {
  Plus,
  BookOpen,
  CheckCircle2,
  LayoutDashboard,
  GraduationCap,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QueryState } from '@/components/query-state';
import { money, type Course } from '@/lib/api';
export function TutorPage({
  mine,
  loading,
  error,
  busy,
  onCreate,
  onEdit,
  onPublish,
  onRetry,
}: {
  mine: Course[];
  loading: boolean;
  error: Error | null;
  busy: boolean;
  onCreate: () => void;
  onEdit: (course: Course) => void;
  onPublish: (course: Course) => void;
  onRetry: () => void;
}) {
  return (
    <section className="workspace">
      <div className="section-head">
        <div>
          <div className="eyebrow">YOUR TUTOR WORKSPACE</div>
          <h1>Share your expertise.</h1>
          <p className="muted">Create thoughtful courses and help your students grow.</p>
        </div>
        <Button onClick={() => onCreate()}>
          <Plus size={17} />
          Create course
        </Button>
      </div>
      <div className="stats">
        <Card>
          <CardContent>
            <BookOpen />
            <strong>{mine.length}</strong>
            <span>Total courses</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CheckCircle2 />
            <strong>{mine.filter((c) => c.published).length}</strong>
            <span>Published courses</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <LayoutDashboard />
            <strong>{mine.filter((c) => !c.published).length}</strong>
            <span>Drafts in progress</span>
          </CardContent>
        </Card>
      </div>
      <h2>Your courses</h2>
      {loading || error ? (
        <QueryState loading={loading} error={error} onRetry={onRetry} />
      ) : mine.length ? (
        <div className="tutor-list">
          {mine.map((c) => (
            <Card key={c.id}>
              <CardContent>
                <div>
                  <span className="pill">{c.published ? 'Published' : 'Draft'}</span>
                  <h3>{c.title}</h3>
                  <p className="muted small">
                    {c.sections.length} {c.sections.length === 1 ? 'section' : 'sections'} ·{' '}
                    {c.lessons.length} {c.lessons.length === 1 ? 'lesson' : 'lessons'} ·{' '}
                    {money(c.price)}
                  </p>
                </div>
                <div className="tutor-course-actions">
                  <Button variant="outline" disabled={busy} onClick={() => onEdit(c)}>
                    Edit course
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => onPublish(c)}>
                    {c.published ? 'Unpublish' : 'Publish course'}
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="empty">
          <GraduationCap size={36} />
          <h3>Great courses start with you</h3>
          <p>Create your first course and add a lesson to get started.</p>
          <Button onClick={() => onCreate()}>Create your first course</Button>
        </div>
      )}
    </section>
  );
}
