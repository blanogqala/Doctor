import type { Server } from 'http';
import { prisma } from '../config/database';
import { writeStructuredLog } from '../middleware/requestLogger';

export type ShutdownHooks = {
  stopSchedulers?: () => void | Promise<void>;
};

let shuttingDown = false;

/**
 * Graceful SIGTERM/SIGINT for Render deploys: stop schedulers, close HTTP, disconnect Prisma.
 */
export function registerGracefulShutdown(server: Server, hooks: ShutdownHooks = {}) {
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    writeStructuredLog('info', 'shutdown_started', { signal });

    const forceTimer = setTimeout(() => {
      writeStructuredLog('error', 'shutdown_forced', { signal });
      process.exit(1);
    }, 25_000);
    forceTimer.unref?.();

    try {
      if (hooks.stopSchedulers) {
        await hooks.stopSchedulers();
      }

      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });

      await prisma.$disconnect();
      writeStructuredLog('info', 'shutdown_complete', { signal });
      process.exit(0);
    } catch (err) {
      writeStructuredLog('error', 'shutdown_failed', {
        signal,
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

/** Test helper */
export function resetShutdownStateForTests() {
  shuttingDown = false;
}
