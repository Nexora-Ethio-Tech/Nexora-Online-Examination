import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { loadBackendEnvironment } from '../src/common/db/database-config';
import { ImportWorkerService } from '../src/modules/authoring/import-worker.service';
import { PackageWorkerService } from '../src/modules/authoring/package-worker.service';
loadBackendEnvironment();
async function main() {
  const args = process.argv.slice(2),
    position = args.indexOf('--school'),
    school = z
      .string()
      .uuid()
      .parse(position >= 0 ? args[position + 1] : undefined),
    once = args.includes('--once');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      stopping = true;
    });
  try {
    do {
      const packageProcessed = await app.get(PackageWorkerService).run(school),
        imports = await app.get(ImportWorkerService).run(school);
      if (imports.parsed || imports.aiProcessed || packageProcessed)
        process.stdout.write(JSON.stringify({ ...imports, packageProcessed }) + '\n');
      if (!once && !stopping) await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (!once && !stopping);
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
