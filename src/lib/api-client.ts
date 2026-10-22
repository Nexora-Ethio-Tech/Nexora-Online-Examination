import { readDownload, type DownloadProgress } from './download-progress';
import { z } from 'zod';

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({ path: z.string(), message: z.string() })),
  requestId: z.string(),
});
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
    public readonly details: { path: string; message: string }[] = [],
    public readonly requestId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Options = {
  responseType?: 'text';
  onDownloadProgress?: DownloadProgress;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
  notifyUnauthorized?: boolean;
  idempotencyKey?: string;
};

export class ApiClient {
  private csrfToken: string | null = null;
  private rateLimits = new Map<string, number>();
  private unauthorizedListeners = new Set<() => void>();
  constructor(
    private readonly baseUrl: string,
    private readonly transport: Transport = (url, init) => fetch(url, init),
    private readonly timeoutMs = 15_000,
  ) {}

  setCsrfToken(token: string | null) {
    this.csrfToken = token;
  }
  onUnauthorized(listener: () => void) {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  async request<T>(path: string, schema: z.ZodType<T>, options: Options = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
      throw new ApiError('INVALID_PATH', 'Invalid API path.');
    }
    const method = options.method ?? 'GET';
    const rateKey = `${method} ${path}`;
    const retryAt = this.rateLimits.get(rateKey) ?? 0;
    if (retryAt > Date.now()) {
      throw new ApiError(
        'RATE_LIMITED',
        'Too many attempts.',
        429,
        [],
        undefined,
        Math.ceil((retryAt - Date.now()) / 1000),
      );
    }
    if (method !== 'GET' && !this.csrfToken)
      throw new ApiError('CSRF_REQUIRED', 'Please sign in again.');
    const headers = new Headers({
      Accept: options.responseType === 'text' ? 'text/csv' : 'application/json',
    });
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    if (method !== 'GET' && this.csrfToken) headers.set('X-CSRF-Token', this.csrfToken);
    const multipart = options.body instanceof FormData ? options.body : undefined;
    if (options.body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.transport(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        ...(options.body === undefined ? {} : { body: multipart ?? JSON.stringify(options.body) }),
      });
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (response.status === 401 && options.notifyUnauthorized !== false) {
        this.csrfToken = null;
        this.unauthorizedListeners.forEach((listener) => listener());
      }
      const body: unknown =
        response.status === 204
          ? undefined
          : response.ok && options.responseType === 'text'
            ? await response.text()
            : response.ok && options.onDownloadProgress
              ? await readDownload(response, options.onDownloadProgress, controller.signal)
              : await response.json().catch(() => undefined);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!response.ok) {
        const parsed = errorSchema.safeParse(body);
        const retry = Number(response.headers.get('Retry-After'));
        const retryAfter =
          response.headers.has('Retry-After') && Number.isFinite(retry) && retry >= 0
            ? retry
            : undefined;
        if (response.status === 429 && retryAfter !== undefined)
          this.rateLimits.set(rateKey, Date.now() + retryAfter * 1000);
        throw new ApiError(
          parsed.success ? parsed.data.code : `HTTP_${response.status}`,
          parsed.success
            ? parsed.data.message
            : 'The server could not complete this request. Please try again.',
          response.status,
          parsed.success ? parsed.data.details : [],
          parsed.success
            ? parsed.data.requestId
            : (response.headers.get('X-Request-Id') ?? undefined),
          retryAfter,
        );
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          'INVALID_RESPONSE',
          'The server returned an unexpected response. Please contact your school.',
          response.status,
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted) throw error;
      if (timedOut)
        throw new ApiError(
          'TIMEOUT',
          'The request timed out. Check your connection and try again.',
        );
      throw new ApiError('NETWORK_ERROR', 'Cannot connect. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

export function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 429)
    return error.retryAfterSeconds === undefined
      ? 'Too many attempts. Wait a moment before trying again.'
      : `Too many attempts. Wait ${error.retryAfterSeconds} seconds before trying again.`;
  if (error.code === 'CSRF_INVALID')
    return 'Your security session changed. Return to sign in and try again.';
  return error.message;
}
