import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticket, verifyTicket, byteRange } from './media/security.js';
const key = 'media-test-key-with-32-characters';
test('media tickets are user/asset/purpose bound and expire', () => {
  const data = {
    assetId: 'one',
    userId: 'tutor',
    purpose: 'upload' as const,
    expires: Date.now() + 10000,
  };
  const token = ticket(data, key);
  assert.equal(verifyTicket(token, key, 'upload', 'one', 'tutor').assetId, 'one');
  assert.throws(() => verifyTicket(token, key, 'playback', 'one', 'tutor'));
  assert.throws(() => verifyTicket(token, key, 'upload', 'one', 'other'));
  assert.throws(() => verifyTicket(token, key, 'upload', 'other', 'tutor'));
  assert.throws(() =>
    verifyTicket(ticket({ ...data, expires: Date.now() - 1 }, key), key, 'upload', 'one', 'tutor'),
  );
  assert.throws(() => verifyTicket(`${token}tamper`, key, 'upload', 'one', 'tutor'));
});
test('range playback supports bounded, open, and suffix requests', () => {
  assert.deepEqual(byteRange('bytes=0-9', 100), { start: 0, end: 9, partial: true });
  assert.deepEqual(byteRange('bytes=90-', 100), { start: 90, end: 99, partial: true });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99, partial: true });
  assert.deepEqual(byteRange('bytes=0-1000', 100), { start: 0, end: 99, partial: true });
  for (const value of ['bytes=100-', 'bytes=5-3', 'bytes=0-1,3-4', 'bytes=-', 'bytes=-0'])
    assert.throws(() => byteRange(value, 100));
});
