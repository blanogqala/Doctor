import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { resolveAppEnv } from '../config/appEnv';
import { env } from '../config/env';
import { sanitizeLogUrl } from '../utils/sanitizeLogUrl';

type LogLevel = 'info' | 'warn' | 'error';

export function writeStructuredLog(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {}
) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Development: readable morgan. Staging/production: structured JSON access logs.
 * Never logs bodies, cookies, or unsanitized token URLs.
 */
export function createRequestLogger() {
  const appEnv = resolveAppEnv();
  if (env.NODE_ENV === 'test') {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  if (appEnv === 'development') {
    return morgan('dev');
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
      writeStructuredLog('info', 'http_request', {
        requestId: req.requestId,
        method: req.method,
        route: sanitizeLogUrl(req.originalUrl || req.url),
        status: res.statusCode,
        durationMs: Date.now() - started,
        practiceId: req.practiceContext?.id,
      });
    });
    next();
  };
}
