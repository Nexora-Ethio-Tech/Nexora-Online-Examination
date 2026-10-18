import {
  Controller,
  Get,
  Post,
  Req,
  Param,
  Body,
  Headers,
  HttpCode,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { Roles } from '../../common/guards/roles.guard';
import { Public } from '../../common/guards/session-auth.guard';
import { SkipCsrf } from '../../common/guards/csrf-origin.guard';
import { DomainException } from '../../common/errors/domain.exception';
import { parsePreparationInput } from '../delivery/preparation-schemas';
import { ImportService } from './import.service';
import { ImportWorkerService } from './import-worker.service';
import { PackageWorkerService } from './package-worker.service';

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
  constructor(
    private readonly worker: ImportWorkerService,
    private readonly packages: PackageWorkerService,
  ) {}
  @Post('internal/import-worker')
  @HttpCode(200)
  @Public()
  @SkipCsrf()
  async run(@Headers('authorization') authorization: unknown, @Body() input: unknown) {
    const secret = process.env.IMPORT_WORKER_SECRET;
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (
      !secret ||
      secret.length < 32 ||
      typeof authorization !== 'string' ||
      !timingSafeEqual(hash(authorization), hash(`Bearer ${secret}`))
    )
      throw DomainException.forbidden();
    const { schoolId } = parsePreparationInput(
      z.object({ schoolId: z.string().uuid() }).strict(),
      input,
    );
    const packageProcessed = await this.packages.run(schoolId);
    return { ...(await this.worker.run(schoolId)), packageProcessed };
  }
}
