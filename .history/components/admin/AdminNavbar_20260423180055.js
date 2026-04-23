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

  // Helper function to get notification meta
  const getNotificationMeta = (type) => {
    const meta = {
      icon: 'fas fa-bell',
      label: 'Notification'
    };
    
    switch(type) {
      case 'cancellation':
        meta.icon = 'fas fa-calendar-times';
        meta.label = 'Cancellation';
        break;
      case 'bank_transfer':
      case 'bank_transfer_daytour':
        meta.icon = 'fas fa-university';
        meta.label = 'Bank Transfer';
        break;
      case 'reservation_room':
        meta.icon = 'fas fa-bed';
        meta.label = 'Room Booking';
        break;
      case 'reservation_daytour':
        meta.icon = 'fas fa-sun';
        meta.label = 'Day Tour Booking';
        break;
    }
    return meta;
  };

  return (
    <nav 
      className="fixed right-0 h-16 bg-white/95 backdrop-blur-sm z-50 border-b border-gray-100 flex items-center"
      style={navbarStyle}
    >
      <div className="flex items-center justify-between h-full px-6 w-full">
        {/* Left section: hamburger (mobile) */}
        <div className="flex items-center gap-3">
          {/* Hamburger button - visible only on mobile */}
          <button
            onClick={toggleSidebar}
            className="block lg:hidden text-gray-500 hover:text-gray-700 transition-all duration-200 p-1 rounded-md focus:outline-none"
            aria-label="Menu"
          >
            <span className="material-icons text-2xl">menu</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Role and Name Badge - Minimalist */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
              <i className="fas fa-user text-gray-500 text-xs"></i>
            </div>
            <span className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">{userRole}</span>
              <span className="mx-1 text-gray-300">·</span>
              <span>{userName}</span>
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200"></div>

          {/* Notification Bell - Minimalist */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              className="relative flex items-center justify-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all duration-200"
            >
              <i className="fas fa-bell text-sm"></i>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-medium rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            
            {/* Notifications Dropdown - Minimalist Design */}
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-[380px] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-dropdown">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-bell text-gray-400 text-sm"></i>
                      <h3 className="text-sm font-medium text-gray-800">Notifications</h3>
                    </div>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Notifications List */}
                <div className="max-h-[420px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-50 flex items-center justify-center">
                        <i className="fas fa-bell-slash text-gray-300 text-lg"></i>
                      </div>
                      <p className="text-xs text-gray-400">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const meta = getNotificationMeta(notification.type);
                      return (
                        <div 
                          key={`${notification.type}-${notification.id}`} 
                          onClick={() => handleMarkAsRead(notification)}
                          className={`group relative border-b border-gray-50 transition-all duration-150 cursor-pointer ${
                            !notification.read ? 'bg-blue-50/20' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="px-5 py-3">
                            <div className="flex items-start gap-3">
                              {/* Icon */}
                              <div className="flex-shrink-0 mt-0.5">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                  !notification.read ? 'bg-blue-100' : 'bg-gray-100'
                                }`}>
                                  <i className={`${meta.icon} text-xs ${
                                    !notification.read ? 'text-blue-600' : 'text-gray-500'
                                  }`}></i>
                                </div>
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                {/* Title row */}
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <p className={`text-xs font-medium ${
                                    !notification.read ? 'text-gray-900' : 'text-gray-700'
                                  }`}>
                                    {meta.label}
                                  </p>
                                  {!notification.read && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div>
                                  )}
                                </div>
                                
                                {/* Message */}
                                {notification.type === 'bank_transfer' ? (
                                  <>
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                      <span className="font-medium text-gray-700">{notification.guestName}</span> requested bank transfer for <span className="font-medium text-gray-700">{notification.roomType || 'room'}</span>
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      <i className="fas fa-building mr-1"></i>{notification.selectedBank}
                                    </p>
                                  </>
                                ) : notification.type === 'bank_transfer_daytour' ? (
                                  <>
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                      <span className="font-medium text-gray-700">{notification.guestName}</span> · Booking <span className="font-mono text-gray-600">{notification.bookingId}</span>
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      <i className="fas fa-building mr-1"></i>{notification.selectedBank}
                                    </p>
                                  </>
                                ) : notification.type === 'reservation_room' ? (
                                  <>
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                      <span className="font-medium text-gray-700">{notification.guestName}</span> booked <span className="font-medium text-gray-700">{notification.roomType}</span>
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-1 font-mono">
                                      #{notification.bookingId}
                                    </p>
                                  </>
                                ) : notification.type === 'reservation_daytour' ? (
                                  <>
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                      <span className="font-medium text-gray-700">{notification.guestName}</span> booked a day tour
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <p className="text-[10px] text-gray-400 font-mono">
                                        #{notification.bookingId}
                                      </p>
                                      <span className="text-[9px] text-gray-300">•</span>
                                      <p className="text-[10px] text-gray-500">
                                        {notification.reservationDate}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                      <span className="font-medium text-gray-700">{notification.guestName}</span> cancelled reservation <span className="font-mono text-gray-600">{notification.bookingId}</span>
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <p className="text-[10px] text-gray-500">
                                        {notification.roomType === 'daytour' ? 'Day Tour' : notification.roomType || 'Room'}
                                      </p>
                                      {notification.selectedDate && notification.roomType === 'daytour' && (
                                        <>
                                          <span className="text-[9px] text-gray-300">•</span>
                                          <p className="text-[10px] text-gray-500">
                                            {notification.selectedDate}
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </>
                                )}
                                
                                {/* Timestamp */}
                                <p className="text-[9px] text-gray-400 mt-2">
                                  {asDate(notification.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="px-5 py-2.5 border-t border-gray-50 text-center">
                    <button 
                      onClick={() => setShowNotifications(false)}
                      className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors duration-150"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes dropdown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-dropdown {
          animation: dropdown 0.2s ease-out;
        }
      `}</style>
    </nav>
  );
}