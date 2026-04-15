// app/dashboard/admin/reservations/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';  
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { logAdminAction } from '../../../../lib/auditLogger';
import { sendConfirmationEmail, sendCancellationEmail } from '../../../../lib/emailService';

export default function AdminReservations() {
  const [activeTab, setActiveTab] = useState('rooms');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bookings, setBookings] = useState([]);
  const [groupedBookings, setGroupedBookings] = useState([]);
  const [dayTours, setDayTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [actionLoading, setActionLoading] = useState({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [refundModal, setRefundModal] = useState({ show: false, booking: null, sending: false });
  const [showReasonModal, setShowReasonModal] = useState({ show: false, booking: null, reason: '' });
  const [moveDateModal, setMoveDateModal] = useState({ show: false, booking: null, sending: false });
      const tabsContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const buttonRefs = useRef({});
  
  // New state for confirmation modals
  const [confirmModal, setConfirmModal] = useState({ show: false, booking: null, type: '', note: '' });
  const [cancelModal, setCancelModal] = useState({ show: false, booking: null, reason: '' });
  
  // New state for refund confirmation modal
  const [refundConfirmModal, setRefundConfirmModal] = useState({ show: false, booking: null });
  
  // New state for move date confirmation modal
  const [moveDateConfirmModal, setMoveDateConfirmModal] = useState({ show: false, booking: null });
  
  // New state for image zoom modal
  const [imageZoomModal, setImageZoomModal] = useState({ show: false, imageUrl: '', title: '' });
  
  // Track which bookings have had notifications sent (persistent - will survive page refresh)
  const [notificationSent, setNotificationSent] = useState({});

  // Fixed check-in and check-out times
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

      const updateSlider = useCallback(() => {
    const activeButton = buttonRefs.current[activeTab];
    const container = tabsContainerRef.current;
    const slider = sliderRef.current;
    if (activeButton && container && slider) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;
      slider.style.transform = `translateX(${left}px)`;
      slider.style.width = `${width}px`;
    }
  }, [activeTab]);

  useEffect(() => {
    updateSlider();
    const resizeObserver = new ResizeObserver(() => updateSlider());
    if (tabsContainerRef.current) {
      resizeObserver.observe(tabsContainerRef.current);
    }
    window.addEventListener('resize', updateSlider);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSlider);
    };
  }, [updateSlider]);

  // Load persisted notification sent status from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('admin_notification_sent');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotificationSent(parsed);
      } catch (e) {
        console.error('Error loading notification sent status:', e);
      }
    }
  }, []);

  // Save notification sent status to localStorage whenever it changes
  useEffect(() => {
    if (Object.keys(notificationSent).length > 0) {
      localStorage.setItem('admin_notification_sent', JSON.stringify(notificationSent));
    }
  }, [notificationSent]);

  const roomStatuses = ['all', 'pending', 'confirmed', 'check-in', 'check-out', 'completed', 'cancelled', 'cancelled-by-guest'];
  const dayTourStatuses = ['all', 'pending', 'confirmed', 'check-in', 'completed', 'cancelled', 'cancelled-by-guest'];
  const statusOrder = {
    pending: 1,
    confirmed: 2,
    'check-in': 3,
    // Keep check-out grouped with check-in for "All" sorting order requested by UI.
    'check-out': 3,
    completed: 4,
    cancelled: 5,
    'cancelled-by-guest': 6
  };

  useEffect(() => {
    const allowed = activeTab === 'rooms' ? roomStatuses : dayTourStatuses;
    if (!allowed.includes(statusFilter)) {
      setStatusFilter('all');
    }
  }, [activeTab, statusFilter]);

  // Function to format date with fixed check-in/check-out times
  const formatDateWithTime = (date, type) => {
    if (!date) return 'N/A';
    try {
      let dateObj;
      if (date && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      } else {
        dateObj = new Date(date);
      }
      
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
      }
      
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      // Return date with the appropriate fixed time
      if (type === 'check-in') {
        return `${formattedDate} at ${FIXED_CHECK_IN_DISPLAY}`;
      } else if (type === 'check-out') {
        return `${formattedDate} at ${FIXED_CHECK_OUT_DISPLAY}`;
      }
      
      return formattedDate;
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  // Function to group multi-room bookings by parentBookingId
  const groupMultiRoomBookings = (bookingsList) => {
    const singleBookings = [];
    const multiRoomGroups = new Map();

    for (const booking of bookingsList) {
      if (booking.isMultiRoomBooking && booking.parentBookingId) {
        // This is a multi-room booking child
        if (!multiRoomGroups.has(booking.parentBookingId)) {
          multiRoomGroups.set(booking.parentBookingId, {
            parentBookingId: booking.parentBookingId,
            bookings: [],
            guestInfo: booking.guestInfo,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            status: booking.status,
            paymentMethod: booking.paymentMethod,
            paymentProofUrl: booking.paymentProofUrl,
            validIdType: booking.validIdType,
            validIdUrl: booking.validIdUrl,
            specialRequest: booking.specialRequest,
            createdAt: booking.createdAt,
            type: 'room',
            isMultiRoomGroup: true,
            roomTypes: []
          });
        }
        multiRoomGroups.get(booking.parentBookingId).bookings.push(booking);
      } else if (!booking.isMultiRoomBooking) {
        // Single room booking
        singleBookings.push(booking);
      }
    }

    // Process multi-room groups to create consolidated display
    const consolidatedGroups = [];
    for (const [parentId, group] of multiRoomGroups) {
      // Get unique room types and aggregate quantities
      const roomTypeMap = new Map();
      let totalRooms = 0;
      let totalPrice = 0;
      let downPayment = 0;
      let remainingBalance = 0;
      let totalGuests = 0;
      
      for (const booking of group.bookings) {
        totalRooms++;
        totalPrice += booking.totalPrice || 0;
        downPayment += booking.downPayment || 0;
        remainingBalance += booking.remainingBalance || 0;
        totalGuests += booking.guests || 1;
        
        if (!roomTypeMap.has(booking.roomType)) {
          roomTypeMap.set(booking.roomType, {
            count: 1,
            price: booking.price,
            guests: booking.guests || 1
          });
        } else {
          const existing = roomTypeMap.get(booking.roomType);
          existing.count++;
        }
      }
      
      // Store detailed room types array for better display
      const roomTypesArray = Array.from(roomTypeMap.entries()).map(([type, data]) => ({
        type: type,
        quantity: data.count,
        guestsPerRoom: data.guests
      }));
      
      // Build room types display string
      const roomTypesDisplay = roomTypesArray
        .map(item => `${item.quantity} × ${item.type} (${item.guestsPerRoom} guest${item.guestsPerRoom !== 1 ? 's' : ''})`)
        .join(', ');
      
      consolidatedGroups.push({
        id: parentId,
        bookingId: parentId,
        guestInfo: group.guestInfo,
        checkIn: group.checkIn,
        checkOut: group.checkOut,
        status: group.status,
        paymentMethod: group.paymentMethod,
        paymentProofUrl: group.paymentProofUrl,
        validIdType: group.validIdType,
        validIdUrl: group.validIdUrl,
        specialRequest: group.specialRequest,
        createdAt: group.createdAt,
        type: 'room',
        isMultiRoomGroup: true,
        roomTypesDisplay,
        roomTypesArray,
        totalRooms,
        totalPrice,
        downPayment,
        remainingBalance,
        totalGuests,
        childBookings: group.bookings
      });
    }

    return [...singleBookings, ...consolidatedGroups];
  };

  // Real-time listener for room bookings
  useEffect(() => {
    const bookingsRef = collection(db, 'bookings');
    const q = query(bookingsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const bookingsList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.type === 'room') {
          bookingsList.push({
            id: doc.id,
            ...data
          });
        }
      });
      setBookings(bookingsList);
      // Group multi-room bookings
      const grouped = groupMultiRoomBookings(bookingsList);
      setGroupedBookings(grouped);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching bookings:', error);
      setNotification({ show: true, message: 'Failed to load reservations.', type: 'error' });
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Automatic room booking status transitions:
  // confirmed -> check-in at check-in time
  // check-in/confirmed -> check-out from 1 hour before check-out until check-out time
  // check-out/check-in/confirmed -> completed after check-out time
  useEffect(() => {
    if (!groupedBookings.length) return;
    let isProcessing = false;
    const tick = async () => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        const now = new Date();
        for (const booking of groupedBookings) {
          if (!booking?.id || !booking?.status) continue;
          if (['pending', 'cancelled', 'cancelled-by-guest', 'completed'].includes(booking.status)) continue;
          
          let checkInRaw, checkOutRaw;
          
          if (booking.isMultiRoomGroup && booking.childBookings) {
            // Use first child booking for dates
            const firstChild = booking.childBookings[0];
            checkInRaw = firstChild.checkIn?.toDate ? firstChild.checkIn.toDate() : new Date(firstChild.checkIn);
            checkOutRaw = firstChild.checkOut?.toDate ? firstChild.checkOut.toDate() : new Date(firstChild.checkOut);
          } else {
            checkInRaw = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
            checkOutRaw = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          }
          
          if (isNaN(checkInRaw?.getTime?.()) || isNaN(checkOutRaw?.getTime?.())) continue;
          
          // Create check-in time at 2:00 PM on check-in day
          const checkInTime = new Date(checkInRaw);
          checkInTime.setHours(14, 0, 0, 0);
          
          // Create check-out time at 12:00 PM on check-out day
          const checkOutTime = new Date(checkOutRaw);
          checkOutTime.setHours(12, 0, 0, 0);
          
          const oneHourBeforeCheckOut = new Date(checkOutTime.getTime() - 60 * 60 * 1000);
          let targetStatus = null;
          
          if (now > checkOutTime) {
            targetStatus = 'completed';
          } else if (now >= oneHourBeforeCheckOut && now <= checkOutTime) {
            targetStatus = 'check-out';
          } else if (now >= checkInTime) {
            targetStatus = 'check-in';
          }
          
          if (targetStatus && booking.status !== targetStatus) {
            if (booking.isMultiRoomGroup && booking.childBookings) {
              // Update all child bookings
              for (const childBooking of booking.childBookings) {
                await updateDoc(doc(db, 'bookings', childBooking.id), {
                  status: targetStatus,
                  updatedAt: new Date().toISOString()
                });
              }
            } else {
              await updateDoc(doc(db, 'bookings', booking.id), {
                status: targetStatus,
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
        console.error('Error auto-updating room reservation statuses:', error);
      } finally {
        isProcessing = false;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [groupedBookings]);

  // Automatic day-tour status transitions:
  // confirmed -> check-in when selected day starts
  // check-in/confirmed -> completed after selected day ends
  useEffect(() => {
    if (!dayTours.length) return;
    let isProcessing = false;
    const tick = async () => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        const now = new Date();
        for (const tour of dayTours) {
          if (!tour?.id || !tour?.status) continue;
          if (['pending', 'cancelled', 'cancelled-by-guest', 'completed'].includes(tour.status)) continue;
          if (!tour.selectedDate) continue;
          const dateKey = String(tour.selectedDate);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
          const [y, m, d] = dateKey.split('-').map(Number);
          const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
          const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
          let targetStatus = null;
          if (now > dayEnd) {
            targetStatus = 'completed';
          } else if (now >= dayStart) {
            targetStatus = 'check-in';
          }
          if (targetStatus && tour.status !== targetStatus) {
            await updateDoc(doc(db, 'dayTourBookings', tour.id), {
              status: targetStatus,
              updatedAt: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error('Error auto-updating day tour reservation statuses:', error);
      } finally {
        isProcessing = false;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dayTours]);

  // Real-time listener for day tour bookings
  useEffect(() => {
    const dayTourBookingsRef = collection(db, 'dayTourBookings');
    const q = query(dayTourBookingsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const dayToursList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        dayToursList.push({
          id: doc.id,
          ...data
        });
      });
      setDayTours(dayToursList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
      setNotification({ show: true, message: 'Failed to load day tour reservations.', type: 'error' });
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Auto-hide notification
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: '', type: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'confirmed':
        return 'bg-green-100 text-green-700';
      case 'check-in':
        return 'bg-blue-100 text-blue-700';
      case 'check-out':
        return 'bg-purple-100 text-purple-700';
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'cancelled-by-guest':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const handleRefundNotify = async (booking) => {
    setRefundConfirmModal(prev => ({ ...prev, sending: true }));
    try {
      const isRoomBooking = booking?.type === 'room';
      
      if (booking.isMultiRoomGroup && booking.childBookings) {
        // Update all child bookings
        for (const childBooking of booking.childBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            refundProcessed: true,
            refundProcessedAt: new Date().toISOString(),
            balance: 0,
            refundNotificationSent: true,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const collectionName = isRoomBooking ? 'bookings' : 'dayTourBookings';
        const bookingRef = doc(db, collectionName, booking.id);
        await updateDoc(bookingRef, {
          refundProcessed: true,
          refundProcessedAt: new Date().toISOString(),
          balance: 0,
          refundNotificationSent: true,
          updatedAt: new Date().toISOString()
        });
      }
      
      setNotificationSent(prev => ({ ...prev, [booking.id]: { refund: true, moveDate: prev[booking.id]?.moveDate || false } }));
      
      const response = await fetch('/api/admin/send-refund-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, type: 'room' })
      });
      const data = await response.json();

      if (response.ok) {
        const total = typeof booking.totalPrice === 'number' ? booking.totalPrice : Number(booking.totalPrice) || 0;
        const downPayment = total * 0.5;
        const refundAmount = downPayment * 0.5;
        
        await logAdminAction({
          action: 'Refund Notification Sent',
          module: 'Room Reservations',
          details: `Sent refund notification for ${booking.isMultiRoomGroup ? 'multi-room' : 'room'} booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}). Refund amount: ₱${refundAmount.toLocaleString()} (50% of down payment). Balance updated to 0.`
        });
        
        showNotification(`Refund notification sent and balance updated to 0.`, 'success');
      } else {
        showNotification(data.error || 'Failed to send refund notification', 'error');
      }
    } catch (error) {
      console.error('Error sending refund notification:', error);
      showNotification('Failed to send refund notification', 'error');
    } finally {
      setRefundConfirmModal({ show: false, booking: null, sending: false });
      setShowReasonModal({ show: false, booking: null, reason: '', sending: false });
    }
  };

  const handleMoveDateNotify = async (booking) => {
    setMoveDateConfirmModal(prev => ({ ...prev, sending: true }));
    try {
      const isRoomBooking = booking?.type === 'room';
      
      if (booking.isMultiRoomGroup && booking.childBookings) {
        // Update all child bookings
        for (const childBooking of booking.childBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            moveDateNotificationSent: true,
            moveDateNotificationSentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const collectionName = isRoomBooking ? 'bookings' : 'dayTourBookings';
        const bookingRef = doc(db, collectionName, booking.id);
        await updateDoc(bookingRef, {
          moveDateNotificationSent: true,
          moveDateNotificationSentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      setNotificationSent(prev => ({ ...prev, [booking.id]: { refund: prev[booking.id]?.refund || false, moveDate: true } }));
      
      const response = await fetch('/api/admin/send-move-date-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, type: 'room' })
      });
      const data = await response.json();

      if (response.ok) {
        await logAdminAction({
          action: 'Move Date Notification Sent',
          module: 'Reservations',
          details: `Sent move date notification for ${booking.isMultiRoomGroup ? 'multi-room' : 'room'} booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}).`
        });
        
        showNotification(`Move date notification sent to ${booking.guestInfo?.email}`, 'success');
      } else {
        showNotification(data.error || 'Failed to send move date notification', 'error');
      }
    } catch (error) {
      console.error('Error sending move date notification:', error);
      showNotification('Failed to send move date notification', 'error');
    } finally {
      setMoveDateConfirmModal({ show: false, booking: null, sending: false });
      setShowReasonModal({ show: false, booking: null, reason: '', sending: false });
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      let dateObj;
      if (timestamp && typeof timestamp.toDate === 'function') {
        dateObj = timestamp.toDate();
      } else if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
        dateObj = new Date(timestamp.seconds * 1000);
      } else {
        dateObj = new Date(timestamp);
      }
      
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
      }
      
      return dateObj.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid Date';
    }
  };

  const formatDateTimeFromDate = (date) => {
    if (!date) return 'N/A';
    try {
      let dateObj;
      if (date && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      } else {
        dateObj = new Date(date);
      }
      
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Date';
      }
      
      return dateObj.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  const formatDateOnly = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Handle if dateString is already a YYYY-MM-DD string
      if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-');
        const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC'
        });
      }
      
      if (dateString && typeof dateString.toDate === 'function') {
        const date = dateString.toDate();
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      
      if (dateString && typeof dateString === 'object' && dateString.seconds) {
        const date = new Date(dateString.seconds * 1000);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

 // Confirm reservation for day tour
const handleConfirmDayTourReservation = async () => {
  const booking = confirmModal.booking;
  if (!booking) return;
  
  if (booking.status !== 'pending') {
    showNotification('This reservation is no longer pending.', 'error');
    setConfirmModal({ show: false, booking: null, type: '', note: '' });
    return;
  }
  
  setActionLoading(prev => ({ ...prev, [booking.id]: true }));
  try {
    const bookingRef = doc(db, 'dayTourBookings', booking.id);
    await updateDoc(bookingRef, {
      status: 'confirmed',
      adminNote: confirmModal.note || null,  // Save admin note
      updatedAt: new Date().toISOString()
    });

    const { sendDayTourConfirmationEmail } = await import('../../../../lib/emailService');
    const emailResult = await sendDayTourConfirmationEmail(booking, confirmModal.note);
    if (emailResult.success) {
      console.log('Day tour confirmation email sent successfully');
    } else {
      console.warn('Failed to send day tour confirmation email:', emailResult.error);
    }

    await logAdminAction({
      action: 'Confirmed Day Tour Reservation',
      module: 'Day Tour Reservations',
      details: `Confirmed day tour booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Note: ${confirmModal.note || 'No note provided'}`
    });

    showNotification(`Day tour booking ${booking.bookingId} has been confirmed. A confirmation email has been sent to the guest.`, 'success');
    setShowPaymentModal(false);
    setConfirmModal({ show: false, booking: null, type: '', note: '' });
  } catch (error) {
    console.error('Error confirming day tour reservation:', error);
    showNotification('Failed to confirm reservation.', 'error');
  } finally {
    setActionLoading(prev => ({ ...prev, [booking.id]: false }));
  }
};

  // Cancel reservation for day tour
  const handleCancelDayTourReservation = async () => {
    const booking = cancelModal.booking;
    const reason = cancelModal.reason;
    
    if (!booking) return;
    
    if (!reason.trim()) {
      showNotification('Please provide a cancellation reason.', 'error');
      return;
    }
    
    if (booking.status !== 'pending') {
      showNotification('This reservation is no longer pending.', 'error');
      setCancelModal({ show: false, booking: null, reason: '' });
      return;
    }
    
    setActionLoading(prev => ({ ...prev, [booking.id]: true }));
    try {
      const bookingRef = doc(db, 'dayTourBookings', booking.id);
      await updateDoc(bookingRef, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: reason,
        cancelledBy: 'admin',
        updatedAt: new Date().toISOString()
      });

      const { sendDayTourCancellationEmail } = await import('../../../../lib/emailService');
      const emailResult = await sendDayTourCancellationEmail(booking, reason, 'admin');
      if (emailResult.success) {
        console.log('Day tour cancellation email sent successfully');
      } else {
        console.warn('Failed to send day tour cancellation email:', emailResult.error);
      }

      await logAdminAction({
        action: 'Cancelled Day Tour Reservation',
        module: 'Day Tour Reservations',
        details: `Cancelled day tour booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Reason: ${reason}`
      });

      showNotification(`Day tour booking ${booking.bookingId} has been cancelled. A cancellation email has been sent to the guest.`, 'success');
      setShowPaymentModal(false);
      setCancelModal({ show: false, booking: null, reason: '' });
    } catch (error) {
      console.error('Error cancelling day tour reservation:', error);
      showNotification('Failed to cancel reservation.', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [booking.id]: false }));
    }
  };

  // Confirm room reservation
// Confirm room reservation
const handleConfirmReservation = async () => {
  const booking = confirmModal.booking;
  if (!booking) return;
  
  if (booking.status !== 'pending') {
    showNotification('This reservation is no longer pending.', 'error');
    setConfirmModal({ show: false, booking: null, type: '', note: '' });
    return;
  }
  
  setActionLoading(prev => ({ ...prev, [booking.id]: true }));
  try {
    if (booking.isMultiRoomGroup && booking.childBookings) {
      // Update all child bookings
      for (const childBooking of booking.childBookings) {
        const bookingRef = doc(db, 'bookings', childBooking.id);
        await updateDoc(bookingRef, {
          status: 'confirmed',
          adminNote: confirmModal.note || null,  // Save admin note
          updatedAt: new Date().toISOString()
        });
      }
    } else {
      const bookingRef = doc(db, 'bookings', booking.id);
      await updateDoc(bookingRef, {
        status: 'confirmed',
        adminNote: confirmModal.note || null,  // Save admin note
        updatedAt: new Date().toISOString()
      });
    }

    const emailResult = await sendConfirmationEmail(booking, confirmModal.note);
    if (emailResult.success) {
      console.log('Confirmation email sent successfully');
    } else {
      console.warn('Failed to send confirmation email:', emailResult.error);
    }

    await logAdminAction({
      action: 'Confirmed Reservation',
      module: 'Reservations',
      details: `Confirmed ${booking.isMultiRoomGroup ? 'multi-room' : ''} booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Note: ${confirmModal.note || 'No note provided'}`
    });

    showNotification(`Booking ${booking.bookingId} has been confirmed. A confirmation email has been sent to the guest.`, 'success');
    setShowPaymentModal(false);
    setConfirmModal({ show: false, booking: null, type: '', note: '' });
  } catch (error) {
    console.error('Error confirming reservation:', error);
    showNotification('Failed to confirm reservation.', 'error');
  } finally {
    setActionLoading(prev => ({ ...prev, [booking.id]: false }));
  }
};

  // Cancel room reservation
  const handleCancelReservation = async () => {
    const booking = cancelModal.booking;
    const reason = cancelModal.reason;
    
    if (!booking) return;
    
    if (!reason.trim()) {
      showNotification('Please provide a cancellation reason.', 'error');
      return;
    }
    
    if (booking.status !== 'pending') {
      showNotification('This reservation is no longer pending.', 'error');
      setCancelModal({ show: false, booking: null, reason: '' });
      return;
    }
    
    setActionLoading(prev => ({ ...prev, [booking.id]: true }));
    try {
      if (booking.isMultiRoomGroup && booking.childBookings) {
        // Update all child bookings
        for (const childBooking of booking.childBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancellationReason: reason,
            cancelledBy: 'admin',
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const bookingRef = doc(db, 'bookings', booking.id);
        await updateDoc(bookingRef, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancellationReason: reason,
          cancelledBy: 'admin',
          updatedAt: new Date().toISOString()
        });
      }

      const emailResult = await sendCancellationEmail(booking, reason, 'admin');
      if (emailResult.success) {
        console.log('Cancellation email sent successfully');
      } else {
        console.warn('Failed to send cancellation email:', emailResult.error);
      }

      await logAdminAction({
        action: 'Cancelled Reservation',
        module: 'Reservations',
        details: `Cancelled ${booking.isMultiRoomGroup ? 'multi-room' : ''} booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Reason: ${reason}`
      });

      showNotification(`Booking ${booking.bookingId} has been cancelled. A cancellation email has been sent to the guest.`, 'success');
      setShowPaymentModal(false);
      setCancelModal({ show: false, booking: null, reason: '' });
    } catch (error) {
      console.error('Error cancelling reservation:', error);
      showNotification('Failed to cancel reservation.', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [booking.id]: false }));
    }
  };

  const handleSendRefundNotification = async () => {
    const booking = refundModal.booking;
    if (!booking) return;

    setRefundModal(prev => ({ ...prev, sending: true }));
    try {
      const response = await fetch('/api/admin/send-refund-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, type: 'daytour' })
      });
      const data = await response.json();

      if (response.ok) {
        const total = typeof booking.totalPrice === 'number' ? booking.totalPrice : Number(booking.totalPrice) || 0;
        const downPayment = total * 0.5;
        const refundAmount = downPayment * 0.5;
        
        await logAdminAction({
          action: 'Refund Notification Sent',
          module: 'Day Tour Reservations',
          details: `Sent refund notification for day tour booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}). Refund amount: ₱${refundAmount.toLocaleString()} (50% of down payment)`
        });
        
        showNotification(`Refund notification sent to ${booking.guestInfo?.email}`, 'success');
      } else {
        showNotification(data.error || 'Failed to send refund notification', 'error');
      }
    } catch (error) {
      console.error('Error sending refund notification:', error);
      showNotification('Failed to send refund notification', 'error');
    } finally {
      setRefundModal({ show: false, booking: null, sending: false });
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

  const calculateDownPayment = (totalPrice) => {
    if (!totalPrice) return 0;
    const total = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
    return total * 0.5;
  };

  // Updated balance calculation logic
  const calculateBalance = (booking) => {
    const total = typeof booking.totalPrice === 'number' ? booking.totalPrice : Number(booking.totalPrice) || 0;
    const downPayment = total * 0.5;
    const status = booking.status;

    // For cancelled, check-out, or completed - balance is 0
    if (['cancelled', 'check-out', 'completed'].includes(status)) {
      return '₱0';
    }

    // For cancelled-by-guest - balance is 0 only after refund or move date notification
    if (status === 'cancelled-by-guest') {
      if (booking.refundNotificationSent || booking.moveDateNotificationSent) {
        return '₱0';
      }
      return `₱${downPayment.toLocaleString()}`;
    }

    // For pending, confirmed, check-in - balance equals half of total (down payment amount)
    if (['pending', 'confirmed', 'check-in'].includes(status)) {
      return `₱${downPayment.toLocaleString()}`;
    }

    return 'Not Confirmed';
  };

  const isNotificationDisabled = (booking) => {
    return notificationSent[booking.id]?.refund === true || notificationSent[booking.id]?.moveDate === true;
  };

  const getTotalGuests = (booking) => {
    if (booking.isMultiRoomGroup) {
      return booking.totalGuests || 0;
    }
    return (booking.seniors || 0) + (booking.adults || 0) + (booking.kids || 0);
  };

  const getRoomGuests = (booking) => {
    if (booking.isMultiRoomGroup) {
      return booking.totalGuests || 0;
    }
    return booking.guests || 1;
  };

  const filteredBookings = groupedBookings.filter(booking => {
    const matchesSearch = 
      (booking.roomType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       booking.roomTypesDisplay?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       booking.guestInfo?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       booking.guestInfo?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       booking.bookingId?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (statusFilter === 'all') {
      const pa = statusOrder[a.status] || 999;
      const pb = statusOrder[b.status] || 999;
      if (pa !== pb) return pa - pb;
    }
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const dbt = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return dbt - da;
  });

  const dayTourStatusOrder = {
    pending: 1,
    confirmed: 2,
    'check-in': 3,
    completed: 4,
    cancelled: 5,
    'cancelled-by-guest': 6
  };

  const filteredDayTours = dayTours.filter(tour => {
    const matchesSearch = 
      tour.guestInfo?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tour.guestInfo?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tour.bookingId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || tour.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (statusFilter === 'all') {
      const pa = dayTourStatusOrder[a.status] || 999;
      const pb = dayTourStatusOrder[b.status] || 999;
      if (pa !== pb) return pa - pb;
    }
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const dbt = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return dbt - da;
  });

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-textPrimary font-playfair mb-1">
          Reservations Management
        </h1>
        <p className="text-textSecondary">
          Manage all room and day tour reservations
        </p>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
          notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
        }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle text-red-500' : 'fas fa-check-circle text-green-500'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Tabs */}
<div className="relative flex items-center mb-6 border-b border-ocean-light/20">
  <div className="relative flex w-full">

    {/* Sliding background (fixed 50%) */}
    <div
      className="absolute top-1 bottom-1 w-1/2 rounded-md bg-ocean-pales/20 transition-all duration-300 ease-in-out shadow-md"
      style={{
        transform: `
          translateX(${activeTab === 'rooms' ? '0%' : '100%'})
          scale(0.98)
        `
      }}
    />

    {/* Left Tab - Rooms */}
    <div className="flex-1 flex justify-center">
      <button
        onClick={() => setActiveTab('rooms')}
        className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center ${
          activeTab === 'rooms'
            ? 'text-ocean-mid'
            : 'text-textSecondary hover:text-ocean-mid'
        }`}
      >
        <i className="fas fa-bed mr-2"></i>
        Rooms
      </button>
    </div>

    {/* Right Tab - Day Tour */}
    <div className="flex-1 flex justify-center">
      <button
        onClick={() => setActiveTab('daytour')}
        className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center ${
          activeTab === 'daytour'
            ? 'text-ocean-mid'
            : 'text-textSecondary hover:text-ocean-mid'
        }`}
      >
        <i className="fas fa-sun mr-2"></i>
        Day Tour
      </button>
    </div>

  </div>
</div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-neutral text-sm"></i>
          <input
            type="text"
            placeholder={`Search by ${activeTab === 'rooms' ? 'room type, guest name, or booking ID' : 'guest name or booking ID'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300 bg-white"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(activeTab === 'rooms' ? roomStatuses : dayTourStatuses).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              statusFilter === status
                ? 'bg-ocean-mid text-white'
                : 'bg-white border border-ocean-light/20 text-textSecondary hover:bg-ocean-ice'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Rooms Reservations Table - Optimized Layout */}
      {activeTab === 'rooms' && (
        <>
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Guest Name</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Room Type(s)</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Rooms</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Check-in</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Check-out</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary min-w-[80px]">Status</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Actions</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-12 text-center text-neutral">
                          <i className="fas fa-calendar-alt text-5xl mb-3 opacity-50 block"></i>
                          <p className="text-lg">No reservations found</p>
                          <p className="text-sm">Reservations will appear here once guests book</p>
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((booking) => (
                        <tr key={booking.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs">{booking.bookingId}</span>
                            {booking.isMultiRoomGroup && (
                              <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full">Multi</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-textPrimary text-xs">
                              {booking.guestInfo?.firstName} {booking.guestInfo?.lastName}
                            </div>
                            <div className="text-[10px] text-neutral">{booking.guestInfo?.email}</div>
                          </td>
                          <td className="px-3 py-2">
                            {booking.isMultiRoomGroup ? (
                              <div className="text-xs text-textPrimary max-w-[200px] truncate" title={booking.roomTypesDisplay}>
                                {booking.roomTypesDisplay}
                              </div>
                            ) : (
                              <div className="text-xs text-textPrimary">{booking.roomType}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {booking.isMultiRoomGroup ? booking.totalRooms : (booking.numberOfRooms || 1)}
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {formatDateWithTime(booking.checkIn, 'check-in')}
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {formatDateWithTime(booking.checkOut, 'check-out')}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(booking.status)}`}>
                              {booking.status?.charAt(0).toUpperCase() + booking.status?.slice(1)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {(booking.paymentProofUrl || booking.status === 'pending') && (
                                <button
                                  onClick={() => {
                                    setSelectedBooking(booking);
                                    setShowPaymentModal(true);
                                  }}
                                  className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-200"
                                  title="View Payment Proof"
                                >
                                  <i className="fas fa-eye text-sm"></i>
                                </button>
                              )}
                              {booking.status === 'cancelled-by-guest' && (
                                <button
                                  onClick={() => setShowReasonModal({ 
                                    show: true, 
                                    booking: booking, 
                                    reason: booking.cancellationReason || 'No reason provided',
                                    sending: false 
                                  })}
                                  className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-all duration-200"
                                  title="View Cancellation Reason"
                                >
                                  <i className="fas fa-comment-dots text-sm"></i>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {formatDateTime(booking.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Day Tour Reservations Table - Optimized Layout */}
      {activeTab === 'daytour' && (
        <>
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px]">
                  <thead>
                    <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Guest Name</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Date</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Senior</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Adult</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Kid</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary min-w-[80px]">Status</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Actions</th>
                      <th className="px-3 py-2 text-left text-sm font-semibold text-textPrimary">Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDayTours.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-12 text-center text-neutral">
                          <i className="fas fa-sun text-5xl mb-3 opacity-50 block"></i>
                          <p className="text-lg">No day tour reservations found</p>
                          <p className="text-sm">Day tour reservations will appear here once guests book</p>
                        </td>
                      </tr>
                    ) : (
                      filteredDayTours.map((tour) => (
                        <tr key={tour.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs">{tour.bookingId}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-textPrimary text-xs">
                              {tour.guestInfo?.firstName} {tour.guestInfo?.lastName}
                            </div>
                            <div className="text-[10px] text-neutral">{tour.guestInfo?.email}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {formatDateOnly(tour.selectedDate)}
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary text-center">
                            {tour.seniors || 0}
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary text-center">
                            {tour.adults || 0}
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary text-center">
                            {tour.kids || 0}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(tour.status)}`}>
                              {tour.status?.charAt(0).toUpperCase() + tour.status?.slice(1)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {(tour.paymentProofUrl || tour.status === 'pending') && (
                                <button
                                  onClick={() => {
                                    setSelectedBooking(tour);
                                    setShowPaymentModal(true);
                                  }}
                                  className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-200"
                                  title="View Payment Proof"
                                >
                                  <i className="fas fa-eye text-sm"></i>
                                </button>
                              )}
                              {tour.status === 'cancelled-by-guest' && (
                                <button
                                  onClick={() => setShowReasonModal({ 
                                    show: true, 
                                    booking: tour, 
                                    reason: tour.cancellationReason || 'No reason provided',
                                    sending: false 
                                  })}
                                  className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-all duration-200"
                                  title="View Cancellation Reason"
                                >
                                  <i className="fas fa-comment-dots text-sm"></i>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {formatDateTime(tour.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Image Zoom Modal */}
      {imageZoomModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setImageZoomModal({ show: false, imageUrl: '', title: '' })}>
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setImageZoomModal({ show: false, imageUrl: '', title: '' })}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors duration-200"
            >
              <i className="fas fa-times text-2xl"></i>
            </button>
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-2">
                <h3 className="text-sm font-semibold text-white">{imageZoomModal.title}</h3>
              </div>
              <img
                src={imageZoomModal.imageUrl}
                alt={imageZoomModal.title}
                className="w-full h-auto max-h-[80vh] object-contain bg-gray-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* View Modal - Compact Size with Improved Multi-Room Layout */}
      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md max-h-[85vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3 rounded-t-xl flex justify-between items-center">
              <h2 className="text-base font-bold text-white">
                Booking Details - {selectedBooking.bookingId}
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Guest Information */}
              <div className="bg-ocean-ice rounded-lg p-3">
                <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Guest Information</h3>
                <p className="text-sm font-medium text-textPrimary">
                  {selectedBooking.guestInfo?.firstName} {selectedBooking.guestInfo?.lastName}
                </p>
                <p className="text-xs text-textSecondary">{selectedBooking.guestInfo?.email}</p>
                <p className="text-xs text-textSecondary">{selectedBooking.guestInfo?.phone}</p>
              </div>

              {/* Room/Tour Details */}
              {activeTab === 'rooms' ? (
                <>
                  <div className="bg-ocean-ice rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Room Details</h3>
                    
                    {/* Multi-Room Detailed Display */}
                    {selectedBooking.isMultiRoomGroup && selectedBooking.roomTypesArray && selectedBooking.roomTypesArray.length > 0 ? (
                      <div className="space-y-2">
                        <div className="border-b border-ocean-light/20 pb-1 mb-1">
                          <span className="text-xs font-semibold text-ocean-mid">Room Type Breakdown:</span>
                        </div>
                        {selectedBooking.roomTypesArray.map((room, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-textSecondary">{room.quantity} × {room.type}</span>
                            <span className="font-medium text-textPrimary">{room.guestsPerRoom} guest{room.guestsPerRoom !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-ocean-light/20 mt-2">
                          <span className="font-semibold text-textPrimary">Total Guests:</span>
                          <span className="font-bold text-ocean-mid">{selectedBooking.totalGuests}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">
                          <span className="text-textSecondary">Room Type:</span>{' '}
                          <span className="font-medium text-textPrimary">{selectedBooking.roomType}</span>
                        </p>
                        <p className="text-sm mt-1">
                          <span className="text-textSecondary">Number of Rooms:</span>{' '}
                          <span className="font-medium text-textPrimary">{selectedBooking.numberOfRooms || 1}</span>
                        </p>
                        <p className="text-sm mt-1">
                          <span className="text-textSecondary">Number of Guests:</span>{' '}
                          <span className="font-medium text-textPrimary">{selectedBooking.guests || 1}</span>
                        </p>
                      </>
                    )}
                  </div>

                  <div className="bg-ocean-ice rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Schedule</h3>
                    <p className="text-sm">
                      <span className="text-textSecondary">Check-in:</span>{' '}
                      <span className="font-medium text-textPrimary">{formatDateWithTime(selectedBooking.checkIn, 'check-in')}</span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-textSecondary">Check-out:</span>{' '}
                      <span className="font-medium text-textPrimary">{formatDateWithTime(selectedBooking.checkOut, 'check-out')}</span>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-ocean-ice rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Tour Details</h3>
                    <p className="text-sm">
                      <span className="text-textSecondary">Tour Date:</span>{' '}
                      <span className="font-medium text-textPrimary">{formatDateOnly(selectedBooking.selectedDate)}</span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-textSecondary">Guest Breakdown:</span>{' '}
                      <span className="font-medium text-textPrimary">
                        Senior: {selectedBooking.seniors || 0} | Adult: {selectedBooking.adults || 0} | Kid: {selectedBooking.kids || 0}
                      </span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-textSecondary">Total Guests:</span>{' '}
                      <span className="font-medium text-textPrimary">{getTotalGuests(selectedBooking)}</span>
                    </p>
                  </div>
                </>
              )}

              {/* Payment Information */}
              <div className="bg-ocean-ice rounded-lg p-3">
                <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Payment Information</h3>
                <p className="text-sm">
                  <span className="text-textSecondary">Total Amount:</span>{' '}
                  <span className="font-bold text-ocean-mid">₱{Number(selectedBooking.totalPrice).toLocaleString()}</span>
                </p>
                <p className="text-sm mt-1">
                  <span className="text-textSecondary">50% Down Payment:</span>{' '}
                  <span className="font-bold text-amber-600">₱{calculateDownPayment(selectedBooking.totalPrice).toLocaleString()}</span>
                </p>
                <p className="text-sm mt-1">
                  <span className="text-textSecondary">Balance:</span>{' '}
                  <span className={`font-bold ${selectedBooking.status === 'confirmed' ? 'text-ocean-mid' : 'text-neutral'}`}>
                    {calculateBalance(selectedBooking)}
                  </span>
                </p>
                <p className="text-sm mt-1">
                  <span className="text-textSecondary">Status:</span>{' '}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(selectedBooking.status)}`}>
                    {selectedBooking.status?.charAt(0).toUpperCase() + selectedBooking.status?.slice(1)}
                  </span>
                </p>
              </div>

              {/* Payment Proof Image - Clickable */}
              {selectedBooking.paymentProofUrl && (
                <div className="bg-ocean-ice rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Payment Proof</h3>
                  <div 
                    className="relative bg-ocean-pale/30 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity duration-200"
                    onClick={() => setImageZoomModal({ show: true, imageUrl: selectedBooking.paymentProofUrl, title: 'Payment Proof' })}
                  >
                    <img
                      src={selectedBooking.paymentProofUrl}
                      alt="Payment Proof"
                      className="w-full h-auto max-h-[200px] object-contain"
                      onError={(e) => {
                        console.error('Error loading image:', e);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="p-4 text-center"><i class="fas fa-image text-3xl text-neutral mb-2 block"></i><p class="text-textSecondary">Error loading payment proof image</p></div>';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
                      <i className="fas fa-search-plus text-white text-xl opacity-0 hover:opacity-100 transition-opacity duration-200"></i>
                    </div>
                  </div>
                </div>
              )}

              {/* Valid ID - Clickable */}
              {selectedBooking.validIdUrl && (
                <div className="bg-ocean-ice rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Valid ID</h3>
                  {selectedBooking.validIdType && (
                    <p className="text-xs text-textSecondary mb-2">ID Type: <span className="font-medium text-textPrimary">{selectedBooking.validIdType}</span></p>
                  )}
                  <div 
                    className="relative bg-ocean-pale/30 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity duration-200"
                    onClick={() => setImageZoomModal({ show: true, imageUrl: selectedBooking.validIdUrl, title: `Valid ID - ${selectedBooking.validIdType || 'ID'}` })}
                  >
                    <img
                      src={selectedBooking.validIdUrl}
                      alt="Valid ID"
                      className="w-full h-auto max-h-[150px] object-contain bg-white"
                      onError={(e) => {
                        console.error('Error loading valid ID image:', e);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="p-4 text-center"><i class="fas fa-id-card text-3xl text-neutral mb-2 block"></i><p class="text-textSecondary">Error loading valid ID image</p></div>';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
                      <i className="fas fa-search-plus text-white text-xl opacity-0 hover:opacity-100 transition-opacity duration-200"></i>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Request */}
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Special Request</h3>
                {selectedBooking.specialRequest ? (
                  <p className="text-sm text-amber-800">{selectedBooking.specialRequest}</p>
                ) : (
                  <p className="text-sm text-amber-600 italic">No special requests from guest</p>
                )}
              </div>
            </div>
            
            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-white border-t border-ocean-light/20 px-5 py-3 rounded-b-xl flex gap-2 justify-end">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-1.5 border border-ocean-light/20 rounded-lg text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Close
              </button>
              {selectedBooking.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setConfirmModal({ show: true, booking: selectedBooking, type: activeTab === 'rooms' ? 'room' : 'daytour', note: '' });
                    }}
                    disabled={actionLoading[selectedBooking.id]}
                    className="px-4 py-1.5 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white text-sm font-medium hover:shadow-lg transition-all duration-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <i className="fas fa-check text-xs"></i>
                    Confirm
                  </button>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setCancelModal({ show: true, booking: selectedBooking, reason: '' });
                    }}
                    disabled={actionLoading[selectedBooking.id]}
                    className="px-4 py-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-lg text-white text-sm font-medium hover:shadow-lg transition-all duration-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <i className="fas fa-times text-xs"></i>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reservation Modal with Note Field */}
      {confirmModal.show && confirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <i className="fas fa-check-circle text-green-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Confirm Reservation</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to confirm this {confirmModal.type === 'room' ? 'room' : 'day tour'} reservation for{" "}
                <span className="font-semibold text-textPrimary">
                  {confirmModal.booking.guestInfo?.firstName} {confirmModal.booking.guestInfo?.lastName}
                </span>?<br />
                <span className="text-xs mt-1 block">
                  Booking ID: {confirmModal.booking.bookingId}
                  {confirmModal.type === 'room' && confirmModal.booking.isMultiRoomGroup && (
                    <><br />Multi-Room Booking: {confirmModal.booking.roomTypesDisplay}</>
                  )}
                  {confirmModal.type === 'room' && !confirmModal.booking.isMultiRoomGroup && (
                    <><br />Room: {confirmModal.booking.roomType}<br />Number of Rooms: {confirmModal.booking.numberOfRooms || 1}</>
                  )}
                </span>
              </p>
            </div>
            
            <div className="mb-5">
              <label className="block text-sm font-semibold text-textPrimary mb-2">
                Note (Optional)
              </label>
              <textarea
                value={confirmModal.note}
                onChange={(e) => setConfirmModal(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Add a note to include in the confirmation email (e.g., special instructions, welcome message, etc.)"
                rows="3"
                className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-green-300 focus:ring-2 focus:ring-green-200 transition-all duration-300 bg-white resize-none"
              />
              <p className="text-xs text-textSecondary mt-1">
                This note will be included in the confirmation email sent to the guest.
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmModal({ show: false, booking: null, type: '', note: '' })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.type === 'room' ? handleConfirmReservation : handleConfirmDayTourReservation}
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                Confirm Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reservation Modal */}
      {cancelModal.show && cancelModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                <i className="fas fa-times-circle text-red-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Cancel Reservation</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to cancel this reservation for{" "}
                <span className="font-semibold text-textPrimary">
                  {cancelModal.booking.guestInfo?.firstName} {cancelModal.booking.guestInfo?.lastName}
                </span>?<br />
                <span className="text-xs mt-1 block">
                  Booking ID: {cancelModal.booking.bookingId}
                </span>
              </p>
            </div>
            
            <div className="mb-5">
              <label className="block text-sm font-semibold text-textPrimary mb-2">
                Cancellation Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={cancelModal.reason}
                onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Please provide a reason for cancellation..."
                rows="3"
                className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-200 transition-all duration-300 bg-white resize-none"
              ></textarea>
              <p className="text-xs text-textSecondary mt-1">
                This reason will be logged for audit purposes.
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setCancelModal({ show: false, booking: null, reason: '' })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Go Back
              </button>
              <button
                onClick={activeTab === 'rooms' ? handleCancelReservation : handleCancelDayTourReservation}
                disabled={!cancelModal.reason.trim()}
                className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                Cancel Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Notification Confirmation Modal */}
      {refundModal.show && refundModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <i className="fas fa-envelope-open-text text-green-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Send Refund Notification</h3>
              <p className="text-textSecondary text-sm">
                Send an email to <strong>{refundModal.booking.guestInfo?.firstName} {refundModal.booking.guestInfo?.lastName}</strong><br />
                confirming that 50% of their down payment has been refunded.
              </p>
              <p className="text-xs text-neutral mt-2">
                Booking ID: {refundModal.booking.bookingId}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setRefundModal({ show: false, booking: null, sending: false })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                disabled={refundModal.sending}
              >
                Cancel
              </button>
              <button
                onClick={handleSendRefundNotification}
                disabled={refundModal.sending}
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
              >
                {refundModal.sending ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i> Sending...</>
                ) : (
                  <><i className="fas fa-paper-plane mr-1"></i> Send Email</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reason Modal - Refund Notify and Move Date Notify buttons are now permanently disabled after click */}
      {showReasonModal.show && showReasonModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center">
                <i className="fas fa-comment-dots text-orange-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Cancellation Reason</h3>
              <p className="text-textSecondary text-sm">
                Guest cancelled this reservation
              </p>
            </div>
            
            <div className="mb-5">
              <label className="block text-sm font-semibold text-textPrimary mb-2">
                Reason Provided by Guest:
              </label>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-textPrimary text-sm">{showReasonModal.reason}</p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowReasonModal({ show: false, booking: null, reason: '', sending: false })}
                className="px-4 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                disabled={showReasonModal.sending || moveDateModal.sending}
              >
                Close
              </button>
              <button
                onClick={() => setRefundConfirmModal({ show: true, booking: showReasonModal.booking })}
                disabled={isNotificationDisabled(showReasonModal.booking)}
                className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  isNotificationDisabled(showReasonModal.booking)
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-green-500 to-green-600 hover:shadow-lg hover:-translate-y-0.5'
                }`}
                title={isNotificationDisabled(showReasonModal.booking) ? "Notification already sent" : ""}
              >
                <i className="fas fa-dollar-sign mr-1"></i>
                Refund Notify
              </button>
              <button
                onClick={() => setMoveDateConfirmModal({ show: true, booking: showReasonModal.booking })}
                disabled={isNotificationDisabled(showReasonModal.booking)}
                className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  isNotificationDisabled(showReasonModal.booking)
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-lg hover:-translate-y-0.5'
                }`}
                title={isNotificationDisabled(showReasonModal.booking) ? "Notification already sent" : ""}
              >
                <i className="fas fa-calendar-alt mr-1"></i>
                Move Date Notify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal */}
      {refundConfirmModal.show && refundConfirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-yellow-100 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-yellow-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Confirm Refund Notification</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to send a refund notification to{" "}
                <strong>{refundConfirmModal.booking.guestInfo?.firstName} {refundConfirmModal.booking.guestInfo?.lastName}</strong>?
              </p>
              <p className="text-xs text-neutral mt-2">
                This will send an email about the 50% refund
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setRefundConfirmModal({ show: false, booking: null, sending: false })}
                className="px-4 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                disabled={refundConfirmModal.sending}
              >
                Cancel
              </button>
              <button
                onClick={() => handleRefundNotify(refundConfirmModal.booking)}
                disabled={refundConfirmModal.sending}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
              >
                {refundConfirmModal.sending ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i> Sending...</>
                ) : (
                  <><i className="fas fa-check mr-1"></i> Yes, Send Refund Notification</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Date Confirmation Modal */}
      {moveDateConfirmModal.show && moveDateConfirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-yellow-100 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-yellow-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Confirm Move Date Notification</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to send a move date notification to{" "}
                <strong>{moveDateConfirmModal.booking.guestInfo?.firstName} {moveDateConfirmModal.booking.guestInfo?.lastName}</strong>?
              </p>
              <p className="text-xs text-neutral mt-2">
                This will send an email informing the guest that their reservation has been successfully updated to their preferred date.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setMoveDateConfirmModal({ show: false, booking: null, sending: false })}
                className="px-4 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                disabled={moveDateConfirmModal.sending}
              >
                Cancel
              </button>
              <button
                onClick={() => handleMoveDateNotify(moveDateConfirmModal.booking)}
                disabled={moveDateConfirmModal.sending}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
              >
                {moveDateConfirmModal.sending ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i> Sending...</>
                ) : (
                  <><i className="fas fa-check mr-1"></i> Yes, Send Move Date Notification</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
        
        @keyframes scaleIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}