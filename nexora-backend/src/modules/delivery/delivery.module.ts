import { OperationalService } from './operational.service';
import { RecoveryReviewService } from './recovery-review.service';
import { MonitorService } from './monitor.service';
import { SupervisionService } from './supervision.service';
import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { PreparationService } from './preparation.service';
import { DeliveryService } from './delivery.service';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';
import { DeviceBindingGuard } from '../../common/guards/device-binding.guard';
import { AssistanceController } from './assistance.controller';
import { AssistanceService } from './assistance.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DeliveryController, AssistanceController],
  providers: [
    RecoveryReviewService,
    SupervisionService,
    OperationalService,
    MonitorService,
    PreparationService,
    DeliveryService,
    ClockService,
    DeviceBindingGuard,
    AssistanceService,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
