import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';
import { PracticeService } from './practice.service';
import { PracticeController } from './practice.controller';
@Module({
  imports: [DatabaseModule],
  providers: [ClockService, PracticeService],
  controllers: [PracticeController],
})
export class PracticeModule {}
