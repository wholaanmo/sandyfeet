// app/verify-staff/page.js
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { sendStaffWelcomeEmail } from '../../lib/staffEmailService';
import Link from 'next/link';

function VerifyStaffPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [verifying, setVerifying] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState({
    success: false,
    message: '',
    error: false
  });

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      const email = searchParams.get('email');
      
      if (!token || !email) {
        setVerificationStatus({
          success: false,
          message: 'Invalid verification link. Please check your email for the correct link.',
          error: true
        });
        setVerifying(false);
        return;
      }
      
      try {
        // Find user by email and verification token
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef, 
          where('email', '==', decodeURIComponent(email)),
          where('verificationToken', '==', token)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          setVerificationStatus({
            success: false,
            message: 'Invalid or expired verification link. Please request a new verification email.',
            error: true
          });
          setVerifying(false);
          return;
        }
        
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        // Check if already verified
        if (userData.emailVerified) {
          setVerificationStatus({
            success: true,
            message: 'Your email has already been verified. You can now log in to your account.',
            error: false
          });
          setVerifying(false);
          return;
        }
        
        // Check if verification has expired
        const expiresAt = new Date(userData.verificationExpiresAt);
        if (new Date() > expiresAt) {
          setVerificationStatus({
            success: false,
            message: 'Verification link has expired. Please request a new verification email.',
            error: true
          });
          setVerifying(false);
          return;
        }
        
        // Update user as verified
        await updateDoc(doc(db, 'users', userDoc.id), {
          emailVerified: true,
          status: 'active',
          verifiedAt: new Date().toISOString(),
          verificationToken: null // Clear the token
        });
        
        // Send welcome email with role
        const welcomeEmailResult = await sendStaffWelcomeEmail(userData.email, userData.name, userData.role);
        const welcomeEmailFailed = !welcomeEmailResult?.success;
        if (welcomeEmailFailed) {
          console.warn('Staff welcome email failed:', welcomeEmailResult?.error || 'Unknown email error');
        }
        
        setVerificationStatus({
          success: true,
          message: welcomeEmailFailed
            ? 'Your email has been successfully verified and your account is active. We could not send the welcome email right now.'
            : 'Your email has been successfully verified! Your account is now active.',
          error: false
        });
        setVerifying(false);
        
      } catch (error) {
        console.error('Error verifying email:', error);
        setVerificationStatus({
          success: false,
          message: 'An error occurred while verifying your email. Please try again later.',
          error: true
        });
        setVerifying(false);
      }
    };
    
    verifyEmail();
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

export default function VerifyStaffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-white to-ocean-ice flex items-center justify-center p-4">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      }
    >
      <VerifyStaffPageContent />
    </Suspense>
  );
}