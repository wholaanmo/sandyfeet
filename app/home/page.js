'use client';

import { useEffect, useState } from 'react';
import GuestLayout from '../guest/layout';
import Image from 'next/image';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const galleryImages = [
  { src: '/assets/View/Front view.jpg', alt: 'Sandyfeet front view' },
  { src: '/assets/View/Second floor view.jpg', alt: 'Second floor view' },
  { src: '/assets/Facilities/Pool.jpg', alt: 'Pool area' },
  { src: '/assets/GroundFloor/Ground floor room.jpg', alt: 'Ground floor room exterior' },
  { src: '/assets/Tent/Tents.jpg', alt: 'Camping tents' },
  { src: '/assets/Facilities/Bonfire.jpg', alt: 'Bonfire night setup' },
];

const toRoomSlug = (value) => {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const getFeaturedPriority = (roomType) => {
  const type = String(roomType || '').toLowerCase();
  if (type.includes('ground')) return 0;
  if (type.includes('group') || type.includes('barkada')) return 1;
  if (type.includes('couple')) return 2;
  if (type.includes('tent')) return 3;
  return 4;
};

const getFeaturedBadge = (roomType) => {
  const type = String(roomType || '').toLowerCase();
  if (type.includes('group') || type.includes('barkada')) return 'For Groups';
  if (type.includes('couple')) return 'For Couples';
  if (type.includes('tent')) return 'Outdoor Stay';
  if (type.includes('ground')) return 'Most Popular';
  return 'Featured Stay';
};

const getCapacityCopy = (capacityMin, capacityMax) => {
  const min = Number(capacityMin || 1);
  const max = Number(capacityMax || min);

  if (min === max) {
    return `Good for ${max} person${max === 1 ? '' : 's'}`;
  }

  return `Good for ${min} to ${max} persons`;
};

const getFallbackFeaturedImage = (roomType) => {
  const type = String(roomType || '').toLowerCase();
  if (type.includes('group') || type.includes('barkada')) return '/assets/GroupRoom/GroupRoom1.2.jpg';
  if (type.includes('couple')) return '/assets/View/IMG3.jpg';
  if (type.includes('tent')) return '/assets/Tent/Tents.jpg';
  return '/assets/GroundFloor/Room 1.jpg';
};

export default function HomePage() {
  const [featuredRooms, setFeaturedRooms] = useState([]);
  const [featuredRoomsLoading, setFeaturedRoomsLoading] = useState(true);

  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const roomsQuery = query(
      roomsRef,
      where('archived', '!=', true),
      where('availability', '==', 'available')
    );

    const unsubscribe = onSnapshot(
      roomsQuery,
      (querySnapshot) => {
        const roomTypes = new Map();

        querySnapshot.forEach((docSnap) => {
          const roomData = docSnap.data();
          const roomType = String(roomData.type || '').trim();
          if (!roomType) return;

          const existing = roomTypes.get(roomType);
          const nextImage = roomData.images?.[0] || getFallbackFeaturedImage(roomType);

          if (existing) {
            existing.availableRooms += Math.max(0, (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0));
            existing.totalRooms += roomData.totalRooms || 1;
            existing.image = existing.image || nextImage;
            existing.price = Math.min(existing.price, Number(roomData.price || 0));
            existing.capacityMin = Math.min(existing.capacityMin, Number(roomData.capacityMin || 1));
            existing.capacityMax = Math.max(existing.capacityMax, Number(roomData.capacityMax || roomData.capacityMin || 1));
            return;
          }

          roomTypes.set(roomType, {
            id: docSnap.id,
            type: roomType,
            slug: toRoomSlug(roomType),
            image: nextImage,
            price: Number(roomData.price || 0),
            capacityMin: Number(roomData.capacityMin || 1),
            capacityMax: Number(roomData.capacityMax || roomData.capacityMin || 1),
            availableRooms: Math.max(0, (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0)),
            totalRooms: roomData.totalRooms || 1,
          });
        });

        const nextFeaturedRooms = Array.from(roomTypes.values())
          .sort((a, b) => {
            const priorityDiff = getFeaturedPriority(a.type) - getFeaturedPriority(b.type);
            if (priorityDiff !== 0) return priorityDiff;
            if (a.price !== b.price) return a.price - b.price;
            return a.type.localeCompare(b.type);
          })
          .slice(0, 3);

        setFeaturedRooms(nextFeaturedRooms);
        setFeaturedRoomsLoading(false);
      },
      () => {
        setFeaturedRooms([]);
        setFeaturedRoomsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <GuestLayout>
      <div className="bg-white min-h-screen overflow-hidden text-[#143B36]">

        {/* --- HERO SECTION --- */}
        <section className="relative isolate overflow-hidden w-full pb-12 pt-28 sm:pt-32 lg:pt-36 xl:min-h-[75vh]">
          <div className="absolute inset-0 -z-10">
            <Image
              src="/assets/View/Front view.jpg"
              alt="Sandyfeet hero background"
              fill
              priority
              sizes="100vw"
              className="object-cover object-[center_58%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-white/55" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-white/55" />
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-6 xl:flex-row xl:items-center xl:gap-10">

          {/* Left Content */}
          <div className="z-10 max-w-2xl xl:w-5/12">
            <span className="text-[#3B82F6] font-bold text-[10px] tracking-widest uppercase mb-4 block">
              Sandyfeet Resort & Camp
            </span>
            <h1 className="mb-6 font-playfair text-[2.85rem] leading-[1.02] tracking-tight text-[#0f2824] sm:text-[3.6rem] lg:text-[4.35rem] xl:text-[5rem]">
              Escape to the shore.
              <span className="block">Book your stay.</span>
            </h1>
            <p className="mb-10 max-w-xl pr-0 text-base leading-relaxed text-[#4A6762] sm:text-lg xl:max-w-md xl:pr-8">
              Reserve rooms and day tours in minutes. Enjoy a quick and smooth booking flow from search to confirmation.
            </p>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/rooms"
                className="rounded-full bg-[#3B82F6] px-8 py-3.5 text-center text-base font-semibold text-white shadow-xl shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:bg-[#2563EB]"
              >
                Explore Rooms
              </Link>
              <Link
                href="/day-tour"
                className="rounded-full border border-gray-200 bg-white px-8 py-3.5 text-center text-base font-semibold text-gray-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gray-50"
              >
                Book a Day Tour
              </Link>
            </div>
          </div>

          {/* Right Images (Collage) */}
          <div className="relative mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 sm:mx-auto sm:gap-4 lg:mt-12 xl:mx-0 xl:mt-2 xl:block xl:h-[520px] xl:w-7/12 xl:max-w-none">
            {/* Main Center Image */}
            <div className="relative col-span-2 aspect-[4/3] overflow-hidden rounded-[2rem] border-4 border-white shadow-2xl transition-transform duration-500 hover:rotate-0 sm:border-6 xl:absolute xl:right-6 xl:top-16 xl:z-20 xl:h-[320px] xl:w-[470px] xl:-rotate-2 xl:border-8 xl:transform-gpu">
              <Image
                src="/assets/View/IMG3.jpg"
                alt="Pool View"
                fill
                priority
                sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 470px"
                className="object-cover"
              />
            </div>
            {/* Top Left Smaller Image */}
            <div className="relative aspect-square overflow-hidden rounded-3xl border-4 border-white shadow-xl transition-transform duration-500 hover:-rotate-6 sm:border-6 xl:absolute xl:left-8 xl:top-4 xl:z-30 xl:h-[205px] xl:w-[205px] xl:-rotate-[11deg] xl:border-8 xl:transform-gpu">
              <Image
                src="/assets/View/Banner.jpg"
                alt="Camp View"
                fill
                priority
                sizes="(max-width: 639px) 48vw, (max-width: 1279px) 33vw, 205px"
                className="object-cover"
              />
            </div>
            {/* Top Right Image */}
            <div className="relative aspect-square overflow-hidden rounded-2xl border-4 border-white shadow-xl transition-transform duration-500 hover:rotate-6 sm:border-6 xl:absolute xl:right-14 xl:top-6 xl:z-30 xl:h-[150px] xl:w-[150px] xl:rotate-[9deg] xl:border-[6px] xl:transform-gpu">
              <Image
                src="/assets/GroupRoom/GroupRoom1.1.jpg"
                alt="Group Room"
                fill
                priority
                sizes="(max-width: 639px) 48vw, (max-width: 1279px) 33vw, 150px"
                className="object-cover"
              />
            </div>
            {/* Bottom Left Image */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border-4 border-white shadow-xl transition-transform duration-500 hover:rotate-6 sm:border-6 xl:absolute xl:left-0 xl:bottom-6 xl:z-30 xl:h-[175px] xl:w-[270px] xl:rotate-[2deg] xl:border-8 xl:transform-gpu">
              <Image
                src="/assets/GroundFloor/Ground floor room.jpg"
                alt="Room View"
                fill
                sizes="(max-width: 639px) 48vw, (max-width: 1279px) 33vw, 270px"
                className="object-cover"
              />
            </div>
            {/* Bottom Right Image */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border-4 border-white shadow-xl transition-transform duration-500 hover:rotate-12 sm:border-6 xl:absolute xl:right-3 xl:bottom-2 xl:z-40 xl:h-[150px] xl:w-[150px] xl:rotate-[7deg] xl:border-8 xl:transform-gpu">
              <Image
                src="/assets/View/Front view.jpg"
                alt="Signage"
                fill
                sizes="(max-width: 639px) 48vw, (max-width: 1279px) 33vw, 150px"
                className="object-cover"
              />
            </div>
          </div>
          </div>
        </section>

        {/* --- GALLERY SECTION --- */}
        <section className="bg-white/70 py-16 pb-20">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
              LIVE MOMENTS
            </span>
            <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-6">
              Gallery in Motion
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto mb-10 px-4">
              A quick look at the vibe around Sandyfeet, from bright mornings by the pool to laid-back sunsets.
            </p>
            
            <div className="relative overflow-hidden px-1">
              <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-white/90 to-transparent" />
              <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-white/90 to-transparent" />
              <div className="absolute right-8 -top-8 z-20 hidden h-16 w-16 md:block">
                <Image src="/assets/Icon/Shell.png" alt="Shell icon" fill className="object-contain opacity-80" />
              </div>

              <div className="gallery-track flex w-max gap-4 md:gap-6">
                {[...galleryImages, ...galleryImages].map((image, index) => (
                  <div
                    key={`${image.src}-${index}`}
                    className="relative h-[220px] w-[320px] flex-none overflow-hidden rounded-3xl shadow-[0_10px_24px_rgb(0,0,0,0.08)] md:h-[300px] md:w-[430px]"
                  >
                    <Image src={image.src} alt={image.alt} fill className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FEATURED PACKAGES --- */}
           <section className="py-16 relative">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center mb-12 relative">
                {/* Decorative sandals */}
                <div className="absolute -left-10 top-0 hidden h-24 w-24 rotate-[15deg] opacity-70 md:block">
                  <Image src="/assets/Icon/Sadals.png" alt="Sandals icon" fill className="object-contain" />
                </div>

               <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-6">
                 Featured packages
               </h2>
               <p className="text-[#3B82F6] max-w-xl mx-auto">
                 Explore our top-picked stays designed for your perfect getaway.
               </p>
             </div>

             <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
               {featuredRoomsLoading ? (
                 Array.from({ length: 3 }).map((_, index) => (
                   <div key={index} className="rounded-[2rem] border border-gray-50 bg-white p-4 shadow-[0_12px_40px_rgb(0,0,0,0.06)]">
                     <div className="mb-6 h-[240px] animate-pulse rounded-3xl bg-gray-100" />
                     <div className="space-y-3 px-2">
                       <div className="h-3 w-28 animate-pulse rounded bg-gray-100" />
                       <div className="h-8 w-40 animate-pulse rounded bg-gray-100" />
                       <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
                         <div className="h-6 w-24 animate-pulse rounded bg-gray-100" />
                         <div className="h-10 w-28 animate-pulse rounded-full bg-gray-100" />
                       </div>
                     </div>
                   </div>
                 ))
               ) : featuredRooms.length > 0 ? (
                 featuredRooms.map((room) => (
                   <div key={room.slug} className="flex flex-col rounded-[2rem] border border-gray-50 bg-white p-4 shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition-all hover:shadow-[0_12px_40px_rgb(0,0,0,0.1)]">
                     <div className="relative mb-6 h-[240px] w-full overflow-hidden rounded-3xl">
                       <Image
                         src={room.image}
                         alt={room.type}
                         fill
                         sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                         className="object-cover"
                       />
                       <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-800">
                         {getFeaturedBadge(room.type)}
                       </span>
                     </div>
                     <div className="flex flex-grow flex-col px-2">
                       <span className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                         {getCapacityCopy(room.capacityMin, room.capacityMax)}
                       </span>
                       <h3 className="mb-8 font-playfair text-2xl font-bold text-[#0f2824]">
                         {room.type}
                       </h3>

                       <div className="mt-auto flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                         <span className="text-xl font-bold text-[#3B82F6]">
                           PHP {room.price.toLocaleString()}
                         </span>
                         <Link
                           href={`/rooms/${encodeURIComponent(room.slug)}`}
                           className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                         >
                           View Details
                         </Link>
                       </div>
                     </div>
                   </div>
                 ))
               ) : (
                 <div className="col-span-full rounded-[2rem] border border-gray-100 bg-white px-6 py-12 text-center shadow-[0_12px_40px_rgb(0,0,0,0.06)]">
                   <h3 className="font-playfair text-2xl text-[#0f2824]">No featured rooms available right now</h3>
                   <p className="mt-3 text-sm text-gray-500">The home page will update automatically once rooms are available.</p>
                 </div>
               )}
             </div>

             {/* Explore All Rooms Button */}
             <div className="text-center mt-8">
               <Link href="/rooms" className="inline-block bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-8 py-3.5 rounded-full text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5">
                 Explore All Rooms
               </Link>
             </div>
           </div>
        </section>

        {/* --- WHY GUESTS LOVE IT & STATS --- */}
        <section className="py-16 relative bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left side texts */}
            <div>
              <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
                WHY GUESTS LOVE IT
              </span>
              <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-12">
                Simple booking, real getaway energy
              </h2>
              <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Fast reservation confirmation</span>
                </div>
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Clear payment instructions</span>
                </div>
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Helpful staff communication</span>
                </div>
                <div className="bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
                  <span className="text-gray-600 text-sm font-medium">Track booking in one tap</span>
                </div>
              </div>
            </div>

            {/* Right side stats blocks */}
            <div className="flex flex-col gap-6">
              <div className="bg-[#4285F4] rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-blue-500/20">
                <span className="text-white/80 font-bold text-[10px] tracking-widest uppercase mb-4 block relative z-10">HAPPY GUESTS</span>
                <div className="font-playfair text-5xl font-bold mb-2 relative z-10">1,200+</div>
                <p className="text-white/90 text-sm relative z-10">Bookings handled with a smooth flow</p>
                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
              </div>

              <div className="bg-[#f0bb8e] rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-orange-500/10">
                <span className="text-white/90 font-bold text-[10px] tracking-widest uppercase mb-4 block relative z-10">AVG BOOKING TIME</span>
                <div className="font-playfair text-5xl font-bold mb-2 relative z-10 text-[#0f2824]">3 min</div>
                <p className="text-[#0f2824]/80 text-sm relative z-10">From details submission to reference code</p>
                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
              </div>
            </div>
          </div>
        </section>

        {/* --- TESTIMONIALS --- */}
           <section className="py-16 bg-white border-t border-gray-50 pb-24">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center mb-12">
               <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
                 GUEST STORIES
               </span>
               <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824]">
                 Testimonials
               </h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                {/* Decorative palm tree */}
                <div className="absolute -left-12 -top-12 z-0 opacity-80 decoration-clip hidden md:block">
                 <Image src="/assets/Icon/Coconut tree.png" alt="Palm tree" width={100} height={100} />
                </div>

               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">A</div>
                   <div>
                     <h4 className="font-bold text-[#0f2824]">Aira M.</h4>
                     <p className="text-gray-400 text-[10px] tracking-widest uppercase">WEEKEND GUEST</p>
                   </div>
                 </div>
                 <p className="text-gray-600 leading-relaxed mb-8 flex-grow text-[15px]">
                   &quot;Super easy booking process and the place looked exactly like the photos. The pool vibe at sunset is 10/10.&quot;
                 </p>
                 <div className="flex gap-1 mt-auto">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbc674]"></div>
                   ))}
                 </div>
               </div>

               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">J</div>
                   <div>
                     <h4 className="font-bold text-[#0f2824]">Jules P.</h4>
                     <p className="text-gray-400 text-[10px] tracking-widest uppercase">BIRTHDAY CELEBRANT</p>
                   </div>
                 </div>
                 <p className="text-gray-600 leading-relaxed mb-8 flex-grow text-[15px]">
                   &quot;We reserved for a small celebration and everything felt smooth from payment upload to confirmation update.&quot;
                 </p>
                 <div className="flex gap-1 mt-auto">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbc674]"></div>
                   ))}
                 </div>
               </div>

               <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">M</div>
                   <div>
                     <h4 className="font-bold text-[#0f2824]">Mark & Elle</h4>
                     <p className="text-gray-400 text-[10px] tracking-widest uppercase">COUPLE ROOM STAY</p>
                   </div>
                 </div>
                 <p className="text-gray-600 leading-relaxed mb-8 flex-grow text-[15px]">
                   &quot;The room was cozy and clean, staff was responsive, and tracking our booking status gave us peace of mind.&quot;
                 </p>
                 <div className="flex gap-1 mt-auto">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#fbc674]"></div>
                   ))}
                 </div>
               </div>
             </div>
           </div>
        </section>

        {/* --- HOW IT WORKS --- */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
              PROCESS
            </span>
            <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-14">
              How it works
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative">
               {/* Connecting Line */}
               <div className="hidden md:block absolute top-[44px] left-[15%] right-[15%] h-[1px] bg-gray-200 z-0"></div>

              {/* Step 1 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">1</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Coconut tree.png" alt="Pick a Stay" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Pick a Stay</h4>
                <p className="text-gray-500 text-sm">Select a room or day tour package.</p>
              </div>

              {/* Step 2 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">2</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Shell.png" alt="Details" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Details</h4>
                <p className="text-gray-500 text-sm">Enter your booking dates and information.</p>
              </div>

              {/* Step 3 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">3</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Sand Castle.png" alt="Pay" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Pay</h4>
                <p className="text-gray-500 text-sm">Transfer 50% deposit and upload proof.</p>
              </div>

              {/* Step 4 */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-6 relative">
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-[#3B82F6] rounded-full text-white text-xs font-bold flex items-center justify-center">4</span>
                  <div className="relative w-12 h-12">
                     <Image src="/assets/Icon/Floters.png" alt="Relax" fill className="object-contain" />
                  </div>
                </div>
                <h4 className="font-bold text-[#0f2824] mb-2">Relax</h4>
                <p className="text-gray-500 text-sm">We verify and you get ready to chill.</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- MAP / FIND US SECTION --- */}
        <section className="py-16 bg-[#FAFAFA] border-t border-gray-100">
          <div className="max-w-[70rem] mx-auto px-6 grid grid-cols-1 items-center gap-10 rounded-3xl border border-gray-50 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.03)] sm:p-6 md:grid-cols-2 md:p-8">
            {/* Left Texts */}
            <div>
              <span className="text-gray-500 font-bold text-[10px] tracking-widest uppercase mb-4 block">FIND US</span>
              <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824] mb-8">
                Where is Sandyfeet Liwliwa?
              </h2>
              <p className="text-gray-600 mb-8 max-w-sm">
                Sandyfeet Camp and Event Site is located in Liwliwa, San Felipe, Zambales. Open the map below for direct navigation.
              </p>
              
              <div className="mb-10 text-sm text-gray-500">
                <p className="font-bold text-gray-800 mb-1">Sandyfeet #Liwliwa Camp and Event Site</p>
                <p>San Felipe, Zambales, Philippines</p>
              </div>

              <a
                href="https://maps.app.goo.gl/vw8YdNve2sEoVrVM9"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-3.5 rounded-full text-sm font-semibold shadow-md transition-all hover:shadow-lg shadow-blue-500/20"
              >
                Open in Google Maps
              </a>
            </div>

            <a
              href="https://maps.app.goo.gl/vw8YdNve2sEoVrVM9"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block h-[280px] w-full overflow-hidden rounded-3xl border border-gray-200/60 sm:h-[360px]"
            >
              <Image
                src="/assets/View/Front view.jpg"
                alt="Sandyfeet Liwliwa location preview"
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-white/90 px-4 py-3 text-left backdrop-blur-sm">
                <p className="text-sm font-semibold text-[#0f2824]">Open Live Map</p>
                <p className="text-xs text-gray-600">Tap to open Google Maps directions to Sandyfeet, Liwliwa.</p>
              </div>
            </a>
          </div>
        </section>

        {/* --- FOOTER --- */}
        <footer className="py-14 bg-white border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 mb-10">
            
            {/* Column 1: Brand & Info */}
            <div className="flex flex-col">
              <Link href="/" className="flex items-center gap-3 group mb-6">
                <div className="relative w-12 h-12">
                  <Image src="/assets/sandyfeet.png" alt="SandyFeet Logo" fill className="object-contain" />
                </div>
                <div className="flex flex-col justify-center">
                  <span className="font-playfair font-bold text-[#143B36] text-[22px] leading-none mb-1">
                    Sandyfeet
                  </span>
                  <span className="text-gray-400 text-[9px] tracking-[0.2em] font-medium">
                    LIWLIWA CAMP & EVENT SITE
                  </span>
                </div>
              </Link>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm mb-8">
                Escape the ordinary. Secure your spot directly online in just a few clicks. Room reservations, day tour booking, and event packages at Sandyfeet Camp.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center hover:bg-[#3B82F6] hover:text-white transition-all">
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd"></path></svg>
                </a>
              </div>
            </div>

            {/* Column 2: Explore Links */}
            <div>
              <h4 className="font-bold text-[#0f2824] uppercase text-xs tracking-wider mb-8">Explore</h4>
              <ul className="flex flex-col gap-5 text-sm text-gray-500">
                <li><Link href="/" className="hover:text-[#3B82F6] transition-colors">Home Page</Link></li>
                <li><Link href="/rooms" className="hover:text-[#3B82F6] transition-colors">Room Offers</Link></li>
                <li><Link href="/day-tour" className="hover:text-[#3B82F6] transition-colors">Book a Day Tour</Link></li>
                <li><Link href="/reservation-tracker" className="hover:text-[#3B82F6] transition-colors">Track Reservation</Link></li>
              </ul>
            </div>

            {/* Column 3: Contact Info */}
            <div>
              <h4 className="font-bold text-[#0f2824] uppercase text-xs tracking-wider mb-8">Need to Know</h4>
              <div className="flex flex-col gap-6 text-sm">
                <div className="flex gap-4">
                  <div className="mt-1 text-gray-400">🕒</div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Check-in / Out</p>
                    <p className="text-gray-500">In: 2:00 PM • Out: 12:00 NN</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1 text-gray-400">📞</div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Contact Us</p>
                    <p className="text-gray-500">0908 812 7169</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="max-w-7xl mx-auto px-6 pt-6 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-400">
            <p>© 2026 Sandyfeet Camp & Event Site. All rights reserved.</p>
            <div className="flex gap-6">
              <Link href="#" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
              <Link href="#" className="hover:text-gray-600 transition-colors">Terms of Service</Link>
            </div>
          </div>
        </footer>

      </div>
    </GuestLayout>
  );
}
