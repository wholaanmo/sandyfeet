import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default function VerifyStaffLayout({ children }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ocean-ice to-blue-white">
          <div className="w-12 h-12 border-4 border-ocean-light border-t-ocean-mid rounded-full animate-spin" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
