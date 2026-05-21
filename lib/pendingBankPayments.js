// lib/pendingBankPayments.js

import { toDateValue } from '@/app/my-bookings/utils';

export const CONFIRMED_BOOKING_STATUSES = ['confirmed', 'check-in', 'check-out', 'completed'];

export const hasUploadedPaymentProof = (booking = {}) =>
  Boolean(
    booking.paymentProof ||
      booking.paymentProofUrl ||
      booking.paymentProofImage
  );

export const bookingMatchesBankRequest = (booking, bankRequest) => {
  const requestBookingId = String(bankRequest?.bookingId || '').trim();
  if (!requestBookingId) return false;

  const bookingId = String(booking.bookingId || booking.id || '').trim();
  const parentId = String(booking.parentBookingId || '').trim();

  return (
    bookingId === requestBookingId ||
    parentId === requestBookingId ||
    String(booking.id || '') === requestBookingId
  );
};

export const getRelatedBookings = (bankRequest, bookings = []) =>
  bookings.filter((b) => bookingMatchesBankRequest(b, bankRequest));

export const isBookingConfirmedForBankRequest = (bankRequest, bookings = []) => {
  const related = getRelatedBookings(bankRequest, bookings);
  return related.some((b) => CONFIRMED_BOOKING_STATUSES.includes(b.status));
};

/**
 * Show in Pending Payment when admin provided bank details and checkout is not yet confirmed.
 * Includes guests who left before submitting (no Firestore booking yet).
 */
export const isPendingBankPaymentRequest = (bankRequest, bookings = []) => {
  if (bankRequest?.status !== 'completed') return false;
  if (!bankRequest?.providedBankDetails) return false;

  if (isBookingConfirmedForBankRequest(bankRequest, bookings)) {
    return false;
  }

  const related = getRelatedBookings(bankRequest, bookings);
  if (related.length === 0) {
    return true;
  }

  return related.some((b) => b.status === 'pending');
};

const formatFirestoreDate = (value) => {
  const date = toDateValue(value);
  if (!date) return null;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const getPendingPaymentTypeLabel = (bankRequest) => {
  const isDayTour =
    bankRequest?.bookingType === 'daytour' ||
    bankRequest?.requestType === 'daytour' ||
    Boolean(bankRequest?.selectedDate);

  if (isDayTour) return 'Day Tour';
  if (bankRequest?.isExclusiveResortBooking) return 'Entire Resort';
  if (bankRequest?.isMultiRoom) return 'Multi-Room Types';
  return bankRequest?.roomType || 'Room';
};

export const getPendingPaymentBookingDetails = (bankRequest, bookings = []) => {
  const related = getRelatedBookings(bankRequest, bookings);
  const primary = related[0];
  const isDayTour =
    bankRequest?.bookingType === 'daytour' ||
    bankRequest?.requestType === 'daytour' ||
    Boolean(bankRequest?.selectedDate);

  const details = [
    { label: 'Booking type', value: getPendingPaymentTypeLabel(bankRequest) },
    { label: 'Reference ID', value: bankRequest?.bookingId || '—' },
  ];

  if (isDayTour) {
    const tourDate =
      formatFirestoreDate(primary?.selectedDate) ||
      formatFirestoreDate(bankRequest?.selectedDate) ||
      bankRequest?.selectedDate ||
      '—';
    details.push({ label: 'Tour date', value: tourDate });
    if (bankRequest?.totalAmount != null) {
      details.push({
        label: 'Total amount',
        value: `₱${Number(bankRequest.totalAmount).toLocaleString()}`,
      });
    }
  } else {
    const checkIn =
      formatFirestoreDate(primary?.checkIn) ||
      formatFirestoreDate(bankRequest?.checkIn) ||
      '—';
    const checkOut =
      formatFirestoreDate(primary?.checkOut) ||
      formatFirestoreDate(bankRequest?.checkOut) ||
      '—';
    details.push({ label: 'Check-in', value: checkIn });
    details.push({ label: 'Check-out', value: checkOut });
    if (bankRequest?.numberOfRooms) {
      details.push({ label: 'Rooms', value: String(bankRequest.numberOfRooms) });
    }
    if (bankRequest?.nights) {
      details.push({ label: 'Nights', value: String(bankRequest.nights) });
    }
  }

  details.push({
    label: 'Down payment due',
    value: `₱${Number(bankRequest?.downPayment || bankRequest?.downPaymentRequired || bankRequest?.totalPrice || bankRequest?.totalAmount || 0).toLocaleString()}`,
  });

  if (bankRequest?.specialRequest) {
    details.push({ label: 'Special request', value: bankRequest.specialRequest });
  }

  return details;
};

export const getRoomBookingResumePath = (bankRequest) => {
  const params = new URLSearchParams();
  if (bankRequest?.id) params.set('bankRequestId', bankRequest.id);
  if (bankRequest?.bookingId) params.set('bookingId', bankRequest.bookingId);
  const query = params.toString();
  return query ? `/rooms/multi-room-booking?${query}` : '/rooms/multi-room-booking';
};

export const getDayTourBookingResumePath = (bankRequest) => {
  const date = bankRequest?.selectedDate || '';
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (bankRequest?.id) params.set('bankRequestId', bankRequest.id);
  if (bankRequest?.bookingId) params.set('bookingId', bankRequest.bookingId);
  if (bankRequest?.pendingBookingDraft?.adults != null) {
    params.set('adults', String(bankRequest.pendingBookingDraft.adults));
  } else {
    params.set('adults', '1');
  }
  if (bankRequest?.pendingBookingDraft?.kids != null) {
    params.set('kids', String(bankRequest.pendingBookingDraft.kids));
  } else {
    params.set('kids', '0');
  }
  const query = params.toString();
  return query ? `/day-tour/booking?${query}` : '/day-tour/booking';
};

export const getBookingResumePath = (bankRequest) => {
  const isDayTour =
    bankRequest?.bookingType === 'daytour' ||
    bankRequest?.requestType === 'daytour' ||
    Boolean(bankRequest?.selectedDate);
  return isDayTour
    ? getDayTourBookingResumePath(bankRequest)
    : getRoomBookingResumePath(bankRequest);
};
