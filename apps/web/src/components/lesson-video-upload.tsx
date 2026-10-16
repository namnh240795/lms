import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Video, X } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
type Asset = { id: string; status: string; duration: number | null; error: string | null };
export function LessonVideoUpload({
  userId,
  courseId,
  lessonId,
  mediaId,
  onReady,
  onBusy,
}: {
  userId: string;
  courseId?: string;
  lessonId: string;
  mediaId?: string | null;
  onReady: (id: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const started = useRef(0);
  const handled = useRef<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const fileForm = useForm<{ file: FileList | null }>({ defaultValues: { file: null } });
  const assetId = pending || mediaId || '';
  const status = useQuery({
    queryKey: keys.media(userId, assetId),
    enabled: !!userId && !!assetId,
    retry: false,
    queryFn: async ({ signal }) => {
      const asset = await api<Asset>(`/media/${assetId}`, 'GET', undefined, { signal });
      if (pending && asset.status !== 'ready' && Date.now() - started.current > 10 * 60000)
        throw new Error('Processing is taking longer than expected. Try again later.');
      return asset;
    },
    refetchInterval: (query) =>
      pending && !['ready', 'failed'].includes(query.state.data?.status || '') ? 1000 : false,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const mime =
        file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
      const ticket = await api<{ assetId: string; uploadUrl: string }>('/media/uploads', 'POST', {
        courseId,
        lessonId,
        filename: file.name,
        mime,
        size: file.size,
      });
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        request.open('PUT', ticket.uploadUrl);
        request.setRequestHeader('Content-Type', mime);
        request.timeout = 10 * 60000;
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else {
            let message = 'Video upload failed.';
            try {
              message = JSON.parse(request.responseText).message;
            } catch {}
            reject(new Error(message));
          }
        };
        request.onerror = () => reject(new Error('Upload interrupted. Please try again.'));
        request.onabort = () => reject(new Error('Upload canceled.'));
        request.ontimeout = () => reject(new Error('Upload timed out. Please try again.'));
        request.send(file);
      });
      return ticket.assetId;
    },
    onMutate: () => {
      setError('');
      setProgress(0);
      started.current = Date.now();
      handled.current = null;
      onBusy(true);
    },
    onSuccess: (id) => setPending(id),
    onError: (error) => {
      setError(error.message);
      onBusy(false);
    },
    onSettled: () => fileForm.resetField('file'),
  });
  useEffect(() => {
    if (!pending || handled.current === pending) return;
    const failure =
      status.error?.message ||
      (status.data?.status === 'failed' ? status.data.error || 'Video processing failed.' : null);
    if (status.data?.status === 'ready' || failure) {
      handled.current = pending;
      if (failure) setError(failure);
      else onReady(pending);
      setPending(null);
      onBusy(false);
    }
  }, [pending, status.data, status.error, onReady, onBusy]);
  useEffect(
    () => () => {
      xhr.current?.abort();
    },
    [],
  );
  const busy = upload.isPending || !!pending;
  const fileField = fileForm.register('file', {
    validate: (files) => {
      const file = files?.[0];
      return (
        !file ||
        ['video/mp4', 'video/webm', ''].includes(file.type) ||
        'Choose an MP4 or WebM video.'
      );
    },
  });
  return (
    <div className="video-upload">
      <div className="video-upload-heading">
        <Video size={18} />
        <strong>Lesson video</strong>
      </div>
      {status.data?.status === 'ready' ? (
        <p className="small muted">Video ready · {Math.round(status.data.duration || 0)} seconds</p>
      ) : (
        <p className="small muted">
          Upload an MP4 or WebM. Videos are processed for private playback.
        </p>
      )}
      {!courseId ? (
        <p className="small muted">Save this course and lesson before uploading.</p>
      ) : (
        <label className="upload-label">
          {busy
            ? pending
              ? 'Processing video…'
              : `Uploading ${progress}%`
            : 'Upload lesson video'}
          <Input
            {...fileField}
            aria-label="Upload lesson video"
            aria-invalid={!!fileForm.formState.errors.file}
            type="file"
            accept="video/mp4,video/webm"
            disabled={busy}
            onChange={(event) => {
              void fileField.onChange(event);
              void fileForm.handleSubmit((values) => {
                if (values.file?.[0]) upload.mutate(values.file[0]);
              })();
            }}
          />
        </label>
      )}
      {busy && (
        <div className="progress">
          <span style={{ width: `${pending ? 100 : progress}%` }} />
        </div>
      )}
      {mediaId && !busy && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onReady(null)}>
          <X size={14} />
          Remove video from lesson
        </Button>
      )}
      <FormMessage message={fileForm.formState.errors.file?.message} />
      {(error || (!pending && status.error?.message)) && (
        <p className="form-error" role="alert">
          {error || status.error?.message}
        </p>
      )}
    </div>
  );
}
