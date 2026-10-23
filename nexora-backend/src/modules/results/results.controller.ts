import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Param,
  Query,
  Body,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Roles } from '../../common/guards/roles.guard';
import { parsePreparationInput as parse, resourceIdSchema } from '../delivery/preparation-schemas';
import { ResultsService } from './results.service';
const revision = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().safe().positive());
const exportQuery = z.object({ sessionId: resourceIdSchema, revision }).strict();
@Controller()
export class ResultsController {
  constructor(private readonly results: ResultsService) {}
  @Get('results/sessions') @Roles('teacher', 'school_admin') sessions(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    return this.results.sessions(req, query);
  }
  @Get('me/results') @Roles('student') mine(@Req() req: Request, @Query() query: unknown) {
    return this.results.mine(req, query);
  }
  @Get('sessions/:id/results') @Roles('teacher', 'school_admin') rows(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.results.rows(req, id, query);
  }
  @Get('sessions/:id/analytics') @Roles('teacher', 'school_admin') analytics(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const q = parse(z.object({ revision }).strict(), query);
    return this.results.exportReport(req, id, q.revision, true);
  }
  @Get('exports/report') @Roles('teacher', 'school_admin') report(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    const q = parse(exportQuery, query);
    return this.results.exportReport(req, q.sessionId, q.revision);
  }
  @Get('exports/results.csv') @Roles('teacher', 'school_admin') async csv(
    @Req() req: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const q = parse(z.union([exportQuery, z.object({}).strict()]), query);
    const csv = await this.results.csv(
      req,
      'sessionId' in q ? q.sessionId : undefined,
      'revision' in q ? q.revision : undefined,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nexora-results.csv"');
    return csv;
  }
  @Post('sessions/:id/results-release-schedule')
  @HttpCode(200)
  @Roles('school_admin')
  releaseSchedule(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.results.releaseSchedule(req, id, body, key);
  }
  @Post('sessions/:id/results-publication') @HttpCode(200) @Roles('school_admin') publish(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.results.publish(req, id, body, key);
  }
}
