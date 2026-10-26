import { describe, it, expect, vi } from 'vitest';
import { ownerDispatch } from '../../src/combined-routing';
import type { Request, Response } from 'express';
describe('combined service routing boundary', () => {
  it.each(['/platform-api/v1', '/platform-api/v1/auth/login?x=1'])(
    'dispatches only owner namespace: %s',
    (url) => {
      const owner = vi.fn(),
        next = vi.fn();
      const req = { url } as Request,
        res = {} as Response;
      ownerDispatch(owner)(req, res, next);
      expect(owner).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/api/v1/auth/login',
    '/platform-api/v10/auth/login',
    '/platform-api/v1-evil',
    '/platform',
  ])('keeps other paths out of owner app: %s', (url) => {
    const owner = vi.fn(),
      next = vi.fn();
    ownerDispatch(owner)({ url } as Request, {} as Response, next);
    expect(owner).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
