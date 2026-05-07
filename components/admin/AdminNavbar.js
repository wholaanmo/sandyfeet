// components/admin/AdminNavbar.js
'use client';

import { useState, useEffect, useRef } from 'react';
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
  setupRoomStatusListener, 
  markNotificationAsRead,
  markAllNotificationsAsRead
} from './notificationService';

export default function AdminNavbar({ toggleSidebar, sidebarOpen, isDesktop }) {
  const STATUS_READ_STORAGE_KEY = 'admin_status_notifications_read';
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [statusReadMap, setStatusReadMap] = useState({});
  const statusReadMapRef = useRef({});
  const hasMarkedReadForCurrentOpen = useRef(false); // Prevent duplicate marking per open

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
    try {
      const raw = localStorage.getItem(STATUS_READ_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setStatusReadMap(parsed);
        statusReadMapRef.current = parsed;
      }
    } catch (error) {
      console.error('Error loading notification read state:', error);
    }
  }, []);

  const persistStatusReadMap = (nextMap) => {
    setStatusReadMap(nextMap);
    statusReadMapRef.current = nextMap;
    try {
      localStorage.setItem(STATUS_READ_STORAGE_KEY, JSON.stringify(nextMap));
    } catch (error) {
      console.error('Error saving notification read state:', error);
    }
  };

  // Combined notification update handler
  const handleNotificationsUpdate = (newItems, type) => {
    setNotifications(prev => {
      const isStatusType = type === 'check_in' || type === 'check_out';

      // For status notifications, don't clear the list if the service emits an empty update.
      if (isStatusType && (!Array.isArray(newItems) || newItems.length === 0)) {
        return prev;
      }

      const filtered = prev.filter(n => n.type !== type);

      // Mark read status for status notifications
      let itemsWithReadState = isStatusType
        ? newItems.map(item => ({ ...item, read: statusReadMapRef.current[`${item.type}-${item.id}`] === true }))
        : newItems;

      // --- DEDUPLICATE based on type + id ---
      const uniqueMap = new Map();
      itemsWithReadState.forEach(item => {
        const key = `${item.type}-${item.id}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, item);
      });
      const uniqueItems = Array.from(uniqueMap.values());

      const combined = [...filtered, ...uniqueItems];
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
    const unsubscribeRoomStatus = setupRoomStatusListener(handleNotificationsUpdate);

    return () => {
      unsubscribeBank();
      unsubscribeDayTourBank();
      unsubscribeRoomReservations();
      unsubscribeDayTourReservations();
      unsubscribeCancellations();
      unsubscribeRoomStatus();
    };
  }, []);

  // Recalculate unread count whenever notifications change
  useEffect(() => {
    const count = notifications.filter(n => !n.read).length;
    setUnreadCount(count);
  }, [notifications]);

  // Mark all as read in the background when dropdown opens (does NOT block render)
  useEffect(() => {
    if (showNotifications && unreadCount > 0 && !hasMarkedReadForCurrentOpen.current) {
      hasMarkedReadForCurrentOpen.current = true;
      markAllNotificationsAsRead()
        .then(() => {
          const nextReadMap = { ...statusReadMap };
          notifications.forEach((n) => {
            if ((n.type === 'check_in' || n.type === 'check_out') && !n.read) {
              nextReadMap[`${n.type}-${n.id}`] = true;
            }
          });
          persistStatusReadMap(nextReadMap);
          setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        })
        .catch(err => console.error('Error marking notifications as read:', err));
    }
    // Reset flag when dropdown closes
    if (!showNotifications) {
      hasMarkedReadForCurrentOpen.current = false;
    }
  }, [showNotifications, unreadCount, notifications, statusReadMap]);

  const handleToggleNotifications = async () => {
    // Open the dropdown immediately – do NOT wait for markAllNotificationsAsRead
    setShowNotifications(!showNotifications);
    // The background marking will be triggered by the useEffect above
  };

  const handleMarkAsRead = async (notification) => {
    await markNotificationAsRead(notification);
    if (notification.type === 'check_in' || notification.type === 'check_out') {
      persistStatusReadMap({
        ...statusReadMap,
        [`${notification.type}-${notification.id}`]: true
      });
    }
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

  // Function to get notification icon and color based on type
  const getNotificationStyle = (type) => {
    switch(type) {
      case 'cancellation':
        return { icon: 'fas fa-calendar-times', bgColor: 'bg-gradient-to-br from-red-50 to-red-100', iconColor: 'text-red-600', borderColor: 'border-red-200' };
      case 'bank_transfer':
      case 'bank_transfer_daytour':
        return { icon: 'fas fa-university', bgColor: 'bg-gradient-to-br from-amber-50 to-amber-100', iconColor: 'text-amber-600', borderColor: 'border-amber-200' };
      case 'reservation_room':
        return { icon: 'fas fa-bed', bgColor: 'bg-gradient-to-br from-blue-50 to-blue-100', iconColor: 'text-blue-600', borderColor: 'border-blue-200' };
      case 'reservation_daytour':
        return { icon: 'fas fa-sun', bgColor: 'bg-gradient-to-br from-emerald-50 to-emerald-100', iconColor: 'text-emerald-600', borderColor: 'border-emerald-200' };
      case 'check_in':
        return { icon: 'fas fa-sign-in-alt', bgColor: 'bg-gradient-to-br from-green-50 to-green-100', iconColor: 'text-green-600', borderColor: 'border-green-200' };
      case 'check_out':
        return { icon: 'fas fa-sign-out-alt', bgColor: 'bg-gradient-to-br from-purple-50 to-purple-100', iconColor: 'text-purple-600', borderColor: 'border-purple-200' };
      default:
        return { icon: 'fas fa-bell', bgColor: 'bg-gradient-to-br from-gray-50 to-gray-100', iconColor: 'text-gray-600', borderColor: 'border-gray-200' };
    }
  };

  return (
    <nav 
      className="fixed right-0 h-16 bg-white/80 backdrop-blur-md z-50 shadow-lg flex items-center border-b border-[#4D8CF5]/10"
      style={navbarStyle}
    >
      <div className="flex items-center justify-between h-full px-6 w-full">
        {/* Left section: hamburger (mobile) */}
        <div className="flex items-center gap-3">
          {/* Hamburger button - visible only on mobile */}
          <button
            onClick={toggleSidebar}
            className="block lg:hidden text-[#1E3A8A] hover:text-[#4D8CF5] hover:scale-105 transition-all duration-200 p-2 rounded-xl hover:bg-[#4D8CF5]/10 focus:outline-none"
            aria-label="Menu"
          >
            <span className="material-icons text-2xl">menu</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Role and Name Badge - Enhanced */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#4D8CF5]/5 to-[#7AAAF8]/5 backdrop-blur-sm shadow-sm border border-[#4D8CF5]/15 hover:shadow-md hover:border-[#4D8CF5]/30 transition-all duration-300">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4D8CF5] to-[#7AAAF8] flex items-center justify-center shadow-md">
              <i className="fas fa-user-shield text-white text-xs"></i>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[#1E3A8A]">
                {userRole}: {userName}
              </span>
            </div>
          </div>

          {/* Notification Bell - Enhanced */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-white to-gray-50 text-[#1E3A8A] border border-[#4D8CF5]/20 hover:bg-gradient-to-br hover:from-[#4D8CF5] hover:to-[#7AAAF8] hover:text-white hover:border-transparent transition-all duration-300 shadow-sm hover:shadow-md group"
            >
              <i className="fas fa-bell text-lg group-hover:scale-105 transition-transform duration-200"></i>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 shadow-md animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            
            {/* Notifications Dropdown - Enhanced UI */}
            {showNotifications && (
              <div className="absolute right-0 mt-3 w-96 bg-white rounded-2xl shadow-2xl border border-[#4D8CF5]/15 overflow-hidden z-50 animate-fadeIn">
                {/* Header */}
                <div className="px-5 py-4 bg-[#7AAAF8]/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-bell text-#1F2937e text-lg"></i>
                      <h3 className="text-#1F2937 font-bold text-base">Notifications</h3>
                    </div>
                    {unreadCount > 0 && (
                      <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Notifications List */}
                <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-100">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <i className="fas fa-bell-slash text-2xl text-gray-400"></i>
                      </div>
                      <p className="text-gray-500 font-medium">No notifications</p>
                      <p className="text-xs text-gray-400 mt-1">New notifications will appear here</p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const style = getNotificationStyle(notification.type);
                      return (
                        <div 
                          key={`${notification.type}-${notification.id}`} 
                          onClick={() => handleMarkAsRead(notification)}
                          className={`relative p-4 transition-all duration-200 cursor-pointer hover:bg-gray-50 ${
                            !notification.read ? 'bg-gradient-to-r from-[#4D8CF5]/5 to-transparent border-l-4 border-[#4D8CF5]' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon Container */}
                            <div className={`w-10 h-10 rounded-xl ${style.bgColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                              <i className={`${style.icon} ${style.iconColor} text-base`}></i>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                            {notification.type === 'bank_transfer' ? (
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Room Bank Transfer Request
    </p>
    <p className="text-xs text-gray-600 mb-1">
      <span className="font-semibold">{notification.guestName}</span> requested bank transfer for {notification.roomType || 'room'}
    </p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-amber-50 rounded-full">
      <i className="fas fa-building text-amber-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-amber-700">{notification.selectedBank}</span>
    </div>
  </>
) : notification.type === 'bank_transfer_daytour' ? (
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Day Tour Bank Transfer Request
    </p>
    <p className="text-xs text-gray-600 mb-1">
      <span className="font-semibold">{notification.guestName}</span> | Booking ID: <span className="font-mono">{notification.bookingId}</span>
    </p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-amber-50 rounded-full">
      <i className="fas fa-building text-amber-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-amber-700">{notification.selectedBank}</span>
    </div>
  </>
) : notification.type === 'reservation_room' ? (
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Room Reservation
    </p>
                                     <p className="text-xs text-gray-600 mb-1">
                                    <span className="font-semibold">{notification.guestName}</span> 
                                  </p>
                                  <p className="text-xs text-gray-600 mb-1"> <span className="font-semibold">  Booking ID: </span> <span className="font-mono">{notification.bookingId}</span></p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-blue-50 rounded-full">
      <i className="fas fa-bed text-blue-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-blue-700">{notification.roomType}</span>
    </div>
  </>
) : notification.type === 'reservation_daytour' ? (
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Day Tour Reservation
    </p>
    <p className="text-xs text-gray-600 mb-1">
      <span className="font-semibold">{notification.guestName}</span> 
    </p>
    <p className="text-xs text-gray-600 mb-1"> <span className="font-semibold">  Booking ID: </span><span className="font-mono">{notification.bookingId}</span></p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-emerald-50 rounded-full">
      <i className="fas fa-calendar-alt text-emerald-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-emerald-700">{notification.reservationDate}</span>
    </div>
  </>
) : notification.type === 'check_in' ? (
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Guest Check-In
    </p>
    <p className="text-xs text-gray-600 mb-1">
      <span className="font-semibold">{notification.guestName}</span> is scheduled to check in
    </p>
    <p className="text-xs text-gray-600 mb-1"> <span className="font-semibold">Booking ID: </span> {notification.bookingId} </p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-green-50 rounded-full">
      <i className="fas fa-bed text-green-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-green-700">{notification.roomType}</span>
    </div>
    <div className="inline-flex items-center gap-1.5 mt-1 ml-1 px-2 py-0.5 bg-blue-50 rounded-full">
      <i className="fas fa-calendar-check text-blue-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-blue-700">Check-in: {notification.eventDate}</span>
    </div>
  </>
) : notification.type === 'check_out' ? (
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Guest Check-Out
    </p>
    <p className="text-xs text-gray-600 mb-1">
      <span className="font-semibold">{notification.guestName}</span>  is scheduled to check out
    </p>
    <p className="text-xs text-gray-600 mb-1"> <span className="font-semibold">Booking ID: </span> {notification.bookingId} </p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-purple-50 rounded-full">
      <i className="fas fa-bed text-purple-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-purple-700">{notification.roomType}</span>
    </div>
    <div className="inline-flex items-center gap-1.5 mt-1 ml-1 px-2 py-0.5 bg-orange-50 rounded-full">
      <i className="fas fa-calendar-day text-orange-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-orange-700">Check-out: {notification.eventDate}</span>
    </div>
  </>
) : (
  // Default cancellation case - now shows detailed room types
  <>
    <p className="text-sm font-bold text-gray-800 mb-1">
      Guest Cancellation
    </p>
    <p className="text-xs text-gray-600 mb-1">
      <span className="font-semibold">{notification.guestName}</span> cancelled reservation <span className="font-mono">{notification.bookingId}</span>
    </p>
    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-red-50 rounded-full">
      <i className="fas fa-door-open text-red-500 text-[10px]"></i>
      <span className="text-[11px] font-medium text-red-700">
        {notification.roomTypesDetail || notification.roomType || 'Day Tour'}
      </span>
    </div>
  </>
)}
                              {/* Timestamp */}
                              <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                                <i className="fas fa-clock text-[8px]"></i>
                                {asDate(notification.createdAt).toLocaleString()}
                              </p>
                            </div>
                            
                            {/* Unread indicator */}
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-[#4D8CF5] flex-shrink-0 mt-2"></div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                {/* Footer - Close button removed as requested */}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </nav>
  );
}