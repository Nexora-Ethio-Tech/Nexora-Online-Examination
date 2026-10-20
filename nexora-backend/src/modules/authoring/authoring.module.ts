import { GenerationService } from './generation.service';
import { GenerationController } from './generation.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { AuthoringService } from './authoring.service';
import { AuthoringController } from './authoring.controller';
import { ImportService } from './import.service';
import { ImportWorkerService, QuestionAiService } from './import-worker.service';
import { ImportController, ImportWorkerController } from './import.controller';
import { PackageWorkerService } from './package-worker.service';
import { WorkerSweepService } from './worker-sweep.service';
@Module({
  imports: [DatabaseModule],
  providers: [
    AuthoringService,
    GenerationService,
    ImportService,
    ImportWorkerService,
    QuestionAiService,
    PackageWorkerService,
    WorkerSweepService,
  ],
  controllers: [
    AuthoringController,
    ImportController,
    ImportWorkerController,
    GenerationController,
  ],
  exports: [AuthoringService, PackageWorkerService, WorkerSweepService],
})
export class AuthoringModule {}
