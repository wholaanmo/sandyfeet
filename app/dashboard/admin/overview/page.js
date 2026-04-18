// app/dashboard/admin/overview/page.js
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, orderBy, limit } from 'firebase/firestore';
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
      const user = auth.currentUser;
      if (user) {
        // Try to get displayName from auth
        if (user.displayName) {
          setAdminName(user.displayName.split(' ')[0]);
        } else {
          // Fallback to email
          const emailName = user.email?.split('@')[0] || 'Admin';
          setAdminName(emailName);
        }
      }
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
        
        // Check if check-in date is today
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
    const { startOfDay, endOfDay } = getTodayRange();
    const todayStr = startOfDay.toISOString().split('T')[0];
    
    const dayTourBookingsRef = collection(db, 'dayTourBookings');
    const q = query(
      dayTourBookingsRef,
      where('selectedDate', '==', todayStr),
      where('status', 'in', ['check-in', 'confirmed'])
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
    const todayStr = startOfDay.toISOString().split('T')[0];
    
    const dayTourBookingsRef = collection(db, 'dayTourBookings');
    const q = query(
      dayTourBookingsRef,
      where('selectedDate', '==', todayStr)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDayTourBookingsToday(snapshot.size);
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch room bookings today (bookings with check-in date = today)
  useEffect(() => {
    const { startOfDay, endOfDay } = getTodayRange();
    
    const bookingsRef = collection(db, 'bookings');
    
    const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
      let count = 0;
      snapshot.forEach((doc) => {
        const booking = doc.data();
        if (booking.type === 'room') {
          const checkInDate = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          if (checkInDate >= startOfDay && checkInDate <= endOfDay) {
            count++;
          }
        }
      });
      setRoomBookingsToday(count);
    }, (error) => {
      console.error('Error fetching room bookings:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch recent pending room bookings (last 3) - MATCHING reservations page logic
  useEffect(() => {
    const bookingsRef = collection(db, 'bookings');
    // Query for pending room bookings
    const q = query(
      bookingsRef,
      where('status', '==', 'pending'),
      where('type', '==', 'room'),
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingBookings = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        pendingBookings.push({
          id: doc.id,
          bookingId: data.bookingId,
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim(),
          roomType: data.isMultiRoomBooking ? 'Multi-Room' : data.roomType,
          checkIn: data.checkIn,
          createdAt: data.createdAt
        });
      });
      setRecentPendingRoomBookings(pendingBookings);
    }, (error) => {
      console.error('Error fetching pending room bookings:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch recent pending day tour bookings (last 3) - MATCHING reservations page logic
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
          Welcome back, {adminName}. Here's what's happening at SandyFeet today.
        </p>
      </div>

      {/* Summary Containers - 4 in a row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Container 1: Room Check-ins Today */}
        <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-[#4D8CF5]/10 flex items-center justify-center">
                <i className="fas fa-bed text-[#4D8CF5] text-lg"></i>
              </div>
              <span className="text-3xl font-bold text-[#1E3A8A]">{roomCheckInsToday}</span>
            </div>
            <h3 className="text-sm font-semibold text-[#1E3A8A] mb-1">Room Check-ins Today</h3>
            <p className="text-xs text-[#1E3A8A]/60">Guests checking in today</p>
          </div>
        </div>

        {/* Container 2: Day Tour Guests Today */}
        <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-[#4D8CF5]/10 flex items-center justify-center">
                <i className="fas fa-users text-[#4D8CF5] text-lg"></i>
              </div>
              <span className="text-3xl font-bold text-[#1E3A8A]">{dayTourGuestsToday}</span>
            </div>
            <h3 className="text-sm font-semibold text-[#1E3A8A] mb-1">Day Tour Guests Today</h3>
            <p className="text-xs text-[#1E3A8A]/60">Total guests on day tours</p>
          </div>
        </div>

        {/* Container 3: Day Tour Bookings Today */}
        <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-[#4D8CF5]/10 flex items-center justify-center">
                <i className="fas fa-sun text-[#4D8CF5] text-lg"></i>
              </div>
              <span className="text-3xl font-bold text-[#1E3A8A]">{dayTourBookingsToday}</span>
            </div>
            <h3 className="text-sm font-semibold text-[#1E3A8A] mb-1">Day Tour Bookings Today</h3>
            <p className="text-xs text-[#1E3A8A]/60">Bookings scheduled for today</p>
          </div>
        </div>

        {/* Container 4: Room Bookings Today */}
        <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-[#4D8CF5]/10 flex items-center justify-center">
                <i className="fas fa-calendar-check text-[#4D8CF5] text-lg"></i>
              </div>
              <span className="text-3xl font-bold text-[#1E3A8A]">{roomBookingsToday}</span>
            </div>
            <h3 className="text-sm font-semibold text-[#1E3A8A] mb-1">Room Bookings Today</h3>
            <p className="text-xs text-[#1E3A8A]/60">Bookings starting today</p>
          </div>
        </div>
      </div>

      {/* Recent Reservations Section - Two columns side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Pending Room Reservations - MAX 3 ITEMS */}
        <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden">
          <div className="bg-[#4D8CF5]/10 px-5 py-4 border-b border-[#4D8CF5]/20 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-bed"></i>
                Recent Pending Room Reservations
              </h2>
              <p className="text-[#1E3A8A]/70 text-xs mt-0.5">
                Latest {recentPendingRoomBookings.length} pending room booking requests
              </p>
            </div>
            <Link 
              href="/dashboard/admin/reservations"
              className="px-3 py-1.5 rounded-lg border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] text-xs font-medium hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center gap-1"
            >
              View All
              <i className="fas fa-arrow-right text-xs"></i>
            </Link>
          </div>
          
          <div className="p-5">
            {recentPendingRoomBookings.length === 0 ? (
              <div className="text-center py-8 text-[#1E3A8A]/60">
                <i className="fas fa-check-circle text-3xl mb-2 block text-green-400"></i>
                <p className="text-sm">No pending room reservations</p>
                <p className="text-xs mt-1">All room reservations are confirmed</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPendingRoomBookings.map((booking) => (
                  <div key={booking.id} className="border border-[#4D8CF5]/10 rounded-xl p-3 hover:shadow-md transition-all duration-200">
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
                          Booking ID: {booking.bookingId}
                        </p>
                        <p className="text-xs text-[#1E3A8A]/70">
                          Room: {booking.roomType}
                        </p>
                        <p className="text-xs text-[#1E3A8A]/70">
                          Check-in: {formatDate(booking.checkIn)}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap ml-2">
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent Pending Day Tour Reservations - MAX 3 ITEMS */}
        <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden">
          <div className="bg-[#4D8CF5]/10 px-5 py-4 border-b border-[#4D8CF5]/20 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-sun"></i>
                Recent Pending Day Tour Reservations
              </h2>
              <p className="text-[#1E3A8A]/70 text-xs mt-0.5">
                Latest {recentPendingDayTours.length} pending day tour booking requests
              </p>
            </div>
            <Link 
              href="/dashboard/admin/reservations"
              className="px-3 py-1.5 rounded-lg border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] text-xs font-medium hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center gap-1"
            >
              View All
              <i className="fas fa-arrow-right text-xs"></i>
            </Link>
          </div>
          
          <div className="p-5">
            {recentPendingDayTours.length === 0 ? (
              <div className="text-center py-8 text-[#1E3A8A]/60">
                <i className="fas fa-check-circle text-3xl mb-2 block text-green-400"></i>
                <p className="text-sm">No pending day tour reservations</p>
                <p className="text-xs mt-1">All day tour reservations are confirmed</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPendingDayTours.map((booking) => (
                  <div key={booking.id} className="border border-[#4D8CF5]/10 rounded-xl p-3 hover:shadow-md transition-all duration-200">
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
                          Booking ID: {booking.bookingId}
                        </p>
                        <p className="text-xs text-[#1E3A8A]/70">
                          Tour Date: {booking.selectedDate ? formatDate(booking.selectedDate) : 'N/A'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap ml-2">
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

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}