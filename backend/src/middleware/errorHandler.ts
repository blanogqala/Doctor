import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { resolveAppEnv } from '../config/appEnv';
import { writeStructuredLog } from './requestLogger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;
  const base = requestId ? { requestId } : {};

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...base,
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image must be 5MB or smaller', ...base });
    }
    return res.status(400).json({ error: err.message || 'Invalid file upload', ...base });
  }

  const appEnv = resolveAppEnv();
  writeStructuredLog('error', 'unhandled_error', {
    requestId,
    name: err.name,
    // Never expose stack/SQL/paths to clients; log message only in non-production.
    error: appEnv === 'production' ? 'Internal server error' : err.message,
  });
  if (appEnv !== 'production') {
    console.error(err);
  }

  return res.status(500).json({
    error: 'Internal server error',
    ...base,
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
