// app/feedback/page.js
'use client';

import { useMemo, useState } from 'react';
import GuestLayout from '../guest/layout';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

const completedStatuses = new Set(['completed']);

export default function FeedbackPage() {
  const [credentials, setCredentials] = useState({ email: '', reference: '' });
  const [feedback, setFeedback] = useState({ rating: 5, comment: '' });
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifiedBooking, setVerifiedBooking] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  const canVerify = useMemo(() => {
    return credentials.email.trim().length > 4 && credentials.reference.trim().length > 6;
  }, [credentials.email, credentials.reference]);

  const showMessage = (text, type = 'info') => setMessage({ text, type });

  const fetchBookingByReference = async (collectionName, bookingId) => {
    const ref = collection(db, collectionName);
    const q = query(ref, where('bookingId', '==', bookingId), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    return {
      id: docSnap.id,
      collectionName,
      data: docSnap.data(),
    };
  };

  const handleVerifyBooking = async (event) => {
    event.preventDefault();
    if (!canVerify) return;

    setVerifying(true);
    setMessage({ text: '', type: '' });

    try {
      const normalizedEmail = credentials.email.trim().toLowerCase();
      const normalizedReference = credentials.reference.trim().toUpperCase();

      const roomBooking = await fetchBookingByReference('bookings', normalizedReference);
      const dayTourBooking = roomBooking
        ? null
        : await fetchBookingByReference('dayTourBookings', normalizedReference);

      const booking = roomBooking || dayTourBooking;

      if (!booking) {
        showMessage('No booking found for that reference number.', 'error');
        return;
      }

      const bookingEmail = String(booking.data?.guestInfo?.email || '').trim().toLowerCase();
      if (!bookingEmail || bookingEmail !== normalizedEmail) {
        showMessage('Email does not match the booking reference.', 'error');
        return;
      }

      if (!completedStatuses.has(String(booking.data?.status || '').toLowerCase())) {
        showMessage('Only completed bookings can submit feedback.', 'error');
        return;
      }

      const duplicateQuery = query(collection(db, 'feedbacks'), where('bookingId', '==', normalizedReference), limit(1));
      const duplicateSnap = await getDocs(duplicateQuery);
      if (!duplicateSnap.empty) {
        showMessage('Feedback for this booking was already submitted.', 'error');
        return;
      }

      const guestName = `${booking.data?.guestInfo?.firstName || ''} ${booking.data?.guestInfo?.lastName || ''}`.trim();

      setVerifiedBooking({
        bookingId: normalizedReference,
        email: normalizedEmail,
        guestName,
        sourceCollection: booking.collectionName,
        sourceDocId: booking.id,
      });

      showMessage('Booking verified. You can now submit your feedback.', 'success');
    } catch (error) {
      console.error('Error verifying booking:', error);
      showMessage('Failed to verify booking. Please try again.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmitFeedback = async (event) => {
    event.preventDefault();
    if (!verifiedBooking) return;

    const trimmedComment = feedback.comment.trim();
    if (trimmedComment.length < 10) {
      showMessage('Please enter at least 10 characters for your feedback.', 'error');
      return;
    }

    setSubmitting(true);
    setMessage({ text: '', type: '' });

    try {
      await addDoc(collection(db, 'feedbacks'), {
        bookingId: verifiedBooking.bookingId,
        guestEmail: verifiedBooking.email,
        guestName: verifiedBooking.guestName || 'Guest',
        rating: Number(feedback.rating),
        comment: trimmedComment,
        sourceCollection: verifiedBooking.sourceCollection,
        sourceDocId: verifiedBooking.sourceDocId,
        createdAt: serverTimestamp(),
      });

      setFeedback({ rating: 5, comment: '' });
      showMessage('Thank you. Your feedback has been submitted.', 'success');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showMessage('Failed to submit feedback. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const messageClassName =
    message.type === 'error'
      ? 'border-red-100 bg-red-50 text-red-700'
      : message.type === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border-blue-100 bg-blue-50 text-blue-700';

  return (
    <GuestLayout>
      <section className="bg-white py-16">
        <div className="mx-auto w-full max-w-3xl px-6">
          <div className="mb-10 text-center">
            <h1 className="mb-3 font-playfair text-4xl text-textPrimary md:text-5xl">Add Feedback</h1>
            <p className="text-sm text-textSecondary md:text-base">
              Enter the email and reference number from your completed booking before sharing feedback.
            </p>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_10px_32px_rgb(0,0,0,0.05)] md:p-8">
            {!verifiedBooking ? (
              <form onSubmit={handleVerifyBooking} className="space-y-5">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                    Email used in booking
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={credentials.email}
                    onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#3B82F6]"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="reference" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                    Booking reference number
                  </label>
                  <input
                    id="reference"
                    type="text"
                    value={credentials.reference}
                    onChange={(event) =>
                      setCredentials((prev) => ({ ...prev, reference: event.target.value.toUpperCase() }))
                    }
                    placeholder="BOOK-... or DAYTOUR-..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm uppercase text-gray-700 outline-none transition focus:border-[#3B82F6]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canVerify || verifying}
                  className="w-full rounded-full bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifying ? 'Verifying...' : 'Verify Booking'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-5">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Verified booking: <strong>{verifiedBooking.bookingId}</strong>
                </div>

                <div>
                  <label htmlFor="rating" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                    Rating
                  </label>
                  <select
                    id="rating"
                    value={feedback.rating}
                    onChange={(event) => setFeedback((prev) => ({ ...prev, rating: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#3B82F6]"
                  >
                    <option value={5}>5 - Excellent</option>
                    <option value={4}>4 - Very Good</option>
                    <option value={3}>3 - Good</option>
                    <option value={2}>2 - Fair</option>
                    <option value={1}>1 - Poor</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="comment" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                    Your feedback
                  </label>
                  <textarea
                    id="comment"
                    rows={5}
                    value={feedback.comment}
                    onChange={(event) => setFeedback((prev) => ({ ...prev, comment: event.target.value }))}
                    placeholder="Tell us about your stay..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#3B82F6]"
                    required
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-full bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifiedBooking(null);
                      setFeedback({ rating: 5, comment: '' });
                      setMessage({ text: '', type: '' });
                    }}
                    className="w-full rounded-full border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Change Booking
                  </button>
                </div>
              </form>
            )}

            {message.text ? (
              <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${messageClassName}`}>{message.text}</div>
            ) : null}
          </div>
        </div>
      </section>
    </GuestLayout>
  );
}