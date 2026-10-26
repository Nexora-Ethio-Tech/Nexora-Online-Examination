import type { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { loadBackendEnvironment } from './common/db/database-config';
import { AppModule } from './app.module';
import { ownerDispatch } from './combined-routing';
import type { RequestHandler } from 'express';
import { configureCors } from './common/security/origins';

loadBackendEnvironment();

async function bootstrap() {
  const mode = process.env.NEXORA_SERVICE ?? 'school';
  if (!['school', 'platform', 'combined'].includes(mode))
    throw new Error('NEXORA_SERVICE must be school, platform or combined');
  const module =
    mode === 'platform' ? (await import('./platform/platform.module')).PlatformModule : AppModule;
  const app = await NestFactory.create<NestExpressApplication>(module);

  if (mode === 'combined') {
    const { PlatformModule } = await import('./platform/platform.module');
    const owner = await NestFactory.create(PlatformModule);
    owner.use(cookieParser());
    configureCors(owner);
    owner.setGlobalPrefix('platform-api/v1');
    await owner.init();
    const handler: RequestHandler = owner.getHttpAdapter().getInstance();
    app.use(ownerDispatch(handler));
    // Close the additional pool when the process receives a shutdown signal.
    owner.enableShutdownHooks();
  }
  app.useBodyParser('json', { limit: '5mb' });
  app.use(cookieParser());

  configureCors(app);

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  if (process.env.HOST) await app.listen(port, process.env.HOST);
  else await app.listen(port);
  Logger.log(`Nexora Backend running on port ${port} with prefix /api/v1`);
}

bootstrap();
