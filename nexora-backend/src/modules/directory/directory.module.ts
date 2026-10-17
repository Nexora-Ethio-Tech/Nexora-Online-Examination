import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/db/database.module';
import { ClockService } from '../../common/clock/clock.service';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { RosterService } from './roster.service';
@Module({
  imports: [DatabaseModule],
  controllers: [DirectoryController],
  providers: [DirectoryService, RosterService, ClockService],
})
export class DirectoryModule {}
