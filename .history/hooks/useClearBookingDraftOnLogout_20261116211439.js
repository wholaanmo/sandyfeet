'use client';

import { useEffect, useRef } from 'react';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { clearGuestBookingDrafts } from '@/lib/guestBookingDrafts';

export function useClearBookingDraftOnLogout(onLogout) {
  const { user, loading } = useGuestAuth();
  const previousUidRef = useRef(undefined);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  useEffect(() => {
    if (loading) return;

    const uid = user?.uid || null;
    const previousUid = previousUidRef.current;
    previousUidRef.current = uid;

    if (!previousUid || previousUid === uid) return;

    clearGuestBookingDrafts();
    onLogoutRef.current?.();
  }, [loading, user]);
}
