import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { parsePreparationInput } from '../delivery/preparation-schemas';
import { ImportWorkerService } from './import-worker.service';
import { PackageWorkerService } from './package-worker.service';
import { workerSchoolIds } from './worker-scope';

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
    const candidates = options.schoolId
      ? [options.schoolId]
      : workerSchoolIds().filter((id) => !options.afterSchoolId || id > options.afterSchoolId);
    const selected = candidates[0];
    if (!selected)
      return { parsed: false, aiProcessed: 0, packageProcessed: false, nextCursor: null };
    const nextCursor = candidates.length > 1 ? selected : null;
    const schools = await this.db.tenantQuery<{ id: string }>(
      selected,
      "SELECT id FROM schools WHERE status = 'active' AND id = $1",
      [selected],
    );
    const school = schools.rows[0];
    if (!school) {
      return { parsed: false, aiProcessed: 0, packageProcessed: false, nextCursor };
    }
    const packageProcessed = await this.packages.run(school.id);
    const imported = await this.imports.run(school.id);
    return {
      ...imported,
      packageProcessed,
      nextCursor,
    };
  }
}
