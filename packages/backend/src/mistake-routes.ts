import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Actor } from './security.js';
import { finishExamAttempt } from './exam-routes.js';
import { collectMistakes, mistakeResolved } from './mistakes.js';
type Helpers = {
  actor: (req: Request) => Actor;
  call: (service: string, path: string, actor?: Actor) => Promise<any>;
  asyncRoute: (fn: (req: Request, res: Response) => Promise<unknown>) => RequestHandler;
};
export function registerMistakes(server: Express, db: Pool, { actor, call, asyncRoute }: Helpers) {
  async function collection(req: Request) {
    const user = actor(req),
      courseId = z.uuid().parse(req.params.id);
    if (
      !(
        await db.query('SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2', [
          user.id,
          courseId,
        ])
      ).rowCount
    )
      throw Object.assign(new Error('Enroll in this course to practice mistakes.'), {
        status: 403,
      });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const expired = await client.query(
        'SELECT * FROM exam_attempts WHERE user_id=$1 AND course_id=$2 AND result IS NULL AND expires_at<=now() FOR UPDATE',
        [user.id, courseId],
      );
      for (const row of expired.rows) await finishExamAttempt(client, row, new Date());
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const attempts = await db.query(
      'SELECT quiz,result,submitted_at FROM exam_attempts WHERE user_id=$1 AND course_id=$2 AND result IS NOT NULL',
      [user.id, courseId],
    );
    return { user, courseId, items: collectMistakes(attempts.rows) };
  }
  server.get(
    '/learning/:id/mistakes',
    asyncRoute(async (req, res) => {
      const { user, courseId, items } = await collection(req);
      const course = await call('catalog', `/courses/${courseId}/content`, user);
      const practice = (
        await db.query(
          'SELECT question_key,correct,practiced_at FROM mistake_practice WHERE user_id=$1 AND course_id=$2',
          [user.id, courseId],
        )
      ).rows;
      res.json({
        title: course.title,
        items: items.map((item) => {
          let lessonId = '';
          try {
            const parsed = JSON.parse(item.question.id);
            if (Array.isArray(parsed) && typeof parsed[0] === 'string') lessonId = parsed[0];
          } catch {
            lessonId =
              course.lessons.find((l: any) => item.question.id.startsWith(`${l.id}:`))?.id || '';
          }
          const section = course.sections.find((s: any) =>
            s.lessons.some((l: any) => l.id === lessonId),
          );
          const { correctOptionId, explanation, ...question } = item.question;
          return {
            key: item.key,
            question,
            missed: item.missed,
            unanswered: item.unanswered,
            lastMissedAt: item.lastMissedAt,
            sectionId: section?.id || 'earlier',
            sectionTitle: section?.title || 'Earlier curriculum',
            resolved: mistakeResolved(
              item,
              practice.find((p) => p.question_key === item.key),
            ),
          };
        }),
      });
    }),
  );
  server.post(
    '/learning/:id/mistakes/:key/practice',
    asyncRoute(async (req, res) => {
      const { user, courseId, items } = await collection(req);
      const key = z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(req.params.key),
        { optionId } = z.object({ optionId: z.string().min(1).max(100) }).parse(req.body);
      const item = items.find((i) => i.key === key);
      if (!item) throw Object.assign(new Error('Mistake not found.'), { status: 404 });
      if (!item.question.options.some((o) => o.id === optionId))
        throw Object.assign(new Error('Choose an available answer.'), { status: 400 });
      const correct = optionId === item.question.correctOptionId;
      await db.query(
        'INSERT INTO mistake_practice(user_id,course_id,question_key,correct,practiced_at) VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(user_id,course_id,question_key) DO UPDATE SET correct=$4,practiced_at=clock_timestamp()',
        [user.id, courseId, key, correct],
      );
      res.json({
        key,
        correct,
        correctOptionId: item.question.correctOptionId,
        explanation: item.question.explanation || '',
      });
    }),
  );
}
