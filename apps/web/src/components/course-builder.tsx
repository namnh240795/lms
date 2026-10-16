import { RouteSurface } from '@/routing/route-surface';
import { NavigationGuard } from '@/routing/navigation-guard';
import { CaptionEditor } from '@/components/caption-editor';
import { useForm, useWatch, Controller, useFieldArray, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { courseFormSchema, formMessages } from '@/lib/form-schemas';
import { FormMessage, ValidationSummary } from '@/components/ui/form-message';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Eye,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { LessonVideoUpload } from '@/components/lesson-video-upload';
import { VideoPlayer } from '@/components/video-player';
import { QuizEditor } from '@/components/quiz-editor';
import { QuizRunner } from '@/components/quiz-runner';
import { api, money, type Course, type Section, type Quiz } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/dialog';
type Draft = {
  title: string;
  description: string;
  category: string;
  price: string;
  thumbnail: string | null;
  sections: Section[];
};
const newLesson = () => ({ id: crypto.randomUUID(), title: 'New lesson', content: '' });
const newSection = () => ({
  id: crypto.randomUUID(),
  title: 'New section',
  lessons: [newLesson()],
});
function initial(course: Course | null): Draft {
  return course
    ? {
        title: course.title,
        description: course.description,
        category: course.category,
        price: String(course.price / 100),
        thumbnail: course.thumbnail,
        sections: structuredClone(course.sections),
      }
    : {
        title: '',
        description: '',
        category: 'Development',
        price: '0',
        thumbnail: null,
        sections: [{ ...newSection(), title: 'Getting started' }],
      };
}
function move<T>(items: T[], index: number, direction: number) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
export function CourseBuilder({
  course,
  userId,
  onClose,
  onSaved,
  standalone = false,
}: {
  course: Course | null;
  userId: string;
  onClose: () => void;
  standalone?: boolean;
  onSaved: (course: Course) => Promise<void>;
}) {
  const form = useForm<Draft>({
    defaultValues: initial(course),
    resolver: zodResolver(courseFormSchema) as Resolver<Draft>,
    mode: 'onBlur',
  });
  const draft = useWatch({ control: form.control }) as Draft;
  const sectionFields = useFieldArray({
    control: form.control,
    name: 'sections',
    keyName: 'formKey',
  });
  const [saved, setSaved] = useState(course);

  const [uploading, setUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [activeLesson, setActiveLesson] = useState(draft.sections[0]?.lessons[0]?.id || '');
  const dirty = form.formState.isDirty;
  const allLessons = draft.sections.flatMap((s) => s.lessons);
  const section = draft.sections.find((s) => s.lessons.some((l) => l.id === activeLesson));
  const lesson = section?.lessons.find((l) => l.id === activeLesson);
  const issues = [
    ...(draft.sections.length ? [] : ['Add at least one section.']),
    ...draft.sections.flatMap((s) =>
      s.lessons.length
        ? s.lessons
            .filter((l) => !l.quiz && !l.mediaId && (l.content || '').trim().length < 10)
            .map((l) => `Add content to “${l.title}”.`)
        : [`Add a lesson to “${s.title}”.`],
    ),
  ];
  for (const lesson of allLessons)
    if (lesson.quiz) {
      const quiz = lesson.quiz;
      if (
        quiz.title.trim().length < 3 ||
        quiz.passingScore < 1 ||
        quiz.passingScore > 100 ||
        !Number.isInteger(quiz.passingScore)
      )
        issues.push(`Finish quiz settings in “${lesson.title}”.`);
      for (const question of quiz.questions)
        if (
          question.prompt.trim().length < 5 ||
          question.options.some((option) => !option.text.trim()) ||
          !question.options.some((option) => option.id === question.correctOptionId)
        )
          issues.push(`Finish the questions in “${lesson.title}”.`);
    }
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function close() {
    if (busy || uploading) return;
    if (standalone) {
      onClose();
      return;
    }
    if (!dirty || window.confirm('Discard your unsaved course changes?')) onClose();
  }
  function patch(values: Partial<Draft>) {
    for (const [key, value] of Object.entries(values))
      form.setValue(key as keyof Draft, value as never, { shouldDirty: true });
    setNotice('');
  }
  function sections(update: (sections: Section[]) => Section[]) {
    form.setValue('sections', update(form.getValues('sections')), { shouldDirty: true });
    setNotice('');
  }
  function patchLesson(values: {
    title?: string;
    content?: string;
    mediaId?: string | null;
    quiz?: Quiz | null;
    captions?: import('@/lib/api').Captions | null;
  }) {
    sections((items) =>
      items.map((s) => ({
        ...s,
        lessons: s.lessons.map((l) => (l.id === activeLesson ? { ...l, ...values } : l)),
      })),
    );
  }
  async function thumbnail(file: File | undefined) {
    if (!file) return;
    setError('');
    setUploading(true);
    setImageUploading(true);
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error('Choose a JPEG, PNG, or WebP image under 10 MB.');
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / bitmap.width, 800 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser cannot process this image.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL('image/webp', 0.8);
      if (data.length > 700000) throw new Error('This image is too detailed. Try a smaller image.');
      patch({ thumbnail: data });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      setImageUploading(false);
    }
  }
  const saveMutation = useMutation({
    mutationFn: async (values: Draft) => {
      const payload = {
        ...values,
        price: Math.round(Number(values.price) * 100),
        version: saved?.version,
      };
      return api<Course>(
        saved ? `/courses/${saved.id}` : '/courses',
        saved ? 'PUT' : 'POST',
        payload,
      );
    },
    onSuccess: async (result) => {
      setSaved(result);
      form.reset(initial(result));
      setNotice(
        result.published ? 'Changes saved to your live course.' : 'Draft saved. Your work is safe.',
      );
      await onSaved(result);
    },
    onError: (error) => form.setError('root', { message: error.message }),
  });
  const busy = saveMutation.isPending;
  const validationMessages = formMessages(form.formState.errors);
  async function save(values: Draft) {
    setError('');
    setNotice('');
    form.clearErrors('root');
    await saveMutation.mutateAsync(values).catch(() => {});
  }

  const Surface = standalone ? RouteSurface : Modal;
  return (
    <Surface
      title={saved ? 'Edit course' : 'Create course'}
      className="builder-modal"
      onClose={close}
    >
      {standalone && (
        <NavigationGuard
          dirty={dirty || uploading}
          message="Discard your unsaved course changes?"
        />
      )}
      <button
        className="modal-close"
        aria-label="Close course builder"
        onClick={close}
        disabled={busy || uploading}
      >
        <X />
      </button>
      <div className="builder-heading">
        <div>
          <div className="eyebrow">YOUR KNOWLEDGE, THEIR NEXT CHAPTER</div>
          <h2>{saved ? 'Shape your course.' : 'Create something worth learning.'}</h2>
          <p className="muted">
            {saved?.published
              ? 'This course is live. Saving makes your changes available to students.'
              : 'Build at your own pace. Drafts stay private until you publish.'}
          </p>
        </div>
        <span className={`pill ${saved?.published ? 'paid' : ''}`}>
          {saved?.published ? 'Published' : 'Draft'}
        </span>
      </div>
      <form noValidate onSubmit={form.handleSubmit(save)} className="builder-form">
        <ValidationSummary messages={validationMessages} />
        <fieldset disabled={busy || uploading} className="builder-fields">
          <div className="builder-details">
            <div>
              <h3>Course details</h3>
              <label>
                Course title
                <Input
                  {...form.register('title')}
                  aria-invalid={!!form.formState.errors.title}
                  aria-describedby="course-title-error"
                  required
                  minLength={5}
                  maxLength={150}
                  placeholder="What will you teach?"
                />
                <FormMessage
                  id="course-title-error"
                  message={form.formState.errors.title?.message}
                />
              </label>
              <label>
                Description
                <Textarea
                  {...form.register('description')}
                  aria-invalid={!!form.formState.errors.description}
                  aria-describedby="course-description-error"
                  required
                  minLength={20}
                  maxLength={3000}
                  placeholder="Describe who this course is for and what they’ll learn."
                />
              </label>
              <FormMessage
                id="course-description-error"
                message={form.formState.errors.description?.message}
              />
              <div className="form-row">
                <label>
                  Category
                  <Controller
                    name="category"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={busy || uploading}
                      >
                        <SelectTrigger ref={field.ref} onBlur={field.onBlur} aria-label="Category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Development', 'Design', 'Business', 'Driving'].map((value) => (
                            <SelectItem value={value} key={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </label>
                <div className="form-field">
                  <label htmlFor="course-price">Price (USD)</label>
                  <Controller
                    name="price"
                    control={form.control}
                    render={({ field }) => (
                      <NumberInput
                        id="course-price"
                        ref={field.ref}
                        label="price"
                        min="0"
                        max="10000"
                        step="0.01"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={busy || uploading}
                        aria-invalid={!!form.formState.errors.price}
                        aria-describedby="course-price-error"
                      />
                    )}
                  />
                  <FormMessage
                    id="course-price-error"
                    message={form.formState.errors.price?.message}
                  />
                </div>
              </div>
            </div>
            <div className="thumbnail-panel">
              <h3>Course thumbnail</h3>
              {draft.thumbnail ? (
                <img src={draft.thumbnail} alt="Course thumbnail preview" />
              ) : (
                <div className="thumbnail-placeholder">
                  <ImagePlus size={32} />
                  <span>Give your course a face.</span>
                </div>
              )}
              <label className="upload-label">
                {imageUploading ? 'Processing image…' : 'Upload thumbnail'}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading || busy}
                  onChange={(e) => {
                    void thumbnail(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="small muted">
                JPEG, PNG, or WebP · up to 10 MB
                <br />
                Automatically resized for your course.
              </p>
              {draft.thumbnail && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ thumbnail: null })}
                >
                  Remove thumbnail
                </Button>
              )}
            </div>
          </div>
          <div className="curriculum-heading">
            <div>
              <h3>Curriculum</h3>
              <p className="muted small">
                {draft.sections.length} sections · {allLessons.length} lessons · Move items with the
                arrows.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={draft.sections.length >= 30}
              onClick={() => {
                const s = newSection();
                sectionFields.append(s);
                setActiveLesson(s.lessons[0].id);
              }}
            >
              <Plus size={15} />
              Add section
            </Button>
          </div>
          <div className="curriculum-builder">
            <aside className="section-list">
              {draft.sections.map((s, index) => (
                <div className="builder-section" key={s.id}>
                  <div className="section-title">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <Input
                      aria-label={`Section ${index + 1} title`}
                      required
                      minLength={2}
                      maxLength={150}
                      value={s.title}
                      onChange={(e) =>
                        sections((items) =>
                          items.map((item) =>
                            item.id === s.id ? { ...item, title: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="section-tools">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Move section ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => sectionFields.move(index, index - 1)}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Move section ${index + 1} down`}
                      disabled={index === draft.sections.length - 1}
                      onClick={() => sectionFields.move(index, index + 1)}
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove section ${index + 1}`}
                      onClick={() => {
                        if (
                          s.lessons.length &&
                          !window.confirm(
                            `Remove “${s.title}” and its ${s.lessons.length} lessons?`,
                          )
                        )
                          return;
                        sectionFields.remove(index);
                        if (s.lessons.some((l) => l.id === activeLesson)) setActiveLesson('');
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <div className="section-lessons">
                    {s.lessons.map((l, i) => (
                      <div
                        className={`builder-lesson ${activeLesson === l.id ? 'current' : ''}`}
                        key={l.id}
                      >
                        <button
                          type="button"
                          className="lesson-select"
                          onClick={() => setActiveLesson(l.id)}
                        >
                          <BookOpen size={15} />
                          <span>{l.title || 'Untitled lesson'}</span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Move ${l.title} up`}
                          disabled={i === 0}
                          onClick={() =>
                            sections((items) =>
                              items.map((item) =>
                                item.id === s.id
                                  ? { ...item, lessons: move(item.lessons, i, -1) }
                                  : item,
                              ),
                            )
                          }
                        >
                          <ArrowUp size={13} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Move ${l.title} down`}
                          disabled={i === s.lessons.length - 1}
                          onClick={() =>
                            sections((items) =>
                              items.map((item) =>
                                item.id === s.id
                                  ? { ...item, lessons: move(item.lessons, i, 1) }
                                  : item,
                              ),
                            )
                          }
                        >
                          <ArrowDown size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="section-footer">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="add-lesson-button"
                      disabled={allLessons.length >= 100}
                      onClick={() => {
                        const l = newLesson();
                        sections((items) =>
                          items.map((item) =>
                            item.id === s.id ? { ...item, lessons: [...item.lessons, l] } : item,
                          ),
                        );
                        setActiveLesson(l.id);
                      }}
                    >
                      <Plus size={14} />
                      Add lesson
                    </Button>
                  </div>
                </div>
              ))}
              {!draft.sections.length && (
                <p className="muted small">Add a section to start building your curriculum.</p>
              )}
            </aside>
            <div className="lesson-editor">
              {lesson && section ? (
                <>
                  <div className="eyebrow">LESSON CONTENT</div>
                  <h3>Make the lesson your own.</h3>
                  <label>
                    Lesson title
                    <Input
                      required
                      minLength={2}
                      maxLength={150}
                      value={lesson.title}
                      onChange={(e) => patchLesson({ title: e.target.value })}
                    />
                  </label>
                  <LessonVideoUpload
                    userId={userId}
                    key={lesson.id}
                    courseId={saved?.id}
                    lessonId={lesson.id}
                    mediaId={lesson.mediaId}
                    onBusy={setUploading}
                    onReady={(id) => patchLesson({ mediaId: id })}
                  />
                  <label>
                    Lesson content
                    <Textarea
                      className="content-editor"
                      maxLength={10000}
                      value={lesson.content || ''}
                      onChange={(e) => patchLesson({ content: e.target.value })}
                      placeholder="Explain a concept, share an example, and give your students something to practice."
                    />
                  </label>
                  <span className="small muted">
                    {(lesson.content || '').length.toLocaleString()} / 10,000 characters
                  </span>
                  {lesson.mediaId && (
                    <CaptionEditor
                      captions={lesson.captions}
                      onChange={(captions) => patchLesson({ captions })}
                    />
                  )}
                  <QuizEditor quiz={lesson.quiz} onChange={(quiz) => patchLesson({ quiz })} />
                  <div className="lesson-editor-bottom">
                    <label>
                      Move to section
                      <Select
                        value={section.id}
                        disabled={busy || uploading}
                        onValueChange={(target) => {
                          if (target === section.id) return;
                          sections((items) =>
                            items.map((s) => ({
                              ...s,
                              lessons:
                                s.id === target
                                  ? [...s.lessons, lesson]
                                  : s.lessons.filter((l) => l.id !== lesson.id),
                            })),
                          );
                        }}
                      >
                        <SelectTrigger aria-label="Move to section">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {draft.sections.map((s) => (
                            <SelectItem value={s.id} key={s.id}>
                              {s.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Remove “${lesson.title}”?`)) return;
                        sections((items) =>
                          items.map((s) => ({
                            ...s,
                            lessons: s.lessons.filter((l) => l.id !== lesson.id),
                          })),
                        );
                        setActiveLesson('');
                      }}
                    >
                      <Trash2 size={14} />
                      Remove lesson
                    </Button>
                  </div>
                </>
              ) : (
                <div className="lesson-placeholder">
                  <BookOpen size={32} />
                  <h3>Choose a lesson to edit.</h3>
                  <p className="muted">Or add a new lesson to a section.</p>
                </div>
              )}
            </div>
          </div>
        </fieldset>
        <div className="publish-readiness">
          <Check size={16} />
          <span>
            {issues.length
              ? `${issues.length} item${issues.length === 1 ? '' : 's'} to finish before publishing. Drafts can be saved now.`
              : 'Your curriculum is ready to publish.'}
          </span>
        </div>
        {issues.length > 0 && (
          <details className="readiness-details">
            <summary>View publishing checklist</summary>
            <ul>
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="builder-notice" role="status">
            {notice}
          </p>
        )}
        <div className="builder-actions">
          <span className="small muted">
            {dirty ? 'Unsaved changes' : saved ? 'All changes saved' : 'New course'}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => setPreview(true)}
          >
            <Eye size={16} />
            Preview
          </Button>
          <Button type="submit" disabled={busy || uploading}>
            <Save size={16} />
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
      {preview && (
        <CoursePreview
          draft={draft}
          userId={userId}
          courseId={saved?.id}
          onClose={() => setPreview(false)}
        />
      )}
    </Surface>
  );
}
function CoursePreview({
  draft,
  courseId,
  userId,
  onClose,
}: {
  draft: Draft;
  userId: string;
  courseId?: string;
  onClose: () => void;
}) {
  const lessons = draft.sections.flatMap((s) => s.lessons);
  const [active, setActive] = useState(lessons[0]?.id || '');
  const current = lessons.find((l) => l.id === active);
  return (
    <Modal title="Course preview" className="preview-modal" onClose={onClose}>
      <button className="modal-close" aria-label="Close preview" onClick={onClose}>
        <X />
      </button>
      <div className="eyebrow">TUTOR PREVIEW · INCLUDES UNSAVED CHANGES</div>
      {draft.thumbnail && (
        <img className="preview-thumbnail" src={draft.thumbnail} alt="Course thumbnail" />
      )}
      <h2>{draft.title || 'Your course title'}</h2>
      <p>{draft.description || 'Your course description will appear here.'}</p>
      <span className="pill">
        {draft.category} · {money(Math.round(Number(draft.price) * 100) || 0)} · {lessons.length}{' '}
        lessons
      </span>
      <div className="lesson-layout">
        <aside>
          {draft.sections.map((section, i) => (
            <div key={section.id}>
              <h3>
                {i + 1}. {section.title}
              </h3>
              {section.lessons.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className={active === l.id ? 'current' : ''}
                  onClick={() => setActive(l.id)}
                >
                  <BookOpen size={16} />
                  <span>{l.title}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
        <article>
          <h2>{current?.title || 'No lessons yet'}</h2>
          {current?.mediaId && courseId && (
            <VideoPlayer
              userId={userId}
              key={current.id}
              courseId={courseId}
              lessonId={current.id}
              mediaId={current.mediaId}
              captions={current.captions}
              preview
            />
          )}
          {current?.quiz && <QuizRunner quiz={current.quiz} preview />}
          <p className="lesson-text">
            {current?.content || 'Add lesson content in the builder to see it here.'}
          </p>
        </article>
      </div>
    </Modal>
  );
}
