import { z } from 'zod';
import { ApiClient, ApiError } from '@/lib/api-client';
import {
  authenticatedSchema,
  csrfSchema,
  loginResponseSchema,
  sessionSchema,
  type LoginInput,
  type MfaInput,
} from './schemas';

export function createAuthApi(client: ApiClient) {
  return {
    async session(signal?: AbortSignal) {
      try {
        const session = await client.request('/auth/me', sessionSchema, {
          signal,
          notifyUnauthorized: false,
        });
        client.setCsrfToken(session.csrfToken);
        return session;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          client.setCsrfToken(null);
          return null;
        }
        throw error;
      }
    },
    async login(input: LoginInput) {
      const csrf = await client.request('/auth/csrf', csrfSchema, { notifyUnauthorized: false });
      client.setCsrfToken(csrf.csrfToken);
      const result = await client.request('/auth/login', loginResponseSchema, {
        method: 'POST',
        body: input,
        notifyUnauthorized: false,
      });
      client.setCsrfToken(result.status === 'mfa_required' ? result.csrfToken : null);
      return result;
    },
    async verify(input: MfaInput) {
      const result = await client.request('/auth/mfa/verify', authenticatedSchema, {
        method: 'POST',
        body: input,
        notifyUnauthorized: false,
      });
      client.setCsrfToken(null);
      return result;
    },
    async logout() {
      try {
        await client.request('/auth/logout', z.undefined(), {
          method: 'POST',
          notifyUnauthorized: false,
        });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
      client.setCsrfToken(null);
    },
  };
}
