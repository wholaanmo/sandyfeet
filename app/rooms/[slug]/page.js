// app/rooms/[slug]/page.js

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import ChatBot from '@/components/guest/ChatBot';
// +++ NEW IMPORTS +++
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import GuestAuthModal from '@/components/guest/GuestAuthModal';

const formatHour = (hour) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(normalized).padStart(2, '0')}:00 ${period}`;
};

const toRoomSlug = (value) => {
  const rawValue = String(value || '');
  let decodedValue = rawValue;
  try {
    decodedValue = decodeURIComponent(rawValue);
  } catch {
    decodedValue = rawValue;
  }

  return decodedValue
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const toDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const defaultGallery = [
  'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'
];

export default function RoomDetailsPage({ params }) {
  const router = useRouter();
  const routeParams = useParams();
  const slugValue = routeParams?.slug ?? params?.slug ?? '';
  const slug = useMemo(() => toRoomSlug(Array.isArray(slugValue) ? slugValue[0] : slugValue), [slugValue]);

  // +++ AUTHENTICATION HOOKS +++
  const { user, loading: authLoading } = useGuestAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingBooking, setPendingBooking] = useState(false);

  const [roomData, setRoomData] = useState(null);
  const [roomUnitsById, setRoomUnitsById] = useState({});
  const [loading, setLoading] = useState(true);

  const [bookedDates, setBookedDates] = useState({});
  const [exclusiveResortDates, setExclusiveResortDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [checkInDate, setCheckInDate] = useState('');
  const [numberOfNights, setNumberOfNights] = useState(1);
  const [checkInHour, setCheckInHour] = useState(14);
  const [checkOutHour, setCheckOutHour] = useState(12);
  const [roomQuantity, setRoomQuantity] = useState(1);
  // Per‑room guest counts
  const [perRoomAdults, setPerRoomAdults] = useState([]);
  const [perRoomKids, setPerRoomKids] = useState([]);
  const [draftApplied, setDraftApplied] = useState(false);
  const calendarRef = useRef(null);
  const calendarBtnRef = useRef(null);

  const [availabilityForStay, setAvailabilityForStay] = useState(0);
  const [actionError, setActionError] = useState('');

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const images = useMemo(() => {
    if (roomData?.images?.length) return roomData.images;
    return defaultGallery;
  }, [roomData]);

  // Helper: check if a given date is tomorrow (the immediate next calendar day after today)
  const isTomorrow = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  };

  const minBookableDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  }, []);

  const checkOutDate = useMemo(() => {
    if (!checkInDate) return null;
    const start = new Date(checkInDate);
    start.setDate(start.getDate() + numberOfNights);
    start.setHours(checkOutHour, 0, 0, 0);
    return start;
  }, [checkInDate, numberOfNights, checkOutHour]);

  const checkInDateObject = useMemo(() => {
    if (!checkInDate) return null;
    const [year, month, day] = checkInDate.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }, [checkInDate]);

  const days = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const entries = [];
    for (let i = 0; i < firstDay; i++) entries.push(null);
    for (let day = 1; day <= totalDays; day++) entries.push(new Date(year, month, day));
    return entries;
  }, [currentMonth]);

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateTooSoon = (date) => {
    const minDate = new Date(minBookableDate);
    minDate.setHours(0, 0, 0, 0);
    return date < minDate;
  };

  // Check if a given date is fully booked for THIS room type
  const isDateFullyBooked = (date) => {
    if (!date || !roomData?.roomIds?.length) return false;
    const dateStr = toDateKey(date);
    if (exclusiveResortDates[dateStr]) return true;
    let totalAvailableUnits = 0;
    for (const roomId of roomData.roomIds) {
      const maxRooms = roomUnitsById[roomId]?.availableUnits || 0;
      if (maxRooms <= 0) continue;
      let minAvailable = maxRooms;
      for (let hour = checkInHour; hour < 24; hour++) {
        const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
        const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
        const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
        minAvailable = Math.min(minAvailable, availableNow);
        if (minAvailable <= 0) break;
      }
      totalAvailableUnits += minAvailable;
    }
    // Disable date if it cannot accommodate the selected number of rooms
    return totalAvailableUnits < roomQuantity;
  };

  const handleDateSelect = (date) => {
    // Disable tomorrow explicitly per requirement
    if (isDatePast(date) || isDateTooSoon(date) || isDateFullyBooked(date) || isTomorrow(date)) return;
    setCheckInDate(toDateKey(date));
    setActionError('');
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  useEffect(() => {
    document.body.style.overflow = isGalleryOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isGalleryOpen]);

  // Close calendar popover on outside click
  useEffect(() => {
    if (!calendarOpen) return;
    const handleClickOutside = (event) => {
      if (calendarRef.current?.contains(event.target)) return;
      if (calendarBtnRef.current?.contains(event.target)) return;
      setCalendarOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [calendarOpen]);

  // Fetch room data from Firebase by matching slug
  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setRoomData(null);
      setRoomUnitsById({});
      return;
    }

    setLoading(true);
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let match = null;
      let totalUnits = 0;
      const roomIds = [];
      const unitsMap = {};

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.archived === true) return;
        if (String(data.availability || '').toLowerCase() !== 'available') return;

        const typeSlug = toRoomSlug(data.type);
        if (typeSlug !== slug) return;

        if (!match) {
          match = { id: docSnap.id, ...data };
        }

        const totalRooms = data.totalRooms || 1;
        const maintenanceRooms = data.maintenanceRooms || 0;
        const availableUnits = Math.max(0, totalRooms - maintenanceRooms);

        roomIds.push(docSnap.id);
        unitsMap[docSnap.id] = { totalRooms, maintenanceRooms, availableUnits };
        totalUnits += availableUnits;
      });

      if (match) {
        setRoomData({ ...match, roomIds, availableRooms: totalUnits });
        setRoomUnitsById(unitsMap);
        setRoomQuantity((prev) => Math.max(1, Math.min(prev, totalUnits || 1)));
      } else {
        setRoomData(null);
        setRoomUnitsById({});
      }

      setLoading(false);
    }, (error) => {
      console.error('Error fetching room details:', error);
      setRoomData(null);
      setRoomUnitsById({});
      setLoading(false);
    });

    return () => unsubscribe();
  }, [slug]);

  // Fetch booked dates for this room type
  useEffect(() => {
    if (!roomData?.roomIds?.length) {
      setBookedDates({});
      return;
    }

    const bookingsRef = collection(db, 'bookings');
    const roomIdChunks = chunk(roomData.roomIds, 10);
    const snapshotsByChunk = {};
    const unsubscribes = [];

    const buildBookedIndex = () => {
      const booked = {};
      Object.values(snapshotsByChunk).forEach((querySnapshot) => {
        querySnapshot.forEach((docSnap) => {
          const booking = docSnap.data();
          const ci = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          const co = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          const roomId = booking.roomId;
          const numberOfRooms = booking.numberOfRooms || 1;
          if (!ci || !co || co <= ci || !roomId) return;
          const current = new Date(ci);
          while (current < co) {
            const dateKey = toDateKey(current);
            const hour = current.getHours();
            if (!booked[dateKey]) booked[dateKey] = {};
            if (!booked[dateKey][roomId]) booked[dateKey][roomId] = {};
            booked[dateKey][roomId][hour] = (booked[dateKey][roomId][hour] || 0) + numberOfRooms;
            current.setHours(current.getHours() + 1, 0, 0, 0);
          }
        });
      });
      setBookedDates(booked);
    };

    roomIdChunks.forEach((roomIds, idx) => {
      const q = query(
        bookingsRef,
        where('roomId', 'in', roomIds),
        where('status', 'in', ['pending', 'confirmed', 'check-in'])
      );
      const unsub = onSnapshot(q, (querySnapshot) => {
        snapshotsByChunk[idx] = querySnapshot;
        buildBookedIndex();
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }, [roomData]);

  // Fetch dates affected by "Entire Resort Package" bookings (blocks ALL room types, including tents)
  useEffect(() => {
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('isExclusiveResortBooking', '==', true),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const exclusive = {};
      snapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const ci = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
        const co = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
        if (!ci || !co || co <= ci) return;

        const current = new Date(ci);
        while (current < co) {
          const hour = current.getHours();
          if (hour >= checkInHour) {
            exclusive[toDateKey(current)] = true;
          }
          current.setHours(current.getHours() + 1, 0, 0, 0);
        }
      });
      setExclusiveResortDates(exclusive);
    });

    return () => unsubscribe();
  }, [checkInHour]);

  // Fetch blocked slots
  useEffect(() => {
    if (!roomData?.roomIds?.length) {
      setBlockedSlots({});
      return;
    }

    const blockedRef = collection(db, 'unavailableSlots');
    const unsubscribe = onSnapshot(blockedRef, (snapshot) => {
      const blocks = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!roomData.roomIds.includes(data.roomId)) return;
        const dateKey = data.date;
        if (!blocks[dateKey]) blocks[dateKey] = {};
        if (!blocks[dateKey][data.roomId]) blocks[dateKey][data.roomId] = {};
        for (let hour = data.startHour; hour < data.endHour; hour++) {
          const unitsBlocked = data.unitsBlocked || 1;
          blocks[dateKey][data.roomId][hour] = (blocks[dateKey][data.roomId][hour] || 0) + unitsBlocked;
        }
      });
      setBlockedSlots(blocks);
    });

    return () => unsubscribe();
  }, [roomData]);

  // Calculate availability for the selected stay
  const calculateAvailabilityForStay = (startDateString) => {
    if (!roomData?.roomIds?.length) return 0;
    if (!startDateString) return roomData.availableRooms || 0;
    const startDate = new Date(startDateString);
    startDate.setHours(checkInHour, 0, 0, 0);

    // Entire Resort Package blocks every room type (including tents).
    for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + dayOffset);
      const dateKey = toDateKey(currentDate);
      if (exclusiveResortDates[dateKey]) return 0;
    }

    let totalAvailable = 0;
    for (const roomId of roomData.roomIds) {
      const maxRooms = roomUnitsById[roomId]?.availableUnits || 0;
      if (maxRooms <= 0) continue;
      let availableForStay = maxRooms;
      for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + dayOffset);
        const dateKey = toDateKey(currentDate);
        for (let hour = checkInHour; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateKey]?.[roomId]?.[hour] || 0;
          const bookedUnits = bookedDates[dateKey]?.[roomId]?.[hour] || 0;
          const availableNow = Math.max(0, maxRooms - blockedUnits - bookedUnits);
          availableForStay = Math.min(availableForStay, availableNow);
          if (availableForStay <= 0) break;
        }
        if (availableForStay <= 0) break;
      }
      totalAvailable += availableForStay;
    }
    return totalAvailable;
  };

  useEffect(() => {
    if (!roomData) return;
    const computed = calculateAvailabilityForStay(checkInDate);
    setAvailabilityForStay(computed);
    if (computed > 0) {
      setRoomQuantity((prev) => Math.min(prev, computed));
    }
  }, [roomData, checkInDate, numberOfNights, checkInHour, bookedDates, blockedSlots, roomUnitsById, exclusiveResortDates]);

  // Initialize per‑room guest arrays when roomQuantity changes
  useEffect(() => {
    const capacityMin = roomData?.capacityMin || 1;
    const adultsArray = new Array(roomQuantity).fill(capacityMin);
    const kidsArray = new Array(roomQuantity).fill(0);
    setPerRoomAdults(adultsArray);
    setPerRoomKids(kidsArray);
  }, [roomQuantity, roomData]);

  // Apply draft from rooms page (restore booking state)
  useEffect(() => {
    if (!roomData || draftApplied) return;

    const maxQuantity = Math.max(1, roomData.availableRooms || 1);
    let quantity = 1;
    let totalGuests = roomData.capacityMin || 1;

    try {
      const rawDraft = sessionStorage.getItem('roomDetailDraft');
      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        if (draft?.roomType === roomData.type) {
          if (draft.checkInDate) {
            const draftDate = new Date(draft.checkInDate);
            if (!Number.isNaN(draftDate.getTime())) {
              // Block tomorrow from draft restoration
              if (!isTomorrow(draftDate) && !isDatePast(draftDate) && !isDateTooSoon(draftDate)) {
                setCheckInDate(toDateKey(draftDate));
                setCurrentMonth(new Date(draftDate.getFullYear(), draftDate.getMonth(), 1));
              } else {
                // If the stored date is tomorrow/past/too soon, clear the draft date
                setCheckInDate('');
              }
            }
          }
          if (draft.numberOfNights) {
            setNumberOfNights(Math.min(30, Math.max(1, Number(draft.numberOfNights) || 1)));
          }
          if (draft.checkInHour) setCheckInHour(Number(draft.checkInHour));
          if (draft.checkOutHour) setCheckOutHour(Number(draft.checkOutHour));
          quantity = Math.min(maxQuantity, Math.max(1, Number(draft.quantity) || 1));
          totalGuests = Number(draft.totalGuests) || (quantity * (roomData.capacityMin || 1));
        }
      }
    } catch {
      // no-op for malformed draft payload
    }

    setRoomQuantity(quantity);
    const capacityMin = roomData.capacityMin || 1;
    const capacityMax = roomData.capacityMax || capacityMin;
    // Distribute totalGuests evenly across rooms, respecting per‑room limits
    let remaining = totalGuests;
    const adultsArray = new Array(quantity).fill(capacityMin);
    const kidsArray = new Array(quantity).fill(0);
    remaining -= capacityMin * quantity;
    for (let i = 0; i < quantity && remaining > 0; i++) {
      const maxAdd = capacityMax - capacityMin;
      const add = Math.min(maxAdd, remaining);
      adultsArray[i] += add;
      remaining -= add;
    }
    setPerRoomAdults(adultsArray);
    setPerRoomKids(kidsArray);
    setDraftApplied(true);
  }, [roomData, draftApplied]);

  // Per‑room guest handlers
  const handleRoomAdultsChange = (index, increment) => {
    if (!roomData) return;
    const capacityMin = roomData.capacityMin || 1;
    const capacityMax = roomData.capacityMax || capacityMin;
    const newAdults = [...perRoomAdults];
    let newVal = newAdults[index] + (increment ? 1 : -1);
    newVal = Math.max(1, Math.min(capacityMax - perRoomKids[index], newVal));
    if (newVal !== newAdults[index]) {
      newAdults[index] = newVal;
      setPerRoomAdults(newAdults);
    }
  };

  const handleRoomKidsChange = (index, increment) => {
    if (!roomData) return;
    const capacityMin = roomData.capacityMin || 1;
    const capacityMax = roomData.capacityMax || capacityMin;
    const newKids = [...perRoomKids];
    let newVal = newKids[index] + (increment ? 1 : -1);
    newVal = Math.max(0, Math.min(capacityMax - perRoomAdults[index], newVal));
    if (newVal !== newKids[index]) {
      newKids[index] = newVal;
      setPerRoomKids(newKids);
    }
  };

  const handleNextImage = () => setSelectedImageIndex((prev) => (prev + 1) % images.length);
  const handlePrevImage = () => setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);

  // Save current state back to sessionStorage so rooms page can restore it
  const saveStateAndGoBack = () => {
    if (roomData) {
      const totalGuests = perRoomAdults.reduce((s, a) => s + a, 0) + perRoomKids.reduce((s, k) => s + k, 0);
      const draft = {
        roomType: roomData.type,
        quantity: roomQuantity,
        totalGuests,
        checkInDate: checkInDate ? new Date(checkInDate).toISOString() : null,
        numberOfNights,
        checkInHour,
        checkOutHour
      };
      sessionStorage.setItem('roomDetailDraft', JSON.stringify(draft));
    }
    router.push('/rooms');
  };

  // +++ EXTRACTED BOOKING LOGIC (unchanged except moved) +++
  const proceedWithBooking = () => {
    setActionError('');

    if (!checkInDate) {
      setActionError('Please select a check-in date first.');
      return;
    }

    const selectedDate = new Date(checkInDate);
    if (isTomorrow(selectedDate)) {
      setActionError('Booking the next day is not allowed. Please choose a different date.');
      return;
    }

    if (availabilityForStay <= 0) {
      setActionError('No available rooms for the selected schedule. Please change dates.');
      return;
    }

    if (roomQuantity > availabilityForStay) {
      setActionError(`Only ${availabilityForStay} room(s) are available for your selected stay.`);
      return;
    }

    const capacityMin = roomData.capacityMin || 1;
    const capacityMax = roomData.capacityMax || capacityMin;
    const totalAdults = perRoomAdults.reduce((s, a) => s + a, 0);
    const totalKids = perRoomKids.reduce((s, k) => s + k, 0);
    const totalGuests = totalAdults + totalKids;
    const minTotalGuests = roomQuantity * capacityMin;
    const maxTotalGuests = roomQuantity * capacityMax;

    // Validate each room individually
    let roomError = false;
    for (let i = 0; i < roomQuantity; i++) {
      const roomTotal = perRoomAdults[i] + perRoomKids[i];
      if (roomTotal < capacityMin || roomTotal > capacityMax) {
        roomError = true;
        break;
      }
      if (perRoomAdults[i] < 1) {
        roomError = true;
        break;
      }
    }
    if (roomError) {
      setActionError(`Each room must have between ${capacityMin} and ${capacityMax} guests, with at least 1 adult.`);
      return;
    }

    if (totalGuests < minTotalGuests || totalGuests > maxTotalGuests) {
      setActionError(`Total guests must be between ${minTotalGuests} and ${maxTotalGuests} for ${roomQuantity} room(s).`);
      return;
    }

    const checkIn = new Date(checkInDate);
    checkIn.setHours(checkInHour, 0, 0, 0);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + numberOfNights);
    checkOut.setHours(checkOutHour, 0, 0, 0);
    const totalPrice = (roomData.price || 0) * roomQuantity * numberOfNights;

    // Build per‑room guest array for the multi‑room booking page
    const perRoomGuests = [];
    for (let i = 0; i < roomQuantity; i++) {
      perRoomGuests.push({
        adults: perRoomAdults[i],
        kids: perRoomKids[i]
      });
    }

    const bookingData = {
      selectedRooms: { [roomData.type]: roomQuantity },
      perRoomGuests: { [roomData.type]: perRoomGuests },
      totalGuestsPerType: { [roomData.type]: totalGuests },
      adultsPerType: { [roomData.type]: totalAdults },
      kidsPerType: { [roomData.type]: totalKids },
      checkInDate: checkIn.toISOString(),
      checkOutDate: checkOut.toISOString(),
      checkInHour,
      checkOutHour,
      checkInDisplay: formatHour(checkInHour),
      checkOutDisplay: formatHour(checkOutHour),
      numberOfNights,
      specialRequest: '',
      totalPrice,
      totalGuests,
      roomTypes: [{
        type: roomData.type,
        quantity: roomQuantity,
        totalGuests,
        price: roomData.price,
        roomIds: roomData.roomIds || [roomData.id],
        capacityMin,
        capacityMax
      }]
    };

    sessionStorage.setItem('multiRoomBooking', JSON.stringify(bookingData));
    router.push('/rooms/multi-room-booking');
  };

  // +++ MODIFIED handleBookNow: check authentication +++
  const handleBookNow = () => {
    // If user is already authenticated, proceed immediately
    if (user) {
      proceedWithBooking();
    } else {
      // Not authenticated: open modal and remember that a booking is pending
      setPendingBooking(true);
      setIsAuthModalOpen(true);
    }
  };

  // +++ AUTO‑CONTINUE AFTER SUCCESSFUL LOGIN +++
  useEffect(() => {
    if (user && pendingBooking) {
      // User just became authenticated and we have a pending booking
      setPendingBooking(false);     // clear flag to avoid repeated calls
      proceedWithBooking();          // continue the booking flow
    }
  }, [user, pendingBooking]);

  // +++ CLOSE MODAL HANDLER: reset pending flag if user dismisses +++
  const handleAuthModalClose = () => {
    setIsAuthModalOpen(false);
    setPendingBooking(false);        // user closed without authenticating, clear pending
    setActionError('');               // optional: clear any previous errors
  };

  // ─── LOADING STATE ───
  if (loading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-400 font-medium">Loading room details…</p>
          </div>
        </div>
      </GuestLayout>
    );
  }

  // ─── NOT FOUND STATE ───
  if (!roomData) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
            <i className="fas fa-bed text-3xl text-gray-300"></i>
          </div>
          <h1 className="text-3xl font-playfair font-bold text-gray-900">Room Not Found</h1>
          <p className="text-gray-500 mt-2 text-sm">The room you are looking for does not exist or is unavailable.</p>
          <button
            onClick={() => router.push('/rooms')}
            className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
          >
            Back to Rooms
          </button>
        </div>
      </GuestLayout>
    );
  }

  const capacityMin = roomData.capacityMin || 1;
  const capacityMax = roomData.capacityMax || capacityMin;
  const totalAdults = perRoomAdults.reduce((s, a) => s + a, 0);
  const totalKids = perRoomKids.reduce((s, k) => s + k, 0);
  const totalGuests = totalAdults + totalKids;
  const minTotalGuests = roomQuantity * capacityMin;
  const maxTotalGuests = roomQuantity * capacityMax;
  const totalPricePreview = (roomData.price || 0) * roomQuantity * numberOfNights;

  // ─── MAIN RENDER ───
  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] pt-28 pb-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Back button */}
          <div className="mb-5">
            <button
              onClick={saveStateAndGoBack}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm hover:shadow"
            >
              <i className="fas fa-arrow-left text-[10px]"></i>
              Back to Rooms
            </button>
          </div>

          {/* ─── MAIN LAYOUT: LEFT CONTENT / RIGHT RESERVE ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* LEFT COLUMN: Gallery + Room Info */}
            <div className="lg:col-span-7 space-y-6">

              {/* ─── HERO GALLERY ─── */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 h-auto md:h-[400px]">
                {/* Main image */}
                <div
                  onClick={() => setIsGalleryOpen(true)}
                  className="md:col-span-3 w-full h-[280px] md:h-full relative group overflow-hidden bg-gray-100 rounded-3xl cursor-pointer"
                >
                  <img
                    src={images[selectedImageIndex]}
                    alt={`${roomData.type} main`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white transition-all shadow-lg"
                    aria-label="Previous photo"
                  >
                    <i className="fas fa-chevron-left text-xs"></i>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white transition-all shadow-lg"
                    aria-label="Next photo"
                  >
                    <i className="fas fa-chevron-right text-xs"></i>
                  </button>
                  <div className="absolute bottom-4 left-4 flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm text-gray-800 text-[11px] font-bold shadow-sm">
                      {selectedImageIndex + 1} / {images.length}
                    </span>
                  </div>
                </div>

                {/* Side previews */}
                <div className="hidden md:flex flex-col gap-2.5 h-full">
                  {[1, 2].map((offset) => {
                    const imgIndex = (selectedImageIndex + offset) % images.length;
                    return (
                      <button
                        key={`preview-${offset}-${imgIndex}`}
                        onClick={() => { setSelectedImageIndex(imgIndex); setIsGalleryOpen(true); }}
                        className="h-1/2 w-full relative group overflow-hidden bg-gray-100 rounded-3xl"
                      >
                        <img
                          src={images[imgIndex]}
                          alt={`Room gallery ${imgIndex + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                        />
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors rounded-3xl"></div>
                        {offset === 2 && images.length > 3 && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors rounded-3xl">
                            <span className="text-white font-bold text-sm"><i className="fas fa-images mr-1"></i> View all</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LEFT: Room Info */}
              <div className="space-y-6">

                {/* Room Overview */}
                <section className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
                  <h1 className="text-xl md:text-2xl font-playfair font-extrabold text-gray-900 tracking-tight mb-3">
                    {roomData.type}
                  </h1>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {roomData.description || `Experience comfort and relaxation in our ${roomData.type.toLowerCase()}. Enjoy easy access to camp facilities, great ambiance, and a restful stay.`}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
                      {availabilityForStay} Available
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
                      <i className="fas fa-user-friends mr-1 text-[9px]"></i>
                      {capacityMin}–{capacityMax} guests per unit
                    </span>
                    {/* Dynamic inclusions from Firebase */}
                    {roomData.inclusions && roomData.inclusions.length > 0 ? (
                      roomData.inclusions.map((inclusion, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wider">
                          <i className="fas fa-tag mr-1 text-[9px]"></i>
                          {inclusion}
                        </span>
                      ))
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                        No inclusions listed
                      </span>
                    )}
                  </div>
                </section>

                {/* Gallery thumbnails */}
                <section className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
                  <h2 className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-widest">Gallery</h2>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {images.map((img, index) => (
                      <button
                        key={`${img}-${index}`}
                        onClick={() => { setSelectedImageIndex(index); setIsGalleryOpen(true); }}
                        className={`relative h-16 rounded-2xl overflow-hidden border-2 transition-all ${
                          index === selectedImageIndex ? 'border-blue-500 shadow-md shadow-blue-500/20 scale-105' : 'border-transparent hover:border-blue-200'
                        }`}
                      >
                        <img src={img} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            {/* ─── RIGHT: BOOKING SIDEBAR ─── */}
            <aside className="lg:col-span-5 lg:sticky lg:top-24">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_12px_40px_rgb(0,0,0,0.07)] p-4 w-full space-y-3.5">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-playfair font-bold text-gray-900">Reserve Your Stay</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Live pricing • Instant confirmation</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                    <i className="fas fa-calendar-check text-xs"></i>
                  </div>
                </div>

                {/* Room type & price */}
                <div className="bg-gray-50/80 rounded-2xl p-3 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-800">{roomData.type}</p>
                    <div className="text-right">
                      <p className="text-base font-extrabold text-blue-600">₱{Number(roomData.price || 0).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-gray-400">/night per unit</p>
                    </div>
                  </div>
                </div>

                {/* ─── DATE PICKER ─── */}
                <div className="relative">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Check-in Date</label>
                  <button
                    ref={calendarBtnRef}
                    type="button"
                    onClick={() => {
                      if (checkInDateObject) {
                        setCurrentMonth(new Date(checkInDateObject.getFullYear(), checkInDateObject.getMonth(), 1));
                      }
                      setCalendarOpen(!calendarOpen);
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 bg-white rounded-2xl text-xs text-left flex items-center justify-between hover:border-blue-400 transition-all shadow-sm hover:shadow group"
                  >
                    <span className={checkInDateObject ? 'text-gray-900 font-semibold' : 'text-gray-400 font-medium'}>
                      {checkInDateObject
                        ? checkInDateObject.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                        : 'Select check-in date'}
                    </span>
                    <i className="fas fa-calendar-alt text-blue-500 group-hover:text-blue-600"></i>
                  </button>

                  {/* Calendar popover */}
                  {calendarOpen && (
                    <div
                      ref={calendarRef}
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 bg-white w-[290px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-[0_16px_40px_rgb(0,0,0,0.14)] p-2.5 border border-gray-100 max-h-[58vh] overflow-hidden flex flex-col"
                    >
                      <div className="overflow-y-auto pr-1">

                        {/* Month nav */}
                        <div className="flex justify-between items-center mb-1.5 px-1">
                          <button type="button" onClick={goToPreviousMonth} className="w-6 h-6 flex justify-center items-center text-gray-400 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors">
                            <i className="fas fa-chevron-left text-[10px]"></i>
                          </button>
                          <h4 className="font-bold text-gray-800 text-[11px] tracking-wide">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h4>
                          <button type="button" onClick={goToNextMonth} className="w-6 h-6 flex justify-center items-center text-gray-400 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors">
                            <i className="fas fa-chevron-right text-[10px]"></i>
                          </button>
                        </div>

                        {/* Day headers */}
                        <div className="grid grid-cols-7 gap-0.5 mb-1">
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d} className="text-center text-[9px] font-bold uppercase tracking-widest text-gray-400 py-1">{d}</div>
                          ))}
                        </div>

                        {/* Day cells */}
                        <div className="grid grid-cols-7 gap-0.5">
                          {days.map((day, index) => {
                            if (!day) return <div key={`empty-${index}`}></div>;

                            const isPast = isDatePast(day);
                            const isTooSoon = isDateTooSoon(day);
                            const fullyBooked = isDateFullyBooked(day);
                            const tomorrowBlocked = isTomorrow(day);
                            const isSelected = checkInDateObject && checkInDateObject.toDateString() === day.toDateString();
                            const isCheckoutDay = checkOutDate && checkOutDate.toDateString() === day.toDateString();
                            const inRange = checkInDateObject && checkOutDate && day > checkInDateObject && day < checkOutDate;
                            const disabled = isPast || isTooSoon || fullyBooked || tomorrowBlocked;

                            let bg = 'bg-white border border-gray-100';
                            let text = 'text-gray-700';
                            let stateClass = 'hover:border-blue-400 hover:text-blue-600 cursor-pointer rounded-xl';

                            if (disabled) {
                              bg = 'bg-gray-50 border-transparent';
                              text = fullyBooked ? 'text-gray-300' : 'text-gray-300';
                              stateClass = 'cursor-not-allowed rounded-xl';
                            } else if (isSelected || isCheckoutDay) {
                              bg = 'bg-blue-600 border-blue-600';
                              text = 'text-white';
                              stateClass = 'shadow-md cursor-pointer ring-4 ring-blue-500/20 rounded-xl z-10 relative';
                            } else if (inRange) {
                              bg = 'bg-blue-50 border-blue-100';
                              text = 'text-blue-700 font-bold';
                              stateClass = 'cursor-pointer rounded-lg';
                            }

                            return (
                              <button
                                key={`day-${toDateKey(day)}`}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleDateSelect(day)}
                                className={`h-9 flex items-center justify-center font-bold text-[10px] transition-all ${bg} ${text} ${stateClass}`}
                              >
                                {day.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Confirm */}
                      <div className="pt-1.5 mt-1.5 border-t border-gray-100 bg-white">
                        <button
                          type="button"
                          onClick={() => setCalendarOpen(false)}
                          className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                        >
                          Confirm Dates
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── ROOM & NIGHTS CONTROLS ─── */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Nights */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Nights</label>
                    <div className="flex items-center border border-gray-200 bg-white rounded-2xl overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() => setNumberOfNights((prev) => Math.max(1, prev - 1))}
                        disabled={numberOfNights <= 1}
                        className="w-9 h-9 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                      >
                        <i className="fas fa-minus text-[10px]"></i>
                      </button>
                      <span className="flex-1 text-center text-xs font-bold text-gray-900">{numberOfNights}</span>
                      <button
                        type="button"
                        onClick={() => setNumberOfNights((prev) => Math.min(30, prev + 1))}
                        disabled={numberOfNights >= 30}
                        className="w-9 h-9 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                      >
                        <i className="fas fa-plus text-[10px]"></i>
                      </button>
                    </div>
                  </div>

                  {/* Rooms */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Rooms</label>
                    <div className="flex items-center border border-gray-200 bg-white rounded-2xl overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() => setRoomQuantity((prev) => Math.max(1, prev - 1))}
                        disabled={roomQuantity <= 1}
                        className="w-9 h-9 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                      >
                        <i className="fas fa-minus text-[10px]"></i>
                      </button>
                      <span className="flex-1 text-center text-xs font-bold text-gray-900">{roomQuantity}</span>
                      <button
                        type="button"
                        onClick={() => setRoomQuantity((prev) => Math.min(Math.max(1, availabilityForStay), prev + 1))}
                        disabled={availabilityForStay <= roomQuantity}
                        className="w-9 h-9 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                      >
                        <i className="fas fa-plus text-[10px]"></i>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ─── PER‑ROOM GUEST CONTROLS ─── */}
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                  {Array.from({ length: roomQuantity }).map((_, idx) => {
                    const roomAdults = perRoomAdults[idx] || capacityMin;
                    const roomKids = perRoomKids[idx] || 0;
                    const roomTotal = roomAdults + roomKids;
                    return (
                      <div key={idx} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                        <p className="text-[10px] font-bold text-gray-500 mb-1">Room {idx + 1}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Adults */}
                          <div>
                            <label className="text-[9px] font-bold text-gray-400">Adults</label>
                            <div className="flex items-center border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm mt-0.5">
                              <button
                                type="button"
                                onClick={() => handleRoomAdultsChange(idx, false)}
                                disabled={roomAdults <= 1}
                                className="w-7 h-7 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                              >
                                <i className="fas fa-minus text-[9px]"></i>
                              </button>
                              <span className="flex-1 text-center text-xs font-bold text-gray-900">{roomAdults}</span>
                              <button
                                type="button"
                                onClick={() => handleRoomAdultsChange(idx, true)}
                                disabled={roomTotal >= capacityMax}
                                className="w-7 h-7 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                              >
                                <i className="fas fa-plus text-[9px]"></i>
                              </button>
                            </div>
                          </div>
                          {/* Kids */}
                          <div>
                            <label className="text-[9px] font-bold text-gray-400">Kids</label>
                            <div className="flex items-center border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm mt-0.5">
                              <button
                                type="button"
                                onClick={() => handleRoomKidsChange(idx, false)}
                                disabled={roomKids <= 0}
                                className="w-7 h-7 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                              >
                                <i className="fas fa-minus text-[9px]"></i>
                              </button>
                              <span className="flex-1 text-center text-xs font-bold text-gray-900">{roomKids}</span>
                              <button
                                type="button"
                                onClick={() => handleRoomKidsChange(idx, true)}
                                disabled={roomTotal >= capacityMax}
                                className="w-7 h-7 hover:bg-gray-50 text-gray-600 disabled:opacity-30 transition-colors flex items-center justify-center"
                              >
                                <i className="fas fa-plus text-[9px]"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total Guests Summary & Min/Max Info */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-gray-50/50 rounded-xl p-2 text-left">
                    <p className="text-xs font-semibold text-gray-700">
                      Total Guests: <span className="text-blue-600 font-bold">{totalGuests}</span>
                    </p>
                  </div>
                  <div className="bg-gray-50/50 rounded-xl p-2 text-center">
                    <p className="text-xs font-semibold text-gray-700">
                      Min {minTotalGuests} · Max {maxTotalGuests} guests for {roomQuantity} room{roomQuantity > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* ─── TOTAL ─── */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/50 rounded-2xl p-3">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] font-bold text-blue-700/60 uppercase tracking-widest">Estimated Total</p>
                    <p className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded-full shadow-sm">
                      {roomQuantity} room{roomQuantity > 1 ? 's' : ''} · {numberOfNights} night{numberOfNights > 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-xl font-extrabold text-gray-900 tracking-tight mt-1">₱{totalPricePreview.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    ₱{Number(roomData.price || 0).toLocaleString()} × {roomQuantity} × {numberOfNights} night{numberOfNights > 1 ? 's' : ''}
                  </p>
                </div>

                {/* Error */}
                {actionError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-xs text-red-700 font-medium flex items-start gap-2">
                    <i className="fas fa-exclamation-circle mt-0.5 text-red-400"></i>
                    <span>{actionError}</span>
                  </div>
                )}

                {/* Book button */}
                <button
                  onClick={handleBookNow}
                  disabled={authLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-[0_8px_20px_rgb(37,99,235,0.25)] transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authLoading ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <>
                      <span>Book this room</span>
                      <i className="fas fa-arrow-right text-xs"></i>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-gray-400">
                  <i className="fas fa-lock text-[10px]"></i>
                  <p className="text-[9px] font-bold uppercase tracking-widest">Secure booking guaranteed</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* ─── FULLSCREEN GALLERY MODAL ─── */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-3 sm:p-6">
          <button
            type="button"
            onClick={() => setIsGalleryOpen(false)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
            aria-label="Close gallery"
          >
            <i className="fas fa-times"></i>
          </button>

          <div className="max-w-5xl mx-auto h-full flex flex-col justify-center">
            <div className="relative bg-white/10 rounded-3xl overflow-hidden mb-3">
              <img
                src={images[selectedImageIndex]}
                alt={`Gallery image ${selectedImageIndex + 1}`}
                className="w-full max-h-[65vh] object-contain"
              />
              <button
                type="button"
                onClick={handlePrevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
                aria-label="Previous photo"
              >
                <i className="fas fa-chevron-left text-sm"></i>
              </button>
              <button
                type="button"
                onClick={handleNextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
                aria-label="Next photo"
              >
                <i className="fas fa-chevron-right text-sm"></i>
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {images.map((img, index) => (
                <button
                  key={`${img}-${index}-modal`}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`h-14 rounded-2xl overflow-hidden border-2 transition-all ${
                    index === selectedImageIndex ? 'border-white scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt={`Gallery thumb ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* +++ GUEST AUTH MODAL +++ */}
      <GuestAuthModal
        isOpen={isAuthModalOpen}
        onClose={handleAuthModalClose}
      />

      <ChatBot />
    </GuestLayout>
  );
}