// app/rooms/select-room-types/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function SelectRoomTypesPage() {
  const router = useRouter();
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [totalGuestsPerType, setTotalGuestsPerType] = useState({});
  const [guestInputErrors, setGuestInputErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [checkInDate, setCheckInDate] = useState(null);
  const [checkOutDate, setCheckOutDate] = useState(null);
  const [numberOfNights, setNumberOfNights] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [roomDetailsMap, setRoomDetailsMap] = useState({});
  const [specialRequest, setSpecialRequest] = useState('');
  const [dateSelectionError, setDateSelectionError] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState({});
  const [roomAvailability, setRoomAvailability] = useState({});
  const [unitLevelAvailability, setUnitLevelAvailability] = useState({});

  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const BOOKING_DURATION_HOURS = 22;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // Fetch available room types from Firebase
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true), where('availability', '==', 'available'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const types = [];
      const roomDetails = {};
      
      querySnapshot.forEach((doc) => {
        const roomData = doc.data();
        const roomType = roomData.type;
        
        // Check if this room type is already added
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
      
      // Initialize selectedRooms with default quantities
      const initialSelected = {};
      const initialTotalGuests = {};
      types.forEach(type => {
        initialSelected[type.type] = 0;
        initialTotalGuests[type.type] = 1;
      });
      setSelectedRooms(initialSelected);
      setTotalGuestsPerType(initialTotalGuests);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching rooms:', error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch booking data for all room types with hour-level granularity.
  // Note: Firestore `in` supports max 10 values, so we chunk listeners.
  useEffect(() => {
    if (availableRoomTypes.length === 0) return;
    
    const allRoomIds = availableRoomTypes.flatMap(type => type.roomIds);
    if (allRoomIds.length === 0) return;
    
    const bookingsRef = collection(db, 'bookings');
    const roomIdChunks = chunk(allRoomIds, 10);
    const unsubscribes = [];
    const snapshotsByChunk = {};

    const buildBookedIndex = () => {
      // booked[YYYY-MM-DD][roomId][hour] = bookedUnits
      const booked = {};
      Object.values(snapshotsByChunk).forEach((querySnapshot) => {
        querySnapshot.forEach((docSnap) => {
          const booking = docSnap.data();
          const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          const roomId = booking.roomId;
          const numberOfRooms = booking.numberOfRooms || 1;

          if (!checkIn || !checkOut || checkOut <= checkIn) return;

          // Walk hour-by-hour through the booking window and attribute usage to each local date hour slot
          const current = new Date(checkIn);
          while (current < checkOut) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            const hour = current.getHours();

            if (!booked[dateStr]) booked[dateStr] = {};
            if (!booked[dateStr][roomId]) booked[dateStr][roomId] = {};
            booked[dateStr][roomId][hour] = (booked[dateStr][roomId][hour] || 0) + numberOfRooms;

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

    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [availableRoomTypes]);

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
          
          if (!blocks[dateKey]) {
            blocks[dateKey] = {};
          }
          if (!blocks[dateKey][data.roomId]) {
            blocks[dateKey][data.roomId] = {};
          }
          for (let hour = startHour; hour < endHour; hour++) {
            blocks[dateKey][data.roomId][hour] = (blocks[dateKey][data.roomId][hour] || 0) + unitsBlocked;
          }
        }
      });
      
      setBlockedSlots(blocks);
    });
    
    return () => unsubscribe();
  }, [availableRoomTypes]);

  // Update check-out date when check-in date or number of nights changes
  useEffect(() => {
    if (checkInDate && numberOfNights) {
      const newCheckOutDate = new Date(checkInDate);
      newCheckOutDate.setDate(checkInDate.getDate() + numberOfNights);
      newCheckOutDate.setHours(FIXED_CHECK_OUT_HOUR, 0, 0, 0);
      setCheckOutDate(newCheckOutDate);
    }
  }, [checkInDate, numberOfNights]);

  // Calculate unit-level availability for each room type on a given date
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

        // For date availability display, we only consider check-in window (2:00 PM – 12:00 AM).
        for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
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

  // Update unit-level availability when date changes
  useEffect(() => {
    if (checkInDate) {
      const availability = calculateUnitAvailabilityForDate(checkInDate);
      setUnitLevelAvailability(availability);
    } else {
      setUnitLevelAvailability({});
    }
  }, [checkInDate, availableRoomTypes, bookedDates, blockedSlots]);

  // Calculate available units per room type for the selected date range
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
        
        // Check each day of the stay, focusing on check-in hours (2:00 PM onwards)
        for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
          const currentDate = new Date(checkInDate);
          currentDate.setDate(checkInDate.getDate() + dayOffset);
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          
          // Check hours from 2:00 PM to midnight for each day
          for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
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
  }, [checkInDate, numberOfNights, availableRoomTypes, bookedDates, blockedSlots, roomDetailsMap]);

  // Check availability for selected rooms and dates
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
      
      let availableCount = 0;
      let totalAvailable = 0;
      
      for (const roomId of roomType.roomIds) {
        const roomDetail = roomDetailsMap[roomType.type]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        let availableForStay = maxRooms;
        if (maxRooms <= 0) continue;
        
        // Check each day of the stay, focusing on check-in hours (2:00 PM onwards)
        for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
          const currentDate = new Date(checkInDate);
          currentDate.setDate(checkInDate.getDate() + dayOffset);
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          
          for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
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
      
      availableCount = totalAvailable;
      status[roomType.type] = {
        available: availableCount,
        sufficient: availableCount >= quantity,
        quantity: quantity
      };
      
      if (availableCount < quantity) {
        allAvailable = false;
      }
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
  }, [checkInDate, checkOutDate, numberOfNights, selectedRooms, availableRoomTypes, bookedDates, blockedSlots, roomDetailsMap]);

  const handleQuantityChange = (roomType, increment) => {
    const typeData = availableRoomTypes.find(t => t.type === roomType);
    // Use unit-level availability for max available
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
    
    setSelectedRooms(prev => ({
      ...prev,
      [roomType]: newQuantity
    }));
    
    // Clear error for this room type when quantity changes
    setGuestInputErrors(prev => ({ ...prev, [roomType]: '' }));
    
    // Reset total guests to min if quantity becomes 0
    if (newQuantity === 0) {
      setTotalGuestsPerType(prev => ({ ...prev, [roomType]: 1 }));
    } else {
      // Ensure total guests is within max capacity (units × capacity per unit)
      const currentTotalGuests = totalGuestsPerType[roomType] || 1;
      const maxTotalGuests = newQuantity * (typeData?.capacityMax || 10);
      const minTotalGuests = newQuantity * (typeData?.capacityMin || 1);
      if (currentTotalGuests > maxTotalGuests) {
        setTotalGuestsPerType(prev => ({ ...prev, [roomType]: maxTotalGuests }));
      }
      if (currentTotalGuests < minTotalGuests) {
        setTotalGuestsPerType(prev => ({ ...prev, [roomType]: minTotalGuests }));
      }
    }
  };

const handleTotalGuestsChange = (roomType, value) => {
  const quantity = selectedRooms[roomType] || 0;
  if (quantity === 0) return;
  
  const typeData = availableRoomTypes.find(t => t.type === roomType);
  const maxTotalGuests = quantity * (typeData?.capacityMax || 10);
  const minTotalGuests = quantity * (typeData?.capacityMin || 1);
  
  let newTotalGuests = parseInt(value, 10);
  
  // Check for invalid / negative
  if (isNaN(newTotalGuests) || newTotalGuests < 0) {
    setGuestInputErrors(prev => ({ 
      ...prev, 
      [roomType]: 'Please enter a valid number (0 or positive)' 
    }));
    
    // still allow input (important!)
    setTotalGuestsPerType(prev => ({
      ...prev,
      [roomType]: value
    }));
    return;
  }
  
  // Validate only (NO overriding)
  if (newTotalGuests > maxTotalGuests) {
    setGuestInputErrors(prev => ({ 
      ...prev, 
      [roomType]: `Maximum ${maxTotalGuests} guests allowed for ${quantity} unit${quantity !== 1 ? 's' : ''}` 
    }));
  } else if (newTotalGuests < minTotalGuests) {
    setGuestInputErrors(prev => ({ 
      ...prev, 
      [roomType]: `Minimum ${minTotalGuests} guests required for ${quantity} unit${quantity !== 1 ? 's' : ''}` 
    }));
  } else {
    setGuestInputErrors(prev => ({ ...prev, [roomType]: '' }));
  }
  
  // ✅ ALWAYS set what user typed
  setTotalGuestsPerType(prev => ({
    ...prev,
    [roomType]: newTotalGuests
  }));
};

  const handleDateSelect = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBookableDate = new Date();
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    minBookableDate.setHours(0, 0, 0, 0);
    
    if (date < today) return;
    if (date < minBookableDate) return;
    
    setCheckInDate(date);
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

  const getSelectedRoomsSummary = () => {
    const selected = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selected.length === 0) return 'No rooms selected';
    return selected.map(([type, qty]) => {
      const totalGuests = totalGuestsPerType[type] || 1;
      return `${qty} × ${type} (${totalGuests} total guest${totalGuests !== 1 ? 's' : ''})`;
    }).join(', ');
  };

  const getTotalGuests = () => {
    let total = 0;
    for (const [roomType, quantity] of Object.entries(selectedRooms)) {
      if (quantity > 0) {
        const totalGuestsForType = totalGuestsPerType[roomType] || 1;
        total += totalGuestsForType;
      }
    }
    return total;
  };

  const getTotalPrice = () => {
    let total = 0;
    for (const [roomType, quantity] of Object.entries(selectedRooms)) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (typeData && quantity > 0) {
        total += typeData.price * quantity * numberOfNights;
      }
    }
    return total;
  };

  const handleProceed = () => {
    if (!checkInDate) {
      setDateSelectionError('Please select check-in and check-out dates');
      return;
    }
    
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selectedTypes.length === 0) {
      setDateSelectionError('Please select at least one room type');
      return;
    }
    
    // Check if there are any guest input errors
    const hasErrors = Object.values(guestInputErrors).some(error => error !== '');
    if (hasErrors) {
      setDateSelectionError('Please fix the guest count errors before proceeding');
      return;
    }
    
    // Check if all selected room types have sufficient availability
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

    // Time-rule validation (separate from room availability):
    // - Check-in date requires PM (2:00 PM – 12:00 AM) to be available
    // - Check-out date requires AM (12:00 AM – 12:00 PM) to be available
    const checkInBlocks = getAdminPartialBlockInfo(checkInDate);
    const checkOutBlocks = checkOutDate ? getAdminPartialBlockInfo(checkOutDate) : { morningClosed: false, afternoonClosed: false };
    if (checkInBlocks.afternoonClosed || checkOutBlocks.morningClosed) {
      setDateSelectionError('Selected dates are not available due to time restrictions.');
      return;
    }
    
    // Store selected rooms and dates in session storage for the booking page
    const bookingData = {
      selectedRooms,
      totalGuestsPerType,
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      numberOfNights,
      specialRequest,
      totalPrice: getTotalPrice(),
      totalGuests: getTotalGuests(),
      roomTypes: availableRoomTypes.filter(t => selectedRooms[t.type] > 0).map(t => ({
        type: t.type,
        quantity: selectedRooms[t.type],
        totalGuests: totalGuestsPerType[t.type] || 1,
        price: t.price,
        roomIds: t.roomIds,
        capacityMin: t.capacityMin,
        capacityMax: t.capacityMax
      }))
    };
    
    sessionStorage.setItem('multiRoomBooking', JSON.stringify(bookingData));
    router.push('/rooms/multi-room-booking');
  };

  const goBack = () => {
    router.push('/rooms');
  };

  // Calendar functions (replicated from app/rooms/calendar)
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

  const toLocalDateKey = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  // Updated availability check function based on check-in period (2:00 PM onwards)
  // This function checks if a date is fully booked for ALL selected room types
  const isDateFullyBooked = (date) => {
    if (!date) return false;
    
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    // If no room types are selected, any date is technically selectable
    if (selectedTypes.length === 0) return false;
    
    // For multi-room booking logic: A date is considered FULLY BOOKED if ANY of the selected room types
    // does not have enough available units for the requested quantity on that date.
    // This ensures guests cannot select a date where any of their selected room types is fully booked.
    for (const [roomType, quantity] of selectedTypes) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (!typeData) continue;
      
      let totalAvailableUnits = 0;
      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        let minAvailable = maxRooms;
        
        // Check hours from 2:00 PM to midnight (14:00 to 23:59)
        // This is the check-in window that determines availability
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
          
          const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
          minAvailable = Math.min(minAvailable, availableNow);
          if (minAvailable <= 0) break;
        }
        
        totalAvailableUnits += minAvailable;
      }
      
      // If this room type doesn't have enough available units for the requested quantity,
      // the date is NOT selectable
      if (totalAvailableUnits < quantity) {
        return true;
      }
    }
    
    // All selected room types have enough available units
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
        const blockedUnits = blockedSlots[dateKey]?.[roomId]?.[FIXED_CHECK_IN_HOUR] || 0;
        blockedAtCheckIn += Math.min(maxRooms, blockedUnits);
      }

      const morningClosed = totalUnits > 0 && blockedAtMorning >= totalUnits;
      const afternoonClosed = totalUnits > 0 && blockedAtCheckIn >= totalUnits;
      if (morningClosed && afternoonClosed) return true;
    }
    
    return false;
  };

  const getAdminPartialBlockInfo = (date) => {
    if (!date) return { morningClosed: false, afternoonClosed: false };
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selectedTypes.length === 0) return { morningClosed: false, afternoonClosed: false };

    const dateKey = toLocalDateKey(date);
    let anyMorningClosed = false;
    let anyAfternoonClosed = false;

    for (const [roomType] of selectedTypes) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (!typeData) continue;

      let totalUnits = 0;
      let blockedAtMorning = 0;
      let blockedAtCheckIn = 0;

      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        totalUnits += maxRooms;
        blockedAtMorning += Math.min(maxRooms, blockedSlots[dateKey]?.[roomId]?.[0] || 0);
        blockedAtCheckIn += Math.min(maxRooms, blockedSlots[dateKey]?.[roomId]?.[FIXED_CHECK_IN_HOUR] || 0);
      }

      if (totalUnits > 0 && blockedAtMorning >= totalUnits) anyMorningClosed = true;
      if (totalUnits > 0 && blockedAtCheckIn >= totalUnits) anyAfternoonClosed = true;
    }

    return { morningClosed: anyMorningClosed, afternoonClosed: anyAfternoonClosed };
  };

  const hasAnyHourFullyAdminUnavailable = (date) => {
    if (!date) return false;
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selectedTypes.length === 0) return false;
    
    const dateKey = toLocalDateKey(date);
    
    for (const [roomType, quantity] of selectedTypes) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (!typeData) continue;

      let totalUnits = 0;
      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        if (maxRooms <= 0) continue;
        totalUnits += maxRooms;
      }
      if (totalUnits <= 0) continue;

      for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
        let blockedAtHour = 0;
        for (const roomId of typeData.roomIds) {
          const roomDetail = roomDetailsMap[roomType]?.[roomId];
          const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
          if (maxRooms <= 0) continue;
          const blockedUnits = blockedSlots[dateKey]?.[roomId]?.[hour] || 0;
          blockedAtHour += Math.min(maxRooms, blockedUnits);
        }
        if (blockedAtHour >= totalUnits) return true;
      }
    }
    
    return false;
  };

  const isDateSelectable = (date) => {
    if (isDatePast(date)) return false;
    if (isDateTooSoon(date)) return false;
    if (isDateFullyBooked(date)) return false;
    if (isDateFullyBlockedByAdmin(date)) return false;

    // If 2:00 PM – 12:00 AM is fully blocked, the date must be non-clickable.
    const { morningClosed, afternoonClosed } = getAdminPartialBlockInfo(date);
    if (afternoonClosed && !morningClosed) return false;
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
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white py-8">
        <div className="max-w-7xl w-full mx-auto px-4">
          {/* Page Title */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-textPrimary font-playfair">
              Select Room Types
            </h1>
            <p className="text-textSecondary mt-1">
              Choose multiple room types and quantities for your stay
            </p>
          </div>

          {/* Main layout: left column (40%) + right block (60%) */}
          <div className="flex flex-col lg:flex-row gap-6 items-stretch">
            {/* LEFT COLUMN (40%) - Select Your Stay Dates */}
            <div className="lg:w-[40%]">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden h-full">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">Select Your Stay Dates</h2>
                    <p className="text-white/80 text-sm mt-1">
                      Check-in: {FIXED_CHECK_IN_DISPLAY} | Check-out: {FIXED_CHECK_OUT_DISPLAY} (next day)
                    </p>
                  </div>
                </div>

                <div className="p-5">
                  {/* Month Navigation - Back button on left, navigation on right */}
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={goBack}
                      className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200 flex items-center gap-2 text-sm"
                    >
                      <i className="fas fa-arrow-left"></i>
                      Back to Rooms
                    </button>
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={goToPreviousMonth}
                        className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200 text-sm"
                      >
                        <i className="fas fa-chevron-left mr-1"></i>
                        Prev
                      </button>
                      <h2 className="text-lg font-semibold text-textPrimary">
                        {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                      </h2>
                      <button
                        onClick={goToNextMonth}
                        className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200 text-sm"
                      >
                        Next
                        <i className="fas fa-chevron-right ml-1"></i>
                      </button>
                    </div>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1.5 mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="text-center font-semibold text-textSecondary text-xs py-1.5">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {days.map((day, index) => {
                      if (!day) return <div key={index} className="aspect-square"></div>;
                      
                      const isPast = isDatePast(day);
                      const isTooSoon = isDateTooSoon(day);
                      const isFullyBooked = isDateFullyBooked(day);
                      const isSelected = checkInDate && checkInDate.toDateString() === day.toDateString();
                      const isFullyBlockedByAdmin = isDateFullyBlockedByAdmin(day);
                      const { morningClosed, afternoonClosed } = getAdminPartialBlockInfo(day);
                      const isPartiallyBlockedAfternoon = afternoonClosed && !morningClosed;
                      const isPartiallyBlockedMorningOnly = morningClosed && !afternoonClosed;
                      const isCheckoutRestrictedAndFullyBooked =
                        isPartiallyBlockedMorningOnly && isFullyBooked;
                      const showHasUnavailableSlotsDot =
                        !isPast &&
                        !isTooSoon &&
                        !isFullyBooked &&
                        !isFullyBlockedByAdmin &&
                        !isCheckoutRestrictedAndFullyBooked &&
                        hasAnyHourFullyAdminUnavailable(day);
                      
                      let bgColor = 'bg-white';
                      let textColor = 'text-textPrimary';
                      let borderClass = 'border border-gray-200';
                      let hoverClass = '';
                      let cursorClass = 'cursor-pointer';
                      let titleText = '';

                      if (isPast) {
                        bgColor = 'bg-gray-100';
                        textColor = 'text-gray-400';
                        borderClass = 'border border-gray-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText = 'Past date';
                      } else if (isTooSoon) {
                        bgColor = 'bg-gray-100';
                        textColor = 'text-gray-400';
                        borderClass = 'border border-gray-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText = 'Must book at least 1 day in advance';
                      } else if (isFullyBlockedByAdmin) {
                        bgColor = 'bg-orange-100';
                        textColor = 'text-orange-700';
                        borderClass = 'border border-orange-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText = 'Fully Blocked by Admin';
                      } else if (isPartiallyBlockedAfternoon) {
                        // Check-in Blocked -> Light Yellow
                        bgColor = 'bg-yellow-100';
                        textColor = 'text-yellow-800';
                        borderClass = 'border border-yellow-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText = 'Check-in is not available on this date';
                      } else if (isCheckoutRestrictedAndFullyBooked) {
                        bgColor = 'bg-white';
                        textColor = 'text-green-800';
                        borderClass = 'border border-gray-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText =
                          'Fully booked and check-out restricted: green dot = check-out restricted, red dot = fully booked';
                      } else if (isFullyBooked) {
                        bgColor = 'bg-red-100';
                        textColor = 'text-red-600';
                        borderClass = 'border border-red-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText = 'Fully Booked';
                      } else if (isPartiallyBlockedMorningOnly) {
                        bgColor = 'bg-green-100';
                        textColor = 'text-green-800';
                        borderClass = 'border border-green-200';
                        cursorClass = 'cursor-pointer';
                        titleText = 'Check-out restricted on this date';
                      } else if (isSelected) {
                        bgColor = 'bg-ocean-mid';
                        textColor = 'text-white';
                        borderClass = 'border border-ocean-mid';
                        hoverClass = 'hover:bg-ocean-mid';
                        titleText = 'Selected';
                      } else {
                        hoverClass = 'hover:bg-ocean-ice';
                        titleText = 'Available';
                      }

                      return (
                        <button
                          key={index}
                          onClick={() => handleDateSelect(day)}
                          disabled={isPast || isTooSoon || isFullyBooked || isFullyBlockedByAdmin || isPartiallyBlockedAfternoon}
                          title={titleText}
                          className={`w-full pt-[100%] relative rounded-lg transition-all duration-200 ${bgColor} ${borderClass} ${hoverClass} ${cursorClass}`}
                        >
                          <span
                            className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${textColor} ${
                              isCheckoutRestrictedAndFullyBooked ? 'pb-2.5' : ''
                            }`}
                          >
                            {day.getDate()}
                          </span>
                          {isCheckoutRestrictedAndFullyBooked && (
                            <span
                              className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1"
                              aria-hidden
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            </span>
                          )}
                          {showHasUnavailableSlotsDot && (
                            <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-5 pt-3 border-t border-ocean-light/10 flex justify-center gap-4 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-white border border-gray-300 rounded"></div>
                      <span className="text-textSecondary">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                      <span className="text-textSecondary">Fully booked (no check-out restriction)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
                      <span className="text-textSecondary">Check-in restricted</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                      <span className="text-textSecondary">Check-out restricted </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
                      <span className="text-textSecondary">Not Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div>
                      <span className="text-textSecondary">Past Dates</span>
                    </div>
                    <div className="bg-white rounded flex items-center gap-1 px-1 py-0.5">
  <div className="flex items-center gap-1">
    <span className="w-2.5 h-2 rounded-full bg-green-400" />
    <span className="w-2.5 h-2 rounded-full bg-red-500" />
  </div>

  <span className="text-textSecondary">
    Fully Booked & Check-out Restricted 
  </span>
</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-ocean-mid rounded"></div>
                      <span className="text-textSecondary">Selected</span>
                    </div>
                  </div>             
                </div>
              </div>
            </div>

            {/* RIGHT BLOCK (60%) - contains Select Rooms, Stay Details, and Selected Information */}
            <div className="lg:w-[60%] flex flex-col gap-5">
              {/* Top row: Select Rooms (66.66% of 60% = 40% overall) and Stay Details (33.33% of 60% = 20% overall) */}
              <div className="flex flex-row gap-5 items-stretch">
                {/* Select Rooms (40% overall) */}
                <div className="w-[66.666%]">
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full">
                    <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-2">
                      <h2 className="text-lg font-bold text-white">Select Rooms</h2>
                      <p className="text-white/80 text-xs mt-0.5">Choose room types and quantities</p>
                    </div>

                    <div className="p-4">
                      {/* Room Types List - 2 Column Grid with reduced gap */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {availableRoomTypes.map((room) => {
                          const quantity = selectedRooms[room.type] || 0;
                          const totalGuests = totalGuestsPerType[room.type] || 1;
                          const availability = availabilityStatus[room.type];
                          const isSelected = quantity > 0;
                          const maxTotalGuests = quantity * room.capacityMax;
                          const minTotalGuests = quantity * room.capacityMin;
                          const guestError = guestInputErrors[room.type] || '';
                          // Get unit-level available units based on selected date
                          const realTimeAvailable = checkInDate 
                            ? (unitLevelAvailability[room.type] || 0)
                            : room.availableRooms;
                          
                          return (
                            <div key={room.type} className="border border-ocean-light/20 rounded-lg p-3 hover:shadow-md transition-all duration-200 bg-white flex flex-col h-full">
                              {/* Room header */}
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h3 className="font-bold text-textPrimary text-sm">{room.type}</h3>
                                  <p className="text-xs text-textSecondary mt-0.5">
                                    <i className="fas fa-users mr-1"></i>
                                    {room.capacityMin}–{room.capacityMax} guests per unit
                                  </p>
                                </div>
                                <p className="text-base font-bold text-ocean-mid">
                                  ₱{room.price.toLocaleString()}
                                  <span className="text-xs font-normal text-textSecondary">/night</span>
                                </p>
                              </div>
                              
                              {/* Quantity controls */}
                              <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleQuantityChange(room.type, false)}
                                    disabled={quantity === 0}
                                    className="w-7 h-7 rounded-md border border-ocean-light/20 text-ocean-mid font-bold text-base hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                                  >
                                    -
                                  </button>
                                  <span className="text-base font-bold text-textPrimary min-w-[28px] text-center">
                                    {quantity}
                                  </span>
                                  <button
                                    onClick={() => handleQuantityChange(room.type, true)}
                                    disabled={quantity >= realTimeAvailable}
                                    className="w-7 h-7 rounded-md border border-ocean-light/20 text-ocean-mid font-bold text-base hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                                  >
                                    +
                                  </button>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-medium text-ocean-mid">
                                    {realTimeAvailable} available
                                  </p>
                                </div>
                              </div>
                              
                              {/* Total guests input field */}
                              <div className="mt-3 pt-2 border-t border-ocean-light/20">
                                <label className="block text-xs font-medium text-textPrimary mb-1">
                                  Total Guests ({quantity} unit{quantity !== 1 ? 's' : ''})
                                </label>
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={totalGuestsPerType[room.type] ?? ''}
                                      onChange={(e) => handleTotalGuestsChange(room.type, e.target.value)}
                                      disabled={!isSelected}
                                      min={0}
                                      step="1"
                                      className={`w-28 px-2 py-1.5 text-base font-bold text-center border rounded-md focus:outline-none focus:border-ocean-light ${
                                        !isSelected 
                                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                                          : guestError
                                            ? 'bg-white text-textPrimary border-red-500 focus:border-red-500'
                                            : 'bg-white text-textPrimary border-ocean-light/30'
                                      }`}
                                    />
                                    <span className="text-xs text-textSecondary">
                                      (min {minTotalGuests}, max {maxTotalGuests})
                                    </span>
                                  </div>
                                  {guestError && (
                                    <p className="text-xs text-red-600 mt-1">
                                      <i className="fas fa-exclamation-triangle mr-1"></i>
                                      {guestError}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              {/* Availability warning */}
                              {checkInDate && quantity > 0 && availability && !availability.sufficient && (
                                <p className="text-xs text-red-600 mt-2">
                                  <i className="fas fa-exclamation-triangle mr-1"></i>
                                  Only {availability.available} available
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stay Details (20% overall) */}
                <div className="w-[33.333%]">
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full">
                    <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-2">
                      <h2 className="text-lg font-bold text-white">Stay Details</h2>
                      <p className="text-white/80 text-xs mt-0.5">Customize your stay</p>
                    </div>

                    <div className="p-4">
                      {/* Number of Nights Input */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-textPrimary mb-1">
                          Number of Nights
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleNightsChange(false)}
                            disabled={numberOfNights <= 1}
                            className="w-8 h-8 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="text-xl font-bold text-textPrimary min-w-[45px] text-center">
                            {numberOfNights}
                          </span>
                          <button
                            onClick={() => handleNightsChange(true)}
                            disabled={numberOfNights >= 30}
                            className="w-8 h-8 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <p className="text-xs text-textSecondary mt-1">
                          {numberOfNights === 1 ? '1 night stay' : `${numberOfNights} nights stay`} (22h/night)
                        </p>
                      </div>

                      {/* Special Request Input */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-textPrimary mb-1">
                          Special Request
                        </label>
<textarea
  value={specialRequest}
  onChange={(e) => setSpecialRequest(e.target.value)}
  placeholder="e.g., early check-in, preferences..."
  rows="2"
  className="w-full px-2 pt-2 pb-20 border border-ocean-light/20 rounded-lg text-sm focus:outline-none focus:border-ocean-light resize-none"
/>
                        <p className="text-xs text-textSecondary mt-1">
                          <i className="fas fa-clock mr-1"></i>
                          Check-in fixed at 2:00 PM.
                        </p>
                      </div>

                      {/* Error Message */}
                      {dateSelectionError && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-700">
                            <i className="fas fa-exclamation-triangle mr-1"></i>
                            {dateSelectionError}
                          </p>
                        </div>
                      )}

                      {/* Proceed Button */}
                      <button
                        onClick={handleProceed}
                        disabled={
                          !checkInDate ||
                          Object.values(selectedRooms).every(q => q === 0) ||
                          Object.values(availabilityStatus).some(s => s && !s.sufficient && s.quantity > 0) ||
                          Object.values(guestInputErrors).some(error => error !== '')
                        }
                        className={`w-full py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                          checkInDate && Object.values(selectedRooms).some(q => q > 0) && 
                          !Object.values(availabilityStatus).some(s => s && !s.sufficient && s.quantity > 0) &&
                          !Object.values(guestInputErrors).some(error => error !== '')
                            ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg hover:-translate-y-0.5'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Proceed to Booking
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: Selected Information Container (60% width of parent, i.e. 60% overall) */}
              <div className="w-full">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-2">
                    <h2 className="text-base font-bold text-white">Selected Information</h2>
                    <p className="text-white/80 text-xs mt-0.5">Your stay summary</p>
                  </div>
                  
                  <div className="p-4">
                    {/* Selected Dates */}
                    {checkInDate ? (
                      <div className="mb-3">
                        <h3 className="font-semibold text-textPrimary text-xs mb-1">
                          <i className="fas fa-calendar-alt text-ocean-mid mr-1"></i>
                          Selected Dates
                        </h3>
                        <div className="bg-ocean-ice rounded-lg p-2">
                          <p className="text-sm font-semibold text-textPrimary">
                            {checkInDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          </p>
                          <p className="text-xs text-ocean-mid font-medium mt-0.5">
                            <i className="fas fa-clock mr-1"></i>
                            Check-in: {FIXED_CHECK_IN_DISPLAY}
                          </p>
                          {checkOutDate && (
                            <p className="text-xs text-textSecondary mt-1">
                              Check-out: {checkOutDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {FIXED_CHECK_OUT_DISPLAY}
                            </p>
                          )}
                          <p className="text-xs text-textSecondary mt-1">
                            Duration: {numberOfNights} night(s) | 22h/night
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-textSecondary text-xs">
                            <i className="fas fa-calendar-alt mr-1"></i>
                            No dates selected
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Selected Rooms */}
                    {Object.values(selectedRooms).some(q => q > 0) ? (
                      <div>
                        <h3 className="font-semibold text-textPrimary text-xs mb-1">
                          <i className="fas fa-door-open text-ocean-mid mr-1"></i>
                          Selected Rooms
                        </h3>
                        <div className="bg-ocean-ice rounded-lg p-2">
                          <p className="text-xs text-textSecondary mb-2">
                            {getSelectedRoomsSummary()}
                          </p>
                          <div className="border-t border-ocean-light/20 pt-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-semibold text-textPrimary">Total Guests:</span>
                              <span className="font-bold text-ocean-mid">{getTotalGuests()} guest(s)</span>
                            </div>
                            <div className="flex justify-between items-center mt-1 pt-1 border-t border-ocean-light/20 text-xs">
                              <span className="font-semibold text-textPrimary">Per night:</span>
                              <span className="font-bold text-ocean-mid">₱{(getTotalPrice() / numberOfNights).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center mt-1 pt-1 border-t border-ocean-light/20 text-xs">
                              <span className="font-semibold text-textPrimary">Total ({numberOfNights} night{numberOfNights !== 1 ? 's' : ''}):</span>
                              <span className="font-bold text-ocean-mid">₱{getTotalPrice().toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-textSecondary text-xs">
                            <i className="fas fa-door-open mr-1"></i>
                            No rooms selected
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </GuestLayout>
  );
}