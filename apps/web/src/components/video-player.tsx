import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
export function VideoPlayer({
  userId,
  courseId,
  lessonId,
  mediaId,
  preview = false,
  captions,
}: {
  userId: string;
  courseId: string;
  lessonId: string;
  mediaId: string;
  preview?: boolean;
  captions?: import('@/lib/api').Captions | null;
}) {
  const [captionUrl, setCaptionUrl] = useState('');
  const [captionsOn, setCaptionsOn] = useState(false);
  useEffect(() => {
    if (!captions?.vtt) {
      setCaptionUrl('');
      return;
    }
    const url = URL.createObjectURL(new Blob([captions.vtt], { type: 'text/vtt' }));
    setCaptionUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captions?.vtt]);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current)
      for (const track of Array.from(video.current.textTracks))
        track.mode = captionsOn ? 'showing' : 'hidden';
  }, [captionsOn, captionUrl]);
  const [source, setSource] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const position = useRef(0);
  const lastSave = useRef(0);
  const resumeTarget = useRef(0);
  const resumePlaying = useRef(false);
  const switchingSource = useRef(false);
  const controls = useForm({ defaultValues: { speed: '1' } });
  const speed = controls.watch('speed');
  const playback = useQuery({
    queryKey: keys.playback(userId, courseId, lessonId, mediaId, preview),
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: 9 * 60000,
    queryFn: async ({ signal }) => {
      const [playback, position] = await Promise.all([
        api<{ url: string; expiresAt: number }>(
          `/media/${mediaId}/playback`,
          'POST',
          {},
          { signal },
        ),
        preview
          ? Promise.resolve({ position: 0 })
          : api<{ position: number }>(
              `/learning/${courseId}/position/${lessonId}`,
              'GET',
              undefined,
              { signal },
            ),
      ]);
      return { ...playback, position: position.position };
    },
  });
  const savePosition = useMutation({
    mutationFn: (position: number) =>
      api(`/learning/${courseId}/position/${lessonId}`, 'PUT', { position }, { keepalive: true }),
  });
  const mutatePosition = useRef(savePosition.mutate);
  mutatePosition.current = savePosition.mutate;
  useEffect(() => {
    if (!playback.data) return;
    resumePlaying.current = !!video.current && !video.current.paused;
    resumeTarget.current = video.current?.currentTime || playback.data.position;
    switchingSource.current = !!source && source !== playback.data.url;
    setPlaybackError('');
    setSource(playback.data.url);
  }, [playback.data?.url]);
  useEffect(
    () => () => {
      if (!preview && position.current > 0) mutatePosition.current(position.current);
    },
    [courseId, lessonId, preview],
  );
  function save(force = false) {
    if (
      preview ||
      !video.current ||
      !Number.isFinite(video.current.currentTime) ||
      (!force && Date.now() - lastSave.current < 10000)
    )
      return;
    position.current = video.current.currentTime;
    lastSave.current = Date.now();
    savePosition.mutate(position.current);
  }
  const error = playbackError || playback.error?.message;
  return (
    <div className="lesson-video-player">
      {error ? (
        <div className="form-error" role="alert">
          {error}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPlaybackError('');
              void playback.refetch();
            }}
          >
            Retry playback
          </Button>
        </div>
      ) : source ? (
        <>
          <video
            ref={video}
            src={source}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={() => {
              if (!video.current) return;
              if (resumeTarget.current > 0 && resumeTarget.current < video.current.duration)
                video.current.currentTime = resumeTarget.current;
              video.current.playbackRate = Number(speed);
              for (const track of Array.from(video.current.textTracks))
                track.mode = captionsOn ? 'showing' : 'hidden';
              switchingSource.current = false;
              if (resumePlaying.current) void video.current.play().catch(() => {});
            }}
            onTimeUpdate={() => {
              if (!switchingSource.current) {
                position.current = video.current?.currentTime || 0;
                save();
              }
            }}
            onPause={() => {
              if (!switchingSource.current) save(true);
            }}
            onEnded={() => save(true)}
            onError={() =>
              setPlaybackError('Video playback failed. Try refreshing your playback link.')
            }
          >
            {captionUrl && captions && (
              <track
                key={captionUrl}
                kind="captions"
                src={captionUrl}
                srcLang={captions.language}
                label={captions.label}
                onLoad={(event) => {
                  event.currentTarget.track.mode = captionsOn ? 'showing' : 'hidden';
                }}
              />
            )}
          </video>
          {captions && captionUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={captionsOn}
              onClick={() => setCaptionsOn((value) => !value)}
            >
              {captionsOn ? 'Hide' : 'Show'} captions · {captions.label}
            </Button>
          )}
          <label className="playback-speed">
            Playback speed
            <Controller
              name="speed"
              control={controls.control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (video.current) video.current.playbackRate = Number(value);
                  }}
                >
                  <SelectTrigger className="h-8 w-24" aria-label="Playback speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <SelectItem value={String(speed)} key={speed}>
                        {speed}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </label>
          {savePosition.error && (
            <p className="small muted" role="status">
              Your position couldn’t be saved. We’ll try again as you watch.
            </p>
          )}
        </>
      ) : (
        <p className="muted small">Preparing private playback…</p>
      )}
    </div>
  );
}
