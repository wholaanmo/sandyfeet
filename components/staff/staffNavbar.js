'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc, collection, query, orderBy, onSnapshot, updateDoc, writeBatch, getDocs } from 'firebase/firestore';

export default function StaffNavbar({ toggleSidebar, sidebarOpen, isDesktop }) {
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const asDate = (value) => {
    if (!value) return new Date(0);
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const uid = localStorage.getItem('uid');
        if (uid) {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserName(userData.name || 'User');
            setUserRole(userData.role === 'admin' ? 'Administrator' : 'Staff');
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };
    
    fetchUserData();
  }, []);

  useEffect(() => {
    const bankRequestsRef = collection(db, 'bank_requests');
    const q = query(bankRequestsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const requests = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        requests.push({
          id: docSnap.id,
          type: 'bank_transfer',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: data.roomType,
          selectedBank: data.requestedBank?.bankName || 'N/A',
          createdAt: data.createdAt,
          read: data.read === true
        });
      });
      setNotifications((prev) => {
        const combined = [...prev.filter((n) => n.type !== 'bank_transfer'), ...requests];
        combined.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
        return combined;
      });
    }, (error) => console.error('Error fetching bank transfer requests:', error));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const dayTourBankRequestsRef = collection(db, 'daytour_bank_requests');
    const q = query(dayTourBankRequestsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const requests = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        requests.push({
          id: docSnap.id,
          type: 'bank_transfer_daytour',
          guestName: data.guestName,
          bookingId: data.bookingId,
          selectedDate: data.selectedDate,
          selectedBank: data.requestedBank?.bankName || 'N/A',
          createdAt: data.createdAt,
          read: data.read === true
        });
      });
      setNotifications((prev) => {
        const combined = [...prev.filter((n) => n.type !== 'bank_transfer_daytour'), ...requests];
        combined.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
        return combined;
      });
    }, (error) => console.error('Error fetching day tour bank transfer requests:', error));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const bookingsRef = collection(db, 'bookings');
    const q = query(bookingsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const reservationNotifications = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.type !== 'room') return;
        reservationNotifications.push({
          id: docSnap.id,
          type: 'reservation_room',
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
          bookingId: data.bookingId,
          roomType: data.roomType || 'N/A',
          createdAt: data.createdAt,
          read: data.read === true
        });
      });
      setNotifications((prev) => {
        const combined = [...prev.filter((n) => n.type !== 'reservation_room'), ...reservationNotifications];
        combined.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
        return combined;
      });
    }, (error) => console.error('Error fetching room reservations notifications:', error));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const dayTourRef = collection(db, 'dayTourBookings');
    const q = query(dayTourRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const reservationNotifications = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        reservationNotifications.push({
          id: docSnap.id,
          type: 'reservation_daytour',
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
          bookingId: data.bookingId,
          reservationDate: data.selectedDate || 'N/A',
          createdAt: data.createdAt,
          read: data.read === true
        });
      });
      setNotifications((prev) => {
        const combined = [...prev.filter((n) => n.type !== 'reservation_daytour'), ...reservationNotifications];
        combined.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
        return combined;
      });
    }, (error) => console.error('Error fetching day tour reservation notifications:', error));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const cancellationsRef = collection(db, 'guest_cancellations');
    const q = query(cancellationsRef, orderBy('cancelledAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const cancellations = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cancellations.push({
          id: docSnap.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: data.roomType,
          selectedDate: data.selectedDate || data.reservationDate || data.date,
          createdAt: data.cancelledAt,
          read: data.read === true
        });
      });
      setNotifications((prev) => {
        const combined = [...prev.filter((n) => n.type !== 'cancellation'), ...cancellations];
        combined.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
        return combined;
      });
    }, (error) => console.error('Error fetching guest cancellations:', error));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setUnreadCount(notifications.filter((n) => !n.read).length);
  }, [notifications]);

  const markNotificationAsRead = async (notification) => {
    if (notification.read) return;
    try {
      let collectionName = 'guest_cancellations';
      if (notification.type === 'bank_transfer') collectionName = 'bank_requests';
      if (notification.type === 'bank_transfer_daytour') collectionName = 'daytour_bank_requests';
      if (notification.type === 'reservation_room') collectionName = 'bookings';
      if (notification.type === 'reservation_daytour') collectionName = 'dayTourBookings';
      await updateDoc(doc(db, collectionName, notification.id), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;
    try {
      const batch = writeBatch(db);

      const bankSnapshot = await getDocs(query(collection(db, 'bank_requests')));
      bankSnapshot.forEach((docSnap) => {
        if (docSnap.data().read !== true) batch.update(docSnap.ref, { read: true });
      });

      const dayTourBankSnapshot = await getDocs(query(collection(db, 'daytour_bank_requests')));
      dayTourBankSnapshot.forEach((docSnap) => {
        if (docSnap.data().read !== true) batch.update(docSnap.ref, { read: true });
      });

      const roomBookingsSnapshot = await getDocs(query(collection(db, 'bookings')));
      roomBookingsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.type === 'room' && data.read !== true) batch.update(docSnap.ref, { read: true });
      });

      const dayTourSnapshot = await getDocs(query(collection(db, 'dayTourBookings')));
      dayTourSnapshot.forEach((docSnap) => {
        if (docSnap.data().read !== true) batch.update(docSnap.ref, { read: true });
      });

      const cancellationSnapshot = await getDocs(query(collection(db, 'guest_cancellations')));
      cancellationSnapshot.forEach((docSnap) => {
        if (docSnap.data().read !== true) batch.update(docSnap.ref, { read: true });
      });

      await batch.commit();
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const handleToggleNotifications = async () => {
    if (!showNotifications) {
      await markAllAsRead();
    }
    setShowNotifications(!showNotifications);
  };

  // Dynamic navbar style (copied from AdminNavbar)
  const navbarStyle = isDesktop
    ? {
        left: sidebarOpen ? '260px' : '80px',
        width: sidebarOpen ? 'calc(100% - 260px)' : 'calc(100% - 80px)',
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }
    : {
        left: 0,
        width: '100%',
        transition: 'none'
      };

  return (
    <nav 
      className="fixed right-0 h-navbar bg-white z-50 shadow-sm flex items-center"
      style={navbarStyle}
    >
      <div className="flex items-center justify-between h-full px-6 w-full">
        {/* Left section: hamburger (mobile) + page title (desktop) */}
        <div className="flex items-center gap-3">
          {/* Hamburger button - visible only on mobile */}
          <button
            onClick={toggleSidebar}
            className="block lg:hidden text-ocean-mid hover:text-ocean-deep hover:scale-105 transition-all duration-200 p-1 rounded-md focus:outline-none"
            aria-label="Menu"
          >
            <span className="material-icons text-2xl">menu</span>
          </button>
          
          {/* Page Title - hidden on mobile */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-1 h-8 bg-gradient-to-b from-ocean-light to-ocean-mid rounded-full"></div>
            <h1 className="text-xl font-semibold text-ocean-deep font-playfair">
              Staff Dashboard
            </h1>
          </div>
        </div>

        {/* Right section: user badge and notifications (unchanged) */}
        <div className="flex items-center gap-4">
          {/* Role and Name Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-white to-white shadow-sm border border-ocean-light/10 hover:shadow-md transition-all duration-200">
            <i className="fas fa-user-tie text-ocean-light text-base"></i>
            <span className="text-sm font-semibold text-ocean-deep">
              Staff: {userName || 'Staff Member'}
            </span>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-blue-white to-white text-ocean-light border border-ocean-light/10 hover:bg-gradient-to-r hover:from-ocean-light hover:to-ocean-mid hover:text-white transition-all duration-300 shadow-sm"
            >
              <i className="fas fa-bell text-base"></i>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-ocean-light/20 overflow-hidden z-50">
                <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-3">
                  <h3 className="text-white font-semibold text-sm">
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-2 bg-white text-ocean-mid text-xs px-2 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-textSecondary text-sm">
                      <i className="fas fa-bell-slash text-2xl mb-2 block opacity-50"></i>
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={`${notification.type}-${notification.id}`}
                        onClick={() => markNotificationAsRead(notification)}
                        className={`border-b border-ocean-light/10 p-4 hover:bg-ocean-ice/30 transition-colors cursor-pointer ${!notification.read ? 'bg-ocean-ice/10' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            notification.type === 'cancellation' ? 'bg-red-100' : 'bg-amber-100'
                          }`}>
                            <i className={`${
                              notification.type === 'cancellation'
                                ? 'fas fa-times-circle text-red-600'
                                : notification.type === 'reservation_room'
                                ? 'fas fa-bed text-amber-600'
                                : notification.type === 'reservation_daytour'
                                ? 'fas fa-sun text-amber-600'
                                : 'fas fa-university text-amber-600'
                            } text-sm`}></i>
                          </div>
                          <div className="flex-1">
                            {notification.type === 'bank_transfer' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">Room Bank Transfer Request</p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Selected Bank: {notification.selectedBank}
                                </p>
                              </>
                            ) : notification.type === 'bank_transfer_daytour' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">Day Tour Bank Transfer Request</p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Selected Bank: {notification.selectedBank}
                                </p>
                              </>
                            ) : notification.type === 'reservation_room' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">Room Reservation</p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Room Type: {notification.roomType}
                                </p>
                              </>
                            ) : notification.type === 'reservation_daytour' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">Day Tour Reservation</p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Date: {notification.reservationDate}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">Guest Cancellation</p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} cancelled reservation {notification.bookingId} ({notification.roomType || 'day tour'})
                                </p>
                                {notification.roomType === 'daytour' && (
                                  <p className="text-xs text-ocean-mid mt-1 font-medium">
                                    Date: {notification.selectedDate || 'N/A'}
                                  </p>
                                )}
                              </>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{asDate(notification.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}