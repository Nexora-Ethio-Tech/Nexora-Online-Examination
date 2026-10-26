import type { RequestHandler } from 'express';
/** Dispatch before school guards/body parsing; each Nest app retains its own security stack. */
export function ownerDispatch(owner: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const path = req.url.split('?')[0];
    if (path === '/platform-api/v1' || path.startsWith('/platform-api/v1/'))
      return owner(req, res, next);
    next();
  };
}
