// app/day-tour/calendar/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';

export default function DayTourCalendar() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayTour, setDayTour] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [remainingCapacityForSelected, setRemainingCapacityForSelected] = useState(null);
  const [unavailableDates, setUnavailableDates] = useState({});

  // Helper function to convert Date to YYYY-MM-DD local date string
  const toLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        unavailable[dateKey] = Number(data.unavailableGuests || 0);
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
        const dateKey = booking.selectedDate;
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
  }, [selectedDate, dayTour, bookedDates]);

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
    
    // Check if there's remaining capacity
    const remainingCapacity = getRemainingCapacity(date);
    return remainingCapacity > 0;
  };

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };
  
  // Check if date is tomorrow (not bookable)
  const isDateTomorrow = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.getTime() === tomorrow.getTime();
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
  };
  
  const handleProceedToBooking = () => {
    if (selectedDate) {
      const dateKey = selectedDate.toISOString();
      router.push(`/day-tour/booking?date=${encodeURIComponent(dateKey)}`);
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
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white py-8">
        <div className="max-w-7xl w-full mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-6 items-stretch">
            {/* Left Column - Select Date Calendar (60%) */}
            <div className="lg:w-[60%] flex">
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden w-full flex flex-col">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3 flex-shrink-0">
                  <h1 className="text-xl font-bold text-white">Select Your Day Tour Date</h1>
                  <p className="text-white/80 text-sm mt-0.5">
                    Choose a date for your day tour experience
                  </p>
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  {/* Month Navigation */}
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
                      <h2 className="text-base font-semibold text-textPrimary px-2">
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

                  {/* Calendar Grid */}
                  <div className="flex-1 flex flex-col">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="text-center font-semibold text-textSecondary text-xs py-1">
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1 flex-1">
                      {days.map((day, index) => {
                        if (!day) return <div key={index} className="aspect-square"></div>;

                        const dateKey = toLocalDateKey(day);
                        const isPast = isDatePast(day);
                        const isTomorrow = isDateTomorrow(day);
                        const isFullyBooked = !isPast && !isTomorrow && getRemainingCapacity(day) <= 0;
                        const isSelectable = isDateSelectable(day);
                        const isSelected = selectedDate && selectedDate.toDateString() === day.toDateString();
                        const remainingCapacity = getRemainingCapacity(day);

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
                        } else if (isTomorrow) {
                          bgColor = 'bg-gray-100';
                          textColor = 'text-gray-400';
                          borderClass = 'border border-gray-200';
                          cursorClass = 'cursor-not-allowed';
                          titleText = 'Cannot book for tomorrow (must book at least 1 day in advance)';
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
                        } else if (isSelectable) {
                          hoverClass = 'hover:bg-ocean-ice';
                          titleText = `${remainingCapacity} slot(s) available`;
                        } else {
                          bgColor = 'bg-gray-100';
                          textColor = 'text-gray-400';
                          borderClass = 'border border-gray-200';
                          cursorClass = 'cursor-not-allowed';
                          titleText = 'Not available';
                        }

                        return (
                          <button
                            key={index}
                            onClick={() => handleDateSelect(day)}
                            disabled={!isSelectable}
                            title={titleText}
                            className={`w-full pt-[100%] relative rounded-lg transition-all duration-200 ${bgColor} ${borderClass} ${hoverClass} ${cursorClass}`}
                          >
                            <span className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${textColor}`}>
                              {day.getDate()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="mt-5 pt-3 border-t border-ocean-light/10 flex justify-center gap-4 text-xs flex-shrink-0 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-white border border-gray-300 rounded"></div>
                      <span className="text-textSecondary">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                      <span className="text-textSecondary">Fully Booked</span>
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
            </div>

            {/* Right Column - Day Tour Pricing + Maximum Capacity (40%) */}
            <div className="lg:w-[40%] flex">
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
          </div>
        </div>

      )}
    </GuestLayout>
  );
}