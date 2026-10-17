import { Controller, Get, Post, Req, Param, Query, Body, Headers, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { PracticeService } from './practice.service';
@Controller()
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}
  @Roles('school_admin') @Get('admin/practice-exams') admin(
    @Req() req: Request,
    @Query() q: unknown,
  ) {
    return this.practice.list(req, q, true);
  }
  @Roles('school_admin') @Get('exams/:id/practice-access') access(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.practice.access(req, id);
  }
  @Roles('school_admin') @Post('exams/:id/practice-access') @HttpCode(200) settings(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.practice.settings(req, id, body, key);
  }
  @Roles('student') @Get('me/practice') mine(@Req() req: Request, @Query() q: unknown) {
    return this.practice.list(req, q);
  }
  @Roles('student') @Post('exams/:id/practice-attempts') @HttpCode(200) start(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.practice.start(req, id, body, key);
  }
  @Roles('student') @Get('practice-attempts/:id') attempt(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.practice.attempt(req, id);
  }
  @Roles('student') @Post('practice-attempts/:id/answers') @HttpCode(200) answer(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.practice.attempt(req, id, 'answer', body, key);
  }
  @Roles('student') @Post('practice-attempts/:id/complete') @HttpCode(200) complete(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.practice.attempt(req, id, 'complete', body, key);
  }
}
