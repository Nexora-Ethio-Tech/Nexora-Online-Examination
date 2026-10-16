import { INestApplication } from '@nestjs/common';
import { DomainException } from '../errors/domain.exception';

export function allowedOrigins(environment: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  const development = environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test';
  const configured = [environment.APP_ORIGIN, environment.CORS_ORIGIN]
    .filter((value): value is string => value !== undefined && value.trim() !== '')
    .map((value) => value.trim());
  for (const value of configured) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('APP_ORIGIN and CORS_ORIGIN must be exact HTTP(S) origins.');
    }
    if (
      url.origin !== value ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (!development && url.protocol !== 'https:')
    ) {
      throw new Error(
        'APP_ORIGIN and CORS_ORIGIN must be exact origins; HTTPS is required outside development/test.',
      );
    }
  }
  if (development)
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000');
  if (configured.length === 0)
    throw new Error(
      'Configure APP_ORIGIN or CORS_ORIGIN; local defaults require NODE_ENV=development or test.',
    );
  return new Set(configured);
}

export function configureCors(
  app: INestApplication,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const origins = allowedOrigins(environment);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (origin === undefined) callback(null, false);
      else if (origins.has(origin)) callback(null, true);
      else callback(DomainException.csrfInvalid('Forbidden request origin'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Request-Id',
      'X-CSRF-Token',
      'Idempotency-Key',
      'X-Device-Id',
      'Authorization',
    ],
  });
}
