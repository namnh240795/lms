import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleForCertificate, curriculumFingerprint, certificatePdf } from './certificates.js';
test('certificates require every current lesson and the current quiz revision', () => {
  const lessons = [{ id: 'text' }, { id: 'quiz', quiz: { revision: 'v2' } }];
  assert.equal(eligibleForCertificate([], [], []), false);
  assert.equal(eligibleForCertificate(lessons, ['text'], []), false);
  assert.equal(
    eligibleForCertificate(lessons, ['text', 'quiz'], [{ lesson_id: 'quiz', revision: 'v1' }]),
    false,
  );
  assert.equal(
    eligibleForCertificate(
      lessons,
      ['text', 'quiz', 'deleted'],
      [{ lesson_id: 'quiz', revision: 'v2' }],
    ),
    true,
  );
  assert.equal(
    eligibleForCertificate(
      [...lessons, { id: 'new' }],
      ['text', 'quiz'],
      [{ lesson_id: 'quiz', revision: 'v2' }],
    ),
    false,
  );
});
test('certificate identity survives reordering but changes when required lessons or quizzes change', () => {
  const lessons = [{ id: 'first' }, { id: 'quiz', quiz: { revision: 'v1' } }];
  assert.equal(curriculumFingerprint(lessons), curriculumFingerprint([...lessons].reverse()));
  assert.notEqual(
    curriculumFingerprint(lessons),
    curriculumFingerprint([{ id: 'first' }, { id: 'quiz', quiz: { revision: 'v2' } }]),
  );
});
test('certificate PDF uses a single landscape page and embeds its learner font', async () => {
  const pdf = await certificatePdf({
    id: '11111111-1111-4111-8111-111111111111',
    learner_name: 'Nguyễn Minh Anh',
    course_title: 'Thiết kế giao diện React',
    tutor_name: 'Trần Hà',
    issued_at: '2026-10-14T00:00:00Z',
    lesson_count: 12,
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
  assert.ok(pdf.toString('latin1').includes('/FontFile2'));
});
