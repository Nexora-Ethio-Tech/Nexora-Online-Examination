import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorDetail = {
  path?: string;
  message: string;
};

export type PermittedErrorCode =
  | 'READINESS_MISMATCH'
  | 'STATE_CHANGED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ATTEMPT_SUSPENDED'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'CSRF_INVALID'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'DEVICE_REPLACED'
  | 'ALREADY_FINALIZED'
  | 'NOT_PREPARING'
  | 'NOT_STARTED'
  | 'AI_REVIEW_REQUIRED'
  | 'RESULTS_NOT_RELEASED'
  | 'PRACTICE_NOT_RELEASED'
  | 'RECOVERY_REQUIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'TEMPORARILY_UNAVAILABLE';

export class DomainException extends HttpException {
  public readonly code: PermittedErrorCode;
  public readonly details: ErrorDetail[];
  public readonly context?: Record<string, unknown>;

  constructor(
    status: HttpStatus,
    code: PermittedErrorCode,
    message: string,
    details: ErrorDetail[] = [],
    context?: Record<string, unknown>,
  ) {
    super({ code, message, details, context }, status);
    this.code = code;
    this.details = details;
    this.context = context;
  }

  static authRequired(message = 'Authentication required'): DomainException {
    return new DomainException(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', message);
  }

  static forbidden(message = 'Access forbidden'): DomainException {
    return new DomainException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
  }

  static csrfInvalid(message = 'Invalid or missing CSRF token'): DomainException {
    return new DomainException(HttpStatus.FORBIDDEN, 'CSRF_INVALID', message);
  }

  static notFound(message = 'Resource not found'): DomainException {
    return new DomainException(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
  }

  static validationError(message: string, details: ErrorDetail[] = []): DomainException {
    return new DomainException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VALIDATION_ERROR',
      message,
      details,
    );
  }

  static validation(details: ErrorDetail[], message = 'Validation failed'): DomainException {
    return new DomainException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VALIDATION_ERROR',
      message,
      details,
    );
  }

  static conflict(
    code: PermittedErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ): DomainException {
    return new DomainException(HttpStatus.CONFLICT, code, message, [], context);
  }
}
