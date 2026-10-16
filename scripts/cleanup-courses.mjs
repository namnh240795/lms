import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { database } from '../packages/backend/src/config.ts';
const require = createRequire(new URL('../packages/backend/package.json', import.meta.url));
const Redis = require('ioredis');
const keep = 'e6aa2023-731c-4fd0-b4c9-0129464c7024';
const names = ['catalog', 'learning', 'orders', 'payments', 'media'];
const pools = Object.fromEntries(names.map((name) => [name, database(name)]));
try {
  const kept = (
    await pools.catalog.query('SELECT id,title,published FROM courses WHERE id=$1', [keep])
  ).rows[0];
  if (!kept || !kept.title.includes('600'))
    throw new Error('Expected GPLX course missing; no records changed.');
  const removed = (await pools.catalog.query('SELECT id,title FROM courses WHERE id<>$1', [keep]))
    .rows;
  console.log(JSON.stringify({ keep: kept, removeCount: removed.length }));
  if (!process.argv.includes('--apply')) process.exitCode = 0;
  else {
    const backup = `/private/tmp/learnly-course-cleanup-${Date.now()}`;
    await mkdir(backup, { mode: 0o700 });
    for (const name of names) {
      const dump = execFileSync(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'postgres',
          'pg_dump',
          '-U',
          process.env.POSTGRES_USER || 'learnly',
          '-Fc',
          name,
        ],
        { maxBuffer: 128 * 1024 * 1024 },
      );
      await writeFile(`${backup}/${name}.dump`, dump, { mode: 0o600 });
    }
    await writeFile(`${backup}/removed-courses.json`, JSON.stringify(removed, null, 2), {
      mode: 0o600,
    });
    console.log(`Backup: ${backup}`);
    const orderIds = (
      await pools.orders.query('SELECT id FROM orders WHERE course_id<>$1', [keep])
    ).rows.map((r) => r.id);
    for (const name of names) {
      const client = await pools[name].connect();
      try {
        await client.query('BEGIN');
        await client.query(
          "DELETE FROM outbox WHERE (payload->>'courseId' IS NOT NULL AND payload->>'courseId'<>$1) OR payload->>'orderId'=ANY($2::text[])",
          [keep, orderIds],
        );
        const tables =
          name === 'catalog'
            ? ['courses']
            : name === 'learning'
              ? [
                  'mistake_practice',
                  'exam_attempts',
                  'quiz_attempts',
                  'playback_positions',
                  'completion_certificates',
                  'learning_activity',
                  'lesson_tools',
                  'progress',
                  'enrollments',
                ]
              : name === 'orders'
                ? ['orders']
                : name === 'media'
                  ? ['media_assets']
                  : [];
        for (const table of tables) {
          const result = await client.query(
            `DELETE FROM ${table} WHERE ${table === 'courses' ? 'id' : 'course_id'}<>$1`,
            [keep],
          );
          console.log(`${name}.${table}: removed ${result.rowCount}`);
        }
        if (name === 'payments')
          await client.query('DELETE FROM payments WHERE order_id=ANY($1::uuid[])', [orderIds]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    try {
      await redis.del('catalog:published:v2');
    } finally {
      await redis.quit();
    }
    const remaining = (await pools.catalog.query('SELECT id,title,published FROM courses')).rows;
    if (remaining.length !== 1 || remaining[0].id !== keep)
      throw new Error('Course verification failed.');
    console.log(JSON.stringify({ remaining }));
  }
} finally {
  await Promise.all(Object.values(pools).map((pool) => pool.end()));
}
