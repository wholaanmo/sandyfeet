// app/dashboard/admin/reservations/guest-profile/page.js
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
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
  getBalance,
} from '@/app/my-bookings/utils';

export const ADMIN_RESERVATIONS_RESTORE_KEY = 'adminReservationsGuestProfileRestore';

export const mapGuestProfileToDisplayInfo = (profile, fallbackGuestInfo = {}, fallbackEmail = '') => ({
  firstName: profile?.firstName?.trim() || fallbackGuestInfo?.firstName?.trim() || '—',
  lastName: profile?.lastName?.trim() || fallbackGuestInfo?.lastName?.trim() || '—',
  mobile:
    profile?.mobileNumber?.trim() ||
    profile?.phone?.trim() ||
    fallbackGuestInfo?.phone?.trim() ||
    '—',
  email: profile?.email?.trim() || fallbackGuestInfo?.email?.trim() || fallbackEmail?.trim() || '—',
});

const formatAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.street, address.city, address.province, address.postalCode]
    .map(p => String(p || '').trim()).filter(Boolean).join(', ');
};

const BASE_EXCLUSIVE_PRICE = 22500;
const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

const enrichBookingFromRaw = (normalized, raw) => ({
  ...normalized,
  paymentProof: raw.paymentProof || null,
  paymentProofUrl: raw.paymentProofUrl || null,
  validIdImage: raw.validIdImage || null,
  validIdUrl: raw.validIdUrl || null,
  validIdType: raw.validIdType || null,
  specialRequest: raw.specialRequest || null,
  manualBalance: raw.manualBalance,
  manualDownPayment: raw.manualDownPayment,
  manualTotalPrice: raw.manualTotalPrice,
  exclusivePackagePrice: raw.exclusivePackagePrice || null,
  refundNotificationSent: Boolean(raw.refundNotificationSent),
  moveDateNotificationSent: Boolean(raw.moveDateNotificationSent),
  changeRequest: raw.changeRequest || null,
});

const pickFromChildren = (children, ...keys) => {
  for (const child of children) {
    for (const key of keys) {
      if (child[key]) return child[key];
    }
  }
  return null;
};

const formatDateWithTime = (date, type) => {
  if (!date) return 'N/A';
  try {
    let dateObj;
    if (date && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (date && typeof date === 'object' && date.seconds) {
      dateObj = new Date(date.seconds * 1000);
    } else {
      dateObj = new Date(date);
    }
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    if (type === 'check-in') return `${formattedDate} at ${FIXED_CHECK_IN_DISPLAY}`;
    if (type === 'check-out') return `${formattedDate} at ${FIXED_CHECK_OUT_DISPLAY}`;
    return formattedDate;
  } catch {
    return 'Invalid Date';
  }
};

const getBookingTypeLabel = (booking) => {
  if (booking.type === 'daytour') return 'Day Tour';
  if (booking.isExclusiveResortBooking) return 'Entire Resort';
  if (booking.isMultiRoom && booking.roomTypesArray?.length > 1) return 'Multi-Room Types';
  return 'Single Room Type';
};

const getTotalGuestsForDisplay = (booking) => {
  if (booking.type === 'daytour') {
    return (booking.seniors || 0) + (booking.adults || 0) + (booking.kids || 0);
  }
  if (booking.isExclusiveResortBooking) {
    return (booking.exclusiveAdults || 0) + (booking.exclusiveKids || 0);
  }
  if (booking.children?.length) {
    return booking.totalGuests || booking.children.reduce((s, c) => s + Number(c.guests || 0), 0);
  }
  return booking.guests || (booking.adults || 0) + (booking.kids || 0) || 1;
};

const computePaymentDisplay = (booking) => {
  const isCancelled = ['cancelled', 'cancelled-by-guest'].includes(booking.status);
  let downPayment;
  let totalAmount;
  let balance;

  if (booking.type === 'daytour' && booking.downPayment !== undefined) {
    totalAmount = booking.manualTotalPrice ?? booking.totalPrice;
    downPayment = booking.downPayment;
    if (isCancelled) {
      balance = 0;
      totalAmount = downPayment;
    } else {
      balance = booking.manualBalance !== undefined
        ? booking.manualBalance
        : (booking.remainingBalance !== undefined
            ? booking.remainingBalance
            : totalAmount - downPayment);
    }
  } else if (isCancelled) {
    if (booking.manualDownPayment !== undefined && booking.manualDownPayment !== null) {
      downPayment = booking.manualDownPayment;
    } else {
      downPayment = (Number(booking.totalPrice) || 0) * 0.5;
    }
    totalAmount = downPayment;
    balance = 0;
  } else {
    if (booking.manualTotalPrice !== undefined && booking.manualTotalPrice !== null) {
      totalAmount = booking.manualTotalPrice;
      downPayment = totalAmount * 0.5;
    } else {
      totalAmount = Number(booking.totalPrice) || 0;
      downPayment = totalAmount * 0.5;
    }
    balance = booking.manualBalance !== undefined ? booking.manualBalance : downPayment;
  }

  return { totalAmount, downPayment, balance };
};

export default function AdminGuestProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.toLowerCase().trim() || '';
  const guestUid = searchParams.get('guestUid') || '';

  const [roomRaw, setRoomRaw] = useState([]);
  const [dayTourRaw, setDayTourRaw] = useState([]);
  const [guestProfile, setGuestProfile] = useState(null);
  const [feedbackByBookingId, setFeedbackByBookingId] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const resolvedGuestUid = useMemo(() => {
    if (guestUid) return guestUid;
    const bookingWithUid = roomRaw.find((booking) => booking.guestUid) || dayTourRaw.find((booking) => booking.guestUid);
    return bookingWithUid?.guestUid || '';
  }, [guestUid, roomRaw, dayTourRaw]);

  useEffect(() => {
    if (!email && !resolvedGuestUid) {
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

    if (resolvedGuestUid) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'bookings'), where('guestUid', '==', resolvedGuestUid)),
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
          query(collection(db, 'dayTourBookings'), where('guestUid', '==', resolvedGuestUid)),
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

      const profileDocRef = doc(db, 'guestProfiles', resolvedGuestUid);
      unsubs.push(
        onSnapshot(
          profileDocRef,
          (snap) => {
            setGuestProfile(snap.exists() ? snap.data() : null);
          },
          (err) => console.error('Guest profile listener error:', err)
        )
      );
    } else if (email) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'guestProfiles'), where('email', '==', email)),
          (snapshot) => {
            if (snapshot.empty) {
              setGuestProfile(null);
              return;
            }
            setGuestProfile(snapshot.docs[0].data());
          },
          (err) => console.error('Guest profile email listener error:', err)
        )
      );
    }

    setLoading(false);
    return () => unsubs.forEach((unsub) => unsub());
  }, [email, resolvedGuestUid]);

  const normalizedRoomBookings = useMemo(() => {
    const rawById = new Map(roomRaw.map((b) => [b.id, b]));
    const normalized = roomRaw.map((b) =>
      enrichBookingFromRaw(normalizeBooking({ data: () => b, id: b.id }, 'room'), b)
    );
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
      const group = buildMultiRoomGroup(children, parentId);
      groups.push({
        ...group,
        isMultiRoomGroup: children.length > 1,
        bookingIdDisplay: group.isExclusiveResortBooking
          ? 'Entire Resort'
          : (group.isMultiRoom ? 'Multi-Room Types' : 'Single Room Type'),
        paymentProof: pickFromChildren(children, 'paymentProof'),
        paymentProofUrl: pickFromChildren(children, 'paymentProofUrl'),
        validIdImage: pickFromChildren(children, 'validIdImage'),
        validIdUrl: pickFromChildren(children, 'validIdUrl'),
        validIdType: pickFromChildren(children, 'validIdType'),
        specialRequest: pickFromChildren(children, 'specialRequest') || group.specialRequest,
        manualBalance: children.find((c) => c.manualBalance !== undefined)?.manualBalance,
        manualDownPayment: children.find((c) => c.manualDownPayment !== undefined)?.manualDownPayment,
        manualTotalPrice: children.find((c) => c.manualTotalPrice !== undefined)?.manualTotalPrice,
        adminNote: children.find((c) => c.adminNote)?.adminNote || group.adminNote,
        childBookings: children.map((c) => ({
          roomType: c.roomType,
          adults: c.adults || c.guests || 1,
          kids: c.kids || 0,
          guests: c.guests || 1,
        })),
        originalChildBookings: children.map((c) => rawById.get(c.id) || c),
      });
    }
    return [...singles, ...groups];
  }, [roomRaw]);

  const normalizedDayTours = useMemo(() => {
    return dayTourRaw.map((b) =>
      enrichBookingFromRaw(normalizeBooking({ data: () => b, id: b.id }, 'daytour'), b)
    );
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
    const sample = roomRaw[0] || dayTourRaw[0];
    const fallbackGuestInfo = sample?.guestInfo || {};
    return mapGuestProfileToDisplayInfo(guestProfile, fallbackGuestInfo, email);
  }, [guestProfile, roomRaw, dayTourRaw, email]);

  const feedbackEmail = useMemo(() => {
    const fromProfile = personalInfo.email?.trim().toLowerCase();
    if (fromProfile && fromProfile !== '—') return fromProfile;
    return email || '';
  }, [personalInfo.email, email]);

  useEffect(() => {
    if (!feedbackEmail) {
      setFeedbackByBookingId({});
      return undefined;
    }

    const feedbackQuery = query(
      collection(db, 'feedbacks'),
      where('guestEmail', '==', feedbackEmail)
    );

    const unsub = onSnapshot(
      feedbackQuery,
      (snapshot) => {
        const map = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.bookingId) {
            map[data.bookingId] = { id: docSnap.id, ...data };
          }
        });
        setFeedbackByBookingId(map);
      },
      (err) => console.error('Feedback listener error:', err)
    );

    return () => unsub();
  }, [feedbackEmail]);

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
              <GuestBookingHistoryCard
                key={booking.key}
                booking={booking}
                feedback={feedbackByBookingId[booking.bookingId] || null}
              />
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

function GuestBookingHistoryCard({ booking, feedback }) {
  const [expanded, setExpanded] = useState(false);
  const [imageZoom, setImageZoom] = useState({ show: false, imageUrl: '', title: '' });
  const typeInfo = getTypeDisplay(booking);
  const statusInfo = getStatusBadge(booking.status, booking.cancelledBy);
  const guestTotal = getGuestTotal(booking);
  const displayGuestTotal = getTotalGuestsForDisplay(booking);
  const nights = booking.type === 'daytour' ? 0 : calcNights(booking.checkIn, booking.checkOut);
  const primaryDate = booking.type === 'daytour'
    ? formatDateOnly(booking.selectedDate)
    : formatDateOnly(booking.checkIn);
  const balance = getBalance(booking);
  const address = formatAddress(booking.guestInfo?.address);
  const paymentProofUrl = booking.paymentProof || booking.paymentProofUrl;
  const validIdUrl = booking.validIdImage || booking.validIdUrl;
  const paymentDisplay = computePaymentDisplay(booking);
  const bookingTypeLabel = booking.bookingIdDisplay || getBookingTypeLabel(booking);

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

  const openImage = (imageUrl, title) => {
    if (!imageUrl) return;
    setImageZoom({ show: true, imageUrl, title });
  };

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
              {feedback && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  <i className="fas fa-star text-[8px]" />
                  Feedback
                </span>
              )}
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
        <BookingHistoryExpandedDetails
          booking={booking}
          feedback={feedback}
          statusInfo={statusInfo}
          address={address}
          paymentProofUrl={paymentProofUrl}
          validIdUrl={validIdUrl}
          paymentDisplay={paymentDisplay}
          bookingTypeLabel={bookingTypeLabel}
          displayGuestTotal={displayGuestTotal}
          nights={nights}
          openImage={openImage}
        />
      )}

      {imageZoom.show && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setImageZoom({ show: false, imageUrl: '', title: '' })}
        >
          <div className="relative max-h-[90vh] max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImageZoom({ show: false, imageUrl: '', title: '' })}
              className="absolute -top-10 right-0 text-white hover:text-gray-200"
            >
              <i className="fas fa-times text-xl" />
            </button>
            <p className="mb-2 text-center text-sm font-semibold text-white">{imageZoom.title}</p>
            <img src={imageZoom.imageUrl} alt={imageZoom.title} className="max-h-[80vh] w-full rounded-xl object-contain bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

function BookingHistoryExpandedDetails({
  booking, feedback, statusInfo, address, paymentProofUrl, validIdUrl,
  paymentDisplay, bookingTypeLabel, displayGuestTotal, nights, openImage,
}) {
  return (
    <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-6">
      <div className="space-y-4">
        <DetailSection title="Booking Information" icon="fa-info-circle" iconColor="text-[#4D8CF5]">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <DetailRow label="Booking ID" value={booking.bookingId} mono />
            <DetailRow label="Booking Type" value={bookingTypeLabel} />
            <DetailRow label="Status" value={statusInfo.label} />
            <DetailRow label="Booked On" value={formatDateTime(booking.createdAt)} />
            {booking.paymentMethod && <DetailRow label="Payment Method" value={booking.paymentMethod} />}
          </div>
          {booking.adminNote && (
            <p className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600">
              <span className="font-medium">Admin Note:</span> {booking.adminNote}
            </p>
          )}
        </DetailSection>

        <DetailSection title="Guest Information" icon="fa-user" iconColor="text-[#4D8CF5]">
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-[#1E3A8A]">
              {`${booking.guestInfo?.firstName || ''} ${booking.guestInfo?.lastName || ''}`.trim() || 'Guest'}
            </p>
            <p className="text-[#1E3A8A]/70 break-all">{booking.guestInfo?.email || '—'}</p>
            <p className="text-[#1E3A8A]/70">{booking.guestInfo?.phone || '—'}</p>
            {address && <p className="text-xs text-[#1E3A8A]/60">{address}</p>}
          </div>
        </DetailSection>

        {booking.type === 'room' ? (
          <>
            <DetailSection title="Room Details" icon="fa-bed" iconColor="text-amber-600">
              {booking.isExclusiveResortBooking && (
                <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  Entire Resort Package: all room types are booked for this schedule.
                </p>
              )}
              {booking.isMultiRoomGroup && booking.roomTypesArray?.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {booking.roomTypesArray.map((room, idx) => (
                    <p key={idx} className="text-[#1E3A8A]/80">{room.quantity} × {room.type}</p>
                  ))}
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  <DetailRow label="Room Type" value={booking.roomType || '—'} />
                  <DetailRow label="Number of Rooms" value={String(booking.numberOfRooms || 1)} />
                </div>
              )}
              <p className="mt-2 border-t border-[#4D8CF5]/10 pt-2 text-sm">
                <span className="text-[#1E3A8A]/70">Total Rooms:</span>{' '}
                <span className="font-medium text-[#1E3A8A]">{booking.totalRooms || booking.numberOfRooms || 1}</span>
              </p>
            </DetailSection>

            <DetailSection title="Schedule" icon="fa-calendar-alt" iconColor="text-emerald-600">
              <div className="space-y-1 text-sm">
                <DetailRow label="Check-in" value={formatDateWithTime(booking.checkIn, 'check-in')} />
                <DetailRow label="Check-out" value={formatDateWithTime(booking.checkOut, 'check-out')} />
                <p className="text-xs text-slate-500">{nights} night{nights !== 1 ? 's' : ''}</p>
              </div>
            </DetailSection>

            <DetailSection title="Guest Count" icon="fa-users" iconColor="text-violet-600">
              {booking.isExclusiveResortBooking ? (
                <div className="space-y-1 text-sm">
                  <DetailRow label="Adults" value={String(booking.exclusiveAdults || 0)} />
                  <DetailRow label="Kids" value={String(booking.exclusiveKids || 0)} />
                  <p className="border-t border-[#4D8CF5]/10 pt-2 font-semibold text-[#1E3A8A]">
                    Total Guests: {(booking.exclusiveAdults || 0) + (booking.exclusiveKids || 0)}
                  </p>
                </div>
              ) : booking.childBookings?.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {booking.childBookings.map((child, idx) => (
                    <p key={idx} className="text-xs text-[#1E3A8A]">
                      {child.roomType} — Adults: {child.adults || child.guests || 1} | Kids: {child.kids || 0}
                    </p>
                  ))}
                  <p className="border-t border-[#4D8CF5]/10 pt-2 font-semibold text-[#1E3A8A]">
                    Total Guests: {booking.totalGuests || displayGuestTotal}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  <DetailRow label="Adults" value={String(booking.adults || booking.guests || 1)} />
                  <DetailRow label="Kids" value={String(booking.kids || 0)} />
                  <p className="border-t border-[#4D8CF5]/10 pt-2 font-semibold text-[#1E3A8A]">
                    Total Guests: {booking.guests || displayGuestTotal}
                  </p>
                </div>
              )}
            </DetailSection>
          </>
        ) : (
          <DetailSection title="Tour Details" icon="fa-sun" iconColor="text-emerald-600">
            <div className="space-y-1 text-sm">
              <DetailRow label="Tour Date" value={formatDateOnly(booking.selectedDate)} />
              <DetailRow
                label="Guest Breakdown"
                value={`Adult: ${booking.adults || 0} | Kid: ${booking.kids || 0}${booking.seniors ? ` | Senior: ${booking.seniors}` : ''}`}
              />
              <DetailRow label="Total Guests" value={String(displayGuestTotal)} />
            </div>
          </DetailSection>
        )}

        <DetailSection title="Payment Information" icon="fa-credit-card" iconColor="text-slate-600">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-blue-100/50 bg-blue-50/50 p-3">
              <p className="text-xs text-[#1E3A8A]/70 mb-1">Total Amount</p>
              <p className="font-bold text-[#1E3A8A] text-lg">₱{paymentDisplay.totalAmount.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-blue-100/50 bg-blue-50/50 p-3">
              <p className="text-xs text-[#1E3A8A]/70 mb-1">Balance</p>
              <p className="font-bold text-[#1E3A8A] text-lg">₱{paymentDisplay.balance.toLocaleString()}</p>
            </div>
            <div className="col-span-2 flex flex-wrap justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-sm">
              <p>
                <span className="text-[#1E3A8A]/70">50% Down:</span>{' '}
                <span className="font-bold text-amber-600">₱{paymentDisplay.downPayment.toLocaleString()}</span>
              </p>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </DetailSection>

        {paymentProofUrl && (
          <DetailSection title="Payment Proof" icon="fa-receipt" iconColor="text-[#4D8CF5]">
            <UploadImagePreview src={paymentProofUrl} alt="Payment Proof" onClick={() => openImage(paymentProofUrl, 'Payment Proof')} />
          </DetailSection>
        )}

        {validIdUrl && (
          <DetailSection title="Valid ID" icon="fa-id-card" iconColor="text-[#4D8CF5]" badge={booking.validIdType}>
            <UploadImagePreview src={validIdUrl} alt="Valid ID" onClick={() => openImage(validIdUrl, `Valid ID - ${booking.validIdType || 'ID'}`)} />
          </DetailSection>
        )}

        <DetailSection title="Special Request" icon="fa-comment-alt" iconColor="text-amber-600" amber>
          <p className={`text-sm ${booking.specialRequest ? 'text-amber-800' : 'italic text-amber-600'}`}>
            {booking.specialRequest || 'No special requests from guest'}
          </p>
        </DetailSection>

        {booking.cancellationReason && (
          <DetailSection title="Cancellation Reason" icon="fa-ban" iconColor="text-red-600">
            <p className="text-sm text-red-700">{booking.cancellationReason}</p>
          </DetailSection>
        )}

        {feedback && (
          <DetailSection title="Guest Feedback" icon="fa-star" iconColor="text-amber-600">
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <i
                    key={star}
                    className={`fas fa-star text-sm ${star <= (feedback.rating || 0) ? 'text-amber-400' : 'text-amber-200'}`}
                  />
                ))}
                <span className="ml-2 text-xs font-semibold text-amber-700">{feedback.rating}/5</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{feedback.comment}</p>
              {feedback.createdAt && (
                <p className="text-[10px] text-slate-400">Submitted {formatFeedbackDate(feedback.createdAt)}</p>
              )}
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Read-only</p>
            </div>
          </DetailSection>
        )}
      </div>
    </div>
  );
}

function DetailSection({ title, icon, iconColor, badge, amber, children }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${amber ? 'border-amber-200 bg-amber-50/70' : 'border-[#4D8CF5]/10 bg-white/70'}`}>
      <div className={`mb-3 flex items-center justify-between gap-2 border-b pb-2 ${amber ? 'border-amber-200/50' : 'border-[#4D8CF5]/10'}`}>
        <h4 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${amber ? 'text-amber-700' : 'text-[#1E3A8A]'}`}>
          <i className={`fas ${icon} ${iconColor}`} />
          {title}
        </h4>
        {badge && (
          <span className="rounded-md bg-[#4D8CF5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E3A8A]">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <p className="text-sm">
      <span className="text-[#1E3A8A]/70">{label}:</span>{' '}
      <span className={`font-medium text-[#1E3A8A] ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </p>
  );
}

function UploadImagePreview({ src, alt, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50 group transition hover:shadow-md"
    >
      <img
        src={src}
        alt={alt}
        className="h-48 w-full object-cover transition group-hover:scale-105"
        onError={(e) => {
          e.target.style.display = 'none';
          const parent = e.target.parentElement;
          if (parent) {
            parent.innerHTML = '<div class="p-6 text-center"><i class="fas fa-image text-3xl text-gray-400 mb-2 block"></i><p class="text-sm text-gray-500">Unable to load image</p></div>';
          }
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-[#1E3A8A]/0 transition group-hover:bg-[#1E3A8A]/20">
        <i className="fas fa-search-plus text-2xl text-white opacity-0 transition group-hover:opacity-100" />
      </div>
    </button>
  );
}

function formatFeedbackDate(value) {
  if (!value) return '';
  if (value?.toDate) return formatDateTime(value.toDate());
  if (value?.seconds) return formatDateTime(new Date(value.seconds * 1000));
  return formatDateTime(value);
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