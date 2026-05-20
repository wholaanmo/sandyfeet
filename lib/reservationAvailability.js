/**
 * Shared availability aggregation aligned with admin reservation booking data.
 */

export const CANCELLED_BOOKING_STATUSES = ['cancelled', 'cancelled-by-guest'];

/** Statuses that block room/day-tour capacity (matches guest booking flows). */
export const ACTIVE_OCCUPANCY_STATUSES = ['pending', 'confirmed', 'check-in'];

export const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseBookingDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value && typeof value === 'object' && value.seconds) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isCancelledBooking = (status) =>
  CANCELLED_BOOKING_STATUSES.includes(String(status || '').trim());

export const occupiesCapacity = (status) => {
  const normalized = String(status || '').trim();
  if (isCancelledBooking(normalized)) return false;
  if (normalized === 'completed') return false;
  return ACTIVE_OCCUPANCY_STATUSES.includes(normalized) || normalized === 'check-out';
};

/**
 * Build per-date room booked units and exclusive resort tent usage from raw booking docs.
 */
export const aggregateRoomAvailabilityFromBookings = (bookingDocs = []) => {
  const bookedUnits = {};
  const exclusiveByDate = {};

  bookingDocs.forEach((booking) => {
    if (!occupiesCapacity(booking.status)) return;
    if (!booking.checkIn || !booking.checkOut) return;

    const checkIn = parseBookingDate(booking.checkIn);
    const checkOut = parseBookingDate(booking.checkOut);
    const roomId = booking.roomId;
    if (!checkIn || !checkOut || checkOut <= checkIn || !roomId) return;

    const numberOfRooms = Math.max(1, Number(booking.numberOfRooms) || 1);
    const tentCount = Math.max(0, Number(booking.tentCount) || 0);

    let current = new Date(checkIn);
    current.setHours(0, 0, 0, 0);
    const end = new Date(checkOut);
    end.setHours(0, 0, 0, 0);

    while (current < end) {
      const dateKey = toLocalDateKey(current);

      if (booking.isExclusiveResortBooking) {
        if (!exclusiveByDate[dateKey]) {
          exclusiveByDate[dateKey] = { tentCount: 0 };
        }
        exclusiveByDate[dateKey].tentCount += tentCount;
      } else {
        if (!bookedUnits[dateKey]) bookedUnits[dateKey] = {};
        bookedUnits[dateKey][roomId] = (bookedUnits[dateKey][roomId] || 0) + numberOfRooms;
      }

      current.setDate(current.getDate() + 1);
    }
  });

  return { bookedUnits, exclusiveByDate };
};

export const normalizeDayTourDateKey = (selectedDate) => {
  if (!selectedDate) return '';
  if (typeof selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return selectedDate;
  }
  const parsed = parseBookingDate(selectedDate);
  return parsed ? toLocalDateKey(parsed) : String(selectedDate);
};

/**
 * Sum guest counts per day-tour date from booking docs.
 */
export const aggregateDayTourGuestsFromBookings = (bookingDocs = []) => {
  const booked = {};

  bookingDocs.forEach((booking) => {
    if (!occupiesCapacity(booking.status)) return;

    const dateKey = normalizeDayTourDateKey(booking.selectedDate);
    if (!dateKey) return;

    const totalGuests =
      (Number(booking.adults) || 0) +
      (Number(booking.kids) || 0) +
      (Number(booking.seniors) || 0) ||
      Number(booking.totalGuests) ||
      Number(booking.guests) ||
      0;

    booked[dateKey] = (booked[dateKey] || 0) + totalGuests;
  });

  return booked;
};
