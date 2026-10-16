import { dashboardKey } from '@/lib/query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, Save } from 'lucide-react';
import { api, type LessonTool } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormMessage } from '@/components/ui/form-message';
export const toolsKey = (userId: string, courseId: string) =>
  ['user', userId, 'tools', courseId] as const;
export function LessonNotes({
  userId,
  courseId,
  lessonId,
  tool,
  onDirty,
}: {
  userId: string;
  courseId: string;
  lessonId: string;
  tool?: LessonTool;
  onDirty: (dirty: boolean) => void;
}) {
  const client = useQueryClient();
  const form = useForm({ defaultValues: { note: tool?.note || '' } });
  const dirty = form.formState.isDirty;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // Do not replace a student's unsaved text when bookmarks or background queries change.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset({ note: tool?.note || '' });
  }, [tool?.note, form]);
  const save = useMutation({
    mutationFn: (data: { note?: string; bookmarked?: boolean }) =>
      api<LessonTool>(`/learning/${courseId}/tools/${encodeURIComponent(lessonId)}`, 'PATCH', data),
    onSuccess: (saved, variables) => {
      client.setQueryData<LessonTool[]>(toolsKey(userId, courseId), (old) => [
        ...(old || []).filter((item) => item.lesson_id !== lessonId),
        saved,
      ]);
      void client.invalidateQueries({ queryKey: dashboardKey(userId) });
      if (variables.note !== undefined) form.reset({ note: saved.note });
    },
  });
  return (
    <section className="lesson-notes" aria-label="Personal learning tools">
      <div className="learning-tools-head">
        <div>
          <h3>Your lesson notes</h3>
          <p className="muted small">Private to you. Save your thoughts before changing lessons.</p>
        </div>
        <Button
          variant="outline"
          type="button"
          disabled={save.isPending}
          aria-pressed={!!tool?.bookmarked}
          onClick={() => save.mutate({ bookmarked: !tool?.bookmarked })}
        >
          {tool?.bookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {tool?.bookmarked ? 'Bookmarked' : 'Bookmark lesson'}
        </Button>
      </div>
      <form onSubmit={form.handleSubmit((values) => save.mutate({ note: values.note }))}>
        <label htmlFor={`note-${lessonId}`}>
          Notes
          <Textarea
            id={`note-${lessonId}`}
            rows={5}
            maxLength={10000}
            disabled={save.isPending}
            placeholder="Key ideas, questions, or something to practice…"
            {...form.register('note', {
              maxLength: { value: 10000, message: 'Keep notes under 10,000 characters.' },
            })}
          />
        </label>
        <div className="note-actions">
          <span className="muted small" role="status">
            {dirty ? 'Unsaved notes' : save.isSuccess ? 'Saved' : 'Notes are saved per lesson'}
          </span>
          <Button disabled={save.isPending || !dirty}>
            <Save size={16} />
            {save.isPending ? 'Saving…' : 'Save notes'}
          </Button>
        </div>
        <FormMessage message={form.formState.errors.note?.message || save.error?.message} />
      </form>
    </section>
  );
}
