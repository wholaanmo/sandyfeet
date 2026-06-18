/**
 * Server-side Philippine time helpers (no client clock sync).
 * Use in API routes and server-only code.
 */
import {
  getPhilippineDateParts,
  datePartsToKey,
  getPhilippineTodayDateKey,
  getPhilippineTodayStartMs,
  getPhilippineTodayEndMs,
  getPhilippineTodayRange,
  getPhilippineDateKeyFromInstant,
  isPhilippineDateKeyPast,
  isPhilippineCalendarDatePast,
  philippineWallTimeToMs,
} from '@/lib/philippineTime';

export const PHILIPPINE_TIMEZONE = 'Asia/Manila';

export const getServerNowMs = () => Date.now();

export const getServerPhilippineDateParts = (nowMs = getServerNowMs()) =>
  getPhilippineDateParts(new Date(nowMs));

export const getServerPhilippineTodayDateKey = (nowMs = getServerNowMs()) =>
  datePartsToKey(getServerPhilippineDateParts(nowMs));

export const getServerPhilippineNowIsoString = (nowMs = getServerNowMs()) =>
  new Date(nowMs).toISOString();

export const getServerPhilippineTodayRange = (nowMs = getServerNowMs()) =>
  getPhilippineTodayRange(nowMs);

export {
  getPhilippineTodayDateKey,
  getPhilippineTodayStartMs,
  getPhilippineTodayEndMs,
  getPhilippineTodayRange,
  getPhilippineDateKeyFromInstant,
  isPhilippineDateKeyPast,
  isPhilippineCalendarDatePast,
  philippineWallTimeToMs,
};
