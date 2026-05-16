'use client';

// app/guest/layout.js
import GuestNavbar from '@/components/guest/GuestNavbar';

export default function GuestLayout({ children }) {
  return (
    <>
      <GuestNavbar />
      <main className="min-h-screen-minus-navbar">
        {children}
      </main>
    </>
  );
}
