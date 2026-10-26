import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { sharedLogin } from './owner-sign-in';
const input = { loginId: 'arbitrary-ID', password: 'synthetic-password' };
describe('shared login routing', () => {
  it('keeps verified school accounts in their school role without querying owners', async () => {
    const owner = { identify: vi.fn(), verify: vi.fn() };
    expect(
      await sharedLogin({ login: async () => ({ status: 'authenticated' }) }, owner, input, true),
    ).toEqual({ status: 'authenticated' });
    expect(owner.identify).not.toHaveBeenCalled();
  });
  it('recognizes a verified owner after school credentials are rejected', async () => {
    const owner = {
      identify: vi.fn().mockResolvedValue({ status: 'owner_mfa_required', csrfToken: 'challenge' }),
      verify: vi.fn(),
    };
    expect(
      await sharedLogin(
        {
          login: async () => {
            throw new ApiError('AUTH_REQUIRED', 'Invalid login credentials', 401);
          },
        },
        owner,
        input,
        true,
      ),
    ).toEqual({ status: 'owner_mfa_required', csrfToken: 'challenge' });
    expect(owner.verify).not.toHaveBeenCalled();
  });
  it.each([403, 429, 500, 0])('does not bypass a school failure with status %s', async (status) => {
    const owner = { identify: vi.fn(), verify: vi.fn() },
      error = new ApiError('FAIL', 'Rejected', status);
    await expect(
      sharedLogin(
        {
          login: async () => {
            throw error;
          },
        },
        owner,
        input,
        true,
      ),
    ).rejects.toBe(error);
    expect(owner.identify).not.toHaveBeenCalled();
  });
  it('keeps the generic credential error when neither account matches', async () => {
    const owner = { identify: vi.fn().mockResolvedValue({ status: 'school' }), verify: vi.fn() },
      error = new ApiError('AUTH_REQUIRED', 'Invalid login credentials', 401);
    await expect(
      sharedLogin(
        {
          login: async () => {
            throw error;
          },
        },
        owner,
        input,
        true,
      ),
    ).rejects.toBe(error);
  });
  it('preserves standalone school hosting', async () => {
    const owner = { identify: vi.fn(), verify: vi.fn() },
      error = new ApiError('AUTH_REQUIRED', 'Invalid login credentials', 401);
    await expect(
      sharedLogin(
        {
          login: async () => {
            throw error;
          },
        },
        owner,
        input,
        false,
      ),
    ).rejects.toBe(error);
    expect(owner.identify).not.toHaveBeenCalled();
  });
});
