// app/dashboard/admin/calendar-daytour/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
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
  const [actionLoading, setActionLoading] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
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
        unavailable[dateKey] = {
          id: docSnap.id,
          reason: data.reason,
          createdAt: data.createdAt
        };
        list.push({
          id: docSnap.id,
          date: dateKey,
          reason: data.reason,
          createdAt: data.createdAt
        });
      });
      setUnavailableDates(unavailable);
      setUnavailableDatesList(list.sort((a, b) => a.date.localeCompare(b.date)));
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

  const isDateFullyBooked = (date) => {
    if (!dayTour?.maxCapacity) return false;
    const dateKey = toLocalDateKey(date);
    const bookedCount = bookedDates[dateKey] || 0;
    return bookedCount >= dayTour.maxCapacity;
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
    if (isDateUnavailable(date)) return false;
    if (isDateFullyBooked(date)) return false;
    // Check if there are any existing reservations
    const bookedGuests = getBookedGuestsCount(date);
    if (bookedGuests > 0) return false;
    return true;
  };

  const handleDateSelect = (date) => {
    if (isDatePast(date)) return;
    // Prevent selecting dates that are already unavailable
    if (isDateUnavailable(date)) {
      showNotification('This date is already marked as unavailable and cannot be modified.', 'error');
      return;
    }
    setSelectedDate(date);
    setReason('');
  };

  const handleMarkUnavailable = async () => {
    if (!selectedDate) {
      showNotification('Please select a date first', 'error');
      return;
    }
    
    if (!reason.trim()) {
      showNotification('Please provide a reason for marking this date unavailable', 'error');
      return;
    }
    
    const dateKey = toLocalDateKey(selectedDate);
    
    // Check if already unavailable
    if (unavailableDates[dateKey]) {
      showNotification('This date is already marked as unavailable', 'error');
      return;
    }
    
    // Check if there are existing reservations
    const bookedGuests = getBookedGuestsCount(selectedDate);
    if (bookedGuests > 0) {
      showNotification(`This date cannot be marked as unavailable because there are ${bookedGuests} existing reservation(s).`, 'error');
      return;
    }
    
    setActionLoading(true);
    try {
      await addDoc(collection(db, 'daytour_unavailable_dates'), {
        date: dateKey,
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Marked Day Tour Date Unavailable',
        module: 'Day Tour Calendar Management',
        details: `Marked ${selectedDate.toDateString()} as unavailable. Reason: ${reason}`
      });
      
      showNotification(`Date ${selectedDate.toDateString()} marked as unavailable`, 'success');
      setReason('');
      setSelectedDate(null);
    } catch (error) {
      console.error('Error marking date unavailable:', error);
      showNotification('Failed to mark date as unavailable', 'error');
    } finally {
      setActionLoading(false);
    }
  };

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
    if (isDateUnavailable(date)) return 'unavailable';
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
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
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
    <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--color-blue-white)' }}>
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-textPrimary font-playfair mb-1">Day Tour Calendar Management</h1>
        <p className="text-textSecondary">
          Mark specific dates as unavailable for day tour bookings. Maximum capacity: {dayTour.maxCapacity} guests
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col xl:flex-row gap-8">
        {/* Calendar (60%) */}
        <div className="xl:w-[60%]">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-ocean-light/20 px-6 py-4">
              <h2 className="text-xl font-bold text-textPrimary">Availability Calendar</h2>
              <p className="text-textPrimary/80 text-sm">
                Day Tour – Click on a date to mark it as unavailable
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
                    case 'unavailable':
                      bgColor = 'bg-orange-100';
                      textColor = 'text-orange-700';
                      borderClass = 'border border-orange-200';
                      cursorClass = 'cursor-not-allowed';
                      titleText = 'Marked as Unavailable (cannot be modified)';
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
                      onClick={() => (status !== 'past' && status !== 'fullyBooked' && status !== 'unavailable') && handleDateSelect(day)}
                      disabled={status === 'past' || status === 'fullyBooked' || status === 'unavailable'}
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
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div><span>Unavailable Dates</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-ocean-mid rounded"></div><span>Selected</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Management Panel (40%) */}
        <div className="xl:w-[40%] space-y-6">
          {/* Book for Guest Button */}
          <Link
            href="/day-tour/calendar"
            target="_blank"
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
          >
            <i className="fas fa-user-plus text-sm"></i> Book for Guest
          </Link>

          {/* Mark Unavailable Panel */}
          <div className="bg-white rounded-2xl shadow-lg border border-ocean-light/10 p-5">
            <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
              <i className="fas fa-ban text-orange-500"></i> Mark Date as Unavailable
            </h3>
            
            {!selectedDate ? (
              <div className="text-center py-10 text-neutral">
                <i className="fas fa-calendar-day text-4xl mb-3 block"></i>
                <p>Select a date from the calendar</p>
                <p className="text-xs mt-2">Past dates, fully booked dates, and already unavailable dates cannot be selected</p>
              </div>
            ) : (
              <div>
                <div className="bg-ocean-ice rounded-xl p-4 mb-4">
                  <p className="text-sm text-textSecondary">Selected Date</p>
                  <p className="text-md font-semibold text-textPrimary">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  <p className="text-sm text-textSecondary mt-2">
                    Maximum Capacity: <strong>{dayTour.maxCapacity} guests</strong>
                  </p>
                  <p className="text-sm text-textSecondary mt-1">
                    Reserved Guests: <strong className={getBookedGuestsCount(selectedDate) > 0 ? 'text-red-600' : 'text-green-600'}>
                      {getBookedGuestsCount(selectedDate)} / {dayTour.maxCapacity}
                    </strong>
                  </p>
                </div>
                
                {/* Show error if there are existing reservations */}
                {getBookedGuestsCount(selectedDate) > 0 && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">
                      <i className="fas fa-exclamation-triangle mr-2"></i>
                      This date cannot be marked as unavailable because there are {getBookedGuestsCount(selectedDate)} existing reservation(s).
                    </p>
                  </div>
                )}
                
                <label className="block text-sm font-medium text-textPrimary mb-2">
                  Reason for marking unavailable <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Maintenance, Private Event, Holiday, etc."
                  rows="3"
                  className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light mb-4"
                  disabled={getBookedGuestsCount(selectedDate) > 0}
                />
                
                <button
                  onClick={handleMarkUnavailable}
                  disabled={actionLoading || !reason.trim() || getBookedGuestsCount(selectedDate) > 0}
                  className={`w-full py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    getBookedGuestsCount(selectedDate) > 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-orange-600 hover:bg-orange-700 text-white'
                  }`}
                >
                  {actionLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-ban"></i>}
                  Mark as Not Available
                </button>
                
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-full mt-3 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm hover:bg-ocean-ice transition"
                >
                  Cancel Selection
                </button>
              </div>
            )}
          </div>

          {/* Unavailable Dates Button - Placed below Mark Date as Unavailable container */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
          >
            <i className="fas fa-calendar-times text-sm"></i>
            Unavailable Dates
          </button>
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
          
          {/* Sidebar that slides in from right */}
          <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Sidebar Header */}
            <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-4 flex justify-between items-center z-10 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <i className="fas fa-calendar-times"></i> Unavailable Dates
                </h2>
                <p className="text-white/80 text-xs mt-1">List of all dates marked as unavailable</p>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-white hover:text-white/80 transition-colors"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            
            {/* Scrollable Content - Same as original Unavailable Dates container */}
            <div className="flex-1 overflow-y-auto p-5">
              {unavailableDatesList.length === 0 ? (
                <div className="text-center py-12 text-neutral">
                  <i className="fas fa-check-circle text-4xl mb-3 block text-green-400"></i>
                  <p className="text-sm">No unavailable dates</p>
                  <p className="text-xs mt-1">All dates are available for booking</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {unavailableDatesList.map((item) => (
                    <div key={item.id} className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-orange-800">
                            {formatDateDisplay(item.date)}
                          </p>
                          <p className="text-xs text-orange-600 mt-2">
                            <span className="font-medium">Reason:</span> {item.reason}
                          </p>
                          <p className="text-xs text-orange-400 mt-1">
                            Marked on: {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoveConfirm(item)}
                          disabled={actionLoading}
                          className="ml-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                        >
                          <i className="fas fa-trash-alt text-xs"></i> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Remove Confirmation Modal */}
      {removeConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-ocean-light/10">
            <h4 className="text-lg font-bold text-textPrimary mb-2">Remove unavailable date?</h4>
            <p className="text-sm text-textSecondary mb-1">
              {formatDateDisplay(removeConfirm.date)}
            </p>
            <p className="text-sm text-textSecondary mb-4">
              Reason: {removeConfirm.reason}
            </p>
            <p className="text-sm text-textPrimary mb-6">
              This will make this date available for day tour bookings again.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setRemoveConfirm(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl border border-ocean-light/20 text-textSecondary text-sm font-medium hover:bg-ocean-ice transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemoveUnavailable(removeConfirm.date, removeConfirm.id)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {actionLoading ? <i className="fas fa-spinner fa-spin"></i> : 'Remove'}
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
        .animate-slideInRight { animation: slideInRight 0.3s ease-out; }
      `}</style>
    </div>
  );
}