import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import type { Actor } from './security.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildExam, gradeExam } from './exams.js';
import { quizSchema, studentQuiz } from './quiz.js';
import { secret } from './config.js';
type Helpers = {
  actor: (req: Request) => Actor;
  call: (service: string, path: string, actor?: Actor) => Promise<any>;
  asyncRoute: (fn: (req: Request, res: Response) => Promise<unknown>) => RequestHandler;
};
export async function finishExamAttempt(client: PoolClient, row: any, now: Date, submit = false) {
  if (!row.result && (submit || now.getTime() >= new Date(row.expires_at).getTime())) {
    row.result = {
      ...gradeExam(row.quiz, row.answers),
      timedOut: now.getTime() >= new Date(row.expires_at).getTime(),
    };
    row.submitted_at = now.toISOString();
    await client.query('UPDATE exam_attempts SET result=$2,submitted_at=$3 WHERE id=$1', [
      row.id,
      JSON.stringify(row.result),
      now,
    ]);
  }
  return row;
}

export function registerExams(server: Express, db: Pool, { actor, call, asyncRoute }: Helpers) {
  async function access(req: Request) {
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
      throw Object.assign(new Error('Enroll in this course to take an exam.'), { status: 403 });
    return { user, courseId };
  }
  function publicAttempt(row: any, now: Date) {
    return {
      id: row.id,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      submittedAt: row.submitted_at,
      serverNow: now.toISOString(),
      answers: row.answers,
      result: row.result,
      quiz: studentQuiz(row.quiz, secret('INTERNAL_SECRET')),
    };
  }
  server.get(
    '/learning/:id/exams',
    asyncRoute(async (req, res) => {
      const { user, courseId } = await access(req);
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          'SELECT * FROM exam_attempts WHERE user_id=$1 AND course_id=$2 ORDER BY started_at DESC LIMIT 20 FOR UPDATE',
          [user.id, courseId],
        );
        const now = new Date();
        for (const row of rows) await finishExamAttempt(client, row, now);
        await client.query('COMMIT');
        res.json(
          rows.map((row) => ({
            id: row.id,
            startedAt: row.started_at,
            expiresAt: row.expires_at,
            submittedAt: row.submitted_at,
            score: row.result?.score,
            passed: row.result?.passed,
            correct: row.result?.correct,
            total: row.quiz.questions.length,
            active: !row.result,
          })),
        );
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }),
  );
  server.post(
    '/learning/:id/exams',
    asyncRoute(async (req, res) => {
      const { user, courseId } = await access(req);
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        // Serialize starts across tabs; a student can only have one active exam per course.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${user.id}:${courseId}`,
        ]);
        let row = (
          await client.query(
            'SELECT * FROM exam_attempts WHERE user_id=$1 AND course_id=$2 AND result IS NULL FOR UPDATE',
            [user.id, courseId],
          )
        ).rows[0];
        let now = new Date();
        if (row) await finishExamAttempt(client, row, now);
        if (!row || row.result) {
          const course = await call('catalog', `/courses/${courseId}/content`, user);
          const quizzes = [];
          for (const lesson of course.lessons.filter((l: any) => l.quiz))
            quizzes.push({
              lessonId: lesson.id,
              quiz: quizSchema.parse(
                await call(
                  'catalog',
                  `/courses/${courseId}/assessment/${encodeURIComponent(lesson.id)}`,
                  user,
                ),
              ),
            });
          const quiz = buildExam(quizzes);
          now = new Date();
          row = (
            await client.query(
              "INSERT INTO exam_attempts(id,user_id,course_id,quiz,started_at,expires_at) VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '20 minutes') RETURNING *",
              [randomUUID(), user.id, courseId, JSON.stringify(quiz), now],
            )
          ).rows[0];
        }
        await client.query('COMMIT');
        res.status(201).json(publicAttempt(row, now));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }),
  );
  async function update(req: Request, res: Response, mode: 'read' | 'answer' | 'submit') {
    const { user, courseId } = await access(req),
      id = z.uuid().parse(req.params.attemptId);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const row = (
        await client.query(
          'SELECT * FROM exam_attempts WHERE id=$1 AND user_id=$2 AND course_id=$3 FOR UPDATE',
          [id, user.id, courseId],
        )
      ).rows[0];
      if (!row) throw Object.assign(new Error('Exam not found.'), { status: 404 });
      const now = new Date();
      await finishExamAttempt(client, row, now);
      if (!row.result && mode === 'answer') {
        const { questionId, optionId } = z
          .object({ questionId: z.string().max(1500), optionId: z.string().max(100) })
          .parse(req.body);
        const question = row.quiz.questions.find((q: any) => q.id === questionId);
        if (!question?.options.some((o: any) => o.id === optionId))
          throw Object.assign(new Error('Invalid exam answer.'), { status: 400 });
        row.answers[questionId] = optionId;
        await client.query('UPDATE exam_attempts SET answers=$2 WHERE id=$1', [
          id,
          JSON.stringify(row.answers),
        ]);
      }
      if (mode === 'submit') await finishExamAttempt(client, row, now, true);
      await client.query('COMMIT');
      res.json(publicAttempt(row, now));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  server.get(
    '/learning/:id/exams/:attemptId',
    asyncRoute((req, res) => update(req, res, 'read')),
  );
  server.patch(
    '/learning/:id/exams/:attemptId',
    asyncRoute((req, res) => update(req, res, 'answer')),
  );
  server.post(
    '/learning/:id/exams/:attemptId/submit',
    asyncRoute((req, res) => update(req, res, 'submit')),
  );
}
