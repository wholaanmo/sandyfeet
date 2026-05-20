'use client';

import { createPortal } from 'react-dom';

export default function GuestDeactivationBlocker({ isOpen, reason, onConfirm }) {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex min-h-[100dvh] items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-deactivation-title"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-red-100 bg-gradient-to-r from-red-50 to-white px-6 py-5">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <i className="fas fa-user-slash text-lg" aria-hidden="true" />
          </div>
          <h2 id="guest-deactivation-title" className="text-center text-lg font-bold text-[#1E3A8A]">
            Account Deactivated
          </h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-[#5C7AA6]">
            This account has been deactivated by the resort.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {reason ? (
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Reason</p>
              <p className="mt-1 text-sm leading-relaxed text-[#1E3A8A]">{reason}</p>
            </div>
          ) : null}

          <p className="text-center text-xs text-[#5C7AA6]">
            You cannot use the website while this account is deactivated.
          </p>

          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl bg-gradient-to-r from-[#4D8CF5] to-[#3b7add] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:from-[#3b7add] hover:to-[#2a68c9]"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
