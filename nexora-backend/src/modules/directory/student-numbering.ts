import { PoolClient } from 'pg';
import { DomainException } from '../../common/errors/domain.exception';

export function studentLoginId(slug: string, number: number) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) || !Number.isSafeInteger(number) || number < 1)
    throw DomainException.validationError('Invalid school student numbering configuration');
  return `${slug.toUpperCase()}-STU-${String(number).padStart(4, '0')}`;
}

/** Called inside the roster transaction, after the school directory lock. Never recycle IDs. */
export async function allocateStudentNumbers(c: PoolClient, school: string, count: number) {
  const existing = await c.query<{ highest: string }>(
    `SELECT COALESCE(max((substring(upper(login_id) from '(?:^|-)STU-([0-9]+)$'))::numeric),0)::text highest
     FROM users WHERE school_id=$1 AND role='student'`,
    [school],
  );
  const highest = Number(existing.rows[0]?.highest ?? 0);
  if (!Number.isSafeInteger(highest) || highest > 2147483647 - count)
    throw DomainException.validationError('Student numbering capacity reached');
  await c.query(
    `INSERT INTO school_student_counters(school_id,last_number) VALUES($1,$2)
     ON CONFLICT(school_id) DO UPDATE SET last_number=greatest(school_student_counters.last_number,EXCLUDED.last_number)`,
    [school, highest],
  );
  const result = await c.query<{ last_number: number }>(
    `UPDATE school_student_counters SET last_number=last_number+$2
     WHERE school_id=$1 AND last_number<=2147483647-$2 RETURNING last_number`,
    [school, count],
  );
  if (!result.rows[0]) throw DomainException.validationError('Student numbering capacity reached');
  return result.rows[0].last_number - count + 1;
}
