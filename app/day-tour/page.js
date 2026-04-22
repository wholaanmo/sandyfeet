// app/day-tour/page.js
'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '../guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import ActivityCard from '@/components/guest/ActivityCard';

const panelClass =
  'rounded-3xl border border-ocean-light/20 bg-white p-4 shadow-[0_12px_28px_rgb(0,0,0,0.08)] sm:p-5';

// Local assets used as social-gallery images.
const socialGalleryImages = [
  '/assets/View/Front view.jpg',
  '/assets/View/Second floor view.jpg',
  '/assets/View/IMG3.jpg',
  '/assets/View/SideBuilding.jpg',
  '/assets/Facilities/Pool.jpg',
  '/assets/Facilities/Pool 2.jpg',
  '/assets/Facilities/TopPoolView.jpg',
  '/assets/Facilities/Bonfire.jpg',
  '/assets/Facilities/ATV.jpg',
  '/assets/Facilities/Atv activities.jpg',
  '/assets/Facilities/DragonBoat.jpg',
  '/assets/Facilities/GragonBoat2.jpg',
  '/assets/Facilities/Kitchen.jpg',
  '/assets/Facilities/Kitchen-Ihawan.jpg',
  '/assets/Tent/Tents.jpg',
  '/assets/GroundFloor/Ground floor room.jpg',
  '/assets/GroupRoom/GroupRoom1.2.jpg',
  '/assets/sandyfeet.png'
];

function formatPeso(value) {
  if (value === null || value === undefined) {
    return 'TBA';
  }

  return `PHP ${Number(value).toLocaleString()}`;
}

function getLowestRate(tour) {
  if (!tour) {
    return null;
  }

  const prices = [tour.adultPrice, tour.kidPrice, tour.seniorPrice].filter(
    (value) => typeof value === 'number' && !Number.isNaN(value)
  );

  if (prices.length === 0) {
    return null;
  }

  return Math.min(...prices);
}

export default function DayTourPage() {
  const [dayTours, setDayTours] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loadingTours, setLoadingTours] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(true);

  const featuredTour = dayTours.find((tour) => tour.availability === 'available') || dayTours[0] || null;
  const lowestRate = getLowestRate(featuredTour);

  useEffect(() => {
    const toursRef = collection(db, 'dayTours');
    const toursQuery = query(toursRef, where('archived', '!=', true), orderBy('createdAt', 'desc'));

    const unsubscribeTours = onSnapshot(
      toursQuery,
      (querySnapshot) => {
        const toursList = [];

        querySnapshot.forEach((docSnap) => {
          toursList.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });

        setDayTours(toursList);
        setLoadingTours(false);
      },
      (error) => {
        console.error('Error fetching day tours:', error);
        setLoadingTours(false);
      }
    );

    return () => unsubscribeTours();
  }, []);

  useEffect(() => {
    const activitiesRef = collection(db, 'activities');
    const activitiesQuery = query(
      activitiesRef,
      where('archived', '!=', true),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeActivities = onSnapshot(
      activitiesQuery,
      (querySnapshot) => {
        const activitiesList = [];

        querySnapshot.forEach((docSnap) => {
          activitiesList.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });

        setActivities(activitiesList);
        setLoadingActivities(false);
      },
      (error) => {
        console.error('Error fetching activities:', error);
        setLoadingActivities(false);
      }
    );

    return () => unsubscribeActivities();
  }, []);

  const router = useRouter();
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(1);

  const handleBookingStart = (e) => {
    e.preventDefault();
    if (date) {
      router.push(`/day-tour/calendar?date=${date}&guests=${guests}`);
    } else {
      router.push(`/day-tour/calendar`);
    }
  };

  const filteredActivities = activities.filter(
    (activity) => !activity.name?.toLowerCase().includes('jet ski')
  );

  const poolImages = [
    '/assets/Facilities/Pool.jpg',
    '/assets/Facilities/Pool 2.jpg',
    '/assets/Facilities/TopPoolView.jpg'
  ];

  const facilitiesImages = [
    '/assets/Facilities/Bonfire.jpg',
    '/assets/Facilities/ATV.jpg',
    '/assets/Facilities/Atv activities.jpg',
    '/assets/Facilities/DragonBoat.jpg',
    '/assets/Facilities/GragonBoat2.jpg',
    '/assets/Facilities/Kitchen.jpg'
  ];

  const heroImage = '/assets/View/Front view.jpg';

  if (loadingTours && loadingActivities && dayTours.length === 0 && activities.length === 0) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-b from-ocean-ice/60 via-white to-ocean-ice/20 px-4 pt-28 pb-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="h-44 animate-pulse rounded-3xl border border-ocean-light/20 bg-white" />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
              <div className="space-y-3">
                {[1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-52 animate-pulse rounded-3xl border border-ocean-light/20 bg-white"
                  />
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-96 animate-pulse rounded-3xl border border-ocean-light/20 bg-white" />
                <div className="h-48 animate-pulse rounded-3xl border border-ocean-light/20 bg-white" />
              </div>
            </div>
          </div>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="min-h-screen bg-gradient-to-b from-ocean-ice/60 via-white to-ocean-ice/20 px-4 pt-28 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-12 pb-14">
          
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Top Left: Day Tour Info & Booking */}
            <div className="flex flex-col justify-center space-y-8">
              <div className="relative overflow-hidden rounded-3xl border border-ocean-light/20 bg-white p-6 shadow-lg sm:p-10">
                <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-ocean-pale/30 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 right-0 h-72 w-72 rounded-full bg-ocean-light/20 blur-3xl pointer-events-none" />

                <div className="relative z-10">
                  <p className="inline-flex items-center gap-2 rounded-full bg-ocean-ice px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ocean-mid">
                    <i className="fas fa-sun"></i>
                    Sandyfeet Day Tour
                  </p>
                  <h1 className="mt-4 font-playfair text-4xl font-bold leading-tight text-textPrimary md:text-5xl">
                    Day Tour
                  </h1>
                  
                  <div className="mt-8 flex gap-4 xl:gap-6">
                    <div className="flex flex-col gap-1">
                      <p className="text-xl font-bold text-ocean-mid">{lowestRate ? formatPeso(lowestRate) : 'TBA'}</p>
                      <p className="text-xs uppercase tracking-wider text-textSecondary font-medium">Starts At</p>
                    </div>
                  </div>

                  <form onSubmit={handleBookingStart} className="mt-8 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="mx-auto max-w-7xl space-y-12 pb-14">
                          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:items-start">
                            <section className="relative overflow-hidden rounded-[32px] border border-ocean-light/20 bg-white shadow-[0_18px_40px_rgb(0,0,0,0.08)]">
                              <div className="absolute inset-0 bg-gradient-to-br from-ocean-pale/30 via-transparent to-ocean-light/15" />
                              <div className="relative z-10 grid gap-6 p-6 md:grid-cols-[220px_1fr] md:p-8">
                                <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-ocean-ice shadow-[0_14px_28px_rgb(0,0,0,0.12)]">
                                  <Image
                                    src={heroImage}
                                    alt="Sandyfeet day tour"
                                    fill
                                    priority
                                    sizes="(max-width: 768px) 100vw, 220px"
                                    className="object-cover"
                                  />
                                </div>

                                <div className="flex flex-col justify-center">
                                  <p className="inline-flex w-fit items-center gap-2 rounded-full bg-ocean-ice px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ocean-mid">
                                    <i className="fas fa-sun"></i>
                                    Sandyfeet Day Tour
                                  </p>
                                  <h1 className="mt-4 font-playfair text-4xl font-bold leading-tight text-textPrimary sm:text-5xl">
                                    Day Tour
                                  </h1>
                                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-textSecondary sm:text-base">
                                    Tell us your date and number of guests first, then browse the activities below.
                                  </p>

                                  <div className="mt-6 flex flex-wrap gap-3 text-sm text-textSecondary">
                                    <span className="rounded-full bg-ocean-ice/70 px-3 py-1.5 font-medium text-ocean-mid">
                                      {filteredActivities.length} activities
                                    </span>
                                    <span className="rounded-full bg-ocean-ice/70 px-3 py-1.5 font-medium text-ocean-mid">
                                      {dayTours.length} tours
                                    </span>
                                    <span className="rounded-full bg-ocean-ice/70 px-3 py-1.5 font-medium text-ocean-mid">
                                      Starts at {lowestRate ? formatPeso(lowestRate) : 'TBA'}
                                    </span>
                                  </div>

                                  <form onSubmit={handleBookingStart} className="mt-7 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                                    <div>
                                      <label className="mb-1.5 block text-sm font-medium text-textSecondary" htmlFor="tour-date">
                                        Date
                                      </label>
                                      <div className="relative">
                                        <i className="fas fa-calendar absolute left-3.5 top-1/2 -translate-y-1/2 text-ocean-mid" />
                                        <input
                                          type="date"
                                          id="tour-date"
                                          value={date}
                                          onChange={(e) => setDate(e.target.value)}
                                          min={new Date().toISOString().split('T')[0]}
                                          className="w-full rounded-2xl border border-ocean-light/30 bg-white pl-10 pr-4 py-3 text-sm shadow-sm outline-none transition focus:border-ocean-mid focus:ring-1 focus:ring-ocean-mid"
                                          required
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <label className="mb-1.5 block text-sm font-medium text-textSecondary" htmlFor="guest-count">
                                        Guests
                                      </label>
                                      <div className="relative">
                                        <i className="fas fa-user-friends absolute left-3.5 top-1/2 -translate-y-1/2 text-ocean-mid" />
                                        <input
                                          type="number"
                                          id="guest-count"
                                          value={guests}
                                          onChange={(e) => setGuests(Math.max(1, parseInt(e.target.value) || 1))}
                                          min="1"
                                          max="50"
                                          className="w-full rounded-2xl border border-ocean-light/30 bg-white pl-10 pr-4 py-3 text-sm shadow-sm outline-none transition focus:border-ocean-mid focus:ring-1 focus:ring-ocean-mid"
                                        />
                                      </div>
                                    </div>

                                    <button
                                      type="submit"
                                      className="mt-auto inline-flex h-[52px] items-center justify-center rounded-2xl bg-gradient-to-r from-ocean-mid to-ocean-light px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgb(33,105,243,0.28)] transition hover:brightness-105"
                                    >
                                      Book Now
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </section>

                            <aside className="space-y-4">
                              <div className="rounded-[28px] border border-ocean-light/20 bg-white px-5 py-5 shadow-[0_12px_28px_rgb(0,0,0,0.08)]">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <h2 className="font-playfair text-3xl font-bold text-textPrimary">Activities</h2>
                                    <p className="mt-1 text-sm text-textSecondary">What you can do on the tour</p>
                                  </div>
                                </div>
                              </div>

                              <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                                {loadingActivities ? (
                                  [1, 2].map((item) => (
                                    <div
                                      key={item}
                                      className="h-44 animate-pulse rounded-[28px] border border-ocean-light/20 bg-white"
                                    />
                                  ))
                                ) : filteredActivities.length === 0 ? (
                                  <div className={`${panelClass} py-12 text-center`}>
                                    <i className="fas fa-bicycle mb-3 text-4xl text-ocean-light/35" />
                                    <h3 className="font-playfair text-2xl font-semibold text-textPrimary">No Activities Yet</h3>
                                    <p className="mt-1 text-sm text-textSecondary">Activities will show here once published.</p>
                                  </div>
                                ) : (
                                  filteredActivities.map((activity) => (
                                    <ActivityCard key={activity.id} activity={activity} />
                                  ))
                                )}
                              </div>
                            </aside>
                          </div>

                          <section id="social-gallery" className="space-y-8 border-t border-ocean-light/20 pt-8">
                            <div className="text-center">
                              <h2 className="font-playfair text-4xl font-bold text-textPrimary sm:text-5xl">Day Tour Gallery</h2>
                              <p className="mt-2 text-sm text-textSecondary sm:text-base">A cleaner, more inviting look at the resort.</p>
                            </div>

                            <div className="space-y-6">
                              <div>
                                <div className="mb-3 flex items-end justify-between gap-4 px-1">
                                  <h3 className="font-playfair text-2xl font-bold text-ocean-mid">Pool</h3>
                                  <span className="text-xs uppercase tracking-[0.18em] text-textSecondary">Swipe to browse</span>
                                </div>
                                <div className="flex gap-4 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory">
                                  {poolImages.map((src, idx) => (
                                    <div
                                      key={`${src}-${idx}`}
                                      className="relative min-w-[78%] snap-start overflow-hidden rounded-[28px] border border-ocean-light/20 bg-white shadow-[0_14px_30px_rgb(0,0,0,0.08)] sm:min-w-[44%] lg:min-w-[32%]"
                                    >
                                      <div className="relative aspect-[4/3]">
                                        <Image
                                          src={src}
                                          alt={`Pool view ${idx + 1}`}
                                          fill
                                          sizes="(max-width: 640px) 78vw, (max-width: 1024px) 44vw, 32vw"
                                          className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="mb-3 flex items-end justify-between gap-4 px-1">
                                  <h3 className="font-playfair text-2xl font-bold text-ocean-mid">Facilities</h3>
                                  <span className="text-xs uppercase tracking-[0.18em] text-textSecondary">More to explore</span>
                                </div>
                                <div className="flex gap-4 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory">
                                  {facilitiesImages.map((src, idx) => (
                                    <div
                                      key={`${src}-${idx}`}
                                      className="relative min-w-[78%] snap-start overflow-hidden rounded-[28px] border border-ocean-light/20 bg-white shadow-[0_14px_30px_rgb(0,0,0,0.08)] sm:min-w-[44%] lg:min-w-[32%]"
                                    >
                                      <div className="relative aspect-[4/3]">
                                        <Image
                                          src={src}
                                          alt={`Facility view ${idx + 1}`}
                                          fill
                                          sizes="(max-width: 640px) 78vw, (max-width: 1024px) 44vw, 32vw"
                                          className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </section>
                        </div>