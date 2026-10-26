import { z } from 'zod';
import { ApiError, type ApiClient } from '@/lib/api-client';
import type { createAuthApi } from './api';
import type { LoginInput, MfaInput } from './schemas';

export function ownerSignIn(client: ApiClient) {
  return {
    async identify(input: LoginInput) {
      const csrf = await client.request('/auth/csrf', z.object({ csrfToken: z.string() }), {
        notifyUnauthorized: false,
      });
      client.setCsrfToken(csrf.csrfToken);
      const result = await client.request(
        '/auth/identify',
        z.discriminatedUnion('status', [
          z.object({ status: z.literal('school') }),
          z.object({ status: z.literal('owner_mfa_required'), csrfToken: z.string() }),
        ]),
        { method: 'POST', body: input, notifyUnauthorized: false },
      );
      if (result.status === 'owner_mfa_required') client.setCsrfToken(result.csrfToken);
      return result;
    },
    async verify(input: MfaInput) {
      const result = await client.request(
        '/auth/verify',
        z.object({ displayName: z.string(), csrfToken: z.string() }),
        {
          method: 'POST',
          body: input,
          notifyUnauthorized: false,
        },
      );
      client.setCsrfToken(result.csrfToken);
    },
  };
}

export async function sharedLogin(
  school: Pick<ReturnType<typeof createAuthApi>, 'login'>,
  owner: ReturnType<typeof ownerSignIn>,
  input: LoginInput,
  combined: boolean,
) {
  try {
    return await school.login(input);
  } catch (error) {
    if (!combined || !(error instanceof ApiError) || error.status !== 401) throw error;
    const identity = await owner.identify(input);
    if (identity.status !== 'owner_mfa_required') throw error;
    return identity;
  }
}
