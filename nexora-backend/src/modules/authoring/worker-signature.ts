import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DomainException } from '../../common/errors/domain.exception';

const signedBody = z.object({ schoolId: z.string().uuid() }).strict();
export function verifyWorkerSignature(
  input: unknown,
  authorization: unknown,
  timestamp: unknown,
  nonce: unknown,
  secret: string | undefined,
  now = Date.now(),
) {
  const body = signedBody.safeParse(input);
  if (
    !body.success ||
    !secret ||
    secret.length < 32 ||
    typeof timestamp !== 'string' ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 90 ||
    !z.string().uuid().safeParse(nonce).success ||
    typeof nonce !== 'string' ||
    typeof authorization !== 'string' ||
    !/^Nexora-HMAC [a-f0-9]{64}$/.test(authorization)
  )
    throw DomainException.forbidden();
  const expected = createHmac('sha256', secret)
    .update(`nexora-worker-v1\n${body.data.schoolId}\n${nonce}\n${timestamp}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(authorization.slice('Nexora-HMAC '.length), 'hex')))
    throw DomainException.forbidden();
  return { schoolId: body.data.schoolId, nonce };
}
