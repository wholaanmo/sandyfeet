// app/dashboard/admin/calendar/page.js
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { logAdminAction } from '@/lib/auditLogger';
import Link from 'next/link';

export default function AdminCalendar() {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomDetails, setRoomDetails] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookedDates, setBookedDates] = useState({});
  const [exclusiveResortDates, setExclusiveResortDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [reason, setReason] = useState('');
  const [unitsToBlock, setUnitsToBlock] = useState(1);
  const [unitsBlockInputError, setUnitsBlockInputError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [editingBlockEntry, setEditingBlockEntry] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [unavailableEntries, setUnavailableEntries] = useState([]);
  const [totalBlockedUnitsByDate, setTotalBlockedUnitsByDate] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Compute total available units (total rooms minus maintenance)
  const totalRoomUnits = useMemo(() => {
    if (!roomDetails) return 1;
    const total = parseInt(roomDetails.totalRooms) || 1;
    const maintenance = parseInt(roomDetails.maintenanceRooms) || 0;
    return Math.max(0, total - maintenance);
  }, [roomDetails]);

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

  // Fetch bookings (depends on totalRoomUnits)
  useEffect(() => {
    if (!selectedRoomId) return;
    const bookingsRef = collection(db, 'bookings');
    const qRoom = query(
      bookingsRef,
      where('roomId', '==', selectedRoomId),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    const qExclusive = query(
      bookingsRef,
      where('isExclusiveResortBooking', '==', true),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );

    let roomSnapshot = null;
    let exclusiveSnapshot = null;

    const recompute = () => {
      const booked = {};
      const exclusiveDates = {};

      const applyBooking = (booking, options = {}) => {
        const checkIn = toJsDate(booking.checkIn);
        const checkOut = toJsDate(booking.checkOut);
        const numberOfRooms = options.forceUnits ?? (booking.numberOfRooms || 1);
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

          if (booking.isExclusiveResortBooking) {
            const overlapsCheckInWindow = Math.max(startHour, 14) < endHour;
            if (overlapsCheckInWindow) {
              exclusiveDates[toLocalDateKey(current)] = true;
            }
          }

          current.setDate(current.getDate() + 1);
          current.setHours(0, 0, 0, 0);
        }
      };

      if (roomSnapshot) {
        roomSnapshot.forEach((docSnap) => applyBooking(docSnap.data()));
      }

      // Entire Resort Package: block this room type even if the booking doc is for a different roomId.
      if (exclusiveSnapshot) {
        exclusiveSnapshot.forEach((docSnap) => {
          const booking = docSnap.data();
          applyBooking(booking, { forceUnits: Math.max(0, totalRoomUnits) });
        });
      }

      setBookedDates(booked);
      setExclusiveResortDates(exclusiveDates);
      setLoading(false);
    };

    const unsubRoom = onSnapshot(qRoom, (snapshot) => {
      roomSnapshot = snapshot;
      recompute();
    });

    const unsubExclusive = onSnapshot(qExclusive, (snapshot) => {
      exclusiveSnapshot = snapshot;
      recompute();
    });

    return () => {
      unsubRoom();
      unsubExclusive();
    };
  }, [selectedRoomId, totalRoomUnits]);

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

  const getBlockedUnitsAtHour = (dateKey, hour) => {
    const day = blockedSlots[dateKey];
    if (!day) return 0;
    const atThisHour = day[hour] || 0;
    const atHour0 = day[0] || 0;
    // Hour 0 is both a real slot (12:00 AM–1:00 AM) and, in legacy data, the only
    // stored value for a full-day block. When any other hour has blocked units,
    // treat keys as per-hour only (matches app/rooms/calendar blockedSlots usage).
    let hasPerHourDataBeyondHour0 = false;
    for (let h = 1; h < 24; h++) {
      if ((day[h] || 0) > 0) {
        hasPerHourDataBeyondHour0 = true;
        break;
      }
    }
    if (!hasPerHourDataBeyondHour0 && atHour0 > 0) {
      return atHour0;
    }
    return atThisHour;
  };

  const getAdminBlockedUnitsForDate = (date) => {
    if (!date) return 0;
    const dateKey = toLocalDateKey(date);
    return Math.min(totalRoomUnits, totalBlockedUnitsByDate[dateKey] || 0);
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

  // Check if date is fully blocked by admin (all units admin-blocked for that date)
  const isDateFullyBlockedByAdmin = (date) => {
    if (!date || totalRoomUnits <= 0) return false;
    return getAdminBlockedUnitsForDate(date) >= totalRoomUnits;
  };

  const isDatePast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
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

  const hasExclusiveResortBookingOnDate = (date) => {
    if (!date) return false;
    return Boolean(exclusiveResortDates[toLocalDateKey(date)]);
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
    setEditingBlockEntry(null);
    setReason('');
    setUnitsToBlock(1);
    setUnitsBlockInputError('');
  };

  const handleMarkUnavailable = async () => {
    if (!selectedDate) {
      showNotification('Please select a date to block', 'error');
      return;
    }
    const maxBlockBase = getAvailableUnitsForDate(selectedDate);
    const maxBlock = editingBlockEntry
      ? Math.min(totalRoomUnits, maxBlockBase + (editingBlockEntry.unitsBlocked || 0))
      : maxBlockBase;
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

      if (editingBlockEntry?.id) {
        await updateDoc(doc(db, 'unavailableSlots', editingBlockEntry.id), {
          reason: reason.trim(),
          unitsBlocked: nBlock,
          updatedAt: new Date().toISOString()
        });

        await logAdminAction({
          action: 'Updated Blocked Date',
          module: 'Calendar Management',
          details: `Room: ${roomDetails?.type || selectedRoomId}, Date: ${selectedDate.toDateString()}, Units: ${nBlock}, Reason: ${reason}`
        });
        showNotification(`Blocked entry updated for ${nBlock} unit(s)`, 'success');
      } else {
        await addDoc(collection(db, 'unavailableSlots'), {
          roomId: selectedRoomId,
          date: dateKey,
          startHour: 0,
          endHour: 24,
          reason: reason.trim(),
          unitsBlocked: nBlock,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await logAdminAction({
          action: 'Marked Date Unavailable',
          module: 'Calendar Management',
          details: `Room: ${roomDetails?.type || selectedRoomId}, Date: ${selectedDate.toDateString()}, Units: ${nBlock}, Reason: ${reason}`
        });
        showNotification(`Date marked as unavailable for ${nBlock} unit(s)`, 'success');
      }
      setReason('');
      setUnitsToBlock(1);
      setUnitsBlockInputError('');
      setEditingBlockEntry(null);
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
        module: 'Calendar Management',
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
    if (isDateFullyBlockedByAdmin(date)) return 'fullyBlocked';
    if (isDateFullyBookedByGuests(date)) return 'fullyBooked';
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

  const maxUnitsBlockable = selectedDate
    ? (
      editingBlockEntry
        ? Math.min(totalRoomUnits, getAvailableUnitsForDate(selectedDate) + (editingBlockEntry.unitsBlocked || 0))
        : getAvailableUnitsForDate(selectedDate)
    )
    : totalRoomUnits;
  const hasEditBlockChanges = editingBlockEntry
    ? (
      Number(unitsToBlock) !== Number(editingBlockEntry.unitsBlocked || 0) ||
      reason.trim() !== (editingBlockEntry.reason || '').trim()
    )
    : true;

  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen pb-12" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
          notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
        }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Two‑column layout: Calendar (60%) and Right Column (40%) */}
      <div className="flex flex-col xl:flex-row gap-8 items-stretch">
        {/* Calendar (60%) */}
        <div className="xl:w-[60%]">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden h-full">
           <div className="bg-[#4D8CF5]/10 px-6 py-4 border-b border-[#4D8CF5]/20">
  <h2 className="text-lg sm:text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
    Availability Calendar
  </h2>

  <p className="text-[#1E3A8A]/70 text-xs sm:text-sm mt-1">
    {roomDetails?.type || selectedRoomId} –{" "}
    <span>
      {totalRoomUnits} unit(s)
    </span>{" "}
    available
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
                  const hasExclusive = hasExclusiveResortBookingOnDate(day);
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
                      titleText = 'Fully booked by guests';
                      break;
                    case 'fullyBlocked':
                      bgColor = 'bg-orange-100';
                      textColor = 'text-orange-700';
                      cursorClass = 'cursor-not-allowed';
                      titleText = 'Unavailable';
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
                      onClick={() =>
                        status !== 'past' &&
                        status !== 'fullyBooked' &&
                        status !== 'fullyBlocked' &&
                        handleDateSelect(day)
                      }
                      disabled={
                        status === 'past' ||
                        status === 'fullyBooked' ||
                        status === 'fullyBlocked'
                      }
                      title={hasExclusive ? `${titleText} • Includes Entire Resort booking` : titleText}
                      className={`relative w-full pt-[100%] rounded-lg transition-all duration-200 ${bgColor} ${borderClass} ${cursorClass} ${hasExclusive ? 'ring-2 ring-amber-300' : ''}`}
                    >
                      <span className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${textColor}`}>
                        {day.getDate()}
                      </span>
                      {hasExclusive && (
                        <span className="absolute top-1 right-1 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-bold leading-none border border-amber-200">
                          ER
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-ocean-light/10 flex justify-center gap-6 text-xs flex-wrap">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white border border-gray-300 rounded"></div><span>Available</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div><span>Fully booked</span></div>
                <div className="flex items-center gap-1.5">
                </div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div><span>Past Dates</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div><span>Unavailable</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-100 border border-amber-400 ring-1 ring-amber-300"></div><span>Entire Resort Booked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-ocean-mid rounded"></div><span>Selected</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (40%) – contains controls + Block Date container */}
        <div className="xl:w-[40%] flex flex-col h-full gap-4">
          {/* Controls: Room selector and Book for Guest button - Equal width with Block Date container */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
<div className="flex-1 flex items-center gap-3">
  <label className="text-sm font-medium text-textPrimary whitespace-nowrap">
    Room Type:
  </label>
<div className="relative" style={{ width: '145px' }}>
  <select
    value={selectedRoomId}
    onChange={(e) => {
      setSelectedRoomId(e.target.value);
      setSelectedDate(null);
      setUnitsToBlock(1);
    }}
    className="w-full px-4 py-2 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm bg-white text-textPrimary shadow-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20 focus:border-[#4D8CF5] hover:border-[#4D8CF5]/70 transition-all duration-200 appearance-none"
  >
    {rooms?.map((room) => (
      <option key={room.id} value={room.id}>
        {room.type || room.name || room.id}
      </option>
    ))}
  </select>

  {/* Custom dropdown arrow (fixes 🇻 issue) */}
  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
    ▼
  </div>
</div>
</div>
<div className="sm:w-auto flex items-end">
  <Link
    href={`/rooms?roomId=${selectedRoomId}&adminMode=true`}
    target="_blank"
    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2
               bg-[#4D8CF5] text-white border border-[#4D8CF5]
               rounded-xl font-medium shadow-sm
               hover:bg-[#3B78E7] hover:border-[#3B78E7]
               hover:shadow-md hover:-translate-y-0.5
               transition-all duration-300 whitespace-nowrap"
  >
    <i className="fas fa-user-plus text-sm"></i>
    Book for Guest
  </Link>
</div>
            </div>
          </div>

                    {/* List of Block Dates Button - Placed below Block Date container */}
<button
  onClick={() => setIsSidebarOpen(true)}
  className="w-full py-3 bg-white border-2 border-[#4D8CF5]/40 text-[#1E3A8A] rounded-xl shadow-sm transition-all duration-300 flex items-center justify-center gap-2 hover:bg-[#4D8CF5]/5 hover:border-[#4D8CF5]/40 hover:shadow-md hover:-translate-y-0.5">
  <div className="flex flex-col items-center">
    <div className="flex items-center gap-2 font-semibold text-sm text-[#1E3A8A]">
      <i className="fas fa-list-ul text-[#1E3A8A] text-sm"></i>
      List of Blocked Room Availability
    </div>

    <span className="text-[10px] font-normal text-[#1E3A8A]/80">
      Click to view list of all dates with blocked room availability
    </span>
  </div>
</button>

          {/* Block Date container – takes remaining vertical space */}
 <div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/15 p-5 flex-1">
  <h3 className="text-lg font-bold text-[#1E3A8A] mb-4 flex items-center gap-2">
    <i className="fas fa-calendar-times text-[#4D8CF5]"></i>
    Block Room Availability
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
      {editingBlockEntry && (
        <div className="mb-4 p-3 bg-[#4D8CF5]/10 border border-[#4D8CF5]/20 rounded-lg">
          <p className="text-sm text-[#1E3A8A]">
            <i className="fas fa-edit mr-2 text-[#4D8CF5]"></i>
            Editing blocked date entry
          </p>
        </div>
      )}

      <div className="bg-[#4D8CF5]/5 rounded-xl p-4 mb-4 border border-[#4D8CF5]/10">
        <p className="text-sm text-[#1E3A8A]/60">Selected Date</p>
        <p className="text-md font-semibold text-[#1E3A8A]">
          {selectedDate.toDateString()}
        </p>

        <p className="text-sm text-[#1E3A8A]/60 mt-1">
          Room Type: {roomDetails?.type || selectedRoomId}
        </p>

        <p className="text-sm text-[#1E3A8A]/60 mt-1">
          Available units:{" "}
          <span className="font-semibold text-green-600">
            {maxUnitsBlockable}
          </span>{" "}
          of {totalRoomUnits}
        </p>

        {hasExclusiveResortBookingOnDate(selectedDate) && (
          <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-flex items-center gap-1">
            <i className="fas fa-star text-[10px]"></i>
            Entire Resort booking is active on this date.
          </p>
        )}
      </div>

      {totalRoomUnits > 0 && (
        <>
          <label className="block text-sm font-medium text-[#1E3A8A] mb-2">
            Units to mark unavailable <span className="text-red-500">*</span>
          </label>

          <p className="text-xs text-[#1E3A8A]/50 mb-2">
            This room type has {totalRoomUnits} unit(s) in service. Currently{" "}
            <strong>{maxUnitsBlockable}</strong> unit(s) are available to block
            on this date.
          </p>

          {maxUnitsBlockable < 1 ? (
            <p className="text-sm text-red-500 mb-4">
              No units remain available to block on this date. Choose a
              different date.
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
                      `You cannot block more than ${maxUnitsBlockable} unit(s).`
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
                  const clamped = Math.min(
                    Math.max(1, unitsToBlock),
                    maxUnitsBlockable
                  );
                  if (clamped !== unitsToBlock) {
                    setUnitsToBlock(clamped);
                  }
                  setUnitsBlockInputError('');
                }}
                className={`w-full px-3 py-2 border rounded-xl text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/30 focus:border-[#4D8CF5]
                  transition-all duration-200
                  ${
                    unitsBlockInputError
                      ? 'border-red-400 mb-1'
                      : 'border-[#4D8CF5]/20 mb-4'
                  }`}
              />

              {unitsBlockInputError && (
                <p className="text-xs text-red-500 mb-4" role="alert">
                  {unitsBlockInputError}
                </p>
              )}
            </>
          )}
        </>
      )}

      <label className="block text-sm font-medium text-[#1E3A8A] mb-2">
        Reason for blocking (optional)
      </label>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g., Maintenance, Private Event, Renovation, etc."
        rows="3"
        className="w-full px-3 py-2 border border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/30 focus:border-[#4D8CF5] mb-4 transition-all duration-200"/>

      {/* BUTTONS (now same structure style as earlier system) */}
<button
  onClick={handleMarkUnavailable}
  disabled={
    actionLoading ||
    totalRoomUnits < 1 ||
    maxUnitsBlockable < 1 ||
    unitsToBlock === '' ||
    !Number.isFinite(unitsToBlock) ||
    unitsToBlock < 1 ||
    unitsToBlock > maxUnitsBlockable ||
    !!unitsBlockInputError ||
    !hasEditBlockChanges
  }
  className={`w-full py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2
    ${
      actionLoading ||
      totalRoomUnits < 1 ||
      maxUnitsBlockable < 1 ||
      unitsToBlock === '' ||
      !Number.isFinite(unitsToBlock) ||
      unitsToBlock < 1 ||
      unitsToBlock > maxUnitsBlockable ||
      !!unitsBlockInputError ||
      !hasEditBlockChanges
        ? 'bg-gray-300 text-white cursor-not-allowed'
        : 'bg-[#4D8CF5] hover:bg-[#3B78E7] text-white shadow-sm hover:shadow-md'
    }`}
>
  {actionLoading ? (
    <i className="fas fa-spinner fa-spin"></i>
  ) : (
    <i className="fas fa-ban"></i>
  )}
  {editingBlockEntry ? 'Update Unavailable Rooms' : 'Save Unavailable Rooms'}
</button>

<button
  onClick={() => {
    setSelectedDate(null);
    setEditingBlockEntry(null);
    setReason('');
    setUnitsBlockInputError('');
  }}
  className="w-full mt-3 py-2 border border-[#4D8CF5]/20 rounded-xl text-sm text-[#1E3A8A] hover:bg-[#4D8CF5]/5 transition-all duration-200">
  Cancel Selection
</button>
    </div>
  )}
</div>
        </div>
      </div>

      {/* Right Sidebar Modal for Blocked Dates */}
 {isSidebarOpen && (
  <>
    {/* Backdrop overlay */}
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 transition-opacity duration-300"
      onClick={() => setIsSidebarOpen(false)}
    />

    {/* Sidebar that slides in from right */}
    <div
      className={`fixed right-0 top-0 h-full w-full max-w-md bg-slate-50/95 backdrop-blur-2xl border-l border-slate-200/80 shadow-[0_0_50px_0_rgba(15,23,42,0.15)] z-50 transform transition-transform duration-300 ease-out flex flex-col ${
        isSidebarOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Sidebar Header */}
      <div className="sticky top-0 bg-[#F8FAFC]/90 backdrop-blur-lg border-b border-slate-200/80 px-6 py-4 flex justify-between items-center z-10 flex-shrink-0 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-[#1E3A8A] leading-tight flex flex-col items-start gap-1">
            Blocked Room Availability
          </h2>
          <p className="text-[#1E3A8A]/70 text-xs mt-1 font-medium">
            List of all dates with blocked room availability
          </p>
        </div>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-md border border-[#4D8CF5]/20 text-[#1E3A8A] shadow-sm transition-all duration-200 hover:bg-[#4D8CF5]/80 hover:text-white hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
 
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {unavailableEntries.length === 0 ? (
          <div className="flex items-center justify-center min-h-[300px] w-full">
            <div className="text-center bg-white border border-slate-200/60 p-8 rounded-2xl shadow-[0_2px_8px_-1px_rgba(15,23,42,0.03)]">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-calendar-check text-2xl text-[#4D8CF5]"></i>
              </div>
              <p className="text-[#1E3A8A] font-bold text-lg">No blocked dates</p>
              <p className="text-[#1E3A8A]/60 text-sm mt-1">No units have been set as unavailable for all dates yet.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {unavailableEntries.map((entry) => {
              const dateKey = entry.date;
              const totalBlockedForDate = totalBlockedUnitsByDate[dateKey] || 0;
              const remainingAvailable = Math.max(0, totalRoomUnits - totalBlockedForDate);
 
              const entryRangeLabel =
                entry.startHour === 0 && entry.endHour === 12
                  ? "12:00 AM – 12:00 PM"
                  : entry.startHour === 14 && entry.endHour === 24
                  ? "2:00 PM – 12:00 AM"
                  : entry.startHour === 0 && entry.endHour === 24
                  ? "Full day"
                  : entry.startHour != null && entry.endHour != null
                  ? `${entry.startHour}:00 – ${entry.endHour}:00`
                  : "Unknown range";
 
              return (
                <div
                  key={entry.id}
                  className="bg-white border-l-4 border-l-[#4D8CF5] border-y border-r border-slate-200/60 rounded-xl p-4 shadow-[0_2px_8px_-1px_rgba(15,23,42,0.03)] group hover:shadow-md hover:border-slate-300 hover:border-l-[#4D8CF5] transition-all duration-300"
                >
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-door-closed text-[#4D8CF5]"></i>
                      {formatDateDisplay(entry.date)}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const [year, month, day] = entry.date.split("-").map(Number);
                          setSelectedDate(new Date(year, month - 1, day));
                          setReason(entry.reason || "");
                          setUnitsToBlock(entry.unitsBlocked || 1);
                          setUnitsBlockInputError("");
                          setEditingBlockEntry(entry);
                          setIsSidebarOpen(false);
                        }}
                        disabled={actionLoading}
                        title="Edit blocked entry"
                        className="w-8 h-8 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center justify-center"
                      >
                        <i className="fas fa-edit text-xs"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveConfirm(entry)}
                        disabled={actionLoading}
                        title="Remove blocked entry"
                        className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50"
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    </div>
                  </div>
 
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Blocked Units</p>
                        <div className="flex items-center gap-2">
                          <i className="fas fa-door-closed text-[#4D8CF5]/60 text-xs"></i>
                          <p className="text-sm font-semibold text-[#1E3A8A]">{entry.unitsBlocked} unit(s)</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Time Range</p>
                        <div className="flex items-center gap-2">
                          <i className="fas fa-clock text-[#4D8CF5]/60 text-xs"></i>
                          <p className="text-[11px] font-semibold text-[#1E3A8A]">{entryRangeLabel}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 border-l border-[#4D8CF5]/10 pl-4">
                      <div>
                        <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Total Blocked</p>
                        <p className="text-sm font-bold text-[#1E3A8A]">
                          {totalBlockedForDate} of {totalRoomUnits}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Availability</p>
                        <p className={`text-[11px] font-bold ${remainingAvailable > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {remainingAvailable > 0 ? `${remainingAvailable} available` : 'Fully blocked'}
                        </p>
                      </div>
                    </div>
                  </div>
 
                  {entry.reason && (
                    <div className="mt-4 pt-3 border-t border-[#4D8CF5]/5">
                      <p className="text-[10px] text-[#1E3A8A]/50 uppercase font-bold tracking-wider mb-1">Note / Reason</p>
                      <p className="text-xs text-[#1E3A8A]/80 bg-[#4D8CF5]/5 p-2 rounded-lg border border-[#4D8CF5]/10">
                        {entry.reason}
                      </p>
                    </div>
                  )}
                  
                  <div className="mt-4 text-right">
                    <p className="text-[12px] text-[#1E3A8A]/40">
                      Blocked on: {entry.createdAtFormatted}
                    </p>
                  </div>
                </div>
              );
            })}
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
              <h3 className="text-lg font-bold text-textPrimary mb-2">Remove Blocked Date?</h3>
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
                This will restore availability for this block entry. This action cannot be undone.
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
                onClick={() => handleRemoveBlock(removeConfirm.id)} 
                disabled={actionLoading} 
                className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2"
              >
                {actionLoading && <i className="fas fa-spinner fa-spin"></i>}
                {actionLoading ? 'Removing...' : 'Remove Block'}
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