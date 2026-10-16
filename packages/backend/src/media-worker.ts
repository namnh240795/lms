import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rename, rm, stat } from 'node:fs/promises';
import { database } from './config.js';
import { startEvents, enqueue } from './events.js';
import { LocalVideoStorage, maxUploadBytes } from './media/storage.js';
import { z } from 'zod';
const run = promisify(execFile);
const db = database('media');
const storage = new LocalVideoStorage();
await storage.prepare();
await startEvents(db, 'media-processing', ['media.uploaded'], async (client, event) => {
  const id = z.uuid().parse(event.payload.assetId);
  const asset = (await client.query('SELECT * FROM media_assets WHERE id=$1 FOR UPDATE', [id]))
    .rows[0];
  if (!asset || asset.status !== 'processing') return;
  const output = storage.path(id, 'playback');
  const temporary = `${output}.tmp.mp4`;
  try {
    const { stdout } = await run(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-f',
        asset.mime === 'video/mp4' ? 'mov' : 'matroska',
        '-show_entries',
        'format=duration:stream=codec_type,width,height',
        '-of',
        'json',
        storage.path(id, 'original'),
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    const metadata = JSON.parse(stdout);
    const video = metadata.streams?.find((s: any) => s.codec_type === 'video');
    const duration = Number(metadata.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 4 * 3600)
      throw new Error('Upload a valid video between 0 and 4 hours long.');
    await run(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-protocol_whitelist',
        'file,pipe',
        '-f',
        asset.mime === 'video/mp4' ? 'mov' : 'matroska',
        '-i',
        storage.path(id, 'original'),
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        "scale=w='min(1280,iw)':h=-2",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '2',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        '-fs',
        String(maxUploadBytes * 2),
        temporary,
      ],
      { timeout: 10 * 60000, maxBuffer: 1024 * 1024 },
    );
    if ((await stat(temporary)).size >= maxUploadBytes * 2)
      throw new Error('Processed video exceeds storage limits.');
    await rename(temporary, output);
    const result = await run(
      process.env.FFPROBE_PATH || 'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', output],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    const processed = JSON.parse(result.stdout).streams.find(
      (stream: any) => stream.codec_type === 'video',
    );
    await client.query(
      "UPDATE media_assets SET status='ready',duration=$2,width=$3,height=$4,error=null WHERE id=$1",
      [id, duration, processed.width, processed.height],
    );
    await enqueue(client, 'media.ready', {
      assetId: id,
      courseId: asset.course_id,
      lessonId: asset.lesson_id,
      duration,
    });
  } catch (error) {
    console.error('Video processing failed', id, (error as Error).message);
    await rm(temporary, { force: true });
    await client.query(
      "UPDATE media_assets SET status='failed',error='Video processing failed. Upload a valid MP4 or WebM video and try again.' WHERE id=$1",
      [id],
    );
    await enqueue(client, 'media.failed', { assetId: id });
  }
});
console.log('Media processing worker listening for uploads.');
