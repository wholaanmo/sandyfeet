'use client';

import { useEffect, useMemo, useState } from 'react';
import GuestLayout from '@/app/guest/layout';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const tabOptions = [
  { id: 'pending', label: 'Pending' },
  { id: 'success', label: 'Successful' }
];

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
    createdAt: data.createdAt
  };
};

export default function MyBookingsPage() {
  const { user, loading } = useGuestAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
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
          setBookingsError('Unable to load bookings right now.');
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

  const filteredBookings = useMemo(() => {
    if (activeTab === 'pending') {
      return bookings.filter((booking) => booking.status === 'pending');
    }
    return bookings.filter((booking) => ['confirmed', 'check-in'].includes(booking.status));
  }, [activeTab, bookings]);

  return (
    <GuestLayout>
      <div className="min-h-screen bg-slate-50 px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex flex-col gap-3">
            <h1 className="font-playfair text-3xl font-bold text-slate-900">My Bookings</h1>
            <p className="text-sm text-slate-600">
              Track pending requests and confirmed bookings tied to your account.
            </p>
          </div>

          {!user && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Please sign in to view your bookings.
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                disabled={loading}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                <i className="fas fa-user-circle"></i>
                Sign in
              </button>
            </div>
          )}

          {user && (
            <>
              <div className="mb-6 flex flex-wrap gap-2">
                {tabOptions.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab.id
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                {bookingsLoading ? (
                  <div className="flex min-h-[200px] items-center justify-center text-slate-400">
                    <i className="fas fa-spinner fa-spin text-2xl"></i>
                  </div>
                ) : bookingsError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {bookingsError}
                  </div>
                ) : filteredBookings.length > 0 ? (
                  <div className="space-y-3">
                    {filteredBookings.map((booking) => (
                      <div key={`${booking.type}-${booking.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {booking.type === 'daytour' ? 'Day Tour' : 'Room'}
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-slate-900">{booking.title}</h3>
                            <p className="mt-1 text-xs text-slate-500">{booking.bookingId}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-semibold text-slate-900">{formatDate(booking.schedule)}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                              Php {booking.totalPrice.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-slate-500">
                    No {activeTab === 'pending' ? 'pending' : 'successful'} bookings found.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <GuestAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </GuestLayout>
  );
}
