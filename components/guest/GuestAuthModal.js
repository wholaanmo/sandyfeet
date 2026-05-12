'use client';

import { useEffect, useState } from 'react';
import { useGuestAuth } from './GuestAuthContext';

function GoogleMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 items-center justify-center text-[25px] font-black leading-none"
      style={{
        background: 'conic-gradient(from -45deg, #4285F4 0 25%, #34A853 0 45%, #FBBC05 0 62%, #EA4335 0 82%, #4285F4 0 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent'
      }}
    >
      G
    </span>
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
    setNotice('Email sign-in is not enabled yet. Please continue with Google for guest accounts.');
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
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3B82F6]">Sandyfeet Account</p>
            <h2 id="guest-auth-title" className="mt-1 text-2xl font-bold text-slate-950">
              Sign in or create an account
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guest account dialog"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <div className="px-6 py-6">
          <p className="mb-5 text-sm leading-6 text-slate-600">
            Save your guest details and keep Sandyfeet reservations connected with one account.
          </p>

          <button
            type="button"
            onClick={handleGoogleContinue}
            disabled={actionLoading}
            className="flex h-14 w-full items-center justify-center gap-5 rounded-sm bg-[#111111] px-5 text-[17px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all hover:bg-black hover:shadow-[0_14px_28px_rgba(0,0,0,0.22)] disabled:cursor-not-allowed disabled:opacity-70"
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
              className="h-12 w-full rounded-full bg-[#2563EB] px-5 text-sm font-bold text-white shadow-[0_12px_22px_rgba(37,99,235,0.24)] transition-all hover:bg-[#174FCC]"
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
