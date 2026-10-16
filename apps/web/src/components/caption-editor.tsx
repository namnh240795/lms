import type { Captions } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
export function CaptionEditor({
  captions,
  onChange,
}: {
  captions?: Captions | null;
  onChange: (value: Captions | null) => void;
}) {
  return (
    <section className="caption-editor">
      <h3>Video captions</h3>
      <p className="muted small">
        Add a plain-text WebVTT track. Students can switch captions on in the video controls.
      </p>
      {!captions ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              label: 'English',
              language: 'en',
              vtt: 'WEBVTT\n\n00:00.000 --> 00:03.000\nReplace this with your spoken words.\n',
            })
          }
        >
          Add captions
        </Button>
      ) : (
        <>
          <div className="caption-fields">
            <label>
              Caption label
              <Input
                maxLength={50}
                value={captions.label}
                onChange={(e) => onChange({ ...captions, label: e.target.value })}
              />
            </label>
            <label>
              Language code
              <Input
                maxLength={35}
                value={captions.language}
                placeholder="en"
                onChange={(e) => onChange({ ...captions, language: e.target.value })}
              />
            </label>
          </div>
          <label>
            WebVTT captions
            <Textarea
              rows={7}
              maxLength={100000}
              value={captions.vtt}
              onChange={(e) => onChange({ ...captions, vtt: e.target.value })}
            />
          </label>
          <p className="muted small">
            Use MM:SS.mmm or HH:MM:SS.mmm timings. One track per lesson, up to 100 KB; cue end times
            must stay within four hours. Plain text only.
          </p>
          <Button type="button" variant="outline" onClick={() => onChange(null)}>
            Remove captions
          </Button>
        </>
      )}
    </section>
  );
}
