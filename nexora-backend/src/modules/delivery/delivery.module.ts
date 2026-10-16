import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DeviceBindingGuard } from '../../common/guards/device-binding.guard';

@Module({
  controllers: [DeliveryController],
  providers: [DeliveryService, DbService, ClockService, DeviceBindingGuard],
  exports: [DeliveryService],
})
export class DeliveryModule {}
