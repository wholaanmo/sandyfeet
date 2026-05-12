'use client';

// app/guest/layout.js
import { GuestAuthProvider } from '@/components/guest/GuestAuthContext';
import GuestNavbar from '@/components/guest/GuestNavbar';

export default function GuestLayout({ children }) {
  return (
    <GuestAuthProvider>
      <GuestNavbar />
      <main className="min-h-screen-minus-navbar">
        {children}
      </main>
    </GuestAuthProvider>
  );
}
