'use client';

import { useEffect, useState } from 'react';
import { useGuestAuth } from './GuestAuthContext';

function GoogleMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
    </svg>
  );
}

export default function GuestAuthModal({ isOpen, onClose }) {
  const { actionLoading, error, signInWithGoogle } = useGuestAuth();
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogleContinue = async () => {
    setNotice('');
    try {
      await signInWithGoogle();
      onClose();
    } catch {
      // Error message is provided by GuestAuthContext.
    }
  };

  const handleEmailContinue = (event) => {
    event.preventDefault();
    setNotice('Email sign-in is not enabled yet. Please use Google to continue.');
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-auth-title"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-[1.75rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="guest-auth-title" className="text-2xl font-bold text-slate-950">
              Sign in or create an account
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guest account dialog"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <i className="fas fa-xmark text-sm"></i>
          </button>
        </div>

        <div className="px-6 py-6">
          <p className="mb-5 text-sm leading-6 text-slate-600">
            Use Google to keep your Sandyfeet reservations connected in one place.
          </p>

          <button
            type="button"
            onClick={handleGoogleContinue}
            disabled={actionLoading}
            className="flex h-14 w-full items-center justify-center gap-5 rounded-2xl bg-[#111111] px-5 text-[17px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all hover:bg-black hover:shadow-[0_14px_28px_rgba(0,0,0,0.22)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {actionLoading ? (
              <>
                <i className="fas fa-spinner fa-spin text-lg"></i>
                Connecting...
              </>
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleEmailContinue} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setNotice('');
                }}
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              className="h-12 w-full rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              Continue
            </button>
          </form>

          {(notice || error) && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              <i className="fas fa-circle-info mr-2"></i>
              {error || notice}
            </div>
          )}

          <p className="mt-5 text-xs leading-5 text-slate-500">
            By continuing, you agree to Sandyfeet using this account to identify your bookings and reservation updates.
          </p>
        </div>
      </div>
    </div>
  );
}
