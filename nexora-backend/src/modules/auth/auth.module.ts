import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, DbService, ClockService],
  exports: [AuthService],
})
export class AuthModule {}
