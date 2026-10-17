import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OperationsController],
  providers: [ClockService],
  exports: [DatabaseModule, ClockService],
})
export class OperationsModule {}
