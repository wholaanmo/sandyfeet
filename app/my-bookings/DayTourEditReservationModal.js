// app/my-bookings/DayTourEditReservationModal.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, query, where, onSnapshot, getDoc } from 'firebase/firestore';

export default function DayTourEditReservationModal({ isOpen, booking, onClose, onSuccess }) {
  // Form state
  const [selectedDate, setSelectedDate] = useState(booking.selectedDate || '');
  const [adults, setAdults] = useState(String(booking.adults || 1));
  const [kids, setKids] = useState(String(booking.kids || 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const timeoutRef = useRef(null);
  
  // State for tracking if booking has already been edited
  const [hasBeenEdited, setHasBeenEdited] = useState(false);
  const [loadingEditStatus, setLoadingEditStatus] = useState(false);

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
  const isPending = booking.status === 'pending';

  // Helper: format date for display
  const formatDisplayDate = (dateKey) => {
    if (!dateKey) return '';
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Reset loading state and success state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset all states when modal is closed
      setLoading(false);
      setSuccess(false);
      setError('');
      setShowConfirmModal(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isOpen]);

  // Check if the booking has already been edited
  useEffect(() => {
    if (!isOpen || !booking || !isPending) {
      setHasBeenEdited(false);
      return;
    }

    const checkIfAlreadyEdited = async () => {
      setLoadingEditStatus(true);
      try {
        const bookingRef = doc(db, 'dayTourBookings', booking.id);
        const docSnap = await getDoc(bookingRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setHasBeenEdited(data.hasBeenEdited === true);
        } else {
          setHasBeenEdited(false);
        }
      } catch (error) {
        console.error('Error checking edit status:', error);
        setHasBeenEdited(false);
      } finally {
        setLoadingEditStatus(false);
      }
    };

    checkIfAlreadyEdited();
  }, [isOpen, booking, isPending]);

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

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Clear any pending timeout from previous instance
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setSuccess(false);
      setError('');
      setLoading(false);
      setShowConfirmModal(false);
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
    if (hasBeenEdited && isPending) return;
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

  // Handle save button click - show confirmation modal
  const handleSaveClick = () => {
    if (hasBeenEdited && isPending) {
      setError('You have already edited this booking. Further edits are not allowed.');
      return;
    }
    
    if (!hasChanges()) {
      onClose();
      return;
    }

    const validationError = validateGuests(adults, kids, selectedDate);
    if (validationError) {
      setError(validationError);
      return;
    }

    setShowConfirmModal(true);
  };

  // Handle actual submission after confirmation
  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
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
        hasBeenEdited: true  // Mark as edited
      };
      await updateDoc(bookingRef, updateData);
      setSuccess(true);
      
      // Update local state to disable the button
      setHasBeenEdited(true);
      
      // Clear any existing timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Set new timeout to close modal after success
      timeoutRef.current = setTimeout(() => {
        setLoading(false); // Reset loading state before closing
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
  
  // Determine if the Save Changes button should be disabled
  const isSaveDisabled = loading || !!error || !hasChanges() || capacityWarning || 
    (hasBeenEdited && isPending) || loadingEditStatus;

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

  {/* Edit Reservation Notice */}
  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <i className="fas fa-exclamation-circle text-sm" />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-amber-700">
          One-Time Edit Only
        </h4>

        <p className="mt-1 text-xs leading-relaxed text-amber-600">
          You are only allowed to edit your reservation once. Please make sure your selected changes are final before saving changes.
        </p>
      </div>
    </div>
  </div>

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
                        placeholder={hasBeenEdited && isPending ? "You have already edited this booking" : "Select date"}
                        readOnly
                        onClick={() => !(hasBeenEdited && isPending) && setIsCalendarOpen(!isCalendarOpen)}
                        className={`w-full rounded-xl border px-4 py-2.5 pr-10 text-sm transition-all ${
                          hasBeenEdited && isPending
                            ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'border-gray-200 bg-gray-50 text-gray-800 cursor-pointer focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
                      {!(hasBeenEdited && isPending) && (
                        <button
                          type="button"
                          onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                        >
                          <i className="fas fa-calendar-alt text-sm"></i>
                        </button>
                      )}
                    </div>

                    {/* Calendar Popover */}
                    {isCalendarOpen && !(hasBeenEdited && isPending) && (
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
                  
                  {selectedDate && !(hasBeenEdited && isPending) && (
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
                        disabled={hasBeenEdited && isPending}
                        className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all ${
                          hasBeenEdited && isPending
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Kids</label>
                      <input
                        type="number"
                        min="0"
                        value={kids}
                        onChange={(e) => setKids(e.target.value)}
                        disabled={hasBeenEdited && isPending}
                        className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all ${
                          hasBeenEdited && isPending
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                        }`}
                      />
                    </div>
                  </div>
                  {capacityWarning && !(hasBeenEdited && isPending) && (
                    <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                      <i className="fas fa-exclamation-circle" />
                      Not enough capacity. You can have at most {effectiveRemaining} guests on this date.
                    </p>
                  )}
                </div>

                {/* Price Summary */}
                {dayTour && (
                  <div className={`rounded-xl p-4 space-y-2 text-sm transition-all ${hasBeenEdited && isPending ? 'bg-gray-100 opacity-60' : 'bg-gray-50'}`}>
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
                
                {/* Message for already edited booking */}
                {hasBeenEdited && isPending && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs text-amber-700 flex items-center gap-2">
                      <i className="fas fa-info-circle" />
                      You have already edited this booking. Further edits are not allowed.
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
                  onClick={handleSaveClick}
                  disabled={isSaveDisabled}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
                    (hasBeenEdited && isPending)
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
                  }`}
                  title={hasBeenEdited && isPending ? "You have already edited this booking" : ""}
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

      {/* Confirmation Modal */}
      {showConfirmModal && !(hasBeenEdited && isPending) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            <div className="border-b border-blue-100 bg-blue-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <i className="fas fa-question-circle text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-blue-900">Confirm Changes</h3>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-700">
                Are you sure you want to update this reservation to:
              </p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p><span className="font-semibold">Date:</span> {formatDisplayDate(selectedDate)}</p>
              </div>
              <p className="text-sm text-gray-700">With the following guest counts:</p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p>Adults: {parseInt(adults, 10) || 0}</p>
                <p>Kids: {parseInt(kids, 10) || 0}</p>
                <p>Total Guests: {totalGuests}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <p className="font-semibold text-blue-800">Price Update:</p>
                <div className="flex justify-between mt-1">
                  <span>New Total Price:</span>
                  <span className="font-bold">₱{newTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining Balance:</span>
                  <span>₱{newRemainingBalance.toLocaleString()}</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  * Down payment (₱{originalDownPayment.toLocaleString()}) remains unchanged.
                </p>
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
                onClick={handleConfirmSubmit}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}