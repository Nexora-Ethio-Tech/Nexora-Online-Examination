import {
  Module,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Request, Response } from 'express';
import { PlatformDb } from './platform-db';
import { PlatformService } from './platform.service';
import { GlobalExceptionFilter } from '../common/errors/global-exception.filter';
import { ResponseHeadersInterceptor } from '../common/interceptors/response-headers.interceptor';

// This controller is mounted only in the separate platform service deployment.
// Every method delegates to session/CSRF/owner checks inside PlatformService.
@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}
  @Get('auth/csrf') csrf(@Req() r: Request, @Res({ passthrough: true }) s: Response) {
    return this.service.csrf(r, s);
  }
  @Post('auth/login') @HttpCode(200) login(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
    @Body() b: unknown,
  ) {
    return this.service.login(r, s, b);
  }
  @Get('auth/me') me(@Req() r: Request) {
    return this.service.me(r);
  }
  @Post('auth/logout') @HttpCode(200) logout(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
  ) {
    return this.service.logout(r, s);
  }
  @Get('schools') schools(@Req() r: Request, @Query('after') a?: string) {
    return this.service.schools(r, a);
  }
  @Post('schools/:id/inspect') @HttpCode(200) inspect(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.inspect(r, id, b);
  }
  @Get('health') health(@Req() r: Request) {
    return this.service.health(r);
  }
  @Get('audit') audit(@Req() r: Request, @Query('before') b?: string) {
    return this.service.audits(r, b);
  }
  @Post('actions') @HttpCode(200) action(@Req() r: Request, @Body() b: unknown) {
    return this.service.action(r, b);
  }
}
@Module({
  controllers: [PlatformController],
  providers: [
    PlatformDb,
    PlatformService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseHeadersInterceptor },
  ],
})
export class PlatformModule {}
