import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  Param,
  Query,
  Body,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { AdministrationService } from './administration.service';
import { SchedulingService } from './scheduling.service';
import { AccommodationsService } from './accommodations.service';
@Controller()
@Roles('school_admin')
export class AdministrationController {
  constructor(
    private readonly admin: AdministrationService,
    private readonly schedules: SchedulingService,
    private readonly accommodations: AccommodationsService,
  ) {}
  @Get('admin/exams') list(@Req() req: Request, @Query() query: unknown) {
    return this.admin.list(req, query);
  }
  @Get('admin/exams/:id') read(@Req() req: Request, @Param('id') id: string) {
    return this.admin.read(req, id);
  }
  @Post('exams/:id/approve') @HttpCode(200) approve(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.admin.decide(req, id, 'approve', body, key);
  }
  @Post('exams/:id/return') @HttpCode(200) returnPaper(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.admin.decide(req, id, 'return', body, key);
  }
  @Post('exams/:id/package-retry') @HttpCode(200) retry(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.admin.retryPackage(req, id, body, key);
  }
  @Post('exams/:id/sessions') async schedule(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let created = false;
    const data = await this.schedules.create(req, id, body, key, () => {
      created = true;
    });
    res.status(created ? 201 : 200);
    return data;
  }
  @Patch('sessions/:id/schedule') reschedule(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.schedules.reschedule(req, id, body, key);
  }
  @Get('admin/sessions/:id/accommodations') roster(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.accommodations.list(req, id, query);
  }
  @Patch('sessions/:id/accommodations') extraTime(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.accommodations.change(req, id, body, key);
  }
}
