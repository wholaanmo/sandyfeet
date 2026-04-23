// app/dashboard/admin/overview/page.js
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminOverview() {
  const [adminName, setAdminName] = useState('Admin');
  const [roomCheckInsToday, setRoomCheckInsToday] = useState(0);
  const [dayTourGuestsToday, setDayTourGuestsToday] = useState(0);
  const [dayTourBookingsToday, setDayTourBookingsToday] = useState(0);
  const [roomBookingsToday, setRoomBookingsToday] = useState(0);
  const [recentPendingRoomBookings, setRecentPendingRoomBookings] = useState([]);
  const [recentPendingDayTours, setRecentPendingDayTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Get today's date range (start of day to end of day)
  const getTodayRange = () => {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    return { startOfDay, endOfDay };
  };

  // Fetch admin name from Firebase Auth and Firestore
useEffect(() => {
  const fetchAdminName = async () => {
    // Try to get uid from localStorage first (fastest after login)
    let uid = localStorage.getItem('uid');
    if (!uid && auth.currentUser) {
      uid = auth.currentUser.uid;
    }
    
    if (uid) {
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.name) {
            setAdminName(userData.name);
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching user name:', error);
      }
    }
    // Fallback to 'Admin' only if no name found (never show email)
    setAdminName('Admin');
  };
  
  fetchAdminName();
}, []);

  // Fetch room check-ins today (status 'check-in' for today)
  useEffect(() => {
    const { startOfDay, endOfDay } = getTodayRange();
    
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('status', '==', 'check-in')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.forEach((doc) => {
        const booking = doc.data();
        const checkInDate = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
        
        if (checkInDate >= startOfDay && checkInDate <= endOfDay) {
          count++;
        }
      });
      setRoomCheckInsToday(count);
    }, (error) => {
      console.error('Error fetching room check-ins:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch day tour guests today (bookings with selectedDate = today and status check-in or confirmed)
useEffect(() => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  const dayTourBookingsRef = collection(db, 'dayTourBookings');
  const q = query(
    dayTourBookingsRef,
    where('selectedDate', '==', todayStr),
    where('status', '==', 'check-in')
  );
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    let totalGuests = 0;
    snapshot.forEach((doc) => {
      const booking = doc.data();
      const seniors = booking.seniors || 0;
      const adults = booking.adults || 0;
      const kids = booking.kids || 0;
      totalGuests += seniors + adults + kids;
    });
    setDayTourGuestsToday(totalGuests);
  }, (error) => {
    console.error('Error fetching day tour guests:', error);
  });
  
  return () => unsubscribe();
}, []);

  // Fetch day tour bookings today (bookings with selectedDate = today)
useEffect(() => {
  const { startOfDay, endOfDay } = getTodayRange();
  
  const dayTourBookingsRef = collection(db, 'dayTourBookings');
  
  const unsubscribe = onSnapshot(dayTourBookingsRef, (snapshot) => {
    let count = 0;
    snapshot.forEach((doc) => {
      const booking = doc.data();
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      if (createdAt >= startOfDay && createdAt <= endOfDay) {
        count++;
      }
    });
    setDayTourBookingsToday(count);
  }, (error) => {
    console.error('Error fetching day tour bookings:', error);
  });
  
  return () => unsubscribe();
}, []);

  // Fetch room bookings today - TOTAL NUMBER OF ROOM RESERVATIONS MADE TODAY (by createdAt)
useEffect(() => {
  const { startOfDay, endOfDay } = getTodayRange();
  
  const bookingsRef = collection(db, 'bookings');
  
  const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
    const uniqueBookingIds = new Set();
    
    snapshot.forEach((doc) => {
      const booking = doc.data();
      if (booking.type === 'room') {
        const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
        if (createdAt >= startOfDay && createdAt <= endOfDay) {
          // For multi-room bookings, use parentBookingId; otherwise use bookingId
          const bookingKey = booking.parentBookingId || booking.bookingId;
          uniqueBookingIds.add(bookingKey);
        }
      }
    });
    
    setRoomBookingsToday(uniqueBookingIds.size);
  }, (error) => {
    console.error('Error fetching room bookings:', error);
  });
  
  return () => unsubscribe();
}, []);

  // Function to get booking display type (matches reservations page logic)
  const getBookingDisplayType = (booking) => {
    if (booking.isExclusiveResortBooking) return 'Entire Resort';
    if (booking.isMultiRoomGroup) {
      if (booking.roomTypesArray && booking.roomTypesArray.length > 1) return 'Multi-Room Types';
      return 'Single Room Type';
    }
    if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 1) return 'Multi-Room Types';
    return 'Single Room Type';
  };

  // Fetch recent pending room bookings with proper grouping (matches reservations page)
  useEffect(() => {
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('status', '==', 'pending'),
      where('type', '==', 'room'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingBookingsMap = new Map();
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Group multi-room bookings by parentBookingId
        if (data.isMultiRoomBooking && data.parentBookingId) {
          if (!pendingBookingsMap.has(data.parentBookingId)) {
            pendingBookingsMap.set(data.parentBookingId, {
              id: data.parentBookingId,
              bookingId: data.parentBookingId,
              guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim(),
              checkIn: data.checkIn,
              createdAt: data.createdAt,
              isMultiRoomGroup: true,
              isExclusiveResortBooking: data.isExclusiveResortBooking || false,
              roomTypesArray: [],
              tentCount: data.tentCount || 0,
              childBookings: []
            });
          }
          const group = pendingBookingsMap.get(data.parentBookingId);
          group.childBookings.push(data);
          if (data.roomType && !group.roomTypesArray.find(r => r.type === data.roomType)) {
            group.roomTypesArray.push({ type: data.roomType, quantity: 1 });
          } else if (data.roomType) {
            const existing = group.roomTypesArray.find(r => r.type === data.roomType);
            if (existing) existing.quantity++;
          }
        } else if (!data.isMultiRoomBooking) {
          // Single booking (not part of multi-room group)
          const key = doc.id;
          if (!pendingBookingsMap.has(key)) {
            pendingBookingsMap.set(key, {
              id: doc.id,
              bookingId: data.bookingId,
              guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim(),
              checkIn: data.checkIn,
              createdAt: data.createdAt,
              isMultiRoomGroup: false,
              isExclusiveResortBooking: data.isExclusiveResortBooking || false,
              roomType: data.roomType,
              numberOfRooms: data.numberOfRooms || 1,
              roomTypes: data.roomTypes || null
            });
          }
        }
      });
      
      // Process groups to determine display type (ONLY the display type, NO quantity format)
      const processedBookings = [];
      for (const [_, booking] of pendingBookingsMap) {
        let bookingDisplayType = '';
        
        if (booking.isMultiRoomGroup) {
          if (booking.isExclusiveResortBooking) {
            bookingDisplayType = 'Entire Resort';
          } else if (booking.roomTypesArray && booking.roomTypesArray.length > 1) {
            bookingDisplayType = 'Multi-Room Types';
          } else {
            bookingDisplayType = 'Single Room Type';
          }
        } else {
          bookingDisplayType = getBookingDisplayType(booking);
        }
        
        processedBookings.push({
          ...booking,
          bookingDisplayType
        });
      }
      
      // Sort by createdAt and take last 3
      const sorted = processedBookings.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      
      setRecentPendingRoomBookings(sorted.slice(0, 3));
    }, (error) => {
      console.error('Error fetching pending room bookings:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch recent pending day tour bookings (last 3)
  useEffect(() => {
    const dayTourBookingsRef = collection(db, 'dayTourBookings');
    const q = query(
      dayTourBookingsRef,
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingDayTours = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        pendingDayTours.push({
          id: doc.id,
          bookingId: data.bookingId,
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim(),
          selectedDate: data.selectedDate,
          createdAt: data.createdAt
        });
      });
      setRecentPendingDayTours(pendingDayTours);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching pending day tours:', error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  if (loading) {
    return (
      <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header Section */}
      <div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Dashboard Overview
        </h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
          Welcome back, {adminName}! Here's what's happening at SandyFeet today.
        </p>
      </div>

      {/* Summary Containers - 4 in a row with improved UI */}
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
  {/* Container 1: Room Check-ins Today */}
  <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#4D8CF5]/15 overflow-hidden hover:shadow-xl hover:border-[#4D8CF5]/30 transition-all duration-300">
    <div className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#4D8CF5]/20 to-[#4D8CF5]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
          <i className="fas fa-bed text-[#4D8CF5] text-xl"></i>
        </div>
        <span className="text-4xl font-extrabold text-[#1E3A8A] tracking-tight">{roomCheckInsToday}</span>
      </div>

      <div className="mt-auto">
        <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Room Check-ins Today</h3>
        <div className="mt-3 h-1 w-full bg-[#4D8CF5]/10 rounded-full overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-[#4D8CF5] to-[#7AAAF8] rounded-full transform origin-left transition-transform duration-500" style={{ transform: `scaleX(${Math.min(roomCheckInsToday / 10, 1)})` }}></div>
        </div>
      </div>
    </div>
  </div>


        {/* Container 2: Day Tour Guests Today */}
  <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#F59E0B]/15 overflow-hidden hover:shadow-xl hover:border-[#F59E0B]/30 transition-all duration-300">
  <div className="p-5 flex flex-col h-full">
    <div className="flex items-center justify-between mb-3">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
        <i className="fas fa-users text-[#F59E0B] text-xl"></i>
      </div>
      <span className="text-4xl font-extrabold text-[#1E3A8A] tracking-tight">{dayTourGuestsToday}</span>
    </div>

    <div className="mt-auto">
      <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Day Tour Guests Today</h3>
      <div className="mt-3 h-1 w-full bg-[#F59E0B]/10 rounded-full overflow-hidden">
        <div
          className="h-full w-full bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] rounded-full transform origin-left transition-transform duration-500"
          style={{ transform: `scaleX(${Math.min(dayTourGuestsToday / 30, 1)})` }}
        ></div>
      </div>
    </div>
  </div>
</div>

        {/* Container 3: Day Tour Bookings Today */}
 <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#10B981]/15 overflow-hidden hover:shadow-xl hover:border-[#10B981]/30 transition-all duration-300">
  <div className="p-5 flex flex-col h-full">
    <div className="flex items-center justify-between mb-3">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#10B981]/20 to-[#10B981]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
        <i className="fas fa-sun text-[#10B981] text-xl"></i>
      </div>
      <span className="text-4xl font-extrabold text-[#1E3A8A] tracking-tight">{dayTourBookingsToday}</span>
    </div>

    <div className="mt-auto">
      <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Day Tour Bookings Today</h3>
      <div className="mt-3 h-1 w-full bg-[#10B981]/10 rounded-full overflow-hidden">
        <div
          className="h-full w-full bg-gradient-to-r from-[#10B981] to-[#34D399] rounded-full transform origin-left transition-transform duration-500"
          style={{ transform: `scaleX(${Math.min(dayTourBookingsToday / 15, 1)})` }}
        ></div>
      </div>
    </div>
  </div>
</div>

        {/* Container 4: Room Bookings Today - Total reservations made today */}
   <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#8B5CF6]/15 overflow-hidden hover:shadow-xl hover:border-[#8B5CF6]/30 transition-all duration-300">
  <div className="p-5 flex flex-col h-full">
    <div className="flex items-center justify-between mb-3">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#8B5CF6]/20 to-[#8B5CF6]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
        <i className="fas fa-calendar-plus text-[#8B5CF6] text-xl"></i>
      </div>
      <span className="text-4xl font-extrabold text-[#1E3A8A] tracking-tight">{roomBookingsToday}</span>
    </div>

    <div className="mt-auto">
      <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Room Bookings Today</h3>
      <div className="mt-3 h-1 w-full bg-[#8B5CF6]/10 rounded-full overflow-hidden">
        <div
          className="h-full w-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA] rounded-full transform origin-left transition-transform duration-500"
          style={{ transform: `scaleX(${Math.min(roomBookingsToday / 15, 1)})` }}
        ></div>
      </div>
    </div>
  </div>
</div>
</div>

      {/* Recent Reservations Section - Two columns side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Pending Room Reservations - Display ONLY the type label */}
        <div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/10 overflow-hidden hover:shadow-xl transition-all duration-300">
          <div className="bg-gradient-to-r from-[#4D8CF5]/10 to-[#7AAAF8]/5 px-5 py-4 border-b border-[#4D8CF5]/15 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-[#1E3A8A] flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#4D8CF5]/20 flex items-center justify-center">
                  <i className="fas fa-bed text-[#4D8CF5] text-sm"></i>
                </div>
                Recent Pending Room Reservations
              </h2>
              <p className="text-[#1E3A8A]/60 text-xs mt-0.5 ml-9">
                Latest {recentPendingRoomBookings.length} pending room booking requests
              </p>
            </div>
            <Link 
              href="/dashboard/admin/reservations"
              className="px-3 py-1.5 rounded-lg border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] text-xs font-medium hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center gap-1 shadow-sm hover:shadow"
            >
              View All
              <i className="fas fa-arrow-right text-xs"></i>
            </Link>
          </div>
          
          <div className="p-5">
            {recentPendingRoomBookings.length === 0 ? (
              <div className="text-center py-10 text-[#1E3A8A]/60">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                  <i className="fas fa-check-circle text-3xl text-green-500"></i>
                </div>
                <p className="text-sm font-medium">No pending room reservations</p>
                <p className="text-xs mt-1 text-[#1E3A8A]/40">All room reservations are confirmed</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPendingRoomBookings.map((booking) => (
                  <div key={booking.id} className="group border border-[#4D8CF5]/10 rounded-xl p-3 hover:shadow-md hover:border-[#4D8CF5]/20 transition-all duration-200 bg-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-[#1E3A8A] text-sm">
                            {booking.guestName || 'Guest'}
                          </p>
                          <span className="text-xs text-[#1E3A8A]/40">
                            {formatDateTime(booking.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-[#1E3A8A]/70">
                          Booking ID: <span className="font-mono">{booking.bookingId}</span>
                        </p>
                        <p className="text-xs text-[#1E3A8A]/70 mt-1">
                          <span className="font-medium">Room Type:</span>{' '}
                          <span className={`inline-flex items-center gap-1 ${
                            booking.bookingDisplayType === 'Single Room Type' ? 'text-blue-600' :
                            booking.bookingDisplayType === 'Multi-Room Types' ? 'text-purple-600' :
                            'text-amber-600'
                          }`}>
                            <i className={`fas fa-xs ${
                              booking.bookingDisplayType === 'Single Room Type' ? 'fa-door-open' :
                              booking.bookingDisplayType === 'Multi-Room Types' ? 'fa-layer-group' :
                              'fa-crown'
                            }`}></i>
                            {booking.bookingDisplayType}
                          </span>
                        </p>
                        <p className="text-xs text-[#1E3A8A]/70 mt-1">
                          Check-in: {formatDate(booking.checkIn)}
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 whitespace-nowrap ml-2 shadow-sm">
                        <i className="fas fa-clock mr-1 text-[8px]"></i>
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Pending Day Tour Reservations */}
        <div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/10 overflow-hidden hover:shadow-xl transition-all duration-300">
          <div className="bg-gradient-to-r from-[#4D8CF5]/10 to-[#7AAAF8]/5 px-5 py-4 border-b border-[#4D8CF5]/15 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-[#1E3A8A] flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center">
                  <i className="fas fa-sun text-[#F59E0B] text-sm"></i>
                </div>
                Recent Pending Day Tour Reservations
              </h2>
              <p className="text-[#1E3A8A]/60 text-xs mt-0.5 ml-9">
                Latest {recentPendingDayTours.length} pending day tour booking requests
              </p>
            </div>
            <Link 
              href="/dashboard/admin/reservations"
              className="px-3 py-1.5 rounded-lg border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] text-xs font-medium hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center gap-1 shadow-sm hover:shadow"
            >
              View All
              <i className="fas fa-arrow-right text-xs"></i>
            </Link>
          </div>
          
          <div className="p-5">
            {recentPendingDayTours.length === 0 ? (
              <div className="text-center py-10 text-[#1E3A8A]/60">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                  <i className="fas fa-check-circle text-3xl text-green-500"></i>
                </div>
                <p className="text-sm font-medium">No pending day tour reservations</p>
                <p className="text-xs mt-1 text-[#1E3A8A]/40">All day tour reservations are confirmed</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPendingDayTours.map((booking) => (
                  <div key={booking.id} className="group border border-[#4D8CF5]/10 rounded-xl p-3 hover:shadow-md hover:border-[#4D8CF5]/20 transition-all duration-200 bg-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-[#1E3A8A] text-sm">
                            {booking.guestName || 'Guest'}
                          </p>
                          <span className="text-xs text-[#1E3A8A]/40">
                            {formatDateTime(booking.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-[#1E3A8A]/70">
                          Booking ID: <span className="font-mono">{booking.bookingId}</span>
                        </p>
                        <p className="text-xs text-[#1E3A8A]/70 mt-1">
                          Tour Date: {booking.selectedDate ? formatDate(booking.selectedDate) : 'N/A'}
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 whitespace-nowrap ml-2 shadow-sm">
                        <i className="fas fa-clock mr-1 text-[8px]"></i>
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}