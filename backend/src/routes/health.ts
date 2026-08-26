import { Router } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { resolveAppEnv } from '../config/appEnv';
import { getClinicalStorage } from '../services/clinicalStorage';
import { FilesystemClinicalStorage } from '../services/clinicalStorage/filesystemStorage';

export const healthRouter = Router();

/** Liveness — process is up. No dependency checks. */
healthRouter.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    check: 'live',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness — PostgreSQL reachable; clinical storage writable in strict deploys.
 * Does not call Groq, LiveKit, or Resend.
 */
healthRouter.get('/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  let ready = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
    ready = false;
  }

  const appEnv = resolveAppEnv();
  const storage = getClinicalStorage();
  const requireStorage =
    storage.driver === 'render-disk' && (appEnv === 'staging' || appEnv === 'production');

  if (requireStorage && storage instanceof FilesystemClinicalStorage) {
    try {
      await storage.assertWritable();
      checks.clinicalStorage = 'ok';
    } catch {
      checks.clinicalStorage = 'fail';
      ready = false;
    }
  }

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'not_ready',
    check: 'ready',
    appEnv,
    clinicalStorageDriver: env.CLINICAL_STORAGE_DRIVER,
    checks,
    timestamp: new Date().toISOString(),
  });
});
