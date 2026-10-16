import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';

@Module({
  controllers: [OperationsController],
  providers: [DbService, ClockService],
  exports: [DbService, ClockService],
})
export class OperationsModule {}
