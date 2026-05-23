// app/rooms/page.js
'use client';


import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import ChatBot from '@/components/guest/ChatBot';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { normalizeDayTourDateKey, toLocalDateKey } from '@/lib/reservationAvailability';

function RoomsPageContent() {
  const router = useRouter();
  const { user } = useGuestAuth();
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState({});
  // Per‑room guest arrays: perRoomGuests[roomType] = [{ adults, kids }, ...]
  const [perRoomGuests, setPerRoomGuests] = useState({});
  const [guestInputErrors, setGuestInputErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [checkInDate, setCheckInDate] = useState(null);
  const [checkOutDate, setCheckOutDate] = useState(null);
  const [numberOfNights, setNumberOfNights] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [dayTourBlockedDates, setDayTourBlockedDates] = useState({});
  const [roomDetailsMap, setRoomDetailsMap] = useState({});
  const [specialRequest, setSpecialRequest] = useState('');
  const [dateSelectionError, setDateSelectionError] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState({});
  const [roomAvailability, setRoomAvailability] = useState({});
  const [unitLevelAvailability, setUnitLevelAvailability] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkInHour, setCheckInHour] = useState(14);
  const [checkOutHour, setCheckOutHour] = useState(12);
  const [activeCategory, setActiveCategory] = useState('All Rooms');
  const [isExclusiveResortBooking, setIsExclusiveResortBooking] = useState(false);
  const [exclusiveAdults, setExclusiveAdults] = useState(1);
  const [exclusiveKids, setExclusiveKids] = useState(0);
  const [exclusiveGuestError, setExclusiveGuestError] = useState('');
  const [tentCount, setTentCount] = useState(0);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  const CHECK_IN_OPTIONS = [14, 15, 16];
  const CHECK_OUT_OPTIONS = [10, 11, 12, 13];

  const formatHour = (hour) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const normalized = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(normalized).padStart(2, '00')}:00 ${period}`;
  };

  const toRoomSlug = (value) => {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const checkInDisplay = formatHour(checkInHour);
  const checkOutDisplay = formatHour(checkOutHour);
  const nightlyHours = Math.max(1, 24 - checkInHour + checkOutHour);
  const ROOMS_CHECKOUT_CACHE_KEY = 'roomsCheckoutDraft';
  const BASE_EXCLUSIVE_PRICE = 22500;

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const getExclusivePackagePrice = () => {
    return BASE_EXCLUSIVE_PRICE + (tentCount * 1500);
  };

  const resetToInitialState = () => {
    sessionStorage.removeItem('multiRoomBooking');
    sessionStorage.removeItem(ROOMS_CHECKOUT_CACHE_KEY);
    sessionStorage.removeItem('roomsPageState');
    sessionStorage.removeItem('roomDetailDraft');

    setSelectedRooms({});
    setPerRoomGuests({});
    setGuestInputErrors({});
    setCheckInDate(null);
    setCheckOutDate(null);
    setNumberOfNights(1);
    setCurrentMonth(new Date());
    setSpecialRequest('');
    setDateSelectionError('');
    setAvailabilityStatus({});
    setRoomAvailability({});
    setUnitLevelAvailability({});
    setIsModalOpen(false);
    setActiveCategory('All Rooms');
    setIsExclusiveResortBooking(false);
    setExclusiveAdults(1);
    setExclusiveKids(0);
    setExclusiveGuestError('');
    setTentCount(0);
  };

  useEffect(() => {
    const checkForBookingReset = () => {
      const resetFlag = sessionStorage.getItem('resetRoomsPage');
      if (resetFlag === 'true') {
        sessionStorage.removeItem('resetRoomsPage');
        resetToInitialState();
      }
    };
    checkForBookingReset();
    window.addEventListener('storage', checkForBookingReset);
    return () => window.removeEventListener('storage', checkForBookingReset);
  }, []);

  // Fetch available room types
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true), where('availability', '==', 'available'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const types = [];
      const roomDetails = {};

      querySnapshot.forEach((doc) => {
        const roomData = doc.data();
        const roomType = roomData.type;

        const existingType = types.find(t => t.type === roomType);
        if (existingType) {
          existingType.totalRooms += roomData.totalRooms || 1;
          existingType.maintenanceRooms += roomData.maintenanceRooms || 0;
          existingType.availableRooms += (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0);
          existingType.roomIds.push(doc.id);
          // Merge inclusions (take unique values from both arrays)
          if (roomData.inclusions && roomData.inclusions.length > 0) {
            const mergedInclusions = [...new Set([...existingType.inclusions, ...roomData.inclusions])];
            existingType.inclusions = mergedInclusions;
          }
        } else {
          types.push({
            id: doc.id,
            type: roomType,
            price: roomData.price,
            capacityMin: roomData.capacityMin,
            capacityMax: roomData.capacityMax,
            description: roomData.description,
            images: roomData.images || [],
            inclusions: roomData.inclusions || [],  // Include inclusions field
            totalRooms: roomData.totalRooms || 1,
            maintenanceRooms: roomData.maintenanceRooms || 0,
            availableRooms: (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0),
            roomIds: [doc.id]
          });
        }

        roomDetails[roomType] = {
          ...roomDetails[roomType],
          [doc.id]: roomData
        };
      });

      setAvailableRoomTypes(types);
      setRoomDetailsMap(roomDetails);

      const initialSelected = {};
      const initialPerRoom = {};
      types.forEach(type => {
        initialSelected[type.type] = 0;
        initialPerRoom[type.type] = [];
      });

      try {
        const transientState = sessionStorage.getItem('roomsPageState');
        const cachedState = sessionStorage.getItem(ROOMS_CHECKOUT_CACHE_KEY);
        const savedState = transientState || cachedState;
        if (savedState) {
          const parsed = JSON.parse(savedState);
          if (transientState) sessionStorage.removeItem('roomsPageState');

          if (parsed.selectedRooms) {
            Object.keys(parsed.selectedRooms).forEach(roomType => {
              if (roomType in initialSelected) {
                initialSelected[roomType] = parsed.selectedRooms[roomType];
              }
            });
          }

          if (parsed.perRoomGuests) {
            Object.keys(parsed.perRoomGuests).forEach(roomType => {
              if (roomType in initialPerRoom) {
                initialPerRoom[roomType] = parsed.perRoomGuests[roomType];
              }
            });
          } else if (parsed.adultsPerType && parsed.kidsPerType) {
            // Legacy fallback
            for (const roomType of types) {
              const qty = initialSelected[roomType.type] || 0;
              if (qty > 0) {
                const totalAdults = parsed.adultsPerType[roomType.type] || 1;
                const totalKids = parsed.kidsPerType[roomType.type] || 0;
                const baseAdults = Math.floor(totalAdults / qty);
                const remainder = totalAdults % qty;
                const guestsArray = [];
                for (let i = 0; i < qty; i++) {
                  guestsArray.push({
                    adults: baseAdults + (i < remainder ? 1 : 0),
                    kids: Math.floor(totalKids / qty)
                  });
                }
                initialPerRoom[roomType.type] = guestsArray;
              }
            }
          }

          if (parsed.checkInDate) {
            const restoredDate = new Date(parsed.checkInDate);
            if (!Number.isNaN(restoredDate.getTime())) {
              restoredDate.setHours(parsed.checkInHour || 14, 0, 0, 0);
              setCheckInDate(restoredDate);
            }
          }
          if (parsed.numberOfNights) setNumberOfNights(parsed.numberOfNights);
          if (parsed.checkInHour) setCheckInHour(parsed.checkInHour);
          if (parsed.checkOutHour) setCheckOutHour(parsed.checkOutHour);
          if (parsed.specialRequest) setSpecialRequest(parsed.specialRequest);
          if (parsed.activeCategory) setActiveCategory(parsed.activeCategory);
          if (typeof parsed.isExclusiveResortBooking === 'boolean') {
            setIsExclusiveResortBooking(parsed.isExclusiveResortBooking);
          }
          if (parsed.exclusiveAdults != null) {
            setExclusiveAdults(Math.max(1, Number(parsed.exclusiveAdults) || 1));
          }
          if (parsed.exclusiveKids != null) {
            setExclusiveKids(Math.max(0, Number(parsed.exclusiveKids) || 0));
          }
          if (parsed.tentCount != null) {
            setTentCount(Math.max(0, Number(parsed.tentCount) || 0));
          }
        }
      } catch {
        // ignore
      }

      setSelectedRooms(initialSelected);
      setPerRoomGuests(initialPerRoom);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching rooms:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updatePerRoomGuests = (roomType, newQuantity) => {
    const oldGuests = perRoomGuests[roomType] || [];
    const newGuests = [];
    const typeData = availableRoomTypes.find(t => t.type === roomType);
    const minPerUnit = typeData?.capacityMin || 1;
    const maxPerUnit = typeData?.capacityMax || minPerUnit;

    for (let i = 0; i < newQuantity; i++) {
      if (i < oldGuests.length) {
        newGuests.push({ ...oldGuests[i] });
      } else {
        newGuests.push({ adults: minPerUnit, kids: 0 });
      }
    }
    for (let i = 0; i < newGuests.length; i++) {
      let { adults, kids } = newGuests[i];
      const total = adults + kids;
      if (total < minPerUnit) {
        adults = minPerUnit - kids;
        if (adults < 1) adults = 1;
      } else if (total > maxPerUnit) {
        const diff = total - maxPerUnit;
        if (kids >= diff) kids -= diff;
        else {
          adults -= (diff - kids);
          kids = 0;
        }
      }
      if (adults < 1) adults = 1;
      newGuests[i] = { adults, kids };
    }
    setPerRoomGuests(prev => ({ ...prev, [roomType]: newGuests }));
  };

  const handleQuantityChange = (roomType, increment) => {
    if (isExclusiveResortBooking) {
      setIsExclusiveResortBooking(false);
      setTentCount(0);
    }
    const typeData = availableRoomTypes.find(t => t.type === roomType);
    const maxAvailable = checkInDate
      ? (unitLevelAvailability[roomType] || typeData?.availableRooms || 1)
      : (typeData?.availableRooms || 1);
    const currentQuantity = selectedRooms[roomType] || 0;
    let newQuantity = currentQuantity;

    if (increment) {
      newQuantity = Math.min(currentQuantity + 1, maxAvailable);
    } else {
      newQuantity = Math.max(0, currentQuantity - 1);
    }

    setSelectedRooms(prev => ({ ...prev, [roomType]: newQuantity }));
    updatePerRoomGuests(roomType, newQuantity);

    if (roomType === 'Tent') {
      setTentCount(newQuantity);
    }

    setGuestInputErrors(prev => ({ ...prev, [roomType]: '' }));
  };

  const handleUnitGuestChange = (roomType, unitIndex, guestType, value) => {
    if (isExclusiveResortBooking) {
      setIsExclusiveResortBooking(false);
      setTentCount(0);
    }
    const quantity = selectedRooms[roomType] || 0;
    if (quantity === 0) return;

    const typeData = availableRoomTypes.find(t => t.type === roomType);
    const maxPerUnit = typeData?.capacityMax || 10;
    const minPerUnit = typeData?.capacityMin || 1;

    const parsedValue = Number.parseInt(value, 10);
    const normalized = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue);

    const currentGuests = [...(perRoomGuests[roomType] || [])];
    if (!currentGuests[unitIndex]) currentGuests[unitIndex] = { adults: minPerUnit, kids: 0 };
    let { adults, kids } = currentGuests[unitIndex];

    if (guestType === 'adults') {
      adults = normalized;
    } else {
      kids = normalized;
    }

    const total = adults + kids;
    let error = '';
    if (adults < 1) error = 'At least 1 adult per room.';
    else if (total < minPerUnit) error = `Minimum ${minPerUnit} guests per room.`;
    else if (total > maxPerUnit) error = `Maximum ${maxPerUnit} guests per room.`;

    if (!error) {
      currentGuests[unitIndex] = { adults, kids };
      setPerRoomGuests(prev => ({ ...prev, [roomType]: currentGuests }));
    }
    setGuestInputErrors(prev => ({ ...prev, [`${roomType}-${unitIndex}`]: error }));
  };

  const getAggregatedGuestCounts = (roomType) => {
    const guests = perRoomGuests[roomType] || [];
    let totalAdults = 0, totalKids = 0;
    for (const g of guests) {
      totalAdults += g.adults;
      totalKids += g.kids;
    }
    return { totalAdults, totalKids, totalGuests: totalAdults + totalKids };
  };

  // Fetch bookings (unchanged)
  useEffect(() => {
    if (availableRoomTypes.length === 0) return;
    const allRoomIds = availableRoomTypes.flatMap(type => type.roomIds);
    if (allRoomIds.length === 0) return;
    const bookingsRef = collection(db, 'bookings');
    const roomIdChunks = chunk(allRoomIds, 10);
    const unsubscribes = [];
    const snapshotsByChunk = {};

    const getMaxUnitsForRoomId = (roomId) => {
      for (const roomType of availableRoomTypes) {
        const detail = roomDetailsMap[roomType.type]?.[roomId];
        if (!detail) continue;
        const totalRooms = detail.totalRooms || 1;
        const maintenanceRooms = detail.maintenanceRooms || 0;
        return Math.max(0, totalRooms - maintenanceRooms);
      }
      return 1;
    };

    const buildBookedIndex = () => {
      const booked = {};
      Object.values(snapshotsByChunk).forEach((querySnapshot) => {
        querySnapshot.forEach((docSnap) => {
          const booking = docSnap.data();
          const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          const roomId = booking.roomId;
          const numberOfRooms = booking.numberOfRooms || 1;
          if (!checkIn || !checkOut || checkOut <= checkIn) return;
          const current = new Date(checkIn);
          while (current < checkOut) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            const hour = current.getHours();
            if (booking.isExclusiveResortBooking) {
              if (!booked[dateStr]) booked[dateStr] = {};
              for (const targetRoomId of allRoomIds) {
                const maxUnits = getMaxUnitsForRoomId(targetRoomId);
                if (!booked[dateStr][targetRoomId]) booked[dateStr][targetRoomId] = {};
                booked[dateStr][targetRoomId][hour] = (booked[dateStr][targetRoomId][hour] || 0) + maxUnits;
              }
            } else {
              if (!booked[dateStr]) booked[dateStr] = {};
              if (!booked[dateStr][roomId]) booked[dateStr][roomId] = {};
              booked[dateStr][roomId][hour] = (booked[dateStr][roomId][hour] || 0) + numberOfRooms;
            }
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
  }, [availableRoomTypes, roomDetailsMap]);

  // Persist draft
  useEffect(() => {
    if (loading || availableRoomTypes.length === 0) return;
    const draft = {
      selectedRooms,
      perRoomGuests,
      checkInDate: checkInDate ? checkInDate.toISOString() : null,
      numberOfNights,
      checkInHour,
      checkOutHour,
      specialRequest,
      activeCategory,
      isExclusiveResortBooking,
      exclusiveAdults,
      exclusiveKids,
      tentCount,
      updatedAt: new Date().toISOString()
    };
    sessionStorage.setItem(ROOMS_CHECKOUT_CACHE_KEY, JSON.stringify(draft));
  }, [
    loading, availableRoomTypes, selectedRooms, perRoomGuests, checkInDate,
    numberOfNights, checkInHour, checkOutHour, specialRequest, activeCategory,
    isExclusiveResortBooking, exclusiveAdults, exclusiveKids, tentCount
  ]);

  // Fetch blocked slots
  useEffect(() => {
    if (availableRoomTypes.length === 0) return;
    const allRoomIds = availableRoomTypes.flatMap(type => type.roomIds);
    if (allRoomIds.length === 0) return;
    const blockedRef = collection(db, 'unavailableSlots');
    const unsubscribe = onSnapshot(blockedRef, (snapshot) => {
      const blocks = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (allRoomIds.includes(data.roomId)) {
          const dateKey = data.date;
          const startHour = data.startHour;
          const endHour = data.endHour;
          const unitsBlocked = data.unitsBlocked || 1;
          if (!blocks[dateKey]) blocks[dateKey] = {};
          if (!blocks[dateKey][data.roomId]) blocks[dateKey][data.roomId] = {};
          for (let hour = startHour; hour < endHour; hour++) {
            blocks[dateKey][data.roomId][hour] = (blocks[dateKey][data.roomId][hour] || 0) + unitsBlocked;
          }
        }
      });
      setBlockedSlots(blocks);
    });
    return () => unsubscribe();
  }, [availableRoomTypes]);

  useEffect(() => {
    const dayTourRef = collection(db, 'dayTourBookings');
    const dayTourQuery = query(
      dayTourRef,
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );

    const unsubscribe = onSnapshot(dayTourQuery, (snapshot) => {
      const blocked = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = normalizeDayTourDateKey(data.selectedDate || data.selectedDateISO);
        if (dateKey) {
          blocked[dateKey] = true;
        }
      });
      setDayTourBlockedDates(blocked);
    }, (error) => {
      console.error('Error fetching day tour blocked dates:', error);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (checkInDate && numberOfNights) {
      const newCheckOutDate = new Date(checkInDate);
      newCheckOutDate.setDate(checkInDate.getDate() + numberOfNights);
      newCheckOutDate.setHours(checkOutHour, 0, 0, 0);
      setCheckOutDate(newCheckOutDate);
    }
  }, [checkInDate, numberOfNights, checkOutHour]);

  useEffect(() => {
    if (checkInDate) {
      const updated = new Date(checkInDate);
      updated.setHours(checkInHour, 0, 0, 0);
      setCheckInDate(updated);
    }
  }, [checkInHour]);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleClickOutside = (event) => {
      const target = event.target;
      if (calendarPopoverRef.current?.contains(target)) return;
      if (calendarTriggerRef.current?.contains(target)) return;
      setIsModalOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModalOpen]);

  const calculateUnitAvailabilityForDate = (date) => {
    if (!date || availableRoomTypes.length === 0) return {};
    const availability = {};
    for (const roomType of availableRoomTypes) {
      let totalAvailable = 0;
      for (const roomId of roomType.roomIds) {
        const roomDetail = roomDetailsMap[roomType.type]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        let minAvailable = maxRooms;
        for (let hour = checkInHour; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
          const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
          minAvailable = Math.min(minAvailable, availableNow);
          if (minAvailable <= 0) break;
        }
        totalAvailable += minAvailable;
      }
      availability[roomType.type] = totalAvailable;
    }
    return availability;
  };

  const getTotalUnitsForRoomType = (roomTypeData) => {
    if (!roomTypeData) return 0;
    let totalUnits = 0;
    for (const roomId of roomTypeData.roomIds || []) {
      const roomDetail = roomDetailsMap[roomTypeData.type]?.[roomId];
      const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
      totalUnits += Math.max(0, maxRooms);
    }
    if (totalUnits > 0) return totalUnits;
    return Math.max(0, Number(roomTypeData.availableRooms || 0));
  };

  const getAvailableUnitsForRoomTypeOnDate = (date, roomTypeData) => {
    if (!date || !roomTypeData) return 0;
    let totalAvailableUnits = 0;
    for (const roomId of roomTypeData.roomIds || []) {
      const roomDetail = roomDetailsMap[roomTypeData.type]?.[roomId];
      const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
      if (maxRooms <= 0) continue;
      let availableForStay = maxRooms;
      for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
        const currentDate = new Date(date);
        currentDate.setDate(date.getDate() + dayOffset);
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        for (let hour = checkInHour; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
          const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
          availableForStay = Math.min(availableForStay, availableNow);
          if (availableForStay <= 0) break;
        }
        if (availableForStay <= 0) break;
      }
      totalAvailableUnits += availableForStay;
    }
    return totalAvailableUnits;
  };

  const getMaxBookedUnitsForRoomTypeOnDate = (date, roomTypeData) => {
    if (!date || !roomTypeData) return 0;
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let totalMaxBooked = 0;
    for (const roomId of roomTypeData.roomIds) {
      let maxForRoom = 0;
      for (let hour = checkInHour; hour < 24; hour++) {
        const booked = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
        maxForRoom = Math.max(maxForRoom, booked);
      }
      totalMaxBooked += maxForRoom;
    }
    return totalMaxBooked;
  };

  // MOVED toLocalDateKey function HERE before it's used
  const toLocalDateKey = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const isDateFullyAvailableForExclusive = (date) => {
    if (!date || availableRoomTypes.length === 0) return false;

    for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
      const currentDate = new Date(date);
      currentDate.setDate(date.getDate() + dayOffset);
      const dateKey = toLocalDateKey(currentDate);
      if (dayTourBlockedDates[dateKey]) return false;
    }

    for (const roomTypeData of availableRoomTypes) {
      const totalUnits = getTotalUnitsForRoomType(roomTypeData);
      if (totalUnits <= 0) return false;

      if (roomTypeData.type === 'Tent') {
        // For Tent, only actual guest reservations block Exclusive.
        // Admin‑blocked slots are ignored.
        const bookedUnits = getMaxBookedUnitsForRoomTypeOnDate(date, roomTypeData);
        if (bookedUnits > 0) return false;
      } else {
        // For all other room types, both guest reservations AND admin blocks matter.
        const availableUnits = getAvailableUnitsForRoomTypeOnDate(date, roomTypeData);
        if (availableUnits < totalUnits) return false;
      }
    }
    return true;
  };

  useEffect(() => {
    if (checkInDate) {
      const availability = calculateUnitAvailabilityForDate(checkInDate);
      setUnitLevelAvailability(availability);
    } else {
      setUnitLevelAvailability({});
    }
  }, [checkInDate, availableRoomTypes, bookedDates, blockedSlots, checkInHour]);

  useEffect(() => {
    if (!checkInDate || availableRoomTypes.length === 0) {
      setRoomAvailability({});
      return;
    }
    const availability = {};
    for (const roomType of availableRoomTypes) {
      let totalAvailable = 0;
      for (const roomId of roomType.roomIds) {
        const roomDetail = roomDetailsMap[roomType.type]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        let availableForStay = maxRooms;
        if (maxRooms <= 0) continue;
        for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
          const currentDate = new Date(checkInDate);
          currentDate.setDate(checkInDate.getDate() + dayOffset);
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          for (let hour = checkInHour; hour < 24; hour++) {
            const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
            const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
            const available = maxRooms - bookedCount - blockedUnits;
            availableForStay = Math.min(availableForStay, available);
            if (availableForStay <= 0) break;
          }
          if (availableForStay <= 0) break;
        }
        totalAvailable += availableForStay;
      }
      availability[roomType.type] = totalAvailable;
    }
    setRoomAvailability(availability);
  }, [checkInDate, numberOfNights, availableRoomTypes, bookedDates, blockedSlots, roomDetailsMap, checkInHour]);

  useEffect(() => {
    if (!isExclusiveResortBooking || availableRoomTypes.length === 0) return;
    if (!checkInDate || !isDateFullyAvailableForExclusive(checkInDate, numberOfNights)) {
      const clearedSelected = {};
      const clearedGuests = {};
      for (const roomType of availableRoomTypes) {
        clearedSelected[roomType.type] = 0;
        clearedGuests[roomType.type] = [];
      }
      setSelectedRooms(clearedSelected);
      setPerRoomGuests(clearedGuests);
      setTentCount(0);
      return;
    }
    const nextSelected = {};
    const nextGuests = {};
    for (const roomType of availableRoomTypes) {
      if (roomType.type === 'Tent') {
        nextSelected[roomType.type] = 0;
        nextGuests[roomType.type] = [];
        continue;
      }
      const qty = Math.max(0, getTotalUnitsForRoomType(roomType));
      const minPerUnit = roomType.capacityMin || 1;
      const guestsArray = [];
      for (let i = 0; i < qty; i++) {
        guestsArray.push({ adults: minPerUnit, kids: 0 });
      }
      nextSelected[roomType.type] = qty;
      nextGuests[roomType.type] = guestsArray;
    }
    setSelectedRooms(nextSelected);
    setPerRoomGuests(nextGuests);
  }, [isExclusiveResortBooking, checkInDate, availableRoomTypes, roomAvailability, numberOfNights, checkInHour, blockedSlots, bookedDates, roomDetailsMap]);

  useEffect(() => {
    if (!checkInDate || !checkOutDate) {
      setAvailabilityStatus({});
      return;
    }
    const status = {};
    let allAvailable = true;
    for (const roomType of availableRoomTypes) {
      const quantity = selectedRooms[roomType.type] || 0;
      if (quantity === 0) continue;
      let totalAvailable = 0;
      for (const roomId of roomType.roomIds) {
        const roomDetail = roomDetailsMap[roomType.type]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        let availableForStay = maxRooms;
        if (maxRooms <= 0) continue;
        for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
          const currentDate = new Date(checkInDate);
          currentDate.setDate(checkInDate.getDate() + dayOffset);
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          for (let hour = checkInHour; hour < 24; hour++) {
            const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
            const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
            const available = maxRooms - bookedCount - blockedUnits;
            availableForStay = Math.min(availableForStay, available);
            if (availableForStay <= 0) break;
          }
          if (availableForStay <= 0) break;
        }
        totalAvailable += availableForStay;
      }
      status[roomType.type] = {
        available: totalAvailable,
        sufficient: totalAvailable >= quantity,
        quantity: quantity
      };
      if (totalAvailable < quantity) allAvailable = false;
    }
    setAvailabilityStatus(status);
    if (!allAvailable && checkInDate) {
      const unavailableTypes = Object.entries(status)
        .filter(([_, s]) => !s.sufficient && s.quantity > 0)
        .map(([type]) => type);
      if (unavailableTypes.length > 0) {
        setDateSelectionError(`Not enough rooms available for: ${unavailableTypes.join(', ')}. Please reduce quantities or select different dates.`);
      } else {
        setDateSelectionError('');
      }
    } else {
      setDateSelectionError('');
    }
  }, [checkInDate, checkOutDate, numberOfNights, selectedRooms, availableRoomTypes, bookedDates, blockedSlots, roomDetailsMap, checkInHour]);

  const handleDateSelect = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBookableDate = new Date();
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    minBookableDate.setHours(0, 0, 0, 0);
    if (date < today) return;
    if (date < minBookableDate) return;
    const selected = new Date(date);
    selected.setHours(checkInHour, 0, 0, 0);
    setCheckInDate(selected);
    setDateSelectionError('');
  };

  const handleNightsChange = (increment) => {
    let newNights = numberOfNights;
    if (increment) {
      newNights = Math.min(numberOfNights + 1, 30);
    } else {
      newNights = Math.max(1, numberOfNights - 1);
    }
    setNumberOfNights(newNights);
  };

  const canBookExclusiveResort = Boolean(checkInDate && isDateFullyAvailableForExclusive(checkInDate, numberOfNights));

  const applyExclusiveSelections = () => {
    const nextSelected = {};
    const nextGuests = {};
    for (const roomType of availableRoomTypes) {
      if (roomType.type === 'Tent') {
        nextSelected[roomType.type] = 0;
        nextGuests[roomType.type] = [];
        continue;
      }
      const qty = Math.max(0, getTotalUnitsForRoomType(roomType));
      const minPerUnit = roomType.capacityMin || 1;
      const guestsArray = [];
      for (let i = 0; i < qty; i++) {
        guestsArray.push({ adults: minPerUnit, kids: 0 });
      }
      nextSelected[roomType.type] = qty;
      nextGuests[roomType.type] = guestsArray;
    }
    setSelectedRooms(nextSelected);
    setPerRoomGuests(nextGuests);
    setGuestInputErrors({});
    setExclusiveGuestError('');
    setTentCount(0);
    if ((Number(exclusiveAdults) || 0) < 1) setExclusiveAdults(1);
    if ((Number(exclusiveKids) || 0) < 0) setExclusiveKids(0);
  };

  const handleSelectExclusiveResort = () => {
    if (!checkInDate) {
      setIsExclusiveResortBooking(true);
      setActiveCategory('All Rooms');
      setIsModalOpen(true);
      setDateSelectionError('Exclusive mode is on. Select dates where the whole resort is fully available.');
      return;
    }
    if (!canBookExclusiveResort) {
      setIsExclusiveResortBooking(true);
      setActiveCategory('All Rooms');
      setDateSelectionError('Selected dates are not fully free. Choose dates where all units across all room types are available.');
      return;
    }
    applyExclusiveSelections();
    setIsExclusiveResortBooking(true);
    setActiveCategory('All Rooms');
    setDateSelectionError('');
    setExclusiveGuestError('');
  };

  const handleClearExclusiveResort = () => {
    const clearedSelected = {};
    const clearedGuests = {};
    for (const roomType of availableRoomTypes) {
      clearedSelected[roomType.type] = 0;
      clearedGuests[roomType.type] = [];
    }
    setSelectedRooms(clearedSelected);
    setPerRoomGuests(clearedGuests);
    setIsExclusiveResortBooking(false);
    setDateSelectionError('');
    setExclusiveGuestError('');
    setTentCount(0);
  };

  const handleAddTentInExclusive = () => {
    if (!isExclusiveResortBooking) return;
    const tentType = availableRoomTypes.find(t => t.type === 'Tent');
    const maxTentsAvailable = checkInDate
      ? (unitLevelAvailability['Tent'] || tentType?.availableRooms || 1)
      : (tentType?.availableRooms || 1);
    if (tentCount < maxTentsAvailable) {
      const newTentCount = tentCount + 1;
      setTentCount(newTentCount);
      setSelectedRooms(prev => ({ ...prev, Tent: newTentCount }));
      const tentTypeData = availableRoomTypes.find(t => t.type === 'Tent');
      if (tentTypeData && newTentCount > 0) {
        const guestsArray = [];
        for (let i = 0; i < newTentCount; i++) {
          guestsArray.push({ adults: tentTypeData.capacityMin || 1, kids: 0 });
        }
        setPerRoomGuests(prev => ({ ...prev, Tent: guestsArray }));
      }
    }
  };

  const handleRemoveTentInExclusive = () => {
    if (!isExclusiveResortBooking) return;
    if (tentCount > 0) {
      const newTentCount = tentCount - 1;
      setTentCount(newTentCount);
      setSelectedRooms(prev => ({ ...prev, Tent: newTentCount }));
      if (newTentCount === 0) {
        setPerRoomGuests(prev => ({ ...prev, Tent: [] }));
      } else {
        setPerRoomGuests(prev => {
          const newGuests = [...(prev.Tent || [])];
          newGuests.pop();
          return { ...prev, Tent: newGuests };
        });
      }
    }
  };

  const handleRemoveFromReceipt = (roomType) => {
    setIsExclusiveResortBooking(false);
    setSelectedRooms((prev) => ({ ...prev, [roomType]: 0 }));
    setPerRoomGuests((prev) => ({ ...prev, [roomType]: [] }));
    setGuestInputErrors((prev) => {
      const newErrors = { ...prev };
      Object.keys(newErrors).forEach(key => {
        if (key.startsWith(roomType)) delete newErrors[key];
      });
      return newErrors;
    });
    if (roomType === 'Tent') setTentCount(0);
  };

  const getSelectedRoomsSummary = () => {
    const selected = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selected.length === 0) return 'No rooms selected';
    return selected.map(([type, qty]) => {
      const { totalGuests } = getAggregatedGuestCounts(type);
      return `${qty} × ${type} (${totalGuests} total guest${totalGuests !== 1 ? 's' : ''})`;
    }).join(', ');
  };

  const getTotalGuests = () => {
    if (isExclusiveResortBooking) {
      const adults = Math.max(0, Number(exclusiveAdults) || 0);
      const kids = Math.max(0, Number(exclusiveKids) || 0);
      return adults + kids;
    }
    let total = 0;
    for (const [roomType, quantity] of Object.entries(selectedRooms)) {
      if (quantity > 0) {
        const { totalGuests } = getAggregatedGuestCounts(roomType);
        total += totalGuests;
      }
    }
    return total;
  };

  const getTotalPrice = () => {
    if (isExclusiveResortBooking) {
      return getExclusivePackagePrice() * numberOfNights;
    }
    let total = 0;
    for (const [roomType, quantity] of Object.entries(selectedRooms)) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (typeData && quantity > 0) {
        total += typeData.price * quantity * numberOfNights;
      }
    }
    return total;
  };

  const getExclusiveMaxPax = () => {
    // Base capacity for exclusive resort without tents is 38 pax
    let totalPax = 38;
    // Add 4 pax per tent
    totalPax += tentCount * 4;
    return totalPax;
  };

  const handleExclusiveGuestChange = (guestType, rawValue) => {
    const parsedValue = Number.parseInt(rawValue, 10);
    const safeValue = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue);
    let nextAdults = Number(exclusiveAdults) || 1;
    let nextKids = Number(exclusiveKids) || 0;
    if (guestType === 'adults') nextAdults = safeValue;
    else nextKids = safeValue;
    const nextTotal = nextAdults + nextKids;
    const maxPax = getExclusiveMaxPax();
    let errorMessage = '';
    if (nextAdults < 1) errorMessage = 'At least 1 adult is required.';
    else if (maxPax > 0 && nextTotal > maxPax) errorMessage = `Maximum ${maxPax} guests can be accommodated for the whole resort package.`;
    setExclusiveAdults(Math.max(0, nextAdults));
    setExclusiveKids(Math.max(0, nextKids));
    setExclusiveGuestError(errorMessage);
  };

  const handleProceed = () => {
    if (!checkInDate) {
      setDateSelectionError('Please select check-in and check-out dates');
      return;
    }

    // NEW: Check if exclusive booking is active and dates are not fully available
    if (isExclusiveResortBooking && !canBookExclusiveResort) {
      setDateSelectionError('Cannot proceed to checkout because some rooms are unavailable on the selected date.');
      return;
    }

    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (!isExclusiveResortBooking && selectedTypes.length === 0) {
      setDateSelectionError('Please select at least one room type');
      return;
    }
    if (isExclusiveResortBooking) {
      const adults = Math.max(0, Number(exclusiveAdults) || 0);
      const kids = Math.max(0, Number(exclusiveKids) || 0);
      const totalGuests = adults + kids;
      const maxPax = getExclusiveMaxPax();
      if (adults < 1) {
        setExclusiveGuestError('At least 1 adult is required.');
        return;
      }
      if (totalGuests < 1) {
        setExclusiveGuestError('Please enter at least 1 guest.');
        return;
      }
      if (maxPax > 0 && totalGuests > maxPax) {
        setExclusiveGuestError(`Maximum ${maxPax} guests can be accommodated for the whole resort package.`);
        return;
      }
    }
    const hasErrors = Object.values(guestInputErrors).some(error => error !== '');
    if (!isExclusiveResortBooking && hasErrors) {
      setDateSelectionError('Please fix the guest count errors before proceeding');
      return;
    }
    let hasError = false;
    for (const [roomType, quantity] of selectedTypes) {
      const status = availabilityStatus[roomType];
      if (!status || !status.sufficient) {
        setDateSelectionError(`Insufficient availability for ${roomType}. Please reduce quantity or select different dates.`);
        hasError = true;
        break;
      }
    }
    if (hasError) return;

    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    const computedTotalPrice = getTotalPrice();
    const bookingData = {
      selectedRooms,
      perRoomGuests,
      adultsPerType: {},
      kidsPerType: {},
      totalGuestsPerType: {},
      exclusiveAdults: isExclusiveResortBooking ? Math.max(0, Number(exclusiveAdults) || 0) : null,
      exclusiveKids: isExclusiveResortBooking ? Math.max(0, Number(exclusiveKids) || 0) : null,
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      checkInHour,
      checkOutHour,
      checkInDisplay,
      checkOutDisplay,
      numberOfNights,
      specialRequest,
      totalPrice: computedTotalPrice,
      totalGuests: getTotalGuests(),
      isExclusiveResortBooking,
      exclusivePackagePrice: isExclusiveResortBooking ? computedTotalPrice : null,
      tentCount: tentCount,
      roomTypes: availableRoomTypes.filter(t => selectedRooms[t.type] > 0).map(t => ({
        type: t.type,
        quantity: selectedRooms[t.type],
        totalGuests: getAggregatedGuestCounts(t.type).totalGuests,
        price: t.price,
        roomIds: t.roomIds,
        capacityMin: t.capacityMin,
        capacityMax: t.capacityMax
      }))
    };
    // Add aggregated counts for compatibility
    for (const roomType of Object.keys(selectedRooms)) {
      const { totalAdults, totalKids, totalGuests } = getAggregatedGuestCounts(roomType);
      bookingData.adultsPerType[roomType] = totalAdults;
      bookingData.kidsPerType[roomType] = totalKids;
      bookingData.totalGuestsPerType[roomType] = totalGuests;
    }
    sessionStorage.setItem('multiRoomBooking', JSON.stringify(bookingData));
    router.push('/rooms/multi-room-booking');
  };

  const goBack = () => {
    router.push('/rooms');
  };

  // Calendar functions
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  // REMOVED the duplicate toLocalDateKey definition from here

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateTooSoon = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBookableDate = new Date();
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    minBookableDate.setHours(0, 0, 0, 0);
    return date < minBookableDate && date >= today;
  };

  const isDateFullyBooked = (date) => {
    if (!date) return false;
    if (isExclusiveResortBooking) return !isDateFullyAvailableForExclusive(date, numberOfNights);
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selectedTypes.length === 0) return false;
    for (const [roomType, quantity] of selectedTypes) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (!typeData) continue;
      let totalAvailableUnits = 0;
      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        let minAvailable = maxRooms;
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        for (let hour = checkInHour; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
          const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
          minAvailable = Math.min(minAvailable, availableNow);
          if (minAvailable <= 0) break;
        }
        totalAvailableUnits += minAvailable;
      }
      if (totalAvailableUnits < quantity) return true;
    }
    return false;
  };

  const isDateFullyBlockedByAdmin = (date) => {
    if (!date) return false;
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selectedTypes.length === 0) return false;
    const dateKey = toLocalDateKey(date);
    for (const [roomType, quantity] of selectedTypes) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (!typeData) continue;
      let totalUnits = 0;
      let blockedAtCheckIn = 0;
      let blockedAtMorning = 0;
      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        totalUnits += maxRooms;
        const blockedMorningUnits = blockedSlots[dateKey]?.[roomId]?.[0] || 0;
        blockedAtMorning += Math.min(maxRooms, blockedMorningUnits);
        const blockedUnits = blockedSlots[dateKey]?.[roomId]?.[checkInHour] || 0;
        blockedAtCheckIn += Math.min(maxRooms, blockedUnits);
      }
      const morningClosed = totalUnits > 0 && blockedAtMorning >= totalUnits;
      const afternoonClosed = totalUnits > 0 && blockedAtCheckIn >= totalUnits;
      if (morningClosed && afternoonClosed) return true;
    }
    return false;
  };

  const isDateSelectable = (date) => {
    if (isDatePast(date)) return false;
    if (isDateTooSoon(date)) return false;
    if (isDateFullyBooked(date)) return false;
    if (isDateFullyBlockedByAdmin(date)) return false;
    return true;
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = getDaysInMonth(currentMonth);

  if (loading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
        </div>
      </GuestLayout>
    );
  }

  const filteredRoomTypes = activeCategory === 'All Rooms'
    ? availableRoomTypes
    : availableRoomTypes.filter(room => {
      if (activeCategory === 'Ground Floor') return room.type.toLowerCase().includes('ground');
      if (activeCategory === 'Group Room') return room.type.toLowerCase().includes('group') || room.type.toLowerCase().includes('barkada');
      if (activeCategory === 'Couples') return room.type.toLowerCase().includes('couple');
      if (activeCategory === 'Tents') return room.type.toLowerCase().includes('tent');
      return room.type === activeCategory;
    });

  const exclusiveTotalPrice = getExclusivePackagePrice() * numberOfNights;
  const checkoutTotal = getTotalPrice();
  const exclusiveMaxPax = getExclusiveMaxPax();
  const exclusiveTotalPax = Math.max(0, Number(exclusiveAdults) || 0) + Math.max(0, Number(exclusiveKids) || 0);
  const hasRoomGuestErrors = Object.values(guestInputErrors).some(err => err !== '');
  const hasAnyGuestErrors = isExclusiveResortBooking ? Boolean(exclusiveGuestError) : hasRoomGuestErrors;

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 font-sans">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-8 gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-playfair font-extrabold text-gray-900 tracking-tight">
                Select Rooms
              </h1>
              <p className="text-gray-500 mt-2 text-sm md:text-base max-w-md">
                Instantly select multiple accommodations without switching pages.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {['All Rooms', 'Ground Floor', 'Group Room', 'Couples', 'Tents'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${activeCategory === cat
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* LEFT: Room Cards Grid */}
            <div className="lg:col-span-8">
              {availableRoomTypes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center relative overflow-hidden">

                  {/* soft blue gradient background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-white opacity-80"></div>

                  <div className="relative z-10">
                    <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center shadow-inner">
                      <i className="fas fa-bed text-blue-500 text-3xl"></i>
                    </div>

                    <h3 className="text-xl font-playfair font-semibold text-gray-900 mb-2">
                      No Rooms Available
                    </h3>

                    <p className="text-gray-600 text-sm max-w-xs mx-auto leading-relaxed">
                      All rooms are currently booked. Check back later for availability.
                    </p>

                    {/* accent line */}
                    <div className="mt-6 flex justify-center">
                      <div className="h-[2px] w-12 bg-blue-200 rounded-full"></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredRoomTypes.map((room) => {
                    const quantity = selectedRooms[room.type] || 0;
                    const realTimeAvailable = checkInDate
                      ? (unitLevelAvailability[room.type] || 0)
                      : room.availableRooms;
                    const isTentDisabled = room.type === 'Tent' && isExclusiveResortBooking;

                    return (
                      <div key={room.type} className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md h-full">

                        <div className="relative h-56 w-full shrink-0">
                          <img
                            src={room.images?.[0] || 'https://via.placeholder.com/400x300?text=Room'}
                            alt={room.type}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                          <div className="absolute bottom-4 left-4 z-10 w-full pr-14">
                            <p className="text-white/90 text-[10px] font-bold uppercase tracking-widest mb-1">
                              Good for {room.capacityMin === room.capacityMax ? room.capacityMax : `${room.capacityMin} to ${room.capacityMax}`} persons
                            </p>
                            <h3 className="text-white text-2xl font-playfair font-bold truncate leading-tight pb-1">{room.type}</h3>
                          </div>
                          <div className="absolute top-4 right-4 z-10">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${realTimeAvailable > 0
                              ? 'bg-emerald-100/90 text-emerald-700 border border-emerald-200'
                              : 'bg-red-100/90 text-red-700 border border-red-200'
                              }`}>
                              {realTimeAvailable > 0
                                ? `${realTimeAvailable} unit${realTimeAvailable > 1 ? 's' : ''} left`
                                : 'No Vacancy'}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-baseline mb-4">
                              <p className="text-xl font-bold tracking-tight text-blue-600">
                                PHP {room.price.toLocaleString()}
                              </p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Per Night</p>
                            </div>
                            <p className="text-[11px] font-semibold text-blue-600 mb-4">
                              {realTimeAvailable} unit{realTimeAvailable !== 1 ? 's' : ''} available
                            </p>

                            <div className="flex flex-wrap gap-2 mb-6">
                              {room.inclusions && room.inclusions.length > 0 ? (
                                room.inclusions.slice(0, 3).map((inclusion, idx) => (
                                  <span key={idx} className="px-3 py-1.5 bg-blue-50/50 border border-blue-100 text-[11px] font-medium text-blue-700 rounded-full">
                                    {inclusion}
                                  </span>
                                ))
                              ) : (
                                <span className="px-3 py-1.5 bg-gray-50 border border-gray-100 text-[11px] font-medium text-gray-500 rounded-full">
                                  No inclusions listed
                                </span>
                              )}
                              {room.inclusions && room.inclusions.length > 3 && (
                                <span className="px-3 py-1.5 bg-blue-100 border border-blue-200 text-[11px] font-medium text-blue-800 rounded-full">
                                  +{room.inclusions.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 relative z-10 w-full mb-0 mt-auto">
                            {quantity === 0 ? (
                              <button
                                onClick={() => handleQuantityChange(room.type, true)}
                                disabled={realTimeAvailable <= 0 || isTentDisabled}
                                className={`w-full py-3 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${isTentDisabled
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                                  : realTimeAvailable > 0
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_4px_14px_0_rgb(37,99,235,0.39)] hover:shadow-[0_6px_20px_rgb(37,99,235,0.23)] hover:-translate-y-0.5'
                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                              >
                                {isTentDisabled ? (
                                  <>
                                    <i className="fas fa-plus text-xs"></i> Add to Reservation
                                  </>
                                ) : realTimeAvailable > 0 ? (
                                  <>
                                    <i className="fas fa-plus text-xs"></i> Add to Reservation
                                  </>
                                ) : 'No Vacancy'}
                              </button>
                            ) : (
                              <div className="w-full flex items-center justify-between bg-blue-50/80 border border-blue-200 rounded-xl p-1.5 shadow-inner relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-100/50 to-transparent pointer-events-none"></div>
                                <button
                                  onClick={() => handleQuantityChange(room.type, false)}
                                  disabled={isTentDisabled}
                                  className={`relative z-10 w-12 h-10 flex items-center justify-center rounded-lg shadow-sm transition-colors ${isTentDisabled
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                    : 'bg-white text-blue-600 border border-blue-100 hover:bg-blue-100 hover:text-blue-700'
                                    }`}
                                >
                                  <i className="fas fa-minus text-sm"></i>
                                </button>
                                <span className="font-bold text-blue-800 text-lg relative z-10 tracking-tight">
                                  {quantity} <span className="text-[10px] text-blue-600/70 font-black uppercase tracking-wider ml-0.5">Units</span>
                                </span>
                                <button
                                  onClick={() => handleQuantityChange(room.type, true)}
                                  disabled={quantity >= realTimeAvailable || isTentDisabled}
                                  className={`relative z-10 w-12 h-10 flex items-center justify-center text-white rounded-xl shadow-sm transition-colors ${isTentDisabled
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                  <i className="fas fa-plus text-sm"></i>
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => {
                                const slug = toRoomSlug(room.type);
                                const qtyObj = Math.max(1, selectedRooms[room.type] || 1);
                                const guestsForDetail = perRoomGuests[room.type] || [];
                                const totalGuestsForDetail = guestsForDetail.reduce((s, g) => s + g.adults + g.kids, 0);
                                const draft = {
                                  roomType: room.type,
                                  quantity: qtyObj,
                                  totalGuests: totalGuestsForDetail || (qtyObj * (room.capacityMin || 1)),
                                  perRoomGuests: guestsForDetail,
                                  checkInDate: checkInDate ? checkInDate.toISOString() : null,
                                  numberOfNights,
                                  checkInHour,
                                  checkOutHour
                                };
                                sessionStorage.setItem('roomDetailDraft', JSON.stringify(draft));
                                const multiRoomState = {
                                  selectedRooms,
                                  perRoomGuests,
                                  checkInDate: checkInDate ? checkInDate.toISOString() : null,
                                  numberOfNights,
                                  checkInHour,
                                  checkOutHour,
                                  specialRequest,
                                  activeCategory
                                };
                                sessionStorage.setItem('roomsPageState', JSON.stringify(multiRoomState));
                                router.push(`/rooms/${encodeURIComponent(slug)}`);
                              }}
                              className="w-full py-3 bg-white border border-blue-100 text-blue-600 hover:bg-blue-50/50 hover:border-blue-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow hover:-translate-y-0.5"
                            >
                              <span>View Details & Photos</span>
                              <i className="fas fa-arrow-right text-[10px]"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Booking Receipt & Dates */}
            <div className="lg:col-span-4 lg:sticky lg:top-24">
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_12px_40px_rgb(0,0,0,0.06)] p-6">

                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-playfair font-bold text-gray-900">Booking Receipt</h2>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse"></span>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Summary</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center text-gray-400">
                    <i className="fas fa-shopping-cart text-sm"></i>
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Exclusive Option</p>
                      <p className="mt-1 text-sm font-semibold text-blue-900">Book Entire Resort</p>
                      <p className="text-xs text-blue-700/80">₱{BASE_EXCLUSIVE_PRICE.toLocaleString()} per night + ₱1,500/tent • Total: ₱{exclusiveTotalPrice.toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={isExclusiveResortBooking ? handleClearExclusiveResort : handleSelectExclusiveResort}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${isExclusiveResortBooking
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                      {isExclusiveResortBooking ? 'Remove Exclusive' : 'Select Exclusive'}
                    </button>
                  </div>
                  {!canBookExclusiveResort && !isExclusiveResortBooking && (
                    <p className="mt-2 text-[11px] font-medium text-amber-700">
                      Select stay dates first, then choose dates where all room units are fully available.
                    </p>
                  )}
                </div>

                <div className="mb-6 p-4 bg-gray-50/50 rounded-[1.5rem] border border-gray-100 relative">
                  <h3 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wider">Stay Schedule</h3>
                  <div
                    ref={calendarTriggerRef}
                    className="flex items-center justify-between text-sm font-semibold text-gray-700 bg-white p-3.5 rounded-xl border border-gray-200 mb-3 cursor-pointer hover:border-blue-400 transition-colors shadow-sm"
                    onClick={() => setIsModalOpen(true)}
                  >
                    {checkInDate ? (
                      <span>{checkInDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} &rarr; {checkOutDate ? checkOutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...'}</span>
                    ) : (
                      <span className="text-gray-400">Select check-in date</span>
                    )}
                    <i className="fas fa-calendar-alt text-blue-500"></i>
                  </div>
                  <div className="text-[11px] font-semibold text-gray-600 bg-white p-3 rounded-xl border border-gray-200">
                    Fixed schedule: Check-in {checkInDisplay}, Check-out {checkOutDisplay}
                  </div>
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nights</p>
                    <div className="flex items-center bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
                      <button onClick={() => handleNightsChange(false)} disabled={numberOfNights <= 1} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                        <i className="fas fa-minus text-[10px]"></i>
                      </button>
                      <span className="font-bold text-sm flex-1 text-center text-gray-800">{numberOfNights}</span>
                      <button onClick={() => handleNightsChange(true)} disabled={numberOfNights >= 30} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                        <i className="fas fa-plus text-[10px]"></i>
                      </button>
                    </div>
                    {dateSelectionError && (
                      <p className="text-red-500 text-[10px] mt-4 text-center font-bold bg-red-50 py-2.5 px-3 rounded-xl border border-red-100">
                        <i className="fas fa-exclamation-circle mr-1"></i>
                        {dateSelectionError}
                      </p>
                    )}
                  </div>
                  {isModalOpen && (
                    <div ref={calendarPopoverRef} className="absolute left-0 top-[4.25rem] z-50 bg-white w-[290px] max-w-[calc(100vw-3rem)] rounded-2xl shadow-[0_16px_40px_rgb(0,0,0,0.14)] p-2.5 border border-gray-100 max-h-[58vh] overflow-hidden flex flex-col">
                      <div className="overflow-y-auto pr-1">
                        <div className="flex justify-between items-center mb-1.5 px-1">
                          <button type="button" onClick={goToPreviousMonth} className="w-6 h-6 flex justify-center items-center text-gray-400 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors">
                            <i className="fas fa-chevron-left text-[10px]"></i>
                          </button>
                          <h4 className="font-bold text-gray-800 text-[11px] tracking-wide">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h4>
                          <button type="button" onClick={goToNextMonth} className="w-6 h-6 flex justify-center items-center text-gray-400 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors">
                            <i className="fas fa-chevron-right text-[10px]"></i>
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 mb-1">
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d} className="text-center text-[9px] font-bold uppercase tracking-widest text-gray-400 py-1">{d}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {days.map((day, index) => {
                            if (!day) return <div key={index}></div>;
                            const isPast = isDatePast(day);
                            const isTooSoon = isDateTooSoon(day);
                            const isFullyBlocked = isDateFullyBlockedByAdmin(day);
                            const isFullyBooked = isDateFullyBooked(day);
                            const isSelected = checkInDate && checkInDate.toDateString() === day.toDateString();
                            const isCheckout = checkOutDate && checkOutDate.toDateString() === day.toDateString();
                            const inRange = checkInDate && checkOutDate && day > checkInDate && day < checkOutDate;
                            const isDisabled = isPast || isTooSoon || isFullyBlocked || isFullyBooked;
                            let bg = 'bg-white border border-gray-100';
                            let text = 'text-gray-700';
                            let stateClass = 'hover:border-blue-400 hover:text-blue-600 cursor-pointer rounded-xl';
                            if (isDisabled) {
                              bg = 'bg-gray-50 border-transparent';
                              text = (isFullyBlocked || isFullyBooked) ? 'text-gray-300' : 'text-gray-300';
                              stateClass = 'cursor-not-allowed rounded-xl';
                            } else if (isSelected || isCheckout) {
                              bg = 'bg-blue-600 border-blue-600';
                              text = 'text-white';
                              stateClass = 'shadow-md cursor-pointer ring-4 ring-blue-500/20 rounded-xl z-10 relative';
                            } else if (inRange) {
                              bg = 'bg-blue-50 border-blue-100';
                              text = 'text-blue-700 font-bold';
                              stateClass = 'cursor-pointer rounded-lg';
                            }
                            return (
                              <button key={index} type="button" disabled={isDisabled} onClick={() => handleDateSelect(day)} className={`h-9 flex items-center justify-center font-bold text-[10px] transition-all ${bg} ${text} ${stateClass}`}>
                                {day.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="pt-1.5 mt-1.5 border-t border-gray-100 bg-white">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20">
                          Confirm Dates
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 mb-6">
                  {isExclusiveResortBooking ? (
                    <div className="p-3.5 bg-white border border-gray-100 shadow-sm rounded-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                      <div className="pl-2">
                        <p className="text-sm font-bold text-gray-800">Entire Resort Package</p>
                        <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mt-1">
                          Can entertain up to {exclusiveMaxPax} pax
                        </p>
                      </div>
                      <div className="mt-3 ml-2 p-2 bg-amber-50/50 rounded-xl border border-amber-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Tents</p>
                            <p className="text-[9px] text-amber-700">+₱1,500 per tent/night</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={handleRemoveTentInExclusive} disabled={tentCount === 0} className="w-7 h-7 rounded-full bg-white text-amber-600 border border-amber-200 flex items-center justify-center hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed">
                              <i className="fas fa-minus text-[10px]"></i>
                            </button>
                            <span className="font-bold text-amber-800 text-base min-w-[30px] text-center">{tentCount}</span>
                            <button onClick={handleAddTentInExclusive} disabled={tentCount >= (availableRoomTypes.find(t => t.type === 'Tent')?.availableRooms || 5)} className="w-7 h-7 rounded-full bg-white text-amber-600 border border-amber-200 flex items-center justify-center hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed">
                              <i className="fas fa-plus text-[10px]"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50/80 rounded-xl p-2 mt-3 ml-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                            <input type="number" min={1} value={exclusiveAdults} onChange={(e) => handleExclusiveGuestChange('adults', e.target.value)} className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${exclusiveGuestError ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`} />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                            <input type="number" min={0} value={exclusiveKids} onChange={(e) => handleExclusiveGuestChange('kids', e.target.value)} className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${exclusiveGuestError ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`} />
                          </label>
                        </div>
                        <p className="text-[10px] font-semibold text-gray-500 mt-2">Total Pax: {exclusiveTotalPax}</p>
                      </div>
                      {exclusiveGuestError && (
                        <div className="bg-red-50/80 border-t border-red-100 p-2 text-[10px] text-red-600 font-semibold tracking-tight leading-tight flex items-start gap-1 w-full rounded-b-2xl absolute bottom-0 left-0">
                          <i className="fas fa-exclamation-circle mt-[0.1rem]"></i>
                          <span>{exclusiveGuestError}</span>
                        </div>
                      )}
                    </div>
                  ) : Object.values(selectedRooms).every(q => q === 0) ? (
                    <div className="py-12 px-4 border-2 border-dashed border-gray-200 rounded-[1.5rem] text-center bg-gray-50/50">
                      <div className="w-12 h-12 mx-auto bg-white rounded-full flex items-center justify-center text-gray-300 mb-4 shadow-sm border border-gray-100">
                        <h2 className="text-gray-300 font-bold text-lg">$</h2>
                      </div>
                      <p className="text-xs text-gray-400 font-medium max-w-[200px] mx-auto leading-relaxed">No rooms added yet. Click "Select Room" to build your stay.</p>
                    </div>
                  ) : (
                    availableRoomTypes.filter(r => selectedRooms[r.type] > 0).map(room => {
                      const guestsArray = perRoomGuests[room.type] || [];
                      const { totalAdults, totalKids, totalGuests } = getAggregatedGuestCounts(room.type);
                      return (
                        <div key={room.type} className="p-3.5 bg-white border border-gray-100 shadow-sm rounded-2xl relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-blue-400"></div>
                          <div className="flex justify-between items-start mb-2 pl-2">
                            <div>
                              <p className="text-sm font-bold text-gray-800 truncate max-w-[120px]">{room.type}</p>
                              <p className="text-[10px] text-blue-500 font-extrabold uppercase tracking-widest mt-1">{selectedRooms[room.type]} unit{selectedRooms[room.type] > 1 ? 's' : ''}</p>
                            </div>
                            <div className="flex items-start gap-2">
                              <p className="text-sm font-bold text-gray-800 pt-0.5">
                                ₱{((room.type === 'Tent' ? 1500 : room.price) * selectedRooms[room.type] * numberOfNights).toLocaleString()}
                              </p>
                              <button onClick={() => handleRemoveFromReceipt(room.type)} className="w-6 h-6 rounded-full bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex items-center justify-center">
                                <i className="fas fa-times text-[10px]"></i>
                              </button>
                            </div>
                          </div>
                          {room.type === 'Tent' && (
                            <div className="mb-2 ml-2">
                              <p className="text-[10px] font-medium text-amber-700">+₱1,500 per tent per night</p>
                            </div>
                          )}
                          {/* Per‑room guest controls */}
                          <div className="space-y-2 mt-2">
                            {guestsArray.map((guest, idx) => (
                              <div key={idx} className="bg-gray-50/80 rounded-xl p-2 ml-2">
                                <p className="text-[9px] font-bold text-gray-500 mb-1">Unit {idx + 1}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={guest.adults}
                                      onChange={(e) => handleUnitGuestChange(room.type, idx, 'adults', e.target.value)}
                                      className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${guestInputErrors[`${room.type}-${idx}`] ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={guest.kids}
                                      onChange={(e) => handleUnitGuestChange(room.type, idx, 'kids', e.target.value)}
                                      className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${guestInputErrors[`${room.type}-${idx}`] ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                                    />
                                  </label>
                                </div>
                                {guestInputErrors[`${room.type}-${idx}`] && (
                                  <p className="text-[9px] text-red-500 mt-1">{guestInputErrors[`${room.type}-${idx}`]}</p>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="bg-gray-50/80 rounded-xl p-2 mt-3 ml-2">
                            <p className="text-[10px] font-semibold text-gray-500 mt-2">
                              Total Guests: {totalGuests} (Adults: {totalAdults}, Kids: {totalKids})
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="bg-[#F8FCFF] border border-blue-100/50 rounded-2xl p-4 mb-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-blue-500/5 mix-blend-multiply"></div>
                  <div className="flex justify-between items-center mb-1 relative z-10">
                    <p className="text-[10px] font-bold text-blue-800/60 uppercase tracking-widest">Nightly Total</p>
                    {isExclusiveResortBooking ? (
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shadow-sm">
                        Entire Resort • {exclusiveTotalPax} Pax
                      </p>
                    ) : (
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full shadow-sm">
                        {Object.values(selectedRooms).reduce((a, b) => a + b, 0)} Units Chosen
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mb-2 text-blue-500 text-lg relative z-10">
                    <i className="fas fa-bed text-blue-500/30"></i>
                    <i className="fas fa-bed"></i>
                  </div>
                  <div className="flex justify-between items-center pt-3 mt-3 border-t border-blue-200/50 relative z-10">
                    <p className="text-gray-800 font-bold text-sm">Est. Total</p>
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">₱{checkoutTotal.toLocaleString()}</p>
                  </div>
                </div>

                <div className="relative group mt-4">
                  <button onClick={handleProceed} disabled={!checkInDate || (!isExclusiveResortBooking && Object.values(selectedRooms).every(q => q === 0)) || dateSelectionError !== '' || hasAnyGuestErrors} className={`w-full py-4 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${((checkInDate && (isExclusiveResortBooking || Object.values(selectedRooms).some(q => q > 0))) && !hasAnyGuestErrors) ? 'bg-blue-600 text-white shadow-[0_8px_20px_rgb(37,99,235,0.25)] hover:bg-blue-700 hover:-translate-y-0.5' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}>
                    Checkout &bull; ₱{checkoutTotal.toLocaleString()} &rarr;
                  </button>
                  {(!checkInDate || (!isExclusiveResortBooking && Object.values(selectedRooms).every(q => q === 0))) && (
                    <div className="absolute left-1/2 -top-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] font-medium py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 tooltip">
                      Please select check-in dates and at least one room type.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-800"></div>
                    </div>
                  )}
                  {hasAnyGuestErrors && (checkInDate && (isExclusiveResortBooking || Object.values(selectedRooms).some(q => q > 0))) && (
                    <div className="absolute left-1/2 -top-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 text-white text-[10px] font-medium py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 tooltip">
                      Please fix guest count errors before checking out.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-red-600"></div>
                    </div>
                  )}
                  {!user && !hasAnyGuestErrors && checkInDate && (isExclusiveResortBooking || Object.values(selectedRooms).some(q => q > 0)) && (
                    <div className="absolute left-1/2 -top-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-medium py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 tooltip">
                      Sign in to continue to checkout.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900"></div>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-center gap-2 text-gray-400">
                  <i className="fas fa-lock text-[10px]"></i>
                  <p className="text-[9px] font-bold uppercase tracking-widest">Secure booking guaranteed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ChatBot />

      <GuestAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </GuestLayout>
  );
}

export default function RoomsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
        <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
      </div>
    }>
      <RoomsPageContent />
    </Suspense>
  );
}