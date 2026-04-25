// app/dashboard/staff/availability/page.js
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, doc, onSnapshot, getDocs } from 'firebase/firestore';

export default function StaffRoomStatus() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState({});
  const [bookedDates, setBookedDates] = useState({});
  const [exclusiveResortDates, setExclusiveResortDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [dayTourCapacity, setDayTourCapacity] = useState(null);
  const [dayTourBookedDates, setDayTourBookedDates] = useState({});
  const [dayTourUnavailableDates, setDayTourUnavailableDates] = useState({});

  // Helper function to convert Date to YYYY-MM-DD local date string
  const toLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get today and tomorrow dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayKey = toLocalDateKey(today);
  const tomorrowKey = toLocalDateKey(tomorrow);

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

  // Fetch bookings for all rooms
  useEffect(() => {
    if (rooms.length === 0) return;
    
    const roomIds = rooms.map(r => r.id);
    const bookingsRef = collection(db, 'bookings');
    
    // Query for room bookings
    const qRoom = query(
      bookingsRef,
      where('roomId', 'in', roomIds),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    
    // Query for exclusive resort bookings
    const qExclusive = query(
      bookingsRef,
      where('isExclusiveResortBooking', '==', true),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    
    const unsubscribeRoom = onSnapshot(qRoom, (snapshot) => {
      const booked = {};
      snapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
        const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
        const roomId = booking.roomId;
        const numberOfRooms = booking.numberOfRooms || 1;
        
        if (!checkIn || !checkOut || checkOut <= checkIn || !roomId) return;
        
        let current = new Date(checkIn);
        while (current < checkOut) {
          const dateKey = current.toDateString();
          if (!booked[dateKey]) booked[dateKey] = {};
          if (!booked[dateKey][roomId]) booked[dateKey][roomId] = {};
          
          const hour = current.getHours();
          booked[dateKey][roomId][hour] = (booked[dateKey][roomId][hour] || 0) + numberOfRooms;
          current.setHours(current.getHours() + 1, 0, 0, 0);
        }
      });
      setBookedDates(booked);
    });
    
    const unsubscribeExclusive = onSnapshot(qExclusive, (snapshot) => {
      const exclusive = {};
      snapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
        const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
        if (!checkIn || !checkOut || checkOut <= checkIn) return;
        
        let current = new Date(checkIn);
        while (current < checkOut) {
          const hour = current.getHours();
          if (hour >= 14) {
            exclusive[toLocalDateKey(current)] = true;
          }
          current.setHours(current.getHours() + 1, 0, 0, 0);
        }
      });
      setExclusiveResortDates(exclusive);
    });
    
    return () => {
      unsubscribeRoom();
      unsubscribeExclusive();
    };
  }, [rooms]);

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
        const startHour = data.startHour;
        const endHour = data.endHour;
        const unitsBlocked = data.unitsBlocked || 1;
        
        if (!blocks[dateKey]) blocks[dateKey] = {};
        if (!blocks[dateKey][roomId]) blocks[dateKey][roomId] = {};
        
        for (let hour = startHour; hour < endHour; hour++) {
          blocks[dateKey][roomId][hour] = (blocks[dateKey][roomId][hour] || 0) + unitsBlocked;
        }
      });
      setBlockedSlots(blocks);
    });
    
    return () => unsubscribe();
  }, [rooms]);

  // Fetch day tour capacity and bookings
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
    
    // Fetch day tour bookings
    const bookingsRef = collection(db, 'dayTourBookings');
    const q = query(
      bookingsRef,
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booked = {};
      snapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const dateKey = booking.selectedDate;
        if (dateKey) {
          if (!booked[dateKey]) booked[dateKey] = 0;
          const totalGuests = (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
          booked[dateKey] += totalGuests;
        }
      });
      setDayTourBookedDates(booked);
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
    
    const dateKey = date.toDateString();
    const dateKeyLocal = toLocalDateKey(date);
    
    // Check if exclusive resort booking blocks this date
    if (exclusiveResortDates[dateKeyLocal]) return 0;
    
    let maxUsed = 0;
    for (let hour = 14; hour < 24; hour++) {
      const bookedCount = bookedDates[dateKey]?.[roomId]?.[hour] || 0;
      const blockedCount = blockedSlots[dateKeyLocal]?.[roomId]?.[hour] || 0;
      maxUsed = Math.max(maxUsed, bookedCount + blockedCount);
    }
    
    return Math.max(0, totalUnits - maxUsed);
  };

  // Calculate remaining guest capacity for day tour on a specific date
  const getRemainingDayTourCapacity = (date) => {
    if (!dayTourCapacity) return 0;
    const dateKey = toLocalDateKey(date);
    const booked = dayTourBookedDates[dateKey] || 0;
    const unavailable = dayTourUnavailableDates[dateKey] || 0;
    return Math.max(0, dayTourCapacity - booked - unavailable);
  };

  if (loading) {
    return (
      <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Room & Capacity Status
        </h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
          Real-time availability for rooms and day tour capacity
        </p>
      </div>

      {/* Date Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <i className="fas fa-calendar-day text-blue-600"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1E3A8A]">Today</h3>
              <p className="text-sm text-gray-500">{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-emerald-50 to-white rounded-xl border border-emerald-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <i className="fas fa-calendar-week text-emerald-600"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1E3A8A]">Tomorrow</h3>
              <p className="text-sm text-gray-500">{tomorrow.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout for Room Status and Day Tour Capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left: Room Availability Status */}
        <div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/10 overflow-hidden">
          <div className="bg-gradient-to-r from-[#4D8CF5]/10 to-[#7AAAF8]/5 px-6 py-4 border-b border-[#4D8CF5]/15">
            <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
              <i className="fas fa-bed text-[#4D8CF5]"></i>
              Room Availability
            </h2>
            <p className="text-[#1E3A8A]/60 text-sm mt-1">
              Available units per room type for today and tomorrow
            </p>
          </div>
          
          <div className="p-6">
            {rooms.length === 0 ? (
              <div className="text-center py-12 text-[#1E3A8A]/60">
                <i className="fas fa-bed text-5xl mb-3 block text-gray-300"></i>
                <p>No active room types found</p>
                <p className="text-xs mt-1 text-gray-400">All rooms are either archived or unavailable</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rooms.map((room) => {
                  const todayAvailable = getAvailableUnitsForRoomOnDate(room.id, today);
                  const tomorrowAvailable = getAvailableUnitsForRoomOnDate(room.id, tomorrow);
                  const totalUnits = getTotalRoomUnits(room.id);
                  const todayPercentage = totalUnits > 0 ? (todayAvailable / totalUnits) * 100 : 0;
                  const tomorrowPercentage = totalUnits > 0 ? (tomorrowAvailable / totalUnits) * 100 : 0;
                  
                  return (
                    <div key={room.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all duration-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-gray-800 text-lg">{room.type}</h3>
                          <p className="text-xs text-gray-400">Total: {totalUnits} units</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        {/* Today */}
                        <div className="bg-blue-50/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Today</span>
                            <span className={`text-2xl font-bold ${todayAvailable > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {todayAvailable}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 rounded-full h-2 transition-all duration-500"
                              style={{ width: `${todayPercentage}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            {todayAvailable === 0 ? 'Fully booked' : `${todayAvailable} unit(s) available`}
                          </p>
                        </div>
                        
                        {/* Tomorrow */}
                        <div className="bg-emerald-50/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Tomorrow</span>
                            <span className={`text-2xl font-bold ${tomorrowAvailable > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {tomorrowAvailable}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-emerald-500 rounded-full h-2 transition-all duration-500"
                              style={{ width: `${tomorrowPercentage}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            {tomorrowAvailable === 0 ? 'Fully booked' : `${tomorrowAvailable} unit(s) available`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Day Tour Guest Capacity */}
        <div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/10 overflow-hidden">
          <div className="bg-gradient-to-r from-[#F59E0B]/10 to-[#FBBF24]/5 px-6 py-4 border-b border-[#F59E0B]/15">
            <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
              <i className="fas fa-sun text-[#F59E0B]"></i>
              Day Tour Capacity
            </h2>
            <p className="text-[#1E3A8A]/60 text-sm mt-1">
              Available guest slots for today and tomorrow
            </p>
          </div>
          
          <div className="p-6">
            {!dayTourCapacity ? (
              <div className="text-center py-12 text-[#1E3A8A]/60">
                <i className="fas fa-sun text-5xl mb-3 block text-gray-300"></i>
                <p>Day tour not configured</p>
                <p className="text-xs mt-1 text-gray-400">Please configure day tour in admin panel</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Today */}
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-5 border border-blue-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <i className="fas fa-calendar-day text-blue-600 text-sm"></i>
                      </div>
                      <h3 className="font-bold text-gray-800">Today</h3>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">
                      {getRemainingDayTourCapacity(today)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Maximum Capacity:</span>
                      <span className="font-semibold">{dayTourCapacity} guests</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Booked Guests:</span>
                      <span className="font-semibold text-amber-600">{dayTourBookedDates[todayKey] || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Unavailable Slots:</span>
                      <span className="font-semibold text-gray-500">{dayTourUnavailableDates[todayKey] || 0}</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-500 rounded-full h-2.5 transition-all duration-500"
                      style={{ width: `${((dayTourBookedDates[todayKey] || 0) / dayTourCapacity) * 100}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-3">
                    {getRemainingDayTourCapacity(today) === 0 ? 
                      'Fully booked - No slots available' : 
                      `${getRemainingDayTourCapacity(today)} guest slot(s) remaining`}
                  </p>
                </div>
                
                {/* Tomorrow */}
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-5 border border-emerald-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <i className="fas fa-calendar-week text-emerald-600 text-sm"></i>
                      </div>
                      <h3 className="font-bold text-gray-800">Tomorrow</h3>
                    </div>
                    <span className="text-2xl font-bold text-emerald-600">
                      {getRemainingDayTourCapacity(tomorrow)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Maximum Capacity:</span>
                      <span className="font-semibold">{dayTourCapacity} guests</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Booked Guests:</span>
                      <span className="font-semibold text-amber-600">{dayTourBookedDates[tomorrowKey] || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Unavailable Slots:</span>
                      <span className="font-semibold text-gray-500">{dayTourUnavailableDates[tomorrowKey] || 0}</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-emerald-500 rounded-full h-2.5 transition-all duration-500"
                      style={{ width: `${((dayTourBookedDates[tomorrowKey] || 0) / dayTourCapacity) * 100}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-3">
                    {getRemainingDayTourCapacity(tomorrow) === 0 ? 
                      'Fully booked - No slots available' : 
                      `${getRemainingDayTourCapacity(tomorrow)} guest slot(s) remaining`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}