// app/my-bookings/page.js
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import GuestLayout from '@/app/guest/layout';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import BookingCard from './BookingCard';
import SignOutConfirmationModal from '@/components/SignOutConfirmationModal';
import IdRequestNotifications from '@/components/guest/IdRequestNotifications';
import {
  normalizeBooking,
  buildMultiRoomGroup,
  toDateValue,
  cancelBooking,
  getTypeDisplay,
} from './utils';

// Updated TAB_OPTIONS with "All" tab as the first option
const TAB_OPTIONS = [
  { id: 'all',       label: 'All',       icon: 'fa-list',          emptyIcon: 'fa-calendar-alt', emptyText: 'No bookings found', color: 'blue' },
  { id: 'pending',   label: 'Pending',   icon: 'fa-clock',         emptyIcon: 'fa-hourglass-half', emptyText: 'No pending reservations', color: 'amber' },
  { id: 'success',   label: 'Confirmed', icon: 'fa-check-circle',  emptyIcon: 'fa-calendar-check', emptyText: 'No confirmed reservations yet', color: 'emerald' },
  { id: 'cancelled', label: 'Cancelled', icon: 'fa-times-circle',  emptyIcon: 'fa-ban',            emptyText: 'No cancelled reservations', color: 'red' },
  { id: 'completed', label: 'Completed', icon: 'fa-check-double',  emptyIcon: 'fa-calendar-check', emptyText: 'No completed reservations', color: 'blue' },
];

export default function MyBookingsPage() {
  const { user, profile, loading, logout, updateGuestProfile } = useGuestAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // <-- added search state

  // ─── Cancel Modal State ───
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const displayName = profile?.displayName || user?.displayName || 'Guest';
  const email = user?.email || '';
  const avatarLetter = (displayName || email || 'G').charAt(0).toUpperCase();

  const handleSignOutClick = () => setShowSignOutModal(true);
  const handleConfirmSignOut = () => { setShowSignOutModal(false); logout(); };
  const handleCancelSignOut = () => setShowSignOutModal(false);

  // ─── Real-time Firestore Listener (unchanged) ───
  useEffect(() => {
    if (!user?.email) {
      setBookings([]);
      return;
    }

    setBookingsLoading(true);
    setBookingsError('');

    const normalizedEmail = user.email.toLowerCase().trim();
    const unsubs = [];
    const liveMap = new Map();

    const rebuild = () => {
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

      const sorted = [...grouped, ...dayTours].sort((a, b) => {
        const bD = toDateValue(b.createdAt)?.getTime() || 0;
        const aD = toDateValue(a.createdAt)?.getTime() || 0;
        return bD - aD;
      });

      setBookings(sorted);
      setBookingsLoading(false);
    };

    const makeSub = (col, field, value, type) => {
      const q = query(collection(db, col), where(field, '==', value));
      return onSnapshot(q, (snap) => {
        snap.docs.forEach((d) => {
          liveMap.set(`${type}-${d.id}`, normalizeBooking(d, type));
        });
        rebuild();
      }, (err) => {
        console.error(`Snapshot error (${col}):`, err);
        setBookingsError('Unable to load bookings right now.');
        setBookingsLoading(false);
      });
    };

    unsubs.push(makeSub('bookings', 'guestInfo.email', normalizedEmail, 'room'));
    unsubs.push(makeSub('dayTourBookings', 'guestInfo.email', normalizedEmail, 'daytour'));
    unsubs.push(makeSub('bookings', 'guestUid', user.uid, 'room'));
    unsubs.push(makeSub('dayTourBookings', 'guestUid', user.uid, 'daytour'));

    return () => unsubs.forEach((u) => u());
  }, [user?.email, user?.uid]);

  // ─── Filtered + Counts (updated for All tab and search) ───
  const { filtered, counts } = useMemo(() => {
    // First, filter by search query (booking type or booking ID)
    const searchLower = searchQuery.toLowerCase().trim();
    let searchFiltered = bookings;
    if (searchLower) {
      searchFiltered = bookings.filter((b) => {
        // Get booking type label from utils
        const typeLabel = getTypeDisplay(b).label.toLowerCase();
        // Check if bookingId matches (case‑insensitive)
        const idMatch = b.bookingId?.toLowerCase().includes(searchLower);
        const typeMatch = typeLabel.includes(searchLower);
        return idMatch || typeMatch;
      });
    }

    // Then split by status groups
    const pending = searchFiltered.filter((b) => b.status === 'pending');
    const confirmed = searchFiltered.filter((b) => ['confirmed', 'check-in', 'check-out'].includes(b.status));
    const cancelled = searchFiltered.filter((b) => ['cancelled', 'cancelled-by-guest'].includes(b.status));
    const completed = searchFiltered.filter((b) => b.status === 'completed');

    // Counts for tab badges (using searchFiltered length for 'all')
    const c = {
      all: searchFiltered.length,
      pending: pending.length,
      success: confirmed.length,
      cancelled: cancelled.length,
      completed: completed.length,
    };

    let f;
    if (activeTab === 'all') f = searchFiltered;
    else if (activeTab === 'pending') f = pending;
    else if (activeTab === 'cancelled') f = cancelled;
    else if (activeTab === 'completed') f = completed;
    else f = confirmed; // activeTab === 'success'

    return { filtered: f, counts: c };
  }, [activeTab, bookings, searchQuery]);

  const handleBookingUpdated = useCallback(() => {
    setBookings(prev => [...prev]); // Force re-render if needed
  }, []);

  // ─── Cancel Handlers (unchanged) ───
  const openCancelModal = useCallback((booking) => {
    setCancelTarget(booking);
    setCancelReason('');
    setCancelError('');
    setCancelSuccess(false);
  }, []);

  const closeCancelModal = useCallback(() => {
    if (cancelBusy) return;
    setCancelTarget(null);
    setCancelReason('');
    setCancelError('');
    setCancelSuccess(false);
  }, [cancelBusy]);

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    const trimmed = cancelReason.trim();
    if (!trimmed) {
      setCancelError('Please provide a reason for cancellation.');
      return;
    }

    setCancelBusy(true);
    setCancelError('');

    try {
      await cancelBooking(cancelTarget, trimmed);
      setCancelSuccess(true);
      setTimeout(() => {
        closeCancelModal();
      }, 1800);
    } catch (err) {
      console.error('Cancellation failed:', err);
      setCancelError('Something went wrong. Please try again.');
    } finally {
      setCancelBusy(false);
    }
  }, [cancelTarget, cancelReason, closeCancelModal]);

  // ─── Current Tab Meta ───
  const currentTab = TAB_OPTIONS.find((t) => t.id === activeTab) || TAB_OPTIONS[0];
  const colorMap = {
    amber: 'bg-yellow-500',
    emerald: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            {/* ─── Left Sidebar ─── */}
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
                      onClick={() => setIsAuthOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/15 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A8A] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4D8CF5]/10 hover:shadow-md"
                    >
                      <i className="fas fa-right-to-bracket text-[11px]"></i>
                      Sign In
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#4D8CF5]/15 bg-white p-3 shadow-[0_6px_18px_rgba(77,140,245,0.08)]">
                <div className="space-y-2">
                  {/* My Account link */}
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

                  {/* Feedback link */}
                  <Link
                    href="/feedback"
                    className="group flex w-full items-center justify-between rounded-xl border border-transparent bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4D8CF5]/15 hover:bg-[#EEF5FF] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-comment-dots text-xs"></i>
                      </div>
                      <span>Feedback</span>
                    </div>
                    <i className="fas fa-chevron-right text-[11px] text-[#4D8CF5] transition-transform duration-200 group-hover:translate-x-1"></i>
                  </Link>
                </div>
              </div>

              <IdRequestNotifications />
            </aside>

            {/* ─── Main Content ─── */}
            <section className="space-y-5">
              <div className="mb-6 overflow-hidden rounded-2xl border border-[#7AAAF8]/15 bg-[#7AAAF8]/3 p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative">
                    <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-[#7AAAF8]/10 blur-2xl"></div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A] font-playfair">
                      My Bookings
                    </h1>
                    <p className="mt-1 text-sm leading-relaxed text-[#4D6FA8]">
                      Track your reservations and stay updated with booking status.
                    </p>
                  </div>
                  <div className="hidden sm:flex h-14 w-14 items-center justify-center rounded-2xl border border-[#7AAAF8]/15 bg-white shadow-sm transition-all duration-200 hover:scale-105">
                    <i className="fas fa-calendar-check text-xl text-[#4D6FA8]"></i>
                  </div>
                </div>
              </div>

              {/* Unauthenticated */}
              {!user && (
                <div className="flex flex-col items-center rounded-3xl border border-blue-100 bg-white px-6 py-16 text-center shadow-[0_10px_40px_rgba(30,58,138,0.04)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                    <i className="fas fa-lock text-2xl" />
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-blue-900">Sign in to view your bookings</h2>
                  <p className="mt-2 max-w-xs text-sm text-blue-600/60 leading-relaxed">
                    Access your reservation details, schedules, and payment information.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsAuthOpen(true)}
                    disabled={loading}
                    className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-700 hover:shadow-[0_15px_30px_-5px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:opacity-60"
                  >
                    <i className="fas fa-sign-in-alt" />
                    Sign In to Account
                  </button>
                </div>
              )}

              {/* Authenticated */}
              {user && (
                <>
                  {/* Search Bar */}
                  <div className="mb-4">
                    <div className="relative w-full group">
                      <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>
                      <input
                        type="text"
                        placeholder="Search by booking ID or type (Day Tour, Entire Resort, Single Room, Multi-Room)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-5 py-3 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <i className="fas fa-times-circle text-sm"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tab Navigation (including All tab) */}
                  <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
                    {TAB_OPTIONS.map((tab) => {
                      const isActive = activeTab === tab.id;
                      const count = counts[tab.id] || 0;
                      const activeColor = colorMap[tab.color];
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`group relative flex items-center gap-2 whitespace-nowrap rounded-2xl px-5 py-2.5 text-sm font-bold transition-all duration-300 ${
                            isActive
                              ? `${activeColor} text-white shadow-md`
                              : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          <i className={`fas ${tab.icon} text-xs ${isActive ? 'text-white/70' : 'text-slate-400 group-hover:text-slate-500'}`} />
                          {tab.label}
                          {count > 0 && (
                            <span className={`ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Booking List */}
                  <div className="space-y-4">
                    {bookingsLoading ? (
                      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-blue-50 bg-white py-16 shadow-[0_10px_40px_rgba(30,58,138,0.04)]">
                        <div className="relative">
                          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-blue-50 border-t-blue-600" />
                        </div>
                        <p className="mt-4 text-sm font-medium text-blue-600/50">Loading your reservations…</p>
                      </div>
                    ) : bookingsError ? (
                      <div className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                          <i className="fas fa-exclamation-triangle text-lg text-red-500" />
                        </div>
                        <p className="mt-4 text-sm font-medium text-red-700">{bookingsError}</p>
                      </div>
                    ) : filtered.length > 0 ? (
                      filtered.map((booking) => (
                        <BookingCard
                          key={booking.key}
                          booking={booking}
                          onCancel={openCancelModal}
                          onEditSuccess={handleBookingUpdated}
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                          <i className={`fas ${currentTab.emptyIcon} text-xl text-slate-400`} />
                        </div>
                        <p className="mt-4 text-sm font-medium text-slate-600">{currentTab.emptyText}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {activeTab === 'pending'
                            ? 'New reservations will appear here.'
                            : activeTab === 'success'
                              ? 'Confirmed bookings will show up here once approved.'
                              : activeTab === 'cancelled'
                              ? 'Any cancelled reservations will be listed here.'
                              : activeTab === 'completed'
                              ? 'Completed stays will appear here after checkout.'
                              : 'Try adjusting your search or clear the filter.'}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeCancelModal}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            {cancelSuccess ? (
              <div className="flex flex-col items-center px-8 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <i className="fas fa-check text-2xl text-emerald-600" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">Reservation Cancelled</h3>
                <p className="mt-2 text-sm text-slate-500">
                  A confirmation email has been sent to you.
                </p>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 px-6 py-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                      <i className="fas fa-exclamation-triangle text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Cancel Reservation</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Booking ID: <span className="font-mono">{cancelTarget.bookingId}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-5">
                  <p className="text-sm text-slate-600">
                    This action cannot be undone. Your down payment will be forfeited and kept by the resort upon cancellation.
                  </p>
                  <div className="mt-4">
                    <label htmlFor="cancel-reason" className="block text-xs font-semibold text-slate-700">
                      Reason for cancellation <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="cancel-reason"
                      rows={3}
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Please tell us why you're cancelling…"
                      disabled={cancelBusy}
                      className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                  {cancelError && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      <i className="fas fa-info-circle mr-1" />
                      {cancelError}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
                  <button
                    type="button"
                    onClick={closeCancelModal}
                    disabled={cancelBusy}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Keep Reservation
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    disabled={cancelBusy || !cancelReason.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 hover:shadow-md disabled:opacity-50"
                  >
                    {cancelBusy ? (
                      <>
                        <i className="fas fa-spinner fa-spin text-xs" />
                        Cancelling…
                      </>
                    ) : (
                      <>
                        <i className="fas fa-times-circle text-xs" />
                        Confirm Cancellation
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      <SignOutConfirmationModal
        isOpen={showSignOutModal}
        onConfirm={handleConfirmSignOut}
        onCancel={handleCancelSignOut}
      />

      <GuestAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </GuestLayout>
  );
}