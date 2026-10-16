import { registerCertificates } from './certificates.js';
import 'reflect-metadata';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type Request, type Response, type NextFunction } from 'express';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, ports, origin, secret } from './config.js';
import { readActor, signActor, type Actor } from './security.js';
import { startEvents, enqueue } from './events.js';
import { registerLearningTools } from './learning-tools.js';
import { registerMistakes } from './mistake-routes.js';
import { registerExams } from './exam-routes.js';
import { registerQuizzes } from './quiz-routes.js';
import { registerCatalog } from './catalog.js';
import { MockPaymentProvider } from './payment-provider.js';
@Module({})
class ServiceModule {}
const name = process.argv[2];
if (!ports[name]) throw new Error('Pass a valid service name');
const app = await NestFactory.create(ServiceModule, { bodyParser: false });
const server = app.getHttpAdapter().getInstance();
const internalKey = secret('INTERNAL_SECRET');
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
server.get('/health', (_req: Request, res: Response) => res.json({ service: name, status: 'ok' }));
async function call(service: string, path: string, actor?: Actor, method = 'GET', body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${ports[service]}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(actor ? { 'x-internal-token': signActor({ ...actor, service: name }, internalKey) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.message || 'Service request failed'), {
      status: response.status,
    });
  return data;
}
function actor(req: Request) {
  try {
    return readActor(req.header('x-internal-token') || '', internalKey);
  } catch {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }
}
if (name === 'identity') {
  const { auth } = await import('./auth.js');
  server.all('/api/auth/*splat', toNodeHandler(auth));
  server.use(express.json());
  server.post(
    '/role',
    asyncRoute(async (req, res) => {
      const user = actor(req);
      await auth.options.database!.query('UPDATE "user" SET role=$1 WHERE id=$2', [
        z.enum(['student', 'tutor']).parse(req.body.role),
        user.id,
      ]);
      res.json({ ok: true });
    }),
  );
} else if (name === 'gateway') {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  server.all(
    '/api/auth/*splat',
    asyncRoute(async (req, res) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value && !['host', 'connection', 'content-length'].includes(key))
          headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const response = await fetch(`http://127.0.0.1:4101${req.originalUrl}`, {
        method: req.method,
        headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : ({ body: req, duplex: 'half' } as any)),
        redirect: 'manual',
      });
      res.status(response.status);
      for (const [key, value] of response.headers)
        if (
          !['set-cookie', 'transfer-encoding', 'content-encoding', 'content-length'].includes(key)
        )
          res.setHeader(key, value);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.send(Buffer.from(await response.arrayBuffer()));
    }),
  );
  server.use(
    '/api/media',
    asyncRoute(async (req, res) => {
      if (!['GET', 'HEAD'].includes(req.method) && req.header('origin') !== origin) {
        res.status(403).json({ message: 'Invalid request origin' });
        return;
      }
      const session = await fetch('http://127.0.0.1:4101/api/auth/get-session', {
        headers: { cookie: req.headers.cookie || '' },
      }).then((r) => r.json());
      if (!session?.user) {
        res.status(401).json({ message: 'Please sign in to continue.' });
        return;
      }
      const user = {
        id: session.user.id,
        role: session.user.role || 'student',
        name: session.user.name,
      };
      const headers: Record<string, string> = { 'x-internal-token': signActor(user, internalKey) };
      for (const key of ['content-type', 'content-length', 'range'])
        if (req.header(key)) headers[key] = req.header(key)!;
      const response = await fetch(
        `http://127.0.0.1:${ports.media}${req.originalUrl.replace(/^\/api/, '')}`,
        {
          method: req.method,
          headers,
          ...(['GET', 'HEAD'].includes(req.method) ? {} : ({ body: req, duplex: 'half' } as any)),
        },
      );
      res.status(response.status);
      for (const key of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'x-content-type-options',
      ])
        if (response.headers.has(key)) res.setHeader(key, response.headers.get(key)!);
      if (response.body) {
        try {
          await pipeline(Readable.fromWeb(response.body as any), res);
        } catch (error) {
          if (!res.destroyed) throw error;
        }
      } else res.end();
    }),
  );
  server.use(express.json({ limit: '1mb' }));
  server.use(
    '/api',
    asyncRoute(async (req, res) => {
      if (!['GET', 'HEAD'].includes(req.method) && req.header('origin') !== origin) {
        res.status(403).json({ message: 'Invalid request origin' });
        return;
      }
      const key = `limit:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 60);
      if (count > 120) {
        res.status(429).json({ message: 'Too many requests. Try again shortly.' });
        return;
      }
      const path = req.path;
      const target = path.startsWith('/courses')
        ? 'catalog'
        : path.startsWith('/learning')
          ? 'learning'
          : path.startsWith('/orders')
            ? 'orders'
            : path === '/role'
              ? 'identity'
              : null;
      if (!target) {
        res.status(404).json({ message: 'Route not found' });
        return;
      }
      let user: Actor | undefined;
      const session = await fetch('http://127.0.0.1:4101/api/auth/get-session', {
        headers: { cookie: req.headers.cookie || '' },
      }).then((r) => r.json());
      if (session?.user)
        user = {
          id: session.user.id,
          role: session.user.role || 'student',
          name: session.user.name,
        };
      if (!(target === 'catalog' && req.method === 'GET' && !path.includes('/mine')) && !user) {
        res.status(401).json({ message: 'Please sign in to continue.' });
        return;
      }
      res.json(
        await call(
          target,
          path + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : ''),
          user,
          req.method,
          ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
        ),
      );
    }),
  );
} else {
  server.use(express.json({ limit: '1mb' }));
  const db = database(name);
  if (name === 'catalog') registerCatalog(server, db, { actor, call, asyncRoute });
  if (name === 'learning') {
    registerCertificates(server, db, { actor, call, asyncRoute });
    registerQuizzes(server, db, { actor, call, asyncRoute });
    registerExams(server, db, { actor, call, asyncRoute });
    registerMistakes(server, db, { actor, call, asyncRoute });
    registerLearningTools(server, db, { actor, call, asyncRoute });
  }
  if (name === 'learning') {
    await startEvents(db, name, ['order.paid'], async (client, event) => {
      await client.query(
        'INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [event.payload.userId, event.payload.courseId],
      );
    });
    server.get(
      '/learning',
      asyncRoute(async (req, res) => {
        const user = actor(req);
        const rows = (
          await db.query(
            "SELECT e.course_id, COALESCE(json_agg(p.lesson_id) FILTER (WHERE p.lesson_id IS NOT NULL),'[]') AS completed FROM enrollments e LEFT JOIN progress p ON p.user_id=e.user_id AND p.course_id=e.course_id WHERE e.user_id=$1 GROUP BY e.course_id",
            [user.id],
          )
        ).rows;
        for (const row of rows) {
          const course = await call('catalog', `/courses/${row.course_id}/content`, user);
          const passed = (
            await db.query(
              'SELECT lesson_id,revision FROM quiz_attempts WHERE user_id=$1 AND course_id=$2 AND passed=true',
              [user.id, row.course_id],
            )
          ).rows;
          row.completed = row.completed.filter((id: string) => {
            const lesson = course.lessons.find((l: any) => l.id === id);
            return (
              lesson &&
              (!lesson.quiz ||
                passed.some((p) => p.lesson_id === id && p.revision === lesson.quiz.revision))
            );
          });
        }
        res.json(rows);
      }),
    );
    server.get(
      '/learning/access/:id',
      asyncRoute(async (req, res) => {
        res.json({
          enrolled: !!(
            await db.query('SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2', [
              actor(req).id,
              z.uuid().parse(req.params.id),
            ])
          ).rowCount,
        });
      }),
    );
    server.post(
      '/learning/:id/progress',
      asyncRoute(async (req, res) => {
        const user = actor(req);
        const course = await call(
          'catalog',
          `/courses/${z.uuid().parse(req.params.id)}/content`,
          user,
        );
        const lesson = z.string().parse(req.body.lessonId);
        const current = course.lessons.find((item: any) => item.id === lesson);
        if (current?.quiz) {
          const pass = await db.query(
            'SELECT 1 FROM quiz_attempts WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3 AND revision=$4 AND passed=true',
            [user.id, course.id, lesson, current.quiz.revision],
          );
          if (!pass.rowCount)
            throw Object.assign(new Error('Pass the quiz before completing this lesson.'), {
              status: 403,
            });
        }
        if (!course.lessons.some((l: any) => l.id === lesson)) {
          res.status(400).json({ message: 'Unknown lesson' });
          return;
        }
        await db.query(
          'INSERT INTO progress(user_id,course_id,lesson_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [user.id, course.id, lesson],
        );
        res.json({ ok: true });
      }),
    );
  }
  if (name === 'learning') {
    server.get(
      '/learning/:id/position/:lessonId',
      asyncRoute(async (req, res) => {
        const user = actor(req);
        await call('catalog', `/courses/${z.uuid().parse(req.params.id)}/content`, user);
        const result = await db.query(
          'SELECT position FROM playback_positions WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3',
          [user.id, req.params.id, req.params.lessonId],
        );
        res.json({ position: result.rows[0]?.position || 0 });
      }),
    );
    server.put(
      '/learning/:id/position/:lessonId',
      asyncRoute(async (req, res) => {
        const user = actor(req);
        const course = await call(
          'catalog',
          `/courses/${z.uuid().parse(req.params.id)}/content`,
          user,
        );
        if (!course.lessons.some((lesson: any) => lesson.id === req.params.lessonId))
          throw Object.assign(new Error('Lesson not found'), { status: 404 });
        const position = z
          .number()
          .min(0)
          .max(4 * 3600)
          .parse(req.body.position);
        await db.query(
          'INSERT INTO playback_positions(user_id,course_id,lesson_id,position) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET position=EXCLUDED.position',
          [user.id, req.params.id, req.params.lessonId, position],
        );
        res.json({ ok: true });
      }),
    );
  }
  if (name === 'orders') {
    await startEvents(db, name, ['payment.succeeded', 'payment.failed'], async (client, event) => {
      const paid = event.topic === 'payment.succeeded';
      const result = await client.query(
        "UPDATE orders SET status=$1 WHERE id=$2 AND status='pending' RETURNING *",
        [paid ? 'paid' : 'failed', event.payload.orderId],
      );
      if (paid && result.rowCount) {
        const order = result.rows[0];
        await enqueue(client, 'order.paid', {
          orderId: order.id,
          userId: order.user_id,
          courseId: order.course_id,
        });
      }
    });
    server.get(
      '/orders',
      asyncRoute(async (req, res) =>
        res.json(
          (
            await db.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [
              actor(req).id,
            ])
          ).rows,
        ),
      ),
    );
    server.post(
      '/orders',
      asyncRoute(async (req, res) => {
        const user = actor(req);
        const data = z
          .object({
            courseId: z.uuid(),
            outcome: z.enum(['success', 'failure']).default('success'),
          })
          .parse(req.body);
        const course = await call('catalog', `/courses/${data.courseId}`, user);
        if (!course.published) {
          res.status(400).json({ message: 'Course is not published' });
          return;
        }
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const existing = await client.query(
            "SELECT * FROM orders WHERE user_id=$1 AND course_id=$2 AND status IN ('pending','paid')",
            [user.id, course.id],
          );
          if (existing.rowCount) {
            await client.query('COMMIT');
            res.json(existing.rows[0]);
            return;
          }
          const id = randomUUID();
          const order = (
            await client.query(
              'INSERT INTO orders(id,user_id,course_id,title,amount) VALUES($1,$2,$3,$4,$5) RETURNING *',
              [id, user.id, course.id, course.title, course.price],
            )
          ).rows[0];
          await enqueue(client, 'order.created', {
            orderId: id,
            amount: course.price,
            outcome: data.outcome,
          });
          await client.query('COMMIT');
          res.status(201).json(order);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }),
    );
  }
  if (name === 'payments')
    await startEvents(db, name, ['order.created'], async (client, event) => {
      const { orderId, amount, outcome } = event.payload;
      const { status } = await new MockPaymentProvider().charge({ orderId, amount, outcome });
      await client.query(
        'INSERT INTO payments(order_id,amount,status) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [orderId, amount, status],
      );
      await enqueue(client, `payment.${status}`, { orderId });
    });
}
server.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error.message);
  const status =
    error instanceof z.ZodError ? 400 : error.status || (error.code === '23505' ? 409 : 500);
  res.status(status).json({
    message:
      status === 500
        ? 'Service unavailable. Please try again.'
        : error instanceof z.ZodError
          ? error.issues[0].message
          : error.code === '23505'
            ? 'This purchase is already being processed.'
            : error.message,
  });
});
await app.listen(ports[name], '127.0.0.1');
console.log(`${name} listening at http://localhost:${ports[name]}`);
