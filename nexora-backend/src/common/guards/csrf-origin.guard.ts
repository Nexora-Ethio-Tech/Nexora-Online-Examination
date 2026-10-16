import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DomainException } from '../errors/domain.exception';

export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector || new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const reflector = this.reflector || new Reflector();
    const skipCsrf = reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    // Safe read-only methods do not require CSRF
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // 1. Origin check
    const origin = (req.headers['origin'] as string) || (req.headers['referer'] as string);
    const configuredOrigins = [
      process.env.APP_ORIGIN,
      process.env.CORS_ORIGIN,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
    ].filter(Boolean) as string[];

    if (origin) {
      const isAllowedOrigin = configuredOrigins.some((allowed) =>
        origin.startsWith(allowed),
      );
      if (!isAllowedOrigin) {
        throw DomainException.csrfInvalid('Forbidden request origin');
      }
    }

    // 2. CSRF Token check
    const csrfHeader = req.headers['x-csrf-token'] as string;
    if (!csrfHeader || !req.csrfToken || csrfHeader !== req.csrfToken) {
      throw DomainException.csrfInvalid('Missing or invalid X-CSRF-Token header');
    }

    return true;
  }
}
