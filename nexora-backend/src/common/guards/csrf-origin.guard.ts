import { Injectable, CanActivate, ExecutionContext, SetMetadata, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DomainException } from '../errors/domain.exception';
import { allowedOrigins } from '../security/origins';

export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly reflector: Reflector;
  private readonly origins = allowedOrigins();

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

    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !this.origins.has(origin)) {
      throw DomainException.csrfInvalid('Missing or forbidden request origin');
    }

    // 2. CSRF Token check
    const csrfHeader = req.headers['x-csrf-token'];
    if (typeof csrfHeader !== 'string' || !req.csrfToken || csrfHeader !== req.csrfToken) {
      throw DomainException.csrfInvalid('Missing or invalid X-CSRF-Token header');
    }

    return true;
  }
}
