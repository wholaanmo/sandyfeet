// app/feedback/page.js
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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
  normalizeBooking,
  buildMultiRoomGroup,
  getTypeDisplay,
  getBookingTitle,
  formatDateOnly,
  toDateValue,
} from '../my-bookings/utils';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

const feedbackEligibleStatuses = new Set(['check-in', 'check-out', 'completed']);

function FeedbackPageContent() {
  const { user, profile, loading: authLoading, logout } = useGuestAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

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
  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [reviewedBookings, setReviewedBookings] = useState([]);
  const [feedbackByBookingId, setFeedbackByBookingId] = useState({});
  const [fetchingBookings, setFetchingBookings] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);

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

  const splitBookingsByFeedback = (allBookings, feedbackMap) => {
    const eligible = allBookings.filter(
      (b) => feedbackEligibleStatuses.has(b.status) && !feedbackMap[b.bookingId]
    );
    const reviewed = allBookings.filter(
      (b) => feedbackEligibleStatuses.has(b.status) && feedbackMap[b.bookingId]
    );
    setEligibleBookings(eligible);
    setReviewedBookings(reviewed);
  };

  useEffect(() => {
    if (!user?.email) {
      setEligibleBookings([]);
      setReviewedBookings([]);
      setFeedbackByBookingId({});
      if (urlBookingId) {
        setCredentials((prev) => ({ ...prev, reference: urlBookingId }));
      }
      return;
    }

    setFetchingBookings(true);
    let latestBookings = [];
    let latestFeedbackMap = {};

    const applySplit = () => {
      splitBookingsByFeedback(latestBookings, latestFeedbackMap);
      setFetchingBookings(false);
    };

    const rebuildBookingsFromLive = () => {
      const deduped = Array.from(liveMap.values());
      const rooms = deduped.filter((b) => b.type === 'room');
      const dayTours = deduped.filter((b) => b.type === 'daytour');
      const grouped = [];
      const groupMap = new Map();
      rooms.forEach((b) => {
        if (b.parentBookingId) {
          if (!groupMap.has(b.parentBookingId)) groupMap.set(b.parentBookingId, []);
          groupMap.get(b.parentBookingId).push(b);
        } else {
          grouped.push(b);
        }
      });
      groupMap.forEach((children, pid) => grouped.push(buildMultiRoomGroup(children, pid)));
      latestBookings = [...grouped, ...dayTours].sort((a, b) => {
        const bD = toDateValue(b.createdAt)?.getTime() || 0;
        const aD = toDateValue(a.createdAt)?.getTime() || 0;
        return bD - aD;
      });
    };

    const liveMap = new Map();
    const normalizedEmail = user.email.toLowerCase().trim();
    const bookingUnsubs = [];

    const makeBookingSub = (col, field, value, type) => {
      const q = query(collection(db, col), where(field, '==', value));
      return onSnapshot(
        q,
        (snap) => {
          snap.docs.forEach((d) => {
            liveMap.set(`${type}-${d.id}`, normalizeBooking(d, type));
          });
          rebuildBookingsFromLive();
          applySplit();
        },
        (error) => console.error(`Error syncing bookings (${col}):`, error)
      );
    };

    bookingUnsubs.push(makeBookingSub('bookings', 'guestInfo.email', normalizedEmail, 'room'));
    bookingUnsubs.push(makeBookingSub('dayTourBookings', 'guestInfo.email', normalizedEmail, 'daytour'));
    if (user.uid) {
      bookingUnsubs.push(makeBookingSub('bookings', 'guestUid', user.uid, 'room'));
      bookingUnsubs.push(makeBookingSub('dayTourBookings', 'guestUid', user.uid, 'daytour'));
    }

    const feedbackQuery = query(
      collection(db, 'feedbacks'),
      where('guestEmail', '==', user.email.toLowerCase())
    );
    const unsubFeedback = onSnapshot(
      feedbackQuery,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.bookingId) {
            map[data.bookingId] = { id: d.id, ...data };
          }
        });
        latestFeedbackMap = map;
        setFeedbackByBookingId(map);
        applySplit();
      },
      (error) => {
        console.error('Error syncing feedback:', error);
      }
    );

    return () => {
      unsubFeedback();
      bookingUnsubs.forEach((u) => u());
    };
  }, [user, urlBookingId]);

  useEffect(() => {
    if (!isReadOnlyView || !selectedBookingId) return;
    const existing = feedbackByBookingId[selectedBookingId];
    if (existing) {
      setFeedback({
        rating: Number(existing.rating) || 5,
        comment: existing.comment || '',
      });
    }
  }, [feedbackByBookingId, selectedBookingId, isReadOnlyView]);

  useEffect(() => {
    if (!urlBookingId || verifiedBooking) return;
    const eligibleMatch = eligibleBookings.find((b) => b.bookingId === urlBookingId);
    if (eligibleMatch) {
      handleSelectBooking(eligibleMatch, false);
      return;
    }
    const reviewedMatch = reviewedBookings.find((b) => b.bookingId === urlBookingId);
    if (reviewedMatch) {
      handleSelectBooking(reviewedMatch, true);
    }
  }, [eligibleBookings, reviewedBookings, urlBookingId]);

  const handleSelectBooking = (booking, readOnly = false) => {
    const guestName = `${booking.guestInfo?.firstName || ''} ${booking.guestInfo?.lastName || ''}`.trim();
    setIsReadOnlyView(readOnly);
    if (readOnly) {
      const existing = feedbackByBookingId[booking.bookingId];
      setFeedback({
        rating: Number(existing?.rating) || 5,
        comment: existing?.comment || '',
      });
    } else {
      setFeedback({ rating: 5, comment: '' });
    }

    const title = getBookingTitle(booking);
    let displayDateLine = '';

    if (booking.type === 'daytour') {
      displayDateLine = formatDateOnly(booking.selectedDate);
    } else {
      const checkIn = formatDateOnly(booking.checkIn);
      const checkOut = formatDateOnly(booking.checkOut);
      displayDateLine = `Check-in: ${checkIn} • Check-out: ${checkOut}`;
    }

    setVerifiedBooking({
      bookingId: booking.bookingId,
      email: user?.email || booking.guestInfo?.email || '',
      guestName,
      sourceCollection: booking.type === 'daytour' ? 'dayTourBookings' : 'bookings',
      sourceDocId: booking.id,
      displayTitle: title,
      displayDate: displayDateLine,
      bookingType: booking.type,
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
      if (!feedbackEligibleStatuses.has(status)) {
        showMessage('Feedback can only be submitted for checked-in, checked-out, or completed bookings.', 'error');
        return;
      }

      const duplicateQuery = query(collection(db, 'feedbacks'), where('bookingId', '==', normalizedReference), limit(1));
      const duplicateSnap = await getDocs(duplicateQuery);
      if (!duplicateSnap.empty) {
        showMessage('Feedback for this booking was already submitted.', 'error');
        return;
      }

      const guestName = `${booking.data?.guestInfo?.firstName || ''} ${booking.data?.guestInfo?.lastName || ''}`.trim();
      const bookingType = roomBooking ? 'room' : 'daytour';
      let displayDateLine = '';
      if (bookingType === 'daytour') {
        displayDateLine = formatDateOnly(booking.data?.selectedDate);
      } else {
        const checkIn = formatDateOnly(booking.data?.checkIn);
        const checkOut = formatDateOnly(booking.data?.checkOut);
        displayDateLine = `Check-in: ${checkIn} • Check-out: ${checkOut}`;
      }

      setVerifiedBooking({
        bookingId: normalizedReference,
        email: normalizedEmail,
        guestName,
        sourceCollection: booking.collectionName,
        sourceDocId: booking.id,
        displayTitle: getBookingTitle({ type: bookingType, ...booking.data }),
        displayDate: displayDateLine,
        bookingType,
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
    if (!verifiedBooking || isReadOnlyView) return;

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
      setVerifiedBooking(null);
      setSelectedBookingId(null);
      setIsReadOnlyView(false);
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
      ? 'border-red-200 bg-red-50 text-red-700 shadow-[0_2px_12px_rgba(239,68,68,0.08)]'
      : message.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_2px_12px_rgba(16,185,129,0.08)]'
      : 'border-blue-200 bg-blue-50 text-blue-700 shadow-[0_2px_12px_rgba(59,130,246,0.08)]';

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            {/* Left Sidebar */}
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
                      onClick={handleSignOutClick}
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

              {/* Navigation Links */}
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

            {/* Main Content Area */}
            <section className="space-y-5">
              {/* Hero Header */}
              <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#7AAAF8]/20 bg-gradient-to-br from-[#7AAAF8]/5 via-white to-[#7AAAF8]/5 p-5 shadow-sm backdrop-blur-sm sm:p-6">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#4D8CF5]/10 blur-3xl"></div>
                <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[#1E3A8A]/5 blur-3xl"></div>
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1E3A8A] font-playfair sm:text-3xl">
                      Share Your Feedback
                    </h1>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#4D6FA8]">
                      Your feedback helps us provide a better experience for future guests.
                    </p>
                  </div>
                  <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-[#7AAAF8]/20 bg-white shadow-sm transition-all duration-200 hover:scale-105 sm:flex">
                    <i className="fas fa-comment-dots text-xl text-[#4D6FA8]"></i>
                  </div>
                </div>
              </div>

              {authLoading ? (
                <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300">
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-50 border-t-blue-600" />
                    <p className="mt-4 text-sm font-medium text-blue-600">Checking authentication…</p>
                  </div>
                </div>
              ) : user ? (
                // Logged In View
                !verifiedBooking ? (
                  <div className="space-y-6">
                    {/* Select a stay to review */}
                   <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_36px_rgba(59,130,246,0.08)]">
  <div className="relative border-b border-blue-100 bg-[#FAFCFF] px-6 py-4 sm:px-8">
    
    {/* Soft Decorative Accent */}
    <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-blue-100/30 blur-2xl"></div>

    <div className="relative z-10">
      <div className="flex items-center gap-3">
        
        {/* Refined Icon Container */}
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-100 bg-white shadow-sm">
          <i className="fas fa-pen-fancy text-[11px] text-blue-500"></i>
        </div>

        <h2 className="text-md font-bold uppercase tracking-wide text-blue-900">
          Select a Stay to Review
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-blue-600/70">
        Choose from your checked-in, checked-out, or completed stays to share your experience.
      </p>
    </div>
  </div>
                      <div className="px-6 py-6 sm:px-8">
                        {fetchingBookings ? (
                          <div className="flex flex-col items-center justify-center py-12">
                            <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-100 border-t-blue-600" />
                            <p className="mt-3 text-xs text-slate-400">Finding your stays…</p>
                          </div>
                        ) : eligibleBookings.length > 0 ? (
                          <div className="grid gap-4">
                            {eligibleBookings.map((booking) => {
                              const typeInfo = getTypeDisplay(booking);
                              const title = getBookingTitle(booking);
                              let dateLine;
                              if (booking.type === 'daytour') {
                                dateLine = formatDateOnly(booking.selectedDate);
                              } else {
                                dateLine = `Check-in: ${formatDateOnly(booking.checkIn)} • Check-out: ${formatDateOnly(booking.checkOut)}`;
                              }
                              return (
                                <button
                                  key={booking.key}
                                  onClick={() => handleSelectBooking(booking, false)}
                                  className="group flex items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm ${typeInfo.color}`}>
                                        <i className={`fas ${typeInfo.icon} text-[8px]`} />
                                        {typeInfo.label}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">{booking.bookingId}</span>
                                    </div>
                                    <h3 className="font-bold text-slate-900 truncate">{title}</h3>
                                    <p className="mt-0.5 text-xs text-slate-500">{dateLine}</p>
                                  </div>
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-100 group-hover:text-blue-600">
                                    <i className="fas fa-chevron-right text-xs" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-50/50 py-12 text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-4 ring-slate-50">
                              <i className="fas fa-calendar-check text-2xl text-slate-300" />
                            </div>
                            <h3 className="font-bold text-slate-800">No stays ready for review</h3>
                            <p className="mt-2 text-xs text-slate-500 max-w-[240px]">
                              Checked‑in, checked‑out, or completed stays that have not been reviewed yet will appear here.
                            </p>
                            <button
                              onClick={() => window.location.href = '/my-bookings'}
                              className="mt-6 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                            >
                              View your bookings
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reviewed Bookings */}
                    {!fetchingBookings && reviewedBookings.length > 0 && (
                      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/50 shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-all duration-300">
                      <div className="relative border-b border-slate-200 bg-[#FCFDFD] px-6 py-4 sm:px-8">
  
  {/* Soft Decorative Accent */}
  <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-emerald-100/30 blur-2xl"></div>

  <div className="relative z-10">
    <div className="flex items-center gap-3">
      
      {/* Refined Icon Container */}
      <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-white shadow-sm">
        <i className="fas fa-check-circle text-[11px] text-emerald-500"></i>
      </div>

      <h2 className="text-md font-bold uppercase tracking-wide text-slate-800">
        Reviewed Bookings
      </h2>
    </div>

    <p className="mt-2 text-sm leading-relaxed text-slate-500">
      Feedback you have already submitted.
    </p>
  </div>
</div>
                        <div className="px-6 py-6 sm:px-8">
                          <div className="grid gap-4">
                            {reviewedBookings.map((booking) => {
                              const typeInfo = getTypeDisplay(booking);
                              const title = getBookingTitle(booking);
                              let dateLine;
                              if (booking.type === 'daytour') {
                                dateLine = formatDateOnly(booking.selectedDate);
                              } else {
                                dateLine = `Check-in: ${formatDateOnly(booking.checkIn)} • Check-out: ${formatDateOnly(booking.checkOut)}`;
                              }
                              const submitted = feedbackByBookingId[booking.bookingId];
                              return (
                                <button
                                  key={`reviewed-${booking.key}`}
                                  onClick={() => handleSelectBooking(booking, true)}
                                  className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-slate-300 hover:shadow-md"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm ${typeInfo.color}`}>
                                        <i className={`fas ${typeInfo.icon} text-[8px]`} />
                                        {typeInfo.label}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 ring-1 ring-emerald-200/50">
                                        <i className="fas fa-check text-[8px]" />
                                        Submitted
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">{booking.bookingId}</span>
                                    </div>
                                    <h3 className="font-bold text-slate-800 truncate">{title}</h3>
                                    <p className="mt-0.5 text-xs text-slate-500">{dateLine}</p>
                                    {submitted?.rating && (
                                      <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-500">
                                        <div className="flex items-center">
                                          {[...Array(5)].map((_, i) => (
                                            <i key={i} className={`fas fa-star text-[10px] ${i < submitted.rating ? 'text-amber-400' : 'text-slate-200'}`} />
                                          ))}
                                        </div>
                                        <span className="ml-1 text-slate-400 font-medium">({submitted.rating}/5)</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-slate-100 group-hover:text-slate-600">
                                    <i className="fas fa-eye text-xs" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null
              ) : (
                // Unauthenticated View - Matching My Bookings style
                <div className="flex flex-col items-center rounded-3xl border border-blue-100 bg-white px-6 py-16 text-center shadow-[0_10px_40px_rgba(30,58,138,0.04)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                    <i className="fas fa-lock text-2xl" />
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-blue-900">Sign in to share your feedback</h2>
                  <p className="mt-2 max-w-xs text-sm text-blue-600/60 leading-relaxed">
                    Access your stay history and give feedback about your experience at the resort.
                  </p>
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    disabled={authLoading}
                    className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-700 hover:shadow-[0_15px_30px_-5px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:opacity-60"
                  >
                    <i className="fas fa-sign-in-alt" />
                    Sign In to Account
                  </button>
                        </div>

              )}

              {/* Feedback Form (Shared) */}
              {verifiedBooking && (
                <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300">
                  <div className="px-6 py-8 sm:px-8 animate-[fadeIn_0.3s_ease-out]">
                    <div className="mb-6 flex flex-col items-center justify-between gap-4 border-b border-blue-50 pb-5 sm:flex-row">
                      <div>
                        <h2 className="text-lg font-bold text-blue-900">
                          {verifiedBooking.displayTitle || 'Your Stay at Sandyfeet'}
                        </h2>
                        <p className="mt-0.5 text-xs text-blue-600/60">
                          {verifiedBooking.bookingType === 'daytour' ? (
                            <>Stay Date: <span className="font-bold text-blue-600">{verifiedBooking.displayDate}</span></>
                          ) : (
                            <>{verifiedBooking.displayDate}</>
                          )}
                          {' • '}
                          Booking: <span className="font-mono font-bold text-blue-900">{verifiedBooking.bookingId}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVerifiedBooking(null);
                          setSelectedBookingId(null);
                          setIsReadOnlyView(false);
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

                    {isReadOnlyView && (
                      <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                        <i className="fas fa-lock mr-2 text-xs" />
                        This feedback has already been submitted and is shown in read‑only mode.
                      </div>
                    )}

                    <form onSubmit={handleSubmitFeedback} className="space-y-6">
                      <div className="space-y-3 text-center">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Rate your overall experience</p>
                        <div className="flex justify-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              disabled={isReadOnlyView}
                              onMouseEnter={() => !isReadOnlyView && setHoverRating(star)}
                              onMouseLeave={() => !isReadOnlyView && setHoverRating(0)}
                              onClick={() => !isReadOnlyView && setFeedback((prev) => ({ ...prev, rating: star }))}
                              className="group relative p-1.5 transition-transform active:scale-90 disabled:cursor-default"
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
                          onChange={(e) => !isReadOnlyView && setFeedback((prev) => ({ ...prev, comment: e.target.value }))}
                          readOnly={isReadOnlyView}
                          placeholder="Was the service great? How was your stay? We'd love to hear from you…"
                          className={`w-full resize-none rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-800 transition-all focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100/50 placeholder:text-slate-400 ${isReadOnlyView ? 'bg-slate-100 cursor-default' : 'bg-slate-50 focus:bg-white'}`}
                          required={!isReadOnlyView}
                        />
                        {!isReadOnlyView && (
                          <div className="flex justify-end">
                            <p className={`text-[10px] font-bold ${feedback.comment.length < 10 ? 'text-slate-400' : 'text-emerald-500'}`}>
                              {feedback.comment.length} / 10 characters min
                            </p>
                          </div>
                        )}
                      </div>

                      {!isReadOnlyView && (
                        <button
                          type="submit"
                          disabled={submitting || feedback.comment.trim().length < 10}
                          className="relative w-full overflow-hidden rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-700 hover:shadow-[0_15px_30px_-5px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                        >
                          {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                              <i className="fas fa-spinner fa-spin" />
                              <span>Submitting…</span>
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <i className="fas fa-paper-plane text-xs opacity-70" />
                              <span>Submit Feedback</span>
                            </span>
                          )}
                        </button>
                      )}
                    </form>
                  </div>
                </div>
              )}

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
                  Having trouble? Contact us at{' '}
                  <a href="mailto:sandyfeetreservation@gmail.com" className="text-slate-900 underline hover:text-blue-600 transition-colors">
                    sandyfeetreservation@gmail.com
                  </a>
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

// Wrap the component with Suspense to handle useSearchParams during static generation
export default function FeedbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
        <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
      </div>
    }>
      <FeedbackPageContent />
    </Suspense>
  );
}