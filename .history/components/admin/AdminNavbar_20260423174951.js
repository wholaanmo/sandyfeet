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
      className="fixed right-0 h-16 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100 flex items-center"
      style={navbarStyle}
    >
      <div className="flex items-center justify-between h-full px-6 w-full">
        {/* Left section: hamburger (mobile) */}
        <div className="flex items-center gap-3">
          {/* Hamburger button - visible only on mobile */}
          <button
            onClick={toggleSidebar}
            className="block lg:hidden text-gray-500 hover:text-gray-700 transition-all duration-200 p-2 rounded-lg hover:bg-gray-50 focus:outline-none"
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* User Avatar & Name - Minimalist */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-medium">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-700">{userName}</p>
              <p className="text-xs text-gray-400">{userRole === 'Administrator' ? 'Admin' : 'Staff'}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200"></div>

          {/* Notification Bell - Minimalist */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              className="relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all duration-200 focus:outline-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            
            {/* Notifications Dropdown - Minimalist Redesign */}
            {showNotifications && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-slideDown">
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-gray-800">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Notification List */}
                  <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
                    {notifications.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-50 flex items-center justify-center">
                          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        </div>
                        <p className="text-sm text-gray-400">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div 
                          key={`${notification.type}-${notification.id}`} 
                          onClick={() => handleMarkAsRead(notification)}
                          className={`px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/30' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              notification.type === 'cancellation' ? 'bg-red-50' : 
                              notification.type === 'reservation_room' ? 'bg-blue-50' :
                              notification.type === 'reservation_daytour' ? 'bg-amber-50' : 'bg-emerald-50'
                            }`}>
                              <i className={`${
                                notification.type === 'cancellation'
                                  ? 'fas fa-times text-red-500 text-sm'
                                  : notification.type === 'reservation_room'
                                  ? 'fas fa-bed text-blue-500 text-sm'
                                  : notification.type === 'reservation_daytour'
                                  ? 'fas fa-sun text-amber-500 text-sm'
                                  : 'fas fa-university text-emerald-500 text-sm'
                              }`}></i>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">
                                {notification.type === 'bank_transfer' && 'Bank Transfer Request'}
                                {notification.type === 'bank_transfer_daytour' && 'Day Tour Bank Transfer'}
                                {notification.type === 'reservation_room' && 'New Room Booking'}
                                {notification.type === 'reservation_daytour' && 'New Day Tour Booking'}
                                {notification.type === 'cancellation' && 'Cancellation Request'}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {notification.guestName}
                              </p>
                              {(notification.type === 'reservation_room' || notification.type === 'cancellation') && notification.roomType && (
                                <p className="text-xs text-gray-400 mt-1">
                                  {notification.roomType}
                                </p>
                              )}
                              {notification.type === 'bank_transfer' && notification.selectedBank && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Bank: {notification.selectedBank}
                                </p>
                              )}
                              {notification.type === 'bank_transfer_daytour' && notification.selectedBank && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Bank: {notification.selectedBank}
                                </p>
                              )}
                              {(notification.type === 'reservation_daytour' || (notification.type === 'cancellation' && notification.roomType === 'Day Tour')) && notification.selectedDate && (
                                <p className="text-xs text-gray-400 mt-1">
                                  {notification.selectedDate}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-1.5">
                                {asDate(notification.createdAt).toLocaleString()}
                              </p>
                            </div>
                            
                            {/* Unread indicator */}
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>
    </nav>
  );
}