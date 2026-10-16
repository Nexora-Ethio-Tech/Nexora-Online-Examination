import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class ResponseHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

    res.setHeader('X-Request-Id', requestId);

    if (req.originalUrl?.startsWith('/api/v1')) {
      res.setHeader('Cache-Control', 'private, no-store');
    }

    return next.handle();
  }
}
