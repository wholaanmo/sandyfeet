import { toDateValue } from '@/app/my-bookings/utils';

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
