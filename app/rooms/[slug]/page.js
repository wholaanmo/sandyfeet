'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const CHECK_IN_OPTIONS = [14, 15, 16];
const CHECK_OUT_OPTIONS = [10, 11, 12, 13];

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

  const [roomData, setRoomData] = useState(null);
  const [roomUnitsById, setRoomUnitsById] = useState({});
  const [loading, setLoading] = useState(true);

  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [checkInDate, setCheckInDate] = useState('');
  const [numberOfNights, setNumberOfNights] = useState(1);
  const [checkInHour, setCheckInHour] = useState(14);
  const [checkOutHour, setCheckOutHour] = useState(12);
  const [roomQuantity, setRoomQuantity] = useState(1);
  const [selectedTotalGuests, setSelectedTotalGuests] = useState(1);
  const [draftApplied, setDraftApplied] = useState(false);

  const [availabilityForStay, setAvailabilityForStay] = useState(0);
  const [actionError, setActionError] = useState('');

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const images = useMemo(() => {
    if (roomData?.images?.length) return roomData.images;
    return defaultGallery;
  }, [roomData]);

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

    for (let i = 0; i < firstDay; i++) {
      entries.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      entries.push(new Date(year, month, day));
    }

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

  const openDateModal = () => {
    if (checkInDateObject) {
      setCurrentMonth(new Date(checkInDateObject.getFullYear(), checkInDateObject.getMonth(), 1));
    }
    setIsDateModalOpen(true);
  };

  const handleDateSelect = (date) => {
    if (isDatePast(date) || isDateTooSoon(date)) return;
    setCheckInDate(toDateKey(date));
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  useEffect(() => {
    document.body.style.overflow = isGalleryOpen || isDateModalOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isGalleryOpen, isDateModalOpen]);

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
        unitsMap[docSnap.id] = {
          totalRooms,
          maintenanceRooms,
          availableUnits
        };
        totalUnits += availableUnits;
      });

      if (match) {
        setRoomData({
          ...match,
          roomIds,
          availableRooms: totalUnits
        });
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
          const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          const roomId = booking.roomId;
          const numberOfRooms = booking.numberOfRooms || 1;

          if (!checkIn || !checkOut || checkOut <= checkIn || !roomId) return;

          const current = new Date(checkIn);
          while (current < checkOut) {
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

  const calculateAvailabilityForStay = (startDateString) => {
    if (!roomData?.roomIds?.length) return 0;
    if (!startDateString) return roomData.availableRooms || 0;

    const startDate = new Date(startDateString);
    startDate.setHours(checkInHour, 0, 0, 0);

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
  }, [
    roomData,
    checkInDate,
    numberOfNights,
    checkInHour,
    bookedDates,
    blockedSlots,
    roomUnitsById
  ]);

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
              setCheckInDate(toDateKey(draftDate));
            }
          }

          if (draft.numberOfNights) {
            setNumberOfNights(Math.min(30, Math.max(1, Number(draft.numberOfNights) || 1)));
          }

          if (draft.checkInHour) {
            setCheckInHour(Number(draft.checkInHour));
          }

          if (draft.checkOutHour) {
            setCheckOutHour(Number(draft.checkOutHour));
          }

          quantity = Math.min(maxQuantity, Math.max(1, Number(draft.quantity) || 1));
          totalGuests = Number(draft.totalGuests) || (quantity * (roomData.capacityMin || 1));
        }
      }
    } catch {
      // no-op for malformed draft payload
    }

    setRoomQuantity(quantity);

    const minGuests = quantity * (roomData.capacityMin || 1);
    const maxGuests = quantity * (roomData.capacityMax || Math.max(1, roomData.capacityMin || 1));
    setSelectedTotalGuests(Math.min(maxGuests, Math.max(minGuests, totalGuests)));
    setDraftApplied(true);
  }, [roomData, draftApplied]);

  useEffect(() => {
    if (!roomData) return;

    const minGuests = roomQuantity * (roomData.capacityMin || 1);
    const maxGuests = roomQuantity * (roomData.capacityMax || Math.max(1, roomData.capacityMin || 1));

    setSelectedTotalGuests((prev) => {
      const value = Number(prev) || minGuests;
      return Math.min(maxGuests, Math.max(minGuests, value));
    });
  }, [roomQuantity, roomData]);

  const handleNextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrevImage = () => {
    setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleBookNow = () => {
    setActionError('');

    if (!checkInDate) {
      setActionError('Please select a check-in date first.');
      return;
    }

    if (availabilityForStay <= 0) {
      setActionError('No available rooms for the selected schedule. Please change dates or time.');
      return;
    }

    if (roomQuantity > availabilityForStay) {
      setActionError(`Only ${availabilityForStay} room(s) are available for your selected stay.`);
      return;
    }

    const minGuests = roomQuantity * (roomData.capacityMin || 1);
    const maxGuests = roomQuantity * (roomData.capacityMax || Math.max(1, roomData.capacityMin || 1));
    const normalizedGuests = Number(selectedTotalGuests) || minGuests;

    if (normalizedGuests < minGuests || normalizedGuests > maxGuests) {
      setActionError(`Guests must be between ${minGuests} and ${maxGuests} for ${roomQuantity} room(s).`);
      return;
    }

    const checkIn = new Date(checkInDate);
    checkIn.setHours(checkInHour, 0, 0, 0);

    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + numberOfNights);
    checkOut.setHours(checkOutHour, 0, 0, 0);

    const totalGuests = normalizedGuests;
    const totalPrice = (roomData.price || 0) * roomQuantity * numberOfNights;

    const bookingData = {
      selectedRooms: {
        [roomData.type]: roomQuantity
      },
      totalGuestsPerType: {
        [roomData.type]: totalGuests
      },
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
      roomTypes: [
        {
          type: roomData.type,
          quantity: roomQuantity,
          totalGuests,
          price: roomData.price,
          roomIds: roomData.roomIds || [roomData.id],
          capacityMin: roomData.capacityMin,
          capacityMax: roomData.capacityMax
        }
      ]
    };

    sessionStorage.setItem('multiRoomBooking', JSON.stringify(bookingData));
    router.push('/rooms/multi-room-booking');
  };

  if (loading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-4xl text-blue-500"></i>
        </div>
      </GuestLayout>
    );
  }

  if (!roomData) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 flex flex-col items-center">
          <i className="fas fa-bed text-6xl text-gray-300 mb-4"></i>
          <h1 className="text-3xl font-playfair font-bold text-gray-900">Room Not Found</h1>
          <p className="text-gray-500 mt-2">The room you are looking for does not exist or is unavailable.</p>
          <button
            onClick={() => router.push('/rooms')}
            className="mt-6 px-6 py-2.5 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-colors"
          >
            Back to Rooms
          </button>
        </div>
      </GuestLayout>
    );
  }

  const totalPricePreview = (roomData.price || 0) * roomQuantity * numberOfNights;

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-4">
            <button
              onClick={() => router.push('/rooms')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <i className="fas fa-arrow-left text-[10px]"></i>
              Back to Rooms
            </button>
          </div>

          <nav className="w-full md:w-[540px] bg-gradient-to-r from-white/95 via-white/85 to-transparent backdrop-blur-sm border border-gray-200 border-r-0 rounded-l-xl px-3 py-2 text-gray-600 text-xs font-semibold mb-5 uppercase tracking-wider shadow-sm" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-2">
              <li>
                <button onClick={() => router.push('/')} className="hover:text-blue-500 transition-colors">Home</button>
              </li>
              <li><i className="fas fa-chevron-right text-[10px]"></i></li>
              <li>
                <button onClick={() => router.push('/rooms')} className="hover:text-blue-500 transition-colors">Rooms</button>
              </li>
              <li><i className="fas fa-chevron-right text-[10px]"></i></li>
              <li className="text-gray-900" aria-current="page">{roomData.type}</li>
            </ol>
          </nav>

          <div className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-4xl font-playfair font-extrabold text-gray-900 tracking-tight">
                {roomData.type}
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 h-auto md:h-[430px] mb-7">
            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-4 gap-2 h-[240px] md:h-full rounded-2xl overflow-hidden shadow-sm">
              <div
                onClick={() => setIsGalleryOpen(true)}
                className="md:col-span-3 w-full h-[240px] md:h-full relative group overflow-hidden bg-gray-100"
              >
                <img
                  src={images[selectedImageIndex]}
                  alt={`${roomData.type} main`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrevImage();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 text-white hover:bg-black/55 transition-colors"
                  aria-label="Previous photo"
                >
                  <i className="fas fa-chevron-left text-xs"></i>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextImage();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 text-white hover:bg-black/55 transition-colors"
                  aria-label="Next photo"
                >
                  <i className="fas fa-chevron-right text-xs"></i>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextImage();
                  }}
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-white/90 text-gray-800 text-[11px] font-bold uppercase tracking-wider hover:bg-white transition-colors"
                >
                  Change photo
                </button>
              </div>
              <div className="hidden md:flex md:col-span-1 flex-col gap-2 h-full">
                {[1, 2].map((offset) => {
                  const imgIndex = (selectedImageIndex + offset) % images.length;
                  return (
                    <button
                      key={`preview-${offset}-${imgIndex}`}
                      onClick={() => {
                        setSelectedImageIndex(imgIndex);
                        setIsGalleryOpen(true);
                      }}
                      className="h-1/2 w-full relative group overflow-hidden bg-gray-100"
                    >
                      <img
                        src={images[imgIndex]}
                        alt={`Room gallery ${imgIndex + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                      />
                      <div className="absolute inset-0 bg-black/15 group-hover:bg-black/5 transition-colors"></div>
                      {offset === 2 && images.length > 3 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors">
                          <span className="text-white font-bold text-lg">+ See all photos</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-1 relative bg-[#fffdf8] rounded-2xl border border-amber-200 shadow-sm p-3 flex flex-col justify-between overflow-hidden">
              <span className="absolute -left-2 top-12 w-4 h-4 rounded-full bg-[#F8FCFF] border border-amber-200"></span>
              <span className="absolute -right-2 top-12 w-4 h-4 rounded-full bg-[#F8FCFF] border border-amber-200"></span>
              <div>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.2em]">Starting from</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-gray-900 tracking-tight">₱{Number(roomData.price || 0).toLocaleString()}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">/night</span>
                </div>
                <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                  {availabilityForStay} left
                </div>
              </div>

              <div className="mt-3 border-t border-dashed border-amber-300 pt-3 space-y-2 text-[11px] text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Check-in</span>
                  <span className="font-semibold text-gray-800">02:00 PM</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Check-out</span>
                  <span className="font-semibold text-gray-800">12:00 PM</span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-amber-300 pt-2 mt-1">
                  <span className="font-semibold">Status</span>
                  <span className="font-bold text-emerald-700">Available</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-dashed border-amber-300 space-y-2.5">
                <h3 className="font-bold text-gray-800 text-[11px] uppercase tracking-wider">Stay Options</h3>

                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Check-in Date</label>
                  <button
                    type="button"
                    onClick={openDateModal}
                    className="w-full px-2.5 py-2 border border-amber-200 bg-white rounded-2xl text-xs text-left flex items-center justify-between hover:border-blue-400 transition-colors"
                  >
                    <span className={checkInDateObject ? 'text-gray-800 font-semibold' : 'text-gray-400'}>
                      {checkInDateObject
                        ? checkInDateObject.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Select check-in date'}
                    </span>
                    <i className="fas fa-calendar-alt text-blue-500"></i>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-700 block mb-1">Nights</label>
                    <div className="flex items-center border border-amber-200 bg-white rounded-xl overflow-hidden">
                      <button
                        onClick={() => setNumberOfNights((prev) => Math.max(1, prev - 1))}
                        className="w-7 h-7 hover:bg-amber-50 text-gray-700"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-bold">{numberOfNights}</span>
                      <button
                        onClick={() => setNumberOfNights((prev) => Math.min(30, prev + 1))}
                        className="w-7 h-7 hover:bg-amber-50 text-gray-700"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-700 block mb-1">Rooms</label>
                    <div className="flex items-center border border-amber-200 bg-white rounded-xl overflow-hidden">
                      <button
                        onClick={() => setRoomQuantity((prev) => Math.max(1, prev - 1))}
                        className="w-7 h-7 hover:bg-amber-50 text-gray-700"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-bold">{roomQuantity}</span>
                      <button
                        onClick={() => setRoomQuantity((prev) => Math.min(Math.max(1, availabilityForStay), prev + 1))}
                        className="w-7 h-7 hover:bg-amber-50 text-gray-700 disabled:opacity-40"
                        disabled={availabilityForStay <= roomQuantity}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-6">
              <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                <h2 className="text-base font-bold text-gray-900 mb-4 uppercase tracking-widest text-[12px]">Gallery</h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {images.map((img, index) => (
                    <button
                      key={`${img}-${index}`}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`relative h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                        index === selectedImageIndex ? 'border-blue-500' : 'border-transparent hover:border-blue-200'
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                <h2 className="text-xl font-bold text-gray-900 mb-3 font-playfair">About this accommodation</h2>
                <p className="text-sm leading-relaxed text-gray-600">
                  {roomData.description || `Experience comfort and relaxation in our ${roomData.type.toLowerCase()}. Enjoy easy access to camp facilities, great ambiance, and a restful stay.`}
                </p>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xs">
                      <i className="fas fa-user-friends"></i>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">{roomData.capacityMin}-{roomData.capacityMax} guests</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xs">
                      <i className="fas fa-door-closed"></i>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">{availabilityForStay} available now</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xs">
                      <i className="fas fa-tag"></i>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">PHP {Number(roomData.price || 0).toLocaleString()} / night</span>
                  </div>
                </div>
              </section>
            </div>

            <aside className="lg:col-span-4 lg:sticky lg:top-24">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_12px_40px_rgb(0,0,0,0.06)] p-4 w-full space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl p-3.5">
                  <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Selected Room Details</h3>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-800 truncate pr-2">{roomData.type}</p>
                    <p className="text-xs font-bold text-blue-600">₱{Number(roomData.price || 0).toLocaleString()}<span className="text-[10px] text-gray-400"> /night</span></p>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-gray-50 border border-gray-100 text-gray-600">Airconditioned</span>
                    <span className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-gray-50 border border-gray-100 text-gray-600">Common bathroom</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                    <span className="font-semibold">Room Quantity</span>
                    <span className="font-bold text-gray-800">{roomQuantity} room{roomQuantity > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-gray-600">Total Guests</label>
                    <input
                      type="number"
                      min={roomQuantity * (roomData.capacityMin || 1)}
                      max={roomQuantity * (roomData.capacityMax || Math.max(1, roomData.capacityMin || 1))}
                      value={selectedTotalGuests}
                      onChange={(e) => setSelectedTotalGuests(e.target.value)}
                      className="w-20 text-xs font-bold border border-gray-200 bg-gray-50 rounded-md px-2 py-1 text-center focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">
                    Allowed guests: {roomQuantity * (roomData.capacityMin || 1)} - {roomQuantity * (roomData.capacityMax || Math.max(1, roomData.capacityMin || 1))}
                  </p>
                </div>

                <div className="bg-[#F8FCFF] border border-blue-100 rounded-xl p-3.5">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Estimated Total</p>
                    <p className="text-xl font-extrabold text-gray-900">₱{totalPricePreview.toLocaleString()}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    PHP {Number(roomData.price || 0).toLocaleString()} x {roomQuantity} room{roomQuantity > 1 ? 's' : ''} x {numberOfNights} night{numberOfNights > 1 ? 's' : ''}
                  </p>
                </div>

                {actionError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">
                    <i className="fas fa-exclamation-triangle mr-1"></i>
                    {actionError}
                  </div>
                )}

                <button
                  onClick={handleBookNow}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2"
                >
                  Book this room
                  <i className="fas fa-arrow-right text-sm"></i>
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {isGalleryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 sm:p-6">
          <button
            type="button"
            onClick={() => setIsGalleryOpen(false)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="Close gallery"
          >
            <i className="fas fa-times"></i>
          </button>

          <div className="max-w-5xl mx-auto h-full flex flex-col justify-center">
            <div className="relative bg-white/10 rounded-2xl overflow-hidden mb-3">
              <img
                src={images[selectedImageIndex]}
                alt={`Gallery image ${selectedImageIndex + 1}`}
                className="w-full max-h-[65vh] object-contain"
              />
              <button
                type="button"
                onClick={handlePrevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white hover:bg-black/55 transition-colors"
                aria-label="Previous photo"
              >
                <i className="fas fa-chevron-left text-sm"></i>
              </button>
              <button
                type="button"
                onClick={handleNextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white hover:bg-black/55 transition-colors"
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
                  className={`h-14 rounded-md overflow-hidden border-2 ${
                    index === selectedImageIndex ? 'border-white' : 'border-transparent'
                  }`}
                >
                  <img src={img} alt={`Gallery thumb ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isDateModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setIsDateModalOpen(false)}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />

          <div className="relative bg-white w-full max-w-[340px] rounded-[2rem] shadow-2xl p-6 z-10 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold font-playfair text-gray-900 leading-tight">Select<br />Dates</h2>
                <p className="text-xs text-gray-500 font-medium mt-1">When are you arriving?</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDateModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                aria-label="Close date picker"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pb-6 scrollbar-hide">
              <div className="flex justify-between items-center mb-5 px-1">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="w-8 h-8 flex justify-center items-center text-gray-400 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors"
                >
                  <i className="fas fa-chevron-left text-[10px]"></i>
                </button>
                <h2 className="font-bold text-gray-800 text-sm tracking-wide">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h2>
                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="w-8 h-8 flex justify-center items-center text-gray-400 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors"
                >
                  <i className="fas fa-chevron-right text-[10px]"></i>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-400 py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-x-1 gap-y-1.5">
                {days.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`}></div>;

                  const isPast = isDatePast(day);
                  const isTooSoon = isDateTooSoon(day);
                  const isSelected = checkInDateObject && checkInDateObject.toDateString() === day.toDateString();

                  let bg = 'bg-white border border-gray-100';
                  let text = 'text-gray-700';
                  let stateClass = 'hover:border-blue-400 hover:text-blue-600 cursor-pointer';

                  if (isPast || isTooSoon) {
                    bg = 'bg-gray-50 border-transparent';
                    text = 'text-gray-300';
                    stateClass = 'cursor-not-allowed';
                  } else if (isSelected) {
                    bg = 'bg-blue-500 border-blue-500';
                    text = 'text-white';
                    stateClass = 'shadow-md cursor-pointer ring-4 ring-blue-500/20';
                  }

                  return (
                    <button
                      key={`day-${toDateKey(day)}`}
                      type="button"
                      disabled={isPast || isTooSoon}
                      onClick={() => handleDateSelect(day)}
                      className={`aspect-square rounded-[10px] flex items-center justify-center font-bold text-xs transition-all ${bg} ${text} ${stateClass}`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 bg-[#F8FCFF] border border-blue-100/50 p-4 rounded-2xl relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Duration</h3>
                    <p className="text-[10px] uppercase font-bold text-blue-500/70 tracking-widest mt-0.5">Nights</p>
                  </div>
                  <div className="flex items-center bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setNumberOfNights((prev) => Math.max(1, prev - 1))}
                      disabled={numberOfNights <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >
                      <i className="fas fa-minus text-[10px]"></i>
                    </button>
                    <span className="font-bold text-sm w-8 text-center text-gray-800">{numberOfNights}</span>
                    <button
                      type="button"
                      onClick={() => setNumberOfNights((prev) => Math.min(30, prev + 1))}
                      disabled={numberOfNights >= 30}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >
                      <i className="fas fa-plus text-[10px]"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsDateModalOpen(false)}
                className="w-full py-3.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-colors shadow-lg shadow-gray-900/20"
              >
                Confirm Dates
              </button>
            </div>
          </div>
        </div>
      )}
    </GuestLayout>
  );
}
