// app/dashboard/admin/reservations/guest-profile/page.js
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, onSnapshot, query, where, updateDoc, getDocs } from 'firebase/firestore';
import { logAdminAction } from '@/lib/auditLogger';
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
import BookingDetailsModal from '../components/BookingDetailsModal';

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
  const [lookupGuestUid, setLookupGuestUid] = useState('');

  const [roomRaw, setRoomRaw] = useState([]);
  const [dayTourRaw, setDayTourRaw] = useState([]);
  const [guestProfile, setGuestProfile] = useState(null);
  const [feedbackByBookingId, setFeedbackByBookingId] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalBooking, setModalBooking] = useState(null); // { booking, feedback }
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountActionMessage, setAccountActionMessage] = useState('');
  const [notificationFade, setNotificationFade] = useState(false);
  const [displayMessage, setDisplayMessage] = useState('');

  useEffect(() => {
    if (!accountActionMessage) {
      setDisplayMessage('');
      setNotificationFade(false);
      return;
    }

    setDisplayMessage(accountActionMessage);
    setNotificationFade(false);

    // Only auto-fade success notifications
    const isSuccess = !accountActionMessage.toLowerCase().includes('failed') &&
                      !accountActionMessage.toLowerCase().includes('missing') &&
                      !accountActionMessage.toLowerCase().includes('provide');

    if (isSuccess) {
      const fadeTimer = setTimeout(() => {
        setNotificationFade(true);
      }, 3000);

      const clearTimer = setTimeout(() => {
        setAccountActionMessage('');
      }, 4000);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [accountActionMessage]);

  const resolvedGuestUid = useMemo(() => {
    if (guestUid) return guestUid;
    const bookingUid = roomRaw.find((b) => b.guestUid)?.guestUid || dayTourRaw.find((b) => b.guestUid)?.guestUid;
    return bookingUid || lookupGuestUid;
  }, [guestUid, roomRaw, dayTourRaw, lookupGuestUid]);

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

  useEffect(() => {
    if (!email || resolvedGuestUid || lookupGuestUid) return;

    const fetchGuestUidByEmail = async () => {
      try {
        const q = query(collection(db, 'guestProfiles'), where('email', '==', email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          setLookupGuestUid(docSnap.id);
        }
      } catch (err) {
        console.error('Failed to fetch guest uid by email:', err);
      }
    };

    fetchGuestUidByEmail();
  }, [email, resolvedGuestUid, lookupGuestUid]);

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
    router.push('/dashboard/staff/reservations?restoreGuestProfile=1');
  };

  const isGuestDeactivated = guestProfile?.accountStatus === 'deactivated';

  const handleDeactivateAccount = async () => {
    const reason = deactivationReason.trim();
    if (!reason) {
      setAccountActionMessage('Please provide a reason for deactivation.');
      return;
    }
    if (!resolvedGuestUid) {
      setAccountActionMessage('Guest account ID is missing. Cannot deactivate this profile.');
      return;
    }

    setAccountActionLoading(true);
    setAccountActionMessage('');

    try {
      const nextSessionVersion = (Number(guestProfile?.sessionVersion) || 1) + 1;
      await updateDoc(doc(db, 'guestProfiles', resolvedGuestUid), {
        accountStatus: 'deactivated',
        deactivationReason: reason,
        deactivatedAt: new Date().toISOString(),
        sessionVersion: nextSessionVersion,
      });

      await logAdminAction({
        action: 'Deactivated guest account',
        module: 'Guest Management',
        details: `Deactivated guest account: ${personalInfo.email} (${resolvedGuestUid}). Reason: ${reason}`,
      });

      setShowDeactivateModal(false);
      setDeactivationReason('');
      setAccountActionMessage('Guest account deactivated successfully.');
    } catch (error) {
      console.error('Error deactivating guest account:', error);
      setAccountActionMessage('Failed to deactivate guest account. Please try again.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const handleReactivateAccount = async () => {
    if (!resolvedGuestUid) {
      setAccountActionMessage('Guest account ID is missing. Cannot reactivate this profile.');
      return;
    }

    setAccountActionLoading(true);
    setAccountActionMessage('');

    try {
      await updateDoc(doc(db, 'guestProfiles', resolvedGuestUid), {
        accountStatus: 'active',
        deactivationReason: '',
        deactivatedAt: null,
      });

      await logAdminAction({
        action: 'Reactivated guest account',
        module: 'Guest Management',
        details: `Reactivated guest account: ${personalInfo.email} (${resolvedGuestUid})`,
      });

      setAccountActionMessage('Guest account reactivated successfully.');
    } catch (error) {
      console.error('Error reactivating guest account:', error);
      setAccountActionMessage('Failed to reactivate guest account. Please try again.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  if (!email && !guestUid) {
    return (
      <GuestProfilePageShell>
        <p className="text-sm text-[#5C7AA6]">Guest information is missing.</p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/staff/reservations')}
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
        <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
              <i className="fas fa-user text-sm"></i>
            </div>
            <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wide">Personal Information</h2>
          </div>
          {resolvedGuestUid && (
            <div className="shrink-0">
              {isGuestDeactivated ? (
                <button
                  type="button"
                  onClick={handleReactivateAccount}
                  disabled={accountActionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
                >
                  <i className="fas fa-user-check text-xs" />
                  {accountActionLoading ? 'Processing...' : 'Reactivate Account'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDeactivationReason('');
                    setAccountActionMessage('');
                    setShowDeactivateModal(true);
                  }}
                  disabled={accountActionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60 shadow-sm"
                >
                  <i className="fas fa-user-slash text-xs" />
                  Deactivate This Account
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p-5 sm:p-6">
          {displayMessage && (
            <div
              className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-1000 ease-in-out ${
                notificationFade ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
              } ${
                displayMessage.toLowerCase().includes('failed') ||
                displayMessage.toLowerCase().includes('missing') ||
                displayMessage.toLowerCase().includes('provide')
                  ? 'bg-red-50 text-red-700 border border-red-100'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              }`}
            >
              {displayMessage}
            </div>
          )}

          {isGuestDeactivated && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-700">Account Status: Deactivated</p>
              {guestProfile?.deactivationReason && (
                <p className="mt-1 text-sm text-red-600">
                  Reason: {guestProfile.deactivationReason}
                </p>
              )}
            </div>
          )}

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
      <div className="bg-white rounded-xl border border-[#4D8CF5]/10 shadow-md overflow-hidden">
        <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
                <i className="fas fa-calendar-check text-sm" />
              </div>
              <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wide">
                Booking History
              </h2>
            </div>
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
        </div>

        <div className="p-5 sm:p-6 bg-slate-50/50">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm font-medium text-[#5C7AA6] animate-pulse">Loading bookings...</p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5] mb-3">
                <i className="fas fa-box-open text-xl" />
              </div>
              <p className="text-sm font-medium text-[#5C7AA6]">No bookings found for this guest.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
              {filteredBookings.map((booking) => (
                <GuestBookingHistoryCard
                  key={booking.key}
                  booking={booking}
                  feedback={feedbackByBookingId[booking.bookingId] || null}
                  onOpenModal={() => setModalBooking({ booking, feedback: feedbackByBookingId[booking.bookingId] || null })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Booking Details Modal */}
      {modalBooking && (
        <BookingDetailsModal
          booking={modalBooking.booking}
          feedback={modalBooking.feedback}
          onClose={() => setModalBooking(null)}
        />
      )}

      {showDeactivateModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !accountActionLoading && setShowDeactivateModal(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-guest-title"
          >
            <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-5 py-4">
              <h3 id="deactivate-guest-title" className="text-base font-bold text-[#1E3A8A]">
                Deactivate Guest Account
              </h3>
              <p className="mt-1 text-sm text-[#5C7AA6]">
                Are you sure you want to deactivate this account?
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label htmlFor="deactivation-reason" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5C7AA6]">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="deactivation-reason"
                  value={deactivationReason}
                  onChange={(e) => setDeactivationReason(e.target.value)}
                  rows={4}
                  placeholder="Enter the reason for deactivation..."
                  className="w-full rounded-xl border border-[#4D8CF5]/20 px-3 py-2.5 text-sm text-[#1E3A8A] focus:border-[#4D8CF5] focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                />
              </div>
              {accountActionMessage && showDeactivateModal && (
                <p className="text-sm text-red-600">{accountActionMessage}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#4D8CF5]/10 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowDeactivateModal(false)}
                disabled={accountActionLoading}
                className="rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2 text-sm font-semibold text-[#1E3A8A] transition hover:bg-[#4D8CF5]/5 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivateAccount}
                disabled={accountActionLoading}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {accountActionLoading ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </GuestProfilePageShell>
  );
}

function GuestProfilePageShell({ children }) {
  return (
    <div className="px-4 sm:px-6 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      <div className="max-w-7xl mx-auto py-4">{children}</div>
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

function GuestBookingHistoryCard({ booking, feedback, onOpenModal }) {
  const typeInfo = getTypeDisplay(booking);
  const statusInfo = getStatusBadge(booking.status, booking.cancelledBy);
  const guestTotal = getGuestTotal(booking);
  const nights = booking.type === 'daytour' ? 0 : calcNights(booking.checkIn, booking.checkOut);
  const primaryDate = booking.type === 'daytour'
    ? formatDateOnly(booking.selectedDate)
    : formatDateOnly(booking.checkIn);
  const balance = getBalance(booking);

  let exclusiveTotalPrice = null;
  let exclusiveRemainingBalance = null;
  if (booking.isExclusiveResortBooking && nights > 0) {
    const tentCount = booking.tentCount || 0;
    const nightlyTotal = BASE_EXCLUSIVE_PRICE + (tentCount * 1500);
    exclusiveTotalPrice = nightlyTotal * nights;
    exclusiveRemainingBalance = exclusiveTotalPrice - (exclusiveTotalPrice * 0.5);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#4D8CF5]/15 bg-white shadow-sm transition-all duration-300 hover:border-[#4D8CF5]/40 hover:shadow-md">
      <div className="flex h-full flex-col p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider shadow-sm ${typeInfo.color}`}>
                <i className={`fas ${typeInfo.icon} text-[9px]`} />
                {typeInfo.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider shadow-sm ${statusInfo.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot} animate-pulse`} />
                {statusInfo.label}
              </span>
              {feedback && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 shadow-sm">
                  <i className="fas fa-star text-[9px]" />
                  Feedback
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-[#1E3A8A] tracking-tight">{getBookingTitle(booking)}</h3>
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 uppercase tracking-wider">ID</span>
              <p className="font-mono text-xs font-medium text-slate-500">{booking.bookingId}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <div className="flex items-baseline gap-2 rounded-lg bg-[#4D8CF5]/5 px-3 py-1.5 border border-[#4D8CF5]/10">
              <p className="text-sm font-bold text-[#1E3A8A]">{primaryDate}</p>
              {booking.type !== 'daytour' && booking.checkOut && (
                <span className="text-xs font-semibold text-[#5C7AA6]">→ {formatDateOnly(booking.checkOut)}</span>
              )}
            </div>
            <p className="mt-2 text-2xl font-black text-[#1E3A8A] tracking-tight">
              ₱{(exclusiveTotalPrice !== null ? exclusiveTotalPrice : booking.totalPrice).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-6 flex-shrink-0">
          <div className="flex items-center justify-between gap-3 border-t border-[#4D8CF5]/10 pt-4">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[#5C7AA6] flex-1 min-w-0">
              <div className="flex shrink-0 items-center gap-1.5 bg-[#f8fbff] px-2 py-1 rounded-md border border-[#4D8CF5]/5 shadow-sm">
                <i className="fas fa-users text-[#4D8CF5] text-[11px]" />
                <span className="font-semibold text-[#1E3A8A] text-xs whitespace-nowrap">{guestTotal} <span className="font-medium text-[9px] text-[#5C7AA6] uppercase tracking-wider">guest{guestTotal !== 1 ? 's' : ''}</span></span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 bg-[#f8fbff] px-2 py-1 rounded-md border border-[#4D8CF5]/5 shadow-sm">
                <i className={`fas ${booking.type === 'daytour' ? 'fa-sun' : 'fa-moon'} text-[#4D8CF5] text-[11px]`} />
                <span className="font-semibold text-[#1E3A8A] text-xs whitespace-nowrap">{booking.type === 'daytour' ? 'Day tour' : `${nights} `}<span className="font-medium text-[9px] text-[#5C7AA6] uppercase tracking-wider">{booking.type === 'daytour' ? '' : `night${nights !== 1 ? 's' : ''}`}</span></span>
              </div>
              {balance > 0 && (
                <div className="flex shrink-0 items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-md border border-amber-100 shadow-sm min-w-0">
                  <i className="fas fa-wallet text-amber-500 text-[11px] shrink-0" />
                  <span className="font-semibold text-amber-700 text-xs truncate">Balance: ₱{(exclusiveRemainingBalance !== null ? exclusiveRemainingBalance : balance).toLocaleString()}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenModal}
              className="shrink-0 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#4D8CF5] to-[#3b7add] px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-all duration-300 hover:shadow-md hover:from-[#3b7add] hover:to-[#2a68c9] hover:-translate-y-0.5 active:scale-95"
            >
              More Info
              <i className="fas fa-book-open text-[11px] opacity-90" />
            </button>
          </div>
        </div>
      </div>
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