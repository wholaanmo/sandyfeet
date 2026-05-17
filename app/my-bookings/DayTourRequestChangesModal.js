// app/my-bookings/DayTourRequestChangesModal.js
'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function DayTourRequestChangesModal({ isOpen, booking, onClose, onRequestSubmitted }) {
  const [requestText, setRequestText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasExistingRequest, setHasExistingRequest] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check Firestore for an existing pending request when modal opens
  useEffect(() => {
    if (!isOpen || !booking) {
      setHasExistingRequest(false);
      setRequestText('');
      return;
    }
    
    const checkExistingRequest = async () => {
      setLoading(true);
      try {
        const bookingRef = doc(db, 'dayTourBookings', booking.id);
        const docSnap = await getDoc(bookingRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const existing = data.changeRequest && data.changeRequest.status === 'pending';
          setHasExistingRequest(existing);
        } else {
          setHasExistingRequest(false);
        }
      } catch (error) {
        console.error('Error checking existing request:', error);
        setHasExistingRequest(false);
      } finally {
        setLoading(false);
      }
    };
    
    checkExistingRequest();
  }, [isOpen, booking]);

  const handleSubmit = async () => {
    if (!requestText.trim() || hasExistingRequest || loading) return;
    
    setIsSubmitting(true);
    try {
      const bookingRef = doc(db, 'dayTourBookings', booking.id);
      
      // Double-check to prevent race conditions
      const docSnap = await getDoc(bookingRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.changeRequest && data.changeRequest.status === 'pending') {
          setHasExistingRequest(true);
          setIsSubmitting(false);
          return;
        }
      }
      
      await updateDoc(bookingRef, {
        changeRequest: {
          text: requestText.trim(),
          submittedAt: new Date().toISOString(),
          status: 'pending'
        }
      });
      
      setSuccess(true);
      
      // Notify parent component to refresh booking data
      if (onRequestSubmitted) {
        onRequestSubmitted();
      }
      
      setTimeout(() => {
        onClose();
        setRequestText('');
        setSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to submit request:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !booking) return null;

  // Determine if the submit button and textarea should be disabled
  const isDisabled = hasExistingRequest || loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
        {success ? (
          <div className="flex flex-col items-center px-8 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <i className="fas fa-check text-2xl text-emerald-600" />
            </div>
            <h3 className="mt-5 text-lg font-bold text-slate-900">Request Sent!</h3>
            <p className="mt-2 text-sm text-slate-500">
              Your change request has been submitted. The resort will review it and contact you.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <i className="fas fa-exchange-alt text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-blue-900">Request Changes (Day Tour)</h3>
                  <p className="mt-1 text-sm text-blue-600">
                    Booking ID: <span className="font-mono font-semibold">{booking.bookingId}</span>
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                <i className="fas fa-info-circle mt-0.5 text-amber-600" />
                <span>
                  Change requests should only be used for <strong>adding number of guests</strong> (adults or kids) to your day tour.
                  Please describe your request clearly below.
                </span>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Your Request <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder={isDisabled ? "You have already submitted a change request for this booking." : "e.g., I would like to add 2 more adults and 1 kid to the tour."}
                  className={`w-full rounded-xl border border-slate-200 px-4 py-3 text-sm transition-all ${
                    isDisabled
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200'
                      : 'bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100'
                  }`}
                  disabled={isDisabled}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!requestText.trim() || isSubmitting || isDisabled}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
                  isDisabled
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin text-xs" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane text-xs" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}