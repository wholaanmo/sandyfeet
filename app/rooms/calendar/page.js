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
  const [fullyBlockedDates, setFullyBlockedDates] = useState({});
  const [roomDetails, setRoomDetails] = useState(null);
  const [timeSelectionError, setTimeSelectionError] = useState('');
  
  const [selectedRoomQuantity, setSelectedRoomQuantity] = useState(1);
  const [specialRequest, setSpecialRequest] = useState('');
  const [maxSelectableRooms, setMaxSelectableRooms] = useState(1);
  const [availabilityError, setAvailabilityError] = useState('');

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

  // Bookings listener
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
          let current = new Date(checkIn);
          while (current < checkOut) {
            const dateKey = current.toDateString();
            if (!booked[dateKey]) {
              booked[dateKey] = { times: {} };
              for (let h = 0; h < 24; h++) {
                booked[dateKey].times[`${h}:00`] = 0;
              }
            }
            const startHour = current.getHours();
            const endHour =
              current.toDateString() === checkOut.toDateString()
                ? checkOut.getHours()
                : 24;
            for (let h = startHour; h < endHour; h++) {
              booked[dateKey].times[`${h}:00`] += numberOfRooms;
            }
            current.setDate(current.getDate() + 1);
            current.setHours(0, 0, 0, 0);
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

  // Blocked slots: per-hour total admin-blocked units
  useEffect(() => {
    if (!roomId) return;
    const cap = totalRoomUnits;
    const blockedRef = collection(db, 'unavailableSlots');
    const q = query(blockedRef, where('roomId', '==', roomId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blocks = {};
      const fullyBlocked = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.date;
        const startHour = data.startHour;
        const endHour = data.endHour;
        const rawUnits = data.unitsBlocked;
        const docUnits =
          rawUnits != null
            ? Math.min(cap, Math.max(1, parseInt(rawUnits, 10) || 0))
            : cap;

        if (!blocks[dateKey]) blocks[dateKey] = {};
        for (let hour = startHour; hour < endHour; hour++) {
          const prev = blocks[dateKey][hour] || 0;
          blocks[dateKey][hour] = Math.min(cap, prev + docUnits);
        }
      });

      // Determine fully blocked dates (all 24 hours have blockedUnits >= cap)
      if (cap > 0) {
        Object.keys(blocks).forEach((dateKey) => {
          let allHoursBlocked = true;
          for (let hour = 0; hour < 24; hour++) {
            if ((blocks[dateKey][hour] || 0) < cap) {
              allHoursBlocked = false;
              break;
            }
          }
          if (allHoursBlocked) {
            fullyBlocked[dateKey] = true;
          }
        });
      }

      setBlockedSlots(blocks);
      setFullyBlockedDates(fullyBlocked);
    });
    return () => unsubscribe();
  }, [roomId, totalRoomUnits]);

  // Update max selectable rooms based on selected date and availability
  useEffect(() => {
    if (!selectedDate) {
      setMaxSelectableRooms(1);
      setAvailabilityError('');
      return;
    }
    
    const maxAvailable = getMaxAvailableRoomsForDateTime(selectedDate, FIXED_CHECK_IN_HOUR);
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
  }, [selectedDate, bookedDates, blockedSlots, totalRoomUnits, selectedRoomQuantity]);

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

  const BOOKING_DURATION_HOURS = 22;

  const areRoomsAvailableForDateTime = (date, startHour, requiredRooms) => {
    if (!date) return false;
    if (totalRoomUnits <= 0) return false;
    if (requiredRooms > totalRoomUnits) return false;
    
    for (let offset = 0; offset < BOOKING_DURATION_HOURS; offset++) {
      const d = new Date(date);
      d.setHours(startHour + offset, 0, 0, 0);
      const dateKey = toLocalDateKey(d);
      const hour = d.getHours();
      const blockedUnits = blockedSlots[dateKey]?.[hour] ?? 0;
      const bookingDateKey = d.toDateString();
      const bookedCount = bookedDates[bookingDateKey]?.times?.[`${hour}:00`] || 0;
      if (bookedCount + blockedUnits + requiredRooms > totalRoomUnits) return false;
    }
    return true;
  };

  const getMaxAvailableRoomsForDateTime = (date, startHour) => {
    if (!date || totalRoomUnits <= 0) return 0;
    
    let maxRooms = totalRoomUnits;
    for (let offset = 0; offset < BOOKING_DURATION_HOURS; offset++) {
      const d = new Date(date);
      d.setHours(startHour + offset, 0, 0, 0);
      const dateKey = toLocalDateKey(d);
      const hour = d.getHours();
      const blockedUnits = blockedSlots[dateKey]?.[hour] ?? 0;
      const bookingDateKey = d.toDateString();
      const bookedCount = bookedDates[bookingDateKey]?.times?.[`${hour}:00`] || 0;
      const available = totalRoomUnits - bookedCount - blockedUnits;
      maxRooms = Math.min(maxRooms, available);
      if (maxRooms <= 0) return 0;
    }
    return maxRooms;
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
    // Keep the date clickable even if the stay overlaps a blocked next day.
    // Booking validation will run when the guest proceeds.
    return true;
  };

  const isDateFullyBooked = (date) => {
    if (!date) return false;
    // Fully booked should be based on check-in window availability (2:00 PM onwards).
    // This indicates guest-reservation saturation (admin blocks are handled separately).
    for (let hour = FIXED_CHECK_IN_HOUR; hour < 24; hour++) {
      const d = new Date(date);
      d.setHours(hour, 0, 0, 0);
      const bookingDateKey = d.toDateString();
      const bookedCount = bookedDates[bookingDateKey]?.times?.[`${hour}:00`] || 0;
      if (bookedCount < totalRoomUnits) return false;
    }
    return true;
  };

  const isDateFullyBlockedByAdmin = (date) => {
    if (!date) return false;
    const dateKey = toLocalDateKey(date);
    return fullyBlockedDates[dateKey] === true;
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

  const hasAnyHourFullyAdminUnavailable = (date) => {
    if (!date || totalRoomUnits <= 0) return false;
    const dateKey = toLocalDateKey(date);
    const day = blockedSlots[dateKey];
    if (!day) return false;
    for (let h = 0; h < 24; h++) {
      if ((day[h] || 0) >= totalRoomUnits) return true;
    }
    return false;
  };

  const handleDateSelect = (date) => {
    if (!isDateSelectable(date)) return;
    setSelectedDate(date);
    // Always allow selecting the fixed check-in time; validate full stay on proceed.
    setSelectedTime(fixedTimeSlot.display);
    setTimeSelectionError('');
  };

  const handleRoomQuantityChange = (quantity) => {
    const newQuantity = Math.min(Math.max(1, quantity), maxSelectableRooms);
    setSelectedRoomQuantity(newQuantity);
    
    if (selectedDate) {
      if (!areRoomsAvailableForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, newQuantity)) {
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

  const handleProceed = () => {
    if (selectedDate && selectedTime && selectedRoomQuantity > 0) {
      // Validate full stay window before proceeding. This prevents bookings that overlap
      // admin-blocked dates (e.g., booking April 11 would extend into April 12).
      const ok = areRoomsAvailableForDateTime(selectedDate, FIXED_CHECK_IN_HOUR, selectedRoomQuantity);
      if (!ok) {
        const blockedDate = (() => {
          for (let offset = 0; offset < BOOKING_DURATION_HOURS; offset++) {
            const d = new Date(selectedDate);
            d.setHours(FIXED_CHECK_IN_HOUR + offset, 0, 0, 0);
            const dateKey = toLocalDateKey(d);
            const hour = d.getHours();
            const blockedUnits = blockedSlots[dateKey]?.[hour] ?? 0;
            if (blockedUnits >= totalRoomUnits) {
              return new Date(d.getFullYear(), d.getMonth(), d.getDate());
            }
          }
          return null;
        })();

        if (blockedDate) {
          setTimeSelectionError(
            `Cannot book this date because the resort is unavailable on ${blockedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
          );
        } else {
          setTimeSelectionError(
            `Cannot book this date because the selected stay period is not available. Please choose a different date or reduce the number of rooms.`
          );
        }
        return;
      }

      const checkInDateTime = new Date(selectedDate);
      checkInDateTime.setHours(FIXED_CHECK_IN_HOUR, 0, 0, 0);
      
      const checkOutDateTime = new Date(selectedDate);
      checkOutDateTime.setDate(checkOutDateTime.getDate() + 1);
      checkOutDateTime.setHours(FIXED_CHECK_OUT_HOUR, 0, 0, 0);
      
      router.push(
        `/rooms/booking?roomId=${roomId}&roomType=${encodeURIComponent(roomType)}&price=${price}&maxCapacity=${maxCapacity}&totalRooms=${roomDetails?.totalRooms ?? totalRoomUnits}&checkIn=${checkInDateTime.toISOString()}&checkOut=${checkOutDateTime.toISOString()}&numberOfRooms=${selectedRoomQuantity}&specialRequest=${encodeURIComponent(specialRequest)}`
      );
    }
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
          <div className="flex flex-col lg:flex-row gap-8 items-stretch">
            {/* Left Column - Calendar */}
            <div className="lg:w-[60%] flex">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden w-full flex flex-col">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-6 py-4 flex-shrink-0">
                  <h1 className="text-2xl font-bold text-white">Select Check-in Date</h1>
                  <p className="text-white/80 text-sm mt-1">{roomType} - ₱{parseInt(price).toLocaleString()}/night</p>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-6 flex-shrink-0">
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
                      <h2 className="text-lg font-semibold text-textPrimary px-3">
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

                  <div className="flex-1 flex flex-col">
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
                        const showHasUnavailableSlotsDot =
                          !isPast &&
                          !isTooSoon &&
                          !isFullyBooked &&
                          !isFullyBlockedByAdmin &&
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
                  </div>

                  <div className="mt-6 pt-4 border-t border-ocean-light/10 flex justify-center gap-6 text-xs flex-shrink-0 flex-wrap">
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

            {/* Right Column */}
            <div className="lg:w-[40%] flex">
              <div className="w-full flex flex-col gap-6">
                {/* Room Card */}
                <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 overflow-hidden flex-shrink-0">
                  <div className="relative h-56 bg-gradient-to-br from-ocean-pale to-ocean-ice overflow-hidden">
                    {roomDetails?.images && roomDetails.images[0] ? (
                      <Image
                        src={roomDetails.images[0]}
                        alt={roomType}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <i className="fas fa-hotel text-5xl text-ocean-light/30"></i>
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <h3 className="font-bold text-textPrimary text-xl mb-2">{roomType}</h3>
                    <div className="mb-4">
                      <p className="text-2xl font-bold text-ocean-mid">
                        ₱{parseInt(price).toLocaleString()}
                        <span className="text-sm font-normal text-textSecondary">/night</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-textSecondary mb-4">
                      <i className="fas fa-users text-ocean-light"></i>
                      <span className="text-sm">{getCapacityDisplay()}</span>
                    </div>
                    <div className="bg-ocean-ice rounded-lg p-3 mb-4">
                      <p className="text-sm font-semibold text-textPrimary mb-2">
                        <i className="fas fa-calendar-check text-ocean-mid mr-2"></i>
                        Selected Schedule
                      </p>
                      {selectedDate ? (
                        <>
                          <p className="text-base font-semibold text-textPrimary">
                            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          </p>
                          <p className="text-sm text-ocean-mid font-medium mt-2">
                            <i className="fas fa-clock mr-2"></i>
                            Check-in: {FIXED_CHECK_IN_DISPLAY}
                          </p>
                          <p className="text-xs text-textSecondary mt-1">
                            Check-out: {FIXED_CHECK_OUT_DISPLAY} (next day)
                          </p>
                        </>
                      ) : (
                        <p className="text-base font-semibold text-textPrimary">No date selected</p>
                      )}
                    </div>
                    <button
                      onClick={handleProceed}
                      disabled={!selectedDate || !selectedTime || selectedRoomQuantity < 1}
                      className={`w-full py-3 rounded-lg font-semibold text-base transition-all duration-300 ${
                        selectedDate && selectedTime && selectedRoomQuantity >= 1
                          ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg hover:-translate-y-0.5'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Proceed to Booking
                    </button>
                  </div>
                </div>

                {/* Available Check-in Times */}
                {selectedDate ? (
                  <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 p-5">
                    <h3 className="text-base font-semibold text-textPrimary mb-4 flex items-center gap-2">
                      <i className="fas fa-clock text-ocean-light"></i>
                      Check-in Time
                    </h3>
                    <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">
                        <i className="fas fa-info-circle mr-2"></i>
                        <strong>Fixed Check-in Time: 2:00 PM</strong>
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Check-out time is fixed at 12:00 PM (noon) the following day.
                        You may submit a request for earlier check-in in the Special Request field below.
                      </p>
                    </div>
                    {timeSelectionError && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-700">
                          <i className="fas fa-exclamation-triangle mr-1"></i>
                          {timeSelectionError}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2">
                      {(() => {
                        const isAvailable = areRoomsAvailableForDateTime(selectedDate, fixedTimeSlot.hour, selectedRoomQuantity);
                        const isSelectedTime = selectedTime === fixedTimeSlot.display;
                        
                        return (
                          <div
                            className={`py-3 px-4 rounded-lg text-center text-sm font-medium transition-all duration-200 ${
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
                  <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 p-8 text-center flex-1 flex flex-col items-center justify-center">
                    <i className="fas fa-calendar-day text-4xl text-ocean-light/40 mb-3 block"></i>
                    <p className="text-textSecondary text-sm">Select a date first</p>
                    <p className="text-textSecondary text-xs mt-1">to see available check-in times</p>
                  </div>
                )}

                {/* Room Quantity Selection Container */}
                {selectedDate && (
                  <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 p-5">
                    <h3 className="text-base font-semibold text-textPrimary mb-4 flex items-center gap-2">
                      <i className="fas fa-door-open text-ocean-light"></i>
                      Room Quantity
                    </h3>
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-textPrimary mb-2">
                        Number of Rooms to Book
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleRoomQuantityChange(selectedRoomQuantity - 1)}
                          disabled={selectedRoomQuantity <= 1}
                          className="w-10 h-10 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          -
                        </button>
                        <span className="text-xl font-bold text-textPrimary min-w-[50px] text-center">
                          {selectedRoomQuantity}
                        </span>
                        <button
                          onClick={() => handleRoomQuantityChange(selectedRoomQuantity + 1)}
                          disabled={selectedRoomQuantity >= maxSelectableRooms}
                          className="w-10 h-10 rounded-lg border border-ocean-light/20 text-ocean-mid font-bold text-lg hover:bg-ocean-ice disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          +
                        </button>
                      </div>
<div className="mt-2">
  {selectedDate && (
    <p className={`text-xs ${
      maxSelectableRooms > 0 ? 'text-textSecondary' : 'text-red-600'
    }`}>
      {maxSelectableRooms > 0 ? (
        `${maxSelectableRooms} room(s) available for ${selectedDate.toDateString()} at 2:00 PM check-in`
      ) : (
        `Booking not allowed due to resort unavailability on ${
          new Date(selectedDate.getTime() + 86400000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        }`
      )}
    </p>
  )}
</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-textPrimary mb-2">
                        Special Request
                      </label>
                      <textarea
                        value={specialRequest}
                        onChange={(e) => setSpecialRequest(e.target.value)}
                        placeholder="e.g., Request early check-in, room preference, special occasion, etc."
                        rows="3"
                        className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light resize-none"
                      />
                      <p className="text-xs text-textSecondary mt-1">
                        <i className="fas fa-clock mr-1"></i>
                        Note: Check-in time is fixed at 2:00 PM. If you need early check-in, please specify your requested time here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </GuestLayout>
  );
}