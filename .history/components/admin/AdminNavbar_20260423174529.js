// components/admin/AdminNavbar.js
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  asDate, 
  setupBankRequestsListener, 
  setupDayTourBankRequestsListener, 
  setupRoomReservationsListener, 
  setupDayTourReservationsListener, 
  setupGuestCancellationsListener,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from './notificationService';

export default function AdminNavbar({ toggleSidebar, sidebarOpen, isDesktop }) {
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);

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

  // Combined notification update handler
  const handleNotificationsUpdate = (newItems, type) => {
    setNotifications(prev => {
      const filtered = prev.filter(n => n.type !== type);
      const combined = [...filtered, ...newItems];
      combined.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
      return combined;
    });
  };

  // Set up all notification listeners
  useEffect(() => {
    const unsubscribeBank = setupBankRequestsListener(handleNotificationsUpdate);
    const unsubscribeDayTourBank = setupDayTourBankRequestsListener(handleNotificationsUpdate);
    const unsubscribeRoomReservations = setupRoomReservationsListener(handleNotificationsUpdate);
    const unsubscribeDayTourReservations = setupDayTourReservationsListener(handleNotificationsUpdate);
    const unsubscribeCancellations = setupGuestCancellationsListener(handleNotificationsUpdate);

    return () => {
      unsubscribeBank();
      unsubscribeDayTourBank();
      unsubscribeRoomReservations();
      unsubscribeDayTourReservations();
      unsubscribeCancellations();
    };
  }, []);

  // Recalculate unread count whenever notifications change
  useEffect(() => {
    const count = notifications.filter(n => !n.read).length;
    setUnreadCount(count);
  }, [notifications]);

  const handleToggleNotifications = async () => {
    if (!showNotifications && unreadCount > 0) {
      await markAllNotificationsAsRead();
      // Update local read status
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
    setShowNotifications(!showNotifications);
  };

  const handleMarkAsRead = async (notification) => {
    await markNotificationAsRead(notification);
    setNotifications(prev => prev.map(n => 
      n.id === notification.id && n.type === notification.type ? { ...n, read: true } : n
    ));
  };

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
        {/* Left section: hamburger (mobile) */}
        <div className="flex items-center gap-3">
          {/* Hamburger button - visible only on mobile */}
          <button
            onClick={toggleSidebar}
            className="block lg:hidden text-ocean-mid hover:text-ocean-deep hover:scale-105 transition-all duration-200 p-1 rounded-md focus:outline-none"
            aria-label="Menu"
          >
            <span className="material-icons text-2xl">menu</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Role and Name Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-white to-white shadow-sm border border-ocean-light/10 hover:shadow-md transition-all duration-200">
            <i className="fas fa-user-circle text-ocean-light text-base"></i>
            <span className="text-sm font-semibold text-[#1E3A8A]">
              {userRole}: {userName}
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
            
            {/* Notifications Dropdown */}
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
                        onClick={() => handleMarkAsRead(notification)}
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
                                <p className="text-sm font-semibold text-textPrimary">
                                  Room Bank Transfer Request
                                </p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} requested bank transfer for {notification.roomType || 'room'}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Selected Bank: {notification.selectedBank}
                                </p>
                              </>
                            ) : notification.type === 'bank_transfer_daytour' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">
                                  Day Tour Bank Transfer Request
                                </p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Selected Bank: {notification.selectedBank}
                                </p>
                              </>
                            ) : notification.type === 'reservation_room' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">
                                  Room Reservation
                                </p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Room Type: {notification.roomType}
                                </p>
                              </>
                            ) : notification.type === 'reservation_daytour' ? (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">
                                  Day Tour Reservation
                                </p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} | Booking ID: {notification.bookingId}
                                </p>
                                <p className="text-xs text-ocean-mid mt-1 font-medium">
                                  Date: {notification.reservationDate}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-textPrimary">
                                  Guest Cancellation
                                </p>
                                <p className="text-xs text-textSecondary mt-1">
                                  {notification.guestName} cancelled reservation
                                  {notification.bookingId} <br /> ({notification.roomType || 'day tour'})
                                </p>
                                {notification.roomType === 'daytour' && (
                                  <p className="text-xs text-ocean-mid mt-1 font-medium">
                                    Date: {notification.selectedDate || 'N/A'}
                                  </p>
                                )}
                              </>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {asDate(notification.createdAt).toLocaleString()}
                            </p>
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