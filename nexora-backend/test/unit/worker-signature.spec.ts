import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWorkerSignature } from '../../src/modules/authoring/worker-signature';

const secret = 'test-only-'.repeat(5);
const schoolId = '11111111-1111-4111-8111-111111111111';
const nonce = '22222222-2222-4222-8222-222222222222';
const timestamp = '1793020000';
const now = Number(timestamp) * 1000;
const authorization = `Nexora-HMAC ${createHmac('sha256', secret)
  .update(`nexora-worker-v1\n${schoolId}\n${nonce}\n${timestamp}`)
  .digest('hex')}`;

describe('scheduled worker signature', () => {
  it('accepts a fresh signed school-bound request', () => {
    expect(
      verifyWorkerSignature({ schoolId }, authorization, timestamp, nonce, secret, now),
    ).toEqual({ schoolId, nonce });
  });
  it('rejects old/future requests, scope changes, extra fields and forged signatures', () => {
    for (const [body, auth, time, n, key, clock] of [
      [{ schoolId }, authorization, timestamp, nonce, secret, now + 91000],
      [{ schoolId }, authorization, timestamp, nonce, secret, now - 91000],
      [{ schoolId: nonce }, authorization, timestamp, nonce, secret, now],
      [{ schoolId, afterSchoolId: nonce }, authorization, timestamp, nonce, secret, now],
      [{ schoolId }, authorization, timestamp, schoolId, secret, now],
      [{ schoolId }, `Nexora-HMAC ${'0'.repeat(64)}`, timestamp, nonce, secret, now],
      [{ schoolId }, authorization, timestamp, nonce, undefined, now],
      [{ schoolId }, authorization, 'invalid', nonce, secret, now],
    ] as const)
      expect(() => verifyWorkerSignature(body, auth, time, n, key, clock)).toThrow();
  });
});
