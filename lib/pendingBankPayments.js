/**
 * Pending bank transfer payments for guest My Bookings.
 */

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

export const isPendingBankPaymentRequest = (bankRequest, bookings = []) => {
  if (bankRequest?.status !== 'completed') return false;
  if (!bankRequest?.providedBankDetails) return false;

  const related = bookings.filter((b) => bookingMatchesBankRequest(b, bankRequest));
  if (related.length === 0) {
    return false;
  }

  const stillPending = related.some((b) => b.status === 'pending');
  const anyProof = related.some((b) => hasUploadedPaymentProof(b));

  return stillPending && !anyProof;
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
  params.set('adults', '1');
  params.set('kids', '0');
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
