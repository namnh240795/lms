import { getMigrations } from 'better-auth/db/migration';
import { auth } from './auth.js';
import { database } from './config.js';
const admin = database('identity');
if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='media'")).rowCount)
  await admin.query('CREATE DATABASE media');
await admin.end();
const migration = await getMigrations(auth.options);
await migration.runMigrations();
for (const name of ['catalog', 'learning', 'orders', 'payments', 'media']) {
  const db = database(name);
  await db.query(
    `CREATE TABLE IF NOT EXISTS outbox(id uuid PRIMARY KEY, topic text NOT NULL, payload jsonb NOT NULL, sent boolean NOT NULL DEFAULT false); CREATE TABLE IF NOT EXISTS processed_events(id uuid PRIMARY KEY);`,
  );
  if (name === 'catalog') {
    await db.query(
      `CREATE TABLE IF NOT EXISTS courses(id uuid PRIMARY KEY, tutor_id text NOT NULL, title text NOT NULL, description text NOT NULL, category text NOT NULL, price integer NOT NULL CHECK(price>=0), published boolean NOT NULL DEFAULT false, tutor_name text NOT NULL, lessons jsonb NOT NULL DEFAULT '[]', created_at timestamptz DEFAULT now());`,
    );
    const seed = [
      [
        '11111111-1111-4111-8111-111111111111',
        'React from the ground up',
        'Build beautiful, interactive applications. Master components, hooks, and the patterns that make React click.',
        'Development',
        2900,
        'Alex Morgan',
      ],
      [
        '22222222-2222-4222-8222-222222222222',
        'The art of interface design',
        'Turn a blank canvas into thoughtful digital experiences. Learn hierarchy, typography, and design systems.',
        'Design',
        3900,
        'Sofia Chen',
      ],
      [
        '33333333-3333-4333-8333-333333333333',
        'NestJS: build your first API',
        'Learn modules, dependency injection, and practical API development with TypeScript.',
        'Development',
        0,
        'Jordan Lee',
      ],
      [
        '44444444-4444-4444-8444-444444444444',
        'Make your ideas a business',
        'Validate an idea, understand your audience, and find your first customers.',
        'Business',
        1900,
        'Emma Wilson',
      ],
    ];
    for (const [id, title, description, category, price, tutor] of process.env.SEED_DEMO_COURSES ===
    'true'
      ? seed
      : [])
      await db.query(
        'INSERT INTO courses(id,tutor_id,title,description,category,price,published,tutor_name,lessons) VALUES($1,$2,$3,$4,$5,$6,true,$7,$8) ON CONFLICT DO NOTHING',
        [
          id,
          'seed',
          title,
          description,
          category,
          price,
          tutor,
          JSON.stringify([
            {
              id: 'intro',
              title: 'Welcome to the course',
              content:
                'Welcome! This starter lesson demonstrates the learning experience. Tutor video uploads and protected streaming will be added in the media milestone.',
            },
            {
              id: 'fundamentals',
              title: 'The fundamentals',
              content:
                'Start by identifying the core concepts. Take notes, practice deliberately, and use small projects to reinforce your understanding.',
            },
            {
              id: 'project',
              title: 'Your first project',
              content:
                'Put your new skills into practice by building a small project. Break it into steps and review what you learned.',
            },
          ]),
        ],
      );
  }
  if (name === 'catalog') {
    await db.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS sections jsonb;
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail text;
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
      UPDATE courses SET sections=jsonb_build_array(jsonb_build_object('id','overview','title','Course overview','lessons',lessons)) WHERE sections IS NULL;`);
  }
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS enrollments(user_id text NOT NULL, course_id uuid NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY(user_id,course_id)); CREATE TABLE IF NOT EXISTS progress(user_id text NOT NULL,course_id uuid NOT NULL,lesson_id text NOT NULL, PRIMARY KEY(user_id,course_id,lesson_id));`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS lesson_tools(user_id text NOT NULL,course_id uuid NOT NULL,lesson_id text NOT NULL,note text NOT NULL DEFAULT '',bookmarked boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,course_id,lesson_id));`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS learning_activity(user_id text NOT NULL,course_id uuid NOT NULL,lesson_id text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,course_id));`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS completion_certificates(id uuid PRIMARY KEY,user_id text NOT NULL,course_id uuid NOT NULL,curriculum text NOT NULL,learner_name text NOT NULL,course_title text NOT NULL,tutor_name text NOT NULL,lesson_count integer NOT NULL,issued_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,course_id,curriculum));`,
    );
  if (name === 'media')
    await db.query(
      `CREATE TABLE IF NOT EXISTS media_assets(id uuid PRIMARY KEY, owner_id text NOT NULL,course_id uuid NOT NULL,lesson_id text NOT NULL,filename text NOT NULL,mime text NOT NULL,expected_size bigint NOT NULL,status text NOT NULL DEFAULT 'pending',duration double precision,width integer,height integer,error text,created_at timestamptz DEFAULT now());`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS playback_positions(user_id text NOT NULL,course_id uuid NOT NULL,lesson_id text NOT NULL,position double precision NOT NULL DEFAULT 0, PRIMARY KEY(user_id,course_id,lesson_id));`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS quiz_attempts(id uuid PRIMARY KEY,user_id text NOT NULL,course_id uuid NOT NULL,lesson_id text NOT NULL,revision text NOT NULL,score numeric(5,2) NOT NULL,passed boolean NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS quiz_attempt_lookup ON quiz_attempts(user_id,course_id,lesson_id,revision);`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS exam_attempts(id uuid PRIMARY KEY,user_id text NOT NULL,course_id uuid NOT NULL,quiz jsonb NOT NULL,answers jsonb NOT NULL DEFAULT '{}',started_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,result jsonb,submitted_at timestamptz); CREATE UNIQUE INDEX IF NOT EXISTS active_exam ON exam_attempts(user_id,course_id) WHERE result IS NULL; CREATE INDEX IF NOT EXISTS exam_history ON exam_attempts(user_id,course_id,started_at DESC);`,
    );
  if (name === 'learning')
    await db.query(
      `CREATE TABLE IF NOT EXISTS mistake_practice(user_id text NOT NULL,course_id uuid NOT NULL,question_key text NOT NULL,correct boolean NOT NULL,practiced_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,course_id,question_key));`,
    );
  if (name === 'orders')
    await db.query(
      `CREATE TABLE IF NOT EXISTS orders(id uuid PRIMARY KEY,user_id text NOT NULL,course_id uuid NOT NULL,title text NOT NULL,amount integer NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz DEFAULT now()); CREATE UNIQUE INDEX IF NOT EXISTS active_purchase ON orders(user_id,course_id) WHERE status IN ('pending','paid');`,
    );
  if (name === 'payments')
    await db.query(
      `CREATE TABLE IF NOT EXISTS payments(order_id uuid PRIMARY KEY,amount integer NOT NULL,status text NOT NULL,provider text NOT NULL DEFAULT 'mock');`,
    );
  await db.end();
}
console.log('Auth migrations and service schemas are ready.');
process.exit(0);
