import { practiceGate } from '../../common/db/practice-access';
import { captureResultSnapshot } from '../../common/db/result-snapshot';
import { Injectable } from '@nestjs/common';
import { requireSchedulingSubscription } from '../../platform/subscription';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { mutate } from '../../common/db/mutation';
import { DomainException } from '../../common/errors/domain.exception';
import { identity } from '../delivery/operational.service';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { AdministrationService, AdminExam, Session } from './administration.service';
import { scheduleSchema, rescheduleSchema } from './schemas';

@Injectable()
export class SchedulingService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
    private readonly admin: AdministrationService,
  ) {}
  async gate(c: PoolClient, school: string, e: AdminExam) {
    const v = await this.admin.version(c, school, e.id);
    if (
      e.state !== 'approved' ||
      !v ||
      (
        await c.query('SELECT id FROM exam_packages WHERE school_id=$1 AND exam_version_id=$2', [
          school,
          v.id,
        ])
      ).rowCount !== 1
    )
      throw DomainException.conflict('REVISION_CONFLICT', 'Approved package must be ready');
    await practiceGate(c, school, v.id, this.clock.now(), true);
    const practice = (
      await c.query(
        'SELECT id FROM practice_access WHERE school_id=$1 AND exam_version_id=$2 AND (enabled OR released_at IS NOT NULL)',
        [school, v.id],
      )
    ).rowCount;
    if (practice)
      throw DomainException.conflict(
        'REVISION_CONFLICT',
        'Practice access prevents official scheduling',
      );
    return v;
  }
  async overlap(
    c: PoolClient,
    school: string,
    exam: string,
    prep: Date,
    latest: Date,
    except: string | null = null,
  ) {
    const conflicts = await c.query(
      `SELECT s.id FROM exam_sessions s WHERE s.school_id=$1 AND s.exam_id=$2 AND ($5::uuid IS NULL OR s.id<>$5) AND s.preparation_visible_at<$4 AND s.ends_at+make_interval(mins=>COALESCE((SELECT max(extra_time_minutes) FROM session_roster r WHERE r.school_id=s.school_id AND r.session_id=s.id),0))>$3 LIMIT 1`,
      [school, exam, prep, latest, except],
    );
    if (conflicts.rowCount)
      throw DomainException.conflict(
        'SCHEDULE_OVERLAP',
        'The sitting overlaps another sitting of this paper',
      );
  }
  async editable(c: PoolClient, school: string, s: Session) {
    if (
      this.clock.now() >= s.preparation_visible_at ||
      (
        await c.query('SELECT id FROM attempts WHERE school_id=$1 AND session_id=$2 LIMIT 1', [
          school,
          s.id,
        ])
      ).rowCount
    )
      throw DomainException.conflict(
        'ACCOMMODATIONS_LOCKED',
        'Preparation or delivery has started',
      );
  }
  times(preparation: string, duration: number, release: string, extra = 0) {
    const prep = new Date(preparation),
      starts = new Date(prep.getTime() + 600000),
      ends = new Date(starts.getTime() + duration * 60000),
      latest = new Date(ends.getTime() + extra * 60000),
      results = new Date(release);
    if (prep <= this.clock.now())
      throw DomainException.validationError('Choose a future preparation time');
    if (results < latest)
      throw DomainException.conflict(
        'RESULTS_TIME_CONFLICT',
        'Planned results must follow every student deadline',
      );
    return { prep, starts, ends, latest, results };
  }
  async create(req: Request, id: string, input: unknown, key: unknown, onCreate?: () => void) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(scheduleSchema.strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.admin.exam(c, school.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:schedule`, key, body, async () => {
        await requireSchedulingSubscription(c, school.id);
        const v = await this.gate(c, school.id, e);
        if (e.revision !== body.revision || v.version !== body.approvedVersion)
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the approved paper');
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${school.id}:directory`,
        ]);
        const roster = (
          await c.query<{ student_id: string }>(
            "SELECT en.student_id FROM enrollments en JOIN users u ON u.school_id=en.school_id AND u.id=en.student_id WHERE en.school_id=$1 AND en.class_id=$2 AND u.role='student' AND u.status='active' ORDER BY en.student_id FOR SHARE OF en,u",
            [school.id, e.class_id],
          )
        ).rows;
        if (!roster.length)
          throw DomainException.validationError('The approved class has no eligible students');
        const times = this.times(
          body.preparationVisibleAt,
          e.duration_minutes,
          body.resultsReleaseAt,
        );
        await this.overlap(c, school.id, e.id, times.prep, times.latest);
        const s = (
          await c.query<Session>(
            'INSERT INTO exam_sessions(school_id,exam_id,exam_version_id,preparation_visible_at,starts_at,ends_at,planned_results_release_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [school.id, id, v.id, times.prep, times.starts, times.ends, times.results],
          )
        ).rows[0];
        await c.query(
          'INSERT INTO session_roster(school_id,session_id,student_id) SELECT $1,$2,unnest($3::uuid[])',
          [school.id, s.id, roster.map((r) => r.student_id)],
        );
        await c.query(
          'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2',
          [school.id, id],
        );
        const updated = await this.admin.exam(c, school.id, id);
        await this.admin.history(
          c,
          req,
          updated,
          'scheduled',
          'Scheduled class sitting',
          { ...times, rosterCount: roster.length },
          s.id,
        );
        await captureResultSnapshot(c, school.id, s.id, false);
        onCreate?.();
        return this.admin.detail(c, school.id, updated);
      });
    });
  }
  async reschedule(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(rescheduleSchema.strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const initial = await this.admin.session(c, school.id, id);
      const e = await this.admin.exam(c, school.id, initial.exam_id, true);
      const s = await this.admin.session(c, school.id, id, true);
      return mutate(c, school.id, user.id, `session:${id}:reschedule`, key, body, async () => {
        await requireSchedulingSubscription(c, school.id);
        await this.gate(c, school.id, e);
        if (s.schedule_revision !== body.scheduleRevision)
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the sitting');
        await this.editable(c, school.id, s);
        const max = (
          await c.query<{ extra: number }>(
            'SELECT COALESCE(max(extra_time_minutes),0) extra FROM session_roster WHERE school_id=$1 AND session_id=$2',
            [school.id, id],
          )
        ).rows[0].extra;
        const times = this.times(
          body.preparationVisibleAt,
          e.duration_minutes,
          body.resultsReleaseAt,
          max,
        );
        await this.overlap(c, school.id, e.id, times.prep, times.latest, id);
        await c.query(
          'UPDATE exam_sessions SET preparation_visible_at=$1,starts_at=$2,ends_at=$3,planned_results_release_at=$4,schedule_revision=schedule_revision+1,results_revision=results_revision+1 WHERE school_id=$5 AND id=$6',
          [times.prep, times.starts, times.ends, times.results, school.id, id],
        );
        await c.query(
          'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2',
          [school.id, e.id],
        );
        const updated = await this.admin.exam(c, school.id, e.id);
        await this.admin.history(
          c,
          req,
          updated,
          'rescheduled',
          body.reason,
          { before: s, after: times },
          id,
        );
        await captureResultSnapshot(c, school.id, id, false);
        return this.admin.detail(c, school.id, updated);
      });
    });
  }
}
