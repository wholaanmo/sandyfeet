// app/dashboard/staff/availability/page.js
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot, getDocs } from 'firebase/firestore';
import {
  aggregateDayTourGuestsFromBookings,
  aggregateRoomAvailabilityFromBookings,
  toLocalDateKey,
} from '@/lib/reservationAvailability';

export default function StaffRoomStatus() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState({});
  const [bookedUnits, setBookedUnits] = useState({}); // Track booked units per room per date
  const [exclusiveByDate, setExclusiveByDate] = useState({}); // dateKey -> { tentCount }
  const [blockedSlots, setBlockedSlots] = useState({});
  const [dayTourCapacity, setDayTourCapacity] = useState(null);
  const [dayTourBookedGuests, setDayTourBookedGuests] = useState({}); // Track total booked guests per date
  const [dayTourUnavailableDates, setDayTourUnavailableDates] = useState({});
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTab, setSelectedTab] = useState('rooms');
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  // Get today date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toLocalDateKey(today);

  // Fetch rooms list (only non-archived and available)
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsList = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (String(data.availability || '').toLowerCase() === 'available') {
          roomsList.push({ id: doc.id, ...data });
        }
      });
      setRooms(roomsList);
      
      // Fetch details for each room
      roomsList.forEach(room => {
        fetchRoomDetails(room.id);
      });
      
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch room details for each room ID
  const fetchRoomDetails = async (roomId) => {
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snap) => {
      if (snap.exists()) {
        setRoomDetails(prev => ({ ...prev, [roomId]: snap.data() }));
      }
    });
    return () => unsubscribe();
  };

  // Compute total available units for a room type
  const getTotalRoomUnits = (roomId) => {
    const details = roomDetails[roomId];
    if (!details) return 0;
    const total = parseInt(details.totalRooms) || 1;
    const maintenance = parseInt(details.maintenanceRooms) || 0;
    return Math.max(0, total - maintenance);
  };
  
  // Helper to get room type from room ID
  const getRoomTypeFromId = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    return room?.type || '';
  };

  // Real-time sync with all reservation bookings (same source as admin reservations)
  useEffect(() => {
    const bookingsRef = collection(db, 'bookings');
    const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
      const bookingDocs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const { bookedUnits: nextBooked, exclusiveByDate: nextExclusive } =
        aggregateRoomAvailabilityFromBookings(bookingDocs);
      setBookedUnits(nextBooked);
      setExclusiveByDate(nextExclusive);
    }, (error) => {
      console.error('Error listening to room bookings for availability:', error);
    });

    return () => unsubscribe();
  }, []);

  // Fetch blocked slots for all rooms
  useEffect(() => {
    if (rooms.length === 0) return;
    
    const roomIds = rooms.map(r => r.id);
    const blockedRef = collection(db, 'unavailableSlots');
    const q = query(blockedRef, where('roomId', 'in', roomIds));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blocks = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.date;
        const roomId = data.roomId;
        const unitsBlocked = data.unitsBlocked || 1;
        
        if (!blocks[dateKey]) blocks[dateKey] = {};
        if (!blocks[dateKey][roomId]) blocks[dateKey][roomId] = 0;
        
        blocks[dateKey][roomId] += unitsBlocked;
      });
      setBlockedSlots(blocks);
    });
    
    return () => unsubscribe();
  }, [rooms]);

  // Fetch day tour capacity and bookings - filter out cancelled in JavaScript
  useEffect(() => {
    // Fetch day tour configuration
    const fetchDayTourConfig = async () => {
      try {
        const toursRef = collection(db, 'dayTours');
        const q = query(toursRef, where('archived', '!=', true));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const tourDoc = querySnapshot.docs[0];
          setDayTourCapacity(tourDoc.data().maxCapacity || 0);
        }
      } catch (error) {
        console.error('Error fetching day tour config:', error);
      }
    };
    
    fetchDayTourConfig();
    
    // Fetch all day tour bookings and filter in JavaScript
    const bookingsRef = collection(db, 'dayTourBookings');
    const q = query(bookingsRef);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingDocs = snapshot.docs.map((docSnap) => docSnap.data());
      setDayTourBookedGuests(aggregateDayTourGuestsFromBookings(bookingDocs));
    });
    
    // Fetch day tour unavailable dates
    const unavailableRef = collection(db, 'daytour_unavailable_dates');
    const unsubscribeUnavailable = onSnapshot(unavailableRef, (snapshot) => {
      const unavailable = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateKey = data.date;
        unavailable[dateKey] = (unavailable[dateKey] || 0) + Number(data.unavailableGuests || 0);
      });
      setDayTourUnavailableDates(unavailable);
    });
    
    return () => {
      unsubscribe();
      unsubscribeUnavailable();
    };
  }, []);

  // Calculate available rooms for a specific room on a specific date
  const getAvailableUnitsForRoomOnDate = (roomId, date) => {
    const totalUnits = getTotalRoomUnits(roomId);
    if (totalUnits <= 0) return 0;

    const dateKey = toLocalDateKey(date);
    const exclusiveInfo = exclusiveByDate[dateKey];
    const roomType = getRoomTypeFromId(roomId);
    const isTentRoom = roomType === 'Tent' || String(roomType || '').toLowerCase() === 'tent';

    if (exclusiveInfo && !isTentRoom) return 0;

    let bookedCount = bookedUnits[dateKey]?.[roomId] || 0;

    if (isTentRoom && exclusiveInfo?.tentCount) {
      bookedCount += exclusiveInfo.tentCount;
    }

    const blockedCount = blockedSlots[dateKey]?.[roomId] || 0;
    const usedUnits = bookedCount + blockedCount;

    return Math.max(0, totalUnits - usedUnits);
  };

  const isExclusiveResortDate = (date) => Boolean(exclusiveByDate[toLocalDateKey(date)]);

  // Fully booked when every room type (including tents) has zero availability
  const isDateFullyBookedForAllRooms = (date) => {
    if (rooms.length === 0) return false;
    return rooms.every((room) => getAvailableUnitsForRoomOnDate(room.id, date) === 0);
  };

  // Calculate remaining guest capacity for day tour on a specific date
  const getRemainingDayTourCapacity = (date) => {
    if (!dayTourCapacity) return 0;
    const dateKey = toLocalDateKey(date);
    const booked = dayTourBookedGuests[dateKey] || 0;
    const unavailable = dayTourUnavailableDates[dateKey] || 0;
    return Math.max(0, dayTourCapacity - booked - unavailable);
  };

  const getBookedGuestsCount = (date) => {
    const dateKey = toLocalDateKey(date);
    return dayTourBookedGuests[dateKey] || 0;
  };

  const getUnavailableSlotsCount = (date) => {
    const dateKey = toLocalDateKey(date);
    return dayTourUnavailableDates[dateKey] || 0;
  };

  // Check if day tour is fully booked on a date
  const isDayTourFullyBooked = (date) => {
    if (isExclusiveResortDate(date)) return true;
    if (!dayTourCapacity) return false;
    return getRemainingDayTourCapacity(date) === 0;
  };

  // Calendar helper functions
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
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    return date < todayDate;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPreviousMonth = () => {
    setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1));
  };
  
  const goToNextMonth = () => {
    setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1));
  };

  const days = getDaysInMonth(calendarViewDate);

  // Get shortened room type label for better display
  const getRoomTypeLabel = (type) => {
    const labels = {
      'Tent': 'Tent',
      'Couple Room': 'Couple',
      'Ground Floor Room': 'Ground Flr',
      'Group Room': 'Group'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header Section */}
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Room & Capacity Status
        </h1>
        <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
          Real-time availability for rooms and day tour capacity
        </p>
      </div>

      {/* Summary Cards - Top Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Left Card: Room Availability - Today */}
        <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-200 py-3 px-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <i className="fas fa-bed text-blue-600 text-base"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1E3A8A]">Room Availability</h3>
              <p className="text-xs text-gray-500">{today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {rooms.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No active room types found</p>
            ) : (
              rooms.map((room) => {
                const todayAvailable = getAvailableUnitsForRoomOnDate(room.id, today);
                const totalUnits = getTotalRoomUnits(room.id);
                return (
                  <div key={room.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 font-medium">{getRoomTypeLabel(room.type)}</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-base font-bold ${todayAvailable > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {todayAvailable}
                      </span>
                      <span className="text-gray-400 text-xs">/{totalUnits}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Card: Day Tour - Today */}
        <div className="bg-gradient-to-r from-amber-50 to-white rounded-xl border border-amber-200 py-3 px-5 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <i className="fas fa-sun text-amber-600 text-base"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1E3A8A]">Day Tour Capacity</h3>
              <p className="text-xs text-gray-500">{today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
          {!dayTourCapacity ? (
            <div className="text-center py-3 text-gray-400">
              <i className="fas fa-sun text-2xl mb-1 block"></i>
              <p className="text-xs">Not configured</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-700">Booked:</span>
                <span className="text-amber-600 font-bold">{dayTourBookedGuests[todayKey] || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-700">Unavailable:</span>
                <span className="text-gray-500 font-bold">{dayTourUnavailableDates[todayKey] || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-700">Remaining:</span>
                <span className={`font-bold ${getRemainingDayTourCapacity(today) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {getRemainingDayTourCapacity(today)}/{dayTourCapacity}
                  </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative flex items-center mb-6 border-b border-[#4D8CF5]/20">
        <div className="relative flex w-full">
          <div
            className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
            style={{
              transform: `
                translateX(${selectedTab === 'rooms' ? '0%' : '100%'})
                scale(0.98)
              `,
            }}
          />

          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setSelectedTab('rooms')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                selectedTab === 'rooms'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-bed"></i>
              Room Availability
            </button>
          </div>

          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setSelectedTab('daytour')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                selectedTab === 'daytour'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-sun"></i>
              Day Tour Guest Availability
            </button>
          </div>
        </div>
      </div>

      {/* Room Availability Tab */}
      {selectedTab === 'rooms' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-blue-50">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1E3A8A] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600">
                  <i className="fas fa-calendar-alt text-sm"></i>
                </div>
                Room Availability Calendar
              </h2>
              <p className="text-gray-500 text-[10px] sm:text-xs mt-0.5 md:ml-11">
                Available units per room type (Active bookings only)
              </p>
            </div>
            
            <div className="flex justify-center items-center gap-2 bg-gray-50/80 p-1 rounded-xl border border-gray-100 w-full md:w-auto">
              <button 
                onClick={goToPreviousMonth} 
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm hover:text-blue-600 transition-all duration-200 text-gray-500"
              >
                <i className="fas fa-chevron-left text-xs"></i>
              </button>
              <h2 className="text-xs font-bold text-[#1E3A8A] min-w-[110px] text-center uppercase tracking-wide">
                {monthNames[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear()}
              </h2>
              <button 
                onClick={goToNextMonth} 
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm hover:text-blue-600 transition-all duration-200 text-gray-500"
              >
                <i className="fas fa-chevron-right text-xs"></i>
              </button>
            </div>
          </div>
          
          <div className="p-2 sm:p-4 bg-gray-50/30 overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 min-w-[500px] sm:min-w-0">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-semibold text-[#4D8CF5] text-[10px] sm:text-xs py-1.5 bg-[#4D8CF5]/5 rounded-lg">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[500px] sm:min-w-0">
              {days.map((day, idx) => {
                if (!day) return <div key={idx} className="min-h-[80px] sm:min-h-[100px]"></div>;
                
                const isPast = isDatePast(day);
                const isExclusiveDate = !isPast && isExclusiveResortDate(day);
                const isFullyBooked = !isPast && isDateFullyBookedForAllRooms(day);
                const highlightRed = isExclusiveDate || isFullyBooked;

                let bgColor = 'bg-white';
                let borderColor = 'border-gray-100';

                if (isPast) {
                  bgColor = 'bg-gray-50/80';
                  borderColor = 'border-gray-100';
                } else if (highlightRed) {
                  bgColor = 'bg-rose-50/30';
                  borderColor = 'border-rose-200';
                }
                
                let shadowClass = isPast ? '' : 'hover:shadow-md';
                let hoverBorder = (!isPast && !highlightRed) ? 'hover:border-blue-300' : '';

                return (
                  <div
                    key={idx}
                    className={`relative rounded-xl border ${bgColor} ${borderColor} ${shadowClass} p-1.5 sm:p-2 min-h-[80px] sm:min-h-[100px] transition-all duration-300 flex flex-col gap-1 sm:gap-1.5 ${hoverBorder}`}
                  >
                    <span className={`text-[10px] sm:text-xs font-bold block ${isPast ? 'text-gray-400' : (highlightRed ? 'text-rose-600' : 'text-[#1E3A8A]')}`}>
                      {day.getDate()}
                    </span>
                    <div className="flex flex-col gap-1 mt-auto">
                      {rooms.map((room) => {
                        const availableUnits = getAvailableUnitsForRoomOnDate(room.id, day);
                        const totalUnits = getTotalRoomUnits(room.id);
                        const isRoomFullyBooked = availableUnits === 0 && totalUnits > 0 && !isPast;
                        const roomLabel = getRoomTypeLabel(room.type);
                        
                        return (
                          <div key={room.id} className={`text-[10px] flex justify-between items-center rounded px-1.5 py-0.5 ${isPast ? 'bg-transparent' : 'bg-gray-50 border border-gray-100/50'}`}>
                            <span className={`font-semibold truncate mr-1 ${isPast ? 'text-gray-400' : 'text-gray-600'}`} title={room.type}>{roomLabel}</span>
                            <span className={`font-bold tabular-nums ${isPast ? 'text-gray-400' : (isRoomFullyBooked ? 'text-rose-500' : 'text-emerald-600')}`}>
                              {availableUnits}<span className={`font-medium ${isPast ? 'text-gray-300' : 'text-gray-400'}`}>/{totalUnits}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-center gap-8 text-xs font-medium">
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 bg-white border border-gray-200 rounded-md shadow-sm"></div>
                <span className="text-gray-600">Available</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 bg-rose-50/50 border border-rose-200 rounded-md shadow-sm"></div>
                <span className="text-gray-600">Fully Booked / Entire Resort</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 bg-gray-50 border border-gray-200 rounded-md shadow-sm"></div>
                <span className="text-gray-600">Past Dates</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day Tour Guest Availability Tab */}
      {selectedTab === 'daytour' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-amber-50">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1E3A8A] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-500">
                  <i className="fas fa-sun text-sm"></i>
                </div>
                Day Tour Availability Calendar
              </h2>
              <p className="text-gray-500 text-[10px] sm:text-xs mt-0.5 md:ml-11">
                Booked guests, unavailable slots, and remaining capacity
              </p>
            </div>
            
            <div className="flex justify-center items-center gap-2 bg-gray-50/80 p-1 rounded-xl border border-gray-100 w-full md:w-auto">
              <button 
                onClick={goToPreviousMonth} 
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm hover:text-amber-600 transition-all duration-200 text-gray-500"
              >
                <i className="fas fa-chevron-left text-xs"></i>
              </button>
              <h2 className="text-xs font-bold text-[#1E3A8A] min-w-[110px] text-center uppercase tracking-wide">
                {monthNames[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear()}
              </h2>
              <button 
                onClick={goToNextMonth} 
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm hover:text-amber-600 transition-all duration-200 text-gray-500"
              >
                <i className="fas fa-chevron-right text-xs"></i>
              </button>
            </div>
          </div>
          
          <div className="p-2 sm:p-4 bg-gray-50/30 overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 min-w-[500px] sm:min-w-0">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-semibold text-[#F59E0B] text-[10px] sm:text-xs py-1.5 bg-[#F59E0B]/5 rounded-lg">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[500px] sm:min-w-0">
              {days.map((day, idx) => {
                if (!day) return <div key={idx} className="min-h-[80px] sm:min-h-[100px]"></div>;
                
                const isPast = isDatePast(day);
                const isExclusiveDate = isExclusiveResortDate(day);
                const bookedGuests = getBookedGuestsCount(day);
                const unavailableSlots = getUnavailableSlotsCount(day);
                const remainingCapacity = isExclusiveDate ? 0 : getRemainingDayTourCapacity(day);
                const isFullyBooked = isDayTourFullyBooked(day);
                
                let bgColor = isPast ? 'bg-gray-50/80' : (isFullyBooked && !isPast ? 'bg-rose-50/30' : 'bg-white');
                let borderClass = isFullyBooked && !isPast ? 'border-rose-100' : 'border-gray-100';
                let shadowClass = isPast ? '' : 'hover:shadow-md';
                let hoverBorder = (!isPast && !isFullyBooked) ? 'hover:border-amber-300' : '';
                
                return (
                  <div
                    key={idx}
                    className={`relative rounded-xl border ${bgColor} ${borderClass} ${shadowClass} p-1.5 sm:p-2 min-h-[80px] sm:min-h-[100px] transition-all duration-300 flex flex-col gap-1 sm:gap-1.5 ${hoverBorder}`}
                  >
                    <span className={`text-[10px] sm:text-xs font-bold block ${isPast ? 'text-gray-400' : (isFullyBooked ? 'text-rose-600' : 'text-[#1E3A8A]')}`}>
                      {day.getDate()}
                    </span>
                    {dayTourCapacity ? (
                      <div className="flex flex-col gap-1 mt-auto text-[10px]">
                        <div className={`flex justify-between items-center rounded px-1.5 py-0.5 ${isPast ? 'bg-transparent' : 'bg-gray-50 border border-gray-100/50'}`}>
                          <span className={`font-semibold ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>Booked</span>
                          <span className={`font-bold tabular-nums ${isPast ? 'text-gray-400' : 'text-amber-600'}`}>{bookedGuests}</span>
                        </div>
                        <div className={`flex justify-between items-center rounded px-1.5 py-0.5 ${isPast ? 'bg-transparent' : 'bg-gray-50 border border-gray-100/50'}`}>
                          <span className={`font-semibold ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>Unavail</span>
                          <span className={`font-bold tabular-nums ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>{unavailableSlots}</span>
                        </div>
                        <div className={`flex justify-between items-center rounded px-1.5 py-0.5 ${isPast ? 'bg-transparent' : 'bg-blue-50/50 border border-blue-100/50'}`}>
                          <span className={`font-bold ${isPast ? 'text-gray-400' : 'text-[#1E3A8A]'}`}>Rem</span>
                          <span className={`font-bold tabular-nums ${isPast ? 'text-gray-400' : (remainingCapacity > 0 ? 'text-emerald-600' : 'text-rose-500')}`}>
                            {remainingCapacity}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-4 opacity-50">
                        <i className="fas fa-sun text-lg mb-1"></i>
                        <span className="text-[10px] uppercase tracking-wide font-semibold">Not setup</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-center gap-8 text-xs font-medium">
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 bg-white border border-gray-200 rounded-md shadow-sm"></div>
                <span className="text-gray-600">Available</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 bg-rose-50/50 border border-rose-200 rounded-md shadow-sm"></div>
                <span className="text-gray-600">Fully Booked</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 bg-gray-50 border border-gray-200 rounded-md shadow-sm"></div>
                <span className="text-gray-600">Past Dates</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}