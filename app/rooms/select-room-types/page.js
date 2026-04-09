// app/rooms/select-room-types/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDocs } from 'firebase/firestore';

export default function SelectRoomTypesPage() {
  const router = useRouter();
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [roomGuests, setRoomGuests] = useState({});
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
      const initialGuests = {};
      types.forEach(type => {
        initialSelected[type.type] = 0;
        initialGuests[type.type] = 1;
      });
      setSelectedRooms(initialSelected);
      setRoomGuests(initialGuests);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching rooms:', error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch booking data for all room types with hour-level granularity
  useEffect(() => {
    if (availableRoomTypes.length === 0) return;
    
    const allRoomIds = availableRoomTypes.flatMap(type => type.roomIds);
    if (allRoomIds.length === 0) return;
    
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('roomId', 'in', allRoomIds.slice(0, 10)), // Firestore 'in' limit of 10
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const booked = {};
      
      querySnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
        const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
        const roomId = booking.roomId;
        const numberOfRooms = booking.numberOfRooms || 1;
        
        if (!checkIn || !checkOut || checkOut <= checkIn) return;
        
        // Track bookings by date and hour for precise availability
        let current = new Date(checkIn);
        current.setHours(0, 0, 0, 0);
        const endDate = new Date(checkOut);
        endDate.setHours(0, 0, 0, 0);
        
        while (current < endDate) {
          const dateKey = current.toDateString();
          if (!booked[dateKey]) {
            booked[dateKey] = {};
          }
          if (!booked[dateKey][roomId]) {
            booked[dateKey][roomId] = { count: 0, hours: {} };
          }
          
          // For each hour of the day, track if the room is booked
          for (let hour = 0; hour < 24; hour++) {
            const hourStr = hour.toString();
            if (!booked[dateKey][roomId].hours[hourStr]) {
              booked[dateKey][roomId].hours[hourStr] = 0;
            }
            // If the booking covers this hour, add to count
            const bookingStartHour = (current.toDateString() === checkIn.toDateString()) ? checkIn.getHours() : 0;
            const bookingEndHour = (current.toDateString() === checkOut.toDateString()) ? checkOut.getHours() : 24;
            
            if (hour >= bookingStartHour && hour < bookingEndHour) {
              booked[dateKey][roomId].hours[hourStr] += numberOfRooms;
              booked[dateKey][roomId].count = Math.max(booked[dateKey][roomId].count, booked[dateKey][roomId].hours[hourStr]);
            }
          }
          
          current.setDate(current.getDate() + 1);
        }
      });
      
      setBookedDates(booked);
    });
    
    return () => unsubscribe();
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
        let isUnitAvailable = true;
        
        // Check only the critical hours from 2:00 PM to midnight
        // This is the check-in period that matters for availability
        for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
          const d = new Date(date);
          d.setHours(hour, 0, 0, 0);
          const dateKey = d.toDateString();
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateKey]?.[roomId]?.hours?.[hour.toString()] || 0;
          
          if (bookedCount + blockedUnits >= maxRooms) {
            isUnitAvailable = false;
            break;
          }
        }
        
        if (isUnitAvailable) {
          totalAvailable++;
        }
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
        
        // Check each day of the stay, focusing on check-in hours (2:00 PM onwards)
        for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
          const currentDate = new Date(checkInDate);
          currentDate.setDate(checkInDate.getDate() + dayOffset);
          
          // Check hours from 2:00 PM to midnight for each day
          for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
            const d = new Date(currentDate);
            d.setHours(hour, 0, 0, 0);
            const dateKey = d.toDateString();
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
            const bookedCount = bookedDates[dateKey]?.[roomId]?.hours?.[hour.toString()] || 0;
            
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
        
        // Check each day of the stay, focusing on check-in hours (2:00 PM onwards)
        for (let dayOffset = 0; dayOffset < numberOfNights; dayOffset++) {
          const currentDate = new Date(checkInDate);
          currentDate.setDate(checkInDate.getDate() + dayOffset);
          
          for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
            const d = new Date(currentDate);
            d.setHours(hour, 0, 0, 0);
            const dateKey = d.toDateString();
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
            const bookedCount = bookedDates[dateKey]?.[roomId]?.hours?.[hour.toString()] || 0;
            
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
    
    // Reset guest count to 1 if quantity becomes 0, otherwise ensure guest count is within capacity
    if (newQuantity === 0) {
      setRoomGuests(prev => ({ ...prev, [roomType]: 1 }));
    } else {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      const currentGuests = roomGuests[roomType] || 1;
      const maxCapacity = typeData?.capacityMax || 10;
      if (currentGuests > maxCapacity) {
        setRoomGuests(prev => ({ ...prev, [roomType]: maxCapacity }));
      }
    }
  };

  const handleGuestChange = (roomType, increment) => {
    const quantity = selectedRooms[roomType] || 0;
    if (quantity === 0) return;
    
    const typeData = availableRoomTypes.find(t => t.type === roomType);
    const maxCapacity = typeData?.capacityMax || 10;
    const currentGuests = roomGuests[roomType] || 1;
    let newGuests = currentGuests;
    
    if (increment) {
      newGuests = Math.min(currentGuests + 1, maxCapacity);
    } else {
      newGuests = Math.max(1, currentGuests - 1);
    }
    
    setRoomGuests(prev => ({
      ...prev,
      [roomType]: newGuests
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
      const guests = roomGuests[type] || 1;
      return `${qty} × ${type} (${guests} guest${guests !== 1 ? 's' : ''})`;
    }).join(', ');
  };

  const getTotalGuests = () => {
    let total = 0;
    for (const [roomType, quantity] of Object.entries(selectedRooms)) {
      if (quantity > 0) {
        const guestsPerRoom = roomGuests[roomType] || 1;
        total += quantity * guestsPerRoom;
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
    
    // Store selected rooms and dates in session storage for the booking page
    const bookingData = {
      selectedRooms,
      roomGuests,
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      numberOfNights,
      specialRequest,
      totalPrice: getTotalPrice(),
      totalGuests: getTotalGuests(),
      roomTypes: availableRoomTypes.filter(t => selectedRooms[t.type] > 0).map(t => ({
        type: t.type,
        quantity: selectedRooms[t.type],
        guestsPerRoom: roomGuests[t.type] || 1,
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
        let isUnitAvailable = true;
        
        // Check hours from 2:00 PM to midnight (14:00 to 23:59)
        // This is the check-in window that determines availability
        for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
          const d = new Date(date);
          d.setHours(hour, 0, 0, 0);
          const dateKey = d.toDateString();
          
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
          const bookedCount = bookedDates[dateKey]?.[roomId]?.hours?.[hour.toString()] || 0;
          
          if (bookedCount + blockedUnits >= maxRooms) {
            isUnitAvailable = false;
            break;
          }
        }
        
        if (isUnitAvailable) {
          totalAvailableUnits++;
        }
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
      
      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        
        // Check if the check-in hour is fully blocked
        const blockedUnits = blockedSlots[dateKey]?.[roomId]?.[FIXED_CHECK_IN_HOUR] || 0;
        if (blockedUnits >= maxRooms) {
          return true;
        }
      }
    }
    
    return false;
  };

  const hasAnyHourFullyAdminUnavailable = (date) => {
    if (!date) return false;
    const selectedTypes = Object.entries(selectedRooms).filter(([_, qty]) => qty > 0);
    if (selectedTypes.length === 0) return false;
    
    const dateKey = toLocalDateKey(date);
    
    for (const [roomType, quantity] of selectedTypes) {
      const typeData = availableRoomTypes.find(t => t.type === roomType);
      if (!typeData) continue;
      
      for (const roomId of typeData.roomIds) {
        const roomDetail = roomDetailsMap[roomType]?.[roomId];
        const maxRooms = (roomDetail?.totalRooms || 1) - (roomDetail?.maintenanceRooms || 0);
        
        // Check if any hour from 2:00 PM to midnight is fully blocked
        for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
          const blockedUnits = blockedSlots[dateKey]?.[roomId]?.[hour] || 0;
          if (blockedUnits >= maxRooms) {
            return true;
          }
        }
      }
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

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column - Calendar Panel (60% width) */}
            <div className="lg:w-[60%]">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-6 py-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">Select Your Stay Dates</h2>
                    <p className="text-white/80 text-sm mt-1">
                      Check-in: {FIXED_CHECK_IN_DISPLAY} | Check-out: {FIXED_CHECK_OUT_DISPLAY} (next day)
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  {/* Month Navigation - Back button on left, navigation on right */}
                  <div className="flex justify-between items-center mb-6">
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
                      const showHasUnavailableSlotsDot = !isPast && !isTooSoon && !isFullyBooked && !isFullyBlockedByAdmin && hasAnyHourFullyAdminUnavailable(day);
                      
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
                      } else if (isFullyBooked) {
                        bgColor = 'bg-red-100';
                        textColor = 'text-red-600';
                        borderClass = 'border border-red-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText = 'Fully Booked';
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
                          disabled={isPast || isTooSoon || isFullyBooked || isFullyBlockedByAdmin}
                          title={titleText}
                          className={`w-full pt-[100%] relative rounded-lg transition-all duration-200 ${bgColor} ${borderClass} ${hoverClass} ${cursorClass}`}
                        >
                          <span className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${textColor}`}>
                            {day.getDate()}
                          </span>
                          {showHasUnavailableSlotsDot && (
                            <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-6 pt-4 border-t border-ocean-light/10 flex justify-center gap-6 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-white border border-gray-300 rounded"></div>
                      <span className="text-textSecondary">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                      <span className="text-textSecondary">Fully Booked</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
                      <span className="text-textSecondary">Unavailable Date</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div>
                      <span className="text-textSecondary">Past Dates</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-ocean-mid rounded"></div>
                      <span className="text-textSecondary">Selected</span>
                    </div>
                  </div>             
                </div>
              </div>
            </div>

            {/* Right Column (40% width) */}
            <div className="lg:w-[40%] space-y-5">
              {/* Select Rooms Container - Refined layout with moderate typography */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3">
                  <h2 className="text-lg font-bold text-white">Select Rooms</h2>
                  <p className="text-white/80 text-sm mt-0.5">Choose room types and quantities</p>
                </div>

                <div className="p-5">
                  {/* Room Types List - 2 Column Grid with consistent layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    {availableRoomTypes.map((room) => {
                      const quantity = selectedRooms[room.type] || 0;
                      const guests = roomGuests[room.type] || 1;
                      const availability = availabilityStatus[room.type];
                      const isSelected = quantity > 0;
                      const maxCapacity = room.capacityMax;
                      // Get unit-level available units based on selected date
                      const realTimeAvailable = checkInDate 
                        ? (unitLevelAvailability[room.type] || 0)
                        : room.availableRooms;
                      
                      return (
                        <div key={room.type} className="border border-ocean-light/20 rounded-lg p-3 hover:shadow-md transition-all duration-200 bg-white flex flex-col">
                          {/* Room header - consistent position */}
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-bold text-textPrimary text-sm">{room.type}</h3>
                              <p className="text-xs text-textSecondary mt-0.5">
                                <i className="fas fa-users mr-1"></i>
                                {room.capacityMin}–{room.capacityMax} guests
                              </p>
                            </div>
                            <p className="text-base font-bold text-ocean-mid">
                              ₱{room.price.toLocaleString()}
                              <span className="text-xs font-normal text-textSecondary">/night</span>
                            </p>
                          </div>
                          
                          {/* Quantity controls - consistent position */}
                          <div className="flex items-center justify-between mt-2">
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
                          
                          {/* Guest input field - enabled only when room is selected */}
                          <div className="mt-3 pt-2 border-t border-ocean-light/20">
                            <label className="block text-xs font-medium text-textPrimary mb-1">
                              Guests per room
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleGuestChange(room.type, false)}
                                disabled={!isSelected || guests <= 1}
                                className={`w-7 h-7 rounded-md border border-ocean-light/20 font-bold text-base flex items-center justify-center transition-all duration-200 ${
                                  !isSelected || guests <= 1
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'text-ocean-mid hover:bg-ocean-ice'
                                }`}
                              >
                                -
                              </button>
                              <span className={`text-base font-bold min-w-[28px] text-center ${!isSelected ? 'text-gray-400' : 'text-textPrimary'}`}>
                                {guests}
                              </span>
                              <button
                                onClick={() => handleGuestChange(room.type, true)}
                                disabled={!isSelected || guests >= maxCapacity}
                                className={`w-7 h-7 rounded-md border border-ocean-light/20 font-bold text-base flex items-center justify-center transition-all duration-200 ${
                                  !isSelected || guests >= maxCapacity
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'text-ocean-mid hover:bg-ocean-ice'
                                }`}
                              >
                                +
                              </button>
                              <span className="text-xs text-textSecondary ml-1">
                                (max {maxCapacity})
                              </span>
                            </div>
                          </div>
                          
                          {/* Availability warning - consistent position */}
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

                  {/* Selected Dates Display with Check-in Time */}
                  {checkInDate && (
                    <div className="mt-2 p-4 bg-ocean-ice rounded-xl">
                      <p className="text-sm font-semibold text-textPrimary mb-2">
                        <i className="fas fa-calendar-check text-ocean-mid mr-2"></i>
                        Selected Dates
                      </p>
                      <p className="text-base font-semibold text-textPrimary">
                        {checkInDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                      <p className="text-sm text-ocean-mid font-medium mt-1">
                        <i className="fas fa-clock mr-1"></i>
                        Check-in: {FIXED_CHECK_IN_DISPLAY}
                      </p>
                      {checkOutDate && (
                        <p className="text-sm text-textSecondary mt-2">
                          Check-out: {checkOutDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {FIXED_CHECK_OUT_DISPLAY}
                        </p>
                      )}
                      <p className="text-xs text-textSecondary mt-2">
                        Duration: {numberOfNights} night(s) | Total: 22 hours per night
                      </p>
                    </div>
                  )}
                  
                  {/* Summary Section */}
                  {Object.values(selectedRooms).some(q => q > 0) && (
                    <div className="border-t border-ocean-light/10 pt-4 mt-4">
                      <h3 className="font-semibold text-textPrimary mb-2 text-sm">Selected Rooms</h3>
                      <p className="text-xs text-textSecondary mb-3">
                        {getSelectedRoomsSummary()}
                      </p>
                      <div className="bg-ocean-ice rounded-lg p-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold text-textPrimary">Total Guests:</span>
                          <span className="font-bold text-ocean-mid">{getTotalGuests()} guest(s)</span>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-ocean-light/20 text-sm">
                          <span className="font-semibold text-textPrimary">Per night:</span>
                          <span className="font-bold text-ocean-mid">₱{(getTotalPrice() / numberOfNights).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-ocean-light/20 text-sm">
                          <span className="font-semibold text-textPrimary">Total ({numberOfNights} night{numberOfNights !== 1 ? 's' : ''}):</span>
                          <span className="font-bold text-ocean-mid">₱{getTotalPrice().toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Stay Details Container - With Proceed Button inside */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3">
                  <h2 className="text-lg font-bold text-white">Stay Details</h2>
                  <p className="text-white/80 text-sm mt-0.5">Customize your stay</p>
                </div>

                <div className="p-5">
                  {/* Number of Nights Input */}
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-textPrimary mb-2">
                      Number of Nights
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleNightsChange(false)}
                        disabled={numberOfNights <= 1}
                        className="w-9 h-9 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-xl font-bold text-textPrimary min-w-[55px] text-center">
                        {numberOfNights}
                      </span>
                      <button
                        onClick={() => handleNightsChange(true)}
                        disabled={numberOfNights >= 30}
                        className="w-9 h-9 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-textSecondary mt-1">
                      {numberOfNights === 1 ? '1 night stay' : `${numberOfNights} nights stay`} (22 hours per night)
                    </p>
                  </div>

                  {/* Special Request Input */}
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-textPrimary mb-2">
                      Special Request
                    </label>
                    <textarea
                      value={specialRequest}
                      onChange={(e) => setSpecialRequest(e.target.value)}
                      placeholder="e.g., Request early check-in, room preferences, special occasion, etc."
                      rows="3"
                      className="w-full px-3 py-2 border border-ocean-light/20 rounded-lg text-sm focus:outline-none focus:border-ocean-light resize-none"
                    />
                    <p className="text-xs text-textSecondary mt-1">
                      <i className="fas fa-clock mr-1"></i>
                      Note: Check-in time is fixed at 2:00 PM. If you need early check-in, please specify here.
                    </p>
                  </div>

                  {/* Error Message */}
                  {dateSelectionError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        <i className="fas fa-exclamation-triangle mr-2"></i>
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
                      Object.values(availabilityStatus).some(s => s && !s.sufficient && s.quantity > 0)
                    }
                    className={`w-full py-3 rounded-lg font-semibold text-base transition-all duration-300 ${
                      checkInDate && Object.values(selectedRooms).some(q => q > 0) && 
                      !Object.values(availabilityStatus).some(s => s && !s.sufficient && s.quantity > 0)
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