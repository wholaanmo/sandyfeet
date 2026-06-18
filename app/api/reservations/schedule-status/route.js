import { firestore } from '@/lib/firebaseAdmin';
import { applyReservationScheduleStatusUpdates } from '@/lib/reservationScheduleStatusUpdate';
import { getServerNowMs } from '@/lib/philippineTimeServer';
import { getPhilippineDateParts } from '@/lib/philippineTime';

export async function POST() {
  try {
    if (!firestore) {
      return Response.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const result = await applyReservationScheduleStatusUpdates(firestore);

    return Response.json({
      ...result,
      philippine: getPhilippineDateParts(new Date(getServerNowMs())),
    });
  } catch (error) {
    console.error('Error updating reservation schedule statuses:', error);
    return Response.json({ error: 'Failed to update reservation statuses' }, { status: 500 });
  }
}
