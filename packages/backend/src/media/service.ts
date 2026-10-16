import { Injectable } from '@nestjs/common';
import { database, ports, secret } from '../config.js';
import { readActor, signActor, type Actor } from '../security.js';
import { ticket, verifyTicket, uploadSchema, byteRange } from './security.js';
import { LocalVideoStorage, maxUploadBytes } from './storage.js';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { enqueue } from '../events.js';
import { z } from 'zod';
@Injectable()
export class MediaService {
  readonly db = database('media');
  readonly storage = new LocalVideoStorage();
  private key = secret('INTERNAL_SECRET');
  actor(req: Request): Actor {
    try {
      return readActor(req.header('x-internal-token') || '', this.key);
    } catch {
      throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
  }
  async catalog(user: Actor, id: string, edit = false) {
    const response = await fetch(
      `http://127.0.0.1:${ports.catalog}/courses/${id}/${edit ? 'edit' : 'content'}`,
      { headers: { 'x-internal-token': signActor(user, this.key) } },
    );
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message), { status: response.status });
    return data;
  }
  async asset(id: string) {
    const asset = (
      await this.db.query('SELECT * FROM media_assets WHERE id=$1', [z.uuid().parse(id)])
    ).rows[0];
    if (!asset) throw Object.assign(new Error('Video not found'), { status: 404 });
    return asset;
  }
  safe(asset: any) {
    const { id, course_id, lesson_id, filename, status, duration, width, height, error } = asset;
    return {
      id,
      courseId: course_id,
      lessonId: lesson_id,
      filename,
      status,
      duration,
      width,
      height,
      error,
    };
  }
  async create(req: Request) {
    const user = this.actor(req);
    const data = uploadSchema.parse(req.body);
    if (data.size > maxUploadBytes)
      throw Object.assign(
        new Error(`Video exceeds the ${Math.floor(maxUploadBytes / 1048576)} MB upload limit.`),
        { status: 413 },
      );
    const course = await this.catalog(user, data.courseId, true);
    if (!course.lessons.some((l: any) => l.id === data.lessonId))
      throw Object.assign(new Error('Save this lesson before uploading a video.'), { status: 400 });
    const id = randomUUID();
    await this.db.query(
      'INSERT INTO media_assets(id,owner_id,course_id,lesson_id,filename,mime,expected_size) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, user.id, data.courseId, data.lessonId, data.filename, data.mime, data.size],
    );
    return {
      assetId: id,
      uploadUrl: `/api/media/${id}/upload?token=${ticket({ assetId: id, userId: user.id, purpose: 'upload', expires: Date.now() + 15 * 60000 }, this.key)}`,
      maxBytes: maxUploadBytes,
    };
  }
  async status(req: Request) {
    const user = this.actor(req);
    const asset = await this.asset(String(req.params.id));
    if (asset.owner_id !== user.id) {
      await this.authorize(user, asset);
    }
    return this.safe(asset);
  }
  async authorize(user: Actor, asset: any) {
    const course = await this.catalog(user, asset.course_id);
    if (
      course.tutor_id !== user.id &&
      !course.lessons.some(
        (lesson: any) => lesson.id === asset.lesson_id && lesson.mediaId === asset.id,
      )
    )
      throw Object.assign(new Error('This video is not attached to your lesson.'), { status: 403 });
    return course;
  }
  async receive(req: Request) {
    const user = this.actor(req);
    const asset = await this.asset(String(req.params.id));
    verifyTicket(String(req.query.token || ''), this.key, 'upload', asset.id, user.id);
    if (asset.owner_id !== user.id)
      throw Object.assign(new Error('Video not found'), { status: 404 });
    await this.catalog(user, asset.course_id, true);
    if (req.header('content-type') !== asset.mime)
      throw Object.assign(new Error('Video type does not match the upload request.'), {
        status: 400,
      });
    const claim = await this.db.query(
      "UPDATE media_assets SET status='uploading' WHERE id=$1 AND status='pending' AND created_at>now()-interval '15 minutes' RETURNING id",
      [asset.id],
    );
    if (!claim.rowCount)
      throw Object.assign(new Error('Upload already used or expired. Start a new upload.'), {
        status: 409,
      });
    await this.storage.prepare();
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxUploadBytes || bytes > Number(asset.expected_size))
          callback(Object.assign(new Error('Video exceeds its declared size.'), { status: 413 }));
        else callback(null, chunk);
      },
    });
    try {
      await pipeline(
        req,
        counter,
        createWriteStream(this.storage.path(asset.id, 'partial'), { flags: 'wx', mode: 0o600 }),
      );
      if (bytes !== Number(asset.expected_size))
        throw Object.assign(new Error('Upload incomplete. Please try again.'), { status: 400 });
      await rename(this.storage.path(asset.id, 'partial'), this.storage.path(asset.id, 'original'));
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        await client.query("UPDATE media_assets SET status='processing' WHERE id=$1", [asset.id]);
        await enqueue(client, 'media.uploaded', { assetId: asset.id });
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return { id: asset.id, status: 'processing' };
    } catch (e) {
      await rm(this.storage.path(asset.id, 'partial'), { force: true });
      await this.db.query(
        "UPDATE media_assets SET status='failed',error='Upload failed. Start a new upload.' WHERE id=$1",
        [asset.id],
      );
      throw e;
    }
  }
  async playback(req: Request) {
    const user = this.actor(req);
    const asset = await this.asset(String(req.params.id));
    await this.authorize(user, asset);
    if (asset.status !== 'ready')
      throw Object.assign(new Error('Video is not ready for playback.'), { status: 409 });
    const expires = Date.now() + 10 * 60000;
    return {
      url: `/api/media/${asset.id}/stream?token=${ticket({ assetId: asset.id, userId: user.id, purpose: 'playback', expires }, this.key)}`,
      expiresAt: expires,
      duration: asset.duration,
    };
  }
  async stream(req: Request, res: Response) {
    const user = this.actor(req);
    const asset = await this.asset(String(req.params.id));
    verifyTicket(String(req.query.token || ''), this.key, 'playback', asset.id, user.id);
    await this.authorize(user, asset);
    if (asset.status !== 'ready')
      throw Object.assign(new Error('Video is not ready'), { status: 409 });
    const file = this.storage.path(asset.id, 'playback');
    const size = (await stat(file)).size;
    let range;
    try {
      range = byteRange(req.header('range'), size);
    } catch (error) {
      res.setHeader('Content-Range', `bytes */${size}`);
      throw error;
    }
    res.status(range.partial ? 206 : 200);
    res.set({
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(range.end - range.start + 1),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (range.partial) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    try {
      await pipeline(createReadStream(file, { start: range.start, end: range.end }), res);
    } catch (error) {
      if (!res.destroyed) throw error;
    }
  }
}
