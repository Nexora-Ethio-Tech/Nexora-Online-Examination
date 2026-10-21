import {
  Controller,
  Get,
  Post,
  Req,
  Param,
  Body,
  Headers,
  Query,
  HttpCode,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { Roles } from '../../common/guards/roles.guard';
import { Public } from '../../common/guards/session-auth.guard';
import { SkipCsrf } from '../../common/guards/csrf-origin.guard';
import { DomainException } from '../../common/errors/domain.exception';
import { ImportService } from './import.service';
import { WorkerSweepService } from './worker-sweep.service';

@Controller()
@Roles('teacher')
export class ImportController {
  constructor(private readonly imports: ImportService) {}
  @Post('imports')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 4 },
    }),
  )
  upload(
    @Req() req: Request,
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.imports.upload(req, body, file, key);
  }
  @Get('imports/:id')
  read(@Req() req: Request, @Param('id') id: string) {
    return this.imports.read(req, id);
  }
  @Post('imports/:id/cancel')
  @HttpCode(200)
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.imports.cancel(req, id, body, key);
  }
  @Post('imports/:id/ai-retry')
  @HttpCode(202)
  retry(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.imports.retry(req, id, body, key);
  }
}

@Controller()
export class ImportWorkerController {
  constructor(private readonly sweep: WorkerSweepService) {}

  private authorize(authorization: unknown, secret: string | undefined) {
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (
      !secret ||
      secret.length < 32 ||
      typeof authorization !== 'string' ||
      !timingSafeEqual(hash(authorization), hash(`Bearer ${secret}`))
    )
      throw DomainException.forbidden();
  }

  @Get('internal/import-worker')
  @HttpCode(200)
  @Public()
  @SkipCsrf()
  async cron(@Headers('authorization') authorization: unknown, @Query() query: unknown) {
    this.authorize(authorization, process.env.CRON_SECRET);
    return this.sweep.run(query);
  }

  @Post('internal/import-worker')
  @HttpCode(200)
  @Public()
  @SkipCsrf()
  async run(@Headers('authorization') authorization: unknown, @Body() input: unknown) {
    this.authorize(authorization, process.env.IMPORT_WORKER_SECRET);
    return this.sweep.run(input);
  }
}
