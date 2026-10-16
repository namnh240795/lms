import { z } from 'zod';
// Restrict tracks to timed text; HTML markup and remote resources are not needed.
export function validWebVtt(value: string) {
  const text = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^WEBVTT(?:[ \t][^\n]*)?\n\n/.test(text) || /</.test(text)) return false;
  const stamp = '(?:\\d{2,}:)?[0-5]\\d:[0-5]\\d\\.\\d{3}';
  const timing = new RegExp(`^(${stamp}) --> (${stamp})$`);
  const seconds = (stamp: string) =>
    stamp
      .split(':')
      .reverse()
      .reduce((sum, v, i) => sum + Number(v) * 60 ** i, 0);
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .slice(1);
  return (
    blocks.length > 0 &&
    blocks.every((block) => {
      const lines = block.split('\n');
      if (!lines[0].includes('-->')) lines.shift();
      const match = timing.exec(lines.shift() || '');
      return (
        !!match &&
        seconds(match[2]) > seconds(match[1]) &&
        seconds(match[2]) <= 14400 &&
        lines.length > 0 &&
        lines.some((line) => line.trim())
      );
    })
  );
}
export const captionsSchema = z.object({
  label: z.string().trim().min(1).max(50),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  vtt: z
    .string()
    .max(100000)
    .refine(validWebVtt, 'Use a valid plain-text WebVTT track with cue timings.'),
});
