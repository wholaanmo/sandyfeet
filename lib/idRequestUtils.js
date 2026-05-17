// lib/idRequestUtils.js
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTypeDisplay, getBookingTitle } from '@/app/my-bookings/utils';

export const VALID_ID_OPTIONS = [
  'Passport',
  "Driver's License",
  'National ID',
  'UMID',
  'Postal ID',
  "Voter's ID / Voter's Certificate",
  'PhilHealth ID',
  'Other Government IDs',
];

export const buildIdRequestPayload = (booking, adminMessage) => ({
  idRequest: {
    status: 'pending',
    adminMessage: adminMessage || '',
    requestedAt: new Date().toISOString(),
    previousValidIdType: booking.validIdType || null,
    previousValidIdImage: booking.validIdImage || booking.validIdUrl || null,
  },
  updatedAt: new Date().toISOString(),
});

export const getRelatedBookingDocRefs = async (collectionName, booking) => {
  const refs = [doc(db, collectionName, booking.id)];

  if (booking.parentBookingId) {
    const siblingsSnap = await getDocs(
      query(
        collection(db, collectionName),
        where('parentBookingId', '==', booking.parentBookingId)
      )
    );
    siblingsSnap.docs.forEach((siblingDoc) => {
      const ref = doc(db, collectionName, siblingDoc.id);
      if (!refs.some((existing) => existing.path === ref.path)) {
        refs.push(ref);
      }
    });
  }

  return refs;
};

export const applyIdRequestToBookingDocs = async (collectionName, booking, adminMessage) => {
  const payload = buildIdRequestPayload(booking, adminMessage);
  const refs = await getRelatedBookingDocRefs(collectionName, booking);

  await Promise.all(
    refs.map((bookingRef) => updateDoc(bookingRef, payload))
  );
};

export const submitGuestValidIdResubmission = async ({
  collectionName,
  docId,
  parentBookingId,
  validIdType,
  validIdImage,
  existingIdRequest,
}) => {
  if (!validIdType || !validIdImage) {
    throw new Error('Valid ID type and image are required.');
  }

  if (existingIdRequest?.status === 'fulfilled') {
    throw new Error('A new valid ID has already been submitted for this request.');
  }

  const now = new Date().toISOString();
  const updatePayload = {
    validIdType,
    validIdImage,
    validIdUrl: validIdImage,
    idRequest: {
      ...(existingIdRequest || {}),
      status: 'fulfilled',
      fulfilledAt: now,
      resubmittedValidIdType: validIdType,
      resubmittedValidIdImage: validIdImage,
    },
    updatedAt: now,
  };

  const refs = [doc(db, collectionName, docId)];

  if (parentBookingId) {
    const siblingsSnap = await getDocs(
      query(
        collection(db, collectionName),
        where('parentBookingId', '==', parentBookingId)
      )
    );
    siblingsSnap.docs.forEach((siblingDoc) => {
      const ref = doc(db, collectionName, siblingDoc.id);
      if (!refs.some((existing) => existing.path === ref.path)) {
        refs.push(ref);
      }
    });
  }

  await Promise.all(refs.map((bookingRef) => updateDoc(bookingRef, updatePayload)));
};

export const mapDocToIdRequestNotification = (docSnap, bookingType) => {
  const data = docSnap.data();
  const idRequest = data.idRequest;
  if (!idRequest || idRequest.status !== 'pending') return null;

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
    idRequest,
    typeLabel: typeDisplay.label,
    title: getBookingTitle(pseudoBooking),
    checkIn: data.checkIn || null,
    checkOut: data.checkOut || null,
    selectedDate: data.selectedDate || null,
    requestedAt: idRequest.requestedAt,
  };
};

export const dedupeIdRequestNotifications = (notifications) => {
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
