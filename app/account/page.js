'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import GuestLayout from '@/app/guest/layout';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { db } from '@/lib/firebase';

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'check-in': 'bg-blue-50 text-blue-700 border-blue-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
  'cancelled-by-guest': 'bg-red-50 text-red-700 border-red-100'
};

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDateValue(value);
  if (!date) return 'Date pending';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const normalizeBooking = (docSnap, type) => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    type,
    bookingId: data.bookingId,
    title: type === 'daytour'
      ? 'Day Tour'
      : data.isExclusiveResortBooking
        ? 'Entire Resort'
        : data.roomType || 'Room Booking',
    status: data.status || 'pending',
    schedule: type === 'daytour' ? data.selectedDate : data.checkIn,
    totalPrice: Number(data.totalPrice || 0),
    createdAt: data.createdAt,
    guestInfo: data.guestInfo || {}
  };
};

function GuestAccountContent() {
  const { user, profile, loading, logout } = useGuestAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState('');

  useEffect(() => {
    if (!user?.email) {
      setBookings([]);
      return;
    }

    let cancelled = false;

    const loadBookings = async () => {
      setBookingsLoading(true);
      setBookingsError('');

      try {
        const normalizedEmail = user.email.toLowerCase().trim();
        const roomEmailQuery = query(
          collection(db, 'bookings'),
          where('guestInfo.email', '==', normalizedEmail)
        );
        const dayTourEmailQuery = query(
          collection(db, 'dayTourBookings'),
          where('guestInfo.email', '==', normalizedEmail)
        );
        const roomAccountQuery = query(
          collection(db, 'bookings'),
          where('guestUid', '==', user.uid)
        );
        const dayTourAccountQuery = query(
          collection(db, 'dayTourBookings'),
          where('guestUid', '==', user.uid)
        );

        const [roomEmailSnapshot, dayTourEmailSnapshot, roomAccountSnapshot, dayTourAccountSnapshot] = await Promise.all([
          getDocs(roomEmailQuery),
          getDocs(dayTourEmailQuery),
          getDocs(roomAccountQuery),
          getDocs(dayTourAccountQuery)
        ]);

        if (cancelled) return;

        const bookingMap = new Map();
        [
          ...roomEmailSnapshot.docs.map((docSnap) => normalizeBooking(docSnap, 'room')),
          ...roomAccountSnapshot.docs.map((docSnap) => normalizeBooking(docSnap, 'room')),
          ...dayTourEmailSnapshot.docs.map((docSnap) => normalizeBooking(docSnap, 'daytour')),
          ...dayTourAccountSnapshot.docs.map((docSnap) => normalizeBooking(docSnap, 'daytour'))
        ].forEach((booking) => {
          bookingMap.set(`${booking.type}-${booking.id}`, booking);
        });

        const nextBookings = Array.from(bookingMap.values()).sort((a, b) => {
          const bDate = toDateValue(b.createdAt)?.getTime() || 0;
          const aDate = toDateValue(a.createdAt)?.getTime() || 0;
          return bDate - aDate;
        });

        setBookings(nextBookings);
      } catch (err) {
        console.error('Unable to load guest bookings:', err);
        if (!cancelled) {
          setBookingsError('Unable to load account bookings right now.');
        }
      } finally {
        if (!cancelled) {
          setBookingsLoading(false);
        }
      }
    };

    loadBookings();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.uid]);

  const stats = useMemo(() => {
    const pending = bookings.filter((booking) => booking.status === 'pending').length;
    const confirmed = bookings.filter((booking) => ['confirmed', 'check-in'].includes(booking.status)).length;
    const history = bookings.filter((booking) => ['cancelled', 'cancelled-by-guest'].includes(booking.status)).length;

    return [
      ['Pending', pending, 'fa-hourglass-half', 'bg-amber-50 text-amber-700 border-amber-100'],
      ['Confirmed', confirmed, 'fa-circle-check', 'bg-emerald-50 text-emerald-700 border-emerald-100'],
      ['History', history, 'fa-clock-rotate-left', 'bg-blue-50 text-blue-700 border-blue-100']
    ];
  }, [bookings]);

  const displayName = profile?.displayName || user?.displayName || 'Guest';
  const email = user?.email || '';
  const avatarLetter = (displayName || email || 'G').charAt(0).toUpperCase();

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-[#f6f8fc] px-4 pb-12 pt-24 sm:px-6 sm:pt-28 lg:px-8">
        <div className="absolute inset-x-0 top-0 h-[250px] bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_#f6f8fc_94%)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#3B82F6] shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#F5A623]" />
                Guest Account
              </span>
              <h1 className="font-playfair text-3xl font-bold text-blue-600 sm:text-4xl">
                My Bookings
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Sign in with Google to see reservations connected to your Sandyfeet guest email.
              </p>
            </div>

            {!user && (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,_#3B82F6_0%,_#2563EB_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(37,99,235,0.32)] disabled:opacity-60"
              >
                <i className="fas fa-user-circle"></i>
                Sign in or create account
              </button>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="space-y-5">
              <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <div className="bg-[linear-gradient(135deg,_#3B82F6_0%,_#2563EB_100%)] px-6 py-6 text-white">
                  <div className="flex items-center gap-4">
                    {user?.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt={displayName}
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-2xl object-cover shadow-lg"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-bold text-[#2563EB] shadow-lg">
                        {avatarLetter}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                        {user ? 'Google connected' : 'Not signed in'}
                      </p>
                      <h2 className="mt-1 truncate text-xl font-bold">{user ? displayName : 'Guest Profile'}</h2>
                      {email && <p className="mt-1 truncate text-xs text-white/78">{email}</p>}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {user ? (
                      <button
                        type="button"
                        onClick={logout}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/18"
                      >
                        <i className="fas fa-right-from-bracket"></i>
                        Sign Out
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAuthOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#2563EB] shadow-sm transition-colors hover:bg-blue-50"
                      >
                        <i className="fas fa-right-to-bracket"></i>
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <h3 className="text-sm font-bold text-slate-900">Find an older reservation</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Use the tracker if a booking is not yet attached to your guest account.
                </p>
                <Link
                  href="/reservation-tracker"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#2563EB] transition-colors hover:bg-white"
                >
                  <i className="fas fa-magnifying-glass"></i>
                  Open Reservation Tracker
                </Link>
              </div>
            </aside>

            <section className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {stats.map(([label, count, icon, tone]) => (
                  <div key={label} className={`rounded-2xl border bg-white p-5 shadow-sm ${tone}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80">
                        <i className={`fas ${icon}`}></i>
                      </span>
                      <span className="text-2xl font-bold">{count}</span>
                    </div>
                    <p className="mt-4 text-sm font-bold">{label}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Reservation Timeline</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {user ? 'Bookings matching your Google email appear here.' : 'Sign in to load your reservation history.'}
                    </p>
                  </div>
                </div>

                {user ? (
                  <div className="p-5">
                    {bookingsLoading ? (
                      <div className="flex min-h-[300px] items-center justify-center text-[#2563EB]">
                        <i className="fas fa-spinner fa-spin text-2xl"></i>
                      </div>
                    ) : bookingsError ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
                        {bookingsError}
                      </div>
                    ) : bookings.length > 0 ? (
                      <div className="space-y-3">
                        {bookings.map((booking) => (
                          <div key={`${booking.type}-${booking.id}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2563EB]">
                                    {booking.type === 'daytour' ? 'Day Tour' : 'Room'}
                                  </span>
                                  <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${statusStyles[booking.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                    {booking.status.replaceAll('-', ' ')}
                                  </span>
                                </div>
                                <h3 className="mt-3 text-base font-bold text-slate-900">{booking.title}</h3>
                                <p className="mt-1 font-mono text-xs text-slate-500">{booking.bookingId}</p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-sm font-semibold text-slate-900">{formatDate(booking.schedule)}</p>
                                <p className="mt-1 text-sm font-bold text-[#2563EB]">
                                  Php {booking.totalPrice.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[340px] items-center justify-center p-8">
                        <div className="max-w-md text-center">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-[#2563EB]">
                            <i className="fas fa-receipt"></i>
                          </div>
                          <h3 className="mt-5 font-playfair text-2xl font-bold text-slate-900">No bookings found</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            New bookings using {email} will appear here after submission.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[360px] items-center justify-center p-8">
                    <div className="max-w-md text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-[#2563EB]">
                        <i className="fas fa-user-lock"></i>
                      </div>
                      <h3 className="mt-5 font-playfair text-2xl font-bold text-slate-900">Sign in to view bookings</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Use the same Google email you entered during booking.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsAuthOpen(true)}
                        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#3B82F6] px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#2563EB]"
                      >
                        <i className="fas fa-user-circle"></i>
                        Sign in or create account
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <GuestAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </>
  );
}

export default function GuestAccountPage() {
  return (
    <GuestLayout>
      <GuestAccountContent />
    </GuestLayout>
  );
}
