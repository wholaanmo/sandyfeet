'use client';

import { GuestAuthProvider } from '@/components/guest/GuestAuthContext';

export default function Providers({ children }) {
  return (
    <GuestAuthProvider>
      {children}
    </GuestAuthProvider>
  );
}
