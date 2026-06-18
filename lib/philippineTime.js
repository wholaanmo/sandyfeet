const PH_TIMEZONE = 'Asia/Manila';
const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const SYNC_TTL_MS = 30_000;
const MS_PER_DAY = 86400000;

export const BOOKING_LEAD_DAYS = 2;

let anchorServerMs = 0;
let anchorPerfMs = 0;
let lastSyncPerfMs = 0;
let syncPromise = null;

const perfNow = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export const getPhilippineDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PH_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
};

export const philippineWallTimeToMs = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) => Date.UTC(year, month - 1, day, hour, minute, second) - MANILA_UTC_OFFSET_MS;

export const datePartsToKey = ({ year, month, day }) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const parseDateKeyToParts = (dateKey) => {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
};

export const addDaysToPhilippineParts = (parts, days) => {
  const anchorMs = philippineWallTimeToMs({ ...parts, hour: 12, minute: 0, second: 0 });
  const next = getPhilippineDateParts(new Date(anchorMs + days * MS_PER_DAY));
  return { year: next.year, month: next.month, day: next.day };
};

/** Calendar grid dates use local Y/M/D as the intended calendar day. */
export const calendarDateToKey = (date) => {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return datePartsToKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
};

export const isPhilippineTimeSynced = () => anchorServerMs > 0;

export const getPhilippineTodayDateKey = (nowMs = getTrustedNowMs()) =>
  datePartsToKey(getPhilippineDateParts(new Date(nowMs)));

export const getPhilippineMinBookableDateKey = (
  leadDays = BOOKING_LEAD_DAYS,
  nowMs = getTrustedNowMs()
) => datePartsToKey(addDaysToPhilippineParts(getPhilippineDateParts(new Date(nowMs)), leadDays));

export const getPhilippineTodayStartMs = (nowMs = getTrustedNowMs()) => {
  const parts = getPhilippineDateParts(new Date(nowMs));
  return philippineWallTimeToMs({ ...parts, hour: 0, minute: 0, second: 0 });
};

export const getPhilippineTodayEndMs = (nowMs = getTrustedNowMs()) => {
  const parts = getPhilippineDateParts(new Date(nowMs));
  return philippineWallTimeToMs({ ...parts, hour: 23, minute: 59, second: 999 });
};

export const getPhilippineDateKeyFromInstant = (value, nowMs = getTrustedNowMs()) => {
  if (!value) return '';
  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else if (value && typeof value === 'object' && value.seconds) {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  } else {
    date = new Date(value);
  }
  if (!date || Number.isNaN(date.getTime())) return '';
  return datePartsToKey(getPhilippineDateParts(date));
};

export const isPhilippineDateKeyPast = (dateKey, nowMs = getTrustedNowMs()) =>
  Boolean(dateKey) && dateKey < getPhilippineTodayDateKey(nowMs);

export const isPhilippineDateKeyTooSoon = (
  dateKey,
  leadDays = BOOKING_LEAD_DAYS,
  nowMs = getTrustedNowMs()
) => {
  const todayKey = getPhilippineTodayDateKey(nowMs);
  const minKey = getPhilippineMinBookableDateKey(leadDays, nowMs);
  return dateKey >= todayKey && dateKey < minKey;
};

export const isPhilippineCalendarDatePast = (date, nowMs = getTrustedNowMs()) =>
  isPhilippineDateKeyPast(calendarDateToKey(date), nowMs);

export const isPhilippineCalendarDateTooSoon = (
  date,
  leadDays = BOOKING_LEAD_DAYS,
  nowMs = getTrustedNowMs()
) => isPhilippineDateKeyTooSoon(calendarDateToKey(date), leadDays, nowMs);

export const isPhilippineCalendarDateBeforeLeadTime = (
  date,
  leadDays = BOOKING_LEAD_DAYS,
  nowMs = getTrustedNowMs()
) => {
  const dateKey = calendarDateToKey(date);
  return !dateKey || dateKey < getPhilippineMinBookableDateKey(leadDays, nowMs);
};

export const isPhilippineTomorrow = (date, nowMs = getTrustedNowMs()) => {
  const tomorrowKey = datePartsToKey(
    addDaysToPhilippineParts(getPhilippineDateParts(new Date(nowMs)), 1)
  );
  return calendarDateToKey(date) === tomorrowKey;
};

export const isTimestampWithinPhilippineToday = (value, nowMs = getTrustedNowMs()) => {
  if (!value) return false;
  let ms = 0;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value?.toDate === 'function') {
    ms = value.toDate().getTime();
  } else if (value && typeof value === 'object' && value.seconds) {
    ms = value.seconds * 1000;
  } else {
    ms = new Date(value).getTime();
  }
  if (Number.isNaN(ms)) return false;
  return ms >= getPhilippineTodayStartMs(nowMs) && ms <= getPhilippineTodayEndMs(nowMs);
};

export const getPhilippineNowIsoString = (nowMs = getTrustedNowMs()) =>
  new Date(nowMs).toISOString();

export const iteratePhilippineDateKeysInRange = (startKey, endKey) => {
  const keys = [];
  let parts = parseDateKeyToParts(startKey);
  if (!parts || !endKey || endKey <= startKey) return keys;

  while (datePartsToKey(parts) < endKey) {
    keys.push(datePartsToKey(parts));
    parts = addDaysToPhilippineParts(parts, 1);
  }
  return keys;
};

const applyServerTimestamp = (timestamp) => {
  anchorServerMs = Number(timestamp);
  anchorPerfMs = perfNow();
  lastSyncPerfMs = perfNow();
};

/** Fetch server Philippine time and refresh the monotonic client anchor. */
export const fetchServerNowMs = async () => {
  const response = await fetch('/api/philippine-time');
  if (!response.ok) throw new Error('Failed to fetch Philippine time');
  const { timestamp } = await response.json();
  applyServerTimestamp(timestamp);
  return anchorServerMs;
};

export const syncPhilippineTime = async ({ force = false } = {}) => {
  if (typeof window === 'undefined') return;

  const elapsed = perfNow() - lastSyncPerfMs;
  if (!force && syncPromise && anchorServerMs && elapsed >= 0 && elapsed < SYNC_TTL_MS) {
    return syncPromise;
  }

  syncPromise = fetch('/api/philippine-time')
    .then((response) => {
      if (!response.ok) throw new Error('Failed to sync Philippine time');
      return response.json();
    })
    .then(({ timestamp }) => {
      applyServerTimestamp(timestamp);
    })
    .catch(() => {
      // Keep the previous anchor when sync fails.
    });

  return syncPromise;
};

/**
 * Trusted "now" anchored to the last server sync plus monotonic elapsed time.
 * Immune to device clock / timezone changes after sync.
 */
export const getTrustedNowMs = () => {
  if (!anchorServerMs) return 0;
  return anchorServerMs + (perfNow() - anchorPerfMs);
};

export const getPhilippineNow = (nowMs = getTrustedNowMs()) => new Date(nowMs);

export const getPhilippineTodayRange = (nowMs = getTrustedNowMs()) => ({
  startMs: getPhilippineTodayStartMs(nowMs),
  endMs: getPhilippineTodayEndMs(nowMs),
  dateKey: getPhilippineTodayDateKey(nowMs),
});
