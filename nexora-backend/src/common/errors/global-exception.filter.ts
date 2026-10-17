import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ZodError } from 'zod';
import { DomainException, PermittedErrorCode } from './domain.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: PermittedErrorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected server error occurred.';
    let details: Array<{ path?: string; message: string }> = [];
    let context: Record<string, unknown> | undefined = undefined;

    if (exception instanceof DomainException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details || [];
      context = exception.context;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed.';
      details = exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        code = (obj['code'] as PermittedErrorCode) || this.mapStatusToCode(status);
        message = (obj['message'] as string) || exception.message;
        if (Array.isArray(obj['details'])) {
          details = obj['details'] as Array<{ path?: string; message: string }>;
        }
        if (obj['context'] && typeof obj['context'] === 'object') {
          context = obj['context'] as Record<string, unknown>;
        }
      } else {
        message = exception.message;
        code = this.mapStatusToCode(status);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    const payload: {
      code: string;
      message: string;
      details: Array<{ path?: string; message: string }>;
      requestId: string;
      context?: Record<string, unknown>;
    } = {
      code,
      message,
      details,
      requestId,
    };

    if (context && Object.keys(context).length > 0) {
      payload.context = context;
    }

    if (status === 429 && typeof context?.retryAfterSeconds === 'number')
      response.setHeader('Retry-After', String(context.retryAfterSeconds));
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(status).json(payload);
  }

  private mapStatusToCode(status: number): PermittedErrorCode {
    switch (status) {
      case 401:
        return 'AUTH_REQUIRED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'REVISION_CONFLICT';
      case 413:
        return 'PAYLOAD_TOO_LARGE';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'RATE_LIMITED';
      case 503:
        return 'TEMPORARILY_UNAVAILABLE';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
