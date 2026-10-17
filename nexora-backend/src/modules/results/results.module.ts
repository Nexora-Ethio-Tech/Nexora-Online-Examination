import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';
import { ResultsService } from './results.service';
import { ResultsController } from './results.controller';
@Module({
  imports: [DatabaseModule],
  providers: [ClockService, ResultsService],
  controllers: [ResultsController],
  exports: [ResultsService],
})
export class ResultsModule {}
