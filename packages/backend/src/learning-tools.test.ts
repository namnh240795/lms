import test from 'node:test';
import assert from 'node:assert/strict';
import { captionsSchema, validWebVtt } from './captions.js';
import { learningToolSchema } from './learning-tools.js';
import { publicCourse } from './curriculum.js';
const vtt = 'WEBVTT\n\n00:00.000 --> 00:03.000\nWelcome to the lesson.\n';
test('caption validation accepts timed text and rejects malformed or unsafe cues', () => {
  assert.ok(validWebVtt(vtt));
  assert.ok(
    validWebVtt(vtt.replace('00:00.000', '00:00:00.000').replace('00:03.000', '00:00:03.000')),
  );
  for (const invalid of [
    vtt.replace('00:03.000', '00:00.000'),
    vtt.replace('00:03.000', '99:99.000'),
    vtt.replace('Welcome', '<script>Welcome</script>'),
    vtt.replace('WEBVTT', 'SRT'),
    'WEBVTT\n\n',
  ])
    assert.equal(validWebVtt(invalid), false);
  assert.equal(
    captionsSchema.safeParse({ label: 'English', language: 'english!', vtt }).success,
    false,
  );
});
test('personal notes have a bounded size and captions stay out of public metadata', () => {
  assert.equal(
    learningToolSchema.safeParse({ note: 'n'.repeat(10001), bookmarked: false }).success,
    false,
  );
  const result = publicCourse({
    sections: [
      {
        id: 's',
        title: 'Section',
        lessons: [
          {
            id: 'l',
            title: 'Lesson',
            content: 'private',
            captions: { label: 'English', language: 'en', vtt },
          },
        ],
      },
    ],
  });
  assert.equal(result.lessons[0].captions, undefined);
  assert.equal(result.sections[0].lessons[0].content, undefined);
});
