import { DirectoryModule } from './modules/directory/directory.module';
import { AuthoringModule } from './modules/authoring/authoring.module';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { OperationsModule } from './modules/operations/operations.module';
import { AuthModule } from './modules/auth/auth.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { DatabaseModule } from './common/db/database.module';
import { ClockService } from './common/clock/clock.service';
import { IdempotencyService } from './common/db/idempotency.service';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { ResponseHeadersInterceptor } from './common/interceptors/response-headers.interceptor';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    AuthoringModule,
    DirectoryModule,
    DatabaseModule,
    OperationsModule,
    AuthModule,
    DeliveryModule,
  ],
  providers: [
    Reflector,
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
  exports: [Reflector, DatabaseModule, ClockService, IdempotencyService],
})
export class AppModule {}
