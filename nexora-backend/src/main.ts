import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { loadBackendEnvironment } from './common/db/database-config';
import { AppModule } from './app.module';
import { configureCors } from './common/security/origins';

loadBackendEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  configureCors(app);

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Nexora Backend running on port ${port} with prefix /api/v1`);
}

bootstrap();
