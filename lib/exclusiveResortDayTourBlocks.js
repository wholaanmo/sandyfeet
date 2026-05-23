const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Nights occupied by a room stay: check-in date (inclusive) through day before check-out. */
export const getStayDateKeysFromBooking = (checkIn, checkOut) => {
  const start = toDateValue(checkIn);
  const end = toDateValue(checkOut);
  if (!start || !end) return [];

  const keys = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const checkoutDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor < checkoutDay) {
    keys.push(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
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
