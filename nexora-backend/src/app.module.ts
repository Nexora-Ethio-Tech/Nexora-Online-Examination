import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { OperationsModule } from './modules/operations/operations.module';
import { AuthModule } from './modules/auth/auth.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { DbService } from './common/db/db.service';
import { ClockService } from './common/clock/clock.service';
import { IdempotencyService } from './common/db/idempotency.service';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { ResponseHeadersInterceptor } from './common/interceptors/response-headers.interceptor';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [OperationsModule, AuthModule, DeliveryModule],
  providers: [
    Reflector,
    DbService,
    ClockService,
    IdempotencyService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseHeadersInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [Reflector, DbService, ClockService, IdempotencyService],
})
export class AppModule {}
