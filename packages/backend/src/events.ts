import amqp from 'amqplib';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
export type Event = { id: string; topic: string; payload: any };
export async function enqueue(db: pg.PoolClient, topic: string, payload: unknown) {
  await db.query('INSERT INTO outbox(id,topic,payload) VALUES($1,$2,$3)', [
    randomUUID(),
    topic,
    JSON.stringify(payload),
  ]);
}
export async function startEvents(
  db: pg.Pool,
  name: string,
  topics: string[],
  handle: (client: pg.PoolClient, event: Event) => Promise<void>,
) {
  const connection = await amqp.connect(
    process.env.RABBITMQ_URL || 'amqp://learnly:learnly_local@localhost:5672',
  );
  const channel = await connection.createConfirmChannel();
  await channel.assertExchange('learnly.events', 'topic', { durable: true });
  await channel.assertExchange('learnly.dead', 'fanout', { durable: true });
  await channel.assertQueue('learnly.dead', { durable: true });
  await channel.bindQueue('learnly.dead', 'learnly.dead', '');
  const queue = `learnly.${name}`;
  await channel.assertQueue(queue, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': 'learnly.dead' },
  });
  await channel.assertQueue(`${queue}.retry`, {
    durable: true,
    arguments: {
      'x-message-ttl': 2000,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': queue,
    },
  });
  for (const topic of topics) await channel.bindQueue(queue, 'learnly.events', topic);
  await channel.prefetch(1);
  await channel.consume(queue, async (message) => {
    if (!message) return;
    const client = await db.connect();
    try {
      const event = JSON.parse(message.content.toString()) as Event;
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO processed_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',
        [event.id],
      );
      if (inserted.rowCount) await handle(client, event);
      await client.query('COMMIT');
      channel.ack(message);
    } catch (error) {
      await client.query('ROLLBACK');
      const attempts = Number(message.properties.headers?.['x-retries'] || 0);
      console.error(`Event failed (attempt ${attempts + 1})`, error);
      if (attempts < 3) {
        channel.sendToQueue(`${queue}.retry`, message.content, {
          persistent: true,
          headers: { 'x-retries': attempts + 1 },
        });
        await channel.waitForConfirms();
        channel.ack(message);
      } else channel.nack(message, false, false);
    } finally {
      client.release();
    }
  });
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = await db.query('SELECT * FROM outbox WHERE sent=false LIMIT 50');
      for (const row of rows.rows) {
        channel.publish(
          'learnly.events',
          row.topic,
          Buffer.from(JSON.stringify({ id: row.id, topic: row.topic, payload: row.payload })),
          { persistent: true, messageId: row.id },
        );
        await channel.waitForConfirms();
        await db.query('UPDATE outbox SET sent=true WHERE id=$1', [row.id]);
      }
    } catch (error) {
      console.error('Outbox delivery failed; will retry', error);
    } finally {
      busy = false;
    }
  }, 500);
  connection.on('error', (error) => console.error('RabbitMQ error', error));
  connection.on('close', () => {
    clearInterval(timer);
    console.error('RabbitMQ disconnected. Restart this service to reconnect.');
    process.exit(1);
  });
}
