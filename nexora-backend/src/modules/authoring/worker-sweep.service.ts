import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { parsePreparationInput } from '../delivery/preparation-schemas';
import { ImportWorkerService } from './import-worker.service';
import { PackageWorkerService } from './package-worker.service';

const sweepSchema = z
  .object({
    schoolId: z.string().uuid().optional(),
    afterSchoolId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => !(value.schoolId && value.afterSchoolId), {
    message: 'Choose a school or a sweep cursor, not both',
  });

@Injectable()
export class WorkerSweepService {
  constructor(
    private readonly db: DbService,
    private readonly imports: ImportWorkerService,
    private readonly packages: PackageWorkerService,
  ) {}

  // One school per request keeps provider work bounded. The scheduler follows nextCursor.
  // Existing database leases continue to arbitrate concurrent/repeated triggers.
  async run(input: unknown) {
    const options = parsePreparationInput(sweepSchema, input ?? {});
    const schools = await this.db.query<{ id: string }>(
      `SELECT id FROM schools WHERE status = 'active'
       AND ($1::uuid IS NULL OR id = $1)
       AND ($2::uuid IS NULL OR id > $2)
       ORDER BY id LIMIT 2`,
      [options.schoolId ?? null, options.afterSchoolId ?? null],
    );
    const school = schools.rows[0];
    if (!school) {
      return { parsed: false, aiProcessed: 0, packageProcessed: false, nextCursor: null };
    }
    const packageProcessed = await this.packages.run(school.id);
    const imported = await this.imports.run(school.id);
    return {
      ...imported,
      packageProcessed,
      nextCursor: schools.rows.length > 1 ? school.id : null,
    };
  }
}
