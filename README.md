# Learnly

A Udemy-style learning marketplace built with React, shadcn/ui, NestJS, Better Auth, PostgreSQL, RabbitMQ, and Redis. Uses pnpm workspaces. This is a working local first milestone, not a production-ready marketplace.

## Start locally

Requirements: Node.js 22+, pnpm 12.10.1, Docker with Compose.

```sh
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:setup
pnpm dev
```

Open http://localhost:5173. Create an account through the UI. Click **Teach on Learnly** to enable tutor capabilities; tutors retain student access. No real payment credentials are required.

`db:setup` runs Better Auth migrations, creates each service's tables, and preserves existing courses. Sample courses are optional: set `SEED_DEMO_COURSES=true` when running setup to insert them idempotently. Compose database creation runs only when PostgreSQL's volume is first initialized. `pnpm infra:down` stops infrastructure without deleting persistent data.

## Workspace and service boundaries

| Workspace        | Port | Owns                                                       |
| ---------------- | ---- | ---------------------------------------------------------- |
| apps/web         | 5173 | React, Vite, Tailwind, local shadcn/ui components          |
| apps/gateway     | 4100 | Same-origin browser API, session checks, rate limiting     |
| apps/identity    | 4101 | Better Auth user, session, account, verification tables    |
| apps/catalog     | 4102 | Course metadata, text lessons, publishing, tutor ownership |
| apps/learning    | 4103 | Enrollments and completed lessons                          |
| apps/orders      | 4104 | Price snapshots and order lifecycle                        |
| apps/payments    | 4105 | Mock payment records and payment provider adapter          |
| packages/backend | —    | Initial service implementations and shared infrastructure  |

Each NestJS application runs as a separate process and connects only to its own PostgreSQL database. For this starter, implementations share a backend package and NestJS hosts Express routes; domain controllers/providers can be extracted into their respective app workspaces as features grow. Database server credentials are shared for local development; use distinct database users and privileges in deployment.

The gateway resolves Better Auth cookie sessions and signs short-lived internal identity tokens. Services validate those tokens and check resource permissions. All services and infrastructure bind to loopback for local use. Custom browser mutations check the Origin header. Redis caches published course metadata for 30 seconds and stores gateway rate-limit counters. Lesson bodies are excluded from public catalog responses.

## Checkout and events

```text
orders: creates pending order + outbox record in one transaction
  → order.created
payments: MockPaymentProvider records success or failure + outbox
  → payment.succeeded / payment.failed
orders: updates status; successful orders publish order.paid
  → learning: inserts enrollment
```

RabbitMQ uses durable queues, persistent messages, publisher confirms, transactional outboxes, and transactional consumer deduplication. Consumer failures retry three times with a two-second delay before reaching `learnly.dead`. Outbox delivery retries every 500 ms. RabbitMQ connection loss terminates the affected service; restart it after infrastructure recovers. Automatic connection recovery and graceful shutdown are future hardening work.

Mock checkout exposes success/failure simulation. The order service computes prices from the catalog; client amounts are not trusted. Active orders are unique per student/course, repeated paid checkout returns the original order, and failed orders can be retried. Free enrollment currently uses the same event workflow with a zero-dollar mock payment.

RabbitMQ dashboard: http://localhost:15672 (credentials from `.env`). Local development defaults are `learnly` / `learnly_local`.

## Verification

```sh
pnpm typecheck
pnpm build
pnpm test
# With infrastructure and pnpm dev running:
node scripts/smoke.mjs
pnpm exec prettier --check .
```

The smoke test creates local test accounts, orders, and a course. It verifies unauthenticated/unpaid lesson protection, payments, eventual enrollment, duplicate checkout/progress handling, tutor publishing, editing/reordering curricula, thumbnail persistence, publish validation, optimistic concurrency, and ownership. Its test course is unpublished at the end; test records are retained.

## Implemented

- Course browsing, category filtering, search, and curriculum details.
- Better Auth email/password registration, login, and logout.
- Tutor course editing, multiple sections and lessons, reordering, moving lessons between sections, and publish/unpublish.
- Thumbnail uploads with client resizing and validation, private drafts, and previews of unsaved changes.
- Course version checks prevent overwriting edits made in another window. Existing lesson IDs and student progress survive migration.
- Student orders, simulated checkout, eventual enrollment, and text lesson completion.
- Responsive interface with accessible Radix dialogs and shadcn/ui-style source components.
- Docker Compose PostgreSQL, RabbitMQ, and Redis with named volumes and health checks.

## Next milestones

- Tutor analytics and media lessons.
- Adaptive streaming, cloud media storage, captions, and optional DRM.
- Discussions, reviews, wishlist, and certificates.
- Replace mock payment adapter with provider checkout and verified webhooks; refunds and reconciliation.
- Email verification and password reset delivery, service-specific credentials, tracing, deployment, and broader integration tests.

Replace development secrets before deployment. The mock payment path must be disabled when real money is enabled. There is no DRM, real charging, or instructor payout integration in this milestone.

## Tutor course builder

Click **Teach on Learnly**, then **Create course** or **Edit course**. Save unfinished drafts, add sections and text lessons, reorder with the arrows, move lessons using the section selector, and preview before publishing. Every section must contain a lesson with at least ten characters of content before publication. Saved edits to published courses become live immediately.

Run `pnpm db:setup` after upgrading. This adds sections, thumbnails, and revision columns without deleting existing courses or progress. Thumbnails accept JPEG/PNG/WebP files under 10 MB; the browser resizes them to fit within 1200 × 800 pixels and checks the encoded size before saving. This local milestone stores thumbnail data in the catalog database; use object storage for production media.

## Media service

`apps/media` is a dedicated NestJS module/controller/provider on **4106**. `apps/media-worker` consumes `media.uploaded` events, validates the video with ffprobe, converts it to H.264/AAC MP4 with FFmpeg, and emits `media.ready` or `media.failed`. Both own the `media` database. Install FFmpeg/ffprobe on the execution host before running `pnpm dev`; configure binary paths in `.env` if needed. Run `pnpm install` and `pnpm db:setup` to add the workspaces and new database on existing Compose volumes.

In the tutor builder, save the course and lesson, upload an MP4/WebM, wait for processing, then **Save changes** to attach the video. Tutor preview supports playback before saving the attachment. Students use the video player after enrollment; it supports seeking, playback speeds, and server-side resume positions.

| Endpoint                                       | Purpose                                            |
| ---------------------------------------------- | -------------------------------------------------- |
| POST /api/media/uploads                        | Owner-only upload ticket for a saved course lesson |
| PUT /api/media/:id/upload?token=…              | One-time, size-limited streaming upload            |
| GET /api/media/:id                             | Processing status; owner or authorized student     |
| POST /api/media/:id/playback                   | Ten-minute, user-bound playback URL                |
| GET /api/media/:id/stream?token=…              | Private MP4 streaming with HTTP Range support      |
| GET /api/learning/:courseId/position/:lessonId | Resume position                                    |
| PUT /api/learning/:courseId/position/:lessonId | Save position                                      |

The gateway streams video bodies without buffering entire files. The media service validates the signed internal identity and upload/playback tickets; playback also rechecks enrollment and the current lesson attachment. A copied URL alone is insufficient because a matching signed-in session is required. Upload tickets expire after 15 minutes and can be used once. Video-only lessons can publish when their attached asset is ready.

Local files live under ignored `.storage/videos`, never under a public static folder. Uploads are limited to 100 MB by default, source videos to four hours, processing to ten minutes, and output width to 1280 pixels. `MEDIA_MAX_BYTES`, `MEDIA_STORAGE_PATH`, `FFMPEG_PATH`, and `FFPROBE_PATH` are configurable. The API and worker must share the same private storage directory.

This adapter produces one progressive MP4 rendition. Adaptive HLS, captions, DRM, CDN/object storage, isolated transcoding containers, upload quotas, resumable uploads, and expired/orphaned file cleanup are future work. Original uploads remain on disk; failed and abandoned assets are retained. Signed playback controls access but is not DRM.

Media integration test (infrastructure and all services running):

```sh
# Supply a short MP4 fixture you own or generate locally:
node scripts/media-smoke.mjs /absolute/path/to/test.mp4
```

The media test creates test accounts and a course, checks uploads, invalid-file processing, single-use tickets, playback authorization, byte ranges, and resume positions, then unpublishes its course.

## Quizzes

Tutors can add an optional multiple-choice quiz to each lesson in the course builder. Set its title, passing score, question prompts, options, correct answers, and feedback explanations. Quiz-only lessons are supported, and tutor preview can grade practice submissions without recording attempts. The builder currently creates four options per question and supports up to 25 questions.

Students must enroll to submit. Answer keys and explanations are omitted from student course payloads and public metadata. The Learning service fetches the key from a catalog endpoint restricted to signed internal Learning-service requests, grades on the server, and stores attempt results in its own database. Passing automatically completes the lesson; ordinary completion cannot bypass a failed quiz.

Quiz revisions use a keyed, canonical content digest. Changing the questions, answers, passing score, or explanations requires students to pass the current version again. Historical attempts remain stored; the UI shows the latest 20 attempts matching the current revision. Retries are unlimited. Quiz results are practice feedback, not a proctored assessment.

Run `pnpm db:setup` after upgrading to add `quiz_attempts`. Endpoints:

- `GET /api/learning/:courseId/quiz/:lessonId/attempts`: the student's latest attempts.
- `POST /api/learning/:courseId/quiz/:lessonId/attempts`: submit `{revision, answers: {questionId: optionId}}`.

Run `pnpm test:quizzes` with infrastructure and services running to check enrollment, answer-key privacy, grading, history, completion rules, ownership, and revision invalidation. It creates local test records and unpublishes its test course when successful.

## Frontend forms and server state

The React app uses React Hook Form for authentication, course drafts, quizzes, checkout options, file selection, and playback controls. Zod validates authentication and nested course drafts; errors appear beside fields and in a draft validation summary. Curriculum sections use `useFieldArray` while preserving domain section and lesson IDs. Successful saves reset dirty state; unsaved drafts retain the close/unload safeguard.

TanStack Query owns catalog, enrollment, orders, tutor courses, lesson content, quiz history, media status, and playback requests. Mutations invalidate the affected queries after saving, publishing, checkout, or completion. Polling runs only while orders/enrollments or video processing are pending. Private query keys include the account ID, requests support cancellation, and signing in/out clears private cache. Better Auth continues to own the session.

Pages and dialogs are separate components under `apps/web/src/pages` and `apps/web/src/components`; heavy dialogs load on demand. Shared spacing covers page headers, cards, form fields, curriculum actions, dialog scrolling, and mobile layouts. Dialog close controls remain outside the scrolling body, with a sticky course save bar.

`pnpm test` runs backend and frontend tests. Frontend tests cover form validation, curriculum reordering and saved state, query deduplication, account switching, and checkout completion after an account change. `pnpm build` also checks TypeScript across every workspace. Use the integration commands above with local infrastructure/services running to check the complete API flows.

## Learning tools

Enrolled students can save private notes (up to 10,000 characters) and bookmark each lesson in the classroom. Use **Bookmarked lessons** to narrow the curriculum. Notes save explicitly; changing lessons or closing the classroom asks before discarding unsaved text. Notes and bookmarks belong to the student's account and remain separate from course content and tutor access.

Tutors can add one plain-text WebVTT caption track to a video lesson from **Video captions** in the builder, set its label and language code, and save it with the course. Paste a `WEBVTT` header and timed cues; the server validates cue times and rejects markup. Tracks support MM:SS.mmm or HH:MM:SS.mmm, are limited to 100 KB and four hours, and remain outside public course metadata. Use **Show captions** below the player or the video's native caption controls. This milestone supports tutor-authored captions; automatic transcription and multiple languages per lesson are future work.

Catalog search matches all entered terms across title, description, tutor, and category. Combine category and free/paid filters, then sort by title, price, or lesson count. **Clear filters** restores the full catalog. Search currently filters the catalog fetched by the client; server-side search and pagination are future work as the catalog grows.

Run `pnpm db:setup` after upgrading to create the `lesson_tools` table without deleting existing data. `GET /api/learning/:courseId/tools` reads the student's tools for current lessons; `PATCH /api/learning/:courseId/tools/:lessonId` updates `{note?, bookmarked?}`. Enrollment and lesson checks apply to both endpoints. Run `pnpm test:learning-tools` with local services running for privacy, persistence, partial-update, and caption validation checks.

### Learning dashboard

**My learning** shows **Continue learning** for the most recently opened lesson, plus a searchable collection of saved notes and bookmarks across enrolled courses. Filter by course or item type, then **Open lesson** to jump directly to its classroom. Reopening a course resumes its last lesson; video playback still restores the saved playback position. New accounts see an invitation to start a course until activity exists.

The Learning service stores one recent lesson per account/course in `learning_activity`. Run `pnpm db:setup` after upgrading. `GET /api/learning/dashboard` returns only the current student's saved items and recent lessons, enriched with current course/lesson titles. Removed lessons are excluded. `POST /api/learning/:courseId/activity/:lessonId` records activity after enrollment and lesson validation. Notes/bookmarks invalidate dashboard queries when saved. `pnpm test:learning-tools` also checks dashboard privacy, clearing saved items, and activity validation.

### Completed courses and certificates

**My learning** separates active and completed courses. Completion requires every current lesson; quiz lessons must have a passing attempt for the current quiz revision. Completed courses remain available for review and offer **View certificate** with **Download PDF**. Continue learning skips completed courses.

The Learning service verifies enrollment, lesson progress, and current quiz passes before `POST /api/learning/:courseId/certificate` issues a certificate. Certificate records snapshot learner/course/tutor names, lesson count, issue date, and a unique ID. Repeated requests for the same required curriculum preserve the ID/date; adding lessons or changing quiz revisions requires completion again. Historical downloaded certificates describe the curriculum completed when issued. These are Learnly course-completion records, not accredited qualifications or publicly verifiable credentials.

Run `pnpm db:setup` to create `completion_certificates`. PDFs use one landscape A4 page with a centered title, learner/course hierarchy, aligned issue/tutor/achievement fields, and an embedded Noto Sans font for Vietnamese text. Its open-source license is bundled under `packages/backend/assets/fonts`; keep these assets with the backend deployment. `pnpm test:certificates` checks eligibility, stable repeat issuance, account isolation, PDF output, and changed quiz revisions.

### Progress summaries

My learning shows overall completion, completed/current lesson counts, and quizzes still to pass across enrolled courses. Overall completion is weighted by lesson count, rather than averaging course percentages. Course cards and the classroom show the current course percentage and remaining quiz count; **Quizzes to complete** links directly to outstanding quiz lessons.

Progress counts only current lesson IDs, deduplicates completion records, and treats an empty curriculum as 0% complete. Unfinished courses never round up to 100%. Quiz completion uses the Learning service's current-revision checks, so changing a required quiz puts it back into the remaining list until passed again. These summaries update with enrollment/progress query refreshes.

### Section progress and next lessons

Each course in My learning and the classroom has a **Section progress** panel with completed/current lesson counts, a percentage, and **Not started**, **In progress**, or **Completed** status. Empty sections remain Not started at 0%. Each section lists required quizzes without a current passing completion and links directly to those quiz lessons. **Continue section** opens that section's first unfinished lesson; **Next unfinished lesson** opens the first unfinished lesson in curriculum order across the course. These shortcuts differ from Resume, which returns to the last lesson opened. Classroom shortcuts keep the unsaved-note confirmation guard.

### Official GPLX hạng B course

The supplied 188-page CSGT PDF is saved at `data/gplx/official-600.pdf`, with its SHA-256 and extraction audit. `scripts/extract-gplx.py` uses the bundled Python/pdfplumber runtime to extract 600 questions and identify correct options from PDF underline geometry. The official government list supplies 60 critical question IDs. Illustration crops (317 PNGs) are served under `apps/web/public/gplx`; question/answer data stays under `data/gplx` and protected catalog assessment endpoints.

`pnpm course:gplx` validates and prepares `data/gplx/course-draft.json`: 6 chapters, 27 practice lessons of at most 25 questions, and a 100% practice passing score. Supplying `GPLX_IMPORT_EMAIL` and `GPLX_IMPORT_PASSWORD` imports one private draft into that tutor's account. The script avoids duplicating a matching title; it does not overwrite existing courses or publish them. This workspace's local Preview Learner tutor account contains the imported draft.

Image and critical flags survive tutor form validation and student quiz payloads; answer keys stay hidden until grading feedback. Any wrong critical answer fails the quiz on the server regardless of passing-score percentage. These are chapter practice quizzes, not timed official mock exams. Inspect `source-manifest.json` and compare question text/images against the source before publishing; no explanatory legal reasoning was invented during extraction.

### URL routes

The frontend uses React Router with a shared application shell and lazy-loaded pages.

| URL                                     | Page                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `/`                                     | Course catalog                                         |
| `/login`                                | Authentication with a validated `returnTo` destination |
| `/learning`                             | Learning dashboard                                     |
| `/courses/:courseId`                    | Course details and mock checkout                       |
| `/learning/:courseId/lessons/:lessonId` | Enrolled classroom at a specific lesson                |
| `/orders`                               | Orders                                                 |
| `/tutor`                                | Tutor workspace                                        |
| `/tutor/courses/new`                    | Create a course                                        |
| `/tutor/courses/:courseId/edit`         | Edit an owned course                                   |

Classrooms resume at a canonical lesson URL. Links support browser history and refresh; private pages redirect signed-out visitors to login and return them to their destination. Tutor editing retains backend ownership checks. Unsaved notes and course edits prompt before route changes; previews and certificates remain dialogs. Unknown routes and invalid lesson links have recovery screens.

Production hosting must serve `index.html` for frontend routes (SPA fallback), while forwarding `/api/*` to the gateway and serving static assets normally. Vite's development server already provides this fallback.

### Timed practice exams

Open an enrolled course classroom and choose **Timed practice exam**. `/learning/:courseId/exam` shows the introduction and the latest 20 attempts; `/learning/:courseId/exam/:attemptId` resumes or reviews a specific attempt.

Each attempt draws up to 30 unique questions from the course's quizzes, including exactly one critical question where available, with a 20-minute deadline and 90% passing threshold. Smaller question banks produce smaller exams. Selection is random, not the official GPLX topic distribution. The 30-question/20-minute practice template follows the hạng B format described in [Thông tư 12/2025/TT-BCA](https://congbao.chinhphu.vn/tai-ve-van-ban-so-12-2025-tt-bca-44366-55281?format=pdf); these practice exams do not claim to reproduce the latest official examination. They do not complete lessons or award certificates.

Answers are saved to the Learning service one selection at a time; the UI confirms saved answers. Question navigation shows answered/unanswered state, with optional flags for this page session. Refreshing restores saved answers and the same deadline. The browser submits at zero; while offline, only answers saved before the deadline can count. The server finalizes expired attempts on the next read/write, including history reads, and rejects further answer changes. Repeated submission returns the same result. Starting in multiple tabs resumes the same active attempt.

The server snapshots the selected questions and keys so tutor edits cannot change an active or historical exam. Answer keys and explanations are returned only after submission. Missing answers are incorrect; a wrong or unanswered critical question fails the exam even if the numeric score passes. Review supports all questions, incorrect/unanswered questions, and critical questions. Attempts are restricted to the enrolled account.

Run `pnpm db:setup` after upgrading to create `exam_attempts` without clearing existing data. `pnpm test:exams` creates synthetic test accounts/course, verifies expiry with a shortened deadline only for its own synthetic attempt, and unpublishes its test course afterward. Local services and Docker dependencies must be running.

### Practice your mistakes

Choose **Practice your mistakes** from the classroom or exam page to open `/learning/:courseId/mistakes`. The collection combines incorrect and unanswered questions across all submitted exams for that course, counting repeat misses and grouping by the current curriculum section. Removed lessons appear under Earlier curriculum. Question snapshots with changed text or answer keys remain separate so historical answers are preserved. Expired exams finalize when the collection is opened.

Filter by section, critical questions, and Still practicing/Corrected/All mistakes. Untimed retries are graded on the server. A correct retry marks that question snapshot corrected; an incorrect retry or a later exam miss puts it back into practice. Corrections persist per enrolled account and course. This does not change exam scores, lesson completion, or certificates.

`GET /api/learning/:courseId/mistakes` returns the private collection without answer keys. `POST /api/learning/:courseId/mistakes/:key/practice` accepts `{optionId}` for a question in that student's collection and returns grading feedback. Run `pnpm db:setup` to add `mistake_practice`. `pnpm test:exams` also checks mistake collection privacy, saved corrections, later misses, invalid answers, and expiry.
