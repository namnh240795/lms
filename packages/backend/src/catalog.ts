import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { studentQuiz } from './quiz.js';
import { secret } from './config.js';
import { z } from 'zod';
import type { Actor } from './security.js';
import { courseSchema, normalizeCourse, publicCourse, publishProblems } from './curriculum.js';
type Helpers = {
  actor: (req: Request) => Actor;
  call: (service: string, path: string, actor?: Actor) => Promise<any>;
  asyncRoute: (fn: (req: Request, res: Response) => Promise<unknown>) => RequestHandler;
};
export function registerCatalog(server: Express, db: Pool, { actor, call, asyncRoute }: Helpers) {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const cacheKey = 'catalog:published:v2';
  async function validateVideos(
    sections: import('./curriculum.js').Section[],
    user: Actor,
    courseId: string,
  ) {
    for (const lesson of sections.flatMap((s) => s.lessons))
      if (lesson.mediaId) {
        const asset = await call('media', `/media/${lesson.mediaId}`, user);
        if (asset.status !== 'ready' || asset.courseId !== courseId || asset.lessonId !== lesson.id)
          throw Object.assign(new Error('Choose a ready video uploaded for this lesson.'), {
            status: 400,
          });
      }
  }
  async function owned(req: Request) {
    const user = actor(req);
    const course = (
      await db.query('SELECT * FROM courses WHERE id=$1 AND tutor_id=$2', [
        z.uuid().parse(req.params.id),
        user.id,
      ])
    ).rows[0];
    if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });
    return normalizeCourse(course);
  }
  server.get(
    '/courses',
    asyncRoute(async (_req, res) => {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
      const { rows } = await db.query(
        'SELECT * FROM courses WHERE published=true ORDER BY created_at',
      );
      const courses = rows.map(publicCourse);
      await redis.set(cacheKey, JSON.stringify(courses), 'EX', 30);
      res.json(courses);
    }),
  );
  server.get(
    '/courses/mine',
    asyncRoute(async (req, res) => {
      res.json(
        (
          await db.query('SELECT * FROM courses WHERE tutor_id=$1 ORDER BY created_at DESC', [
            actor(req).id,
          ])
        ).rows.map(normalizeCourse),
      );
    }),
  );
  server.get(
    '/courses/:id/edit',
    asyncRoute(async (req, res) => res.json(await owned(req))),
  );
  server.get(
    '/courses/:id',
    asyncRoute(async (req, res) => {
      const course = (
        await db.query('SELECT * FROM courses WHERE id=$1', [z.uuid().parse(req.params.id)])
      ).rows[0];
      let owner = false;
      try {
        owner = course?.tutor_id === actor(req).id;
      } catch {}
      if (!course || (!course.published && !owner)) {
        res.status(404).json({ message: 'Course not found' });
        return;
      }
      res.json(publicCourse(course));
    }),
  );
  server.get(
    '/courses/:id/content',
    asyncRoute(async (req, res) => {
      const user = actor(req);
      const id = z.uuid().parse(req.params.id);
      const course = (await db.query('SELECT * FROM courses WHERE id=$1', [id])).rows[0];
      if (!course) {
        res.status(404).json({ message: 'Course not found' });
        return;
      }
      if (course.tutor_id !== user.id) {
        const access = await call('learning', `/learning/access/${id}`, user);
        if (!access.enrolled) {
          res.status(403).json({ message: 'Enroll to access this course' });
          return;
        }
      }
      const content = normalizeCourse(course);
      const sections = content.sections.map((section: import('./curriculum.js').Section) => ({
        ...section,
        lessons: section.lessons.map((lesson) => ({
          ...lesson,
          quiz: lesson.quiz ? studentQuiz(lesson.quiz, secret('INTERNAL_SECRET')) : null,
        })),
      }));
      res.json({
        ...content,
        sections,
        lessons: sections.flatMap((section: any) => section.lessons),
      });
    }),
  );
  server.get(
    '/courses/:id/assessment/:lessonId',
    asyncRoute(async (req, res) => {
      const user = actor(req);
      if (user.service !== 'learning')
        throw Object.assign(new Error('Assessment keys are private.'), { status: 403 });
      const id = z.uuid().parse(req.params.id);
      const course = (await db.query('SELECT * FROM courses WHERE id=$1', [id])).rows[0];
      if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });
      const access = await call('learning', `/learning/access/${id}`, user);
      if (!access.enrolled)
        throw Object.assign(new Error('Enroll to take this quiz.'), { status: 403 });
      const lesson = normalizeCourse(course).lessons.find(
        (item: any) => item.id === req.params.lessonId,
      );
      if (!lesson?.quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });
      res.json(lesson.quiz);
    }),
  );
  server.post(
    '/courses',
    asyncRoute(async (req, res) => {
      const user = actor(req);
      if (user.role !== 'tutor') {
        res.status(403).json({ message: 'Switch to tutor to create a course' });
        return;
      }
      const data = courseSchema.parse(req.body);
      const id = randomUUID();
      await validateVideos(data.sections, user, id);
      const result = await db.query(
        'INSERT INTO courses(id,tutor_id,title,description,category,price,tutor_name,lessons,sections,thumbnail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [
          id,
          user.id,
          data.title,
          data.description,
          data.category,
          data.price,
          user.name,
          JSON.stringify(data.sections.flatMap((s) => s.lessons)),
          JSON.stringify(data.sections),
          data.thumbnail ?? null,
        ],
      );
      res.status(201).json(normalizeCourse(result.rows[0]));
    }),
  );
  server.put(
    '/courses/:id',
    asyncRoute(async (req, res) => {
      const course = await owned(req);
      const data = courseSchema.parse(req.body);
      if (!data.version) {
        res.status(400).json({ message: 'The course version is required. Reload the editor.' });
        return;
      }
      await validateVideos(data.sections, actor(req), course.id);
      if (course.published) {
        const issues = publishProblems(data.sections);
        if (issues.length) {
          res.status(400).json({ message: issues[0] });
          return;
        }
      }
      const result = await db.query(
        'UPDATE courses SET title=$1,description=$2,category=$3,price=$4,sections=$5,lessons=$6,thumbnail=$7,version=version+1 WHERE id=$8 AND tutor_id=$9 AND version=$10 RETURNING *',
        [
          data.title,
          data.description,
          data.category,
          data.price,
          JSON.stringify(data.sections),
          JSON.stringify(data.sections.flatMap((s) => s.lessons)),
          data.thumbnail ?? null,
          course.id,
          actor(req).id,
          data.version,
        ],
      );
      if (!result.rowCount) {
        res.status(409).json({
          message:
            'This course changed in another window. Reopen the editor to get the latest version.',
        });
        return;
      }
      await redis.del(cacheKey);
      res.json(normalizeCourse(result.rows[0]));
    }),
  );
  server.post(
    '/courses/:id/publish',
    asyncRoute(async (req, res) => {
      const course = await owned(req);
      const published = z.boolean().parse(req.body.published);
      if (published) {
        const issues = publishProblems(course.sections);
        if (issues.length) {
          res.status(400).json({ message: issues[0] });
          return;
        }
      }
      const result = await db.query(
        'UPDATE courses SET published=$1,version=version+1 WHERE id=$2 AND tutor_id=$3 AND version=$4 RETURNING *',
        [published, course.id, actor(req).id, course.version],
      );
      if (!result.rowCount) {
        res.status(409).json({ message: 'The course changed. Refresh before publishing.' });
        return;
      }
      await redis.del(cacheKey);
      res.json(normalizeCourse(result.rows[0]));
    }),
  );
}
