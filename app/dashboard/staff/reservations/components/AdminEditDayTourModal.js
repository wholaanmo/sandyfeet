// app/dashboard/admin/reservations/components/AdminEditDayTourModal.js
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { doc, updateDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDateValue } from '@/app/my-bookings/utils';
import { logAdminAction } from '../../../../../lib/auditLogger';

const toDateInputStr = (value) => {
  const d = toDateValue(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function canAdminEditDayTour(booking) {
  return booking?.type === 'daytour' && booking?.status === 'confirmed';
}

export default function AdminEditDayTourModal({ isOpen, booking, onClose, onSuccess }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [adults, setAdults] = useState(0);
  const [kids, setKids] = useState(0);
  const [fixedDownPayment, setFixedDownPayment] = useState(0);
  const [dayTour, setDayTour] = useState(null);
  const [capacityError, setCapacityError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [bookedGuestsOnDate, setBookedGuestsOnDate] = useState(0);
  const [unavailableGuestsOnDate, setUnavailableGuestsOnDate] = useState(0);
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  const totalGuests = adults + kids;
  const computedTotalPrice = useMemo(() => {
    if (!dayTour) return 0;
    return adults * (dayTour.adultPrice || 0) + kids * (dayTour.kidPrice || 0);
  }, [adults, kids, dayTour]);

  const computedBalance = useMemo(
    () => Math.max(0, computedTotalPrice - fixedDownPayment),
    [computedTotalPrice, fixedDownPayment]
  );

  useEffect(() => {
    if (!isOpen || !booking) return;

    setSelectedDate(toDateInputStr(booking.selectedDate));
    setAdults(booking.adults || 0);
    setKids(booking.kids || 0);
    setFixedDownPayment(
      typeof booking.downPayment === 'number' && booking.downPayment > 0
        ? booking.downPayment
        : (Number(booking.totalPrice) || 0) * 0.5
    );
    setError('');
    setCapacityError('');

    const loadDayTour = async () => {
      try {
        if (booking.dayTourId) {
          const tourSnap = await getDoc(doc(db, 'dayTours', booking.dayTourId));
          if (tourSnap.exists()) {
            setDayTour({ id: tourSnap.id, ...tourSnap.data() });
            return;
          }
        }
        const toursSnap = await getDocs(collection(db, 'dayTours'));
        if (!toursSnap.empty) {
          const first = toursSnap.docs[0];
          setDayTour({ id: first.id, ...first.data() });
        }
      } catch (err) {
        console.error('Error loading day tour:', err);
      }
    };
    loadDayTour();
  }, [isOpen, booking]);

  useEffect(() => {
    if (!selectedDate || !isOpen) return;

    const fetchCapacity = async () => {
      try {
        const bookingsQuery = query(
          collection(db, 'dayTourBookings'),
          where('selectedDate', '==', selectedDate),
          where('status', 'in', ['pending', 'confirmed', 'check-in'])
        );
        const bookingsSnap = await getDocs(bookingsQuery);
        let totalBooked = 0;
        bookingsSnap.forEach((docSnap) => {
          if (docSnap.id === booking.id) return;
          const data = docSnap.data();
          totalBooked += (data.adults || 0) + (data.kids || 0) + (data.seniors || 0);
        });
        setBookedGuestsOnDate(totalBooked);

        const unavailableSnap = await getDocs(
          query(collection(db, 'daytour_unavailable_dates'), where('date', '==', selectedDate))
        );
        let unavailable = 0;
        unavailableSnap.forEach((docSnap) => {
          unavailable += Number(docSnap.data().unavailableGuests || 0);
        });
        setUnavailableGuestsOnDate(unavailable);
      } catch (err) {
        console.error('Error fetching day tour capacity:', err);
      }
    };
    fetchCapacity();
  }, [selectedDate, isOpen, booking?.id]);

  useEffect(() => {
    if (!dayTour?.maxCapacity || !isOpen) {
      setCapacityError('');
      return;
    }
    const available = dayTour.maxCapacity - bookedGuestsOnDate - unavailableGuestsOnDate;
    if (totalGuests > available) {
      setCapacityError(`Only ${Math.max(0, available)} guest slot(s) available for this date.`);
    } else {
      setCapacityError('');
    }
  }, [totalGuests, bookedGuestsOnDate, unavailableGuestsOnDate, dayTour, selectedDate, booking, isOpen]);

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

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateSelectable = (date) => !isDatePast(date);

  const handleDateSelect = (date) => {
    if (!isDateSelectable(date)) return;
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setSelectedDate(formatted);
    setIsCalendarOpen(false);
  };

  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const handleSave = async () => {
    setError('');
    if (!selectedDate) {
      setError('Please select a reservation date.');
      return;
    }
    if (adults < 1) {
      setError('At least 1 adult is required.');
      return;
    }
    if (capacityError) {
      setError(capacityError);
      return;
    }

    setIsLoading(true);
    try {
      const selectedDateObj = new Date(`${selectedDate}T12:00:00`);
      const updates = {
        selectedDate,
        selectedDateISO: selectedDateObj.toISOString(),
        adults,
        kids,
        totalGuests: totalGuests + (booking.seniors || 0),
        totalPrice: computedTotalPrice,
        downPayment: fixedDownPayment,
        remainingBalance: computedBalance,
        manualBalance: computedBalance,
        manualTotalPrice: computedTotalPrice,
        manualDownPayment: fixedDownPayment,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, 'dayTourBookings', booking.id), updates);

      await logAdminAction({
        action: 'Admin Edited Day Tour Booking',
        module: 'Reservations',
        details: `Updated day tour ${booking.bookingId}: date ${selectedDate}, ${adults} adults, ${kids} kids, balance ₱${computedBalance.toLocaleString()}`,
      });

      onSuccess?.({
        selectedDate,
        selectedDateISO: selectedDateObj.toISOString(),
        adults,
        kids,
        totalGuests: updates.totalGuests,
        totalPrice: computedTotalPrice,
        downPayment: fixedDownPayment,
        remainingBalance: computedBalance,
        manualBalance: computedBalance,
        manualTotalPrice: computedTotalPrice,
      });
    } catch (err) {
      console.error('Error updating day tour:', err);
      setError('Failed to update day tour booking. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !booking) return null;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const days = getDaysInMonth(currentMonth);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-[#4D8CF5]/20 bg-gradient-to-r from-[#EEF4FF] to-white px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <i className="fas fa-sun text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-[#1E3A8A]">Edit Day Tour Booking</h3>
              <p className="mt-1 text-sm text-[#4D8CF5]">
                <span className="font-mono font-semibold">{booking.bookingId}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100">
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-6">
          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#1E3A8A]">
              <i className="fas fa-calendar-alt mr-2 text-[#4D8CF5]" />
              Reservation Date
            </h4>
            <div className="relative" ref={calendarTriggerRef}>
              <input
                type="text"
                readOnly
                value={formatDisplayDate(selectedDate)}
                onClick={() => {
                  setIsCalendarOpen(true);
                  if (selectedDate) {
                    const d = new Date(`${selectedDate}T00:00:00`);
                    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  }
                }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4D8CF5]"
              >
                <i className="fas fa-calendar-alt text-sm" />
              </button>
              {isCalendarOpen && (
                <div
                  ref={calendarPopoverRef}
                  className="absolute z-50 bg-white w-[300px] rounded-2xl shadow-xl p-3 border border-gray-100 mt-2"
                >
                  <div className="flex justify-between items-center mb-3">
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                      className="w-8 h-8 rounded-full border flex items-center justify-center"
                    >
                      <i className="fas fa-chevron-left text-xs" />
                    </button>
                    <h4 className="font-bold text-sm">
                      {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                      className="w-8 h-8 rounded-full border flex items-center justify-center"
                    >
                      <i className="fas fa-chevron-right text-xs" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {days.map((day, index) => {
                      if (!day) return <div key={index} className="h-9" />;
                      const disabled = !isDateSelectable(day);
                      const isSelected =
                        selectedDate &&
                        new Date(`${selectedDate}T00:00:00`).toDateString() === day.toDateString();
                      return (
                        <button
                          key={index}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleDateSelect(day)}
                          className={`h-9 text-xs font-medium rounded-lg ${
                            disabled ? 'text-gray-300' : isSelected ? 'bg-[#4D8CF5] text-white' : 'hover:bg-blue-50'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {capacityError && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-2">
                <i className="fas fa-exclamation-triangle" />
                {capacityError}
              </p>
            )}
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#1E3A8A]">
              <i className="fas fa-users mr-2 text-[#4D8CF5]" />
              Guest Breakdown
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Adults</span>
                <input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(0, parseInt(e.target.value, 10) || 0))} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Kids</span>
                <input type="number" min={0} value={kids} onChange={(e) => setKids(Math.max(0, parseInt(e.target.value, 10) || 0))} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
            </div>
            {(booking.seniors || 0) > 0 && (
              <p className="text-xs text-gray-500 mt-2">Seniors ({booking.seniors}) unchanged from original booking.</p>
            )}
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#1E3A8A]">
              <i className="fas fa-credit-card mr-2 text-[#4D8CF5]" />
              Payment Information
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">50% Down Payment</p>
                <p className="font-bold text-[#1E3A8A]">₱{fixedDownPayment.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Balance</p>
                <p className="font-bold text-[#1E3A8A]">₱{computedBalance.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="font-bold text-[#1E3A8A]">₱{computedTotalPrice.toLocaleString()}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">Balance updates automatically when guest counts change.</p>
          </div>

          {error && (
            <p className="text-sm text-red-700 flex items-center gap-2">
              <i className="fas fa-exclamation-circle" />
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button type="button" onClick={onClose} disabled={isLoading} className="rounded-xl bg-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || Boolean(capacityError)}
            className="rounded-xl bg-[#4D8CF5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? <><i className="fas fa-spinner fa-spin" /> Saving...</> : <><i className="fas fa-save" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}
