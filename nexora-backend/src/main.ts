import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { loadBackendEnvironment } from './common/db/database-config';
import { AppModule } from './app.module';
import { configureCors } from './common/security/origins';

loadBackendEnvironment();

async function bootstrap() {
  const mode = process.env.NEXORA_SERVICE ?? 'school';
  if (!['school', 'platform'].includes(mode))
    throw new Error('NEXORA_SERVICE must be school or platform');
  const module =
    mode === 'platform' ? (await import('./platform/platform.module')).PlatformModule : AppModule;
  const app = await NestFactory.create(module);

  app.use(cookieParser());

  configureCors(app);

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Nexora Backend running on port ${port} with prefix /api/v1`);
}

bootstrap();
