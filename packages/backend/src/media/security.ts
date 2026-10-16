import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export type MediaTicket = {
  assetId: string;
  userId: string;
  purpose: 'upload' | 'playback';
  expires: number;
};
export function ticket(data: MediaTicket, key: string) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
export function verifyTicket(
  value: string,
  key: string,
  purpose: MediaTicket['purpose'],
  assetId: string,
  userId: string,
) {
  try {
    const [body, signature] = value.split('.');
    const expected = createHmac('sha256', key).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as MediaTicket;
    if (
      data.purpose !== purpose ||
      data.assetId !== assetId ||
      data.userId !== userId ||
      data.expires <= Date.now()
    )
      throw new Error();
    return data;
  } catch {
    throw Object.assign(new Error('Invalid or expired media token'), { status: 403 });
  }
}
export function byteRange(value: string | undefined, size: number) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]))
    throw Object.assign(new Error('Invalid byte range'), { status: 416 });
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= size ||
    start < 0 ||
    end < start
  )
    throw Object.assign(new Error('Invalid byte range'), { status: 416 });
  return { start, end: Math.min(end, size - 1), partial: true };
}
export const uploadSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.string().min(1).max(100),
  filename: z.string().min(1).max(200),
  mime: z.enum(['video/mp4', 'video/webm']),
  size: z.number().int().positive(),
});
