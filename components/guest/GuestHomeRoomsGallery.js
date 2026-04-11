'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import LandingRoomCard from './LandingRoomCard';
import SandyFeetLogoMark from './SandyFeetLogoMark';

/** Decorative floating props (no links) — matches mock placement */
const DECOR = [
  { file: 'Coconut tree.png', delay: '0s', className: 'left-[-4%] top-[6%] hidden w-28 md:block lg:left-[-2%] lg:w-36 xl:w-40' },
  { file: 'ATV.png', delay: '0.4s', className: 'right-[-6%] top-[4%] hidden w-32 md:block lg:right-[-2%] lg:w-40' },
  { file: 'Floters.png', delay: '0.8s', className: 'left-[-8%] top-[42%] hidden w-24 lg:block lg:left-0 xl:w-28' },
  { file: 'Sand Castle.png', delay: '0.2s', className: 'right-[-4%] top-[38%] hidden w-28 lg:block lg:right-0 xl:w-32' },
  { file: 'Shell.png', delay: '1s', className: 'right-[-2%] top-[62%] hidden w-20 md:block lg:w-24' },
  { file: 'Sadals.png', delay: '0.5s', className: 'right-[-6%] bottom-[8%] hidden w-24 lg:block xl:w-28' },
  { file: 'Beach ball.png', delay: '0.6s', className: 'left-[-4%] bottom-[12%] hidden w-24 lg:block xl:w-28' },
];

const GALLERY_ITEMS = [
  {
    src: '/assets/Room%202%20ground%20floor.jpg',
    alt: 'Resort cabin and porch',
    gridClass:
      'min-h-[280px] sm:min-h-[320px] lg:col-span-5 lg:row-span-2 lg:col-start-1 lg:row-start-1 lg:min-h-[min(520px,55vh)]',
    sizes: '(max-width: 1024px) 100vw, 38vw',
  },
  {
    src: '/assets/Pool.jpg',
    alt: 'Pool and main building',
    gridClass:
      'min-h-[200px] sm:min-h-[220px] lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:min-h-[240px]',
    sizes: '(max-width: 1024px) 100vw, 58vw',
  },
  {
    src: '/assets/Second%20floor%203.jpg',
    alt: 'Resort interior and views',
    gridClass:
      'min-h-[200px] sm:min-h-[220px] lg:col-span-7 lg:col-start-6 lg:row-start-2 lg:min-h-[240px]',
    sizes: '(max-width: 1024px) 100vw, 58vw',
  },
  {
    src: '/assets/pool%20side.jpg',
    alt: 'Poolside and grounds',
    gridClass:
      'min-h-[220px] sm:min-h-[260px] lg:col-span-12 lg:col-start-1 lg:row-start-3',
    sizes: '100vw',
    overlayLogo: true,
  },
];

function FloatingDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-visible" aria-hidden>
      {DECOR.map((d) => (
        <div
          key={d.file}
          className={`guest-float absolute opacity-[0.97] drop-shadow-[0_14px_28px_rgba(0,0,0,0.14)] ${d.className}`}
          style={{ animationDelay: d.delay }}
        >
          <Image
            src={`/assets/Icon/${encodeURIComponent(d.file)}`}
            alt=""
            width={160}
            height={160}
            className="h-auto w-full max-w-[10rem] object-contain lg:max-w-[11rem] xl:max-w-[12rem]"
          />
        </div>
      ))}
    </div>
  );
}

export default function GuestHomeRoomsGallery() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.availability === 'available') {
            list.push({ id: docSnap.id, ...data });
          }
        });
        setRooms(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [mounted]);

  return (
    <div className="relative overflow-x-hidden bg-white">
      <FloatingDecor />

      {/* Our Rooms */}
      <section className="relative z-[10] mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
        <header className="mb-10 text-center sm:mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-[#15546A] sm:text-4xl md:text-[2.25rem]">
            Our Rooms &amp; Accommodations
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-ocean-mid sm:text-lg">
            Experience comfort by the coast—perfect for families, couples, and groups.
          </p>
        </header>

        {loading && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[420px] animate-pulse rounded-2xl bg-gradient-to-b from-slate-100 to-slate-50"
              />
            ))}
          </div>
        )}

        {!loading && rooms.length === 0 && (
          <p className="rounded-2xl border border-dashed border-ocean-light/40 bg-ocean-ice/40 py-12 text-center text-slate-600">
            No rooms are listed right now.{' '}
            <Link href="/rooms" className="font-semibold text-ocean-deep underline-offset-2 hover:underline">
              View the rooms page
            </Link>{' '}
            for updates.
          </p>
        )}

        {!loading && rooms.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <LandingRoomCard key={room.id} room={room} />
            ))}
          </div>
        )}

        {!loading && rooms.length > 0 && (
          <p className="mt-8 text-center">
            <Link
              href="/rooms"
              className="inline-flex items-center gap-2 text-sm font-semibold text-ocean-deep hover:text-ocean-mid"
            >
              See full details &amp; filters
              <i className="fas fa-arrow-right text-xs" aria-hidden />
            </Link>
          </p>
        )}
      </section>

      {/* Gallery */}
      <section className="relative z-[10] border-t border-slate-100 bg-white px-4 py-14 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
        <div className="relative mx-auto max-w-6xl">
          <header className="relative z-[10] mb-10 text-center sm:mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-[#15546A] sm:text-4xl md:text-[2.25rem]">
              Glimpse of Paradise
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
              Take a look at what awaits you at Sandy Feet Camp &amp; Resort Site.
            </p>
          </header>

          <div className="relative z-[10] grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-5">
            {GALLERY_ITEMS.map((item, index) => (
              <div
                key={item.src}
                className={`relative overflow-hidden rounded-[14px] bg-slate-200 shadow-[0_8px_30px_-12px_rgba(21,84,106,0.2)] ${item.gridClass}`}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  className="object-cover"
                  sizes={item.sizes}
                  priority={index === 0}
                />
                {item.overlayLogo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-slate-900/35 via-transparent to-transparent">
                    <SandyFeetLogoMark
                      className="h-24 w-24 shadow-xl sm:h-28 sm:w-28"
                      ringClassName="ring-[3px] ring-white/90 shadow-lg"
                      sizes="112px"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
