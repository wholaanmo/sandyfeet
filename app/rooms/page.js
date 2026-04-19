// app/rooms/select-room-types/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function RoomsPage() {
  const router = useRouter();
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [totalGuestsPerType, setTotalGuestsPerType] = useState({});
  const [adultsPerType, setAdultsPerType] = useState({});
  const [kidsPerType, setKidsPerType] = useState({});
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkInHour, setCheckInHour] = useState(14);
  const [checkOutHour, setCheckOutHour] = useState(12);
  const [activeCategory, setActiveCategory] = useState('All Rooms');
  const [isExclusiveResortBooking, setIsExclusiveResortBooking] = useState(false);
  const [exclusiveAdults, setExclusiveAdults] = useState(1);
  const [exclusiveKids, setExclusiveKids] = useState(0);
  const [exclusiveGuestError, setExclusiveGuestError] = useState('');
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  const CHECK_IN_OPTIONS = [14, 15, 16];
  const CHECK_OUT_OPTIONS = [10, 11, 12, 13];

  const formatHour = (hour) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const normalized = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(normalized).padStart(2, '0')}:00 ${period}`;
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
  const EXCLUSIVE_RESORT_PRICE = 22500;

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
      const initialAdults = {};
      const initialKids = {};
      types.forEach(type => {
        const minGuests = Math.max(1, type.capacityMin || 1);
        initialSelected[type.type] = 0;
        initialTotalGuests[type.type] = minGuests;
        initialAdults[type.type] = minGuests;
        initialKids[type.type] = 0;
      });

      // Restore state from sessionStorage (detail-page return takes priority, then cached checkout draft).
      try {
        const transientState = sessionStorage.getItem('roomsPageState');
        const cachedState = sessionStorage.getItem(ROOMS_CHECKOUT_CACHE_KEY);
        const savedState = transientState || cachedState;
        if (savedState) {
          const parsed = JSON.parse(savedState);
          if (transientState) {
            sessionStorage.removeItem('roomsPageState');
          }

          // Restore selected rooms
          if (parsed.selectedRooms) {
            Object.keys(parsed.selectedRooms).forEach(roomType => {
              if (roomType in initialSelected) {
                initialSelected[roomType] = parsed.selectedRooms[roomType];
              }
            });
          }

          // Restore guest counts
          if (parsed.totalGuestsPerType) {
            Object.keys(parsed.totalGuestsPerType).forEach(roomType => {
              if (roomType in initialTotalGuests) {
                const restoredGuests = Math.max(0, Number(parsed.totalGuestsPerType[roomType]) || 0);
                initialTotalGuests[roomType] = restoredGuests;
                initialAdults[roomType] = Math.max(1, restoredGuests);
                initialKids[roomType] = 0;
              }
            });
          }

          // Restore adults and kids breakdown if available in saved payload.
          if (parsed.adultsPerType) {
            Object.keys(parsed.adultsPerType).forEach(roomType => {
              if (roomType in initialAdults) {
                initialAdults[roomType] = Math.max(1, Number(parsed.adultsPerType[roomType]) || 1);
              }
            });
          }
          if (parsed.kidsPerType) {
            Object.keys(parsed.kidsPerType).forEach(roomType => {
              if (roomType in initialKids) {
                initialKids[roomType] = Math.max(0, Number(parsed.kidsPerType[roomType]) || 0);
              }
            });
          }

          // Restore dates and settings
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
        }
      } catch {
        // no-op on malformed data
      }

      setSelectedRooms(initialSelected);
      setTotalGuestsPerType(initialTotalGuests);
      setAdultsPerType(initialAdults);
      setKidsPerType(initialKids);
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

  // Persist checkout draft so accidental back/navigation keeps selected values.
  useEffect(() => {
    if (loading || availableRoomTypes.length === 0) return;

    const draft = {
      selectedRooms,
      totalGuestsPerType,
      adultsPerType,
      kidsPerType,
      checkInDate: checkInDate ? checkInDate.toISOString() : null,
      numberOfNights,
      checkInHour,
      checkOutHour,
      specialRequest,
      activeCategory,
      isExclusiveResortBooking,
      exclusiveAdults,
      exclusiveKids,
      updatedAt: new Date().toISOString()
    };

    sessionStorage.setItem(ROOMS_CHECKOUT_CACHE_KEY, JSON.stringify(draft));
  }, [
    loading,
    availableRoomTypes,
    selectedRooms,
    totalGuestsPerType,
    adultsPerType,
    kidsPerType,
    checkInDate,
    numberOfNights,
    checkInHour,
    checkOutHour,
    specialRequest,
    activeCategory,
    isExclusiveResortBooking,
    exclusiveAdults,
    exclusiveKids
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModalOpen]);

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

  const isDateFullyAvailableForExclusive = (date) => {
    if (!date || availableRoomTypes.length === 0) return false;

    for (const roomTypeData of availableRoomTypes) {
      const totalUnits = getTotalUnitsForRoomType(roomTypeData);
      if (totalUnits <= 0) return false;

      const availableUnits = getAvailableUnitsForRoomTypeOnDate(date, roomTypeData);
      if (availableUnits < totalUnits) return false;
    }

    return true;
  };

  // Update unit-level availability when date changes
  useEffect(() => {
    if (checkInDate) {
      const availability = calculateUnitAvailabilityForDate(checkInDate);
      setUnitLevelAvailability(availability);
    } else {
      setUnitLevelAvailability({});
    }
  }, [checkInDate, availableRoomTypes, bookedDates, blockedSlots, checkInHour]);

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

  // Keep exclusive mode synced with room availability for the selected stay.
  useEffect(() => {
    if (!isExclusiveResortBooking || availableRoomTypes.length === 0) return;

    if (!checkInDate || !isDateFullyAvailableForExclusive(checkInDate)) {
      const clearedSelected = {};
      const clearedAdults = {};
      const clearedKids = {};
      const clearedTotals = {};

      for (const roomType of availableRoomTypes) {
        const minGuests = Math.max(1, roomType.capacityMin || 1);
        clearedSelected[roomType.type] = 0;
        clearedAdults[roomType.type] = minGuests;
        clearedKids[roomType.type] = 0;
        clearedTotals[roomType.type] = minGuests;
      }

      setSelectedRooms(clearedSelected);
      setAdultsPerType(clearedAdults);
      setKidsPerType(clearedKids);
      setTotalGuestsPerType(clearedTotals);
      return;
    }

    const nextSelected = {};
    const nextAdults = {};
    const nextKids = {};
    const nextTotals = {};

    for (const roomType of availableRoomTypes) {
      const qty = Math.max(0, getTotalUnitsForRoomType(roomType));
      const minGuests = qty * (roomType.capacityMin || 1);
      nextSelected[roomType.type] = qty;
      nextAdults[roomType.type] = Math.max(1, minGuests);
      nextKids[roomType.type] = 0;
      nextTotals[roomType.type] = Math.max(1, minGuests);
    }

    setSelectedRooms(nextSelected);
    setAdultsPerType(nextAdults);
    setKidsPerType(nextKids);
    setTotalGuestsPerType(nextTotals);
  }, [isExclusiveResortBooking, checkInDate, availableRoomTypes, roomAvailability, numberOfNights, checkInHour, blockedSlots, bookedDates, roomDetailsMap]);

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
  }, [checkInDate, checkOutDate, numberOfNights, selectedRooms, availableRoomTypes, bookedDates, blockedSlots, roomDetailsMap, checkInHour]);

  const handleQuantityChange = (roomType, increment) => {
    setIsExclusiveResortBooking(false);
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
      setAdultsPerType(prev => ({ ...prev, [roomType]: 1 }));
      setKidsPerType(prev => ({ ...prev, [roomType]: 0 }));
    } else {
      // Keep adults/kids and total guests inside allowed bounds.
      const maxTotalGuests = newQuantity * (typeData?.capacityMax || 10);
      const minTotalGuests = newQuantity * (typeData?.capacityMin || 1);

      const currentAdults = Number(adultsPerType[roomType] ?? minTotalGuests);
      const currentKids = Number(kidsPerType[roomType] ?? 0);
      const currentTotalGuests = currentAdults + currentKids;

      const normalizedTotalGuests = Math.min(maxTotalGuests, Math.max(minTotalGuests, currentTotalGuests));
      const normalizedAdults = Math.max(1, Math.min(normalizedTotalGuests, currentAdults));
      const normalizedKids = Math.max(0, normalizedTotalGuests - normalizedAdults);

      setAdultsPerType(prev => ({ ...prev, [roomType]: normalizedAdults }));
      setKidsPerType(prev => ({ ...prev, [roomType]: normalizedKids }));
      setTotalGuestsPerType(prev => ({ ...prev, [roomType]: normalizedTotalGuests }));
    }
  };

  const handleGuestCountChange = (roomType, guestType, value) => {
    setIsExclusiveResortBooking(false);
    const quantity = selectedRooms[roomType] || 0;
    if (quantity === 0) return;

    const typeData = availableRoomTypes.find((t) => t.type === roomType);
    const maxTotalGuests = quantity * (typeData?.capacityMax || 10);
    const minTotalGuests = quantity * (typeData?.capacityMin || 1);

    const parsedValue = Number.parseInt(value, 10);
    const normalizedInput = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue);

    let nextAdults = Number(adultsPerType[roomType] ?? minTotalGuests);
    let nextKids = Number(kidsPerType[roomType] ?? 0);

    if (guestType === 'adults') {
      nextAdults = normalizedInput;
    } else {
      nextKids = normalizedInput;
    }

    const nextTotalGuests = nextAdults + nextKids;
    let errorMessage = '';

    if (nextAdults < 1) {
      errorMessage = 'At least 1 adult is required.';
    } else if (nextTotalGuests > maxTotalGuests) {
      errorMessage = `Maximum ${maxTotalGuests} guests allowed for ${quantity} unit${quantity !== 1 ? 's' : ''}`;
    } else if (nextTotalGuests < minTotalGuests) {
      errorMessage = `Minimum ${minTotalGuests} guests required for ${quantity} unit${quantity !== 1 ? 's' : ''}`;
    }

    setAdultsPerType((prev) => ({ ...prev, [roomType]: nextAdults }));
    setKidsPerType((prev) => ({ ...prev, [roomType]: nextKids }));
    setTotalGuestsPerType((prev) => ({ ...prev, [roomType]: nextTotalGuests }));
    setGuestInputErrors((prev) => ({ ...prev, [roomType]: errorMessage }));
  };

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

  const canBookExclusiveResort = Boolean(checkInDate && isDateFullyAvailableForExclusive(checkInDate));

  const applyExclusiveSelections = () => {
    const nextSelected = {};
    const nextAdults = {};
    const nextKids = {};
    const nextTotals = {};

    for (const roomType of availableRoomTypes) {
      const qty = Math.max(0, getTotalUnitsForRoomType(roomType));
      const minGuests = qty * (roomType.capacityMin || 1);
      nextSelected[roomType.type] = qty;
      nextAdults[roomType.type] = Math.max(1, minGuests);
      nextKids[roomType.type] = 0;
      nextTotals[roomType.type] = Math.max(1, minGuests);
    }

    setSelectedRooms(nextSelected);
    setAdultsPerType(nextAdults);
    setKidsPerType(nextKids);
    setTotalGuestsPerType(nextTotals);
    setGuestInputErrors({});
    setExclusiveGuestError('');

    if ((Number(exclusiveAdults) || 0) < 1) {
      setExclusiveAdults(1);
    }
    if ((Number(exclusiveKids) || 0) < 0) {
      setExclusiveKids(0);
    }
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
    setIsExclusiveResortBooking(false);
    setDateSelectionError('');
    setExclusiveGuestError('');
  };

  const handleRemoveFromReceipt = (roomType) => {
    setIsExclusiveResortBooking(false);
    const roomTypeDetails = availableRoomTypes.find((room) => room.type === roomType);
    const minGuests = Math.max(1, Number(roomTypeDetails?.capacityMin || 1));

    setSelectedRooms((prev) => ({
      ...prev,
      [roomType]: 0
    }));

    setAdultsPerType((prev) => ({
      ...prev,
      [roomType]: minGuests
    }));

    setKidsPerType((prev) => ({
      ...prev,
      [roomType]: 0
    }));

    setTotalGuestsPerType((prev) => ({
      ...prev,
      [roomType]: minGuests
    }));

    setGuestInputErrors((prev) => ({
      ...prev,
      [roomType]: ''
    }));
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
    if (isExclusiveResortBooking) {
      const adults = Math.max(0, Number(exclusiveAdults) || 0);
      const kids = Math.max(0, Number(exclusiveKids) || 0);
      return adults + kids;
    }

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

  const getExclusiveMaxPax = () => {
    return availableRoomTypes.reduce((sum, roomType) => {
      const totalUnits = getTotalUnitsForRoomType(roomType);
      const roomMaxCapacity = Number(roomType.capacityMax || roomType.capacityMin || 1);
      return sum + (totalUnits * roomMaxCapacity);
    }, 0);
  };

  const handleExclusiveGuestChange = (guestType, rawValue) => {
    const parsedValue = Number.parseInt(rawValue, 10);
    const safeValue = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue);

    let nextAdults = Number(exclusiveAdults) || 1;
    let nextKids = Number(exclusiveKids) || 0;

    if (guestType === 'adults') {
      nextAdults = safeValue;
    } else {
      nextKids = safeValue;
    }

    const nextTotal = nextAdults + nextKids;
    const maxPax = getExclusiveMaxPax();
    let errorMessage = '';

    if (nextAdults < 1) {
      errorMessage = 'At least 1 adult is required.';
    } else if (maxPax > 0 && nextTotal > maxPax) {
      errorMessage = `Maximum ${maxPax} guests can be accommodated for the whole resort package.`;
    }

    setExclusiveAdults(Math.max(0, nextAdults));
    setExclusiveKids(Math.max(0, nextKids));
    setExclusiveGuestError(errorMessage);
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
    
    // Check if there are any guest input errors
    const hasErrors = Object.values(guestInputErrors).some(error => error !== '');
    if (!isExclusiveResortBooking && hasErrors) {
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

    const computedTotalPrice = isExclusiveResortBooking ? (EXCLUSIVE_RESORT_PRICE * numberOfNights) : getTotalPrice();

    // Store selected rooms and dates in session storage for the booking page
    const bookingData = {
      selectedRooms,
      totalGuestsPerType,
      adultsPerType,
      kidsPerType,
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

    if (isExclusiveResortBooking) {
      return !isDateFullyAvailableForExclusive(date);
    }
    
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
        for (let hour = checkInHour; hour < 24; hour++) {
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

  const exclusiveTotalPrice = EXCLUSIVE_RESORT_PRICE * numberOfNights;
  const checkoutTotal = isExclusiveResortBooking ? exclusiveTotalPrice : getTotalPrice();
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
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    activeCategory === cat 
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredRoomTypes.map((room) => {
                  const quantity = selectedRooms[room.type] || 0;
                  const realTimeAvailable = checkInDate 
                    ? (unitLevelAvailability[room.type] || 0)
                    : room.availableRooms;

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
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                            realTimeAvailable > 0
                              ? 'bg-emerald-100/90 text-emerald-700 border border-emerald-200'
                              : 'bg-red-100/90 text-red-700 border border-red-200'
                          }`}>
                            {realTimeAvailable > 0
                              ? `${realTimeAvailable} unit${realTimeAvailable > 1 ? 's' : ''} left`
                              : 'Sold out'}
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
                            <span className="px-3 py-1.5 bg-gray-50 border border-gray-100 text-[11px] font-medium text-gray-600 rounded-full">Airconditioned</span>
                            <span className="px-3 py-1.5 bg-gray-50 border border-gray-100 text-[11px] font-medium text-gray-600 rounded-full">Common bathroom</span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 relative z-10 w-full mb-0 mt-auto">
                           {quantity === 0 ? (
                              <button 
                                onClick={() => handleQuantityChange(room.type, true)}
                                disabled={realTimeAvailable <= 0}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all shadow-[0_4px_14px_0_rgb(37,99,235,0.39)] hover:shadow-[0_6px_20px_rgb(37,99,235,0.23)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
                              >
                                {realTimeAvailable > 0 ? (
                                  <>
                                    <i className="fas fa-plus text-xs"></i> Add to Reservation
                                  </>
                                ) : 'Sold Out'}
                              </button>
                           ) : (
                              <div className="w-full flex items-center justify-between bg-blue-50/80 border border-blue-200 rounded-xl p-1.5 shadow-inner relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-100/50 to-transparent pointer-events-none"></div>
                                <button 
                                  onClick={() => handleQuantityChange(room.type, false)}
                                  className="relative z-10 w-12 h-10 flex items-center justify-center bg-white text-blue-600 rounded-lg shadow-sm border border-blue-100 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                >
                                  <i className="fas fa-minus text-sm"></i>
                                </button>
                                <span className="font-bold text-blue-800 text-lg relative z-10 tracking-tight">
                                  {quantity} <span className="text-[10px] text-blue-600/70 font-black uppercase tracking-wider ml-0.5">Units</span>
                                </span>
                                <button 
                                  onClick={() => handleQuantityChange(room.type, true)}
                                  disabled={quantity >= realTimeAvailable}
                                  className="relative z-10 w-12 h-10 flex items-center justify-center bg-blue-600 text-white disabled:bg-blue-300 disabled:shadow-none rounded-xl shadow-sm hover:bg-blue-700 transition-colors"
                                >
                                  <i className="fas fa-plus text-sm"></i>
                                </button>
                              </div>
                           )}
                           <button 
                             onClick={() => {
                               const slug = toRoomSlug(room.type);
                               const qtyObj = Math.max(1, selectedRooms[room.type] || 1);
                               const fallbackGuests = qtyObj * (room.capacityMin || 1);
                               const totalGuests = Math.max(
                                 fallbackGuests,
                                 Number(totalGuestsPerType[room.type] || fallbackGuests)
                               );

                               // Save per-room draft for the detail page
                               const draft = {
                                 roomType: room.type,
                                 quantity: qtyObj,
                                 totalGuests,
                                 checkInDate: checkInDate ? checkInDate.toISOString() : null,
                                 numberOfNights,
                                 checkInHour,
                                 checkOutHour
                               };
                               sessionStorage.setItem('roomDetailDraft', JSON.stringify(draft));

                               // Also save full multi-room booking progress so it can be restored
                               const multiRoomState = {
                                 selectedRooms,
                                 totalGuestsPerType,
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
                             className="w-full py-2.5 bg-gray-50 border border-gray-200 text-gray-600 hover:text-blue-600 hover:bg-blue-50 text-xs font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow"
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
            </div>

            {/* RIGHT: Booking Receipt & Dates (lg:col-span-4) */}
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
                      <p className="text-xs text-blue-700/80">₱{EXCLUSIVE_RESORT_PRICE.toLocaleString()} per night • Total: ₱{exclusiveTotalPrice.toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={isExclusiveResortBooking ? handleClearExclusiveResort : handleSelectExclusiveResort}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                        isExclusiveResortBooking
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isExclusiveResortBooking ? 'Exclusive Selected' : 'Select Exclusive'}
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
                        <button onClick={() => handleNightsChange(false)} disabled={numberOfNights<=1} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                          <i className="fas fa-minus text-[10px]"></i>
                        </button>
                        <span className="font-bold text-sm flex-1 text-center text-gray-800">{numberOfNights}</span>
                        <button onClick={() => handleNightsChange(true)} disabled={numberOfNights>=30} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                          <i className="fas fa-plus text-[10px]"></i>
                        </button>
                      </div>
                    </div>

                    {isModalOpen && (
                      <div
                        ref={calendarPopoverRef}
                        className="absolute left-0 top-[4.25rem] z-50 bg-white w-[290px] max-w-[calc(100vw-3rem)] rounded-2xl shadow-[0_16px_40px_rgb(0,0,0,0.14)] p-2.5 border border-gray-100 max-h-[58vh] overflow-hidden flex flex-col"
                      >
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
                                text = (isFullyBlocked || isFullyBooked) ? 'text-red-300' : 'text-gray-300';
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
                                <button
                                  key={index}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => handleDateSelect(day)}
                                  className={`h-9 flex items-center justify-center font-bold text-[10px] transition-all ${bg} ${text} ${stateClass}`}
                                >
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

                      <div className="bg-gray-50/80 rounded-xl p-2 mt-3 ml-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                            <input
                              type="number"
                              min={1}
                              value={exclusiveAdults}
                              onChange={(e) => handleExclusiveGuestChange('adults', e.target.value)}
                              className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${exclusiveGuestError ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                            <input
                              type="number"
                              min={0}
                              value={exclusiveKids}
                              onChange={(e) => handleExclusiveGuestChange('kids', e.target.value)}
                              className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${exclusiveGuestError ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                            />
                          </label>
                        </div>
                        <p className="text-[10px] font-semibold text-gray-500 mt-2">
                          Total Pax: {exclusiveTotalPax}
                        </p>
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
                    availableRoomTypes.filter(r => selectedRooms[r.type] > 0).map(room => (
                      <div key={room.type} className="p-3.5 bg-white border border-gray-100 shadow-sm rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-400"></div>
                        <div className="flex justify-between items-start mb-2 pl-2">
                           <div>
                              <p className="text-sm font-bold text-gray-800 truncate max-w-[120px]">{room.type}</p>
                              <p className="text-[10px] text-blue-500 font-extrabold uppercase tracking-widest mt-1">{selectedRooms[room.type]} unit{selectedRooms[room.type] > 1 ? 's' : ''}</p>
                           </div>
                           <div className="flex items-start gap-2">
                             <p className="text-sm font-bold text-gray-800 pt-0.5">
                               ₱{(room.price * selectedRooms[room.type] * numberOfNights).toLocaleString()}
                             </p>
                             <button
                               onClick={() => handleRemoveFromReceipt(room.type)}
                               className="w-6 h-6 rounded-full bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex items-center justify-center"
                               aria-label={`Remove ${room.type} from receipt`}
                               title="Remove room"
                             >
                               <i className="fas fa-times text-[10px]"></i>
                             </button>
                           </div>
                        </div>
                        <div className="bg-gray-50/80 rounded-xl p-2 mt-3 ml-2">
                           <div className="grid grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-gray-500">Adults</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={adultsPerType[room.type] ?? 1}
                                  onChange={(e) => handleGuestCountChange(room.type, 'adults', e.target.value)}
                                  className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${guestInputErrors[room.type] ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-gray-500">Kids</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={kidsPerType[room.type] ?? 0}
                                  onChange={(e) => handleGuestCountChange(room.type, 'kids', e.target.value)}
                                  className={`w-full text-xs font-bold border bg-white rounded-md pl-3 py-1 shadow-sm focus:outline-none focus:ring-2 ${guestInputErrors[room.type] ? 'border-red-300 focus:border-red-400 ring-red-100 text-red-600' : 'border-gray-200 focus:border-blue-400 ring-blue-100'}`}
                                />
                              </label>
                           </div>
                           <p className="text-[10px] font-semibold text-gray-500 mt-2">
                             Total Guests: {totalGuestsPerType[room.type] || 0}
                           </p>
                        </div>
                        {guestInputErrors[room.type] && (
                           <div className="bg-red-50/80 border-t border-red-100 p-2 text-[10px] text-red-600 font-semibold tracking-tight leading-tight flex items-start gap-1 w-full rounded-b-2xl absolute bottom-0 left-0">
                              <i className="fas fa-exclamation-circle mt-[0.1rem]"></i>
                              <span>{guestInputErrors[room.type]}</span>
                           </div>
                        )}
                      </div>
                    ))
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
                        {Object.values(selectedRooms).reduce((a,b)=>a+b, 0)} Units Chosen
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
                  <button
                     onClick={handleProceed}
                     disabled={!checkInDate || Object.values(selectedRooms).every(q => q === 0) || dateSelectionError !== '' || hasAnyGuestErrors}
                     className={`w-full py-4 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                       (checkInDate && Object.values(selectedRooms).some(q => q>0) && !hasAnyGuestErrors) 
                       ? 'bg-blue-600 text-white shadow-[0_8px_20px_rgb(37,99,235,0.25)] hover:bg-blue-700 hover:-translate-y-0.5' 
                       : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                     }`}
                  >
                    Checkout &bull; ₱{checkoutTotal.toLocaleString()} &rarr;
                  </button>
                  {(!checkInDate || Object.values(selectedRooms).every(q => q === 0)) && (
                    <div className="absolute left-1/2 -top-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] font-medium py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 tooltip">
                      Please select check-in dates and at least one room type.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-800"></div>
                    </div>
                  )}
                  {hasAnyGuestErrors && (checkInDate && Object.values(selectedRooms).some(q => q > 0)) && (
                    <div className="absolute left-1/2 -top-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 text-white text-[10px] font-medium py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-10 tooltip">
                      Please fix guest count errors before checking out.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-red-600"></div>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-center gap-2 text-gray-400">
                   <i className="fas fa-lock text-[10px]"></i>
                   <p className="text-[9px] font-bold uppercase tracking-widest">Secure booking guaranteed</p>
                </div>
                {dateSelectionError && (
                  <p className="text-red-500 text-[10px] mt-4 text-center font-bold bg-red-50 py-2.5 px-3 rounded-xl border border-red-100">
                     <i className="fas fa-exclamation-circle mr-1"></i>
                     {dateSelectionError}
                  </p>
                )}

              </div>
            </div>

          </div>
        </div>
      </div>


    </GuestLayout>
  );
}
