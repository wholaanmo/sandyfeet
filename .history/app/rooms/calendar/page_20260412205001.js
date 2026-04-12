// app/rooms/calendar/page.js
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';

export default function RoomCalendar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get('roomId');
  const roomType = searchParams.get('roomType');
  const price = searchParams.get('price');
  const maxCapacity = parseInt(searchParams.get('capacity'));
  const totalRoomsParam = parseInt(searchParams.get('totalRooms'), 10);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [roomDetails, setRoomDetails] = useState(null);
  const [timeSelectionError, setTimeSelectionError] = useState('');
  
  const [selectedRoomQuantity, setSelectedRoomQuantity] = useState(1);
  const [specialRequest, setSpecialRequest] = useState('');
  const [maxSelectableRooms, setMaxSelectableRooms] = useState(1);
  const [availabilityError, setAvailabilityError] = useState('');
  const [numberOfNights, setNumberOfNights] = useState(1);

  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

  const fixedTimeSlot = {
    value: `${FIXED_CHECK_IN_HOUR.toString().padStart(2, '0')}:00`,
    display: FIXED_CHECK_IN_DISPLAY,
    hour: FIXED_CHECK_IN_HOUR
  };

  const totalRoomUnits = (() => {
    const totalRoomsFromUrl =
      Number.isFinite(totalRoomsParam) && totalRoomsParam >= 0 ? totalRoomsParam : null;
    const totalRoomsFromDetails = parseInt(roomDetails?.totalRooms, 10);
    const maintenanceRoomsFromDetails = parseInt(roomDetails?.maintenanceRooms, 10);

    const effectiveTotalRooms =
      Number.isFinite(totalRoomsFromDetails) && totalRoomsFromDetails >= 0
        ? totalRoomsFromDetails
        : Number.isFinite(totalRoomsFromUrl) && totalRoomsFromUrl >= 0
          ? totalRoomsFromUrl
          : 1;

    const maintenanceRooms =
      Number.isFinite(maintenanceRoomsFromDetails) && maintenanceRoomsFromDetails > 0
        ? maintenanceRoomsFromDetails
        : 0;

    return Math.max(0, effectiveTotalRooms - maintenanceRooms);
  })();

  const toJsDate = (value) => {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const toLocalDateKey = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      if (snap.exists()) setRoomDetails(snap.data());
      else setRoomDetails(null);
    });
    return () => unsubscribe();
  }, [roomId]);

  // Bookings listener - store booked units per date per hour (using date string key)
  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('roomId', '==', roomId),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const booked = {};
        querySnapshot.forEach((docSnap) => {
          const booking = docSnap.data();
          const checkIn = toJsDate(booking.checkIn);
          const checkOut = toJsDate(booking.checkOut);
          const numberOfRooms = booking.numberOfRooms || 1;
          if (!checkIn || !checkOut || checkOut <= checkIn) return;

          // Same index shape as app/rooms/select-room-types: booked[date][roomId][hour]
          let current = new Date(checkIn);
          while (current < checkOut) {
            const dateStr = toLocalDateKey(current);
            const hour = current.getHours();

            if (!booked[dateStr]) booked[dateStr] = {};
            if (!booked[dateStr][roomId]) booked[dateStr][roomId] = {};
            booked[dateStr][roomId][hour] = (booked[dateStr][roomId][hour] || 0) + numberOfRooms;

            current.setHours(current.getHours() + 1, 0, 0, 0);
          }
        });
        setBookedDates(booked);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to bookings:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [roomId]);

  // Blocked slots: same aggregation as app/rooms/select-room-types (per roomId, per hour)
  useEffect(() => {
    if (!roomId) return;
    const blockedRef = collection(db, 'unavailableSlots');
    const q = query(blockedRef, where('roomId', '==', roomId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blocks = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.date;
        const startHour = data.startHour;
        const endHour = data.endHour;
        const unitsBlocked = data.unitsBlocked || 1;

        if (!blocks[dateKey]) blocks[dateKey] = {};
        if (!blocks[dateKey][roomId]) blocks[dateKey][roomId] = {};
        for (let hour = startHour; hour < endHour; hour++) {
          blocks[dateKey][roomId][hour] = (blocks[dateKey][roomId][hour] || 0) + unitsBlocked;
        }
      });

      setBlockedSlots(blocks);
    });
    return () => unsubscribe();
  }, [roomId]);

  // Same stay availability rule as app/rooms/select-room-types: for each night, only hours
  // 2:00 PM – midnight on that calendar day affect how many units can start / continue the stay.
  const getMaxAvailableRoomsForDateTime = (date, startHour, nights = numberOfNights) => {
    if (!date || !roomId || totalRoomUnits <= 0) return 0;
    if (startHour !== FIXED_CHECK_IN_HOUR) return 0;

    const maxRooms = totalRoomUnits;
    let availableForStay = maxRooms;
    const n = parseInt(nights, 10) || 1;

    for (let dayOffset = 0; dayOffset < n; dayOffset++) {
      const currentDate = new Date(date);
      currentDate.setDate(date.getDate() + dayOffset);
      const dateStr = toLocalDateKey(currentDate);

      for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
        const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
        const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
        const available = maxRooms - bookedCount - blockedUnits;
        availableForStay = Math.min(availableForStay, available);
        if (availableForStay <= 0) break;
      }
      if (availableForStay <= 0) break;
    }

    return Math.max(0, availableForStay);
  };

  const areRoomsAvailableForDateTime = (date, startHour, requiredRooms, nights = numberOfNights) => {
    if (!date || !roomId) return false;
    if (totalRoomUnits <= 0) return false;
    if (requiredRooms > totalRoomUnits) return false;
    return getMaxAvailableRoomsForDateTime(date, startHour, nights) >= requiredRooms;
  };

  // Update max selectable rooms based on selected date and availability
  useEffect(() => {
    if (!selectedDate) {
      setMaxSelectableRooms(1);
      setAvailabilityError('');
      return;
    }
    
    const maxAvailable = getMaxAvailableRoomsForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, numberOfNights);
    setMaxSelectableRooms(maxAvailable);
    
    if (selectedRoomQuantity > maxAvailable) {
      setSelectedRoomQuantity(Math.max(1, maxAvailable));
      if (maxAvailable === 0) {
        setAvailabilityError(`No rooms available for ${selectedDate.toDateString()} at 2:00 PM check-in.`);
      } else {
        setAvailabilityError(`Only ${maxAvailable} room(s) available for this date.`);
      }
    } else {
      setAvailabilityError('');
    }
  }, [selectedDate, bookedDates, blockedSlots, totalRoomUnits, selectedRoomQuantity, numberOfNights]);

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

  // Align with select-room-types: min available across 2:00 PM – midnight for this roomId
  const isDateFullyBooked = (date) => {
    if (!date || !roomId || totalRoomUnits <= 0) return false;
    const dateStr = toLocalDateKey(date);
    const maxRooms = totalRoomUnits;
    let minAvailable = maxRooms;

    for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
      const blockedUnits = blockedSlots[dateStr]?.[roomId]?.[hour] || 0;
      const bookedCount = bookedDates[dateStr]?.[roomId]?.[hour] || 0;
      const availableNow = Math.max(0, maxRooms - bookedCount - blockedUnits);
      minAvailable = Math.min(minAvailable, availableNow);
      if (minAvailable <= 0) break;
    }

    return minAvailable < 1;
  };

  const isDateFullyBlockedByAdmin = (date) => {
    if (!date || !roomId || totalRoomUnits <= 0) return false;
    const dateKey = toLocalDateKey(date);
    const maxRooms = totalRoomUnits;
    const blockedMorningUnits = Math.min(maxRooms, blockedSlots[dateKey]?.[roomId]?.[0] || 0);
    const blockedAfternoonUnits = Math.min(
      maxRooms,
      blockedSlots[dateKey]?.[roomId]?.[FIXED_CHECK_IN_HOUR] || 0
    );
    const morningClosed = maxRooms > 0 && blockedMorningUnits >= maxRooms;
    const afternoonClosed = maxRooms > 0 && blockedAfternoonUnits >= maxRooms;
    return morningClosed && afternoonClosed;
  };

  const getAdminBlockingInfo = (date) => {
    if (!date || !roomId || totalRoomUnits <= 0) {
      return { morningBlocked: false, afternoonBlocked: false, fullyBlocked: false };
    }
    const dateKey = toLocalDateKey(date);
    const maxRooms = totalRoomUnits;
    const blockedMorningUnits = Math.min(maxRooms, blockedSlots[dateKey]?.[roomId]?.[0] || 0);
    const blockedAfternoonUnits = Math.min(
      maxRooms,
      blockedSlots[dateKey]?.[roomId]?.[FIXED_CHECK_IN_HOUR] || 0
    );
    const morningBlocked = maxRooms > 0 && blockedMorningUnits >= maxRooms;
    const afternoonBlocked = maxRooms > 0 && blockedAfternoonUnits >= maxRooms;
    const fullyBlocked = morningBlocked && afternoonBlocked;
    return { morningBlocked, afternoonBlocked, fullyBlocked };
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

  const handleDateSelect = (date) => {
    if (!isDateSelectable(date)) return;
    setSelectedDate(date);
    setSelectedTime(fixedTimeSlot.display);
    setTimeSelectionError('');
  };

  const handleRoomQuantityChange = (quantity) => {
    const newQuantity = Math.min(Math.max(1, quantity), maxSelectableRooms);
    setSelectedRoomQuantity(newQuantity);
    
    if (selectedDate) {
      if (!areRoomsAvailableForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, newQuantity, numberOfNights)) {
        setAvailabilityError(`Only ${maxSelectableRooms} room(s) available for ${selectedDate.toDateString()}.`);
        if (selectedTime) {
          setSelectedTime('');
        }
      } else {
        setAvailabilityError('');
        setSelectedTime(fixedTimeSlot.display);
      }
    }
  };

  const handleNightsChange = (increment) => {
    const current = parseInt(numberOfNights, 10) || 1;
    const next = increment ? Math.min(current + 1, 30) : Math.max(1, current - 1);
    setNumberOfNights(next);
  };

  const handleProceed = () => {
    if (selectedDate && selectedTime && selectedRoomQuantity > 0) {
      const checkOutDate = new Date(selectedDate);
      checkOutDate.setDate(checkOutDate.getDate() + numberOfNights);

      // Time-rule validation:
      // - Check-in date requires PM (2:00 PM – 12:00 AM) to be available
      // - Check-out date requires AM (12:00 AM – 12:00 PM) to be available
      const checkInInfo = getAdminBlockingInfo(selectedDate);
      const checkOutInfo = getAdminBlockingInfo(checkOutDate);

      if (checkInInfo.afternoonBlocked) {
        setTimeSelectionError('Check-in is not available on this date');
        return;
      }
      if (checkOutInfo.morningBlocked) {
        setTimeSelectionError('Selected dates are not available due to time restrictions.');
        return;
      }

      // Availability + time-range constraints across the 22-hour stay
      const ok = areRoomsAvailableForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, selectedRoomQuantity, numberOfNights);
      if (!ok) {
        setTimeSelectionError(
          `Selected dates are not available due to time restrictions.`
        );
        return;
      }

      const checkInDateTime = new Date(selectedDate);
      checkInDateTime.setHours(FIXED_CHECK_IN_HOUR, 0, 0, 0);
      
      const checkOutDateTime = new Date(selectedDate);
      checkOutDateTime.setDate(checkOutDateTime.getDate() + numberOfNights);
      checkOutDateTime.setHours(FIXED_CHECK_OUT_HOUR, 0, 0, 0);
      
      router.push(
        `/rooms/booking?roomId=${roomId}&roomType=${encodeURIComponent(roomType)}&price=${price}&maxCapacity=${maxCapacity}&totalRooms=${roomDetails?.totalRooms ?? totalRoomUnits}&checkIn=${checkInDateTime.toISOString()}&checkOut=${checkOutDateTime.toISOString()}&nights=${numberOfNights}&numberOfRooms=${selectedRoomQuantity}&specialRequest=${encodeURIComponent(specialRequest)}`
      );
    }
  };

  const isDateSelectable = (date) => {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return false;
    const minBookableDate = new Date();
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    minBookableDate.setHours(0, 0, 0, 0);
    if (date < minBookableDate) return false;
    
    // Check if the date is fully booked or fully blocked by admin
    if (isDateFullyBooked(date)) return false;
    if (isDateFullyBlockedByAdmin(date)) return false;
    
    const { afternoonBlocked } = getAdminBlockingInfo(date);
    if (afternoonBlocked) return false;
    
    return true;
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
    setSelectedTime('');
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
    setSelectedTime('');
  };

  const goBack = () => {
    router.push('/rooms');
  };

  const days = getDaysInMonth(currentDate);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const getCapacityDisplay = () => {
    if (roomDetails) {
      const minCap = roomDetails.capacityMin || 1;
      const maxCap = roomDetails.capacityMax || maxCapacity;
      return `${minCap} – ${maxCap} guests`;
    }
    return `${maxCapacity} guests`;
  };

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
          {/* New layout: left 40% (calendar), right 60% (room card + quantity row, then check-in time below) */}
          <div className="flex flex-col lg:flex-row gap-6 items-stretch">
            {/* LEFT COLUMN (40%) - Select Check-in Date (Calendar) */}
            <div className="lg:w-[40%]">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden h-full flex flex-col">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3 flex-shrink-0">
                  <h1 className="text-xl font-bold text-white">Select Check-in Date</h1>
                  <p className="text-white/80 text-sm mt-1">{roomType} - ₱{parseInt(price).toLocaleString()}/night</p>
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <button
                      onClick={goBack}
                      className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200 flex items-center gap-1 text-sm"
                    >
                      <i className="fas fa-arrow-left text-xs"></i>
                      Back
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={goToPreviousMonth}
                        className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200 text-sm"
                      >
                        <i className="fas fa-chevron-left mr-1 text-xs"></i>
                        Prev
                      </button>
                      <h2 className="text-lg font-semibold text-textPrimary px-2">
                        {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                      </h2>
                      <button
                        onClick={goToNextMonth}
                        className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200 text-sm"
                      >
                        Next
                        <i className="fas fa-chevron-right ml-1 text-xs"></i>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="text-center font-semibold text-textSecondary text-xs py-1.5">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 flex-1">
                    {days.map((day, index) => {
                      if (!day) return <div key={index} className="aspect-square"></div>;

                      const isPast = isDatePast(day);
                      const isTooSoon = isDateTooSoon(day);
                      const isFullyBooked = isDateFullyBooked(day);
                      const isSelected = selectedDate && selectedDate.toDateString() === day.toDateString();
                      const isFullyBlockedByAdmin = isDateFullyBlockedByAdmin(day);
                      const { morningBlocked, afternoonBlocked, fullyBlocked } = getAdminBlockingInfo(day);
                      const isPartiallyBlockedMorningOnly = morningBlocked && !afternoonBlocked;
                      const isPartiallyBlockedAfternoon = afternoonBlocked && !morningBlocked;
                      const isCheckoutRestrictedAndFullyBooked =
                        isPartiallyBlockedMorningOnly && isFullyBooked;

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
                        textColor = 'text-orange-800';
                        borderClass = 'border border-orange-200';
                        cursorClass = 'cursor-not-allowed';
                        titleText =
                          'This date is fully unavailable. Any booking that requires this date (as check-in or check-out) will not be allowed.';
                      } else if (isPartiallyBlockedAfternoon) {
                        // Check-in blocked (PM blocked) -> Light Yellow
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
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 pt-3 border-t border-ocean-light/10 flex justify-center gap-4 text-xs flex-wrap flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-white border border-gray-300 rounded"></div>
                      <span className="text-textSecondary">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                      <span className="text-textSecondary">Fully Booked (no check-out restriction)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
                      <span className="text-textSecondary">Check-in Restricted</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                      <span className="text-textSecondary">Check-out Restricted only</span>
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
    <span className="w-4 h-2 rounded-full bg-green-400" />
    <span className="w-4 h-2 rounded-full bg-red-500" />
  </div>

  <span className="text-sm leading-none">
    Fully booked + check-out restricted (dots below date)
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

            {/* RIGHT BLOCK (60%) - contains Room Card + Room Quantity row, and Check-in Time below */}
            <div className="lg:w-[60%] flex flex-col gap-5">
              {/* Top row: Room Card (40% of total = 66.66% of this block) and Room Quantity (20% of total = 33.33% of this block) */}
              <div className="flex flex-row gap-5 items-stretch">
                {/* Room Card */}
                <div className="w-[66.666%]">
                  <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 overflow-hidden h-full flex flex-col">
                    <div className="relative h-48 bg-gradient-to-br from-ocean-pale to-ocean-ice overflow-hidden">
                      {roomDetails?.images && roomDetails.images[0] ? (
                        <Image
                          src={roomDetails.images[0]}
                          alt={roomType}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <i className="fas fa-hotel text-4xl text-ocean-light/30"></i>
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-bold text-textPrimary text-lg mb-1">{roomType}</h3>
                      <p className="text-xl font-bold text-ocean-mid mb-2">
                        ₱{parseInt(price).toLocaleString()}
                        <span className="text-sm font-normal text-textSecondary">/night</span>
                      </p>
                      <div className="flex items-center gap-2 text-textSecondary mb-3">
                        <i className="fas fa-users text-ocean-light"></i>
                        <span className="text-sm">{getCapacityDisplay()}</span>
                      </div>
                      <div className="bg-ocean-ice rounded-lg p-2 mb-3">
                        <p className="text-xs font-semibold text-textPrimary mb-1">
                          <i className="fas fa-calendar-check text-ocean-mid mr-1"></i>
                          Selected Schedule
                        </p>
                        {selectedDate ? (
                          <>
                            <p className="text-sm font-semibold text-textPrimary">
                              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                            <p className="text-xs text-ocean-mid font-medium mt-1">
                              <i className="fas fa-clock mr-1"></i>
                              Check-in: {FIXED_CHECK_IN_DISPLAY}
                            </p>
                            <p className="text-xs text-textSecondary mt-1">
                              Check-out: {FIXED_CHECK_OUT_DISPLAY} (next day)
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-semibold text-textPrimary">No date selected</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Room Quantity Container */}
                <div className="w-[33.333%]">
                  <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 overflow-hidden h-full flex flex-col p-4">
                    <h3 className="text-base font-semibold text-textPrimary mb-3 flex items-center gap-2">
                      <i className="fas fa-door-open text-ocean-light"></i>
                      Room Quantity
                    </h3>
                    
                    {selectedDate ? (
                      <>
                        <div className="mb-3 p-2 bg-ocean-ice rounded-lg border border-ocean-light/10">
                          <p className="text-xs font-semibold text-textPrimary">Number of Nights</p>
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => handleNightsChange(false)}
                              disabled={numberOfNights <= 1}
                              className="w-8 h-8 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              -
                            </button>
                            <span className="text-lg font-bold text-textPrimary min-w-[32px] text-center">
                              {numberOfNights}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleNightsChange(true)}
                              disabled={numberOfNights >= 30}
                              className="w-8 h-8 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              +
                            </button>
                          </div>
                          <p className="text-[11px] text-textSecondary mt-1">
                            Fixed 22-hour stay (2:00 PM – 12:00 PM next day)
                          </p>
                        </div>

                        <div className="mb-3">
                          <label className="block text-sm font-medium text-textPrimary mb-1">
                            Number of Rooms
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRoomQuantityChange(selectedRoomQuantity - 1)}
                              disabled={selectedRoomQuantity <= 1}
                              className="w-8 h-8 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              -
                            </button>
                            <span className="text-xl font-bold text-textPrimary min-w-[40px] text-center">
                              {selectedRoomQuantity}
                            </span>
                            <button
                              onClick={() => handleRoomQuantityChange(selectedRoomQuantity + 1)}
                              disabled={selectedRoomQuantity >= maxSelectableRooms}
                              className="w-8 h-8 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              +
                            </button>
                          </div>
                          <div className="mt-2">
                            <p className={`text-xs ${maxSelectableRooms > 0 ? 'text-textSecondary' : 'text-red-600'}`}>
                              {maxSelectableRooms > 0 ? (
                                `${maxSelectableRooms} room(s) available`
                              ) : (
                                `Booking not allowed due to resort unavailability`
                              )}
                            </p>
                            {(() => {
                              const nextDay = new Date(selectedDate);
                              nextDay.setDate(nextDay.getDate() + numberOfNights);
                              const checkOutBlocked = getAdminBlockingInfo(nextDay).morningBlocked;
                              const windowOk = areRoomsAvailableForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, selectedRoomQuantity, numberOfNights);
                              if (!checkOutBlocked && windowOk) return null;
                              return (
                                <p className="text-xs text-red-600 mt-1">
                                  <i className="fas fa-exclamation-circle mr-1"></i>
                                  This date is not available because the next day has restricted availability.
                                </p>
                              );
                            })()}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-textPrimary mb-1">
                            Special Request
                          </label>
                          <textarea
                            value={specialRequest}
                            onChange={(e) => setSpecialRequest(e.target.value)}
                            placeholder="e.g., early check-in, preferences..."
                            rows="2"
                            className="w-full px-2 pt-2 pb-10 border border-ocean-light/20 rounded-lg text-sm focus:outline-none focus:border-ocean-light resize-none"
                          />
<p className="text-xs text-textSecondary mt-1 mb-3">
  <i className="fas fa-clock mr-1"></i>
  Check-in fixed at 2:00 PM.
</p>

<button
  onClick={handleProceed}
  disabled={
    !selectedDate ||
    !selectedTime ||
    selectedRoomQuantity < 1 ||
    (() => {
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + numberOfNights);
      return getAdminBlockingInfo(nextDay).morningBlocked || !areRoomsAvailableForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, selectedRoomQuantity, numberOfNights);
    })()
  }
  className={`w-full py-2 rounded-lg font-semibold text-sm transition-all duration-300 mt-2 mt-auto ${
    selectedDate && selectedTime && selectedRoomQuantity >= 1
      ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg hover:-translate-y-0.5'
      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
  }`}
>
  Proceed to Booking
</button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-center">
                        <p className="text-textSecondary text-sm">Select a date first</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom row: Check-in Time Container (full width) */}
              {selectedDate ? (
                <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 p-4">
                  <h3 className="text-base font-semibold text-textPrimary mb-3 flex items-center gap-2">
                    <i className="fas fa-clock text-ocean-light"></i>
                    Check-in Time
                  </h3>
                  <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-800">
                      <i className="fas fa-info-circle mr-1"></i>
                      <strong>Fixed Check-in Time: 2:00 PM</strong>
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Check-out time is fixed at 12:00 PM (noon) the following day.
                      You may submit a request for earlier check-in in the Special Request field.
                    </p>
                  </div>
                  {timeSelectionError && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-700">
                        <i className="fas fa-exclamation-triangle mr-1"></i>
                        {timeSelectionError}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {(() => {
                      const isAvailable = areRoomsAvailableForDateTime(selectedDate, fixedTimeSlot.hour, selectedRoomQuantity, numberOfNights);
                      const isSelectedTime = selectedTime === fixedTimeSlot.display;
                      
                      return (
                        <div
                          className={`py-2 px-3 rounded-lg text-center text-sm font-medium transition-all duration-200 ${
                            isSelectedTime
                              ? 'bg-ocean-mid text-white shadow-md'
                              : !isAvailable
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-ocean-ice border border-ocean-light/20 text-textPrimary'
                          }`}
                        >
                          {fixedTimeSlot.display}
                          {!isAvailable && (
                            <span className="block text-[10px] text-red-500 mt-0.5">Not Available</span>
                          )}
                          {isAvailable && isSelectedTime && (
                            <span className="block text-[10px] text-white/80 mt-0.5">Selected</span>
                          )}
                          {isAvailable && !isSelectedTime && (
                            <span className="block text-[10px] text-green-600 mt-0.5">Available</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 p-6 text-center flex-1 flex items-center justify-center">
                  <div>
                    <i className="fas fa-calendar-day text-3xl text-ocean-light/40 mb-2 block"></i>
                    <p className="text-textSecondary text-sm">Select a date first</p>
                    <p className="text-textSecondary text-xs mt-1">to see available check-in times</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </GuestLayout>
  );
}