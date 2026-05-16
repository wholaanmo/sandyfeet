// app/my-bookings/EditReservationModal.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDateValue } from './utils';

export default function EditReservationModal({ isOpen, booking, onClose, onSuccess }) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [originalNights, setOriginalNights] = useState(0);
  const [guestCounts, setGuestCounts] = useState({});
  const [guestErrors, setGuestErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [roomCapacities, setRoomCapacities] = useState({});
  const [roomMaxCapacity, setRoomMaxCapacity] = useState(null);
  const [roomMinCapacity, setRoomMinCapacity] = useState(null);
  const [roomCapacitiesMap, setRoomCapacitiesMap] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // Exclusive Resort specific state
  const [exclusiveAdults, setExclusiveAdults] = useState(0);
  const [exclusiveKids, setExclusiveKids] = useState(0);
  const [exclusiveTentCount, setExclusiveTentCount] = useState(0);
  const [exclusiveGuestError, setExclusiveGuestError] = useState('');
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [roomDetailsMap, setRoomDetailsMap] = useState({});
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  const CHECK_IN_HOUR = 14;
  const CHECK_OUT_HOUR = 12;
  const BASE_EXCLUSIVE_PRICE = 22500;

  const isExclusive = booking?.isExclusiveResortBooking || false;
  const isMultiRoom = booking?.isMultiRoom || (booking?.children && booking.children.length > 0);

  // Helper functions for Exclusive Resort (mirroring app/rooms)
  const getExclusiveMaxPax = () => {
    let totalPax = 38;
    totalPax += exclusiveTentCount * 4;
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

  // No tent add/remove handlers needed — they are removed from UI.

  // Fetch available room types and room details (unchanged)
  useEffect(() => {
    const fetchRoomTypes = async () => {
      try {
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const types = [];
        const roomDetails = {};
        const capacitiesMap = {};
        
        roomsSnapshot.forEach((doc) => {
          const roomData = doc.data();
          if (roomData.archived === true) return;
          if (roomData.availability !== 'available') return;
          
          const roomType = roomData.type;
          
          capacitiesMap[roomType] = {
            max: roomData.capacityMax || 10,
            min: roomData.capacityMin || 1
          };
          
          const existingType = types.find(t => t.type === roomType);
          if (existingType) {
            existingType.totalRooms += roomData.totalRooms || 1;
            existingType.maintenanceRooms += roomData.maintenanceRooms || 0;
            existingType.availableRooms += (roomData.totalRooms || 1) - (roomData.maintenanceRooms || 0);
            existingType.roomIds.push(doc.id);
          } else {
            types.push({
              id: doc.id,
              type: roomType,
              price: roomData.price,
              capacityMin: roomData.capacityMin,
              capacityMax: roomData.capacityMax,
              description: roomData.description,
              images: roomData.images || [],
              inclusions: roomData.inclusions || [],
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
        setRoomCapacitiesMap(capacitiesMap);
        
        const capacities = {};
        types.forEach(type => {
          capacities[type.type] = type.capacityMax || 10;
        });
        setRoomCapacities(capacities);
      } catch (err) {
        console.error('Error fetching room types:', err);
      }
    };
    
    if (isOpen) fetchRoomTypes();
  }, [isOpen]);

  // Get total units for a room type (for exclusive availability check) — unchanged
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
      for (let dayOffset = 0; dayOffset < originalNights; dayOffset++) {
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

  // Exclusive availability check - mirrors app/rooms isDateFullyAvailableForExclusive
  const isDateFullyAvailableForExclusive = (date) => {
    if (!date || availableRoomTypes.length === 0) return false;
    for (const roomTypeData of availableRoomTypes) {
      const totalUnits = getTotalUnitsForRoomType(roomTypeData);
      if (totalUnits <= 0) return false;

      if (roomTypeData.type === 'Tent') {
        const bookedUnits = getMaxBookedUnitsForRoomTypeOnDate(date, roomTypeData);
        if (bookedUnits > 0) return false;
      } else {
        const availableUnits = getAvailableUnitsForRoomTypeOnDate(date, roomTypeData);
        if (availableUnits < totalUnits) return false;
      }
    }
    return true;
  };

  // Fetch booked dates and blocked slots — unchanged
  useEffect(() => {
    if (availableRoomTypes.length === 0 || !isOpen) return;
    
    const allRoomIds = availableRoomTypes.flatMap(type => type.roomIds);
    if (allRoomIds.length === 0) return;
    
    const fetchBookingsAndBlocks = async () => {
      try {
        const bookingsRef = collection(db, 'bookings');
        const bookingsQuery = query(
          bookingsRef,
          where('status', 'in', ['pending', 'confirmed', 'check-in'])
        );
        const bookingsSnapshot = await getDocs(bookingsQuery);
        
        const booked = {};
        bookingsSnapshot.forEach((docSnap) => {
          const bookingData = docSnap.data();
          if (docSnap.id === booking?.id) return;
          if (booking?.children && booking.children.some(child => child.id === docSnap.id)) return;
          if (booking?.parentBookingId === docSnap.id) return;
          
          const checkInDate = bookingData.checkIn?.toDate ? bookingData.checkIn.toDate() : new Date(bookingData.checkIn);
          const checkOutDate = bookingData.checkOut?.toDate ? bookingData.checkOut.toDate() : new Date(bookingData.checkOut);
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
        
        const blockedRef = collection(db, 'unavailableSlots');
        const blockedSnapshot = await getDocs(blockedRef);
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
              blocks[dateKey][data.roomId][hour] = (blocks[dateKey][data.roomId][hour] || 0) + unitsBlocked;
            }
          }
        });
        setBlockedSlots(blocks);
        
      } catch (err) {
        console.error('Error fetching availability:', err);
      }
    };
    
    fetchBookingsAndBlocks();
  }, [availableRoomTypes, isOpen, booking]);

  // Fetch room capacity limits for the specific room type (single room) — unchanged
  useEffect(() => {
    const fetchRoomCapacity = async () => {
      if (!booking?.roomType || !isOpen) return;
      
      try {
        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef, where('type', '==', booking.roomType));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const roomData = snapshot.docs[0].data();
          setRoomMaxCapacity(roomData.capacityMax || 10);
          setRoomMinCapacity(roomData.capacityMin || 1);
        } else {
          setRoomMaxCapacity(10);
          setRoomMinCapacity(1);
        }
      } catch (err) {
        console.error('Error fetching room capacity:', err);
        setRoomMaxCapacity(10);
        setRoomMinCapacity(1);
      }
    };
    
    if (!isMultiRoom && !isExclusive && booking?.roomType) {
      fetchRoomCapacity();
    }
  }, [booking?.roomType, isOpen, isMultiRoom, isExclusive]);

  // Initialize form with booking data — unchanged
  useEffect(() => {
    if (booking && isOpen) {
      const checkInDate = toDateValue(booking.checkIn);
      const checkOutDate = toDateValue(booking.checkOut);
      
      if (checkInDate && checkOutDate) {
        const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
        setOriginalNights(nights);
        const checkInStr = checkInDate.toISOString().split('T')[0];
        setCheckIn(checkInStr);
        const autoCheckOut = new Date(checkInDate);
        autoCheckOut.setDate(checkInDate.getDate() + nights);
        setCheckOut(autoCheckOut.toISOString().split('T')[0]);
      }

      // Initialize guest counts based on booking type (Entire Resort before multi-room)
      if (isExclusive) {
        setExclusiveAdults(booking.exclusiveAdults ?? booking.adults ?? 1);
        setExclusiveKids(booking.exclusiveKids ?? booking.kids ?? 0);
        setExclusiveTentCount(booking.tentCount || 0);
        setExclusiveGuestError('');
      } else if (isMultiRoom && booking.children) {
        const counts = {};
        booking.children.forEach((child, index) => {
          const roomCapacity = roomCapacitiesMap[child.roomType] || { max: 10, min: 1 };
          counts[index] = {
            adults: child.adults || 1,
            kids: child.kids || 0,
            roomType: child.roomType || 'Room',
            roomId: child.roomId || null,
            maxCapacity: roomCapacity.max,
            minCapacity: roomCapacity.min
          };
        });
        setGuestCounts(counts);
      } else {
        const numberOfUnits = booking.numberOfRooms || 1;
        const counts = {};
        
        if (booking.children && booking.children.length > 0) {
          booking.children.forEach((child, index) => {
            counts[index] = {
              adults: child.adults || 1,
              kids: child.kids || 0
            };
          });
        } else {
          const totalAdults = booking.adults || 1;
          const totalKids = booking.kids || 0;
          const baseAdults = Math.floor(totalAdults / numberOfUnits);
          const remainderAdults = totalAdults % numberOfUnits;
          const baseKids = Math.floor(totalKids / numberOfUnits);
          const remainderKids = totalKids % numberOfUnits;
          
          for (let i = 0; i < numberOfUnits; i++) {
            counts[i] = {
              adults: baseAdults + (i < remainderAdults ? 1 : 0),
              kids: baseKids + (i < remainderKids ? 1 : 0)
            };
          }
        }
        
        setGuestCounts(counts);
      }
    }
  }, [booking, isOpen, isMultiRoom, isExclusive, roomCapacitiesMap]);

  // Auto-update check-out when check-in changes — unchanged
  useEffect(() => {
    if (checkIn && originalNights > 0) {
      const checkInDate = new Date(checkIn);
      const autoCheckOut = new Date(checkInDate);
      autoCheckOut.setDate(checkInDate.getDate() + originalNights);
      setCheckOut(autoCheckOut.toISOString().split('T')[0]);
    }
  }, [checkIn, originalNights]);

  // Close calendar when clicking outside — unchanged
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

  const isDateUnavailable = (date) => {
    if (!date || availableRoomTypes.length === 0) return true;
    
    // For exclusive bookings, use the same logic as app/rooms
    if (isExclusive) {
      return !isDateFullyAvailableForExclusive(date);
    }
    
    const roomRequests = [];
    if (isMultiRoom && booking?.roomTypesArray) {
      for (const rt of booking.roomTypesArray) {
        roomRequests.push({ type: rt.type, quantity: rt.quantity });
      }
    } else if (booking?.roomType) {
      roomRequests.push({ 
        type: booking.roomType, 
        quantity: booking.numberOfRooms || 1 
      });
    } else {
      return false;
    }
    
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    for (const req of roomRequests) {
      const roomTypeData = availableRoomTypes.find(t => t.type === req.type);
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

  const isDateSelectable = (date) => {
    if (isDatePast(date)) return false;
    if (isDateTooSoon(date)) return false;
    if (isDateUnavailable(date)) return false;
    return true;
  };

  const handleDateSelect = (date) => {
    if (!isDateSelectable(date)) return;
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const selected = new Date(Date.UTC(year, month, day, 12, 0, 0));
    const formattedDate = selected.toISOString().split('T')[0];
    setCheckIn(formattedDate);
    setIsCalendarOpen(false);
    setAvailabilityError('');
    
    // For exclusive bookings, also update the availability check
    if (isExclusive) {
      const isFullyAvailable = isDateFullyAvailableForExclusive(date);
      if (!isFullyAvailable) {
        setAvailabilityError('Selected dates are not fully available for the Entire Resort Package.');
      }
    }
  };

  const toggleCalendar = () => {
    setIsCalendarOpen(!isCalendarOpen);
  };

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

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = getDaysInMonth(currentMonth);

  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Validate per-unit guest counts (for non-exclusive bookings) — unchanged
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
      
      const totalGuests = (guest.adults || 0) + (guest.kids || 0);
      
      if ((guest.adults || 0) < 1) {
        errors[index] = 'At least 1 adult per unit';
        hasError = true;
      } else if (maxCapacity && totalGuests > maxCapacity) {
        errors[index] = `Maximum ${maxCapacity} guests per unit`;
        hasError = true;
      } else if (minCapacity && totalGuests < minCapacity) {
        errors[index] = `Minimum ${minCapacity} guests per unit`;
        hasError = true;
      } else if (errors[index]) {
        delete errors[index];
      }
    }
    
    setGuestErrors(errors);
    return !hasError;
  };

  // Validate exclusive resort guest counts (aligned with app/rooms handleProceed) — unchanged
  const validateExclusiveGuests = () => {
    const adults = Math.max(0, Number(exclusiveAdults) || 0);
    const kids = Math.max(0, Number(exclusiveKids) || 0);
    const totalGuests = adults + kids;
    const maxPax = getExclusiveMaxPax();

    if (adults < 1) {
      setExclusiveGuestError('At least 1 adult is required.');
      return false;
    }
    if (totalGuests < 1) {
      setExclusiveGuestError('Please enter at least 1 guest.');
      return false;
    }
    if (maxPax > 0 && totalGuests > maxPax) {
      setExclusiveGuestError(`Maximum ${maxPax} guests can be accommodated for the whole resort package.`);
      return false;
    }
    setExclusiveGuestError('');
    return true;
  };

  const checkAvailability = async () => {
    if (!checkIn || !booking || booking.type === 'daytour') return true;
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    setIsCheckingAvailability(true);
    setAvailabilityError('');
    
    try {
      let roomRequests = [];
      if (isExclusive) {
        // For exclusive, we need to check if the entire resort is available
        const selectedDate = new Date(checkIn);
        if (!isDateFullyAvailableForExclusive(selectedDate)) {
          setAvailabilityError('The Entire Resort Package is not available for the selected dates. Some rooms are already booked.');
          setIsCheckingAvailability(false);
          return false;
        }
        setIsCheckingAvailability(false);
        return true;
      } else if (isMultiRoom && booking.roomTypesArray) {
        roomRequests = booking.roomTypesArray.map(rt => ({
          type: rt.type,
          quantity: rt.quantity
        }));
      } else if (booking.roomType) {
        roomRequests = [{
          type: booking.roomType,
          quantity: booking.numberOfRooms || 1
        }];
      } else {
        setIsCheckingAvailability(false);
        return true;
      }

      const bookingsRef = collection(db, 'bookings');
      const overlappingQuery = query(
        bookingsRef,
        where('status', 'in', ['pending', 'confirmed', 'check-in'])
      );
      const snapshot = await getDocs(overlappingQuery);
      
      for (let dayOffset = 0; dayOffset < originalNights; dayOffset++) {
        const currentDate = new Date(checkInDate);
        currentDate.setDate(checkInDate.getDate() + dayOffset);
        currentDate.setHours(0, 0, 0, 0);
        const dateStr = currentDate.toISOString().split('T')[0];

        for (const req of roomRequests) {
          let bookedCount = 0;
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (isMultiRoom && booking.children) {
              if (booking.children.some(child => child.id === docSnap.id)) continue;
            } else if (docSnap.id === booking.id) continue;

            if (data.roomType !== req.type) continue;
            
            const existingCheckIn = toDateValue(data.checkIn);
            const existingCheckOut = toDateValue(data.checkOut);
            if (!existingCheckIn || !existingCheckOut) continue;
            
            const existingStart = new Date(existingCheckIn);
            const existingEnd = new Date(existingCheckOut);
            existingStart.setHours(0, 0, 0, 0);
            existingEnd.setHours(0, 0, 0, 0);
            
            if (currentDate >= existingStart && currentDate < existingEnd) {
              bookedCount += data.numberOfRooms || 1;
            }
          }
          
          const totalCapacity = roomCapacities[req.type] || 10;
          const available = totalCapacity - bookedCount;
          if (available < req.quantity) {
            setAvailabilityError(
              `${req.type} is not fully available on ${dateStr}. ` +
              `Only ${available} of ${req.quantity} room(s) available.`
            );
            setIsCheckingAvailability(false);
            return false;
          }
        }
      }
      
      setIsCheckingAvailability(false);
      return true;
    } catch (err) {
      console.error('Availability check error:', err);
      setAvailabilityError('Unable to check availability. Please try again.');
      setIsCheckingAvailability(false);
      return false;
    }
  };

  const handleConfirmReschedule = async () => {
    setShowConfirmModal(false);
    setError('');
    
    if (!checkIn) {
      setError('Please select a check-in date');
      return;
    }
    
    // Validate based on booking type
    if (isExclusive) {
      if (!validateExclusiveGuests()) {
        setError(exclusiveGuestError);
        return;
      }
    } else {
      if (!validateGuestCounts()) {
        setError('Please fix guest count errors before proceeding');
        return;
      }
    }
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (checkInDate < today) {
      setError('Check-in date cannot be in the past');
      return;
    }
    
    const calculatedNights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
    if (calculatedNights !== originalNights) {
      setError(`Reservation duration cannot be changed. Original stay: ${originalNights} night(s)`);
      return;
    }
    
    const isAvailable = await checkAvailability();
    if (!isAvailable) return;
    
    setIsLoading(true);
    
    try {
      const updates = {
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights: originalNights,
        updatedAt: new Date()
      };
      
      const nightlyRate = booking.totalPrice / originalNights;
      const newTotalPrice = nightlyRate * originalNights;
      updates.totalPrice = Math.round(newTotalPrice);
      updates.downPayment = updates.totalPrice * 0.5;
      updates.remainingBalance = updates.totalPrice - updates.downPayment;
      
      if (isExclusive) {
        updates.exclusiveAdults = exclusiveAdults;
        updates.exclusiveKids = exclusiveKids;
        updates.totalGuests = exclusiveAdults + exclusiveKids;
        updates.guests = exclusiveAdults + exclusiveKids;
        updates.tentCount = exclusiveTentCount;
        if (booking.children?.length) {
          for (const child of booking.children) {
            if (!child.id) continue;
            const childRef = doc(db, 'bookings', child.id);
            await updateDoc(childRef, {
              checkIn: checkInDate,
              checkOut: checkOutDate,
              nights: originalNights,
              adults: exclusiveAdults,
              kids: exclusiveKids,
              guests: exclusiveAdults + exclusiveKids,
              exclusiveAdults,
              exclusiveKids,
              tentCount: exclusiveTentCount,
              updatedAt: new Date()
            });
          }
        }
      } else if (isMultiRoom && booking.children) {
        let totalAdults = 0, totalKids = 0;
        for (let i = 0; i < booking.children.length; i++) {
          const child = booking.children[i];
          const guestData = guestCounts[i];
          if (guestData && child.id) {
            const childRef = doc(db, 'bookings', child.id);
            await updateDoc(childRef, {
              adults: guestData.adults,
              kids: guestData.kids,
              guests: guestData.adults + guestData.kids,
              updatedAt: new Date()
            });
            totalAdults += guestData.adults;
            totalKids += guestData.kids;
          }
        }
        updates.totalGuests = totalAdults + totalKids;
        updates.guests = totalAdults + totalKids;
      } else {
        let totalAdults = 0, totalKids = 0;
        for (const guest of Object.values(guestCounts)) {
          totalAdults += guest.adults || 0;
          totalKids += guest.kids || 0;
        }
        updates.adults = totalAdults;
        updates.kids = totalKids;
        updates.guests = totalAdults + totalKids;
        updates.perUnitGuests = guestCounts;
      }
      
      if (isMultiRoom && booking.parentBookingId) {
        for (let i = 0; i < booking.children.length; i++) {
          const child = booking.children[i];
          const childRef = doc(db, 'bookings', child.id);
          await updateDoc(childRef, {
            checkIn: checkInDate,
            checkOut: checkOutDate,
            nights: originalNights,
            updatedAt: new Date()
          });
        }
        const parentRef = doc(db, 'bookings', booking.parentBookingId);
        await updateDoc(parentRef, updates);
      } else {
        const bookingRef = doc(db, 'bookings', booking.id);
        await updateDoc(bookingRef, updates);
      }
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating booking:', err);
      setError('Failed to update reservation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateGuestCount = (index, field, value) => {
    const parsedValue = parseInt(value) || 0;
    
    let maxCapacity = roomMaxCapacity;
    if (isMultiRoom && guestCounts[index]?.roomType) {
      const roomCap = roomCapacitiesMap[guestCounts[index].roomType];
      if (roomCap) {
        maxCapacity = roomCap.max;
      }
    }
    
    let finalValue = parsedValue;
    if (field === 'kids' && maxCapacity) {
      const currentAdults = guestCounts[index]?.adults || 1;
      const maxAllowedKids = Math.max(0, maxCapacity - currentAdults);
      if (finalValue > maxAllowedKids) {
        finalValue = maxAllowedKids;
      }
    }
    
    setGuestCounts(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        [field]: finalValue
      }
    }));
    
    if (guestErrors[index]) {
      setGuestErrors(prev => ({
        ...prev,
        [index]: ''
      }));
    }
  };

  if (!isOpen || !booking) return null;

  const isDayTour = booking.type === 'daytour';
  if (isDayTour) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-red-100 bg-red-50 px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <i className="fas fa-exclamation-triangle text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-900">Not Available</h3>
                <p className="mt-1 text-sm text-red-700">
                  Day tour bookings cannot be edited. Please contact support for changes.
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4">
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const numberOfUnits = booking.numberOfRooms || 1;
  const exclusiveTotalPax = exclusiveAdults + exclusiveKids;
  const exclusiveMaxPax = getExclusiveMaxPax();

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        
        <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
          {/* Header */}
          <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <i className="fas fa-calendar-alt text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-blue-900">Reschedule Reservation</h3>
                <p className="mt-1 text-sm text-blue-600">
                  Booking ID: <span className="font-mono font-semibold">{booking.bookingId}</span>
                </p>
                <p className="text-xs text-blue-500">
                  Original stay: {originalNights} night{originalNights !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
            {/* Date Selection */}
            <div className="mb-6">
              <h4 className="mb-3 text-sm font-semibold text-gray-700">
                <i className="fas fa-calendar-alt mr-2 text-blue-500" />
                Select New Dates
              </h4>
              
              <div className="mb-4 rounded-lg bg-blue-50 p-3">
                <p className="text-sm text-blue-800 flex items-start gap-2">
                  <i className="fas fa-info-circle mt-0.5 text-blue-600" />
                  <span>Your reservation is for <strong>{originalNights} night{originalNights !== 1 ? 's' : ''}</strong>. Changing the check-in date will automatically set check-out to maintain the same duration.</span>
                </p>
              </div>
              
              {/* Check-in and Check-out Inputs */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative" ref={calendarTriggerRef}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    New Check-in Date
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formatDisplayDate(checkIn)}
                      placeholder="Select date"
                      readOnly
                      onClick={toggleCalendar}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm text-gray-800 cursor-pointer transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={toggleCalendar}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      <i className="fas fa-calendar-alt text-sm"></i>
                    </button>
                  </div>
                  
                  {/* Calendar Popover - positioned directly below the input */}
                  {isCalendarOpen && (
                    <div 
                      ref={calendarPopoverRef} 
                      className="absolute z-50 bg-white w-[320px] rounded-2xl shadow-[0_16px_40px_rgb(0,0,0,0.14)] p-3 border border-gray-100"
                      style={{ left: 0, top: '100%', marginTop: '8px' }}
                    >
                      <div className="flex justify-between items-center mb-3 px-1">
                        <button type="button" onClick={goToPreviousMonth} className="w-8 h-8 flex justify-center items-center text-gray-500 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors">
                          <i className="fas fa-chevron-left text-xs"></i>
                        </button>
                        <h4 className="font-bold text-gray-800 text-sm tracking-wide">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h4>
                        <button type="button" onClick={goToNextMonth} className="w-8 h-8 flex justify-center items-center text-gray-500 border border-gray-200 hover:text-blue-500 hover:border-blue-200 rounded-full transition-colors">
                          <i className="fas fa-chevron-right text-xs"></i>
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 py-1">{d}</div>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1">
                        {days.map((day, index) => {
                          if (!day) return <div key={index} className="h-10"></div>;
                          
                          const isPast = isDatePast(day);
                          const isTooSoon = isDateTooSoon(day);
                          const isUnavailable = isDateUnavailable(day);
                          const isDisabled = isPast || isTooSoon || isUnavailable;
                          const isSelected = checkIn && new Date(checkIn).toDateString() === day.toDateString();
                          
                          let bgColor = 'bg-white';
                          let textColor = 'text-gray-700';
                          let hoverClass = 'hover:border-blue-400 hover:text-blue-600 cursor-pointer';
                          let borderClass = 'border border-gray-100';
                          
                          if (isDisabled) {
                            bgColor = 'bg-gray-100';
                            textColor = 'text-gray-300';
                            hoverClass = 'cursor-not-allowed';
                            borderClass = 'border-transparent';
                          } else if (isSelected) {
                            bgColor = 'bg-blue-600';
                            textColor = 'text-white';
                            hoverClass = 'cursor-pointer shadow-md';
                            borderClass = 'border-blue-600';
                          }
                          
                          return (
                            <button
                              key={index}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleDateSelect(day)}
                              className={`h-10 flex items-center justify-center font-medium text-xs transition-all rounded-xl ${bgColor} ${textColor} ${hoverClass} ${borderClass} ${!isDisabled && !isSelected && 'hover:bg-blue-50'}`}
                            >
                              {day.getDate()}
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-500">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-gray-100 border border-gray-200"></div>
                          <span>Unavailable</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                          <span>Selected</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    New Check-out Date (Auto-calculated)
                  </label>
                  <input
                    type="text"
                    value={formatDisplayDate(checkOut)}
                    disabled
                    className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    <i className="fas fa-lock text-[10px] mr-1"></i>
                    Duration locked to {originalNights} night{originalNights !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              
              {availabilityError && (
                <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-700 flex items-center gap-2">
                    <i className="fas fa-exclamation-triangle" />
                    {availabilityError}
                  </p>
                </div>
              )}
              
              {isCheckingAvailability && (
                <div className="mt-3 flex items-center gap-2 text-blue-600">
                  <i className="fas fa-spinner fa-spin" />
                  <span className="text-sm">Checking room availability...</span>
                </div>
              )}
            </div>

            {/* Guest Information */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-700">
                <i className="fas fa-users mr-2 text-blue-500" />
                Guest Information <span className="text-xs font-normal text-gray-500">(can be modified)</span>
              </h4>
              
              {isExclusive ? (
                // ENTIRE RESORT — single Adults/Kids only, tent count is read-only (no +/- buttons)
                <div className="rounded-xl border border-gray-200 p-4 bg-gradient-to-r from-blue-50/30 to-white">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-blue-800">Entire Resort Package</p>
                    <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mt-1">
                      Can entertain up to {exclusiveMaxPax} pax
                    </p>
                  </div>

                  {/* Tents section — read-only display, no editing controls */}
                  <div className="mt-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Tents</p>
                      </div>
                      <div className="font-bold text-amber-800 text-base">
                        {exclusiveTentCount}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50/80 rounded-xl p-3 mt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                        <input
                          type="number"
                          min={1}
                          value={exclusiveAdults}
                          onChange={(e) => handleExclusiveGuestChange('adults', e.target.value)}
                          className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-2 shadow-sm focus:outline-none focus:ring-2 ${exclusiveGuestError ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                        <input
                          type="number"
                          min={0}
                          value={exclusiveKids}
                          onChange={(e) => handleExclusiveGuestChange('kids', e.target.value)}
                          className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-2 shadow-sm focus:outline-none focus:ring-2 ${exclusiveGuestError ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] font-semibold text-gray-500 mt-2">Total Pax: {exclusiveTotalPax} / {exclusiveMaxPax}</p>
                  </div>

                  {exclusiveGuestError && (
                    <div className="bg-red-50/80 border-t border-red-100 p-2 text-[10px] text-red-600 font-semibold tracking-tight leading-tight flex items-start gap-1 w-full rounded-b-xl mt-3">
                      <i className="fas fa-exclamation-circle mt-[0.1rem]"></i>
                      <span>{exclusiveGuestError}</span>
                    </div>
                  )}
                </div>
              ) : isMultiRoom ? (
                <div className="space-y-4">
                  {booking.children.map((child, index) => {
                    const guest = guestCounts[index] || { adults: 1, kids: 0, roomType: child.roomType };
                    const maxCapacity = roomCapacitiesMap[child.roomType]?.max || 10;
                    const minCapacity = roomCapacitiesMap[child.roomType]?.min || 1;
                    
                    return (
                      <div key={index} className={`rounded-xl border p-4 transition-all ${guestErrors[index] ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="mb-3 flex justify-between items-center">
                          <p className="text-sm font-semibold text-gray-700">
                            {child.roomType || `Room ${index + 1}`}
                          </p>
                          <p className="text-xs text-blue-600">
                            Max {maxCapacity} guests • Min {minCapacity}
                          </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Adults</label>
                            <input
                              type="number"
                              min="1"
                              max={maxCapacity}
                              value={guest.adults || 1}
                              onChange={(e) => updateGuestCount(index, 'adults', e.target.value)}
                              className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                                guestErrors[index] 
                                  ? 'border-red-300 bg-white focus:border-red-400 focus:ring-red-100' 
                                  : 'border-gray-200 bg-white focus:border-blue-400 focus:ring-blue-100'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Kids</label>
                            <input
                              type="number"
                              min="0"
                              max={Math.max(0, maxCapacity - (guest.adults || 1))}
                              value={guest.kids || 0}
                              onChange={(e) => updateGuestCount(index, 'kids', e.target.value)}
                              className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                                guestErrors[index] 
                                  ? 'border-red-300 bg-white focus:border-red-400 focus:ring-red-100' 
                                  : 'border-gray-200 bg-white focus:border-blue-400 focus:ring-blue-100'
                              }`}
                            />
                          </div>
                        </div>
                        {guestErrors[index] && (
                          <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                            <i className="fas fa-exclamation-circle text-[10px]"></i>
                            {guestErrors[index]}
                          </p>
                        )}
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500">
                            Total: {(guest.adults || 0) + (guest.kids || 0)} guest(s) (Min {minCapacity})
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Single room type bookings - unchanged
                <div className="space-y-3">
                  <div className="rounded-xl bg-blue-50 p-3 mb-3">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold text-blue-800">
                        {booking.roomType}
                      </p>
                      <p className="text-xs text-blue-600">
                        {numberOfUnits} unit{numberOfUnits !== 1 ? 's' : ''} • Max {roomMaxCapacity || 10} guests/unit
                      </p>
                    </div>
                  </div>
                  
                  {Object.entries(guestCounts).map(([index, guest]) => (
                    <div key={index} className={`rounded-xl border p-4 transition-all ${guestErrors[index] ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-gray-50'}`}>
                      <p className="mb-2 text-sm font-semibold text-gray-700">
                        Unit {parseInt(index) + 1}
                        {roomMinCapacity && roomMaxCapacity && (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            (Min {roomMinCapacity} - Max {roomMaxCapacity} guests)
                          </span>
                        )}
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Adults</label>
                          <input
                            type="number"
                            min="1"
                            max={roomMaxCapacity || 10}
                            value={guest.adults || 1}
                            onChange={(e) => updateGuestCount(index, 'adults', e.target.value)}
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                              guestErrors[index] 
                                ? 'border-red-300 bg-white focus:border-red-400 focus:ring-red-100' 
                                : 'border-gray-200 bg-white focus:border-blue-400 focus:ring-blue-100'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Kids</label>
                          <input
                            type="number"
                            min="0"
                            max={(roomMaxCapacity || 10) - (guest.adults || 1)}
                            value={guest.kids || 0}
                            onChange={(e) => updateGuestCount(index, 'kids', e.target.value)}
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                              guestErrors[index] 
                                ? 'border-red-300 bg-white focus:border-red-400 focus:ring-red-100' 
                                : 'border-gray-200 bg-white focus:border-blue-400 focus:ring-blue-100'
                            }`}
                          />
                        </div>
                      </div>
                      {guestErrors[index] && (
                        <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                          <i className="fas fa-exclamation-circle text-[10px]"></i>
                          {guestErrors[index]}
                        </p>
                      )}
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500">
                          Total: {(guest.adults || 0) + (guest.kids || 0)} guest(s)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Price Notice */}
            <div className="mt-4 rounded-xl bg-blue-50 p-3">
              <p className="text-xs text-blue-800 flex items-start gap-2">
                <i className="fas fa-calculator mt-0.5" />
                <span>Your total price will remain based on the original nightly rate (₱{(booking.totalPrice / originalNights).toLocaleString()} per night).</span>
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-red-50 p-3">
                <p className="text-xs text-red-700 flex items-center gap-2">
                  <i className="fas fa-exclamation-circle" />
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isLoading || isCheckingAvailability || !checkIn || (isExclusive ? exclusiveGuestError : Object.keys(guestErrors).length > 0)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin text-xs" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <i className="fas fa-calendar-check text-xs" />
                  Confirm Reschedule
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            <div className="border-b border-blue-100 bg-blue-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <i className="fas fa-question-circle text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-blue-900">Confirm Reschedule</h3>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-700">
                Are you sure you want to reschedule this reservation to:
              </p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p><span className="font-semibold">Check-in:</span> {formatDisplayDate(checkIn)}</p>
                <p><span className="font-semibold">Check-out:</span> {formatDisplayDate(checkOut)}</p>
              </div>
              <p className="text-sm text-gray-700">With the following guest counts:</p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm max-h-40 overflow-y-auto">
                {isExclusive ? (
                  <>
                    <p>Adults: {exclusiveAdults}</p>
                    <p>Kids: {exclusiveKids}</p>
                    <p>Tents: {exclusiveTentCount}</p>
                    <p>Total Pax: {exclusiveTotalPax} / {exclusiveMaxPax}</p>
                  </>
                ) : isMultiRoom ? (
                  Object.entries(guestCounts).map(([idx, g]) => (
                    <p key={idx}>{g.roomType}: {g.adults} adults, {g.kids} kids</p>
                  ))
                ) : (
                  Object.entries(guestCounts).map(([idx, g]) => (
                    <p key={idx}>Unit {parseInt(idx) + 1}: {g.adults} adults, {g.kids} kids</p>
                  ))
                )}
              </div>
              <p className="text-xs text-amber-600">
                <i className="fas fa-info-circle mr-1" />
                This action will update the reservation immediately.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReschedule}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Yes, Reschedule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}