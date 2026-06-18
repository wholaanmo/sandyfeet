import {
  getPhilippineDateKeyFromInstant,
  iteratePhilippineDateKeysInRange,
  calendarDateToKey,
} from '@/lib/philippineTime';

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toLocalDateKey = (date) => {
  if (!date) return '';
  if (date instanceof Date) return calendarDateToKey(date);
  return getPhilippineDateKeyFromInstant(date);
};

/** Nights occupied by a room stay: check-in date (inclusive) through day before check-out. */
export const getStayDateKeysFromBooking = (checkIn, checkOut) => {
  const startKey = getPhilippineDateKeyFromInstant(checkIn);
  const endKey = getPhilippineDateKeyFromInstant(checkOut);
  if (!startKey || !endKey) return [];
  return iteratePhilippineDateKeysInRange(startKey, endKey);
};

const EXCLUSIVE_BLOCK_STATUSES = new Set(['pending', 'confirmed', 'check-in']);

export const buildExclusiveResortBlockedDateMap = (bookings = []) => {
  const blocked = {};
  for (const booking of bookings) {
    if (!booking?.isExclusiveResortBooking) continue;
    const status = String(booking.status || '').toLowerCase();
    if (!EXCLUSIVE_BLOCK_STATUSES.has(status)) continue;

    for (const dateKey of getStayDateKeysFromBooking(booking.checkIn, booking.checkOut)) {
      blocked[dateKey] = true;
    }
  }
  return blocked;
};

export const isDateBlockedByExclusiveResort = (targetDate, blockedDateMap = {}) => {
  const dateKey = toLocalDateKey(targetDate);
  return Boolean(blockedDateMap[dateKey]);
};
