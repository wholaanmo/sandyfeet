// app/dashboard/admin/reservations/guest-profile/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  normalizeBooking,
  buildMultiRoomGroup,
  getTypeDisplay,
  getBookingTitle,
  getGuestTotal,
  calcNights,
  formatDateOnly,
  formatDateTime,
  getDownPayment,
  getBalance,
  getRoomTypes,
} from '@/app/my-bookings/utils';

export const ADMIN_RESERVATIONS_RESTORE_KEY = 'adminReservationsGuestProfileRestore';

const formatAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.street, address.city, address.province, address.postalCode]
    .map(p => String(p || '').trim()).filter(Boolean).join(', ');
};

const BASE_EXCLUSIVE_PRICE = 22500;

export default function AdminGuestProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.toLowerCase().trim() || '';
  const guestUid = searchParams.get('guestUid') || '';

  const [roomRaw, setRoomRaw] = useState([]);
  const [dayTourRaw, setDayTourRaw] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!email && !guestUid) {
      setLoading(false);
      return undefined;
    }

    const unsubs = [];

    if (email) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'bookings'), where('guestInfo.email', '==', email)),
          (snapshot) => {
            setRoomRaw(
              snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }))
            );
          }
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'dayTourBookings'), where('guestInfo.email', '==', email)),
          (snapshot) => {
            setDayTourRaw(
              snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }))
            );
          }
        )
      );
    }

    if (guestUid) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'bookings'), where('guestUid', '==', guestUid)),
          (snapshot) => {
            setRoomRaw((prev) => {
              const merged = new Map(prev.map((b) => [b.id, b]));
              snapshot.docs.forEach((docSnap) => {
                merged.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
              });
              return Array.from(merged.values());
            });
          }
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'dayTourBookings'), where('guestUid', '==', guestUid)),
          (snapshot) => {
            setDayTourRaw((prev) => {
              const merged = new Map(prev.map((b) => [b.id, b]));
              snapshot.docs.forEach((docSnap) => {
                merged.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
              });
              return Array.from(merged.values());
            });
          }
        )
      );

      const userDocRef = doc(db, 'users', guestUid);
      const unsubscribeUser = onSnapshot(
        userDocRef,
        (snap) => {
          if (snap.exists()) setUserProfile(snap.data());
          else setUserProfile(null);
        },
        (err) => console.error('User profile listener error:', err)
      );
      unsubs.push(unsubscribeUser);
    }

    setLoading(false);
    return () => unsubs.forEach((unsub) => unsub());
  }, [email, guestUid]);

  const normalizedRoomBookings = useMemo(() => {
    const normalized = roomRaw.map(b => normalizeBooking({ data: () => b, id: b.id }, 'room'));
    const singles = [];
    const childrenMap = new Map();
    for (const booking of normalized) {
      if (booking.parentBookingId) {
        if (!childrenMap.has(booking.parentBookingId)) childrenMap.set(booking.parentBookingId, []);
        childrenMap.get(booking.parentBookingId).push(booking);
      } else {
        singles.push(booking);
      }
    }
    const groups = [];
    for (const [parentId, children] of childrenMap.entries()) {
      groups.push(buildMultiRoomGroup(children, parentId));
    }
    return [...singles, ...groups];
  }, [roomRaw]);

  const normalizedDayTours = useMemo(() => {
    return dayTourRaw.map(b => normalizeBooking({ data: () => b, id: b.id }, 'daytour'));
  }, [dayTourRaw]);

  const allBookings = useMemo(() => {
    const combined = [...normalizedRoomBookings, ...normalizedDayTours];
    return combined.sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return db - da;
    });
  }, [normalizedRoomBookings, normalizedDayTours]);

  const filteredBookings = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    if (!searchLower) return allBookings;
    return allBookings.filter(booking => {
      const typeLabel = getTypeDisplay(booking).label.toLowerCase();
      const idMatch = booking.bookingId?.toLowerCase().includes(searchLower);
      const typeMatch = typeLabel.includes(searchLower);
      return idMatch || typeMatch;
    });
  }, [allBookings, searchQuery]);

  const personalInfo = useMemo(() => {
    if (userProfile) {
      return {
        firstName: userProfile.firstName || userProfile.name?.split(' ')?.[0] || '—',
        lastName: userProfile.lastName || userProfile.name?.split(' ')?.slice(1).join(' ') || '—',
        mobile: userProfile.mobileNumber || userProfile.phone || '—',
        email: userProfile.email || email || '—',
      };
    }
    const sample = roomRaw[0] || dayTourRaw[0];
    const guestInfo = sample?.guestInfo || {};
    return {
      firstName: guestInfo.firstName || '—',
      lastName: guestInfo.lastName || '—',
      mobile: guestInfo.phone || '—',
      email: guestInfo.email || email || '—',
    };
  }, [userProfile, roomRaw, dayTourRaw, email]);

  const handleBack = () => {
    router.push('/dashboard/admin/reservations?restoreGuestProfile=1');
  };

  if (!email && !guestUid) {
    return (
      <GuestProfilePageShell>
        <p className="text-sm text-[#5C7AA6]">Guest information is missing.</p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/admin/reservations')}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-4 py-2 text-sm font-semibold text-white"
        >
          <i className="fas fa-arrow-left text-xs" />
          Back to Reservations
        </button>
      </GuestProfilePageShell>
    );
  }

  return (
    <GuestProfilePageShell>
      <button
        type="button"
        onClick={handleBack}
        className="mb-5 inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2 text-sm font-semibold text-[#1E3A8A] shadow-sm transition hover:bg-[#4D8CF5]/5"
      >
        <i className="fas fa-arrow-left text-xs text-[#4D8CF5]" />
        Back
      </button>

      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Guest Profile
        </h1>
        <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
          Personal information and booking history
        </p>
      </div>

      {/* Personal Information - Redesigned */}
      <div className="bg-white rounded-xl border border-[#4D8CF5]/10 shadow-md overflow-hidden mb-6">
        <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
              <i className="fas fa-user text-sm"></i>
            </div>
            <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wide">Personal Information</h2>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <GuestInfoCardField
              label="First Name"
              value={personalInfo.firstName}
              icon="fa-user"
            />
            <GuestInfoCardField
              label="Last Name"
              value={personalInfo.lastName}
              icon="fa-user"
            />
            <GuestInfoCardField
              label="Mobile Number"
              value={personalInfo.mobile}
              icon="fa-phone-alt"
            />
            <GuestInfoCardField
              label="Account Email"
              value={personalInfo.email}
              icon="fa-envelope"
            />
          </div>
        </div>
      </div>

      {/* Booking History Section */}
      <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide flex items-center gap-2">
            <i className="fas fa-calendar-check text-[#4D8CF5]" />
            Booking History
          </h2>
          <div className="relative w-full sm:w-72">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-xs"></i>
            <input
              type="text"
              placeholder="Search by ID or book type"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-[#4D8CF5]/20 rounded-xl bg-white focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times-circle text-xs"></i>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[#5C7AA6]">Loading bookings...</p>
        ) : filteredBookings.length === 0 ? (
          <p className="text-sm text-[#5C7AA6]">No bookings found for this guest.</p>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => (
              <GuestBookingHistoryCard key={booking.key} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </GuestProfilePageShell>
  );
}

function GuestProfilePageShell({ children }) {
  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      <div className="max-w-4xl mx-auto py-4">{children}</div>
    </div>
  );
}

function GuestInfoCardField({ label, value, icon }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#4D8CF5]/10 bg-[#f8fbff] p-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4D8CF5]/10 text-[#4D8CF5]">
        <i className={`fas ${icon} text-sm`}></i>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-[#5C7AA6]">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-[#1E3A8A] break-all">{value || '—'}</p>
      </div>
    </div>
  );
}

// Expandable Booking Card (unchanged from original)
function GuestBookingHistoryCard({ booking }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = getTypeDisplay(booking);
  const statusInfo = getStatusBadge(booking.status, booking.cancelledBy);
  const guestTotal = getGuestTotal(booking);
  const nights = booking.type === 'daytour' ? 0 : calcNights(booking.checkIn, booking.checkOut);
  const primaryDate = booking.type === 'daytour'
    ? formatDateOnly(booking.selectedDate)
    : formatDateOnly(booking.checkIn);
  const balance = getBalance(booking);
  const dp = getDownPayment(booking);
  const roomTypes = getRoomTypes(booking);
  const address = formatAddress(booking.guestInfo?.address);

  let exclusiveTotalPrice = null;
  let exclusiveDownPayment = null;
  let exclusiveRemainingBalance = null;
  if (booking.isExclusiveResortBooking && nights > 0) {
    const tentCount = booking.tentCount || 0;
    const nightlyTotal = BASE_EXCLUSIVE_PRICE + (tentCount * 1500);
    exclusiveTotalPrice = nightlyTotal * nights;
    exclusiveDownPayment = exclusiveTotalPrice * 0.5;
    exclusiveRemainingBalance = exclusiveTotalPrice - exclusiveDownPayment;
  }

  const toggleExpand = () => setExpanded(!expanded);

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all duration-300 bg-white ${
      expanded
        ? 'border-blue-300 shadow-xl ring-1 ring-blue-100/50'
        : 'border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200'
    }`}>
      <div
        onClick={toggleExpand}
        className="relative cursor-pointer select-none p-5 sm:p-6 transition-colors hover:bg-slate-50/40"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm ${typeInfo.color}`}>
                <i className={`fas ${typeInfo.icon} text-[9px]`} />
                {typeInfo.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm ${statusInfo.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot} animate-pulse`} />
                {statusInfo.label}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">{getBookingTitle(booking)}</h3>
            <p className="font-mono text-xs text-slate-400">ID: {booking.bookingId}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-semibold text-slate-700">{primaryDate}</p>
              {booking.type !== 'daytour' && booking.checkOut && (
                <span className="text-xs text-slate-400">→ {formatDateOnly(booking.checkOut)}</span>
              )}
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              ₱{(exclusiveTotalPrice !== null ? exclusiveTotalPrice : booking.totalPrice).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <i className="fas fa-users text-slate-400 w-4" />
            <span>{guestTotal} guest{guestTotal !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <i className={`fas ${booking.type === 'daytour' ? 'fa-sun' : 'fa-moon'} text-slate-400 w-4`} />
            <span>{booking.type === 'daytour' ? 'Day tour' : `${nights} night${nights !== 1 ? 's' : ''}`}</span>
          </div>
          {balance > 0 && (
            <div className="flex items-center gap-2 text-slate-500">
              <i className="fas fa-wallet text-slate-400 w-4" />
              <span>Balance ₱{(exclusiveRemainingBalance !== null ? exclusiveRemainingBalance : balance).toLocaleString()}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200">
            <span>{expanded ? 'Less info' : 'More info'}</span>
            <i className={`fas fa-chevron-down text-[10px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-6 animate-in fade-in duration-200">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <i className="fas fa-user text-xs" />
                </span>
                Guest Info
              </h4>
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="font-semibold text-slate-800">
                  {`${booking.guestInfo?.firstName || ''} ${booking.guestInfo?.lastName || ''}`.trim() || 'Guest'}
                </p>
                <p className="text-slate-600 break-all">{booking.guestInfo?.email || 'Email not available'}</p>
                <p className="text-slate-600">{booking.guestInfo?.phone || 'Phone not available'}</p>
                {address && <p className="text-xs text-slate-500 mt-1">{address}</p>}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <i className="fas fa-calendar-alt text-xs" />
                </span>
                {booking.type === 'daytour' ? 'Daytour Schedule' : 'Stay Schedule'}
              </h4>
              <div className="mt-3 space-y-1.5 text-sm">
                {booking.type === 'daytour' ? (
                  <>
                    <p className="font-semibold text-slate-800">{formatDateOnly(booking.selectedDate)}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{booking.adults || 0} adult(s)</span>
                      <span>{booking.kids || 0} kid(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-500 pt-1">
                      <span className="font-semibold">Total Guests:</span>
                      <span>{(booking.adults || 0) + (booking.kids || 0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="w-8 text-xs font-bold text-slate-400">IN</span>
                      <span className="font-medium text-slate-700">{formatDateTime(booking.checkIn)}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="w-8 text-xs font-bold text-slate-400">OUT</span>
                      <span className="font-medium text-slate-700">{formatDateTime(booking.checkOut)}</span>
                    </div>
                    <p className="text-xs text-slate-500">{nights} night{nights !== 1 ? 's' : ''} stay</p>
                  </>
                )}
              </div>
            </div>

            {booking.type === 'room' && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    <i className="fas fa-bed text-xs" />
                  </span>
                  Room Details
                </h4>
                <div className="mt-3 space-y-2 text-sm">
                  {booking.isExclusiveResortBooking ? (
                    <>
                      <p className="font-semibold text-slate-800">Entire Resort Package</p>
                      {booking.tentCount > 0 && <p className="text-xs text-slate-500">+ {booking.tentCount} tent(s)</p>}
                      <div className="mt-2 space-y-1 text-slate-600">
                        <div className="flex justify-between"><span>Adults</span><span className="font-medium">{booking.exclusiveAdults || 0}</span></div>
                        <div className="flex justify-between"><span>Kids</span><span className="font-medium">{booking.exclusiveKids || 0}</span></div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between font-semibold text-slate-800">
                        <span>Total Guests</span>
                        <span>{(booking.exclusiveAdults || 0) + (booking.exclusiveKids || 0)}</span>
                      </div>
                    </>
                  ) : booking.children && booking.children.length > 0 ? (
                    <>
                      {roomTypes.map((r, i) => (
                        <div key={i} className="flex justify-between border-b border-slate-100 pb-1.5 last:border-0">
                          <span className="font-medium text-slate-700">{r.quantity} × {r.type}</span>
                        </div>
                      ))}
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="text-xs font-semibold uppercase text-slate-400">Guest Breakdown</p>
                        {booking.children.map((child, i) => (
                          <div key={i} className="mt-1.5 text-xs text-slate-600">
                            <span className="font-medium text-slate-700">{child.roomType}:</span>{' '}
                            {child.adults || 0} adult(s), {child.kids || 0} kid(s)
                          </div>
                        ))}
                        <div className="mt-2 flex justify-between text-sm font-semibold text-slate-800">
                          <span>Total Guests</span><span>{booking.totalGuests || guestTotal}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {roomTypes.length > 0 ? (
                        roomTypes.map((room, idx) => (
                          <div key={idx}>
                            <p className="font-semibold text-slate-800">
                              {room.quantity} × {room.type}
                            </p>
                            <p className="text-xs text-slate-500">{room.quantity} room(s)</p>
                          </div>
                        ))
                      ) : (
                        <>
                          <p className="font-semibold text-slate-800">{booking.roomType || 'Room'}</p>
                          <p className="text-xs text-slate-500">{booking.numberOfRooms || 1} room(s)</p>
                        </>
                      )}
                      <div className="mt-2 space-y-1 text-slate-600">
                        <div className="flex justify-between"><span>Adults</span><span className="font-medium">{booking.adults || 1}</span></div>
                        <div className="flex justify-between"><span>Kids</span><span className="font-medium">{booking.kids || 0}</span></div>
                        <div className="flex justify-between font-semibold text-slate-800"><span>Total Guests</span><span>{booking.guests || 1}</span></div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <i className="fas fa-credit-card text-xs" />
                </span>
                Payment Summary
              </h4>
              <div className="mt-3 space-y-2 text-sm">
                {booking.isExclusiveResortBooking && exclusiveTotalPrice !== null ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Base Rate (per night)</span>
                      <span className="font-semibold text-slate-800">₱{BASE_EXCLUSIVE_PRICE.toLocaleString()}</span>
                    </div>
                    {booking.tentCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Tent Charge (₱1,500/tent/night)</span>
                        <span className="font-semibold text-slate-800">₱{(booking.tentCount * 1500).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">Nights</span>
                      <span className="font-semibold text-slate-800">{nights}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-600">Total Price</span>
                      <span className="font-bold text-slate-800">₱{exclusiveTotalPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Down Payment (50%)</span>
                      <span className="font-semibold text-emerald-600">₱{exclusiveDownPayment.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Remaining Balance</span>
                      <span className="font-bold text-slate-800">₱{exclusiveRemainingBalance.toLocaleString()}</span>
                    </div>
                    {booking.paymentMethod && (
                      <p className="text-xs text-slate-500">Via {booking.paymentMethod}</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Price</span>
                      <span className="font-bold text-slate-800">₱{booking.totalPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Down Payment (50%)</span>
                      <span className="font-semibold text-emerald-600">₱{dp.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-600">
                      <span>Remaining Balance</span>
                      <span className="font-bold text-slate-800">₱{balance.toLocaleString()}</span>
                    </div>
                    {booking.paymentMethod && (
                      <p className="text-xs text-slate-500">Via {booking.paymentMethod}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-400">
              Booked on {formatDateTime(booking.createdAt)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusBadge(status, cancelledBy) {
  if (status === 'cancelled') {
    return { label: cancelledBy === 'admin' ? 'Cancelled by Resort' : 'Not Confirmed', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
  }
  const map = {
    pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    'check-in': { label: 'Checked In', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    'check-out': { label: 'Checked Out', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
    completed: { label: 'Completed', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
    'cancelled-by-guest': { label: 'Cancelled by Guest', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  };
  return map[status] || { label: status || 'Unknown', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
}