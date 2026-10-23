import { PoolClient } from 'pg';
/** Shared by scheduling, configuration and student reads. Call under the exam lock for writes. */
export async function practiceGate(
  c: PoolClient,
  school: string,
  version: string,
  now: Date,
  persist = false,
) {
  const config = (
    await c.query<{
      enabled: boolean;
      release_at: Date | null;
      released_at: Date | null;
      revision: number;
    }>(
      'SELECT enabled,release_at,released_at,revision FROM practice_access WHERE school_id=$1 AND exam_version_id=$2',
      [school, version],
    )
  ).rows[0];
  const sittings = (
    await c.query<{ deadline: Date; released: Date | null }>(
      `SELECT s.ends_at+make_interval(mins=>COALESCE((SELECT max(extra_time_minutes) FROM session_roster r WHERE r.school_id=s.school_id AND r.session_id=s.id),0))+interval '5 seconds' deadline,(SELECT GREATEST(min(results_release_at),s.planned_results_release_at) FROM result_publications p WHERE p.school_id=s.school_id AND p.session_id=s.id HAVING count(*)>0) released FROM exam_sessions s WHERE s.school_id=$1 AND s.exam_version_id=$2`,
      [school, version],
    )
  ).rows;
  const blockers: string[] = [];
  if (!config?.enabled) blockers.push('Your administrator has not enabled practice.');
  if (!config?.release_at || now < config.release_at)
    blockers.push('The practice release time has not arrived.');
  if (!sittings.length) blockers.push('An official sitting is required.');
  if (sittings.some((s) => !s.released || now < s.released))
    blockers.push('Every related sitting needs released official results.');
  if (sittings.some((s) => now <= s.deadline))
    blockers.push('An official submission window is still open.');
  const available = blockers.length === 0;
  let released = config?.released_at ?? null;
  if (!released && available && config?.release_at) {
    released = new Date(
      Math.max(
        config.release_at.getTime(),
        ...sittings.map((s) => Math.max(s.deadline.getTime() + 1, s.released?.getTime() ?? 0)),
      ),
    );
    if (persist)
      await c.query(
        'UPDATE practice_access SET released_at=$3 WHERE school_id=$1 AND exam_version_id=$2 AND released_at IS NULL',
        [school, version, released],
      );
  }
  return {
    enabled: config?.enabled ?? false,
    releaseAt: config?.release_at?.toISOString() ?? null,
    revision: config?.revision ?? 1,
    available,
    blockers,
    contentReleasedAt: released?.toISOString() ?? null,
  };
}
export async function practiceStats(
  c: PoolClient,
  school: string,
  student: string,
  version: string,
) {
  const rows = (
    await c.query<{ id: string; score: number; max_score: number; completed_at: Date }>(
      "SELECT id,score,max_score,completed_at FROM practice_attempts WHERE school_id=$1 AND student_id=$2 AND exam_version_id=$3 AND valid AND state='completed' ORDER BY (score::numeric/NULLIF(max_score,0)) DESC,completed_at,id",
      [school, student, version],
    )
  ).rows;
  const best = rows[0],
    active = (
      await c.query<{ id: string }>(
        "SELECT id FROM practice_attempts WHERE school_id=$1 AND student_id=$2 AND exam_version_id=$3 AND valid AND state='active' ORDER BY created_at DESC,id DESC LIMIT 1",
        [school, student, version],
      )
    ).rows[0];
  return {
    bestPercent: best ? (100 * best.score) / best.max_score : null,
    bestAttemptId: best?.id ?? null,
    completedCount: rows.length,
    activeAttemptId: active?.id ?? null,
  };
}
