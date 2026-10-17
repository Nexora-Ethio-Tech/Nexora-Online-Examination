import { captureResultSnapshot } from '../../common/db/result-snapshot';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { mutate } from '../../common/db/mutation';
import { DomainException } from '../../common/errors/domain.exception';
import { identity } from '../delivery/operational.service';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { AdministrationService, Session } from './administration.service';
import { SchedulingService } from './scheduling.service';
import {
  accommodationChangeSchema,
  accommodationStudentSchema,
  accommodationResultSchema,
  accommodationListSchema,
} from './accommodation-schemas';

@Injectable()
export class AccommodationsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
    private readonly admin: AdministrationService,
    private readonly scheduling: SchedulingService,
  ) {}
  async students(c: PoolClient, school: string, s: Session, after: string | null, limit: number) {
    const rows = (
      await c.query<{
        studentId: string;
        loginId: string;
        studentName: string;
        extraMinutes: number;
        lastChange: unknown;
      }>(
        `SELECT r.student_id "studentId",u.login_id "loginId",u.display_name "studentName",r.extra_time_minutes "extraMinutes",r.last_accommodation_change "lastChange" FROM session_roster r JOIN users u ON u.school_id=r.school_id AND u.id=r.student_id WHERE r.school_id=$1 AND r.session_id=$2 AND ($3::uuid IS NULL OR r.student_id>$3) ORDER BY r.student_id LIMIT $4`,
        [school, s.id, after, limit],
      )
    ).rows;
    return rows.map((r) =>
      accommodationStudentSchema.parse({
        ...r,
        deadlineAt: new Date(s.ends_at.getTime() + r.extraMinutes * 60000).toISOString(),
      }),
    );
  }
  async list(req: Request, id: string, input: unknown) {
    const { school } = identity(req, 'school_admin');
    parse(uuid, id);
    const q = parse(
        z
          .object({
            limit: z
              .string()
              .regex(/^\d+$/)
              .transform(Number)
              .pipe(z.number().int().min(1).max(100))
              .optional(),
            cursor: z.string().max(1000).optional(),
          })
          .strict(),
        input,
      ),
      limit = q.limit ?? 25;
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const s = await this.admin.session(c, school.id, id),
          e = await this.admin.exam(c, school.id, s.exam_id);
        let after: string | null = null;
        if (q.cursor) {
          let value;
          try {
            value = z
              .object({
                school: uuid,
                session: uuid,
                revision: z.number().int().positive(),
                student: uuid,
              })
              .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
          } catch {
            throw DomainException.validationError('Invalid accommodation cursor');
          }
          if (value.school !== school.id || value.session !== id)
            throw DomainException.validationError('Cursor belongs to another sitting');
          if (value.revision !== s.schedule_revision)
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              'Sitting changed; restart the list',
            );
          after = value.student;
        }
        const dto = await this.admin.sessionDto(c, school.id, s),
          rows = await this.students(c, school.id, s, after, limit + 1),
          items = rows.slice(0, limit),
          last = items.at(-1);
        return accommodationListSchema.parse({
          session: { ...dto, title: e.title, canEdit: dto.canReschedule },
          items,
          nextCursor:
            rows.length > limit && last
              ? Buffer.from(
                  JSON.stringify({
                    school: school.id,
                    session: id,
                    revision: s.schedule_revision,
                    student: last.studentId,
                  }),
                ).toString('base64url')
              : null,
          serverNow: this.clock.now().toISOString(),
        });
      },
      true,
    );
  }
  async change(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(accommodationChangeSchema.extend({ studentId: uuid }).strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const initial = await this.admin.session(c, school.id, id),
        e = await this.admin.exam(c, school.id, initial.exam_id, true),
        s = await this.admin.session(c, school.id, id, true);
      const member = (
        await c.query<{ extra_time_minutes: number }>(
          'SELECT extra_time_minutes FROM session_roster WHERE school_id=$1 AND session_id=$2 AND student_id=$3 FOR UPDATE',
          [school.id, id, body.studentId],
        )
      ).rows[0];
      if (!member) throw DomainException.notFound();
      return mutate(c, school.id, user.id, `session:${id}:accommodation`, key, body, async () => {
        await this.scheduling.gate(c, school.id, e);
        if (s.schedule_revision !== body.scheduleRevision)
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the sitting');
        await this.scheduling.editable(c, school.id, s);
        if (member.extra_time_minutes === body.extraMinutes)
          throw DomainException.validationError('Extra time is unchanged');
        const max = (
          await c.query<{ extra: number }>(
            'SELECT max(CASE WHEN student_id=$3 THEN $4 ELSE extra_time_minutes END) extra FROM session_roster WHERE school_id=$1 AND session_id=$2',
            [school.id, id, body.studentId, body.extraMinutes],
          )
        ).rows[0].extra;
        const latest = new Date(s.ends_at.getTime() + max * 60000);
        if ((s.planned_results_release_at ?? s.ends_at) < latest)
          throw DomainException.conflict(
            'RESULTS_TIME_CONFLICT',
            'Move planned results after the latest student deadline first',
          );
        await this.scheduling.overlap(c, school.id, e.id, s.preparation_visible_at, latest, id);
        const lastChange = {
          auditId: randomUUID(),
          actorName: user.displayName,
          at: this.clock.now().toISOString(),
          reason: body.reason,
          previousExtraMinutes: member.extra_time_minutes,
          extraMinutes: body.extraMinutes,
        };
        await c.query(
          'UPDATE session_roster SET extra_time_minutes=$1,last_accommodation_change=$2 WHERE school_id=$3 AND session_id=$4 AND student_id=$5',
          [body.extraMinutes, JSON.stringify(lastChange), school.id, id, body.studentId],
        );
        await c.query(
          'UPDATE exam_sessions SET schedule_revision=schedule_revision+1,results_revision=results_revision+1 WHERE school_id=$1 AND id=$2',
          [school.id, id],
        );
        await c.query(
          'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2',
          [school.id, e.id],
        );
        const updated = await this.admin.exam(c, school.id, e.id),
          sitting = await this.admin.session(c, school.id, id);
        await this.admin.history(
          c,
          req,
          updated,
          'accommodation_changed',
          body.reason,
          {
            ...lastChange,
            studentId: body.studentId,
            previousDeadlineAt: new Date(
              s.ends_at.getTime() + member.extra_time_minutes * 60000,
            ).toISOString(),
            deadlineAt: new Date(s.ends_at.getTime() + body.extraMinutes * 60000).toISOString(),
            previousScheduleRevision: s.schedule_revision,
            scheduleRevision: sitting.schedule_revision,
          },
          id,
        );
        const account = (
          await c.query<{ loginId: string; studentName: string }>(
            'SELECT login_id "loginId",display_name "studentName" FROM users WHERE school_id=$1 AND id=$2',
            [school.id, body.studentId],
          )
        ).rows[0];
        const dto = await this.admin.sessionDto(c, school.id, sitting);
        await captureResultSnapshot(c, school.id, id, false);
        return accommodationResultSchema.parse({
          session: { ...dto, title: e.title, canEdit: dto.canReschedule },
          student: {
            studentId: body.studentId,
            ...account,
            extraMinutes: body.extraMinutes,
            deadlineAt: new Date(s.ends_at.getTime() + body.extraMinutes * 60000).toISOString(),
            lastChange,
          },
          serverNow: this.clock.now().toISOString(),
        });
      });
    });
  }
}
