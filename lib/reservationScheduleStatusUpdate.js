/**
 * Server-side reservation schedule status transitions (Asia/Manila).
 * All status decisions use an explicit server-provided nowMs — never the client clock.
 */
import {
  getRoomBookingTargetStatus,
  getDayTourTargetStatus,
} from '@/lib/reservationScheduleStatus';
import { getServerNowMs, getServerPhilippineNowIsoString } from '@/lib/philippineTimeServer';

const ROOM_TRANSITION_STATUSES = new Set(['confirmed', 'check-in', 'check-out']);
const DAY_TOUR_TRANSITION_STATUSES = new Set(['confirmed', 'check-in']);

export const computeRoomBookingStatusUpdate = (booking, nowMs) => {
  if (!booking?.status || booking.type !== 'room') return null;
  if (!ROOM_TRANSITION_STATUSES.has(booking.status)) return null;

  const targetStatus = getRoomBookingTargetStatus(
    booking.status,
    booking.checkIn,
    booking.checkOut,
    nowMs
  );

  if (!targetStatus || targetStatus === booking.status) return null;
  return { status: targetStatus };
};

export const computeDayTourStatusUpdate = (tour, nowMs) => {
  if (!tour?.status) return null;
  if (!DAY_TOUR_TRANSITION_STATUSES.has(tour.status)) return null;

  const targetStatus = getDayTourTargetStatus(tour.status, tour.selectedDate, nowMs);
  if (!targetStatus || targetStatus === tour.status) return null;
  return { status: targetStatus };
};

/**
 * Apply schedule-driven status transitions using server Philippine time.
 * Returns counts of documents updated.
 */
export const applyReservationScheduleStatusUpdates = async (firestore) => {
  const nowMs = getServerNowMs();
  const updatedAt = getServerPhilippineNowIsoString(nowMs);

  const [roomSnap, dayTourSnap] = await Promise.all([
    firestore.collection('bookings').where('type', '==', 'room').get(),
    firestore.collection('dayTourBookings').get(),
  ]);

  let batch = firestore.batch();
  let batchOps = 0;
  let roomUpdates = 0;
  let dayTourUpdates = 0;

  const commitIfNeeded = async (force = false) => {
    if (batchOps === 0) return;
    if (!force && batchOps < 450) return;
    await batch.commit();
    batch = firestore.batch();
    batchOps = 0;
  };

  for (const docSnap of roomSnap.docs) {
    const data = docSnap.data();
    const update = computeRoomBookingStatusUpdate(data, nowMs);
    if (!update) continue;

    batch.update(docSnap.ref, { ...update, updatedAt });
    batchOps += 1;
    roomUpdates += 1;
    await commitIfNeeded();
  }

  for (const docSnap of dayTourSnap.docs) {
    const data = docSnap.data();
    const update = computeDayTourStatusUpdate(data, nowMs);
    if (!update) continue;

    batch.update(docSnap.ref, { ...update, updatedAt });
    batchOps += 1;
    dayTourUpdates += 1;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);

  return {
    nowMs,
    timezone: 'Asia/Manila',
    roomUpdates,
    dayTourUpdates,
    totalUpdates: roomUpdates + dayTourUpdates,
  };
};
