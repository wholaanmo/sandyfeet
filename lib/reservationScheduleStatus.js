import { toDateValue } from '@/app/my-bookings/utils';
import {
  getPhilippineDateParts,
  philippineWallTimeToMs,
  syncPhilippineTime,
  fetchServerNowMs,
  getTrustedNowMs,
  getPhilippineNowIsoString,
  isPhilippineCalendarDatePast,
} from '@/lib/philippineTime';

export {
  syncPhilippineTime,
  fetchServerNowMs,
  getTrustedNowMs,
  getPhilippineNowIsoString,
  isPhilippineCalendarDatePast,
};

export const ROOM_CHECK_OUT_HOUR = 12;
export const ROOM_COMPLETED_HOUR = 13;
export const ROOM_CHECK_IN_HOUR = 14;

/** Revert checked-out room bookings to check-in when schedule dates change. */
export const getScheduleStatusUpdateOnEdit = (booking, checkInDt, checkOutDt) => {
  if (!booking || booking.status !== 'check-out') return {};
  const oldCheckOut = toDateValue(booking.checkOut);
  const oldCheckIn = toDateValue(booking.checkIn);
  if (!oldCheckOut || !checkOutDt) return {};

  const scheduleChanged =
    oldCheckOut.getTime() !== checkOutDt.getTime() ||
    (oldCheckIn && checkInDt && oldCheckIn.getTime() !== checkInDt.getTime());

  if (!scheduleChanged) return {};
  return { status: 'check-in' };
};

export const getPhilippineCalendarPartsFromValue = (value) => {
  const date = toDateValue(value);
  if (!date) return null;
  return getPhilippineDateParts(date);
};

export const getRoomBookingTargetStatus = (status, checkIn, checkOut, nowMs = getTrustedNowMs()) => {
  if (!nowMs) return null;
  if (!status || ['pending', 'cancelled', 'cancelled-by-guest', 'completed'].includes(status)) {
    return null;
  }

  const checkOutParts = getPhilippineCalendarPartsFromValue(checkOut);
  if (!checkOutParts) return null;

  const checkOutTimeMs = philippineWallTimeToMs({
    ...checkOutParts,
    hour: ROOM_CHECK_OUT_HOUR,
    minute: 0,
    second: 0,
  });
  const completedTimeMs = philippineWallTimeToMs({
    ...checkOutParts,
    hour: ROOM_COMPLETED_HOUR,
    minute: 0,
    second: 0,
  });

  if (nowMs >= completedTimeMs) return 'completed';
  if (nowMs >= checkOutTimeMs && nowMs < completedTimeMs) return 'check-out';
  if (nowMs < checkOutTimeMs && status === 'check-out') return 'check-in';
  return null;
};

export const getDayTourTargetStatus = (status, selectedDate, nowMs = getTrustedNowMs()) => {
  if (!nowMs) return null;
  if (!status || ['pending', 'cancelled', 'cancelled-by-guest', 'completed'].includes(status)) {
    return null;
  }

  const dateKey = String(selectedDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const dayEndMs = philippineWallTimeToMs({
    year,
    month,
    day,
    hour: 23,
    minute: 59,
    second: 59,
  });

  if (nowMs > dayEndMs) return 'completed';
  return null;
};

export const isWithinOneHourBeforePhilippineCheckIn = (checkIn, nowMs = getTrustedNowMs()) => {
  if (!nowMs) return false;
  const checkInParts = getPhilippineCalendarPartsFromValue(checkIn);
  if (!checkInParts) return false;

  const checkInMs = philippineWallTimeToMs({
    ...checkInParts,
    hour: ROOM_CHECK_IN_HOUR,
    minute: 0,
    second: 0,
  });
  const oneHourBeforeMs = checkInMs - 60 * 60 * 1000;
  return nowMs >= oneHourBeforeMs && nowMs < checkInMs;
};

export const getRoomScheduleSource = (booking) => {
  if (!booking) return null;

  if (booking.isMultiRoomGroup && booking.originalChildBookings?.length) {
    const firstChild = booking.originalChildBookings[0];
    return {
      status: booking.status,
      checkIn: firstChild.checkIn,
      checkOut: firstChild.checkOut,
      childBookings: booking.originalChildBookings,
    };
  }

  if (booking.isMultiRoom && booking.children?.length) {
    const firstChild = booking.children[0];
    return {
      status: booking.status,
      checkIn: firstChild.checkIn,
      checkOut: firstChild.checkOut,
      childBookings: booking.children,
    };
  }

  return {
    status: booking.status,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    childBookings: null,
  };
};
