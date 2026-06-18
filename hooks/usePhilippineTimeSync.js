'use client';

import { useEffect, useState } from 'react';
import { syncPhilippineTime, getTrustedNowMs } from '@/lib/philippineTime';

const RESYNC_INTERVAL_MS = 30_000;

/** Sync client clock to server Philippine time before reservation date logic runs. */
export function usePhilippineTimeSync() {
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const sync = async (force = false) => {
      await syncPhilippineTime({ force });
      if (!cancelled) {
        const trusted = getTrustedNowMs();
        if (trusted > 0) {
          setNowMs(trusted);
          setReady(true);
        }
      }
    };

    sync(true);

    const intervalId = setInterval(() => {
      sync(true);
    }, RESYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { ready, nowMs };
}
