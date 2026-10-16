import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseSchema, normalizeCourse, publicCourse, publishProblems } from './curriculum.js';
const metadata = {
  title: 'A useful course',
  description: 'A practical introduction to course building.',
  category: 'Development',
  price: 0,
};
test('legacy courses preserve lesson IDs and content through section migration', () => {
  const original = {
    ...metadata,
    lessons: [
      { id: 'completed-lesson', title: 'First lesson', content: 'Private lesson content.' },
    ],
  };
  const normalized = normalizeCourse(original);
  assert.equal(normalized.sections[0].lessons[0].id, 'completed-lesson');
  const publicData = publicCourse(original);
  assert.equal(publicData.lessons[0].content, undefined);
  assert.equal(publicData.sections[0].lessons[0].content, undefined);
});
test('drafts may be incomplete but publishing checks every section and lesson', () => {
  const data = courseSchema.parse({
    ...metadata,
    sections: [
      { id: 'one', title: 'First section', lessons: [] },
      {
        id: 'two',
        title: 'Second section',
        lessons: [{ id: 'lesson', title: 'A lesson', content: '' }],
      },
    ],
  });
  assert.equal(publishProblems(data.sections).length, 2);
  assert.equal(
    publishProblems([
      {
        id: 'one',
        title: 'Ready section',
        lessons: [{ id: 'one', title: 'Ready lesson', content: 'Enough content to publish.' }],
      },
    ]).length,
    0,
  );
});
test('duplicate lesson IDs across sections and unsafe thumbnails are rejected', () => {
  const lesson = { id: 'same', title: 'Lesson title', content: 'Some lesson content.' };
  assert.throws(() =>
    courseSchema.parse({
      ...metadata,
      sections: [
        { id: 'one', title: 'First section', lessons: [lesson] },
        { id: 'two', title: 'Second section', lessons: [lesson] },
      ],
    }),
  );
  assert.throws(() =>
    courseSchema.parse({ ...metadata, thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' }),
  );
  assert.throws(() =>
    courseSchema.parse({ ...metadata, thumbnail: 'data:image/png;base64,bm90LWFuLWltYWdl' }),
  );
});
