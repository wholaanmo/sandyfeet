import { getPhilippineDateParts } from '@/lib/philippineTime';
import { getServerNowMs } from '@/lib/philippineTimeServer';

export async function GET() {
  const nowMs = getServerNowMs();
  return Response.json({
    timestamp: nowMs,
    timezone: 'Asia/Manila',
    philippine: getPhilippineDateParts(new Date(nowMs)),
  });
}
