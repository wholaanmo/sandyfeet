// app/feedback/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import GuestLayout from '../guest/layout';
import { db } from '@/lib/firebase';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import SignOutConfirmationModal from '@/components/SignOutConfirmationModal';
import IdRequestNotifications from '@/components/guest/IdRequestNotifications';
import {
  fetchUserBookings,
  getTypeDisplay,
  getBookingTitle,
  formatDateOnly,
} from '../my-bookings/utils';
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
  const { user, profile, loading: authLoading, logout } = useGuestAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false); // Add this state
  
  const searchParams = useSearchParams();
  const urlBookingId = searchParams.get('bookingId');
  
  const [credentials, setCredentials] = useState({ 
    email: '', 
    reference: urlBookingId || '' 
  });
  const [feedback, setFeedback] = useState({ rating: 5, comment: '' });
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifiedBooking, setVerifiedBooking] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [hoverRating, setHoverRating] = useState(0);

  // For logged-in users
  const [userBookings, setUserBookings] = useState([]);
  const [fetchingBookings, setFetchingBookings] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // Add these handlers
  const handleSignOutClick = () => {
    setShowSignOutModal(true);
  };

  const handleConfirmSignOut = () => {
    setShowSignOutModal(false);
    logout();
  };

  const handleCancelSignOut = () => {
    setShowSignOutModal(false);
  };

  const displayName = profile?.displayName || user?.displayName || 'Guest';
  const email = user?.email || '';
  const avatarLetter = (displayName || email || 'G').charAt(0).toUpperCase();

  useEffect(() => {
    if (user) {
      loadUserBookings();
    } else {
      setUserBookings([]);
      // If not logged in but has URL booking ID, pre-fill reference
      if (urlBookingId) {
        setCredentials(prev => ({ ...prev, reference: urlBookingId }));
      }
    }
  }, [user, urlBookingId]);

  // Automatically select booking from URL if it's in the list
  useEffect(() => {
    if (userBookings.length > 0 && urlBookingId && !verifiedBooking) {
      const match = userBookings.find(b => b.bookingId === urlBookingId);
      if (match) {
        handleSelectBooking(match);
      }
    }
  }, [userBookings, urlBookingId]);

  const loadUserBookings = async () => {
    if (!user) return;
    setFetchingBookings(true);
    try {
      const allBookings = await fetchUserBookings(user);
      // Filter for completed/checked-out stays
      const completed = allBookings.filter(b => completedStatuses.has(b.status));
      
      // Check if any of these already have feedback
      const feedbackQuery = query(
        collection(db, 'feedbacks'),
        where('guestEmail', '==', user.email.toLowerCase())
      );
      const feedbackSnap = await getDocs(feedbackQuery);
      const existingBookingIds = new Set(feedbackSnap.docs.map(d => d.data().bookingId));
      
      // Filter out bookings that already have feedback
      const toReview = completed.filter(b => !existingBookingIds.has(b.bookingId));
      
      setUserBookings(toReview);
    } catch (error) {
      console.error('Error loading user bookings:', error);
    } finally {
      setFetchingBookings(false);
    }
  };

  const handleSelectBooking = (booking) => {
    const guestName = `${booking.guestInfo?.firstName || ''} ${booking.guestInfo?.lastName || ''}`.trim();
    setVerifiedBooking({
      bookingId: booking.bookingId,
      email: user?.email || booking.guestInfo?.email || '',
      guestName,
      sourceCollection: booking.type === 'daytour' ? 'dayTourBookings' : 'bookings',
      sourceDocId: booking.id,
      displayTitle: getBookingTitle(booking),
      displayDate: booking.type === 'daytour' ? formatDateOnly(booking.selectedDate) : formatDateOnly(booking.checkIn),
    });
    setSelectedBookingId(booking.bookingId);
    setMessage({ text: '', type: '' });
  };

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
      <div className="min-h-screen bg-[#F8FCFF] px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            
            {/* Left Sidebar - identical to app/account */}
            <aside className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-[#4D8CF5]/15 bg-white p-4 shadow-[0_8px_24px_rgba(77,140,245,0.08)] transition-all duration-300">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#4D8CF5]/5 blur-2xl"></div>
                <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-[#1E3A8A]/5 blur-3xl"></div>

                <div className="relative flex items-center gap-3">
                  {user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt={displayName}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4D8CF5] to-[#1E3A8A] text-lg font-bold text-white shadow-md">
                      {avatarLetter}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold tracking-tight text-[#1E3A8A]">
                      {user ? displayName : 'Guest Profile'}
                    </h2>
                    {email && (
                      <p className="truncate text-xs text-[#5C7AA6]">{email}</p>
                    )}
                  </div>
                </div>

                <div className="my-4 h-px bg-gradient-to-r from-transparent via-[#4D8CF5]/20 to-transparent"></div>

                <div className="relative flex items-center gap-2">
                  {user ? (
                    <button
                      type="button"
                      onClick={handleSignOutClick} // Changed from onClick={logout}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/15 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A8A] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4D8CF5]/10 hover:shadow-md"
                    >
                      <i className="fas fa-right-from-bracket text-[11px]"></i>
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAuthModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/15 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A8A] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4D8CF5]/10 hover:shadow-md"
                    >
                      <i className="fas fa-right-to-bracket text-[11px]"></i>
                      Sign In
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation Links - My Bookings and My Account */}
              <div className="rounded-2xl border border-[#4D8CF5]/15 bg-white p-3 shadow-[0_6px_18px_rgba(77,140,245,0.08)]">
                <div className="space-y-2">
                  <Link
                    href="/my-bookings"
                    className="group flex w-full items-center justify-between rounded-xl border border-transparent bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4D8CF5]/15 hover:bg-[#EEF5FF] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-calendar-check text-xs"></i>
                      </div>
                      <span>My Bookings</span>
                    </div>
                    <i className="fas fa-chevron-right text-[11px] text-[#4D8CF5] transition-transform duration-200 group-hover:translate-x-1"></i>
                  </Link>

                  {/* My Account button */}
                  <Link
                    href="/account"
                    className="group flex w-full items-center justify-between rounded-xl border border-transparent bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4D8CF5]/15 hover:bg-[#EEF5FF] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-user-circle text-xs"></i>
                      </div>
                      <span>My Account</span>
                    </div>
                    <i className="fas fa-chevron-right text-[11px] text-[#4D8CF5] transition-transform duration-200 group-hover:translate-x-1"></i>
                  </Link>
                </div>
              </div>

              <IdRequestNotifications />
            </aside>

            {/* Main Content Area (existing feedback UI) */}
            <section className="space-y-5">
              {/* Hero Header */}
              <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 px-6 py-8 text-white shadow-[0_20px_50px_rgba(30,58,138,0.3)] sm:px-8 sm:py-10">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="relative z-10 text-center sm:text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-200/60">
                    GUEST EXPERIENCE
                  </p>
                  <h1 className="mt-2 font-playfair text-3xl font-bold leading-tight sm:text-4xl">
                    Share Your Feedback
                  </h1>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-blue-100/70">
                    Your feedback helps us provide a better experience for future guests.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300">
                {authLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-50 border-t-blue-600" />
                    <p className="mt-4 text-sm text-blue-600 font-medium">Checking authentication...</p>
                  </div>
                ) : user ? (
                  // ─── Logged In View ───
                  !verifiedBooking ? (
                    <div className="px-6 py-8 sm:px-8">
                      <div className="mb-6 text-center sm:text-left">
                        <h2 className="text-lg font-bold text-blue-900">Select a stay to review</h2>
                        <p className="mt-1 text-sm text-blue-600/60">
                          Choose from your completed trips to share your experience.
                        </p>
                      </div>

                      {fetchingBookings ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-100 border-t-blue-600" />
                          <p className="mt-3 text-xs text-slate-400">Finding your stays...</p>
                        </div>
                      ) : userBookings.length > 0 ? (
                        <div className="grid gap-4">
                          {userBookings.map((booking) => {
                            const typeInfo = getTypeDisplay(booking);
                            const title = getBookingTitle(booking);
                            const date = booking.type === 'daytour' ? formatDateOnly(booking.selectedDate) : formatDateOnly(booking.checkIn);
                            
                            return (
                              <button
                                key={booking.key}
                                onClick={() => handleSelectBooking(booking)}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-blue-50 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-[0_10px_25px_-5px_rgba(37,99,235,0.1)] group"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm ${typeInfo.color}`}>
                                      <i className={`fas ${typeInfo.icon} text-[8px]`} />
                                      {typeInfo.label}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400">#{booking.bookingId}</span>
                                  </div>
                                  <h3 className="font-bold text-slate-900 truncate">{title}</h3>
                                  <p className="text-xs text-slate-500">{date}</p>
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-blue-500">
                                  <i className="fas fa-chevron-right text-xs" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 py-12 px-6 text-center">
                          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                            <i className="fas fa-calendar-check text-2xl text-slate-300" />
                          </div>
                          <h3 className="font-bold text-slate-800">No stays ready for review</h3>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500 max-w-[240px]">
                            Only completed or checked-out stays that haven't been reviewed yet will appear here.
                          </p>
                          <button 
                            onClick={() => window.location.href = '/my-bookings'}
                            className="mt-6 text-sm font-bold text-blue-600 hover:underline"
                          >
                            View your bookings
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Feedback form will be rendered by the else block below
                    null
                  )
                ) : (
                  // ─── Unauthenticated View ───
                  <div className="px-6 py-8 sm:px-8">
                    <div className="mb-8 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <i className="fas fa-user-circle text-3xl" />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Sign in to share feedback</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        Access your stay history and skip manual verification.
                      </p>
                      <button
                        onClick={() => setIsAuthModalOpen(true)}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.98] shadow-lg shadow-slate-900/10"
                      >
                        <i className="fab fa-google text-xs opacity-70" />
                        Sign In with Google
                      </button>
                    </div>

                    <div className="relative mb-8 text-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100" />
                      </div>
                      <span className="relative bg-white px-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Or verify manually
                      </span>
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
                          <label htmlFor="reference" className="text-[11px] font-bold uppercase tracking-widest text-blue-600/40">
                            Reference Number
                          </label>
                          <div className="group relative">
                            <i className="fas fa-hashtag absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-300 transition-colors group-focus-within:text-blue-500 text-sm" />
                            <input
                              id="reference"
                              type="text"
                              value={credentials.reference}
                              onChange={(e) =>
                                setCredentials((prev) => ({ ...prev, reference: e.target.value.toUpperCase() }))
                              }
                              placeholder="BOOK-..."
                              className="w-full rounded-2xl border border-blue-50 bg-blue-50/30 pl-10 pr-4 py-2.5 text-sm uppercase text-blue-900 transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100/50"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={!canVerify || verifying}
                        className="group relative w-full overflow-hidden rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-700 hover:shadow-[0_15px_30px_-5px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
                )}

                {/* ─── Feedback Form (Shared) ─── */}
                {verifiedBooking && (
                  <div className="px-6 py-8 sm:px-8 animate-[fadeIn_0.3s_ease-out]">
                    <div className="mb-6 flex flex-col items-center justify-between gap-4 border-b border-blue-50 pb-5 sm:flex-row">
                      <div>
                        <h2 className="text-lg font-bold text-blue-900">
                          {verifiedBooking.displayTitle || 'Your Stay at Sandyfeet'}
                        </h2>
                        <p className="mt-0.5 text-xs text-blue-600/60">
                          Stay Date: <span className="font-bold text-blue-600">{verifiedBooking.displayDate}</span> • 
                          Booking: <span className="font-mono font-bold text-blue-900">{verifiedBooking.bookingId}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVerifiedBooking(null);
                          setSelectedBookingId(null);
                          setFeedback({ rating: 5, comment: '' });
                          setMessage({ text: '', type: '' });
                        }}
                        className="rounded-xl bg-blue-50 px-4 py-2 text-xs font-bold text-blue-600 transition-all hover:bg-blue-100 hover:text-blue-700"
                      >
                        {user ? (
                          <span className="flex items-center gap-2"><i className="fas fa-arrow-left" /> Back to List</span>
                        ) : (
                          <span className="flex items-center gap-2"><i className="fas fa-search" /> Change Booking</span>
                        )}
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
                                    : 'text-blue-50'
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
                        className="relative w-full overflow-hidden rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-700 hover:shadow-[0_15px_30px_-5px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
            </section>
          </div>
        </div>
      </div>
      
      {/* Sign Out Confirmation Modal */}
      <SignOutConfirmationModal
        isOpen={showSignOutModal}
        onConfirm={handleConfirmSignOut}
        onCancel={handleCancelSignOut}
      />
      
      <GuestAuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </GuestLayout>
  );
}