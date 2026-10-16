import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { Actor } from './security.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { secret } from './config.js';
import { gradeQuiz, quizSchema, quizRevision } from './quiz.js';
type Helpers = {
  actor: (req: Request) => Actor;
  call: (service: string, path: string, actor?: Actor) => Promise<any>;
  asyncRoute: (fn: (req: Request, res: Response) => Promise<unknown>) => RequestHandler;
};
export function registerQuizzes(server: Express, db: Pool, { actor, call, asyncRoute }: Helpers) {
  async function enrolled(req: Request) {
    const user = actor(req);
    const courseId = z.uuid().parse(req.params.id);
    const lessonId = z.string().max(100).parse(req.params.lessonId);
    if (
      !(
        await db.query('SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2', [
          user.id,
          courseId,
        ])
      ).rowCount
    )
      throw Object.assign(new Error('Enroll to take this quiz.'), { status: 403 });
    const course = await call('catalog', `/courses/${courseId}/content`, user);
    if (!course.lessons.some((lesson: any) => lesson.id === lessonId && lesson.quiz))
      throw Object.assign(new Error('Quiz not found'), { status: 404 });
    return { user, courseId, lessonId, course };
  }
  server.get(
    '/learning/:id/quiz/:lessonId/attempts',
    asyncRoute(async (req, res) => {
      const { user, courseId, lessonId } = await enrolled(req);
      res.json(
        (
          await db.query(
            'SELECT id,revision,score,passed,result,created_at FROM quiz_attempts WHERE user_id=$1 AND course_id=$2 AND lesson_id=$3 ORDER BY created_at DESC LIMIT 20',
            [user.id, courseId, lessonId],
          )
        ).rows,
      );
    }),
  );
  server.post(
    '/learning/:id/quiz/:lessonId/attempts',
    asyncRoute(async (req, res) => {
      const { user, courseId, lessonId } = await enrolled(req);
      const { revision, answers } = z
        .object({
          revision: z.string().length(64),
          answers: z.record(z.string().max(100), z.string().max(100)),
        })
        .parse(req.body);
      const quiz = quizSchema.parse(
        await call(
          'catalog',
          `/courses/${courseId}/assessment/${encodeURIComponent(lessonId)}`,
          user,
        ),
      );
      const current = quizRevision(quiz, secret('INTERNAL_SECRET'));
      if (revision !== current)
        throw Object.assign(
          new Error('Your tutor updated this quiz. Reopen the course before trying again.'),
          { status: 409 },
        );
      const result = gradeQuiz(quiz, answers);
      const id = randomUUID();
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO quiz_attempts(id,user_id,course_id,lesson_id,revision,score,passed,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            user.id,
            courseId,
            lessonId,
            current,
            result.score,
            result.passed,
            JSON.stringify(result),
          ],
        );
        if (result.passed)
          await client.query(
            'INSERT INTO progress(user_id,course_id,lesson_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [user.id, courseId, lessonId],
          );
        await client.query('COMMIT');
        res.status(201).json({ id, revision: current, ...result });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }),
  );
}
