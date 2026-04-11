'use client';

import { useRouter } from 'next/navigation';

const DEFAULT_AMENITIES = [
  'Air conditioning',
  'Pool access',
  'Wi‑Fi',
  'Parking on site',
];

function splitAmenities(list) {
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid), list.slice(mid)];
}

export default function LandingRoomCard({ room }) {
  const router = useRouter();
  const maxCap = room.capacity || room.capacityMax;
  const minCap = room.capacityMin;

  const capacityLabel =
    minCap && maxCap
      ? `${minCap}–${maxCap} guests`
      : maxCap
        ? `Up to ${maxCap} ${maxCap === 1 ? 'person' : 'persons'}`
        : 'See details for capacity';

  const rawAmenities =
    room.inclusions && room.inclusions.length > 0
      ? room.inclusions.slice(0, 8)
      : DEFAULT_AMENITIES;
  const [colA, colB] = splitAmenities(rawAmenities);

  const handleBook = () => {
    router.push(
      `/rooms/calendar?roomId=${room.id}&roomType=${encodeURIComponent(room.type || '')}&price=${room.price}&capacity=${maxCap || ''}&totalRooms=${room.totalRooms ?? ''}`
    );
  };

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-24px_rgba(21,84,106,0.18)]">
      <div className="bg-gradient-to-b from-[#15546A] to-[#2EA3C6] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold leading-snug text-white sm:text-xl">{room.type || 'Room'}</h3>
            <p className="mt-1 text-sm text-white/85">Check-in from 2:00 PM</p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-xs font-medium uppercase tracking-wide text-white/80">From</span>
            <span className="text-xl font-bold text-amber-300 sm:text-2xl">
              ₱{Number(room.price || 0).toLocaleString()}
            </span>
            <span className="block text-xs text-white/75">/ night</span>
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
        <p className="home-room-desc text-sm leading-relaxed text-slate-600">
          {room.description || 'Comfortable stay with resort amenities.'}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
          <ul className="space-y-2">
            {colA.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <i className="fas fa-check mt-0.5 text-ocean-mid" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-2">
            {colB.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <i className="fas fa-check mt-0.5 text-ocean-mid" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <i className="fas fa-user-friends text-ocean-mid" aria-hidden />
          <span>{capacityLabel}</span>
        </div>

        <button
          type="button"
          onClick={handleBook}
          className="mt-5 w-full rounded-xl bg-[#7DD3E8] py-3.5 text-center text-sm font-bold text-[#15546A] shadow-sm transition hover:bg-[#5ec9e0] hover:shadow-md"
        >
          Book {room.type || 'this room'}
        </button>
      </div>

      <style jsx>{`
        .home-room-desc {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </article>
  );
}
