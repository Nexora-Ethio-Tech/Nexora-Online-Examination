import { PoolClient } from 'pg';
import { z } from 'zod';
import { computeCanonicalDigest } from '../crypto/canonical-digest';
import { DomainException } from '../errors/domain.exception';
import { parsePreparationInput } from '../../modules/delivery/preparation-schemas';

/** Caller must authenticate and authorize the resource before entering this transaction. */
export async function mutate<T>(
  client: PoolClient,
  school: string,
  actor: string,
  operation: string,
  key: unknown,
  payload: unknown,
  execute: () => Promise<T>,
  retain: (result: T) => unknown = (result) => result,
): Promise<T | unknown> {
  const id = parsePreparationInput(z.string().uuid(), key),
    digest = computeCanonicalDigest(payload);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `${school}:${actor}:${operation}:${id}`,
  ]);
  const row = (
    await client.query<{ payload_digest: string; response_body: unknown }>(
      'SELECT payload_digest,response_body FROM idempotency_keys WHERE school_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4',
      [school, actor, operation, id],
    )
  ).rows[0];
  if (row) {
    if (row.payload_digest !== digest)
      throw DomainException.conflict('REVISION_CONFLICT', 'Key reused with different payload');
    return row.response_body;
  }
  const result = await execute();
  await client.query(
    'INSERT INTO idempotency_keys(school_id,actor_id,operation,idempotency_key,payload_digest,status_code,response_body) VALUES($1,$2,$3,$4,$5,200,$6)',
    [school, actor, operation, id, digest, JSON.stringify(retain(result))],
  );
  return result;
}
