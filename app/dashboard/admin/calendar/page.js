// app/dashboard/admin/calendar/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { logAdminAction } from '@/lib/auditLogger';
import Link from 'next/link';

export default function AdminCalendar() {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomDetails, setRoomDetails] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [reason, setReason] = useState('');
  const [unitsToBlock, setUnitsToBlock] = useState(1);
  const [unitsBlockInputError, setUnitsBlockInputError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [unavailableEntries, setUnavailableEntries] = useState([]);
  const [totalBlockedUnitsByDate, setTotalBlockedUnitsByDate] = useState({});
  const [blockTimeRange, setBlockTimeRange] = useState('both'); // 'morning' | 'afternoon' | 'both'

  const TIME_RANGES = {
    morning: { startHour: 0, endHour: 12, label: '12:00 AM – 12:00 PM' },
    afternoon: { startHour: 14, endHour: 24, label: '2:00 PM – 12:00 AM' },
    both: { label: 'Both time ranges' }
  };

  // Fetch rooms list (only non-archived)
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsList = [];
      snapshot.forEach(doc => {
        roomsList.push({ id: doc.id, ...doc.data() });
      });
      setRooms(roomsList);
      if (roomsList.length > 0 && !selectedRoomId) {
        setSelectedRoomId(roomsList[0].id);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch room details
  useEffect(() => {
    if (!selectedRoomId) return;
    const roomRef = doc(db, 'rooms', selectedRoomId);
    const unsubscribe = onSnapshot(roomRef, (snap) => {
      if (snap.exists()) setRoomDetails(snap.data());
      else setRoomDetails(null);
    });
    return () => unsubscribe();
  }, [selectedRoomId]);

  // Fetch bookings
  useEffect(() => {
    if (!selectedRoomId) return;
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('roomId', '==', selectedRoomId),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booked = {};
      snapshot.forEach(docSnap => {
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
            for (let h = 0; h < 24; h++) booked[dateKey].times[`${h}:00`] = 0;
          }
          const startHour = current.getHours();
          const endHour = current.toDateString() === checkOut.toDateString() ? checkOut.getHours() : 24;
          for (let h = startHour; h < endHour; h++) {
            booked[dateKey].times[`${h}:00`] += numberOfRooms;
          }
          current.setDate(current.getDate() + 1);
          current.setHours(0, 0, 0, 0);
        }
      });
      setBookedDates(booked);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedRoomId]);

  const toJsDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const toLocalDateKey = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const totalRoomUnits = (() => {
    if (!roomDetails) return 1;
    const total = parseInt(roomDetails.totalRooms) || 1;
    const maintenance = parseInt(roomDetails.maintenanceRooms) || 0;
    return Math.max(0, total - maintenance);
  })();

  const getBlockedUnitsAtHour = (dateKey, hour) => {
    const day = blockedSlots[dateKey];
    if (!day) return 0;
    const byHour = day[hour] || 0;
    const fullDay = day[0] || 0; // legacy aggregate
    return Math.max(byHour, fullDay);
  };

  const isAdminRangeFullyUnavailable = (date, rangeKey) => {
    if (!date || totalRoomUnits <= 0) return false;
    const dateKey = toLocalDateKey(date);
    const range = TIME_RANGES[rangeKey];
    if (!range || range.startHour == null || range.endHour == null) return false;
    for (let h = range.startHour; h < range.endHour; h++) {
      if (getBlockedUnitsAtHour(dateKey, h) < totalRoomUnits) return false;
    }
    return true;
  };

  const getAdminBlockingStatus = (date) => {
    const morningClosed = isAdminRangeFullyUnavailable(date, 'morning');
    const afternoonClosed = isAdminRangeFullyUnavailable(date, 'afternoon');
    if (morningClosed && afternoonClosed) return { status: 'fullyBlocked', morningClosed, afternoonClosed };
    if (morningClosed || afternoonClosed) return { status: 'partiallyBlocked', morningClosed, afternoonClosed };
    return { status: 'none', morningClosed, afternoonClosed };
  };

  // Calculate total blocked units per date for display (legacy full-day entries only)
  const calculateTotalBlockedUnitsByDate = (entries) => {
    const totals = {};
    entries.forEach(entry => {
      if (!entry.isPartial && entry.unitsBlocked) {
        const dateKey = entry.date;
        totals[dateKey] = (totals[dateKey] || 0) + entry.unitsBlocked;
      }
    });
    return totals;
  };

  // Fetch blocked dates (full day blocks)
  useEffect(() => {
    if (!selectedRoomId) return;
    const cap = totalRoomUnits;
    const blockedRef = collection(db, 'unavailableSlots');
    const q = query(blockedRef, where('roomId', '==', selectedRoomId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blocks = {};
      const entries = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const dateKey = data.date;
        const startHour = data.startHour;
        const endHour = data.endHour;
        const reasonText = data.reason;
        const rawUnits = data.unitsBlocked;
        const docUnits =
          rawUnits != null
            ? Math.min(cap, Math.max(1, parseInt(rawUnits, 10) || 0))
            : cap;
        
        if (!blocks[dateKey]) blocks[dateKey] = {};
        
        if (startHour === 0 && endHour === 24) {
          // Keep legacy aggregate, but also fill per-hour slots so time-range logic works consistently.
          const prevTotal = blocks[dateKey][0] || 0;
          blocks[dateKey][0] = Math.min(cap, prevTotal + docUnits);
          for (let hour = 0; hour < 24; hour++) {
            const prev = blocks[dateKey][hour] || 0;
            blocks[dateKey][hour] = Math.min(cap, prev + docUnits);
          }
          entries.push({
            id: docSnap.id,
            date: dateKey,
            reason: reasonText,
            unitsBlocked: docUnits,
            createdAt: data.createdAt,
            startHour: 0,
            endHour: 24,
            createdAtFormatted: data.createdAt ? new Date(data.createdAt).toLocaleString() : new Date().toLocaleString()
          });
        } else {
          for (let hour = startHour; hour < endHour; hour++) {
            const prev = blocks[dateKey][hour] || 0;
            blocks[dateKey][hour] = Math.min(cap, prev + docUnits);
          }
          let coversFullDay = true;
          for (let hour = 0; hour < 24; hour++) {
            if ((blocks[dateKey][hour] || 0) < docUnits) {
              coversFullDay = false;
              break;
            }
          }
          if (coversFullDay) {
            const prevTotal = blocks[dateKey][0] || 0;
            blocks[dateKey][0] = Math.min(cap, prevTotal + docUnits);
            entries.push({
              id: docSnap.id,
              date: dateKey,
              reason: reasonText,
              unitsBlocked: docUnits,
              createdAt: data.createdAt,
              startHour: 0,
              endHour: 24,
              createdAtFormatted: data.createdAt ? new Date(data.createdAt).toLocaleString() : new Date().toLocaleString()
            });
          } else {
            entries.push({
              id: docSnap.id,
              date: dateKey,
              reason: reasonText,
              unitsBlocked: docUnits,
              startHour: startHour,
              endHour: endHour,
              isPartial: true,
              createdAt: data.createdAt,
              createdAtFormatted: data.createdAt ? new Date(data.createdAt).toLocaleString() : new Date().toLocaleString()
            });
          }
        }
      });
      setBlockedSlots(blocks);
      setUnavailableEntries(
        entries.sort((a, b) => {
          const byDate = a.date.localeCompare(b.date);
          if (byDate !== 0) return byDate;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        })
      );
      setTotalBlockedUnitsByDate(calculateTotalBlockedUnitsByDate(entries));
    });
    return () => unsubscribe();
  }, [selectedRoomId, totalRoomUnits]);

  useEffect(() => {
    setUnitsToBlock((u) => {
      const n = typeof u === 'number' && Number.isFinite(u) ? u : 1;
      const cap = Math.max(1, totalRoomUnits);
      return Math.min(Math.max(1, n), cap);
    });
  }, [totalRoomUnits]);

  // Check if date is fully booked by guests (all units booked)
  const isDateFullyBookedByGuests = (date) => {
    if (!date || totalRoomUnits <= 0) return false;
    // Fully booked should be based on check-in window availability (2:00 PM onwards).
    for (let hour = 14; hour < 24; hour++) {
      const d = new Date(date);
      d.setHours(hour, 0, 0, 0);
      const bookingDateKey = d.toDateString();
      const bookedCount = bookedDates[bookingDateKey]?.times?.[`${hour}:00`] || 0;
      if (bookedCount < totalRoomUnits) return false;
    }
    return true;
  };

  // Check if date is fully blocked by admin (all units admin-blocked - using aggregated total)
  const isDateFullyBlockedByAdmin = (date) => {
    if (!date || totalRoomUnits <= 0) return false;
    return getAdminBlockingStatus(date).status === 'fullyBlocked';
  };

  // Check if date is partially blocked (some units admin-blocked)
  const isDatePartiallyBlocked = (date) => {
    if (!date || totalRoomUnits <= 0) return false;
    return getAdminBlockingStatus(date).status === 'partiallyBlocked';
  };

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const getAvailableUnitsForDateRange = (date, startHour, endHour) => {
    if (!date || totalRoomUnits <= 0) return 0;
    const dateKey = toLocalDateKey(date);
    const bookingDateKey = date.toDateString();
    let maxUsed = 0;
    for (let hour = startHour; hour < endHour; hour++) {
      const bookedCount = bookedDates[bookingDateKey]?.times?.[`${hour}:00`] || 0;
      const blockedCount = getBlockedUnitsAtHour(dateKey, hour);
      maxUsed = Math.max(maxUsed, bookedCount + blockedCount);
    }
    return Math.max(0, totalRoomUnits - maxUsed);
  };

  const getAvailableUnitsForDate = (date) => {
    if (!date || totalRoomUnits <= 0) return 0;
    // Check availability for the check-in window (2:00 PM onwards)
    let maxUsed = 0;
    for (let hour = 14; hour < 24; hour++) {
      const d = new Date(date);
      d.setHours(hour, 0, 0, 0);
      const bookingDateKey = d.toDateString();
      const dateKey = toLocalDateKey(date);
      const bookedCount = bookedDates[bookingDateKey]?.times?.[`${hour}:00`] || 0;
      const blockedCount = getBlockedUnitsAtHour(dateKey, hour);
      maxUsed = Math.max(maxUsed, bookedCount + blockedCount);
    }
    return Math.max(0, totalRoomUnits - maxUsed);
  };

  // Get available units for morning range (for blocking calculations)
  const getAvailableUnitsForMorning = (date) => {
    return getAvailableUnitsForDateRange(date, 0, 12);
  };

  // Get available units for afternoon range (for blocking calculations)
  const getAvailableUnitsForAfternoon = (date) => {
    return getAvailableUnitsForDateRange(date, 14, 24);
  };

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

  const handleDateSelect = (date) => {
    if (isDatePast(date)) return;
    setSelectedDate(date);
    setReason('');
    setUnitsToBlock(1);
    setBlockTimeRange('both');
    setUnitsBlockInputError('');
  };

  const handleMarkUnavailable = async () => {
    if (!selectedDate) {
      showNotification('Please select a date to block', 'error');
      return;
    }
    if (!reason.trim()) {
      showNotification('Please provide a reason for blocking this date', 'error');
      return;
    }
    
    const maxMorning = getAvailableUnitsForMorning(selectedDate);
    const maxAfternoon = getAvailableUnitsForAfternoon(selectedDate);
    const maxBlock =
      blockTimeRange === 'morning'
        ? maxMorning
        : blockTimeRange === 'afternoon'
          ? maxAfternoon
          : Math.min(maxMorning, maxAfternoon);
    if (maxBlock < 1) {
      showNotification('No units are available to block for this date.', 'error');
      return;
    }
    
    const nBlock = parseInt(unitsToBlock, 10);
    if (!Number.isFinite(nBlock) || nBlock < 1) {
      showNotification('Enter a valid number of units to block (at least 1).', 'error');
      return;
    }
    if (nBlock > maxBlock) {
      showNotification(
        `You cannot block more than ${maxBlock} unit(s); that is the current availability for this date.`,
        'error'
      );
      return;
    }
    if (unitsBlockInputError) {
      showNotification(unitsBlockInputError, 'error');
      return;
    }
    
    setActionLoading(true);
    try {
      const dateKey = toLocalDateKey(selectedDate);

      const createBlock = async (startHour, endHour) => {
        await addDoc(collection(db, 'unavailableSlots'), {
          roomId: selectedRoomId,
          date: dateKey,
          startHour,
          endHour,
          reason: reason.trim(),
          unitsBlocked: nBlock,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      };

      if (blockTimeRange === 'morning') {
        await createBlock(0, 12);
      } else if (blockTimeRange === 'afternoon') {
        await createBlock(14, 24);
      } else {
        // Both time ranges: create two separate entries (each retains its own reason).
        await createBlock(0, 12);
        await createBlock(14, 24);
      }
      
      await logAdminAction({
        action: 'Marked Date Unavailable',
        module: 'Room Calendar Management',
        details: `Room: ${roomDetails?.type || selectedRoomId}, Date: ${selectedDate.toDateString()}, Units: ${nBlock}, Range: ${TIME_RANGES[blockTimeRange]?.label || blockTimeRange}, Reason: ${reason}`
      });
      showNotification(`Date marked as Not Available for ${nBlock} unit(s)`, 'success');
      setReason('');
      setUnitsToBlock(1);
      setBlockTimeRange('both');
      setUnitsBlockInputError('');
      setSelectedDate(null);
    } catch (error) {
      console.error(error);
      showNotification('Failed to mark date as unavailable', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveBlock = async (blockId) => {
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'unavailableSlots', blockId));
      await logAdminAction({
        action: 'Removed Blocked Date',
        module: 'Room Calendar Management',
        details: `Removed blocked date from calendar`
      });
      setRemoveConfirm(null);
      showNotification('Block removed', 'success');
    } catch (error) {
      console.error(error);
      showNotification('Failed to remove block', 'error');
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
    return date.toDateString();
  };

  const days = getDaysInMonth(currentDate);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
    setUnitsToBlock(1);
  };
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
    setUnitsToBlock(1);
  };

  const getDateStatus = (date) => {
    if (isDatePast(date)) return 'past';
    const blockInfo = getAdminBlockingStatus(date);
    if (blockInfo.status === 'fullyBlocked') return 'fullyBlocked';
    if (isDateFullyBookedByGuests(date)) return 'fullyBooked';
    if (blockInfo.status === 'partiallyBlocked') {
      if (blockInfo.afternoonClosed) return 'checkInBlocked';
      if (blockInfo.morningClosed) return 'checkOutBlocked';
      return 'partiallyBlocked';
    }
    if (selectedDate && selectedDate.toDateString() === date.toDateString()) return 'selected';
    return 'available';
  };

  if (loading && rooms.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
        <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
      </div>
    );
  }

  const maxUnitsBlockable = selectedDate ? getAvailableUnitsForDate(selectedDate) : totalRoomUnits;

  return (
    <div className="p-6 bg-gradient-to-br from-ocean-ice to-blue-white min-h-screen">
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
          notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
        }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-textPrimary font-playfair mb-1">Calendar Management</h1>
          <p className="text-textSecondary">Manage room availability (block full days)</p>
        </div>
      </div>

      {/* Two‑column layout: Calendar (60%) and Right Column (40%) */}
      <div className="flex flex-col xl:flex-row gap-8 items-stretch">
        {/* Calendar (60%) */}
        <div className="xl:w-[60%]">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden h-full">
            <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-6 py-4">
              <h2 className="text-xl font-bold text-white">Availability Calendar</h2>
              <p className="text-white/80 text-sm">
                {roomDetails?.type || selectedRoomId} – {totalRoomUnits} unit(s) available
              </p>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <button onClick={goToPreviousMonth} className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice text-sm">
                  <i className="fas fa-chevron-left mr-1 text-xs"></i> Prev
                </button>
                <h2 className="text-lg font-semibold text-textPrimary">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                <button onClick={goToNextMonth} className="px-3 py-1.5 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice text-sm">
                  Next <i className="fas fa-chevron-right ml-1 text-xs"></i>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                  <div key={day} className="text-center font-semibold text-textSecondary text-xs py-1.5">{day}</div>
                ))}
              </div>

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
                      titleText = 'Fully Booked by Guests';
                      break;
                    case 'checkInBlocked':
                      bgColor = 'bg-yellow-100';
                      textColor = 'text-yellow-800';
                      cursorClass = 'cursor-pointer';
                      titleText = 'Check-in Blocked (2:00 PM – 12:00 AM)';
                      break;
                    case 'checkOutBlocked':
                      bgColor = 'bg-green-100';
                      textColor = 'text-green-800';
                      cursorClass = 'cursor-pointer';
                      titleText = 'Check-out Blocked (12:00 AM – 12:00 PM)';
                      break;
                    case 'fullyBlocked':
                      bgColor = 'bg-orange-100';
                      textColor = 'text-orange-700';
                      cursorClass = 'cursor-not-allowed';
                      titleText = 'Fully Blocked by Admin';
                      break;
                    case 'partiallyBlocked':
                      bgColor = 'bg-yellow-100';
                      textColor = 'text-yellow-800';
                      cursorClass = 'cursor-pointer';
                      titleText = 'Partially Blocked';
                      break;
                    case 'selected':
                      bgColor = 'bg-ocean-mid';
                      textColor = 'text-white';
                      titleText = 'Selected for blocking';
                      break;
                    default:
                      bgColor = 'bg-white';
                      textColor = 'text-textPrimary';
                      titleText = 'Available';
                  }
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => (status !== 'past' && status !== 'fullyBooked' && status !== 'fullyBlocked') && handleDateSelect(day)}
                      disabled={status === 'past' || status === 'fullyBooked' || status === 'fullyBlocked'}
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

              <div className="mt-6 pt-4 border-t border-ocean-light/10 flex justify-center gap-6 text-xs flex-wrap">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white border border-gray-300 rounded"></div><span>Available</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div><span>Fully Booked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div><span>Check-in Blocked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div><span>Check-out Blocked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div><span>Past Dates</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div><span>Fully Blocked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-ocean-mid rounded"></div><span>Selected</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (40%) – contains controls + Block Date container */}
        <div className="xl:w-[40%] flex flex-col h-full gap-4">
          {/* Controls: Room selector and Book for Guest button side by side */}
          <div className="flex flex-row items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <label className="text-sm font-medium text-textPrimary whitespace-nowrap">Select Room Type:</label>
              <select
                value={selectedRoomId}
                onChange={(e) => {
                  setSelectedRoomId(e.target.value);
                  setSelectedDate(null);
                  setUnitsToBlock(1);
                }}
                className="flex-1 px-4 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light bg-white"
              >
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>{room.type || room.name || room.id}</option>
                ))}
              </select>
            </div>
            <Link
              href={`/rooms?roomId=${selectedRoomId}&adminMode=true`}
              target="_blank"
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
            >
              <i className="fas fa-user-plus text-sm"></i> Book for Guest
            </Link>
          </div>

          {/* Block Date container – takes remaining vertical space */}
          <div className="bg-white rounded-2xl shadow-lg border border-ocean-light/10 p-5 flex-1">
            <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
              <i className="fas fa-calendar-times text-ocean-light"></i> Block Date
            </h3>
            
            {!selectedDate ? (
              <div className="text-center py-10 text-neutral">
                <i className="fas fa-calendar-day text-4xl mb-3 block"></i>
                <p>Select a date from the calendar to block</p>
                <p className="text-xs mt-2 text-textSecondary">Click on any available date to start</p>
              </div>
            ) : (
              <div>
                <div className="bg-ocean-ice rounded-xl p-4 mb-4">
                  <p className="text-sm text-textSecondary">Selected Date</p>
                  <p className="text-md font-semibold text-textPrimary">{selectedDate.toDateString()}</p>
                  <p className="text-sm text-textSecondary mt-1">Room Type: {roomDetails?.type || selectedRoomId}</p>
                  <p className="text-sm text-textSecondary mt-1">
                    Available units: <span className="font-semibold text-green-600">{maxUnitsBlockable}</span> of {totalRoomUnits}
                  </p>
                </div>
                
                <label className="block text-sm font-medium text-textPrimary mb-2">
                  Time Range to Block <span className="text-red-500">*</span>
                </label>
                <div className="mb-4 grid grid-cols-1 gap-2">
                  {[
                    { key: 'morning', label: '12:00 AM – 12:00 PM' },
                    { key: 'afternoon', label: '2:00 PM – 12:00 AM' },
                    { key: 'both', label: 'Both time ranges' }
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setBlockTimeRange(opt.key)}
                      className={`w-full text-left px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
                        blockTimeRange === opt.key
                          ? 'border-ocean-mid bg-ocean-ice text-textPrimary'
                          : 'border-ocean-light/20 bg-white hover:bg-ocean-ice/60 text-textSecondary'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`w-3 h-3 rounded-full border ${
                            blockTimeRange === opt.key ? 'bg-ocean-mid border-ocean-mid' : 'bg-white border-ocean-light/30'
                          }`}
                        ></span>
                        {opt.label}
                      </span>
                      {opt.key !== 'both' && (
                        <span className="block text-xs text-textSecondary mt-1">
                          This will mark the selected time window as unavailable for the chosen number of units.
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {totalRoomUnits > 0 && (
                  <>
                    <label className="block text-sm font-medium text-textPrimary mb-2">
                      Units to mark unavailable <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-textSecondary mb-2">
                      This room type has {totalRoomUnits} unit(s) in service.
                      Currently <strong>{maxUnitsBlockable}</strong> unit(s) are available to block on this date.
                    </p>
                    {maxUnitsBlockable < 1 ? (
                      <p className="text-sm text-red-600 mb-4">
                        No units remain available to block on this date. Choose a different date.
                      </p>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={1}
                          max={maxUnitsBlockable}
                          value={unitsToBlock}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setUnitsToBlock('');
                              setUnitsBlockInputError('');
                              return;
                            }
                            const v = parseInt(raw, 10);
                            if (Number.isNaN(v)) return;
                            setUnitsToBlock(v);
                            if (v > maxUnitsBlockable) {
                              setUnitsBlockInputError(
                                `You cannot block more than ${maxUnitsBlockable} unit(s); that is the current availability for this date.`
                              );
                            } else if (v < 1) {
                              setUnitsBlockInputError('Enter at least 1 unit.');
                            } else {
                              setUnitsBlockInputError('');
                            }
                          }}
                          onBlur={() => {
                            if (unitsToBlock === '' || !Number.isFinite(unitsToBlock)) {
                              setUnitsToBlock(1);
                              setUnitsBlockInputError('');
                              return;
                            }
                            const clamped = Math.min(Math.max(1, unitsToBlock), maxUnitsBlockable);
                            if (clamped !== unitsToBlock) {
                              setUnitsToBlock(clamped);
                            }
                            setUnitsBlockInputError('');
                          }}
                          className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-ocean-light bg-white ${
                            unitsBlockInputError ? 'border-red-400 mb-1' : 'border-ocean-light/20 mb-4'
                          }`}
                        />
                        {unitsBlockInputError && (
                          <p className="text-xs text-red-600 mb-4" role="alert">
                            {unitsBlockInputError}
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
                
                <label className="block text-sm font-medium text-textPrimary mb-2">
                  Reason for blocking <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Maintenance, Private Event, Renovation, etc."
                  rows="3"
                  className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light mb-4"
                />
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedDate(null);
                      setReason('');
                      setUnitsBlockInputError('');
                    }}
                    className="flex-1 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkUnavailable}
                    disabled={
                      actionLoading ||
                      !reason.trim() ||
                      totalRoomUnits < 1 ||
                      maxUnitsBlockable < 1 ||
                      unitsToBlock === '' ||
                      !Number.isFinite(unitsToBlock) ||
                      unitsToBlock < 1 ||
                      unitsToBlock > maxUnitsBlockable ||
                      !!unitsBlockInputError
                    }
                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                  >
                    {actionLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-ban mr-2"></i>}
                    Block Date
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Blocked Dates container (full width, below both columns) */}
      <div className="mt-8 bg-white rounded-2xl shadow-lg border border-ocean-light/10 p-5">
        <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
          <i className="fas fa-calendar-times text-orange-500"></i> Blocked Dates
        </h3>
        {unavailableEntries.length === 0 ? (
          <div className="text-center py-8 text-neutral">
            <i className="fas fa-check-circle text-3xl mb-2 block text-green-400"></i>
            <p className="text-sm">No blocked dates</p>
            <p className="text-xs mt-1">All dates are available for booking</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unavailableEntries.map((entry) => {
              const dateKey = entry.date;
              const totalBlockedForDate = totalBlockedUnitsByDate[dateKey] || 0;
              const remainingAvailable = Math.max(0, totalRoomUnits - totalBlockedForDate);
              const entryRangeLabel =
                entry.startHour === 0 && entry.endHour === 12
                  ? '12:00 AM – 12:00 PM'
                  : entry.startHour === 14 && entry.endHour === 24
                    ? '2:00 PM – 12:00 AM'
                    : entry.startHour === 0 && entry.endHour === 24
                      ? 'Full day'
                      : entry.startHour != null && entry.endHour != null
                        ? `${entry.startHour}:00 – ${entry.endHour}:00`
                        : 'Unknown range';
              
              return (
                <div key={entry.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-orange-800">
                        {formatDateDisplay(entry.date)}
                      </p>
                      <p className="text-xs text-orange-700 mt-0.5">
                        This entry: {entry.unitsBlocked} unit(s) blocked
                        <span className="ml-1 text-amber-700">({entryRangeLabel})</span>
                      </p>
                      <p className="text-xs text-orange-700">
                        Total blocked: {totalBlockedForDate} of {totalRoomUnits} units
                        {totalBlockedForDate >= totalRoomUnits 
                          ? ' (Fully blocked - 0 available)' 
                          : ` (${remainingAvailable} available)`}
                      </p>
                      <p className="text-xs text-orange-600 mt-2">
                        <span className="font-medium">Reason:</span> {entry.reason}
                      </p>
                      <p className="text-xs text-orange-500 mt-1">
                        <span className="font-medium">Blocked on:</span> {entry.createdAtFormatted}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoveConfirm(entry)}
                      disabled={actionLoading}
                      className="ml-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 flex items-center gap-1"
                    >
                      <i className="fas fa-trash-alt text-xs"></i> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {removeConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-block-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-ocean-light/10">
            <h4 id="remove-block-title" className="text-lg font-bold text-textPrimary mb-2">
              Remove blocked date?
            </h4>
            <p className="text-sm text-textSecondary mb-1">
              {formatDateDisplay(removeConfirm.date)}
            </p>
            <p className="text-sm text-textSecondary mb-1">
              Reason: {removeConfirm.reason}
            </p>
            <p className="text-sm text-textPrimary mb-6">
              This will restore availability for this block entry. Other blocks on the same date will remain.
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
                onClick={() => handleRemoveBlock(removeConfirm.id)}
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