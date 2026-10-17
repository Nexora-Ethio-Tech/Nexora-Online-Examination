import { PoolClient } from 'pg';
import { z } from 'zod';
import { DomainException } from '../errors/domain.exception';

const id = z.string().min(1),
  time = z.string().datetime();
export const resultSourceSchema = z.object({
  session: z.object({
    sessionId: id,
    examId: id,
    examVersion: z.number().int().positive(),
    title: id,
    className: id,
    subjectName: id,
    passPercent: z.number().min(0).max(100),
    endsAt: time,
    publishableAfter: time,
    plannedReleaseAt: time,
    revision: z.number().int().positive(),
  }),
  items: z
    .array(z.object({ itemId: id, marks: z.number().int().positive(), correctKey: id, topic: id }))
    .min(1),
  rows: z.array(
    z.object({
      studentId: id,
      studentName: id,
      loginId: id,
      attemptId: id.nullable(),
      state: z.string().nullable(),
      receiptId: id.nullable(),
      pendingRecovery: z.boolean(),
      score: z.number().int().nonnegative().nullable(),
      answers: z.array(z.object({ itemId: id, value: id.nullable() })),
    }),
  ),
});
export type ResultSource = z.infer<typeof resultSourceSchema>;

export async function currentResultSource(
  c: PoolClient,
  school: string,
  session: string,
): Promise<ResultSource> {
  const raw = (
    await c.query<{
      sessionId: string;
      examId: string;
      examVersion: number;
      title: string;
      className: string;
      subjectName: string;
      passPercent: string | number;
      endsAt: Date;
      publishableAfter: Date;
      plannedReleaseAt: Date;
      revision: number;
    }>(
      `SELECT s.id "sessionId",e.id "examId",v.version "examVersion",COALESCE(v.frozen_metadata->>'title',e.title) title,cl.name "className",sub.name "subjectName",COALESCE((v.frozen_metadata->>'passPercent')::numeric,e.pass_percent) "passPercent",s.ends_at "endsAt",s.ends_at+make_interval(mins=>COALESCE((SELECT max(extra_time_minutes) FROM session_roster r WHERE r.school_id=s.school_id AND r.session_id=s.id),0))+interval '5 seconds' "publishableAfter",COALESCE(s.planned_results_release_at,s.ends_at) "plannedReleaseAt",s.results_revision revision FROM exam_sessions s JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id JOIN exam_versions v ON v.school_id=s.school_id AND v.id=s.exam_version_id JOIN classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id JOIN subjects sub ON sub.school_id=e.school_id AND sub.id=e.subject_id WHERE s.school_id=$1 AND s.id=$2`,
      [school, session],
    )
  ).rows[0];
  if (!raw) throw DomainException.notFound();
  const items = (
    await c.query(
      'SELECT item_id "itemId",marks,correct_key "correctKey",COALESCE(NULLIF(primary_topic,\'\'),\'Unclassified\') topic FROM exam_items WHERE school_id=$1 AND exam_version_id=(SELECT exam_version_id FROM exam_sessions WHERE school_id=$1 AND id=$2) ORDER BY position,item_id',
      [school, session],
    )
  ).rows;
  const rows = (
    await c.query(
      `SELECT r.student_id "studentId",u.display_name "studentName",u.login_id "loginId",a.id "attemptId",a.state,s.id "receiptId",EXISTS(SELECT 1 FROM recovery_uploads x WHERE x.school_id=r.school_id AND x.attempt_id=a.id AND x.status='recovery_pending') "pendingRecovery",o.score,COALESCE(s.answers_snapshot,'[]'::jsonb) answers FROM session_roster r JOIN users u ON u.school_id=r.school_id AND u.id=r.student_id LEFT JOIN attempts a ON a.school_id=r.school_id AND a.session_id=r.session_id AND a.student_id=r.student_id LEFT JOIN submissions s ON s.school_id=a.school_id AND s.attempt_id=a.id LEFT JOIN LATERAL(SELECT score FROM official_results o WHERE o.school_id=a.school_id AND o.attempt_id=a.id AND o.source_submission_id=s.id AND o.status='completed' ORDER BY revision DESC LIMIT 1)o ON true WHERE r.school_id=$1 AND r.session_id=$2 ORDER BY u.login_id,r.student_id`,
      [school, session],
    )
  ).rows;
  return resultSourceSchema.parse({
    session: {
      ...raw,
      passPercent: Number(raw.passPercent),
      endsAt: raw.endsAt.toISOString(),
      publishableAfter: raw.publishableAfter.toISOString(),
      plannedReleaseAt: raw.plannedReleaseAt.toISOString(),
    },
    items,
    rows,
  });
}

/** Call in the same transaction as the academic mutation, after locking the sitting. */
export async function captureResultSnapshot(
  c: PoolClient,
  school: string,
  session: string,
  advance = true,
) {
  if (advance)
    await c.query(
      'UPDATE exam_sessions SET results_revision=results_revision+1 WHERE school_id=$1 AND id=$2',
      [school, session],
    );
  else
    await c.query('SELECT id FROM exam_sessions WHERE school_id=$1 AND id=$2 FOR UPDATE', [
      school,
      session,
    ]);
  const source = await currentResultSource(c, school, session);
  await c.query(
    'INSERT INTO result_snapshots(school_id,session_id,revision,source) VALUES($1,$2,$3,$4)',
    [school, session, source.session.revision, JSON.stringify(source)],
  );
  return source.session.revision;
}
