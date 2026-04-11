// app/verify-staff/page.js
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function VerifyStaffPage() {
  const searchParams = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState({
    success: false,
    message: '',
    error: false,
  });

  useEffect(() => {
    const run = async () => {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      if (!token || !email) {
        setVerificationStatus({
          success: false,
          message: 'Invalid verification link. Please check your email for the correct link.',
          error: true,
        });
        setVerifying(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/complete-staff-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          setVerificationStatus({
            success: true,
            message: data.message || 'Your email has been successfully verified!',
            error: false,
          });
        } else {
          setVerificationStatus({
            success: false,
            message: data.message || data.error || 'Verification failed. Please try again.',
            error: true,
          });
        }
      } catch (error) {
        console.error('Error verifying email:', error);
        setVerificationStatus({
          success: false,
          message: 'An error occurred while verifying your email. Please try again later.',
          error: true,
        });
      } finally {
        setVerifying(false);
      }
    };

    run();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {verifying ? (
            <>
              <div className="w-20 h-20 mx-auto mb-4">
                <div className="w-full h-full border-4 border-ocean-light border-t-ocean-mid rounded-full animate-spin"></div>
              </div>
              <h2 className="text-2xl font-bold text-textPrimary font-playfair mb-2">
                Verifying Your Email
              </h2>
              <p className="text-textSecondary">
                Please wait while we verify your email address...
              </p>
            </>
          ) : verificationStatus.success ? (
            <>
              <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <i className="fas fa-check-circle text-green-500 text-4xl"></i>
              </div>
              <h2 className="text-2xl font-bold text-textPrimary font-playfair mb-2">
                Email Verified!
              </h2>
              <p className="text-textSecondary mb-6">
                {verificationStatus.message}
              </p>
              <Link
                href="/login"
                className="inline-block w-full py-3 bg-gradient-to-r from-ocean-mid to-ocean-light text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-center"
              >
                Go to Login
              </Link>
            </>
          ) : (
            <>
              <div className="w-20 h-20 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-red-500 text-4xl"></i>
              </div>
              <h2 className="text-2xl font-bold text-textPrimary font-playfair mb-2">
                Verification Failed
              </h2>
              <p className="text-textSecondary mb-4">
                {verificationStatus.message}
              </p>
              <p className="text-sm text-neutral mb-6">
                Please contact the resort administrator to request a new verification link.
              </p>
              <Link
                href="/login"
                className="inline-block w-full py-3 bg-gradient-to-r from-ocean-mid to-ocean-light text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-center"
              >
                Back to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
