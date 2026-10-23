import { PoolClient } from 'pg';
import { DomainException } from '../../common/errors/domain.exception';

export function teacherLoginId(schoolNumber: number, number: number) {
  if (![schoolNumber, number].every((n) => Number.isSafeInteger(n) && n > 0))
    throw DomainException.validationError('Invalid teacher numbering configuration');
  return `TCH/${String(schoolNumber).padStart(3, '0')}/${String(number).padStart(4, '0')}`;
}
/** School directory transaction lock is held by the caller. Counter survives deletion. */
export async function allocateTeacherNumber(c: PoolClient, school: string) {
  await c.query(
    `INSERT INTO school_teacher_counters(school_id,last_number)
    SELECT $1,COALESCE(max(substring(login_id from '^TCH/[0-9]+/([0-9]+)$')::integer),0)
    FROM users WHERE school_id=$1 AND role='teacher'
    ON CONFLICT(school_id) DO UPDATE SET last_number=greatest(school_teacher_counters.last_number,EXCLUDED.last_number)`,
    [school],
  );
  const result = await c.query<{ last_number: number }>(
    `UPDATE school_teacher_counters SET last_number=last_number+1
    WHERE school_id=$1 AND last_number<2147483647 RETURNING last_number`,
    [school],
  );
  if (!result.rows[0]) throw DomainException.validationError('Teacher numbering capacity reached');
  return result.rows[0].last_number;
}
