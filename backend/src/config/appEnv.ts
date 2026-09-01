import { env } from './env';

export type AppEnv = 'development' | 'staging' | 'production' | 'test';

/**
 * MediNathi operational tier. Prefer APP_ENV; fall back from NODE_ENV.
 * Reads process.env first so tests and runtime overrides apply.
 */
export function resolveAppEnv(
  appEnv?: AppEnv | null,
  nodeEnv?: string | null
): AppEnv {
  const resolvedApp =
    appEnv ??
    (process.env.APP_ENV as AppEnv | undefined) ??
    env.APP_ENV;
  const resolvedNode = nodeEnv ?? process.env.NODE_ENV ?? env.NODE_ENV;

  if (resolvedApp) return resolvedApp;
  if (resolvedNode === 'production') return 'production';
  if (resolvedNode === 'test') return 'test';
  return 'development';
}

export function isStrictDeployEnv(appEnv = resolveAppEnv()): boolean {
  return appEnv === 'staging' || appEnv === 'production';
}
