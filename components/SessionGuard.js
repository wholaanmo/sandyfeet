'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function SessionGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();

const clearSessionAndRedirect = () => {
  localStorage.removeItem('userType');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userName');        // ✅ ADDED
  localStorage.removeItem('uid');
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('sessionExpiry');
  localStorage.removeItem('rememberMe');

  document.cookie = 'sessionToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sessionExpiry=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';

  router.push('/login');
};

  const checkSession = () => {
    const expiry = localStorage.getItem('sessionExpiry');
    if (expiry && parseInt(expiry) < Date.now()) {
      clearSessionAndRedirect();
    }
  };

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, 60000); // every minute
    return () => clearInterval(interval);
  }, [pathname]); // re‑run on route change

  return children;
}