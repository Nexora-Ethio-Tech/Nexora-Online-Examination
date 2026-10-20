import { Body, Controller, Get, Param, Post, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { AssistanceService } from './assistance.service';

@Controller()
export class AssistanceController {
  constructor(private readonly assistance: AssistanceService) {}

  @Roles('teacher', 'school_admin')
  @Get('assistance/sessions')
  sessions(@Req() req: Request) {
    return this.assistance.sessions(req);
  }

  @Roles('school_admin')
  @Get('assistance/sessions/:id/staff')
  staff(@Req() req: Request, @Param('id') id: string) {
    return this.assistance.assignments(req, id);
  }

  @Roles('school_admin')
  @Post('assistance/sessions/:id/staff')
  @HttpCode(200)
  assign(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    return this.assistance.assignments(req, id, input);
  }

  @Roles('teacher', 'school_admin')
  @Get('assistance/sessions/:id/requests')
  inbox(@Req() req: Request, @Param('id') id: string) {
    return this.assistance.inbox(req, id);
  }

  @Roles('teacher', 'school_admin')
  @Post('assistance/requests/:id/decision')
  @HttpCode(200)
  decide(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    return this.assistance.decide(req, id, input);
  }

  @Roles('student')
  @Get('attempts/:id/assistance')
  read(@Req() req: Request, @Param('id') id: string) {
    return this.assistance.student(req, id);
  }

  @Roles('student')
  @Post('attempts/:id/assistance')
  @HttpCode(200)
  request(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    return this.assistance.student(req, id, input);
  }
}
