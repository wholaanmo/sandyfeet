// components/guest/IdRequestNotifications.js
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import {
  getBookingResumePath,
  getPendingPaymentTypeLabel,
  isPendingBankPaymentRequest,
} from '@/lib/pendingBankPayments';
import {
  dedupeIdRequestNotifications,
  mapDocToIdRequestNotification,
} from '@/lib/idRequestUtils';
import { formatDateTime, getTypeDisplay, getBookingTitle } from '@/app/my-bookings/utils';
import IdRequestViewModal from '@/components/guest/IdRequestViewModal';

const DISMISSED_STORAGE_KEY = 'sandyfeet-guest-notification-dismissed';
const ALLOWED_BOOKING_TYPE_LABELS = new Set([
  'Day Tour',
  'Entire Resort',
  'Multi-Room Types',
  'Single Room Type',
]);
const RECENT_NOTIFICATION_DAYS = 30;

function isRecentTimestamp(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= RECENT_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000;
}

function readDismissedKeys() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeDismissedKeys(keys) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // ignore storage errors
  }
}

function getConfirmationAdminNote(data) {
  const note =
    data.confirmationNote?.trim() ||
    data.confirmationAdminNote?.trim() ||
    data.adminNote?.trim() ||
    '';
  return note || 'No note provided';
}

function formatNotificationTimestamp(value) {
  if (!value) return '';
  return formatDateTime(value);
}

function buildPseudoBooking(data, bookingType) {
  const roomTypes = Array.isArray(data.roomTypes) ? data.roomTypes : data.roomTypesArray || null;
  const isMultiRoom = Boolean(data.isMultiRoomBooking) || (Array.isArray(roomTypes) && roomTypes.length > 1);

  return {
    type: bookingType,
    isExclusiveResortBooking: Boolean(data.isExclusiveResortBooking),
    isMultiRoom,
    roomTypesArray: roomTypes,
    roomType: data.roomType || null,
  };
}

function mapDocToBookingStatusNotifications(docSnap, bookingType) {
  const data = docSnap.data();
  const pseudoBooking = buildPseudoBooking(data, bookingType);
  const typeDisplay = getTypeDisplay(pseudoBooking);

  if (!ALLOWED_BOOKING_TYPE_LABELS.has(typeDisplay.label)) {
    return [];
  }

  const dedupeKey = data.parentBookingId || docSnap.id;
  const bookingId = data.bookingId || docSnap.id;
  const collectionName = bookingType === 'daytour' ? 'dayTourBookings' : 'bookings';
  const base = {
    source: 'booking_status',
    docId: docSnap.id,
    collectionName,
    bookingType,
    bookingId,
    typeLabel: typeDisplay.label,
    title: getBookingTitle(pseudoBooking),
    dedupeKey,
  };

  const notifications = [];

  if (data.status === 'confirmed' && isRecentTimestamp(data.updatedAt)) {
    notifications.push({
      ...base,
      kind: 'reservation_confirmed',
      notificationType: 'Booking Confirmed',
      adminNote: getConfirmationAdminNote(data),
      timestamp: data.updatedAt || data.createdAt,
      key: `confirmed-${bookingType}-${dedupeKey}`,
    });
  }

  if (data.status === 'cancelled' && data.cancelledBy === 'admin') {
    notifications.push({
      ...base,
      kind: 'reservation_cancelled',
      notificationType: 'Booking Cancelled',
      adminNote: data.cancellationReason?.trim() || 'No reason provided',
      timestamp: data.cancelledAt || data.updatedAt || data.createdAt,
      key: `cancelled-${bookingType}-${dedupeKey}`,
    });
  }

  const changeRequest = data.changeRequest;
  if (changeRequest && (changeRequest.status === 'approved' || changeRequest.status === 'rejected')) {
    const isApproved = changeRequest.status === 'approved';
    notifications.push({
      ...base,
      kind: isApproved ? 'change_request_approved' : 'change_request_rejected',
      notificationType: isApproved ? 'Change Request Approved' : 'Change Request Declined',
      adminNote:
        changeRequest.adminNote?.trim() ||
        changeRequest.adminReason?.trim() ||
        'No response provided',
      timestamp: changeRequest.processedAt || data.updatedAt || data.createdAt,
      key: `change-${changeRequest.status}-${bookingType}-${dedupeKey}`,
    });
  }

  return notifications;
}

function dedupeBookingStatusNotifications(notifications) {
  const map = new Map();

  notifications.forEach((notification) => {
    const existing = map.get(notification.key);
    if (!existing) {
      map.set(notification.key, notification);
      return;
    }

    const existingTime = new Date(existing.timestamp || 0).getTime();
    const nextTime = new Date(notification.timestamp || 0).getTime();
    if (nextTime >= existingTime) {
      map.set(notification.key, notification);
    }
  });

  return Array.from(map.values());
}

function detectTransitionNotifications(docSnap, bookingType, previousState) {
  const data = docSnap.data();
  const docId = docSnap.id;
  const prev = previousState?.get(docId);
  const pseudoBooking = buildPseudoBooking(data, bookingType);
  const typeDisplay = getTypeDisplay(pseudoBooking);

  if (!ALLOWED_BOOKING_TYPE_LABELS.has(typeDisplay.label)) {
    return [];
  }

  const dedupeKey = data.parentBookingId || docId;
  const bookingId = data.bookingId || docId;
  const collectionName = bookingType === 'daytour' ? 'dayTourBookings' : 'bookings';
  const base = {
    source: 'booking_status',
    docId,
    collectionName,
    bookingType,
    bookingId,
    typeLabel: typeDisplay.label,
    title: getBookingTitle(pseudoBooking),
    dedupeKey,
  };

  const detected = [];
  const prevStatus = prev?.status;
  const currentStatus = data.status;

  if (prevStatus === 'pending' && currentStatus === 'confirmed') {
    detected.push({
      ...base,
      kind: 'reservation_confirmed',
      notificationType: 'Booking Confirmed',
      adminNote: getConfirmationAdminNote(data),
      timestamp: data.updatedAt || new Date().toISOString(),
      key: `confirmed-${bookingType}-${dedupeKey}`,
    });
  }

  if (
    prevStatus === 'pending' &&
    currentStatus === 'cancelled' &&
    data.cancelledBy === 'admin'
  ) {
    detected.push({
      ...base,
      kind: 'reservation_cancelled',
      notificationType: 'Booking Cancelled',
      adminNote: data.cancellationReason?.trim() || 'No reason provided',
      timestamp: data.cancelledAt || data.updatedAt || new Date().toISOString(),
      key: `cancelled-${bookingType}-${dedupeKey}`,
    });
  }

  const prevChangeStatus = prev?.changeRequestStatus;
  const currentChangeStatus = data.changeRequest?.status;
  if (
    prevChangeStatus === 'pending' &&
    (currentChangeStatus === 'approved' || currentChangeStatus === 'rejected')
  ) {
    const isApproved = currentChangeStatus === 'approved';
    detected.push({
      ...base,
      kind: isApproved ? 'change_request_approved' : 'change_request_rejected',
      notificationType: isApproved ? 'Change Request Approved' : 'Change Request Declined',
      adminNote:
        data.changeRequest?.adminNote?.trim() ||
        data.changeRequest?.adminReason?.trim() ||
        'No response provided',
      timestamp: data.changeRequest?.processedAt || data.updatedAt || new Date().toISOString(),
      key: `change-${currentChangeStatus}-${bookingType}-${dedupeKey}`,
    });
  }

  return detected;
}

function useIdRequestSnapshot(collectionName, bookingType, field, value) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!value) {
      setItems([]);
      return undefined;
    }

    const snapshotQuery = query(collection(db, collectionName), where(field, '==', value));

    return onSnapshot(snapshotQuery, (snapshot) => {
      setItems(
        snapshot.docs
          .map((docSnap) => mapDocToIdRequestNotification(docSnap, bookingType))
          .filter(Boolean)
      );
    });
  }, [collectionName, bookingType, field, value]);

  return items;
}

function useBookingStatusSnapshot(collectionName, bookingType, field, value) {
  const [items, setItems] = useState([]);
  const previousDocStateRef = useRef(new Map());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!value) {
      setItems([]);
      previousDocStateRef.current = new Map();
      seededRef.current = false;
      return undefined;
    }

    const snapshotQuery = query(collection(db, collectionName), where(field, '==', value));

    return onSnapshot(snapshotQuery, (snapshot) => {
      const persistent = [];
      const transitions = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        persistent.push(...mapDocToBookingStatusNotifications(docSnap, bookingType));

        if (seededRef.current) {
          transitions.push(
            ...detectTransitionNotifications(docSnap, bookingType, previousDocStateRef.current)
          );
        }

        previousDocStateRef.current.set(docSnap.id, {
          status: data.status,
          changeRequestStatus: data.changeRequest?.status || null,
        });
      });

      if (!seededRef.current) {
        seededRef.current = true;
      }

      setItems(dedupeBookingStatusNotifications([...persistent, ...transitions]));
    });
  }, [collectionName, bookingType, field, value]);

  return items;
}

function useGuestBookingsForBankChecks(user, normalizedEmail) {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    if (!normalizedEmail && !user?.uid) {
      setBookings([]);
      return undefined;
    }

    const liveMap = new Map();
    const rebuild = () => setBookings(Array.from(liveMap.values()));
    const unsubs = [];

    const attach = (col, field, value) => {
      if (!value) return;
      unsubs.push(
        onSnapshot(query(collection(db, col), where(field, '==', value)), (snapshot) => {
          snapshot.docs.forEach((docSnap) => {
            liveMap.set(`${col}-${docSnap.id}`, { id: docSnap.id, ...docSnap.data() });
          });
          rebuild();
        })
      );
    };

    attach('bookings', 'guestInfo.email', normalizedEmail);
    attach('dayTourBookings', 'guestInfo.email', normalizedEmail);
    attach('bookings', 'guestUid', user?.uid || '');
    attach('dayTourBookings', 'guestUid', user?.uid || '');

    return () => unsubs.forEach((unsub) => unsub());
  }, [normalizedEmail, user?.uid]);

  return bookings;
}

function useBankPaymentNotifications(collectionName, requestType, email, rawBookings) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!email) {
      setItems([]);
      return undefined;
    }

    const snapshotQuery = query(
      collection(db, collectionName),
      where('guestEmail', '==', email)
    );

    return onSnapshot(snapshotQuery, (snapshot) => {
      const notifications = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const request = { id: docSnap.id, ...data, requestType };
          if (!isPendingBankPaymentRequest(request, rawBookings)) return null;

          const bank = data.providedBankDetails || {};
          const typeLabel = getPendingPaymentTypeLabel({ ...data, requestType });

          return {
            source: 'bank_payment',
            key: `bank-payment-${requestType}-${docSnap.id}`,
            notificationType: 'Payment Details Available',
            typeLabel,
            bookingId: data.bookingId || docSnap.id,
            adminNote: `Bank: ${bank.bankName || 'N/A'} · Account: ${bank.accountName || 'N/A'}`,
            timestamp: bank.providedAt || data.updatedAt || data.createdAt,
            resumePath: getBookingResumePath(request),
          };
        })
        .filter(Boolean);

      setItems(notifications);
    });
  }, [collectionName, requestType, email, rawBookings]);

  return items;
}

export default function IdRequestNotifications() {
  const { user } = useGuestAuth();
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState(() => readDismissedKeys());

  const normalizedEmail = user?.email?.toLowerCase().trim() || '';

  const roomIdByEmail = useIdRequestSnapshot('bookings', 'room', 'guestInfo.email', normalizedEmail);
  const dayIdByEmail = useIdRequestSnapshot('dayTourBookings', 'daytour', 'guestInfo.email', normalizedEmail);
  const roomIdByUid = useIdRequestSnapshot('bookings', 'room', 'guestUid', user?.uid || '');
  const dayIdByUid = useIdRequestSnapshot('dayTourBookings', 'daytour', 'guestUid', user?.uid || '');

  const roomStatusByEmail = useBookingStatusSnapshot('bookings', 'room', 'guestInfo.email', normalizedEmail);
  const dayStatusByEmail = useBookingStatusSnapshot('dayTourBookings', 'daytour', 'guestInfo.email', normalizedEmail);
  const roomStatusByUid = useBookingStatusSnapshot('bookings', 'room', 'guestUid', user?.uid || '');
  const dayStatusByUid = useBookingStatusSnapshot('dayTourBookings', 'daytour', 'guestUid', user?.uid || '');

  const idRequestNotifications = useMemo(
    () => dedupeIdRequestNotifications([...roomIdByEmail, ...dayIdByEmail, ...roomIdByUid, ...dayIdByUid]),
    [roomIdByEmail, dayIdByEmail, roomIdByUid, dayIdByUid]
  );

  const bookingStatusNotifications = useMemo(() => {
    const merged = dedupeBookingStatusNotifications([
      ...roomStatusByEmail,
      ...dayStatusByEmail,
      ...roomStatusByUid,
      ...dayStatusByUid,
    ]);

    return merged.filter((notification) => !dismissedKeys.has(notification.key));
  }, [roomStatusByEmail, dayStatusByEmail, roomStatusByUid, dayStatusByUid, dismissedKeys]);

  const guestBookingsForBank = useGuestBookingsForBankChecks(user, normalizedEmail);

  const bankPaymentRoom = useBankPaymentNotifications(
    'bank_requests',
    'room',
    normalizedEmail,
    guestBookingsForBank
  );
  const bankPaymentDayTour = useBankPaymentNotifications(
    'daytour_bank_requests',
    'daytour',
    normalizedEmail,
    guestBookingsForBank
  );

  const notifications = useMemo(() => {
    const combined = [
      ...idRequestNotifications.map((notification) => ({
        ...notification,
        source: 'id_request',
        timestamp: notification.requestedAt,
      })),
      ...bookingStatusNotifications,
      ...bankPaymentRoom.filter((n) => !dismissedKeys.has(n.key)),
      ...bankPaymentDayTour.filter((n) => !dismissedKeys.has(n.key)),
    ];

    return combined.sort(
      (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );
  }, [
    idRequestNotifications,
    bookingStatusNotifications,
    bankPaymentRoom,
    bankPaymentDayTour,
    dismissedKeys,
  ]);

  const handleDismissBookingNotification = useCallback((notificationKey) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(notificationKey);
      writeDismissedKeys(next);
      return next;
    });
  }, []);

  if (!user) return null;

  return (
    <>
      <div className="rounded-2xl border border-[#4D8CF5]/15 bg-white p-4 shadow-[0_6px_18px_rgba(77,140,245,0.08)]">
        <MotionlessConfirmModalNotificationsHeader count={notifications.length} />

        {notifications.length === 0 ? (
          <p className="text-xs leading-relaxed text-[#5C7AA6]">No notifications at the moment.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) =>
              notification.source === 'id_request' ? (
                <IdRequestNotificationItem
                  key={`id-${notification.key}-${notification.docId}`}
                  notification={notification}
                  onView={() => {
                    setSelectedNotification(notification);
                    setModalOpen(true);
                  }}
                />
              ) : notification.source === 'bank_payment' ? (
                <BankPaymentNotificationItem
                  key={`bank-${notification.key}`}
                  notification={notification}
                  onDismiss={() => handleDismissBookingNotification(notification.key)}
                />
              ) : (
                <BookingStatusNotificationItem
                  key={`status-${notification.key}`}
                  notification={notification}
                  onDismiss={() => handleDismissBookingNotification(notification.key)}
                />
              )
            )}
          </div>
        )}
      </div>

      <IdRequestViewModal
        notification={selectedNotification}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedNotification(null);
        }}
      />
    </>
  );
}

function MotionlessConfirmModalNotificationsHeader({ count }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4D8CF5]/10 text-[#4D8CF5]">
          <i className="fas fa-bell text-sm" />
        </div>
        <h3 className="text-sm font-bold text-[#1E3A8A]">Notifications</h3>
      </div>
      {count > 0 && (
        <span className="rounded-full bg-[#4D8CF5] px-2 py-0.5 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </div>
  );
}

function IdRequestNotificationItem({ notification, onView }) {
  return (
    <div className="rounded-xl border border-[#4D8CF5]/10 bg-[#f8fbff] p-3">
      <div className="flex items-start gap-2">
        <MotionlessConfirmModalNotificationIcon />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#4D8CF5]">ID Request</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#1E3A8A]">{notification.title}</p>
          <p className="text-xs text-[#5C7AA6]">
            {notification.typeLabel} · {notification.bookingId}
          </p>
          {notification.timestamp && (
            <p className="mt-1 text-[10px] text-[#5C7AA6]/80">
              {formatNotificationTimestamp(notification.timestamp)}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onView}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4D8CF5] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#3b7ae0]"
      >
        <i className="fas fa-eye text-[10px]" />
        View
      </button>
    </div>
  );
}

function BankPaymentNotificationItem({ notification, onDismiss }) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <i className="fas fa-university text-xs" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            {notification.notificationType}
          </p>
          <p className="mt-0.5 text-xs text-[#5C7AA6]">
            {notification.typeLabel} · {notification.bookingId}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#1E3A8A]">
            The resort has provided bank transfer details. Please complete your payment and upload proof.
          </p>
          <p className="mt-1 text-xs text-[#5C7AA6]">{notification.adminNote}</p>
          {notification.timestamp && (
            <p className="mt-1 text-[10px] text-[#5C7AA6]/80">
              {formatNotificationTimestamp(notification.timestamp)}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Link
          href={notification.resumePath}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4D8CF5] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#3b7ae0]"
        >
          <i className="fas fa-arrow-right text-[10px]" />
          Continue payment
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-white px-3 py-2 text-xs font-semibold text-[#4D8CF5] transition hover:bg-[#f8fbff]"
        >
          <i className="fas fa-check text-[10px]" />
          Dismiss
        </button>
      </div>
    </div>
  );
}

function BookingStatusNotificationItem({ notification, onDismiss }) {
  const style = getBookingNotificationStyle(notification.kind);

  return (
    <div className={`rounded-xl border p-3 ${style.card}`}>
      <div className="flex items-start gap-2">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.iconWrap}`}
        >
          <i className={`fas ${style.icon} text-xs`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${style.label}`}>
            {notification.notificationType}
          </p>
          <p className="mt-0.5 text-xs text-[#5C7AA6]">
            {notification.typeLabel} · {notification.bookingId}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#1E3A8A]">
            <span className="font-semibold text-[#5C7AA6]">Resort response: </span>
            <span className="whitespace-pre-wrap">{notification.adminNote}</span>
          </p>
          {notification.timestamp && (
            <p className="mt-1 text-[10px] text-[#5C7AA6]/80">
              {formatNotificationTimestamp(notification.timestamp)}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-white px-3 py-2 text-xs font-semibold text-[#4D8CF5] transition hover:bg-[#f8fbff]"
      >
        <i className="fas fa-check text-[10px]" />
        Dismiss
      </button>
    </div>
  );
}

function getBookingNotificationStyle(kind) {
  const styles = {
    reservation_confirmed: {
      card: 'border-emerald-200/80 bg-emerald-50/40',
      iconWrap: 'bg-emerald-100 text-emerald-600',
      icon: 'fa-check-circle',
      label: 'text-emerald-700',
    },
    reservation_cancelled: {
      card: 'border-red-200/80 bg-red-50/40',
      iconWrap: 'bg-red-100 text-red-600',
      icon: 'fa-times-circle',
      label: 'text-red-700',
    },
    change_request_approved: {
      card: 'border-blue-200/80 bg-blue-50/40',
      iconWrap: 'bg-blue-100 text-blue-600',
      icon: 'fa-exchange-alt',
      label: 'text-blue-700',
    },
    change_request_rejected: {
      card: 'border-amber-200/80 bg-amber-50/40',
      iconWrap: 'bg-amber-100 text-amber-600',
      icon: 'fa-exchange-alt',
      label: 'text-amber-700',
    },
  };

  return styles[kind] || styles.change_request_approved;
}

function MotionlessConfirmModalNotificationIcon() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
      <i className="fas fa-id-card text-xs" />
    </div>
  );
}
