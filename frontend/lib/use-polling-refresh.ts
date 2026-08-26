'use client';

import { useEffect } from 'react';

/**
 * Calls `refresh` on an interval and immediately when the tab becomes visible / window focused.
 */
export function usePollingRefresh(
  refresh: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      void refresh();
    };

    const id = setInterval(run, intervalMs);

    const onVisibleOrFocus = () => {
      if (document.visibilityState === 'visible') {
        run();
      }
    };

    document.addEventListener('visibilitychange', onVisibleOrFocus);
    window.addEventListener('focus', onVisibleOrFocus);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibleOrFocus);
      window.removeEventListener('focus', onVisibleOrFocus);
    };
  }, [refresh, intervalMs, enabled]);
}
