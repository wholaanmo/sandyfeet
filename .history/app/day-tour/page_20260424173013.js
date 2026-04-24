// app/day-tour/page.js
'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '../guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import ActivityCard from '@/components/guest/ActivityCard';

export default function DayTourPage() {
  const router = useRouter();
  const HARD_MAX_PACKS = 38;
  const [date, setDate] = useState('');
  const [adults, setAdults] = useState('1');
  const [kids, setKids] = useState('0');
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [dayTour, setDayTour] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [unavailableDates, setUnavailableDates] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [hoveredDateKey, setHoveredDateKey] = useState('');
  const [dateError, setDateError] = useState('');
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);
  const maxAllowedGuests = HARD_MAX_PACKS;
  const adultsCount = Number.isNaN(parseInt(adults, 10)) ? 0 : parseInt(adults, 10);
  const kidsCount = Number.isNaN(parseInt(kids, 10)) ? 0 : parseInt(kids, 10);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const toLocalDateKey = (targetDate) => {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateKey = (value) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const formatInputDate = (value) => {
    if (!value) return 'mm/dd/yyyy';
    const parsedDate = parseDateKey(value);
    if (!parsedDate) return 'mm/dd/yyyy';
    return parsedDate.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  const formatLongDate = (value) => {
    const parsedDate = parseDateKey(value);
    if (!parsedDate) return '';
    return parsedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
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

  const getDaysInMonth = (targetDate) => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const isDatePast = (targetDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return targetDate < today;
  };

  const isDateTooSoon = (targetDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBookableDate = new Date(today);
    minBookableDate.setDate(minBookableDate.getDate() + 2);
    return targetDate < minBookableDate && targetDate >= today;
  };

  const getRemainingCapacity = (targetDate) => {
    if (!dayTour?.maxCapacity) return Infinity;
    const dateKey = toLocalDateKey(targetDate);
    const bookedCount = bookedDates[dateKey] || 0;
    const unavailableCount = unavailableDates[dateKey] || 0;
    return dayTour.maxCapacity - (bookedCount + unavailableCount);
  };

  const isDateSelectable = (targetDate) => {
    if (isDatePast(targetDate)) return false;
    if (isDateTooSoon(targetDate)) return false;
    return getRemainingCapacity(targetDate) > 0;
  };

  const handleAdultsChange = (value) => {
    if (value === '') {
      setAdults('');
      return;
    }

    if (/^\d+$/.test(value)) {
      setAdults(value);
    }
  };

  const handleKidsChange = (value) => {
    if (value === '') {
      setKids('');
      return;
    }

    if (/^\d+$/.test(value)) {
      setKids(value);
    }
  };

  const handleDateSelect = (targetDate) => {
    if (!isDateSelectable(targetDate)) return;
    setDate(toLocalDateKey(targetDate));
    setHoveredDateKey('');
    setCurrentMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    setDateError('');
    setIsCalendarOpen(false);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const queryDate = params.get('date');
    const queryAdults = params.get('adults');
    const queryKids = params.get('kids');

    if (!queryDate && !queryAdults && !queryKids) return;

    const parsedAdults = parseInt(queryAdults || '', 10);
    const parsedKids = parseInt(queryKids || '', 10);

    const nextAdults = Number.isNaN(parsedAdults) ? 1 : Math.max(0, parsedAdults);
    const nextKids = Number.isNaN(parsedKids) ? 0 : Math.max(0, parsedKids);

    setAdults(String(nextAdults));
    setKids(String(nextKids));

    if (queryDate) {
      const parsedDate = parseDateKey(queryDate);
      if (parsedDate) {
        setDate(toLocalDateKey(parsedDate));
        setCurrentMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
      }
    }
  }, []);

  // Fetch activities - SHOW ALL non-archived activities
  useEffect(() => {
    const activitiesRef = collection(db, 'activities');
    const activitiesQuery = query(activitiesRef, where('archived', '==', false), orderBy('createdAt', 'desc'));
    
    const unsubscribeActivities = onSnapshot(activitiesQuery, (querySnapshot) => {
      const activitiesList = [];
      querySnapshot.forEach((docSnap) => {
        activitiesList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setActivities(activitiesList);
      setLoadingActivities(false);
    }, (error) => {
      console.error('Error fetching activities:', error);
      setLoadingActivities(false);
    });
    return () => unsubscribeActivities();
  }, []);

  useEffect(() => {
    const toursRef = collection(db, 'dayTours');
    const toursQuery = query(toursRef, where('archived', '==', false));

    const unsubscribeTours = onSnapshot(toursQuery, (querySnapshot) => {
      const tours = [];
      querySnapshot.forEach((docSnap) => {
        tours.push({ id: docSnap.id, ...docSnap.data() });
      });
      setDayTour(tours[0] || null);
    }, (error) => {
      console.error('Error fetching day tour:', error);
    });

    return () => unsubscribeTours();
  }, []);

  useEffect(() => {
    if (!dayTour) return;

    const bookingsRef = collection(db, 'dayTourBookings');
    const bookingsQuery = query(bookingsRef, where('status', 'in', ['pending', 'confirmed', 'check-in']));

    const unsubscribeBookings = onSnapshot(bookingsQuery, (querySnapshot) => {
      const booked = {};
      querySnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const dateKey = normalizeBookingDateKey(booking.selectedDate || booking.selectedDateISO);
        if (!dateKey) return;
        if (!booked[dateKey]) booked[dateKey] = 0;
        booked[dateKey] += (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
      });
      setBookedDates(booked);
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
    });

    return () => unsubscribeBookings();
  }, [dayTour]);

  useEffect(() => {
    const unavailableRef = collection(db, 'daytour_unavailable_dates');

    const unsubscribeUnavailable = onSnapshot(unavailableRef, (querySnapshot) => {
      const unavailable = {};
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.date) return;
        unavailable[data.date] = (unavailable[data.date] || 0) + Number(data.unavailableGuests || 0);
      });
      setUnavailableDates(unavailable);
    }, (error) => {
      console.error('Error fetching day tour unavailable dates:', error);
    });

    return () => unsubscribeUnavailable();
  }, []);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event) => {
      if (calendarPopoverRef.current?.contains(event.target)) return;
      if (calendarTriggerRef.current?.contains(event.target)) return;
      setIsCalendarOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarOpen]);

  useEffect(() => {
    if (!isCalendarOpen) {
      setHoveredDateKey('');
    }
  }, [isCalendarOpen]);

  useEffect(() => {
    if (!date) {
      setDateError('');
      return;
    }

    if (adults === '' || kids === '') {
      setDateError('');
      return;
    }

    if (adultsCount < 1) {
      setDateError('At least 1 adult is required.');
      return;
    }

    const totalGuests = adultsCount + kidsCount;
    if (adultsCount > maxAllowedGuests || kidsCount > maxAllowedGuests || totalGuests > maxAllowedGuests) {
      setDateError(`We only allow up to ${maxAllowedGuests} guests per booking.`);
      return;
    }

    const selectedDate = parseDateKey(date);
    if (!selectedDate) {
      setDateError('Invalid date selected.');
      return;
    }

    if (!isDateSelectable(selectedDate)) {
      setDateError('Selected date is unavailable from admin settings or existing bookings.');
      return;
    }

    const remaining = getRemainingCapacity(selectedDate);
    if (remaining !== Infinity && totalGuests > remaining) {
      setDateError(`Only ${remaining} slot(s) left for the selected date.`);
      return;
    }

    setDateError('');
  }, [date, adults, kids, adultsCount, kidsCount, dayTour, bookedDates, unavailableDates, maxAllowedGuests]);

  const handleBookingStart = (e) => {
    e.preventDefault();
    if (dateError) return;

    if (!date) {
      setDateError('Please select a date to proceed.');
      return;
    }

    if (adults === '' || kids === '') {
      setDateError('Please enter valid guest counts before proceeding.');
      return;
    }

    if (adultsCount < 1) {
      setDateError('At least 1 adult is required.');
      return;
    }

    const totalGuests = adultsCount + kidsCount;
    if (adultsCount > maxAllowedGuests || kidsCount > maxAllowedGuests || totalGuests > maxAllowedGuests) {
      setDateError(`We only allow up to ${maxAllowedGuests} guests per booking.`);
      return;
    }

    const selectedDate = parseDateKey(date);
    if (!selectedDate || !isDateSelectable(selectedDate)) {
      setDateError('Selected date is unavailable from admin settings or existing bookings.');
      return;
    }

    const remaining = getRemainingCapacity(selectedDate);
    if (remaining !== Infinity && totalGuests > remaining) {
      setDateError(`Only ${remaining} slot(s) left for the selected date.`);
      return;
    }

    router.push(`/day-tour/booking?date=${date}&adults=${adultsCount}&kids=${kidsCount}`);
  };

  // Display ALL activities - no filtering
  const displayedActivities = activities;

  const selectedDateObj = parseDateKey(date);
  const hoveredDateObj = parseDateKey(hoveredDateKey);
  const activePreviewDate = hoveredDateObj || selectedDateObj;
  const activePreviewDateKey = activePreviewDate ? toLocalDateKey(activePreviewDate) : '';
  const activePreviewRemaining = activePreviewDate ? getRemainingCapacity(activePreviewDate) : null;
  const isPreviewPast = activePreviewDate ? isDatePast(activePreviewDate) : false;
  const isPreviewTooSoon = activePreviewDate ? isDateTooSoon(activePreviewDate) : false;
  const isPreviewSelectable = activePreviewDate ? isDateSelectable(activePreviewDate) : false;
  const isPreviewFullyBooked = Boolean(activePreviewDate && !isPreviewPast && !isPreviewTooSoon && activePreviewRemaining <= 0);
  const isHoverPreview = Boolean(hoveredDateKey && activePreviewDateKey === hoveredDateKey);

  // Comprehensive list of all requested images
  const galleryImages = [
    '/assets/View/Front view.jpg',
    '/assets/Facilities/Pool.jpg',
    '/assets/Facilities/Bonfire.jpg',
    '/assets/Facilities/ATV.jpg',
    '/assets/View/Second floor view.jpg',
    '/assets/Facilities/Kitchen.jpg',
    '/assets/Facilities/DragonBoat.jpg',
    '/assets/Facilities/Parking.jpg',
    '/assets/Facilities/TopPoolView.jpg',
    '/assets/View/IMG3.jpg',
    '/assets/Facilities/Atv activities.jpg',
    '/assets/Facilities/GragonBoat2.jpg',
    '/assets/Facilities/Kitchen-Ihawan.jpg',
    '/assets/Facilities/Bonfire2.jpg',
    '/assets/Facilities/Pool 2.jpg',
    '/assets/Facilities/pool side.jpg',
    '/assets/Facilities/Pool side 3.jpg',
    '/assets/Facilities/Kitchen2.jpg',
    '/assets/View/FrontView.jpg',
    '/assets/View/SideBuilding.jpg',
    '/assets/View/Banner.jpg'
  ];

  const days = getDaysInMonth(currentMonth);

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#FAFAFA] pt-32 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          {/* HEADER & BOOKING SECTION */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-[0_15px_40px_rgba(0,0,0,0.04)] border border-ocean-light/20 gap-8">
            {/* Left side with dynamic description and inclusions */}
            <div className="max-w-xl">
              <span className="inline-block py-1 px-4 rounded-full bg-ocean-ice border border-ocean-light/30 text-ocean-mid text-[10px] font-bold tracking-[0.25em] uppercase mb-4">Sandyfeet Resort</span>
              <h1 className="text-4xl sm:text-5xl font-playfair font-bold text-textPrimary leading-tight">Book Your Day Tour</h1>
              
              {/* Dynamic Description from Admin */}
              {dayTour && dayTour.description && (
                <div className="mt-4">
                  <p className="text-textSecondary text-sm sm:text-base leading-relaxed">
                    {dayTour.description}
                  </p>
                </div>
              )}
              
              {/* Dynamic Inclusions from Admin */}
              {dayTour && dayTour.inclusions && dayTour.inclusions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ocean-mid mb-2">Inclusions</p>
                  <div className="flex flex-wrap gap-2">
                    {dayTour.inclusions.map((inclusion, idx) => (
                      <span key={idx} className="inline-block px-2.5 py-1 bg-ocean-ice text-ocean-mid rounded-full text-xs">
                        {inclusion}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Right side - Booking form with prices beside Proceed button */}
            <form onSubmit={handleBookingStart} className="flex flex-wrap items-end gap-4 lg:gap-6 bg-ocean-ice/30 p-4 sm:p-6 rounded-[2rem] border border-ocean-light/30">
              <div className="flex flex-col flex-1 min-w-[140px]">
                <label htmlFor="tour-date" className="text-[10px] uppercase tracking-[0.2em] font-bold text-textSecondary mb-2 pl-2">Date</label>
                <div className="relative">
                  <button
                    type="button"
                    id="tour-date"
                    ref={calendarTriggerRef}
                    onClick={() => setIsCalendarOpen((prev) => !prev)}
                    className="w-full rounded-2xl border border-ocean-light/40 bg-white px-4 py-3.5 text-sm font-medium shadow-sm outline-none transition hover:border-ocean-mid flex items-center justify-between"
                  >
                    <span className="flex items-center gap-3">
                      <i className="fas fa-calendar text-ocean-mid"></i>
                      <span className={date ? 'text-textPrimary' : 'text-gray-400'}>{formatInputDate(date)}</span>
                    </span>
                    <i className="far fa-calendar-alt text-gray-600"></i>
                  </button>

                  {isCalendarOpen && (
                    <div
                      ref={calendarPopoverRef}
                      className="absolute left-0 top-[calc(100%+0.5rem)] z-[110] bg-white w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.15)] p-4 border border-gray-100"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-base font-semibold text-textPrimary">
                          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                        </h3>
                        <div className="flex items-center gap-3 text-gray-600">
                          <button type="button" onClick={goToPreviousMonth} className="hover:text-ocean-mid" aria-label="Previous month">
                            <i className="fas fa-arrow-up"></i>
                          </button>
                          <button type="button" onClick={goToNextMonth} className="hover:text-ocean-mid" aria-label="Next month">
                            <i className="fas fa-arrow-down"></i>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dayLabel) => (
                          <div key={dayLabel} className="text-center text-xs font-semibold text-textSecondary py-1">
                            {dayLabel}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {days.map((dayItem, index) => {
                          if (!dayItem) return <div key={index} className="h-9"></div>;

                          const isPast = isDatePast(dayItem);
                          const isTooSoon = isDateTooSoon(dayItem);
                          const remaining = getRemainingCapacity(dayItem);
                          const isFullyBooked = !isPast && !isTooSoon && remaining <= 0;
                          const isSelected = date && toLocalDateKey(dayItem) === date;
                          const selectable = isDateSelectable(dayItem);

                          let styleClass = 'text-textPrimary border border-transparent';
                          if (isPast || isTooSoon) styleClass = 'text-gray-300 border border-transparent';
                          if (isFullyBooked) styleClass = 'text-red-300 border border-transparent bg-red-50';
                          if (isSelected) styleClass = 'text-white bg-ocean-mid border border-ocean-mid';

                          const titleText = isPast
                            ? 'Past date'
                            : isTooSoon
                              ? 'Must be booked at least 1 day in advance'
                              : isFullyBooked
                                ? 'Unavailable from admin blocks or bookings'
                                : `${remaining} slot(s) available`;

                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleDateSelect(dayItem)}
                              onMouseEnter={() => setHoveredDateKey(toLocalDateKey(dayItem))}
                              onFocus={() => setHoveredDateKey(toLocalDateKey(dayItem))}
                              onMouseLeave={() => setHoveredDateKey('')}
                              disabled={!selectable}
                              title={titleText}
                              className={`h-9 rounded-md text-sm transition-colors ${styleClass} ${selectable && !isSelected ? 'hover:bg-ocean-ice' : ''} ${!selectable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {dayItem.getDate()}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 border-t border-gray-100 pt-3">
                        {!activePreviewDate && (
                          <p className="text-xs text-textSecondary">Hover or select a date to view remaining capacity.</p>
                        )}
                        {activePreviewDate && (
                          <div className="rounded-xl bg-ocean-ice/40 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-ocean-mid">
                              {isHoverPreview ? 'Date Availability Preview' : 'Selected Date Availability'}
                            </p>
                            <p className="text-xs text-textSecondary mt-0.5">{formatLongDate(activePreviewDateKey)}</p>
                            <p className="text-sm font-semibold text-textPrimary mt-1">
                              {isPreviewPast
                                ? 'Past date is not available.'
                                : isPreviewTooSoon
                                  ? 'Book at least 1 day in advance.'
                                  : isPreviewFullyBooked
                                    ? 'Fully booked. Remaining capacity: 0.'
                                    : `Remaining capacity: ${activePreviewRemaining} guest(s).`}
                            </p>
                            {isPreviewSelectable && activePreviewRemaining <= 10 && (
                              <p className="text-[11px] text-amber-700 mt-1">Limited slots left.</p>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
          
              </div>

              <div className="flex flex-col w-[90px]">
                <label htmlFor="adults-count" className="text-[10px] uppercase tracking-[0.2em] font-bold text-textSecondary mb-2 pl-2">Adults</label>
                <div className="relative">
                  <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-ocean-mid"></i>
                  <input
                    type="number"
                    id="adults-count"
                    min="1"
                    value={adults}
                    onChange={(e) => handleAdultsChange(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded-2xl border border-ocean-light/40 bg-white pl-11 pr-2 py-3.5 text-sm font-medium shadow-sm outline-none transition focus:border-ocean-mid focus:ring-1 focus:ring-ocean-mid"
                  />
                </div>
              </div>

              <div className="flex flex-col w-[90px]">
                <label htmlFor="kids-count" className="text-[10px] uppercase tracking-[0.2em] font-bold text-textSecondary mb-2 pl-2">Kids</label>
                <div className="relative">
                  <i className="fas fa-child absolute left-4 top-1/2 -translate-y-1/2 text-ocean-mid"></i>
                  <input
                    type="number"
                    id="kids-count"
                    min="0"
                    value={kids}
                    onChange={(e) => handleKidsChange(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded-2xl border border-ocean-light/40 bg-white pl-11 pr-2 py-3.5 text-sm font-medium shadow-sm outline-none transition focus:border-ocean-mid focus:ring-1 focus:ring-ocean-mid"
                  />
                </div>
              </div>

              {dateError && <p className="w-full text-[11px] leading-tight text-rose-500/80 pl-1 mt-0">{dateError}</p>}

              {/* Price display row beside Proceed button */}
              <div className="flex items-center gap-4 w-full sm:w-auto mt-2 sm:mt-0">
                {dayTour && (
                  <div className="flex items-center gap-3 bg-white/60 rounded-xl px-3 py-2">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-textSecondary">Adult</p>
                      <p className="text-base font-bold text-ocean-mid">₱{dayTour.adultPrice?.toLocaleString()}</p>
                    </div>
                    <div className="w-px h-8 bg-ocean-light/30"></div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-textSecondary">Kid</p>
                      <p className="text-base font-bold text-ocean-mid">₱{dayTour.kidPrice?.toLocaleString()}</p>
                    </div>
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={Boolean(dateError)}
                  className="group flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-ocean-mid to-ocean-light px-8 py-3.5 text-xs font-bold uppercase tracking-[0.15em] text-white shadow-[0_10px_20px_rgba(33,105,243,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_15px_30px_rgba(33,105,243,0.35)]"
                >
                  Proceed
                  <i className="fas fa-arrow-right transition-transform group-hover:translate-x-1"></i>
                </button>
              </div>
            </form>
          </div>

          {/* ACTIVITIES SECTION - Display ALL activities */}
          {(!loadingActivities && displayedActivities.length > 0) && (
            <div className="pt-2">
              <div className="flex items-center gap-6 py-4 mb-4">
                 <div className="h-px bg-ocean-light/30 flex-1"></div>
                 <p className="text-xs font-bold tracking-[0.3em] uppercase text-ocean-mid">Curated Activities</p>
                 <div className="h-px bg-ocean-light/30 flex-1"></div>
              </div>
              
              <div className="grid lg:grid-cols-2 gap-6 md:gap-8 mt-6">
                {displayedActivities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>
            </div>
          )}

          {/* Show message when no activities exist */}
          {(!loadingActivities && displayedActivities.length === 0) && (
            <div className="pt-2">
              <div className="flex items-center gap-6 py-4 mb-4">
                 <div className="h-px bg-ocean-light/30 flex-1"></div>
                 <p className="text-xs font-bold tracking-[0.3em] uppercase text-ocean-mid">Curated Activities</p>
                 <div className="h-px bg-ocean-light/30 flex-1"></div>
              </div>
              <div className="bg-white rounded-2xl p-8 text-center border border-ocean-light/20">
                <i className="fas fa-bicycle text-5xl text-ocean-light/40 mb-3"></i>
                <p className="text-textSecondary">No activities available at the moment. Check back soon!</p>
              </div>
            </div>
          )}

          {/* DIVIDER */}
          <div className="flex items-center gap-6 py-4">
             <div className="h-px bg-ocean-light/30 flex-1"></div>
             <p className="text-xs font-bold tracking-[0.3em] uppercase text-ocean-mid">Resort Gallery</p>
             <div className="h-px bg-ocean-light/30 flex-1"></div>
          </div>

          {/* DENSE BENTO BOX GALLERY */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[160px] sm:auto-rows-[220px] md:auto-rows-[280px] gap-3 sm:gap-4 md:gap-5 grid-flow-dense">
            {galleryImages.map((src, idx) => {
              // Create dynamic variations for a highly appealing Bento Grid
              let colSpan = 'col-span-1';
              let rowSpan = 'row-span-1';
              
              if (idx === 0 || idx === 8) {
                // Large feature blocks
                colSpan = 'col-span-2';
                rowSpan = 'row-span-2';
              } else if (idx === 3 || idx === 11 || idx === 16) {
                // Tall blocks
                rowSpan = 'row-span-2';
              } else if (idx === 4 || idx === 12) {
                // Wide blocks
                colSpan = 'col-span-2';
              }

              return (
                <div 
                  key={idx} 
                  className={`group relative overflow-hidden rounded-[1.5rem] bg-ocean-ice border border-ocean-light/10 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transform transition-all duration-700 hover:scale-[1.01] hover:z-10 hover:shadow-[0_15px_35px_rgba(0,0,0,0.12)] ${colSpan} ${rowSpan}`}
                >
                  <Image 
                    src={src} 
                    alt={`Sandyfeet Resort Gallery Item ${idx + 1}`}
                    fill 
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-[1.5s] group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-ocean-dark/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </GuestLayout>
  );
}