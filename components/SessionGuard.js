// components/SessionGuard.js
'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { clearStaffAdminSession, isStaffAdminSessionValid } from '@/lib/sessionGuardUtils';

export function SessionGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const redirectToLogin = useCallback(() => {
    clearStaffAdminSession();
    router.replace('/login');
  }, [router]);

  const enforceSession = useCallback(() => {
    if (!isStaffAdminSessionValid()) {
      redirectToLogin();
      return false;
    }
    return true;
  }, [redirectToLogin]);

  useEffect(() => {
    if (!enforceSession()) return undefined;

    const interval = setInterval(() => {
      enforceSession();
    }, 60000);

    const handlePageShow = (event) => {
      if (event.persisted || !isStaffAdminSessionValid()) {
        enforceSession();
      }
    };

    const handlePopState = () => {
      enforceSession();
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handlePopState);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pathname, enforceSession]);

  if (typeof window !== 'undefined' && !isStaffAdminSessionValid()) {
    return null;
  }

  return children;
}