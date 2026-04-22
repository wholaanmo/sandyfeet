// app/day-tour/calendar/page.js
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';

function DayTourCalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const HARD_MAX_PACKS = 38;
  
  // Read date from URL if available
  const initialDateStr = searchParams.get('date');
  let initialDate = new Date();
  if (initialDateStr) {
    // Parse YYYY-MM-DD explicitly to avoid timezone shift
    const parts = initialDateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      initialDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      initialDate = new Date(initialDateStr);
    }
  }
  
  const initialAdults = parseInt(searchParams.get('adults')) || 1;
  const initialKids = parseInt(searchParams.get('kids')) || 0;
  const initialAdultsClamped = Math.max(1, Math.min(HARD_MAX_PACKS, initialAdults));
  const initialKidsClamped = Math.max(0, Math.min(HARD_MAX_PACKS - initialAdultsClamped, initialKids));
  
  const [currentDate, setCurrentDate] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(initialDateStr ? initialDate : null);
  const [adults, setAdults] = useState(initialAdultsClamped);
  const [kids, setKids] = useState(initialKidsClamped);
  const [loading, setLoading] = useState(true);
  const [dayTour, setDayTour] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [remainingCapacityForSelected, setRemainingCapacityForSelected] = useState(null);
  const [unavailableDates, setUnavailableDates] = useState({});
  const maxAllowedGuests = HARD_MAX_PACKS;
  const requestedGuests = adults + kids;

  // Helper function to convert Date to YYYY-MM-DD local date string
  const toLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeBookingDateKey = (rawDate) => {
    if (!rawDate) return null;

    if (typeof rawDate === 'string') {
      const maybeKey = rawDate.split('T')[0];
      const parts = maybeKey.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return maybeKey;
      }

      const parsedDate = new Date(rawDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        return toLocalDateKey(parsedDate);
      }
      return null;
    }

    if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
      const parsedDate = rawDate.toDate();
      if (!Number.isNaN(parsedDate.getTime())) {
        return toLocalDateKey(parsedDate);
      }
    }

    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
      return toLocalDateKey(rawDate);
    }

    return null;
  };

  // Real-time listener for day tour updates from admin
  useEffect(() => {
    const toursRef = collection(db, 'dayTours');
    const q = query(toursRef, where('archived', '!=', true));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const toursList = [];
      querySnapshot.forEach((doc) => {
        toursList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setDayTour(toursList[0] || null);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching day tour:', error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Real-time listener for admin-unavailable dates
  useEffect(() => {
    const unavailableRef = collection(db, 'daytour_unavailable_dates');
    
    const unsubscribe = onSnapshot(unavailableRef, (querySnapshot) => {
      const unavailable = {};
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.date;
        unavailable[dateKey] = (unavailable[dateKey] || 0) + Number(data.unavailableGuests || 0);
      });
      setUnavailableDates(unavailable);
    }, (error) => {
      console.error('Error fetching unavailable dates:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Real-time listener for day tour bookings to track capacity usage
  useEffect(() => {
    if (!dayTour) return;

    const bookingsRef = collection(db, 'dayTourBookings');
    const q = query(
      bookingsRef,
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const booked = {};
      querySnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const dateKey = normalizeBookingDateKey(booking.selectedDate || booking.selectedDateISO);
        if (dateKey) {
          if (!booked[dateKey]) {
            booked[dateKey] = 0;
          }
          // Sum up total guests for this date
          const totalGuests = (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
          booked[dateKey] += totalGuests;
        }
      });
      setBookedDates(booked);
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
    });
    
    return () => unsubscribe();
  }, [dayTour]);

  // Update remaining capacity when selected date changes
  useEffect(() => {
    if (selectedDate && dayTour) {
      const remaining = getRemainingCapacity(selectedDate);
      setRemainingCapacityForSelected(remaining);
    } else {
      setRemainingCapacityForSelected(null);
    }
  }, [selectedDate, dayTour, bookedDates, unavailableDates]);

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

  const getRemainingCapacity = (date) => {
    if (!dayTour?.maxCapacity) return Infinity;
    const dateKey = toLocalDateKey(date);
    const bookedCount = bookedDates[dateKey] || 0;
    const unavailableGuestCount = unavailableDates[dateKey] || 0;
    return dayTour.maxCapacity - (bookedCount + unavailableGuestCount);
  };

  // Check if date is selectable (not past, not fully booked, and at least 1 day in advance)
  const isDateSelectable = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Cannot book past dates
    if (date < today) return false;
    
    // Cannot book for next day (must be at least 1 day in advance)
    const minBookableDate = new Date();
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    minBookableDate.setHours(0, 0, 0, 0);
    if (date < minBookableDate) return false;
    
    // Check if remaining capacity can fit selected guests
    const remainingCapacity = getRemainingCapacity(date);
    return remainingCapacity >= requestedGuests;
  };

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };
  
  // Check if date is within lead-time window (not bookable yet)
  const isDateTooSoon = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBookableDate = new Date(today);
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    return date < minBookableDate && date >= today;
  };

  // Format selected date for display
  const formatSelectedDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDateSelect = (date) => {
    if (!isDateSelectable(date)) return;
    setSelectedDate(date);
    setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const formatInputDate = (date) => {
    if (!date) return 'mm/dd/yyyy';
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  const handleGoToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    if (isDateSelectable(today)) {
      setSelectedDate(today);
    }
  };
  
  const handleProceedToBooking = () => {
    if (selectedDate) {
      const totalGuests = adults + kids;
      if (totalGuests > maxAllowedGuests) {
        alert(`Maximum packs is ${maxAllowedGuests}.`);
        return;
      }
      if (remainingCapacityForSelected !== null && totalGuests > remainingCapacityForSelected) {
        alert(`Cannot proceed. You selected ${totalGuests} guests, but only ${remainingCapacityForSelected} slot(s) are available.`);
        return;
      }
      const dateKey = toLocalDateKey(selectedDate);
      router.push(`/day-tour/booking?date=${encodeURIComponent(dateKey)}&adults=${adults}&kids=${kids}`);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goBack = () => {
    router.push('/day-tour');
  };

  const handleAdultsChange = (value) => {
    const parsed = parseInt(value, 10);
    const nextAdults = Math.max(1, Math.min(maxAllowedGuests, Number.isNaN(parsed) ? 1 : parsed));
    const maxKidsForAdults = Math.max(0, maxAllowedGuests - nextAdults);
    setAdults(nextAdults);
    setKids((prev) => Math.min(prev, maxKidsForAdults));
  };

  const handleKidsChange = (value) => {
    const parsed = parseInt(value, 10);
    const maxKidsForAdults = Math.max(0, maxAllowedGuests - adults);
    const nextKids = Math.max(0, Math.min(maxKidsForAdults, Number.isNaN(parsed) ? 0 : parsed));
    setKids(nextKids);
  };

  useEffect(() => {
    if (adults > maxAllowedGuests) {
      setAdults(maxAllowedGuests);
      setKids(0);
      return;
    }

    const totalGuests = adults + kids;
    if (totalGuests > maxAllowedGuests) {
      setKids(Math.max(0, maxAllowedGuests - adults));
    }
  }, [adults, kids, maxAllowedGuests]);

  useEffect(() => {
    if (!selectedDate) return;
    const remaining = getRemainingCapacity(selectedDate);
    if (remaining < requestedGuests) {
      setSelectedDate(null);
      setRemainingCapacityForSelected(null);
    }
  }, [selectedDate, requestedGuests, bookedDates, unavailableDates, dayTour]);

  const days = getDaysInMonth(currentDate);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (loading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </GuestLayout>
    );
  }

  if (!dayTour) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <div className="text-center">
            <i className="fas fa-umbrella-beach text-5xl text-ocean-light/40 mb-4"></i>
            <h2 className="text-2xl font-bold text-textPrimary mb-2">Day Tour Unavailable</h2>
            <p className="text-textSecondary">No day tour package is currently available.</p>
            <button
              onClick={() => router.push('/day-tour')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-lg"
            >
              Go Back
            </button>
          </div>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white pt-24 pb-8">
        <div className="max-w-7xl w-full mx-auto px-4">
          {/* Reordered: Right column (Pricing) now comes BEFORE Left column (Calendar) */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {/* Right Column - Day Tour Pricing + Maximum Capacity (40%) - NOW ON THE RIGHT */}
            <div className="lg:w-[40%] flex order-2 lg:order-2">
              <div className="w-full flex flex-col gap-3">
                {/* Day Tour Pricing Container - reduced padding */}
                <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-2">
                    <h3 className="font-semibold text-white text-base flex items-center gap-2">
                      <i className="fas fa-tag"></i>
                      Day Tour Pricing
                    </h3>
                  </div>
                  
                  <div className="p-4 space-y-3">
                    {/* Selected Schedule Section */}
                    <div className="bg-ocean-ice rounded-lg p-2">
                      <h4 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-1 flex items-center gap-1">
                        <i className="fas fa-calendar-check text-ocean-light text-xs"></i>
                        Selected Schedule
                      </h4>
                      <p className="text-sm font-semibold text-textPrimary">
                        {selectedDate ? formatSelectedDate(selectedDate) : 'No date selected'}
                      </p>
                    </div>

                    {/* Guest Count (Packs/Pax) */}
                    <div>
                      <h4 className="text-xs font-semibold text-textPrimary mb-1 flex items-center gap-1">
                        <i className="fas fa-user-friends text-ocean-light text-xs"></i>
                        Number of Guests (Pax)
                      </h4>
                      <div className="flex gap-3">
                        <div className="flex-1 bg-ocean-ice rounded-lg p-2 border border-ocean-light/20 flex flex-col justify-between">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-textSecondary mb-1 text-center">Adults (16+)</label>
                          <input 
                            type="number" 
                            min="1" 
                            max={maxAllowedGuests}
                            value={adults} 
                            onChange={(e) => handleAdultsChange(e.target.value)} 
                            className="w-full bg-white rounded text-sm p-1 text-center font-bold text-ocean-mid outline-none border border-transparent focus:border-ocean-light"
                          />
                        </div>
                        <div className="flex-1 bg-ocean-ice rounded-lg p-2 border border-ocean-light/20 flex flex-col justify-between">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-textSecondary mb-1 text-center">Kids (15-)</label>
                          <input 
                            type="number" 
                            min="0" 
                            max={Math.max(0, maxAllowedGuests - adults)}
                            value={kids} 
                            onChange={(e) => handleKidsChange(e.target.value)} 
                            className="w-full bg-white rounded text-sm p-1 text-center font-bold text-ocean-mid outline-none border border-transparent focus:border-ocean-light"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Pricing Details */}
                    <div>
                      <h4 className="text-xs font-semibold text-textPrimary mb-1 flex items-center gap-1">
                        <i className="fas fa-coins text-ocean-light text-xs"></i>
                        Rates
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-ocean-ice rounded-lg p-1.5">
                          <p className="text-xs text-textSecondary">Adult (16+)</p>
                          <p className="text-sm font-bold text-ocean-mid">₱{dayTour.adultPrice?.toLocaleString()}</p>
                        </div>
                        <div className="bg-ocean-ice rounded-lg p-1.5">
                          <p className="text-xs text-textSecondary">Kid (15-)</p>
                          <p className="text-sm font-bold text-ocean-mid">₱{dayTour.kidPrice?.toLocaleString()}</p>
                        </div>
                        <div className="bg-ocean-ice rounded-lg p-1.5">
                          <p className="text-xs text-textSecondary">Senior</p>
                          <p className="text-sm font-bold text-ocean-mid">₱{dayTour.seniorPrice?.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {/* Inclusions */}
                    {dayTour.inclusions && dayTour.inclusions.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-textPrimary mb-1 flex items-center gap-1">
                          <i className="fas fa-check-circle text-green-600 text-xs"></i>
                          Inclusions
                        </h4>
                        <ul className="space-y-1">
                          {dayTour.inclusions.map((item, idx) => (
                            <li key={idx} className="text-xs text-textSecondary flex items-start gap-1.5">
                              <i className="fas fa-check text-ocean-light text-[10px] mt-0.5"></i>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Description */}
                    {dayTour.description && (
                      <div>
                        <h4 className="text-xs font-semibold text-textPrimary mb-1 flex items-center gap-1">
                          <i className="fas fa-info-circle text-ocean-light text-xs"></i>
                          Description
                        </h4>
                        <p className="text-xs text-textSecondary leading-relaxed">
                          {dayTour.description}
                        </p>
                      </div>
                    )}

                    {/* Proceed to Booking Button */}
                    <div className="pt-2 border-t border-ocean-light/10">
                      <button
                        onClick={handleProceedToBooking}
                        disabled={!selectedDate}
                        className={`w-full py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                          selectedDate
                            ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg hover:-translate-y-0.5'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <i className="fas fa-calendar-check mr-1"></i>
                        Proceed to Booking
                      </button>
                      {!selectedDate && (
                        <p className="text-xs text-textSecondary text-center mt-1">
                          Select a date to continue
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Maximum Capacity Display - reduced padding and smaller text */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-3">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-amber-200">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <i className="fas fa-users text-amber-600 text-sm"></i>
                      </div>
                      <div>
                        <p className="text-[10px] text-amber-700 uppercase tracking-wide font-semibold">
                          Maximum Capacity
                        </p>
                        <p className="text-lg font-bold text-amber-800">
                          {dayTour.maxCapacity} <span className="text-xs font-normal">guests</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Remaining Capacity for Selected Date */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <i className="fas fa-chart-line text-green-600 text-sm"></i>
                      </div>
                      <div>
                        <p className="text-[10px] text-green-700 uppercase tracking-wide font-semibold">
                          Remaining Capacity
                        </p>
                        {selectedDate ? (
                          <p className="text-lg font-bold text-green-700">
                            {remainingCapacityForSelected !== null ? remainingCapacityForSelected : '--'} <span className="text-xs font-normal">guests</span>
                          </p>
                        ) : (
                          <p className="text-xs text-green-600">Select a date to view</p>
                        )}
                      </div>
                    </div>
                    {selectedDate && remainingCapacityForSelected !== null && remainingCapacityForSelected <= 10 && remainingCapacityForSelected > 0 && (
                      <div className="bg-gray-100 rounded-lg px-2 py-0.5">
                        <p className="text-[10px] text-gray-700 font-semibold">Limited Slots</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Left Column - Select Date Calendar (60%) - NOW ON THE LEFT */}
            <div className="lg:w-[60%] flex order-1 lg:order-1">
              <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 w-full p-4 sm:p-5 flex flex-col">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-slate-800 mb-2">Date</p>
                  <div className="w-full h-[54px] rounded-2xl border border-blue-200 bg-white shadow-[0_4px_10px_rgba(37,99,235,0.12)] px-4 flex items-center justify-between text-left">
                    <span className="flex items-center gap-2.5">
                      <i className="fas fa-calendar text-blue-600 text-base"></i>
                      <span className={`text-lg leading-none ${selectedDate ? 'text-gray-800 font-semibold' : 'text-gray-400 font-medium'}`}>
                        {formatInputDate(selectedDate)}
                      </span>
                    </span>
                    <i className="far fa-calendar-alt text-gray-500 text-sm"></i>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/40 p-3 sm:p-4 flex-1 flex flex-col min-h-[360px]">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={goToPreviousMonth}
                      className="w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-600 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      aria-label="Previous month"
                    >
                      <i className="fas fa-chevron-left text-xs"></i>
                    </button>
                    <h3 className="text-base font-bold text-textPrimary">
                      {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </h3>
                    <button
                      onClick={goToNextMonth}
                      className="w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-600 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      aria-label="Next month"
                    >
                      <i className="fas fa-chevron-right text-xs"></i>
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-400 py-1">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 auto-rows-[48px]">
                    {days.map((day, index) => {
                      if (!day) return <div key={index} className="h-12"></div>;

                      const isPast = isDatePast(day);
                      const isTooSoon = isDateTooSoon(day);
                      const remainingCapacity = getRemainingCapacity(day);
                      const isFullyBooked = !isPast && !isTooSoon && remainingCapacity <= 0;
                      const isInsufficientForParty = !isPast && !isTooSoon && remainingCapacity > 0 && remainingCapacity < requestedGuests;
                      const isSelected = selectedDate && selectedDate.toDateString() === day.toDateString();
                      const isSelectable = isDateSelectable(day);

                      let buttonClass = 'bg-white border border-gray-200 text-slate-700';
                      let hoverClass = 'hover:border-blue-300 hover:text-blue-600';

                      if (isPast || isTooSoon) {
                        buttonClass = 'bg-gray-100 border border-gray-100 text-gray-300';
                        hoverClass = '';
                      } else if (isFullyBooked || isInsufficientForParty) {
                        buttonClass = 'bg-gray-100 border border-gray-100 text-gray-400';
                        hoverClass = '';
                      } else if (isSelected) {
                        buttonClass = 'bg-blue-600 border border-blue-600 text-white shadow-md';
                        hoverClass = '';
                      }

                      const titleText = isPast
                        ? 'Past date'
                        : isTooSoon
                          ? 'Cannot book on same day/next day'
                          : isFullyBooked
                            ? 'Fully booked by reservations/admin block'
                            : isInsufficientForParty
                              ? `Not enough slots for ${requestedGuests} guest(s)`
                              : `${remainingCapacity} slot(s) available`;

                      return (
                        <button
                          key={index}
                          onClick={() => handleDateSelect(day)}
                          disabled={!isSelectable}
                          title={titleText}
                          className={`h-12 rounded-lg text-sm font-semibold transition-all ${buttonClass} ${hoverClass} ${!isSelectable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                    Past / Too Soon
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    Not Available
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Selected
                  </span>
                </div>

                <div className="mt-5 border-t border-gray-100 pt-4 flex justify-between items-center gap-3">
                  <button
                    onClick={goBack}
                    className="px-5 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-semibold text-sm"
                  >
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGoToday}
                      className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
                    >
                      Today
                    </button>
                    <button
                      onClick={handleProceedToBooking}
                      disabled={!selectedDate}
                      className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                        selectedDate
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Confirm Dates
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GuestLayout>
  );
}

const DayTourCalendar = () => {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center"><i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i></div>}>
      <DayTourCalendarContent />
    </Suspense>
  );
};

export default DayTourCalendar;