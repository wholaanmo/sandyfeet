'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CheckInMessage({ title, message }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f8fc] px-6">
      <div className="max-w-md w-full rounded-3xl border border-slate-100 bg-white px-8 py-10 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ocean-ice/70">
          <i className="fas fa-qrcode text-2xl text-ocean-mid" />
        </div>
        <h1 className="font-playfair text-2xl text-ocean-deep">{title}</h1>
        <p className="mt-3 text-sm text-ocean-mid/80 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

function CheckInRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) return;

    const userType = typeof window !== 'undefined' ? localStorage.getItem('userType') : null;
    if (userType === 'staff' || userType === 'admin') {
      router.replace(`/dashboard/staff/reservations?checkinToken=${encodeURIComponent(token)}`);
    }
  }, [token, router]);

  if (!token) {
    return (
      <CheckInMessage
        title="Invalid check-in link"
        message="This QR code link is missing a check-in token. Please ask the front desk for assistance."
      />
    );
  }

  return (
    <CheckInMessage
      title="Check-in QR code"
      message="Present this screen to resort staff at check-in. They will scan your QR code to open your reservation."
    />
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={<CheckInMessage title="Loading check-in" message="Please wait..." />}>
      <CheckInRedirectContent />
    </Suspense>
  );
}
