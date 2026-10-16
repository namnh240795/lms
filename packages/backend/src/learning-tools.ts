import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Actor } from './security.js';
export const learningToolSchema = z.object({
  note: z.string().max(10000),
  bookmarked: z.boolean(),
});
type Helpers = {
  actor: (req: Request) => Actor;
  call: (service: string, path: string, actor?: Actor) => Promise<any>;
  asyncRoute: (fn: (req: Request, res: Response) => Promise<unknown>) => RequestHandler;
};
export function registerLearningTools(
  server: Express,
  db: Pool,
  { actor, call, asyncRoute }: Helpers,
) {
  async function access(req: Request) {
    const user = actor(req);
    const id = z.uuid().parse(req.params.id);
    const enrollment = await db.query(
      'SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2',
      [user.id, id],
    );
    if (!enrollment.rowCount)
      throw Object.assign(new Error('Enroll in this course to use learning tools.'), {
        status: 403,
      });
    const course = await call('catalog', `/courses/${id}/content`, user);
    return { user, course };
  }
  server.get(
    '/learning/dashboard',
    asyncRoute(async (req, res) => {
      const user = actor(req);
      const { rows: enrolled } = await db.query(
        'SELECT course_id FROM enrollments WHERE user_id=$1',
        [user.id],
      );
      const { rows: tools } = await db.query(
        "SELECT course_id,lesson_id,note,bookmarked,updated_at FROM lesson_tools WHERE user_id=$1 AND (trim(note)<>'' OR bookmarked=true) ORDER BY updated_at DESC",
        [user.id],
      );
      const { rows: activity } = await db.query(
        'SELECT course_id,lesson_id,updated_at FROM learning_activity WHERE user_id=$1 ORDER BY updated_at DESC',
        [user.id],
      );
      const saved: any[] = [];
      const visits: any[] = [];
      for (const entry of enrolled) {
        if (
          !tools.some((tool) => tool.course_id === entry.course_id) &&
          !activity.some((visit) => visit.course_id === entry.course_id)
        )
          continue;
        let course;
        try {
          course = await call('catalog', `/courses/${entry.course_id}/content`, user);
        } catch (error) {
          if ((error as any).status === 404) continue;
          throw error;
        }
        const enrich = (row: any) => {
          const lesson = course.lessons.find((lesson: any) => lesson.id === row.lesson_id);
          return lesson ? { ...row, course_title: course.title, lesson_title: lesson.title } : null;
        };
        saved.push(
          ...tools
            .filter((tool) => tool.course_id === course.id)
            .map(enrich)
            .filter(Boolean),
        );
        visits.push(
          ...activity
            .filter((visit) => visit.course_id === course.id)
            .map(enrich)
            .filter(Boolean),
        );
      }
      const recent = (a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      res.json({ saved: saved.sort(recent), visits: visits.sort(recent) });
    }),
  );
  server.post(
    '/learning/:id/activity/:lessonId',
    asyncRoute(async (req, res) => {
      const openedAt = new Date();
      const { user, course } = await access(req);
      const lessonId = z.string().min(1).max(100).parse(req.params.lessonId);
      if (!course.lessons.some((lesson: any) => lesson.id === lessonId))
        throw Object.assign(new Error('Lesson not found'), { status: 404 });
      await db.query(
        'INSERT INTO learning_activity(user_id,course_id,lesson_id,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,course_id) DO UPDATE SET lesson_id=EXCLUDED.lesson_id,updated_at=EXCLUDED.updated_at WHERE learning_activity.updated_at<=EXCLUDED.updated_at',
        [user.id, course.id, lessonId, openedAt],
      );
      res.json({ ok: true });
    }),
  );
  server.get(
    '/learning/:id/tools',
    asyncRoute(async (req, res) => {
      const { user, course } = await access(req);
      const { rows } = await db.query(
        'SELECT lesson_id, note, bookmarked, updated_at FROM lesson_tools WHERE user_id=$1 AND course_id=$2',
        [user.id, course.id],
      );
      res.json(
        rows.filter((row) => course.lessons.some((lesson: any) => lesson.id === row.lesson_id)),
      );
    }),
  );
  server.patch(
    '/learning/:id/tools/:lessonId',
    asyncRoute(async (req, res) => {
      const { user, course } = await access(req);
      const lessonId = z.string().min(1).max(100).parse(req.params.lessonId);
      if (!course.lessons.some((lesson: any) => lesson.id === lessonId))
        throw Object.assign(new Error('Lesson not found'), { status: 404 });
      const data = learningToolSchema
        .partial()
        .refine(
          (data) => data.note !== undefined || data.bookmarked !== undefined,
          'Choose a note or bookmark to update.',
        )
        .parse(req.body);
      const { rows } = await db.query(
        `INSERT INTO lesson_tools(user_id,course_id,lesson_id,note,bookmarked) VALUES($1,$2,$3,COALESCE($4,''),COALESCE($5,false)) ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET note=COALESCE($4,lesson_tools.note),bookmarked=COALESCE($5,lesson_tools.bookmarked),updated_at=now() RETURNING lesson_id,note,bookmarked,updated_at`,
        [user.id, course.id, lessonId, data.note ?? null, data.bookmarked ?? null],
      );
      res.json(rows[0]);
    }),
  );
}
