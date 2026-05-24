// components/SessionGuard.js
'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { clearStaffAdminSession, isStaffAdminSessionValid } from '@/lib/sessionGuardUtils';

const getCookieValue = (name) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};

const getUserType = () => {
  if (typeof window === 'undefined') return null;
  const localType = localStorage.getItem('userType');
  const cookieType = getCookieValue('userType');

  if (localType && cookieType && localType !== cookieType) {
    return cookieType;
  }

  return cookieType || localType;
};

const getExpectedRole = (pathname) => {
  if (pathname.startsWith('/dashboard/admin')) return 'admin';
  if (pathname.startsWith('/dashboard/staff')) return 'staff';
  return null;
};

export function SessionGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const redirectToLogin = useCallback(() => {
    clearStaffAdminSession();
    router.replace('/login');
  }, [router]);

  const enforceSession = useCallback(() => {
    const expectedRole = getExpectedRole(pathname);
    const userType = getUserType();

    if (!isStaffAdminSessionValid() || !userType) {
      redirectToLogin();
      return false;
    }

    if (expectedRole === 'admin' && userType !== 'admin') {
      if (userType === 'staff') {
        router.replace('/dashboard/staff/front-desk');
      } else {
        redirectToLogin();
      }
      return false;
    }

    if (expectedRole === 'staff' && userType !== 'staff') {
      if (userType === 'admin') {
        router.replace('/dashboard/admin/overview');
      } else {
        redirectToLogin();
      }
      return false;
    }

    return true;
  }, [pathname, redirectToLogin, router]);

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