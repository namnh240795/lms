import { createHmac, timingSafeEqual } from 'node:crypto';
export type Actor = { id: string; role: string; name: string; service?: string };
export function signActor(actor: Actor, key: string) {
  const body = Buffer.from(JSON.stringify({ ...actor, expires: Date.now() + 30_000 })).toString(
    'base64url',
  );
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
export function readActor(token: string, key: string): Actor {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new Error('Invalid internal token');
  const expected = createHmac('sha256', key).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Invalid internal token');
  const actor = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (actor.expires < Date.now() || !actor.id) throw new Error('Expired internal token');
  return actor;
}
