import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { GenerationService } from './generation.service';

@Controller()
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}
  @Get('school/ai-exam-settings')
  @Roles('teacher', 'school_admin')
  settings(@Req() req: Request) {
    return this.generation.settings(req);
  }
  @Patch('school/ai-exam-settings')
  @Roles('school_admin')
  save(@Req() req: Request, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    return this.generation.saveSettings(req, body, key);
  }
  @Post('exams/:id/generate')
  @HttpCode(202)
  @Roles('teacher')
  generate(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.generation.generate(req, id, body, key);
  }
}
