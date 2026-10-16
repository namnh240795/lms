import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const questions = JSON.parse(await readFile('data/gplx/questions.json', 'utf8'));
const critical = new Set(JSON.parse(await readFile('data/gplx/critical-questions.json', 'utf8')));
assert.equal(questions.length, 600);
assert.equal(new Set(questions.map((q) => q.number)).size, 600);
assert.equal(critical.size, 60);
const chapters = [
  ['Quy định chung và quy tắc giao thông', 1, 180],
  ['Văn hoá, đạo đức, PCCC và cứu hộ', 181, 205],
  ['Kỹ thuật lái xe', 206, 263],
  ['Cấu tạo và sửa chữa', 264, 300],
  ['Báo hiệu đường bộ', 301, 485],
  ['Sa hình và xử lý tình huống', 486, 600],
];
const sections = chapters.map(([title, start, end], index) => ({
  id: `gplx-chapter-${index + 1}`,
  title,
  lessons: Array.from({ length: Math.ceil((end - start + 1) / 25) }, (_, part) => {
    const first = start + part * 25,
      last = Math.min(first + 24, end);
    const bank = questions.filter((q) => q.number >= first && q.number <= last);
    assert.equal(bank.length, last - first + 1);
    return {
      id: `gplx-${first}-${last}`,
      title: `Luyện câu ${first}–${last}`,
      content: `Ôn tập ${title.toLowerCase()}, câu ${first} đến ${last}. Chọn đáp án cho từng câu và xem phản hồi sau khi nộp. Bài luyện yêu cầu trả lời đúng toàn bộ để hoàn thành. Đây là luyện tập theo chương, không phải đề thi sát hạch có thời gian. Nguồn: Cục CSGT, bộ 600 câu năm 2025.`,
      quiz: {
        title: `Bài luyện ${first}–${last}`,
        passingScore: 100,
        questions: bank.map((q) => {
          assert.ok(q.correctOptionId && q.options.some((o) => o.id === q.correctOptionId));
          return {
            id: `gplx-question-${q.number}`,
            prompt: `Câu ${q.number}. ${q.prompt}`,
            options: q.options,
            correctOptionId: q.correctOptionId,
            critical: critical.has(q.number),
            sourcePage: q.sourcePages[0],
            ...(q.image ? { image: q.image } : {}),
            explanation: `Đáp án theo phần gạch chân trong tài liệu Cục CSGT, trang PDF ${q.sourcePages.join(', ')}. ${critical.has(q.number) ? 'Đây là câu về tình huống mất an toàn giao thông nghiêm trọng.' : ''}`,
          };
        }),
      },
    };
  }),
}));
const payload = {
  title: 'Ôn thi GPLX hạng B — 600 câu hỏi',
  description:
    'Khoá luyện tập bộ 600 câu hỏi chính thức của Cục Cảnh sát giao thông (2025), chia thành 6 chương và 27 bài luyện. Có 60 câu điểm liệt và hình minh hoạ biển báo, sa hình. Học theo chương, xem đáp án sau khi nộp, theo dõi tiến độ và ôn lại bài chưa đạt. Đây là khoá ôn lý thuyết, không phải kỳ sát hạch chính thức.',
  category: 'Driving',
  price: 0,
  sections,
};
await writeFile('data/gplx/course-draft.json', JSON.stringify(payload, null, 2) + '\n');
if (!process.env.GPLX_IMPORT_EMAIL) {
  console.log(
    'Prepared validated course draft: 6 chapters, 27 lessons, 600 questions. Set GPLX_IMPORT_EMAIL and GPLX_IMPORT_PASSWORD to import a private tutor draft.',
  );
  process.exit(0);
}
const base = 'http://localhost:5173';
let cookie = '';
async function request(path, method = 'GET', body) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: { origin: base, cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.headers.getSetCookie().length)
    cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
await request('/auth/sign-in/email', 'POST', {
  email: process.env.GPLX_IMPORT_EMAIL,
  password: process.env.GPLX_IMPORT_PASSWORD,
});
const mine = await request('/courses/mine');
const existing = mine.find((course) => course.title === payload.title);
if (existing) {
  console.log('Draft already exists:', existing.id);
  process.exit(0);
}
const course = await request('/courses', 'POST', payload);
await writeFile(
  'data/gplx/import-result.json',
  JSON.stringify(
    {
      id: course.id,
      published: course.published,
      chapters: course.sections.length,
      lessons: course.lessons.length,
    },
    null,
    2,
  ) + '\n',
);
console.log('Imported private course draft:', course.id);
