// lib/paymentRequestUtils.js
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTypeDisplay, getBookingTitle } from '@/app/my-bookings/utils';
import { getRelatedBookingDocRefs } from '@/lib/idRequestUtils';

export const buildPaymentRequestPayload = (booking, adminMessage) => ({
  paymentRequest: {
    status: 'pending',
    adminMessage: adminMessage || '',
    requestedAt: new Date().toISOString(),
    previousPaymentProof: booking.paymentProof || booking.paymentProofUrl || null,
  },
  updatedAt: new Date().toISOString(),
});

export const applyPaymentRequestToBookingDocs = async (collectionName, booking, adminMessage) => {
  const payload = buildPaymentRequestPayload(booking, adminMessage);
  const refs = await getRelatedBookingDocRefs(collectionName, booking);

  await Promise.all(
    refs.map((bookingRef) => updateDoc(bookingRef, payload))
  );
};

export const getAdditionalPaymentProofUrls = (booking) => {
  if (!booking) return [];
  const fromArray = Array.isArray(booking.additionalPaymentProofs)
    ? booking.additionalPaymentProofs
        .map((item) => (typeof item === 'string' ? item : item?.url))
        .filter(Boolean)
    : [];
  if (fromArray.length > 0) return fromArray;
  const fallback = booking.paymentRequest?.resubmittedPaymentProof;
  return fallback ? [fallback] : [];
};

export const submitGuestPaymentProofResubmission = async ({
  collectionName,
  docId,
  parentBookingId,
  paymentProof,
  existingPaymentRequest,
}) => {
  if (!paymentProof) {
    throw new Error('A payment proof image is required.');
  }

  if (existingPaymentRequest?.status === 'fulfilled') {
    throw new Error('A new payment proof has already been submitted for this request.');
  }

  const bookingRef = doc(db, collectionName, docId);
  const bookingSnap = await getDoc(bookingRef);
  const bookingData = bookingSnap.exists() ? bookingSnap.data() : {};
  const existingAdditional = Array.isArray(bookingData.additionalPaymentProofs)
    ? bookingData.additionalPaymentProofs
    : [];

  const now = new Date().toISOString();
  const updatePayload = {
    additionalPaymentProofs: [
      ...existingAdditional,
      {
        url: paymentProof,
        submittedAt: now,
      },
    ],
    paymentRequest: {
      ...(existingPaymentRequest || {}),
      status: 'fulfilled',
      fulfilledAt: now,
      resubmittedPaymentProof: paymentProof,
    },
    updatedAt: now,
  };

  const refs = await getRelatedBookingDocRefs(collectionName, {
    id: docId,
    parentBookingId: parentBookingId || bookingData.parentBookingId || null,
  });

  await Promise.all(refs.map((ref) => updateDoc(ref, updatePayload)));
};

export const mapDocToPaymentRequestNotification = (docSnap, bookingType) => {
  const data = docSnap.data();
  const paymentRequest = data.paymentRequest;
  if (!paymentRequest || paymentRequest.status !== 'pending') return null;

  const pseudoBooking = {
    type: bookingType,
    isExclusiveResortBooking: Boolean(data.isExclusiveResortBooking),
    isMultiRoomBooking: Boolean(data.isMultiRoomBooking),
    roomTypesArray: Array.isArray(data.roomTypes) ? data.roomTypes : data.roomTypesArray || null,
    roomType: data.roomType || null,
  };

  const typeDisplay = getTypeDisplay(pseudoBooking);
  const dedupeKey = data.parentBookingId || docSnap.id;

  return {
    key: `${bookingType}-${dedupeKey}`,
    docId: docSnap.id,
    collectionName: bookingType === 'daytour' ? 'dayTourBookings' : 'bookings',
    bookingType,
    bookingId: data.bookingId || docSnap.id,
    parentBookingId: data.parentBookingId || null,
    guestInfo: data.guestInfo || {},
    paymentRequest,
    typeLabel: typeDisplay.label,
    title: getBookingTitle(pseudoBooking),
    checkIn: data.checkIn || null,
    checkOut: data.checkOut || null,
    selectedDate: data.selectedDate || null,
    requestedAt: paymentRequest.requestedAt,
  };
};

export const dedupePaymentRequestNotifications = (notifications) => {
  const map = new Map();
  notifications.forEach((notification) => {
    const existing = map.get(notification.key);
    if (!existing) {
      map.set(notification.key, notification);
      return;
    }

    const existingTime = new Date(existing.requestedAt || 0).getTime();
    const nextTime = new Date(notification.requestedAt || 0).getTime();
    if (nextTime >= existingTime) {
      map.set(notification.key, notification);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()
  );
};
