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

const completedStatuses = new Set(['completed', 'check-out']);

export default function FeedbackPage() {
  const [credentials, setCredentials] = useState({ email: '', reference: '' });
  const [feedback, setFeedback] = useState({ rating: 5, comment: '' });
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifiedBooking, setVerifiedBooking] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [hoverRating, setHoverRating] = useState(0);

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

      const status = String(booking.data?.status || '').toLowerCase();
      if (!completedStatuses.has(status)) {
        showMessage('Feedback can only be submitted after your stay/tour is completed.', 'error');
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
      showMessage('Thank you! Your feedback has been submitted successfully.', 'success');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showMessage('Failed to submit feedback. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const messageClassName =
    message.type === 'error'
      ? 'border-red-100 bg-red-50 text-red-700 shadow-[0_2px_10px_rgba(239,68,68,0.1)]'
      : message.type === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700 shadow-[0_2px_10px_rgba(16,185,129,0.1)]'
      : 'border-blue-100 bg-blue-50 text-blue-700 shadow-[0_2px_10px_rgba(59,130,246,0.1)]';

  return (
    <GuestLayout>
      <div className="min-h-screen bg-slate-50 px-4 pb-20 pt-20 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-2xl">
          
          {/* ══════ Hero Header ══════ */}
          <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-6 py-8 text-white shadow-lg sm:px-8 sm:py-10">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
            <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
            <div className="relative z-10 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                GUEST EXPERIENCE
              </p>
              <h1 className="mt-2 font-playfair text-3xl font-bold leading-tight sm:text-4xl">
                Share Your Feedback
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">
                Your feedback helps us provide a better experience for future guests.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300">
            {!verifiedBooking ? (
              <div className="px-6 py-8 sm:px-8">
                <div className="mb-6 text-center sm:text-left">
                  <h2 className="text-lg font-bold text-slate-900">Verify Your Booking</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter your details to unlock the feedback form.
                  </p>
                </div>

                <form onSubmit={handleVerifyBooking} className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Email Address
                      </label>
                      <div className="group relative">
                        <i className="fas fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500 text-sm" />
                        <input
                          id="email"
                          type="email"
                          value={credentials.email}
                          onChange={(e) => setCredentials((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder="you@example.com"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-800 transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100/50"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="reference" className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Reference Number
                      </label>
                      <div className="group relative">
                        <i className="fas fa-hashtag absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500 text-sm" />
                        <input
                          id="reference"
                          type="text"
                          value={credentials.reference}
                          onChange={(e) =>
                            setCredentials((prev) => ({ ...prev, reference: e.target.value.toUpperCase() }))
                          }
                          placeholder="BOOK-..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm uppercase text-slate-800 transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100/50"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!canVerify || verifying}
                    className="group relative w-full overflow-hidden rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="relative z-10 flex items-center justify-center gap-2">
                      {verifying ? (
                        <>
                          <i className="fas fa-spinner fa-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-shield-alt text-xs opacity-70" />
                          <span>Verify & Continue</span>
                        </>
                      )}
                    </div>
                  </button>
                </form>
              </div>
            ) : (
              <div className="px-6 py-8 sm:px-8 animate-[fadeIn_0.3s_ease-out]">
                <div className="mb-6 flex flex-col items-center justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Your Stay at Sandyfeet</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Booking: <span className="font-mono font-bold text-slate-900">{verifiedBooking.bookingId}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifiedBooking(null);
                      setFeedback({ rating: 5, comment: '' });
                      setMessage({ text: '', type: '' });
                    }}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    Change Booking
                  </button>
                </div>

                <form onSubmit={handleSubmitFeedback} className="space-y-6">
                  <div className="space-y-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Rate your overall experience</p>
                    <div className="flex justify-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setFeedback((prev) => ({ ...prev, rating: star }))}
                          className="group relative p-1.5 transition-transform active:scale-90"
                        >
                          <i 
                            className={`fas fa-star text-2xl sm:text-3xl transition-all duration-200 ${
                              star <= (hoverRating || feedback.rating)
                                ? 'scale-110 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                                : 'text-slate-200'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <p className="text-xs font-bold text-slate-600">
                      {feedback.rating === 5 && 'Excellent'}
                      {feedback.rating === 4 && 'Very Good'}
                      {feedback.rating === 3 && 'Good'}
                      {feedback.rating === 2 && 'Fair'}
                      {feedback.rating === 1 && 'Poor'}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="comment" className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Describe your experience
                    </label>
                    <textarea
                      id="comment"
                      rows={4}
                      value={feedback.comment}
                      onChange={(e) => setFeedback((prev) => ({ ...prev, comment: e.target.value }))}
                      placeholder="Was the service great? How was your stay? We'd love to hear from you..."
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100/50 placeholder:text-slate-400"
                      required
                    />
                    <div className="flex justify-end">
                      <p className={`text-[10px] font-bold ${feedback.comment.length < 10 ? 'text-slate-400' : 'text-emerald-500'}`}>
                        {feedback.comment.length} / 10 characters min
                      </p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || feedback.comment.trim().length < 10}
                    className="relative w-full overflow-hidden rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-spinner fa-spin" />
                        <span>Submitting...</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-paper-plane text-xs opacity-70" />
                        <span>Submit Feedback</span>
                      </span>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>

          {message.text && (
            <div className={`mt-6 animate-[fadeIn_0.3s_ease-out] rounded-2xl border px-6 py-4 text-sm font-medium ${messageClassName}`}>
              <div className="flex items-center gap-3">
                <i className={`fas ${
                  message.type === 'error' ? 'fa-exclamation-circle' : 
                  message.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
                }`} />
                {message.text}
              </div>
            </div>
          )}

          <div className="mt-12 flex flex-col items-center justify-center gap-4 text-center">
             <div className="h-px w-20 bg-slate-200" />
             <p className="text-xs font-medium text-slate-400">
               Having trouble? Contact us at <a href="mailto:sandyfeetreservation@gmail.com" className="text-slate-900 underline hover:text-blue-600">sandyfeetreservation@gmail.com</a>
             </p>
          </div>
        </div>
      </div>
    </GuestLayout>
  );
}