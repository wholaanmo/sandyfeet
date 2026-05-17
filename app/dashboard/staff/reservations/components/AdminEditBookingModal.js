// app/dashboard/admin/reservations/components/AdminEditBookingModal.js
'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { doc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDateValue } from '@/app/my-bookings/utils';
import { logAdminAction } from '../../../../../lib/auditLogger';

const CHECK_IN_HOUR = 14;
const CHECK_OUT_HOUR = 12;
const BASE_EXCLUSIVE_PRICE = 22500;

const buildCheckInDateTime = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(CHECK_IN_HOUR, 0, 0, 0);
  return d;
};

const buildCheckOutDateTime = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(CHECK_OUT_HOUR, 0, 0, 0);
  return d;
};

const toDateInputStr = (value) => {
  const d = toDateValue(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const resolveFixedDownPayment = (booking) => {
  if (!booking) return 0;
  if (booking.manualDownPayment !== undefined && booking.manualDownPayment !== null) {
    return Number(booking.manualDownPayment) || 0;
  }
  if (typeof booking.downPayment === 'number' && !Number.isNaN(booking.downPayment) && booking.downPayment > 0) {
    return booking.downPayment;
  }
  if (booking.isMultiRoomGroup && booking.originalChildBookings?.length > 0) {
    return booking.originalChildBookings.reduce((sum, child) => {
      const childDp =
        typeof child.downPayment === 'number' && child.downPayment > 0
          ? child.downPayment
          : Number(child.totalPrice || 0) * 0.5;
      return sum + childDp;
    }, 0);
  }
  return (Number(booking.totalPrice) || 0) * 0.5;
};

const toDateOnly = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const omitUndefinedDeep = (value) => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map(omitUndefinedDeep).filter((entry) => entry !== undefined);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const cleaned = omitUndefinedDeep(v);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return out;
};

export function canAdminEditBooking(booking) {
  if (!booking || booking.type === 'daytour') return false;
  return ['pending', 'confirmed', 'check-in', 'check-out'].includes(booking.status);
}

export default function AdminEditBookingModal({ isOpen, booking, onClose, onSuccess }) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [originalNights, setOriginalNights] = useState(0);
  const [guestCounts, setGuestCounts] = useState({});
  const [guestErrors, setGuestErrors] = useState({});
  const [exclusiveAdults, setExclusiveAdults] = useState(0);
  const [exclusiveKids, setExclusiveKids] = useState(0);
  const [exclusiveTentCount, setExclusiveTentCount] = useState(0);
  const [exclusiveGuestError, setExclusiveGuestError] = useState('');
  const [balance, setBalance] = useState('');
  const [fixedDownPayment, setFixedDownPayment] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [roomCapacitiesMap, setRoomCapacitiesMap] = useState({});
  const [roomMaxCapacity, setRoomMaxCapacity] = useState(null);
  const [roomMinCapacity, setRoomMinCapacity] = useState(null);
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [roomDetailsMap, setRoomDetailsMap] = useState({});
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState('checkIn');
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  const isExclusive = booking?.isExclusiveResortBooking || false;
  const isMultiRoom = booking?.isMultiRoomGroup || false;
  const childBookings = booking?.originalChildBookings || [];
  const roomTypesArray = booking?.roomTypesArray || [];

  const stayNights = useMemo(() => {
    if (!checkIn || !checkOut) return originalNights || 1;
    const ci = new Date(`${checkIn}T00:00:00`);
    const co = new Date(`${checkOut}T00:00:00`);
    return Math.max(1, Math.round((co - ci) / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut, originalNights]);

  const parsedBalanceNum = useMemo(() => {
    const n = parseFloat(balance);
    return Number.isNaN(n) || n < 0 ? 0 : n;
  }, [balance]);

  const computedTotalAmount = useMemo(
    () => fixedDownPayment + parsedBalanceNum,
    [fixedDownPayment, parsedBalanceNum]
  );

  const excludedDocIds = useMemo(() => {
    const ids = new Set();
    if (childBookings.length > 0) {
      childBookings.forEach((c) => c.id && ids.add(c.id));
    } else if (booking?.id) {
      ids.add(booking.id);
    }
    return ids;
  }, [booking, childBookings]);

  const getExclusiveMaxPax = useCallback(() => {
    let totalPax = 38;
    totalPax += exclusiveTentCount * 4;
    return totalPax;
  }, [exclusiveTentCount]);

  // Fetch room types
  useEffect(() => {
    if (!isOpen) return;
    const fetchRoomTypes = async () => {
      try {
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const types = [];
        const roomDetails = {};
        const capacitiesMap = {};

        roomsSnapshot.forEach((roomDoc) => {
          const roomData = roomDoc.data();
          if (roomData.archived === true) return;
          if (roomData.availability !== 'available') return;

          const roomType = roomData.type;
          capacitiesMap[roomType] = {
            max: roomData.capacityMax || 10,
            min: roomData.capacityMin || 1,
          };

          const existingType = types.find((t) => t.type === roomType);
          if (existingType) {
            existingType.totalRooms += roomData.totalRooms || 1;
            existingType.maintenanceRooms += roomData.maintenanceRooms || 0;
            existingType.availableRooms += (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0);
            existingType.roomIds.push(roomDoc.id);
          } else {
            types.push({
              id: roomDoc.id,
              type: roomType,
              totalRooms: roomData.totalRooms || 1,
              maintenanceRooms: roomData.maintenanceRooms || 0,
              availableRooms: (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0),
              roomIds: [roomDoc.id],
            });
          }

          roomDetails[roomType] = {
            ...roomDetails[roomType],
            [roomDoc.id]: roomData,
          };
        });

        setAvailableRoomTypes(types);
        setRoomDetailsMap(roomDetails);
        setRoomCapacitiesMap(capacitiesMap);
      } catch (err) {
        console.error('Error fetching room types:', err);
      }
    };
    fetchRoomTypes();
  }, [isOpen]);

  // Fetch booked dates (exclude current booking)
  useEffect(() => {
    if (availableRoomTypes.length === 0 || !isOpen) return;

    const allRoomIds = availableRoomTypes.flatMap((type) => type.roomIds);
    if (allRoomIds.length === 0) return;

    const fetchBookingsAndBlocks = async () => {
      try {
        const bookingsQuery = query(
          collection(db, 'bookings'),
          where('status', 'in', ['pending', 'confirmed', 'check-in'])
        );
        const bookingsSnapshot = await getDocs(bookingsQuery);

        const booked = {};
        bookingsSnapshot.forEach((docSnap) => {
          if (excludedDocIds.has(docSnap.id)) return;

          const bookingData = docSnap.data();
          const checkInDate = bookingData.checkIn?.toDate
            ? bookingData.checkIn.toDate()
            : new Date(bookingData.checkIn);
          const checkOutDate = bookingData.checkOut?.toDate
            ? bookingData.checkOut.toDate()
            : new Date(bookingData.checkOut);
          const roomId = bookingData.roomId;
          const numberOfRooms = bookingData.numberOfRooms || 1;

          if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) return;

          const current = new Date(checkInDate);
          while (current < checkOutDate) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            const hour = current.getHours();

            if (bookingData.isExclusiveResortBooking) {
              if (!booked[dateStr]) booked[dateStr] = {};
              for (const targetRoomId of allRoomIds) {
                if (!booked[dateStr][targetRoomId]) booked[dateStr][targetRoomId] = {};
                booked[dateStr][targetRoomId][hour] = (booked[dateStr][targetRoomId][hour] || 0) + 1;
              }
            } else if (roomId && allRoomIds.includes(roomId)) {
              if (!booked[dateStr]) booked[dateStr] = {};
              if (!booked[dateStr][roomId]) booked[dateStr][roomId] = {};
              booked[dateStr][roomId][hour] = (booked[dateStr][roomId][hour] || 0) + numberOfRooms;
            }

            current.setHours(current.getHours() + 1, 0, 0, 0);
          }
        });

        setBookedDates(booked);

        const blockedSnapshot = await getDocs(collection(db, 'unavailableSlots'));
        const blocks = {};
        blockedSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (allRoomIds.includes(data.roomId)) {
            const dateKey = data.date;
            const startHour = data.startHour;
            const endHour = data.endHour;
            const unitsBlocked = data.unitsBlocked || 1;
            if (!blocks[dateKey]) blocks[dateKey] = {};
            if (!blocks[dateKey][data.roomId]) blocks[dateKey][data.roomId] = {};
            for (let hour = startHour; hour < endHour; hour++) {
              blocks[dateKey][data.roomId][hour] =
                (blocks[dateKey][data.roomId][hour] || 0) + unitsBlocked;
            }
          }
        });
        setBlockedSlots(blocks);
      } catch (err) {
        console.error('Error fetching availability:', err);
      }
    };

    fetchBookingsAndBlocks();
  }, [availableRoomTypes, isOpen, excludedDocIds]);

  // Room capacity for single room
  useEffect(() => {
    if (!isOpen || isMultiRoom || isExclusive || !booking?.roomType) return;
    const fetchRoomCapacity = async () => {
      try {
        const q = query(collection(db, 'rooms'), where('type', '==', booking.roomType));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const roomData = snapshot.docs[0].data();
          setRoomMaxCapacity(roomData.capacityMax || 10);
          setRoomMinCapacity(roomData.capacityMin || 1);
        } else {
          setRoomMaxCapacity(10);
          setRoomMinCapacity(1);
        }
      } catch {
        setRoomMaxCapacity(10);
        setRoomMinCapacity(1);
      }
    };
    fetchRoomCapacity();
  }, [booking?.roomType, isOpen, isMultiRoom, isExclusive]);

  // Initialize form
  useEffect(() => {
    if (!booking || !isOpen) return;

    const checkInDate = toDateValue(booking.checkIn);
    const checkOutDate = toDateValue(booking.checkOut);

    if (checkInDate && checkOutDate) {
      const nights = Math.max(
        1,
        Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24))
      );
      setOriginalNights(nights);
      setCheckIn(toDateInputStr(checkInDate));
      setCheckOut(toDateInputStr(checkOutDate));
    }

    const currentBalance =
      booking.manualBalance !== undefined
        ? booking.manualBalance
        : (() => {
            const total = Number(booking.totalPrice) || 0;
            const down = total * 0.5;
            if (['cancelled', 'check-out', 'completed'].includes(booking.status)) return 0;
            return down;
          })();
    setBalance(String(currentBalance));
    setFixedDownPayment(resolveFixedDownPayment(booking));

    if (isExclusive) {
      setExclusiveAdults(booking.exclusiveAdults ?? booking.adults ?? 1);
      setExclusiveKids(booking.exclusiveKids ?? booking.kids ?? 0);
      setExclusiveTentCount(booking.tentCount || 0);
      setExclusiveGuestError('');
    } else if (isMultiRoom && childBookings.length > 0) {
      const counts = {};
      childBookings.forEach((child, index) => {
        const roomCap = roomCapacitiesMap[child.roomType] || { max: 10, min: 1 };
        counts[index] = {
          adults: child.adults || 1,
          kids: child.kids || 0,
          roomType: child.roomType || 'Room',
          maxCapacity: roomCap.max,
          minCapacity: roomCap.min,
        };
      });
      setGuestCounts(counts);
    } else {
      const numberOfUnits = booking.numberOfRooms || 1;
      const counts = {};
      const totalAdults = booking.adults || 1;
      const totalKids = booking.kids || 0;
      const baseAdults = Math.floor(totalAdults / numberOfUnits);
      const remainderAdults = totalAdults % numberOfUnits;
      const baseKids = Math.floor(totalKids / numberOfUnits);
      const remainderKids = totalKids % numberOfUnits;

      for (let i = 0; i < numberOfUnits; i++) {
        counts[i] = {
          adults: baseAdults + (i < remainderAdults ? 1 : 0),
          kids: baseKids + (i < remainderKids ? 1 : 0),
        };
      }
      setGuestCounts(counts);
    }

    setError('');
    setAvailabilityError('');
    setGuestErrors({});
  }, [booking, isOpen, isExclusive, isMultiRoom, childBookings, roomCapacitiesMap]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClickOutside = (event) => {
      const target = event.target;
      if (calendarPopoverRef.current?.contains(target)) return;
      if (calendarTriggerRef.current?.contains(target)) return;
      setIsCalendarOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarOpen]);

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

  const getAvailableUnitsForRoomTypeOnDate = (date, roomTypeData, nights) => {
    if (!date || !roomTypeData) return 0;
    let totalAvailableUnits = 0;
    for (const roomId of roomTypeData.roomIds || []) {
      const roomDetail = roomDetailsMap[roomTypeData.type]?.[roomId];
      const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
      if (maxRooms <= 0) continue;
      let availableForStay = maxRooms;
      for (let dayOffset = 0; dayOffset < nights; dayOffset++) {
        const currentDate = new Date(date);
        currentDate.setDate(date.getDate() + dayOffset);
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        for (let hour = CHECK_IN_HOUR; hour < 24; hour++) {
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
      for (let hour = CHECK_IN_HOUR; hour < 24; hour++) {
        const booked = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
        maxForRoom = Math.max(maxForRoom, booked);
      }
      totalMaxBooked += maxForRoom;
    }
    return totalMaxBooked;
  };

  const isDateFullyAvailableForExclusive = (date, nights) => {
    if (!date || availableRoomTypes.length === 0) return false;
    for (const roomTypeData of availableRoomTypes) {
      const totalUnits = getTotalUnitsForRoomType(roomTypeData);
      if (totalUnits <= 0) return false;

      if (roomTypeData.type === 'Tent') {
        const bookedUnits = getMaxBookedUnitsForRoomTypeOnDate(date, roomTypeData);
        if (bookedUnits > 0) return false;
      } else {
        const availableUnits = getAvailableUnitsForRoomTypeOnDate(date, roomTypeData, nights);
        if (availableUnits < totalUnits) return false;
      }
    }
    return true;
  };

  const getRoomRequests = () => {
    if (isMultiRoom && roomTypesArray.length > 0) {
      return roomTypesArray.map((rt) => ({ type: rt.type, quantity: rt.quantity }));
    }
    if (booking?.roomType) {
      return [{ type: booking.roomType, quantity: booking.numberOfRooms || 1 }];
    }
    return [];
  };

  const getUnavailableRoomTypeForStay = (date, roomRequests, nights) => {
    if (!date || !roomRequests.length) return null;
    const checkInDate = new Date(date);
    for (let dayOffset = 0; dayOffset < nights; dayOffset++) {
      const currentDate = new Date(checkInDate);
      currentDate.setDate(checkInDate.getDate() + dayOffset);
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      for (const req of roomRequests) {
        const roomTypeData = availableRoomTypes.find((t) => t.type === req.type);
        if (!roomTypeData) continue;
        let totalAvailable = 0;
        for (const roomId of roomTypeData.roomIds) {
          const roomDetail = roomDetailsMap[req.type]?.[roomId];
          const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
          if (maxRooms <= 0) continue;
          let minAvailable = maxRooms;
          for (let hour = CHECK_IN_HOUR; hour < 24; hour++) {
            const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
            const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
            const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
            minAvailable = Math.min(minAvailable, availableNow);
            if (minAvailable <= 0) break;
          }
          totalAvailable += minAvailable;
        }
        if (totalAvailable < req.quantity) return req.type;
      }
    }
    return null;
  };

  const isDateUnavailableForCheckIn = (date) => {
    if (!date || availableRoomTypes.length === 0) return true;
    if (isExclusive) return !isDateFullyAvailableForExclusive(date, stayNights);

    const roomRequests = getRoomRequests();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    for (const req of roomRequests) {
      const roomTypeData = availableRoomTypes.find((t) => t.type === req.type);
      if (!roomTypeData) continue;
      let totalAvailable = 0;
      for (const roomId of roomTypeData.roomIds) {
        const roomDetail = roomDetailsMap[req.type]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        let minAvailable = maxRooms;
        for (let hour = CHECK_IN_HOUR; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
          const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
          minAvailable = Math.min(minAvailable, availableNow);
          if (minAvailable <= 0) break;
        }
        totalAvailable += minAvailable;
      }
      if (totalAvailable < req.quantity) return true;
    }
    return false;
  };

  const restrictPastDates = ['pending', 'confirmed'].includes(booking?.status);

  const isDatePast = (date) => {
    if (!restrictPastDates) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateSelectable = (date) => {
    if (isDatePast(date)) return false;
    if (calendarTarget === 'checkIn' && isDateUnavailableForCheckIn(date)) return false;
    if (calendarTarget === 'checkOut') {
      if (!checkIn) return false;
      const checkInOnly = toDateOnly(new Date(`${checkIn}T00:00:00`));
      const minOut = new Date(checkInOnly);
      minOut.setDate(minOut.getDate() + 1);
      const selected = toDateOnly(date);
      if (selected < minOut) return false;
    }
    return true;
  };

  const checkAvailability = async () => {
    if (!checkIn || !checkOut) return false;

    setIsCheckingAvailability(true);
    setAvailabilityError('');

    try {
      const checkInDate = new Date(`${checkIn}T00:00:00`);

      if (isExclusive) {
        if (!isDateFullyAvailableForExclusive(checkInDate, stayNights)) {
          setAvailabilityError(
            'The Entire Resort Package is not available for the selected dates. Some rooms are already booked.'
          );
          return false;
        }
        return true;
      }

      const roomRequests = getRoomRequests();
      const unavailableType = getUnavailableRoomTypeForStay(checkInDate, roomRequests, stayNights);
      if (unavailableType) {
        setAvailabilityError(
          `${unavailableType} is not fully available on the selected dates. Please choose different dates.`
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('Availability check error:', err);
      setAvailabilityError('Unable to check availability. Please try again.');
      return false;
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const validateGuestCounts = () => {
    const errors = {};
    let hasError = false;

    for (const [index, guest] of Object.entries(guestCounts)) {
      let maxCapacity = roomMaxCapacity;
      let minCapacity = roomMinCapacity;

      if (isMultiRoom && guest.roomType) {
        const roomCap = roomCapacitiesMap[guest.roomType];
        if (roomCap) {
          maxCapacity = roomCap.max;
          minCapacity = roomCap.min;
        }
      }

      const adults = guest.adults || 0;
      const kids = guest.kids || 0;
      const total = adults + kids;

      if (adults < 1) {
        errors[index] = 'At least 1 adult required';
        hasError = true;
      } else if (minCapacity && total < minCapacity) {
        errors[index] = `Minimum ${minCapacity} guest(s) required`;
        hasError = true;
      } else if (maxCapacity && total > maxCapacity) {
        errors[index] = `Maximum ${maxCapacity} guests allowed`;
        hasError = true;
      }
    }

    setGuestErrors(errors);
    return !hasError;
  };

  const validateExclusiveGuests = () => {
    const totalGuests = exclusiveAdults + exclusiveKids;
    const maxPax = getExclusiveMaxPax();
    if (exclusiveAdults < 1) {
      setExclusiveGuestError('At least 1 adult is required.');
      return false;
    }
    if (maxPax > 0 && totalGuests > maxPax) {
      setExclusiveGuestError(`Maximum ${maxPax} guests can be accommodated for the whole resort package.`);
      return false;
    }
    setExclusiveGuestError('');
    return true;
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
    else if (maxPax > 0 && nextTotal > maxPax)
      errorMessage = `Maximum ${maxPax} guests can be accommodated for the whole resort package.`;
    setExclusiveAdults(Math.max(0, nextAdults));
    setExclusiveKids(Math.max(0, nextKids));
    setExclusiveGuestError(errorMessage);
  };

  const updateGuestCount = (index, field, value) => {
    const parsedValue = parseInt(value, 10) || 0;
    let maxCapacity = roomMaxCapacity;
    if (isMultiRoom && guestCounts[index]?.roomType) {
      const roomCap = roomCapacitiesMap[guestCounts[index].roomType];
      if (roomCap) maxCapacity = roomCap.max;
    }

    let finalValue = parsedValue;
    if (field === 'kids' && maxCapacity) {
      const currentAdults = guestCounts[index]?.adults || 1;
      const maxAllowedKids = Math.max(0, maxCapacity - currentAdults);
      if (finalValue > maxAllowedKids) finalValue = maxAllowedKids;
    }

    setGuestCounts((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: finalValue },
    }));

    if (guestErrors[index]) {
      setGuestErrors((prev) => ({ ...prev, [index]: '' }));
    }
  };

  const handleDateSelect = (date) => {
    if (!isDateSelectable(date)) return;
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    if (calendarTarget === 'checkIn') {
      setCheckIn(formattedDate);
      if (checkOut && new Date(checkOut) <= new Date(formattedDate)) {
        const newOut = new Date(`${formattedDate}T00:00:00`);
        newOut.setDate(newOut.getDate() + Math.max(1, stayNights));
        setCheckOut(
          `${newOut.getFullYear()}-${String(newOut.getMonth() + 1).padStart(2, '0')}-${String(newOut.getDate()).padStart(2, '0')}`
        );
      }
    } else {
      setCheckOut(formattedDate);
    }

    setIsCalendarOpen(false);
    setAvailabilityError('');
  };

  const openCalendar = (target) => {
    setCalendarTarget(target);
    setIsCalendarOpen(true);
    const refDate = target === 'checkIn' && checkIn ? new Date(`${checkIn}T00:00:00`) : checkOut ? new Date(`${checkOut}T00:00:00`) : new Date();
    setCurrentMonth(new Date(refDate.getFullYear(), refDate.getMonth(), 1));
  };

  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const handleSave = async () => {
    setError('');
    if (!checkIn || !checkOut) {
      setError('Please select both check-in and check-out dates.');
      return;
    }

    const checkInDate = buildCheckInDateTime(checkIn);
    const checkOutDate = buildCheckOutDateTime(checkOut);

    if (checkOutDate <= checkInDate) {
      setError('Check-out must be after check-in.');
      return;
    }

    if (isExclusive) {
      if (!validateExclusiveGuests()) {
        setError(exclusiveGuestError);
        return;
      }
    } else if (!validateGuestCounts()) {
      setError('Please fix guest count errors before saving.');
      return;
    }

    if (isNaN(parsedBalanceNum) || parsedBalanceNum < 0) {
      setError('Please enter a valid balance amount.');
      return;
    }

    const isAvailable = await checkAvailability();
    if (!isAvailable) return;

    setIsLoading(true);

    try {
      const calculatedNights = stayNights;
      const checkInDt = buildCheckInDateTime(checkIn);
      const checkOutDt = buildCheckOutDateTime(checkOut);
      const paymentTotal = fixedDownPayment + parsedBalanceNum;

      const buildPaymentFields = (childDownPayment = fixedDownPayment, childTotalPrice = paymentTotal) => ({
        manualBalance: parsedBalanceNum,
        manualDownPayment: fixedDownPayment,
        manualTotalPrice: paymentTotal,
        downPayment: childDownPayment,
        remainingBalance: Math.max(0, childTotalPrice - childDownPayment),
        totalPrice: childTotalPrice,
      });

      const baseUpdates = {
        checkIn: checkInDt,
        checkOut: checkOutDt,
        nights: calculatedNights,
        ...buildPaymentFields(),
        updatedAt: new Date().toISOString(),
      };

      let totalAdults = 0;
      let totalKids = 0;
      let newTotalPrice = Number(booking.totalPrice) || 0;

      if (isExclusive) {
        const nightlyTotal = BASE_EXCLUSIVE_PRICE + exclusiveTentCount * 1500;
        newTotalPrice = nightlyTotal * calculatedNights;
        totalAdults = exclusiveAdults;
        totalKids = exclusiveKids;

        const exclusiveChildTotal = childBookings.length > 0
          ? Math.round(paymentTotal / childBookings.length)
          : paymentTotal;

        const exclusiveUpdates = {
          ...baseUpdates,
          exclusiveAdults,
          exclusiveKids,
          adults: exclusiveAdults,
          kids: exclusiveKids,
          guests: exclusiveAdults + exclusiveKids,
          totalGuests: exclusiveAdults + exclusiveKids,
          tentCount: exclusiveTentCount,
          exclusivePackagePrice: paymentTotal,
          ...buildPaymentFields(
            childBookings.length > 0
              ? (childBookings[0].downPayment ?? exclusiveChildTotal * 0.5)
              : fixedDownPayment,
            exclusiveChildTotal
          ),
        };

        for (const child of childBookings) {
          if (!child.id) continue;
          const childDown =
            typeof child.downPayment === 'number' && child.downPayment > 0
              ? child.downPayment
              : exclusiveChildTotal * 0.5;
          await updateDoc(
            doc(db, 'bookings', child.id),
            omitUndefinedDeep({
              ...exclusiveUpdates,
              ...buildPaymentFields(childDown, exclusiveChildTotal),
              updatedAt: new Date().toISOString(),
            })
          );
        }
        newTotalPrice = paymentTotal;
      } else if (isMultiRoom && childBookings.length > 0) {
        const oldGroupTotal = childBookings.reduce((sum, child) => sum + Number(child.totalPrice || 0), 0);
        const scale = oldGroupTotal > 0 ? paymentTotal / oldGroupTotal : 1;

        for (let i = 0; i < childBookings.length; i++) {
          const child = childBookings[i];
          const guestData = guestCounts[i];
          if (!child.id) continue;

          const childAdults = guestData?.adults ?? child.adults ?? 1;
          const childKids = guestData?.kids ?? child.kids ?? 0;
          totalAdults += childAdults;
          totalKids += childKids;

          const childDown =
            typeof child.downPayment === 'number' && child.downPayment > 0
              ? child.downPayment
              : Number(child.totalPrice || 0) * 0.5;
          const scaledTotal = Math.round(Number(child.totalPrice || 0) * scale);

          await updateDoc(
            doc(db, 'bookings', child.id),
            omitUndefinedDeep({
              checkIn: checkInDt,
              checkOut: checkOutDt,
              nights: calculatedNights,
              adults: childAdults,
              kids: childKids,
              guests: childAdults + childKids,
              ...buildPaymentFields(childDown, scaledTotal),
              updatedAt: new Date().toISOString(),
            })
          );
        }
        newTotalPrice = paymentTotal;
      } else {
        let unitAdults = 0;
        let unitKids = 0;
        for (const guest of Object.values(guestCounts)) {
          unitAdults += guest.adults || 0;
          unitKids += guest.kids || 0;
        }
        totalAdults = unitAdults;
        totalKids = unitKids;

        await updateDoc(
          doc(db, 'bookings', booking.id),
          omitUndefinedDeep({
            ...baseUpdates,
            adults: totalAdults,
            kids: totalKids,
            guests: totalAdults + totalKids,
            perUnitGuests: guestCounts,
          })
        );
        newTotalPrice = paymentTotal;
      }

      await logAdminAction({
        action: 'Admin Edited Booking',
        module: 'Reservations',
        details: `Updated booking ${booking.bookingId}: dates ${checkIn} to ${checkOut}, ${totalAdults} adults, ${totalKids} kids, balance ₱${parsedBalanceNum.toLocaleString()}`,
      });

      onSuccess?.({
        checkIn: checkInDt,
        checkOut: checkOutDt,
        adults: isExclusive ? exclusiveAdults : totalAdults,
        kids: isExclusive ? exclusiveKids : totalKids,
        exclusiveAdults: isExclusive ? exclusiveAdults : booking.exclusiveAdults,
        exclusiveKids: isExclusive ? exclusiveKids : booking.exclusiveKids,
        totalGuests: isExclusive ? exclusiveAdults + exclusiveKids : totalAdults + totalKids,
        guests: isExclusive ? exclusiveAdults + exclusiveKids : totalAdults + totalKids,
        totalPrice: paymentTotal,
        downPayment: fixedDownPayment,
        remainingBalance: parsedBalanceNum,
        manualBalance: parsedBalanceNum,
        manualDownPayment: fixedDownPayment,
        manualTotalPrice: paymentTotal,
        childBookings: isMultiRoom
          ? childBookings.map((child, i) => ({
              ...child,
              adults: guestCounts[i]?.adults ?? child.adults,
              kids: guestCounts[i]?.kids ?? child.kids,
              checkIn: checkInDt,
              checkOut: checkOutDt,
            }))
          : undefined,
        originalChildBookings: isMultiRoom
          ? childBookings.map((child, i) => ({
              ...child,
              adults: guestCounts[i]?.adults ?? child.adults,
              kids: guestCounts[i]?.kids ?? child.kids,
              checkIn: checkInDt,
              checkOut: checkOutDt,
            }))
          : undefined,
      });
    } catch (err) {
      console.error('Error updating booking:', err);
      setError('Failed to update booking. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !booking) return null;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const days = getDaysInMonth(currentMonth);
  const selectedDateStr = calendarTarget === 'checkIn' ? checkIn : checkOut;
  const bookingLabel = booking.bookingIdDisplay || booking.roomType || 'Room Booking';

  return (
    <div>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-[#4D8CF5]/20 bg-gradient-to-r from-[#EEF4FF] to-white px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#4D8CF5]/15">
                <i className="fas fa-edit text-[#4D8CF5]" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-[#1E3A8A]">Edit Booking</h3>
                <p className="mt-1 text-sm text-[#4D8CF5]">
                  {bookingLabel} · <span className="font-mono font-semibold">{booking.bookingId}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-6">
            {/* Dates */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#1E3A8A]">
                <i className="fas fa-calendar-alt mr-2 text-[#4D8CF5]" />
                Stay Dates
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative" ref={calendarTriggerRef}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Check-in Date</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={formatDisplayDate(checkIn)}
                      placeholder="Select check-in"
                      onClick={() => openCalendar('checkIn')}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm cursor-pointer focus:border-[#4D8CF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                    />
                    <button
                      type="button"
                      onClick={() => openCalendar('checkIn')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4D8CF5]"
                    >
                      <i className="fas fa-calendar-alt text-sm" />
                    </button>
                  </div>
                  {isCalendarOpen && calendarTarget === 'checkIn' && (
                    <div
                      ref={calendarPopoverRef}
                      className="absolute z-50 bg-white w-[300px] rounded-2xl shadow-xl p-3 border border-gray-100 mt-2"
                    >
                      {renderCalendar()}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Check-out Date</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={formatDisplayDate(checkOut)}
                      placeholder="Select check-out"
                      onClick={() => openCalendar('checkOut')}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm cursor-pointer focus:border-[#4D8CF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                    />
                    <button
                      type="button"
                      onClick={() => openCalendar('checkOut')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4D8CF5]"
                    >
                      <i className="fas fa-calendar-alt text-sm" />
                    </button>
                  </div>
                  {isCalendarOpen && calendarTarget === 'checkOut' && (
                    <div ref={calendarPopoverRef} className="absolute z-50 bg-white w-[300px] rounded-2xl shadow-xl p-3 border border-gray-100 mt-2">
                      {renderCalendar()}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stayNights} night{stayNights !== 1 ? 's' : ''} · Unavailable dates are disabled
              </p>
              {availabilityError && (
                <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-700 flex items-center gap-2">
                    <i className="fas fa-exclamation-triangle" />
                    {availabilityError}
                  </p>
                </div>
              )}
              {isCheckingAvailability && (
                <div className="mt-2 flex items-center gap-2 text-[#4D8CF5] text-sm">
                  <i className="fas fa-spinner fa-spin" />
                  Checking availability...
                </div>
              )}
            </div>

            {/* Guests */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#1E3A8A]">
                <i className="fas fa-users mr-2 text-[#4D8CF5]" />
                Guest Count
              </h4>
              {isExclusive ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800">Entire Resort Package</p>
                  <p className="text-xs text-amber-700">Tents: {exclusiveTentCount} (read-only)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                      <input
                        type="number"
                        min={1}
                        value={exclusiveAdults}
                        onChange={(e) => handleExclusiveGuestChange('adults', e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-[#4D8CF5] focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                      <input
                        type="number"
                        min={0}
                        value={exclusiveKids}
                        onChange={(e) => handleExclusiveGuestChange('kids', e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-[#4D8CF5] focus:outline-none"
                      />
                    </label>
                  </div>
                  {exclusiveGuestError && (
                    <p className="text-xs text-red-600">{exclusiveGuestError}</p>
                  )}
                </div>
              ) : isMultiRoom ? (
                <div className="space-y-3">
                  {Object.entries(guestCounts).map(([index, guest]) => (
                    <div key={index} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                      <p className="text-sm font-semibold text-[#1E3A8A] mb-2">{guest.roomType}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                          <input
                            type="number"
                            min={1}
                            value={guest.adults}
                            onChange={(e) => updateGuestCount(index, 'adults', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                          <input
                            type="number"
                            min={0}
                            value={guest.kids}
                            onChange={(e) => updateGuestCount(index, 'kids', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          />
                        </label>
                      </div>
                      {guestErrors[index] && (
                        <p className="text-xs text-red-600 mt-1">{guestErrors[index]}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                    <input
                      type="number"
                      min={1}
                      value={guestCounts[0]?.adults ?? 1}
                      onChange={(e) => updateGuestCount(0, 'adults', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                    <input
                      type="number"
                      min={0}
                      value={guestCounts[0]?.kids ?? 0}
                      onChange={(e) => updateGuestCount(0, 'kids', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                    />
                  </label>
                  {guestErrors[0] && <p className="col-span-2 text-xs text-red-600">{guestErrors[0]}</p>}
                </div>
              )}
            </div>

            {/* Payment */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-[#1E3A8A]">
                <i className="fas fa-credit-card mr-2 text-[#4D8CF5]" />
                Payment Information
              </h4>
              
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">Balance (₱)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-[#4D8CF5] focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                    <p className="text-xs text-[#1E3A8A]/70 mb-1">50% Down Payment</p>
                    <p className="font-bold text-[#1E3A8A]">₱{fixedDownPayment.toLocaleString()}</p>
                  </div>
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                    <p className="text-xs text-[#1E3A8A]/70 mb-1">Total Amount</p>
                    <p className="font-bold text-[#1E3A8A]">₱{computedTotalAmount.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500">50% Down Payment + Balance = Total Amount</p>
              </div>
            </div>

            {error && (
              <div>
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <i className="fas fa-exclamation-circle" />
                  {error}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl bg-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || isCheckingAvailability}
              className="rounded-xl bg-[#4D8CF5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#3B7AE8] disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <i className="fas fa-save" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function renderCalendar() {
    return (
      <>
        <div className="flex justify-between items-center mb-3 px-1">
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="w-8 h-8 flex justify-center items-center text-gray-500 border border-gray-200 hover:text-[#4D8CF5] rounded-full"
          >
            <i className="fas fa-chevron-left text-xs" />
          </button>
          <h4 className="font-bold text-gray-800 text-sm">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h4>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="w-8 h-8 flex justify-center items-center text-gray-500 border border-gray-200 hover:text-[#4D8CF5] rounded-full"
          >
            <i className="fas fa-chevron-right text-xs" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (!day) return <div key={index} className="h-9" />;
            const isDisabled = !isDateSelectable(day);
            const isSelected =
              selectedDateStr && new Date(`${selectedDateStr}T00:00:00`).toDateString() === day.toDateString();
            return (
              <button
                key={index}
                type="button"
                disabled={isDisabled}
                onClick={() => handleDateSelect(day)}
                className={`h-9 flex items-center justify-center text-xs font-medium rounded-lg transition-all ${
                  isDisabled
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : isSelected
                      ? 'bg-[#4D8CF5] text-white shadow-md'
                      : 'border border-gray-100 hover:border-[#4D8CF5] hover:text-[#4D8CF5] cursor-pointer'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </>
    );
  }
}
