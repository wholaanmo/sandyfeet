// app/dashboard/admin/calendar-daytour/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot, addDoc, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import { logAdminAction } from '@/lib/auditLogger';
import Link from 'next/link';

export default function AdminDayTourCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayTour, setDayTour] = useState(null);
  const [unavailableDates, setUnavailableDates] = useState({});
  const [unavailableDatesList, setUnavailableDatesList] = useState([]);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [reason, setReason] = useState('');
  const [unavailableGuests, setUnavailableGuests] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Helper function to convert Date to YYYY-MM-DD local date string
  const toLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch day tour details
  useEffect(() => {
    const fetchDayTour = async () => {
      try {
        const toursRef = collection(db, 'dayTours');
        const q = query(toursRef, where('archived', '!=', true));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const tourDoc = querySnapshot.docs[0];
          setDayTour({ id: tourDoc.id, ...tourDoc.data() });
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching day tour:', error);
        setLoading(false);
      }
    };
    
    fetchDayTour();
  }, []);

  // Real-time listener for unavailable dates
  useEffect(() => {
    const unavailableRef = collection(db, 'daytour_unavailable_dates');
    
    const unsubscribe = onSnapshot(unavailableRef, (querySnapshot) => {
      const unavailable = {};
      const list = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.date;
        unavailable[dateKey] = (unavailable[dateKey] || 0) + Number(data.unavailableGuests || 0);
        list.push({
          id: docSnap.id,
          date: dateKey,
          reason: data.reason,
          unavailableGuests: Number(data.unavailableGuests || 0),
          createdAt: data.createdAt
        });
      });
      setUnavailableDates(unavailable);
      setUnavailableDatesList(
        list.sort((a, b) => {
          const byDate = a.date.localeCompare(b.date);
          if (byDate !== 0) return byDate;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        })
      );
    }, (error) => {
      console.error('Error fetching unavailable dates:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Real-time listener for day tour bookings to check capacity
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

  // Handle body scroll when sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isSidebarOpen]);

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

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateUnavailable = (date) => {
    const dateKey = toLocalDateKey(date);
    return !!unavailableDates[dateKey];
  };

  const getUnavailableGuestsCount = (date) => {
    const dateKey = toLocalDateKey(date);
    return unavailableDates[dateKey] || 0;
  };

  const isDateFullyBooked = (date) => {
    if (!dayTour?.maxCapacity) return false;
    const dateKey = toLocalDateKey(date);
    const bookedCount = bookedDates[dateKey] || 0;
    const unavailableGuestCount = unavailableDates[dateKey] || 0;
    return bookedCount + unavailableGuestCount >= dayTour.maxCapacity;
  };

  const getBookedGuestsCount = (date) => {
    if (!dayTour?.maxCapacity) return 0;
    const dateKey = toLocalDateKey(date);
    return bookedDates[dateKey] || 0;
  };

  // Check if a date can be marked as unavailable (must be selectable and no existing reservations)
  const canMarkUnavailable = (date) => {
    if (!date) return false;
    if (isDatePast(date)) return false;
    if (isDateFullyBooked(date)) return false;
    return true;
  };

  const handleDateSelect = (date) => {
    if (isDatePast(date)) return;
    setSelectedDate(date);
    setEditingEntry(null);
    setReason('');
    setUnavailableGuests('');
  };

  const handleMarkUnavailable = async () => {
    if (!selectedDate) {
      showNotification('Please select a date first', 'error');
      return;
    }
    
    const unavailableGuestsNumber = Number(unavailableGuests);
    if (!Number.isInteger(unavailableGuestsNumber) || unavailableGuestsNumber < 0) {
      showNotification('Please provide a valid number of unavailable guests', 'error');
      return;
    }

    const dateKey = toLocalDateKey(selectedDate);
    const bookedGuests = getBookedGuestsCount(selectedDate);
    const dateUnavailableTotal = unavailableDates[dateKey] || 0;
    const editingEntryCurrentGuests =
      editingEntry && editingEntry.date === dateKey ? Number(editingEntry.unavailableGuests || 0) : 0;
    const updatedUnavailableTotal = dateUnavailableTotal - editingEntryCurrentGuests + unavailableGuestsNumber;
    const totalGuests = bookedGuests + updatedUnavailableTotal;
    if (dayTour?.maxCapacity && totalGuests > dayTour.maxCapacity) {
      showNotification(
        `Unavailable guests cannot exceed remaining capacity. Maximum allowed is ${Math.max(dayTour.maxCapacity - bookedGuests, 0)}.`,
        'error'
      );
      return;
    }

    setActionLoading(true);
    try {
      if (editingEntry?.id) {
        await updateDoc(doc(db, 'daytour_unavailable_dates', editingEntry.id), {
          reason: reason.trim(),
          unavailableGuests: unavailableGuestsNumber,
          updatedAt: new Date().toISOString()
        });
        await logAdminAction({
          action: 'Updated Day Tour Unavailable Entry',
          module: 'Day Tour Calendar Management',
          details: `Updated unavailable entry on ${selectedDate.toDateString()} to ${unavailableGuestsNumber} unavailable guests. Reason: ${reason}`
        });
      } else {
        await addDoc(collection(db, 'daytour_unavailable_dates'), {
          date: dateKey,
          reason: reason.trim(),
          unavailableGuests: unavailableGuestsNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        await logAdminAction({
          action: 'Marked Day Tour Date Unavailable',
          module: 'Day Tour Calendar Management',
          details: `Marked ${selectedDate.toDateString()} as unavailable with ${unavailableGuestsNumber} guests. Reason: ${reason}`
        });
      }

      showNotification(
        editingEntry
          ? `Updated unavailable entry for ${selectedDate.toDateString()}`
          : `Saved unavailable guest count for ${selectedDate.toDateString()}`,
        'success'
      );
      setReason('');
      setUnavailableGuests('');
      setEditingEntry(null);
      setSelectedDate(null);
    } catch (error) {
      console.error('Error marking date unavailable:', error);
      showNotification('Failed to mark date as unavailable', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const hasEditUnavailableChanges = editingEntry
    ? (
      Number(unavailableGuests) !== Number(editingEntry.unavailableGuests || 0) ||
      reason.trim() !== (editingEntry.reason || '').trim()
    )
    : true;

  const handleRemoveUnavailable = async (dateKey, dateId) => {
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'daytour_unavailable_dates', dateId));
      
      await logAdminAction({
        action: 'Removed Day Tour Date Unavailable',
        module: 'Day Tour Calendar Management',
        details: `Removed unavailable date: ${dateKey}`
      });
      
      setRemoveConfirm(null);
      showNotification('Date removed from unavailable list', 'success');
    } catch (error) {
      console.error('Error removing unavailable date:', error);
      showNotification('Failed to remove date', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
  };

  const formatDateDisplay = (dateKey) => {
    const [year, month, day] = dateKey.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const days = getDaysInMonth(currentDate);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
  };
  
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  const getDateStatus = (date) => {
    if (isDatePast(date)) return 'past';
    if (isDateFullyBooked(date)) return 'fullyBooked';
    if (selectedDate && selectedDate.toDateString() === date.toDateString()) return 'selected';
    return 'available';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
        <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
      </div>
    );
  }

  if (!dayTour) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-umbrella-beach text-5xl text-ocean-light/40 mb-4"></i>
          <h2 className="text-2xl font-bold text-textPrimary mb-2">Day Tour Not Configured</h2>
          <p className="text-textSecondary">Please configure a day tour package in the admin panel first.</p>
          <Link
            href="/dashboard/admin/day-tour"
            className="mt-4 inline-block px-6 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-lg"
          >
            Configure Day Tour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
          notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
        }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}

      {/* Two-column layout */}
      <div className="flex flex-col xl:flex-row gap-8">
        {/* Calendar (60%) */}
        <div className="xl:w-[60%]">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
<div className="bg-[#4D8CF5]/10 px-6 py-4 border-b border-[#4D8CF5]/20">
  <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
    Availability Calendar
  </h2>

  <p className="text-[#1E3A8A]/70 text-sm mt-1">
    Click on a date to limit the number of guests
  </p>
</div>
            <div className="p-6">
              {/* Month navigation */}
              <div className="flex justify-between items-center mb-6">
                <button onClick={goToPreviousMonth} className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice text-sm">
                  <i className="fas fa-chevron-left mr-1 text-xs"></i> Prev
                </button>
                <h2 className="text-lg font-semibold text-textPrimary">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                <button onClick={goToNextMonth} className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice text-sm">
                  Next <i className="fas fa-chevron-right ml-1 text-xs"></i>
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                  <div key={day} className="text-center font-semibold text-textSecondary text-xs py-1.5">{day}</div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((day, idx) => {
                  if (!day) return <div key={idx} className="aspect-square"></div>;
                  
                  const status = getDateStatus(day);
                  let bgColor = 'bg-white';
                  let textColor = 'text-textPrimary';
                  let borderClass = 'border border-gray-200';
                  let cursorClass = 'cursor-pointer';
                  let titleText = '';
                  
                  switch(status) {
                    case 'past':
                      bgColor = 'bg-gray-100';
                      textColor = 'text-gray-400';
                      cursorClass = 'cursor-not-allowed';
                      titleText = 'Past date';
                      break;
                    case 'fullyBooked':
                      bgColor = 'bg-red-100';
                      textColor = 'text-red-600';
                      cursorClass = 'cursor-not-allowed';
                      titleText = 'Fully Booked';
                      break;
                    case 'selected':
                      bgColor = 'bg-ocean-mid';
                      textColor = 'text-white';
                      titleText = 'Selected';
                      break;
                    default:
                      bgColor = 'bg-white';
                      textColor = 'text-textPrimary';
                      titleText = 'Available';
                  }
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => (status !== 'past' && status !== 'fullyBooked') && handleDateSelect(day)}
                      disabled={status === 'past' || status === 'fullyBooked'}
                      title={titleText}
                      className={`relative w-full pt-[100%] rounded-lg transition-all duration-200 ${bgColor} ${borderClass} ${cursorClass}`}
                    >
                      <span className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${textColor}`}>
                        {day.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-6 pt-4 border-t border-ocean-light/10 flex justify-center gap-6 text-xs flex-wrap">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white border border-gray-300 rounded"></div><span>Available</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div><span>Fully Booked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div><span>Past Dates</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-ocean-mid rounded"></div><span>Selected</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Management Panel (40%) */}
        <div className="xl:w-[40%] space-y-6">
          {/* Book for Guest Button */}
 <Link
  href="/day-tour"
  target="_blank"
  className="w-full flex items-center justify-center gap-2 px-5 py-3
             bg-[#4D8CF5] text-white border border-[#4D8CF5]
             rounded-xl font-medium shadow-sm
             hover:bg-[#3B78E7] hover:border-[#3B78E7]
             hover:shadow-md hover:-translate-y-0.5
             transition-all duration-300"
>
  <i className="fas fa-user-plus text-sm"></i>
  Book for Guest
</Link>

                    {/* Unavailable Dates Button - Placed below Mark Date as Unavailable container */}
<button
  onClick={() => setIsSidebarOpen(true)}
  className="w-full py-3 bg-white border-2 border-[#4D8CF5]/40 text-[#1E3A8A] rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all duration-300 hover:bg-[#4D8CF5]/5 hover:border-[#4D8CF5]/40 hover:shadow-md hover:-translate-y-0.5">
  <div className="flex flex-col items-center">
    <div className="flex items-center gap-2 font-semibold text-sm text-[#1E3A8A]">
      <i className="fas fa-list-ul text-[#1E3A8A] text-sm"></i>
      List of Dates with Guest Limits
    </div>

    <span className="text-[10px] font-normal text-[#1E3A8A]/80">
      Click to view list of all dates with set guest limits
    </span>
  </div>
</button>

          {/* Mark Unavailable Panel */}
<div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/15 p-5">
  <h3 className="text-lg font-bold text-[#1E3A8A] mb-4 flex items-center gap-2">
    <i className="fas fa-calendar-times text-[#4D8CF5]"></i>
    Limit Guest Availability
  </h3>

  {!selectedDate ? (
    <div className="text-center py-10 text-[#1E3A8A]/60">
      <i className="fas fa-calendar-day text-4xl mb-3 block text-[#4D8CF5]/70"></i>
      <p>Select a date from the calendar</p>
      <p className="text-xs mt-2 text-[#1E3A8A]/40">
        Past dates and fully booked dates cannot be selected
      </p>
    </div>
  ) : (
    <div>
      {editingEntry && (
        <div className="mb-4 p-3 bg-[#4D8CF5]/10 border border-[#4D8CF5]/20 rounded-lg">
          <p className="text-sm text-[#1E3A8A]">
            <i className="fas fa-edit mr-2 text-[#4D8CF5]"></i>
            Editing existing unavailable entry
          </p>
        </div>
      )}

      <div className="bg-[#4D8CF5]/5 rounded-xl p-4 mb-4 border border-[#4D8CF5]/10">
        <p className="text-sm text-[#1E3A8A]/60">Selected Date</p>
        <p className="text-md font-semibold text-[#1E3A8A]">
          {selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>

        <p className="text-sm text-[#1E3A8A]/60 mt-2">
          Maximum Capacity: <strong className="text-[#1E3A8A]">{dayTour.maxCapacity} guests</strong>
        </p>

        <p className="text-sm text-[#1E3A8A]/60 mt-1">
          Reserved Guests:{" "}
          <strong
            className={getBookedGuestsCount(selectedDate) > 0 ? 'text-red-500' : 'text-green-600'}
          >
            {getBookedGuestsCount(selectedDate)} / {dayTour.maxCapacity}
          </strong>
        </p>

        <p className="text-sm text-[#1E3A8A]/60 mt-1">
          Unavailable Guests: <strong className="text-[#1E3A8A]">
            {getUnavailableGuestsCount(selectedDate)}
          </strong>
        </p>
      </div>

      <label className="block text-sm font-medium text-[#1E3A8A] mb-2">
        Number of unavailable guests <span className="text-red-500">*</span>
      </label>

      <input
        type="number"
        min="0"
        value={unavailableGuests}
        onChange={(e) => setUnavailableGuests(e.target.value)}
        placeholder="Enter guest count"
        className="w-full px-3 py-2 border border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/30 focus:border-[#4D8CF5] mb-4 transition-all duration-200"/>

      <label className="block text-sm font-medium text-[#1E3A8A] mb-2">
        Reason (optional)
      </label>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g., Maintenance, Private Event, Holiday, etc."
        rows="3"
        className="w-full px-3 py-2 border border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/30 focus:border-[#4D8CF5] mb-4 transition-all duration-200"/>

      <button
        onClick={handleMarkUnavailable}
        disabled={actionLoading || unavailableGuests === '' || !hasEditUnavailableChanges}
        className={`w-full py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
          (unavailableGuests === '' || !hasEditUnavailableChanges)
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-[#4D8CF5] hover:bg-[#3B78E7] text-white shadow-sm hover:shadow-md'
        }`}
      >
        {actionLoading ? (
          <i className="fas fa-spinner fa-spin"></i>
        ) : (
          <i className="fas fa-ban"></i>
        )}
        {editingEntry ? 'Update Unavailable Guests' : 'Save Unavailable Guests'}
      </button>

      <button
        onClick={() => {
          setSelectedDate(null);
          setEditingEntry(null);
          setReason('');
          setUnavailableGuests('');
        }}
        className="w-full mt-3 py-2 border border-[#4D8CF5]/20 rounded-xl text-sm text-[#1E3A8A] hover:bg-[#4D8CF5]/5 transition-all duration-200">
        Cancel Selection
      </button>
    </div>
  )}
</div>
        </div>
      </div>

      {/* Right Sidebar Modal for Unavailable Dates */}
{isSidebarOpen && (
  <>
    {/* Backdrop overlay */}
    <div
      className="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300"
      onClick={() => setIsSidebarOpen(false)}
    />

    {/* Sidebar */}
    <div
      className={`fixed right-0 top-0 h-full w-full max-w-md 
      bg-white/50 backdrop-blur-xl border-l border-white/30
      shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col
      ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >

      {/* Header */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-lg border-b border-[#4D8CF5]/10 px-6 py-4 flex justify-between items-center z-10 flex-shrink-0 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-[#1E3A8A] leading-tight flex flex-col items-start gap-1">
            Dates with Guest Limits
          </h2>
          <p className="text-[#1E3A8A]/70 text-xs mt-1 font-medium">
            List of all dates with set guest limits
          </p>
        </div>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-md border border-[#4D8CF5]/20 text-[#1E3A8A] shadow-sm transition-all duration-200 hover:bg-[#4D8CF5]/80 hover:text-white hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
 
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {unavailableDatesList.length === 0 ? (
          <div className="flex items-center justify-center min-h-[300px] w-full">
            <div className="text-center bg-white/50 backdrop-blur-sm p-8 rounded-2xl border border-[#4D8CF5]/10 shadow-sm">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-check-circle text-2xl text-green-500"></i>
              </div>
              <p className="text-[#1E3A8A] font-bold text-lg">No guest limits set</p>
              <p className="text-[#1E3A8A]/60 text-sm mt-1">No unavailable guest limits have been set for all dates yet.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {unavailableDatesList.map((item) => (
              <div
                key={item.id}
                className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm group hover:border-[#4D8CF5]/30 transition-all duration-300"
              >
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#4D8CF5]/10">
                  <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider flex items-center gap-2">
                    <i className="fas fa-calendar-day text-[#4D8CF5]"></i>
                    {formatDateDisplay(item.date)}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const [year, month, day] = item.date.split('-').map(Number);
                        setSelectedDate(new Date(year, month - 1, day));
                        setReason(item.reason || '');
                        setUnavailableGuests(String(item.unavailableGuests || 0));
                        setEditingEntry(item);
                        setIsSidebarOpen(false);
                      }}
                      disabled={actionLoading}
                      title="Edit entry"
                      className="w-8 h-8 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center justify-center"
                    >
                      <i className="fas fa-edit text-xs"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveConfirm(item)}
                      disabled={actionLoading}
                      title="Remove entry"
                      className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                </div>
 
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Unavailable Guests</p>
                      <div className="flex items-center gap-2">
                        <i className="fas fa-user-minus text-[#4D8CF5]/60 text-xs"></i>
                        <p className="text-sm font-semibold text-[#1E3A8A]">{item.unavailableGuests || 0}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Total Reserved</p>
                      <div className="flex items-center gap-2">
                        <i className="fas fa-users text-[#4D8CF5]/60 text-xs"></i>
                        <p className="text-sm font-semibold text-[#1E3A8A]">{bookedDates[item.date] || 0}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 border-l border-[#4D8CF5]/10 pl-4">
                    <div>
                      <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Remaining Slots</p>
                      <div className="flex items-center gap-2">
                        <i className="fas fa-check-circle text-green-500/60 text-xs"></i>
                        <p className="text-sm font-bold text-green-600">
                          {Math.max(0, (dayTour?.maxCapacity || 0) - ((bookedDates[item.date] || 0) + (unavailableDates[item.date] || 0)))}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Setting Date</p>
                      <p className="text-[11px] text-[#1E3A8A]/60 font-medium">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
 
                {item.reason && (
                  <div className="mt-4 pt-3 border-t border-[#4D8CF5]/5">
                    <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Note / Reason</p>
                    <p className="text-xs text-[#1E3A8A]/80 bg-[#4D8CF5]/5 p-2 rounded-lg border border-[#4D8CF5]/10">
                      {item.reason}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  </>
)}

      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                <i className="fas fa-trash-alt text-red-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Remove Guest Limit?</h3>
              <div className="space-y-1 mb-4">
                <p className="text-textSecondary text-sm font-medium">
                  {formatDateDisplay(removeConfirm.date)}
                </p>
                {removeConfirm.reason && (
                  <p className="text-textSecondary text-xs">
                    Reason: {removeConfirm.reason}
                  </p>
                )}
              </div>
              <p className="text-textSecondary text-sm">
                This will make this date available for full capacity day tour bookings again. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setRemoveConfirm(null)} 
                disabled={actionLoading} 
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleRemoveUnavailable(removeConfirm.date, removeConfirm.id)} 
                disabled={actionLoading} 
                className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2"
              >
                {actionLoading && <i className="fas fa-spinner fa-spin"></i>}
                {actionLoading ? 'Removing...' : 'Remove Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        .animate-slideInRight { animation: slideInRight 0.3s ease-out; }
      `}</style>
    </div>
  );
}