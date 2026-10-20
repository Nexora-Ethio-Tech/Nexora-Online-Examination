import { PoolClient } from 'pg';
import { DomainException } from '../common/errors/domain.exception';
export async function requireSchedulingSubscription(c: PoolClient, schoolId: string) {
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `subscription:${schoolId}`,
  ]);
  const row = (
    await c.query<{ allowed: boolean }>(
      `SELECT state IN ('active','trial') AND
    (expires_at IS NULL OR expires_at>clock_timestamp()) AS allowed
    FROM platform.subscriptions WHERE school_id=$1`,
      [schoolId],
    )
  ).rows[0];
  // Existing schools without a billing record retain their prior scheduling access.
  if (row && !row.allowed)
    throw DomainException.forbidden(
      'School subscription restricts new scheduling. Existing exams remain available.',
    );
}
