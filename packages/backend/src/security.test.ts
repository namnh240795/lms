import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readActor, signActor } from './security.js';
const key = 'test-key-with-at-least-32-characters';
test('signed internal identity cannot be forged or reused with another key', () => {
  const actor = { id: 'user-1', name: 'Tutor', role: 'tutor' };
  const token = signActor(actor, key);
  assert.equal(readActor(token, key).id, actor.id);
  assert.throws(() => readActor(token, 'different-key'));
  const [body, signature] = token.split('.');
  const altered = Buffer.from(
    JSON.stringify({ id: 'admin', expires: Date.now() + 10000 }),
  ).toString('base64url');
  assert.throws(() => readActor(`${altered}.${signature}`, key));
  assert.throws(() => readActor(`${body}.broken`, key));
});
