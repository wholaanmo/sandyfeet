// app/my-bookings/DayTourEditReservationModal.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';

export default function DayTourEditReservationModal({ isOpen, booking, onClose, onSuccess }) {
  // Form state
  const [selectedDate, setSelectedDate] = useState(booking.selectedDate || '');
  const [adults, setAdults] = useState(String(booking.adults || 1));
  const [kids, setKids] = useState(String(booking.kids || 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef(null);

  // Day tour configuration
  const [dayTour, setDayTour] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [unavailableDates, setUnavailableDates] = useState({});

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [hoveredDateKey, setHoveredDateKey] = useState('');
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  // Original booking data for capacity adjustments
  const originalDateKey = booking.selectedDate || '';
  const originalTotalGuests = (booking.adults || 0) + (booking.kids || 0);
  const originalDownPayment = booking.downPayment || (booking.totalPrice * 0.5);

  // Helper: date <-> YYYY-MM-DD
  const toLocalDateKey = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateKey = (key) => {
    if (!key) return null;
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDisplayDate = (dateKey) => {
    if (!dateKey) return '';
    const date = parseDateKey(dateKey);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Fetch day tour details (prices, maxCapacity)
  useEffect(() => {
    if (!isOpen) return;
    const toursRef = collection(db, 'dayTours');
    const q = query(toursRef, where('archived', '==', false));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) setDayTour(snap.docs[0].data());
    });
    return () => unsubscribe();
  }, [isOpen]);

  // Fetch booked counts for capacity calculation
  useEffect(() => {
    if (!isOpen) return;
    const q = query(
      collection(db, 'dayTourBookings'),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const booked = {};
      snap.forEach((docSnap) => {
        // Skip the current booking to avoid counting it twice in the listener?
        // But we'll handle it in the effective capacity function.
        const data = docSnap.data();
        const dateKey = data.selectedDate;
        if (!dateKey) return;
        const totalGuests = (data.adults || 0) + (data.kids || 0) + (data.seniors || 0);
        // We store all bookings; later we'll subtract original booking's contribution if same date
        booked[dateKey] = (booked[dateKey] || 0) + totalGuests;
      });
      setBookedDates(booked);
    });
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
  if (isOpen) {
    // Clear any pending timeout from previous instance
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setSuccess(false);
    setError('');
    setSelectedDate(booking.selectedDate || '');
    setAdults(String(booking.adults || 1));
    setKids(String(booking.kids || 0));
    // Reset calendar month to current (optional)
    setCurrentMonth(new Date());
    setIsCalendarOpen(false);
  }
}, [isOpen, booking]);

  // Fetch admin-blocked unavailable dates
  useEffect(() => {
    if (!isOpen) return;
    const unavailableRef = collection(db, 'daytour_unavailable_dates');
    const unsubscribe = onSnapshot(unavailableRef, (snap) => {
      const unavailable = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.date) {
          unavailable[data.date] = (unavailable[data.date] || 0) + Number(data.unavailableGuests || 0);
        }
      });
      setUnavailableDates(unavailable);
    });
    return () => unsubscribe();
  }, [isOpen]);

  // Regular remaining capacity (including all bookings, no adjustment)
  const getRemainingCapacityRaw = (dateKey) => {
    if (!dayTour?.maxCapacity) return Infinity;
    const booked = bookedDates[dateKey] || 0;
    const unavailable = unavailableDates[dateKey] || 0;
    return dayTour.maxCapacity - (booked + unavailable);
  };

  // Effective remaining capacity for this booking (accounting for its own occupancy)
  const getEffectiveRemainingCapacity = (dateKey) => {
    if (!dayTour?.maxCapacity) return Infinity;
    let otherBookings = bookedDates[dateKey] || 0;
    // If the date is the same as the original booking date, subtract this booking's own guests
    if (dateKey === originalDateKey) {
      otherBookings = Math.max(0, otherBookings - originalTotalGuests);
    }
    const unavailable = unavailableDates[dateKey] || 0;
    return dayTour.maxCapacity - (otherBookings + unavailable);
  };

  // Date availability rules (same as day-tour page)
  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateTooSoon = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minBookable = new Date(today);
    minBookable.setDate(minBookable.getDate() + 2);
    return date < minBookable && date >= today;
  };

  // Date selectable if effective remaining capacity > 0 (so current date remains selectable)
  const isDateSelectable = (dateKey) => {
    const date = parseDateKey(dateKey);
    if (!date) return false;
    if (isDatePast(date)) return false;
    if (isDateTooSoon(date)) return false;
    return getEffectiveRemainingCapacity(dateKey) > 0;
  };

  // Handle date selection
  const handleDateSelect = (date) => {
    const key = toLocalDateKey(date);
    if (isDateSelectable(key)) {
      setSelectedDate(key);
      setIsCalendarOpen(false);
      setError('');
    }
  };

  // Validate guest counts using effective remaining capacity
  const validateGuests = (newAdults, newKids, dateKey) => {
    const adultCount = parseInt(newAdults, 10) || 0;
    const kidCount = parseInt(newKids, 10) || 0;
    const total = adultCount + kidCount;

    if (adultCount < 1) return 'At least 1 adult is required.';
    if (dayTour?.maxCapacity && total > dayTour.maxCapacity) {
      return `Maximum ${dayTour.maxCapacity} guests allowed per booking.`;
    }
    if (dateKey) {
      const effectiveRemaining = getEffectiveRemainingCapacity(dateKey);
      if (effectiveRemaining < total) {
        return `Only ${effectiveRemaining} slot(s) available for your updated guest count.`;
      }
    }
    return '';
  };

  // Compute new total price based on current guest counts
  const computeNewTotal = () => {
    if (!dayTour) return 0;
    const adultCount = parseInt(adults, 10) || 0;
    const kidCount = parseInt(kids, 10) || 0;
    const adultPrice = dayTour.adultPrice || 0;
    const kidPrice = dayTour.kidPrice || 0;
    return (adultCount * adultPrice) + (kidCount * kidPrice);
  };

  const newTotal = computeNewTotal();
  const newRemainingBalance = Math.max(0, newTotal - originalDownPayment);

  // Check if any changes were made
  const hasChanges = () => {
    const originalAdults = booking.adults || 1;
    const originalKids = booking.kids || 0;
    return (
      selectedDate !== booking.selectedDate ||
      parseInt(adults, 10) !== originalAdults ||
      parseInt(kids, 10) !== originalKids
    );
  };

 const handleSubmit = async (e) => {
  e.preventDefault();
  if (!hasChanges()) {
    onClose();
    return;
  }

  const validationError = validateGuests(adults, kids, selectedDate);
  if (validationError) {
    setError(validationError);
    return;
  }

  setLoading(true);
  setError('');

  try {
    const bookingRef = doc(db, 'dayTourBookings', booking.id);
    const updateData = {
      selectedDate,
      adults: parseInt(adults, 10),
      kids: parseInt(kids, 10),
      totalPrice: newTotal,
      remainingBalance: newRemainingBalance,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(bookingRef, updateData);
    setSuccess(true);
    
    // Clear any existing timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Set new timeout to close modal after success
    timeoutRef.current = setTimeout(() => {
      onSuccess();
      onClose();
      timeoutRef.current = null;
    }, 1500);
  } catch (err) {
    console.error('Error updating day tour booking:', err);
    setError('Failed to update reservation. Please try again.');
    setLoading(false);
  }
};

// Cleanup timeout on unmount or when modal closes
useEffect(() => {
  return () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };
}, []);

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // Click outside calendar
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

  if (!isOpen) return null;

  const days = getDaysInMonth(currentMonth);
  const totalGuests = (parseInt(adults,10)||0) + (parseInt(kids,10)||0);
  const effectiveRemaining = selectedDate ? getEffectiveRemainingCapacity(selectedDate) : 0;
  const capacityWarning = selectedDate && effectiveRemaining < totalGuests;

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
          {success ? (
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <i className="fas fa-check text-2xl text-emerald-600" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-gray-900">Reservation Updated!</h3>
              <p className="mt-2 text-sm text-gray-500">
                Your day tour booking has been modified.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <i className="fas fa-sun text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-blue-900">Edit Day Tour Reservation</h3>
                    <p className="mt-1 text-sm text-blue-600">
                      Booking ID: <span className="font-mono font-semibold">{booking.bookingId}</span>
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
              <div className="max-h-[60vh] overflow-y-auto px-6 py-6 space-y-5">
                {/* Date Picker */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">
                    <i className="fas fa-calendar-alt mr-2 text-blue-500" />
                    Select New Date
                  </h4>
                  
                  <div className="relative" ref={calendarTriggerRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={formatDisplayDate(selectedDate)}
                        placeholder="Select date"
                        readOnly
                        onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm text-gray-800 cursor-pointer transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        <i className="fas fa-calendar-alt text-sm"></i>
                      </button>
                    </div>

                    {/* Calendar Popover */}
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
                            
                            const dateKey = toLocalDateKey(day);
                            const isPast = isDatePast(day);
                            const isTooSoon = isDateTooSoon(day);
                            const selectable = isDateSelectable(dateKey);
                            const isDisabled = isPast || isTooSoon || !selectable;
                            const isSelected = selectedDate === dateKey;
                            
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
                                onMouseEnter={() => setHoveredDateKey(dateKey)}
                                onMouseLeave={() => setHoveredDateKey('')}
                                className={`h-10 flex items-center justify-center font-medium text-xs transition-all rounded-xl ${bgColor} ${textColor} ${hoverClass} ${borderClass} ${!isDisabled && !isSelected && 'hover:bg-blue-50'}`}
                              >
                                {day.getDate()}
                              </button>
                            );
                          })}
                        </div>

                        {/* Preview / Legend */}
                        <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-500">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-gray-100 border border-gray-200"></div>
                            <span>Unavailable</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                            <span>Selected</span>
                          </div>
                          {hoveredDateKey && (
                            <div className="text-blue-600">
                              {getEffectiveRemainingCapacity(hoveredDateKey)} slot(s) available
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {selectedDate && (
                    <p className="text-xs text-gray-500 mt-2">
                      Available slots for your booking: {getEffectiveRemainingCapacity(selectedDate)} guest(s)
                    </p>
                  )}
                </div>

                {/* Guest Counts */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">
                    <i className="fas fa-users mr-2 text-blue-500" />
                    Number of Guests
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Adults</label>
                      <input
                        type="number"
                        min="1"
                        value={adults}
                        onChange={(e) => setAdults(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Kids</label>
                      <input
                        type="number"
                        min="0"
                        value={kids}
                        onChange={(e) => setKids(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                      />
                    </div>
                  </div>
                  {capacityWarning && (
                    <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                      <i className="fas fa-exclamation-circle" />
                      Not enough capacity. You can have at most {effectiveRemaining} guests on this date.
                    </p>
                  )}
                </div>

                {/* Price Summary */}
                {dayTour && (
                  <div className="rounded-xl bg-gray-50 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Adult (₱{dayTour.adultPrice?.toLocaleString()}) x {adults || 0}</span>
                      <span>₱{((adults || 0) * dayTour.adultPrice).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kid (₱{dayTour.kidPrice?.toLocaleString()}) x {kids || 0}</span>
                      <span>₱{((kids || 0) * dayTour.kidPrice).toLocaleString()}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 font-semibold flex justify-between">
                      <span>New Total Price</span>
                      <span>₱{newTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>Down Payment (fixed)</span>
                      <span>₱{originalDownPayment.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold text-blue-700">
                      <span>Remaining Balance</span>
                      <span>₱{newRemainingBalance.toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      * Down payment remains unchanged. Additional charges are added to the remaining balance.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl bg-red-50 p-3">
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
                  disabled={loading}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !!error || !hasChanges() || capacityWarning}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin text-xs" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save text-xs" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}