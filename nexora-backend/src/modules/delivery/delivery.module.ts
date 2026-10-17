import { OperationalService } from './operational.service';
import { MonitorService } from './monitor.service';
import { SupervisionService } from './supervision.service';
import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { PreparationService } from './preparation.service';
import { DeliveryService } from './delivery.service';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';
import { DeviceBindingGuard } from '../../common/guards/device-binding.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [DeliveryController],
  providers: [
    SupervisionService,
    OperationalService,
    MonitorService,
    PreparationService,
    DeliveryService,
    ClockService,
    DeviceBindingGuard,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
