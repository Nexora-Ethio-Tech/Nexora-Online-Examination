import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { loadBackendEnvironment } from '../src/common/db/database-config';
import { WorkerSweepService } from '../src/modules/authoring/worker-sweep.service';
loadBackendEnvironment();
async function main() {
  const args = process.argv.slice(2),
    position = args.indexOf('--school'),
    school = z
      .string()
      .uuid()
      .optional()
      .parse(position >= 0 ? args[position + 1] : undefined),
    once = args.includes('--once');
  if (position >= 0 && !school) throw new Error('Missing school UUID');
  if (
    args.some(
      (arg, index) =>
        !['--school', '--once'].includes(arg) && !(position >= 0 && index === position + 1),
    )
  )
    throw new Error('Unknown worker argument');
  process.stdout.write(
    school
      ? 'Worker starting for the selected school.\n'
      : 'Worker starting with automatic active-school discovery.\n',
  );
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  process.stdout.write(
    'Worker ready. Checking for imports every second. Keep this terminal open.\n',
  );
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      stopping = true;
    });
  try {
    let afterSchoolId: string | undefined;
    do {
      const result = await app.get(WorkerSweepService).run({ schoolId: school, afterSchoolId });
      afterSchoolId = result.nextCursor ?? undefined;
      if (result.parsed || result.aiProcessed || result.packageProcessed)
        process.stdout.write(JSON.stringify(result) + '\n');
      if (once && !afterSchoolId) break;
      if (!once && !stopping) await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (!stopping);
  } finally {
    await app.close();
  }
}
main().catch(() => {
  process.stderr.write(
    'Worker stopped. Check the school UUID, private environment and database availability; job leases remain recoverable.\n',
  );
  process.exitCode = 1;
});
