import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';
import { AuthoringModule } from '../authoring/authoring.module';
import { AdministrationService } from './administration.service';
import { AdministrationController } from './administration.controller';
import { SchedulingService } from './scheduling.service';
import { AccommodationsService } from './accommodations.service';
@Module({
  imports: [DatabaseModule, AuthoringModule],
  providers: [ClockService, AdministrationService, SchedulingService, AccommodationsService],
  controllers: [AdministrationController],
  exports: [AdministrationService],
})
export class AdministrationModule {}
