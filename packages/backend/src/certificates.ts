import { fileURLToPath } from 'node:url';
import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import type { Actor } from './security.js';
type Lesson = { id: string; quiz?: { revision?: string } | null };
export function eligibleForCertificate(
  lessons: Lesson[],
  completed: string[],
  passes: { lesson_id: string; revision: string }[],
) {
  return (
    lessons.length > 0 &&
    lessons.every(
      (lesson) =>
        completed.includes(lesson.id) &&
        (!lesson.quiz ||
          (lesson.quiz.revision &&
            passes.some(
              (pass) => pass.lesson_id === lesson.id && pass.revision === lesson.quiz?.revision,
            ))),
    )
  );
}
export function curriculumFingerprint(lessons: Lesson[]) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        lessons
          .map((lesson) => ({ id: lesson.id, quiz: lesson.quiz?.revision || null }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ),
    )
    .digest('hex');
}
export type CompletionCertificate = {
  id: string;
  learner_name: string;
  course_title: string;
  tutor_name: string;
  issued_at: string;
  lesson_count: number;
};
export async function certificatePdf(certificate: CompletionCertificate) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont(
    'NotoSans',
    fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url)),
  );
  const width = doc.page.width,
    height = doc.page.height;
  const left = 56,
    right = width - 56,
    contentWidth = width - 112;
  doc.rect(0, 0, width, height).fill('#fffdf7');
  doc
    .rect(24, 24, width - 48, height - 48)
    .lineWidth(0.7)
    .stroke('#d9d9ca');
  doc.rect(24, 24, 4, height - 48).fill('#a94131');
  doc.fillColor('#a94131').font('Helvetica-Bold').fontSize(22).text('learnly.', left, 50);
  doc.circle(right - 23, 66, 22).fillAndStroke('#f0f2e7', '#b7bf9e');
  doc
    .moveTo(right - 31, 66)
    .lineTo(right - 24, 73)
    .lineTo(right - 14, 59)
    .lineWidth(2)
    .stroke('#778461');
  const center = (
    text: string,
    y: number,
    size: number,
    font = 'NotoSans',
    color = '#252c22',
    boxHeight = 50,
  ) => {
    doc.font(font).fontSize(size);
    while (size > 10 && doc.heightOfString(text, { width: contentWidth - 48 }) > boxHeight) {
      size -= 1;
      doc.fontSize(size);
    }
    doc
      .fillColor(color)
      .text(text, left + 24, y, { width: contentWidth - 48, align: 'center', height: boxHeight });
  };
  center('A LEARNING MILESTONE', 103, 9, 'Helvetica', '#778168', 18);
  center('Certificate of Completion', 124, 32, 'Times-Roman', '#252c22', 44);
  center('Presented to', 188, 11, 'Helvetica', '#697060', 18);
  center(certificate.learner_name, 214, 34, 'NotoSans', '#252c22', 62);
  doc
    .moveTo(left + 80, 286)
    .lineTo(right - 80, 286)
    .lineWidth(0.7)
    .stroke('#d9d9ca');
  center('For completing all lessons and required quizzes in', 307, 11, 'Helvetica', '#697060', 18);
  center(certificate.course_title, 336, 23, 'NotoSans', '#252c22', 66);
  doc.moveTo(left, 427).lineTo(right, 427).stroke('#d9d9ca');
  const date = new Date(certificate.issued_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const columns = [
    ['ISSUED ON', date],
    ['COURSE TUTOR', certificate.tutor_name],
    [
      'ACHIEVEMENT',
      `${certificate.lesson_count} ${certificate.lesson_count === 1 ? 'lesson' : 'lessons'} completed`,
    ],
  ];
  const columnWidth = contentWidth / 3;
  columns.forEach(([label, value], index) => {
    const x = left + index * columnWidth;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#778168')
      .text(label, x, 448, { width: columnWidth, align: 'center' });
    doc.font('NotoSans').fontSize(11);
    let size = 11;
    while (size > 7 && doc.heightOfString(value, { width: columnWidth - 20 }) > 42) {
      doc.fontSize(--size);
    }
    doc
      .fillColor('#252c22')
      .text(value, x + 10, 468, { width: columnWidth - 20, align: 'center', height: 42 });
  });
  center(`Certificate ID: ${certificate.id}`, 523, 8, 'Helvetica', '#7b826f', 14);
  center(
    'Issued by Learnly for course completion. This is not an accredited qualification.',
    543,
    8,
    'Helvetica',
    '#7b826f',
    14,
  );
  doc.end();
  return finished;
}
type Helpers = {
  actor: (req: Request) => Actor;
  call: (service: string, path: string, actor?: Actor) => Promise<any>;
  asyncRoute: (fn: (req: Request, res: Response) => Promise<unknown>) => RequestHandler;
};
export function registerCertificates(
  server: Express,
  db: Pool,
  { actor, call, asyncRoute }: Helpers,
) {
  server.post(
    '/learning/:id/certificate',
    asyncRoute(async (req, res) => {
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
        throw Object.assign(new Error('Enroll in this course to earn a certificate.'), {
          status: 403,
        });
      const course = await call('catalog', `/courses/${courseId}/content`, user);
      const progress = await db.query(
        'SELECT lesson_id FROM progress WHERE user_id=$1 AND course_id=$2',
        [user.id, courseId],
      );
      const passes = await db.query(
        'SELECT lesson_id,revision FROM quiz_attempts WHERE user_id=$1 AND course_id=$2 AND passed=true',
        [user.id, courseId],
      );
      if (
        !eligibleForCertificate(
          course.lessons,
          progress.rows.map((row) => row.lesson_id),
          passes.rows,
        )
      )
        throw Object.assign(
          new Error(
            'Complete every current lesson and pass its required quiz before claiming a certificate.',
          ),
          { status: 409 },
        );
      const fingerprint = curriculumFingerprint(course.lessons);
      const { rows } = await db.query(
        'INSERT INTO completion_certificates(id,user_id,course_id,curriculum,learner_name,course_title,tutor_name,lesson_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,course_id,curriculum) DO UPDATE SET id=completion_certificates.id RETURNING id,learner_name,course_title,tutor_name,lesson_count,issued_at',
        [
          randomUUID(),
          user.id,
          course.id,
          fingerprint,
          user.name,
          course.title,
          course.tutor_name,
          course.lessons.length,
        ],
      );
      const certificate = rows[0];
      res.json({ ...certificate, pdf: (await certificatePdf(certificate)).toString('base64') });
    }),
  );
}
