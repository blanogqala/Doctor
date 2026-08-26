import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Attach a correlation ID to every request (reuse inbound X-Request-Id when present).
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const inbound = req.header(REQUEST_ID_HEADER)?.trim();
  const requestId =
    inbound && inbound.length <= 128 && /^[A-Za-z0-9._-]+$/.test(inbound)
      ? inbound
      : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
