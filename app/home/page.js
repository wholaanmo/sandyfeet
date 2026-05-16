// app/page.js
'use client';

import { useEffect, useState } from 'react';
import GuestLayout from '../guest/layout';
import Image from 'next/image';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { addDoc, collection, getDocs, limit, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import ChatBot from '@/components/guest/ChatBot';

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

// Star rating component for testimonials
const StarRating = ({ rating }) => {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

export default function HomePage() {
  const [featuredRooms, setFeaturedRooms] = useState([]);
  const [featuredRoomsLoading, setFeaturedRoomsLoading] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState('verify');
  const [feedbackCredentials, setFeedbackCredentials] = useState({ email: '', reference: '' });
  const [feedbackForm, setFeedbackForm] = useState({ rating: 5, comment: '' });
  const [feedbackMessage, setFeedbackMessage] = useState({ text: '', type: '' });
  const [verifiedFeedbackBooking, setVerifiedFeedbackBooking] = useState(null);
  const [verifyingBooking, setVerifyingBooking] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [publishedFeedbacks, setPublishedFeedbacks] = useState([]);

  // Fetch published feedbacks for testimonials with real-time updates
  useEffect(() => {
    const feedbacksRef = collection(db, 'feedbacks');
    // Only filter by status in the query; archived filtering will be done in memory
    const q = query(feedbacksRef, where('status', '==', 'Published'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const feedbacksList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out archived feedbacks
        if (data.archived === true) return;
        // Only include feedbacks that have a comment
        if (data.comment && data.comment.trim().length > 0) {
          feedbacksList.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt || 0),
          });
        }
      });
      // Sort by creation date (newest first)
      feedbacksList.sort((a, b) => b.createdAt - a.createdAt);
      setPublishedFeedbacks(feedbacksList);
    }, (error) => {
      console.error('Error fetching published feedbacks:', error);
    });

    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    if (!showFeedbackModal) return;

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setShowFeedbackModal(false);
      }
    };

    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [showFeedbackModal]);

  const resetFeedbackModal = () => {
    setFeedbackStep('verify');
    setFeedbackCredentials({ email: '', reference: '' });
    setFeedbackForm({ rating: 5, comment: '' });
    setFeedbackMessage({ text: '', type: '' });
    setVerifiedFeedbackBooking(null);
    setVerifyingBooking(false);
    setSubmittingFeedback(false);
  };

  const closeFeedbackModal = () => {
    setShowFeedbackModal(false);
    resetFeedbackModal();
  };

  const fetchBookingByReference = async (collectionName, bookingId) => {
    const bookingsRef = collection(db, collectionName);
    // 1) Search by bookingId field
    const bookingQuery = query(bookingsRef, where('bookingId', '==', bookingId), limit(1));
    let bookingSnapshot = await getDocs(bookingQuery);

    if (!bookingSnapshot.empty) {
      const bookingData = bookingSnapshot.docs[0].data();
      // Check if it's a multi-room child booking (has parentBookingId)
      if (bookingData.isMultiRoomBooking && bookingData.parentBookingId) {
        // For child bookings, fetch the parent to get consolidated status
        const parentQuery = query(bookingsRef, where('bookingId', '==', bookingData.parentBookingId), limit(1));
        const parentSnapshot = await getDocs(parentQuery);
        if (!parentSnapshot.empty) {
          const parentData = parentSnapshot.docs[0].data();
          return {
            docId: bookingSnapshot.docs[0].id,
            collectionName,
            data: {
              ...bookingData,
              status: parentData.status,
            },
          };
        }
      }
      // Normal booking (single room or parent booking)
      return {
        docId: bookingSnapshot.docs[0].id,
        collectionName,
        data: bookingData,
      };
    }

    // 2) Not found by bookingId → try to find multi‑room group by parentBookingId
    const groupQuery = query(bookingsRef, where('parentBookingId', '==', bookingId));
    const groupSnapshot = await getDocs(groupQuery);

    if (!groupSnapshot.empty) {
      // Take the first child as representative (all share same parentBookingId, guestInfo, dates, and status)
      const representativeDoc = groupSnapshot.docs[0];
      const representativeData = representativeDoc.data();

      // For a multi‑room group, all children have the same status (updated together by admin)
      // Use the status from the first child
      const groupStatus = representativeData.status;

      // Build a synthetic booking object that mimics a normal booking for verification
      const syntheticBooking = {
        ...representativeData,
        bookingId: bookingId,                     // the reference the guest entered
        isMultiRoomGroup: true,                  // flag for downstream logic
        originalChildBookings: groupSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        // Keep the status from the children
        status: groupStatus,
      };

      return {
        docId: representativeDoc.id,             // any child ID is fine for reference
        collectionName,
        data: syntheticBooking,
      };
    }

    return null;
  };

  // Updated handleVerifyFeedbackBooking function with status validation
  const handleVerifyFeedbackBooking = async (event) => {
    event.preventDefault();

    const normalizedEmail = feedbackCredentials.email.trim().toLowerCase();
    const normalizedReference = feedbackCredentials.reference.trim().toUpperCase();

    if (!normalizedEmail || !normalizedReference) {
      setFeedbackMessage({ text: 'Please enter both email and reference number.', type: 'error' });
      return;
    }

    setVerifyingBooking(true);
    setFeedbackMessage({ text: '', type: '' });

    try {
      // First try to find the booking in 'bookings' collection (rooms)
      let booking = await fetchBookingByReference('bookings', normalizedReference);
      let isDayTour = false;

      // If not found in rooms, try dayTourBookings
      if (!booking) {
        booking = await fetchBookingByReference('dayTourBookings', normalizedReference);
        isDayTour = true;
      }

      if (!booking) {
        setFeedbackMessage({ text: 'No booking found for that reference number.', type: 'error' });
        return;
      }

      const guestEmail = String(booking.data?.guestInfo?.email || '').trim().toLowerCase();
      if (!guestEmail || guestEmail !== normalizedEmail) {
        setFeedbackMessage({ text: 'Email does not match this booking reference.', type: 'error' });
        return;
      }

      const bookingStatus = String(booking.data?.status || '').toLowerCase().trim();
      console.log(`[DEBUG] Booking status: "${bookingStatus}", isDayTour: ${isDayTour}`); // You can remove this later

      // Define allowed statuses for feedback submission
      const allowedStatuses = new Set(['check-in', 'check-out', 'completed']);
      const restrictedStatuses = new Set(['pending', 'confirmed', 'cancelled', 'cancelled-by-guest']);

      // Check if status is restricted (not allowed at all)
      if (restrictedStatuses.has(bookingStatus)) {
        let statusMessage = '';
        switch (bookingStatus) {
          case 'pending':
            statusMessage = 'Pending - Your booking is still being reviewed.';
            break;
          case 'confirmed':
            statusMessage = 'Confirmed - Your booking has been confirmed but the stay hasn\'t started yet.';
            break;
          case 'cancelled':
            statusMessage = 'Cancelled - This booking has been cancelled by the admin.';
            break;
          case 'cancelled-by-guest':
            statusMessage = 'Cancelled - This booking has been cancelled by the guest.';
            break;
          default:
            statusMessage = 'This booking status does not allow feedback submission.';
        }
        setFeedbackMessage({
          text: `You may submit feedback only after experiencing your stay at our resort. Feedback becomes available once your stay has started or been completed.`,
          type: 'error'
        });
        return;
      }

      // DAY TOUR: allow only 'completed' or 'check-in'
      if (isDayTour && !['completed', 'check-in'].includes(bookingStatus)) {
        setFeedbackMessage({
          text: 'Only completed or ongoing (Check-In) day tour bookings can submit feedback.',
          type: 'error'
        });
        return;
      }

      // ROOM BOOKING: allow check-in, check-out, completed
      if (!isDayTour && !allowedStatuses.has(bookingStatus)) {
        setFeedbackMessage({
          text: 'Only bookings with status Check-In, Check-Out, or Completed can submit feedback.',
          type: 'error'
        });
        return;
      }

      // Check for duplicate feedback
      const duplicateQuery = query(collection(db, 'feedbacks'), where('bookingId', '==', normalizedReference), limit(1));
      const duplicateSnapshot = await getDocs(duplicateQuery);
      if (!duplicateSnapshot.empty) {
        setFeedbackMessage({ text: 'Feedback for this booking has already been submitted.', type: 'error' });
        return;
      }

      const guestName = `${booking.data?.guestInfo?.firstName || ''} ${booking.data?.guestInfo?.lastName || ''}`.trim();

      setVerifiedFeedbackBooking({
        bookingId: normalizedReference,
        guestEmail: normalizedEmail,
        guestName: guestName || 'Guest',
        sourceCollection: booking.collectionName,
        sourceDocId: booking.docId,
        isDayTour: isDayTour,
      });
      setFeedbackStep('form');
      setFeedbackMessage({ text: 'Booking verified. You can now write your feedback.', type: 'success' });
    } catch (error) {
      console.error('Error verifying booking:', error);
      setFeedbackMessage({ text: 'Failed to verify booking. Please try again.', type: 'error' });
    } finally {
      setVerifyingBooking(false);
    }
  };


  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();

    if (!verifiedFeedbackBooking) {
      setFeedbackMessage({ text: 'Please verify your booking first.', type: 'error' });
      setFeedbackStep('verify');
      return;
    }

    const trimmedComment = feedbackForm.comment.trim();
    if (trimmedComment.length < 10) {
      setFeedbackMessage({ text: 'Please enter at least 10 characters for your feedback.', type: 'error' });
      return;
    }

    setSubmittingFeedback(true);
    setFeedbackMessage({ text: '', type: '' });

    try {
      await addDoc(collection(db, 'feedbacks'), {
        bookingId: verifiedFeedbackBooking.bookingId,
        guestEmail: verifiedFeedbackBooking.guestEmail,
        guestName: verifiedFeedbackBooking.guestName,
        rating: Number(feedbackForm.rating),
        comment: trimmedComment,
        sourceCollection: verifiedFeedbackBooking.sourceCollection,
        sourceDocId: verifiedFeedbackBooking.sourceDocId,
        createdAt: serverTimestamp(),
        status: 'Pending', // Default status when newly submitted
      });

      setFeedbackMessage({ text: 'Thank you. Your feedback has been submitted.', type: 'success' });
      setFeedbackForm({ rating: 5, comment: '' });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setFeedbackMessage({ text: 'Failed to submit feedback. Please try again.', type: 'error' });
    } finally {
      setSubmittingFeedback(false);
    }
  };

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
                <div className="font-playfair text-5xl font-bold mb-2 relative z-10">30,000+</div>
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
            <div className="mb-12 text-center">
              <span className="text-gray-500 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 block">
                GUEST STORIES
              </span>
              <h2 className="font-playfair text-4xl md:text-5xl text-[#0f2824]">
                Testimonials
              </h2>
            </div>

            <div className="relative">
              {/* Decorative palm tree */}
              <div className="absolute -left-12 -top-12 z-0 opacity-80 decoration-clip hidden md:block">
                <Image src="/assets/Icon/Coconut tree.png" alt="Palm tree" width={100} height={100} />
              </div>

              <div className={`relative overflow-hidden px-1 ${publishedFeedbacks.length > 0 && publishedFeedbacks.length <= 2 ? 'flex justify-center' : ''}`}>
                <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-12 bg-gradient-to-r from-white to-transparent" />
                <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-12 bg-gradient-to-l from-white to-transparent" />

                {publishedFeedbacks.length > 0 ? (
                  <div className="testimonials-track flex w-max gap-6 pb-2">
                    {(publishedFeedbacks.length <= 2
                      ? [...publishedFeedbacks, ...publishedFeedbacks, ...publishedFeedbacks, ...publishedFeedbacks]
                      : [...publishedFeedbacks, ...publishedFeedbacks]
                    ).map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className="w-[320px] flex-none rounded-3xl border border-gray-100 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.03)] md:w-[360px]"
                      >
                        <div className="mb-6 flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-[#3B82F6]">
                            {(item.guestName || 'Guest').charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-bold text-[#0f2824]">
                              {item.guestName ? item.guestName.split(' ')[0] : 'Guest'}
                            </h4>
                            <div className="mt-1">
                              <StarRating rating={item.rating} />
                            </div>
                          </div>
                        </div>
                        <p className="mb-8 text-[15px] leading-relaxed text-gray-600">
                          &quot;{item.comment}&quot;
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Show empty state centered within the viewable area
                  <div className="flex items-center justify-center min-h-[400px] w-full">
                    <div className="text-center">
                      <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center animate-bounce">
                          <span className="material-icons text-3xl text-gray-400">
                            rate_review
                          </span>
                        </div>
                      </div>

                      <p className="text-gray-500 text-lg font-semibold">
                        No testimonials available yet
                      </p>
                      <p className="text-gray-400 text-sm mt-2">
                        Be the first to share your experience!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(true)}
                  className="rounded-full bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:bg-[#2563EB]"
                >
                  Add Feedback
                </button>
              </div>
            </div>
          </div>
        </section>

        {showFeedbackModal ? (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
            onClick={closeFeedbackModal}
          >
            <div
              className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
                <div>
                  <h3 className="font-playfair text-2xl text-[#0f2824] sm:text-3xl">Add Feedback</h3>
                  <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                    Feedback is only available for started or completed bookings.<br /> Only your first name will be displayed on the website once you submit feedback.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFeedbackModal}
                  className="rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[75vh] overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                {feedbackStep === 'verify' ? (
                  <form onSubmit={handleVerifyFeedbackBooking} className="space-y-4">
                    <div>
                      <label htmlFor="feedback-email" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                        Email
                      </label>
                      <input
                        id="feedback-email"
                        type="email"
                        value={feedbackCredentials.email}
                        onChange={(event) =>
                          setFeedbackCredentials((prev) => ({ ...prev, email: event.target.value }))
                        }
                        placeholder="you@example.com"
                        required
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#3B82F6]"
                      />
                    </div>

                    <div>
                      <label htmlFor="feedback-reference" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                        Reference Number
                      </label>
                      <div className="relative">
                        <input
                          id="feedback-reference"
                          type="text"
                          value={feedbackCredentials.reference}
                          onChange={(event) =>
                            setFeedbackCredentials((prev) => ({
                              ...prev,
                              reference: event.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="BOOK-... or DAYTOUR-..."
                          required
                          className="w-full rounded-xl border border-gray-200 pl-4 pr-12 py-3 text-sm uppercase text-gray-700 outline-none transition focus:border-[#3B82F6]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              setFeedbackCredentials((prev) => ({
                                ...prev,
                                reference: text.trim().toUpperCase(),
                              }));
                            } catch (err) {
                              console.error('Failed to read clipboard:', err);
                            }
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-[#3B82F6] transition-all"
                          title="Paste from clipboard"
                        >
                          <i className="fas fa-paste text-sm"></i>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={verifyingBooking}
                      className="w-full rounded-full bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {verifyingBooking ? 'Verifying...' : 'Verify Booking'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleFeedbackSubmit} className="space-y-4">


                    <div>
                      <label htmlFor="feedback-rating" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                        Rating
                      </label>
                      <select
                        id="feedback-rating"
                        value={feedbackForm.rating}
                        onChange={(event) =>
                          setFeedbackForm((prev) => ({ ...prev, rating: Number(event.target.value) }))
                        }
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#3B82F6]"
                      >
                        <option value={5}>5 - Excellent</option>
                        <option value={4}>4 - Very Good</option>
                        <option value={3}>3 - Good</option>
                        <option value={2}>2 - Fair</option>
                        <option value={1}>1 - Poor</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="feedback-comment" className="mb-2 block text-sm font-semibold text-[#0f2824]">
                        Your Feedback
                      </label>
                      <textarea
                        id="feedback-comment"
                        rows={5}
                        value={feedbackForm.comment}
                        onChange={(event) =>
                          setFeedbackForm((prev) => ({ ...prev, comment: event.target.value }))
                        }
                        placeholder="Tell us about your stay..."
                        required
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-[#3B82F6]"
                      />
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={submittingFeedback}
                        className="w-full rounded-full bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                      </button>
                    </div>
                  </form>
                )}

                {feedbackMessage.text ? (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm ${feedbackMessage.type === 'error'
                        ? 'border-red-100 bg-red-50 text-red-700'
                        : feedbackMessage.type === 'success'
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                          : 'border-blue-100 bg-blue-50 text-blue-700'
                      }`}
                  >
                    {feedbackMessage.text}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

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

        <style>
          {`
            .gallery-track {
              animation: scrollGallery 25s linear infinite;
            }
            .testimonials-track {
              animation: scrollTestimonials 25s linear infinite;
            }
            @keyframes scrollGallery {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            @keyframes scrollTestimonials {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .gallery-track:hover, .testimonials-track:hover {
              animation-play-state: paused;
            }
          `}
        </style>

      </div>
      <ChatBot />
    </GuestLayout>
  );
}