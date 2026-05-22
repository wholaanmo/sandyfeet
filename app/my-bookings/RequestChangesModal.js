// app/my-bookings/RequestChangesModal.js
'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const pickChangeRequest = (requests) => {
  const list = requests.filter(Boolean);
  if (!list.length) return null;
  const processed = list.find(
    (r) => r.status === 'approved' || r.status === 'rejected'
  );
  if (processed) return processed;
  const pending = list.find((r) => r.status === 'pending');
  if (pending) return pending;
  return list[0];
};

const isRequestLocked = (changeRequest) => {
  if (!changeRequest) return false;
  return ['pending', 'approved', 'rejected'].includes(changeRequest.status);
};

export default function RequestChangesModal({ isOpen, booking, onClose, onRequestSubmitted }) {
  const [requestText, setRequestText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasExistingRequest, setHasExistingRequest] = useState(false);
  const [requestProcessed, setRequestProcessed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !booking) {
      setHasExistingRequest(false);
      setRequestProcessed(false);
      setRequestText('');
      return;
    }

    const docIds = booking.children?.length > 0
      ? booking.children.map((c) => c.id).filter(Boolean)
      : booking.id ? [booking.id] : [];

    if (!docIds.length) {
      setHasExistingRequest(false);
      setRequestProcessed(false);
      return;
    }

    setLoading(true);
    const requestsByDoc = {};

    const unsubs = docIds.map((id) =>
      onSnapshot(
        doc(db, 'bookings', id),
        (snap) => {
          requestsByDoc[id] = snap.exists() ? snap.data()?.changeRequest : null;
          const picked = pickChangeRequest(Object.values(requestsByDoc));
          const locked = isRequestLocked(picked);
          setHasExistingRequest(locked);
          setRequestProcessed(
            Boolean(picked && (picked.status === 'approved' || picked.status === 'rejected'))
          );
          setLoading(false);
        },
        (error) => {
          console.error('Error checking existing request:', error);
          setHasExistingRequest(false);
          setRequestProcessed(false);
          setLoading(false);
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
      setHasExistingRequest(false);
      setRequestProcessed(false);
      setRequestText('');
    };
  }, [isOpen, booking]);

  const handleSubmit = async () => {
    if (!requestText.trim() || hasExistingRequest || loading) return;

    setIsSubmitting(true);
    try {
      const changeRequestData = {
        changeRequest: {
          text: requestText.trim(),
          submittedAt: new Date().toISOString(),
          status: 'pending'
        }
      };

      if (booking.children && booking.children.length > 0) {
        for (const child of booking.children) {
          if (child.id) {
            const bookingRef = doc(db, 'bookings', child.id);
            const docSnap = await getDoc(bookingRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (isRequestLocked(data.changeRequest)) {
                setHasExistingRequest(true);
                setRequestProcessed(
                  data.changeRequest?.status === 'approved' ||
                  data.changeRequest?.status === 'rejected'
                );
                setIsSubmitting(false);
                return;
              }
            }
          }
        }

        for (const child of booking.children) {
          if (child.id) {
            const bookingRef = doc(db, 'bookings', child.id);
            await updateDoc(bookingRef, changeRequestData);
          }
        }
      } else {
        const bookingRef = doc(db, 'bookings', booking.id);
        const docSnap = await getDoc(bookingRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (isRequestLocked(data.changeRequest)) {
            setHasExistingRequest(true);
            setRequestProcessed(
              data.changeRequest?.status === 'approved' ||
              data.changeRequest?.status === 'rejected'
            );
            setIsSubmitting(false);
            return;
          }
        }

        await updateDoc(bookingRef, changeRequestData);
      }

      setSuccess(true);

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

  const isDisabled = hasExistingRequest || loading;
  const disabledPlaceholder = requestProcessed
    ? 'You cannot submit a new request at this time. Only one reservation change request is allowed.'
    : 'You cannot submit a new request at this time. Only one reservation change request is allowed.';

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
              Your change request has been submitted. The resort will review it and email you.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <i className="fas fa-exchange-alt text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-blue-900">Request Changes</h3>
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

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

               <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
    <div className="flex items-start gap-3">
      <i className="fas fa-info-circle mt-1 text-blue-500" />

      <div>
        <h4 className="text-sm font-semibold text-blue-700">
          Change Request Policy
        </h4>

        <p className="mt-1 text-xs text-blue-600">
          You can only request changes once. Please make sure all details are complete before submitting your request.
        </p>
      </div>
    </div>
  </div>
              {/* Conditional note based on booking status */}
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                <i className="fas fa-info-circle mt-0.5 text-amber-600" />
                {booking.status === 'confirmed' ? (
                  <div className="flex-1">
                    <p className="font-semibold mb-1">Change requests should only be used for:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>Adding rooms</li>
                      <li>Adding additional nights</li>
                      <li>Rescheduling the reservation</li>
                      <li>Changing the number of guests per room</li>
                    </ul>
                    <p className="mt-2">Please describe your request clearly below.</p>
                  </div>
                ) : (
                  <span>
                    Change requests should only be used for <strong>adding rooms</strong> or <strong>adding additional nights</strong> to your reservation.
                    Please describe your request clearly below.
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Your Request <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder={isDisabled ? disabledPlaceholder : "e.g., I would like to add 2 more nights from July 10–12, and one more Ground Floor room..."}
                  className={`w-full rounded-xl border border-slate-200 px-4 py-3 text-sm transition-all ${
                    isDisabled
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200'
                      : 'bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100'
                  }`}
                  disabled={isDisabled}
                />
              </div>
            </div>

            {/* Footer */}
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
