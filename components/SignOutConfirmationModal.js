// components/SignOutConfirmationModal.js
'use client';

import { useEffect, useState } from 'react';

export default function SignOutConfirmationModal({ isOpen, onConfirm, onCancel }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      setIsClosing(true);
      setTimeout(() => {
        setIsVisible(false);
        document.body.style.overflow = 'unset';
      }, 200);
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isVisible) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] transition-all duration-200 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Decorative gradient accent */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#4D8CF5]/10 blur-3xl"></div>
        <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[#1E3A8A]/5 blur-3xl"></div>
        
        <div className="relative">
          {/* Header */}
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 border border-red-100">
                <i className="fas fa-sign-out-alt text-lg text-red-500"></i>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#1E3A8A] font-playfair">Sign Out</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Are you sure you want to sign out?
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 sm:px-8">
            <p className="text-sm text-slate-600 leading-relaxed">
              You'll need to sign in again to access your bookings, account details, and submit feedback.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 sm:px-8 bg-slate-50/50">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
            >
              <i className="fas fa-times text-xs"></i>
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-[0.98]"
            >
              <i className="fas fa-sign-out-alt text-xs"></i>
              Confirm Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}