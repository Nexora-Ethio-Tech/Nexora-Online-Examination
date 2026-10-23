import { PoolClient } from 'pg';
import { DomainException } from '../../common/errors/domain.exception';

export function studentLoginId(schoolNumber: number, number: number, createdAt = new Date()) {
  if (
    !Number.isSafeInteger(schoolNumber) ||
    schoolNumber < 1 ||
    !Number.isSafeInteger(number) ||
    number < 1
  )
    throw DomainException.validationError('Invalid school student numbering configuration');
  const year = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Addis_Ababa',
    calendar: 'ethiopic',
    numberingSystem: 'latn',
    year: 'numeric',
  })
    .formatToParts(createdAt)
    .find((p) => p.type === 'year')?.value;
  if (!year) throw DomainException.validationError('Ethiopian year unavailable');
  return `STU/${String(schoolNumber).padStart(3, '0')}/${String(number).padStart(4, '0')}/${year.slice(-2).padStart(2, '0')}`;
}

/** Called inside the roster transaction, after the school directory lock. Never recycle IDs. */
export async function allocateStudentNumbers(c: PoolClient, school: string, count: number) {
  const existing = await c.query<{ highest: string }>(
    `SELECT COALESCE(max(COALESCE(substring(upper(login_id) from '^STU/[0-9]+/([0-9]+)/[0-9]{2}$'),substring(upper(login_id) from '(?:^|-)STU-([0-9]+)(?:-[0-9]{4})?$'))::numeric),0)::text highest
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
