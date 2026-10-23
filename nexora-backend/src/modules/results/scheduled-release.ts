import { PoolClient } from 'pg';
import { currentResultSource, captureResultSnapshot } from '../../common/db/result-snapshot';
import { DomainException } from '../../common/errors/domain.exception';
import { renderReport } from './render-report';

export function releaseDue(now: Date, planned: Date, acceptanceCloses: Date) {
  return now >= planned && now > acceptanceCloses;
}
export function assertReleaseChange(now: Date, current: Date, next: Date, acceptanceCloses: Date) {
  if (now >= current)
    throw DomainException.conflict(
      'RESULTS_NOT_RELEASED',
      'The release time has arrived and cannot be changed.',
    );
  if (next <= now || next < acceptanceCloses)
    throw DomainException.validationError(
      'Choose a future release time after every submission window closes.',
    );
}
/** Called only after caller authorization, in a writable tenant transaction. Session lock
 * serializes publication with submissions, recovery, supervision and release-date edits. */
export async function releaseScheduledResults(
  c: PoolClient,
  school: string,
  id: string,
  clock: () => Date,
) {
  const session = (
    await c.query<{
      planned_results_release_at: Date | null;
      ends_at: Date;
      results_revision: number;
    }>(
      'SELECT planned_results_release_at,ends_at,results_revision FROM exam_sessions WHERE school_id=$1 AND id=$2 FOR UPDATE',
      [school, id],
    )
  ).rows[0];
  const now = clock();
  if (!session || now < (session.planned_results_release_at ?? session.ends_at)) return;
  if (
    (
      await c.query(
        'SELECT id FROM result_publications WHERE school_id=$1 AND session_id=$2 AND revision=$3',
        [school, id, session.results_revision],
      )
    ).rowCount
  )
    return;
  const source = await currentResultSource(c, school, id);
  const due = new Date(source.session.plannedReleaseAt),
    after = new Date(source.session.publishableAfter);
  if (!releaseDue(now, due, after)) return;
  const report = renderReport(
    source,
    {
      revision: source.session.revision,
      approvedAt: now.toISOString(),
      approvedBy: 'Automatic scheduled release',
      releaseAt: new Date(Math.max(due.getTime(), after.getTime() + 1)).toISOString(),
      reason: 'Released at the school-scheduled time',
      exclusions: [],
    },
    now.toISOString(),
  );
  await c.query(
    `INSERT INTO result_publications(school_id,session_id,revision,results_approved_at,results_release_at,excluded_attempt_ids,approved_by,reason,actor_name,report_snapshot,automatic) VALUES($1,$2,$3,$4,$5,'[]'::jsonb,NULL,$6,$7,$8,true)`,
    [
      school,
      id,
      source.session.revision,
      now,
      report.summary.publication?.releaseAt,
      'Released at the school-scheduled time',
      'Automatic scheduled release',
      JSON.stringify(report),
    ],
  );
  await c.query(
    "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,server_at) VALUES($1,NULL,'results:auto_release',$2,'Released at the school-scheduled time',$3)",
    [school, id, now],
  );
}
export async function changeReleaseSchedule(
  c: PoolClient,
  school: string,
  id: string,
  actor: string,
  clock: () => Date,
  expected: string,
  releaseAt: string,
) {
  const row = (
    await c.query<{ planned_results_release_at: Date | null; ends_at: Date }>(
      'SELECT planned_results_release_at,ends_at FROM exam_sessions WHERE school_id=$1 AND id=$2 FOR UPDATE',
      [school, id],
    )
  ).rows[0];
  if (!row) throw DomainException.notFound();
  const now = clock();
  const current = row.planned_results_release_at ?? row.ends_at;
  if (current.getTime() !== Date.parse(expected))
    throw DomainException.conflict(
      'REVISION_CONFLICT',
      'The release date changed. Refresh before editing.',
    );
  const source = await currentResultSource(c, school, id);
  assertReleaseChange(now, current, new Date(releaseAt), new Date(source.session.publishableAfter));
  if (
    (
      await c.query(
        'SELECT id FROM result_publications WHERE school_id=$1 AND session_id=$2 AND results_release_at<=$3 LIMIT 1',
        [school, id, now],
      )
    ).rowCount
  )
    throw DomainException.conflict(
      'RESULTS_NOT_RELEASED',
      'Released results cannot be hidden again.',
    );
  await c.query(
    'UPDATE exam_sessions SET planned_results_release_at=$3 WHERE school_id=$1 AND id=$2',
    [school, id, releaseAt],
  );
  await captureResultSnapshot(c, school, id);
  await c.query(
    "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,server_at) VALUES($1,$2,'results:reschedule',$3,$4,$5)",
    [school, actor, id, `${current.toISOString()} → ${releaseAt}`, now],
  );
}
