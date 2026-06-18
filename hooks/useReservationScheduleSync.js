'use client';

import { useEffect } from 'react';

const DEFAULT_INTERVAL_MS = 5000;

/** Trigger server-side reservation status transitions on a fixed interval. */
export function useReservationScheduleSync(intervalMs = DEFAULT_INTERVAL_MS) {
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        await fetch('/api/reservations/schedule-status', { method: 'POST' });
      } catch (error) {
        console.error('Error syncing reservation schedule statuses:', error);
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);
}
