import { HttpStatus } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { hashSha256 } from '../crypto/password';
import { DomainException } from '../errors/domain.exception';
export async function requestLimit(db: DbService, scope: string, limit: number, seconds: number) {
  const retry = (
    await db.query<{ retry: number }>('SELECT nexora_take_request_limit($1,$2,$3) retry', [
      hashSha256(scope),
      limit,
      seconds,
    ])
  ).rows[0].retry;
  if (retry > 0)
    throw new DomainException(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
      'Too many requests; retry after the indicated delay.',
      [],
      { retryAfterSeconds: retry },
    );
}
