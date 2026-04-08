// app/dashboard/admin/reservations/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { logAdminAction } from '../../../../lib/auditLogger';
import { sendConfirmationEmail, sendCancellationEmail } from '../../../../lib/emailService';

export default function AdminReservations() {
  const [activeTab, setActiveTab] = useState('rooms');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bookings, setBookings] = useState([]);
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
  
  // New state for confirmation modals
  const [confirmModal, setConfirmModal] = useState({ show: false, booking: null, type: '' });
  const [cancelModal, setCancelModal] = useState({ show: false, booking: null, reason: '' });
  
  // New state for refund confirmation modal
  const [refundConfirmModal, setRefundConfirmModal] = useState({ show: false, booking: null });
  
  // New state for move date confirmation modal
  const [moveDateConfirmModal, setMoveDateConfirmModal] = useState({ show: false, booking: null });
  
  // Track which bookings have had notifications sent
  const [notificationSent, setNotificationSent] = useState({});

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
    if (!bookings.length) return;
    let isProcessing = false;
    const tick = async () => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        const now = new Date();
        for (const booking of bookings) {
          if (!booking?.id || !booking?.status) continue;
          if (['pending', 'cancelled', 'cancelled-by-guest', 'completed'].includes(booking.status)) continue;
          const checkInRaw = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          const checkOutRaw = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          if (isNaN(checkInRaw?.getTime?.()) || isNaN(checkOutRaw?.getTime?.())) continue;
          const oneHourBeforeCheckOut = new Date(checkOutRaw.getTime() - 60 * 60 * 1000);
          let targetStatus = null;
          if (now > checkOutRaw) {
            targetStatus = 'completed';
          } else if (now >= oneHourBeforeCheckOut && now <= checkOutRaw) {
            targetStatus = 'check-out';
          } else if (now >= checkInRaw) {
            targetStatus = 'check-in';
          }
          if (targetStatus && booking.status !== targetStatus) {
            await updateDoc(doc(db, 'bookings', booking.id), {
              status: targetStatus,
              updatedAt: new Date().toISOString()
            });
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
  }, [bookings]);

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
      const collectionName = isRoomBooking ? 'bookings' : 'dayTourBookings';
      const notificationType = isRoomBooking ? 'room' : 'daytour';
      const bookingRef = doc(db, collectionName, booking.id);
      await updateDoc(bookingRef, {
        refundProcessed: true,
        refundProcessedAt: new Date().toISOString(),
        balance: 0,
        refundNotificationSent: true,
        updatedAt: new Date().toISOString()
      });
      
      setNotificationSent(prev => ({ ...prev, [booking.id]: { refund: true, moveDate: prev[booking.id]?.moveDate || false } }));
      
      const response = await fetch('/api/admin/send-refund-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, type: notificationType })
      });
      const data = await response.json();

      if (response.ok) {
        const total = typeof booking.totalPrice === 'number' ? booking.totalPrice : Number(booking.totalPrice) || 0;
        const downPayment = total * 0.5;
        const refundAmount = downPayment * 0.5;
        
        await logAdminAction({
          action: 'Refund Notification Sent',
          module: isRoomBooking ? 'Reservations' : 'Day Tour Reservations',
          details: `Sent refund notification for ${isRoomBooking ? 'room' : 'day tour'} booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}). Refund amount: ₱${refundAmount.toLocaleString()} (50% of down payment). Balance updated to 0.`
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
      const collectionName = isRoomBooking ? 'bookings' : 'dayTourBookings';
      const notificationType = isRoomBooking ? 'room' : 'daytour';
      const bookingRef = doc(db, collectionName, booking.id);
      await updateDoc(bookingRef, {
        moveDateNotificationSent: true,
        moveDateNotificationSentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      setNotificationSent(prev => ({ ...prev, [booking.id]: { refund: prev[booking.id]?.refund || false, moveDate: true } }));
      
      const response = await fetch('/api/admin/send-move-date-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, type: notificationType })
      });
      const data = await response.json();

      if (response.ok) {
        await logAdminAction({
          action: 'Move Date Notification Sent',
          module: isRoomBooking ? 'Reservations' : 'Day Tour Reservations',
          details: `Sent move date notification for ${isRoomBooking ? 'room' : 'day tour'} booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}).`
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
      // Parse as local date - split the string and create date using local components
      const [year, month, day] = dateString.split('-');
      // Create date using UTC to avoid timezone shift, but display as local
      // The date is already in YYYY-MM-DD format, so we can directly format it
      const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      });
    }
    
    // Handle Firebase Timestamp objects
    if (dateString && typeof dateString.toDate === 'function') {
      const date = dateString.toDate();
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    
    // Handle date objects with seconds property
    if (dateString && typeof dateString === 'object' && dateString.seconds) {
      const date = new Date(dateString.seconds * 1000);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    
    // Handle other date formats
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
    setConfirmModal({ show: false, booking: null, type: '' });
    return;
  }
  
  setActionLoading(prev => ({ ...prev, [booking.id]: true }));
  try {
    const bookingRef = doc(db, 'dayTourBookings', booking.id);
    await updateDoc(bookingRef, {
      status: 'confirmed',
      updatedAt: new Date().toISOString()
    });

    // Send confirmation email for day tour
    const { sendDayTourConfirmationEmail } = await import('../../../../lib/emailService');
    const emailResult = await sendDayTourConfirmationEmail(booking);
    if (emailResult.success) {
      console.log('Day tour confirmation email sent successfully');
    } else {
      console.warn('Failed to send day tour confirmation email:', emailResult.error);
    }

    await logAdminAction({
      action: 'Confirmed Day Tour Reservation',
      module: 'Day Tour Reservations',
      details: `Confirmed day tour booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`
    });

    showNotification(`Day tour booking ${booking.bookingId} has been confirmed. A confirmation email has been sent to the guest.`, 'success');
    setShowPaymentModal(false);
    setConfirmModal({ show: false, booking: null, type: '' });
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

    // Send cancellation email for day tour
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
  const handleConfirmReservation = async () => {
    const booking = confirmModal.booking;
    if (!booking) return;
    
    if (booking.status !== 'pending') {
      showNotification('This reservation is no longer pending.', 'error');
      setConfirmModal({ show: false, booking: null, type: '' });
      return;
    }
    
    setActionLoading(prev => ({ ...prev, [booking.id]: true }));
    try {
      const bookingRef = doc(db, 'bookings', booking.id);
      await updateDoc(bookingRef, {
        status: 'confirmed',
        updatedAt: new Date().toISOString()
      });

      const emailResult = await sendConfirmationEmail(booking);
      if (emailResult.success) {
        console.log('Confirmation email sent successfully');
      } else {
        console.warn('Failed to send confirmation email:', emailResult.error);
      }

      await logAdminAction({
        action: 'Confirmed Reservation',
        module: 'Reservations',
        details: `Confirmed booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} - ${booking.roomType}`
      });

      showNotification(`Booking ${booking.bookingId} has been confirmed. A confirmation email has been sent to the guest.`, 'success');
      setShowPaymentModal(false);
      setConfirmModal({ show: false, booking: null, type: '' });
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
      const bookingRef = doc(db, 'bookings', booking.id);
      await updateDoc(bookingRef, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: reason,
        cancelledBy: 'admin',
        updatedAt: new Date().toISOString()
      });

      const emailResult = await sendCancellationEmail(booking, reason, 'admin');
      if (emailResult.success) {
        console.log('Cancellation email sent successfully');
      } else {
        console.warn('Failed to send cancellation email:', emailResult.error);
      }

      await logAdminAction({
        action: 'Cancelled Reservation',
        module: 'Reservations',
        details: `Cancelled booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} - ${booking.roomType}. Reason: ${reason}`
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

  const calculateBalance = (booking) => {
    const total = typeof booking.totalPrice === 'number' ? booking.totalPrice : Number(booking.totalPrice) || 0;
    const downPayment = total * 0.5;
    const status = booking.status;

    const resolvedRemaining =
      typeof booking.remainingBalance === 'number'
        ? booking.remainingBalance
        : total - downPayment;

    if (booking.type === 'room') {
      if (['cancelled', 'check-out', 'completed'].includes(status)) {
        return '₱0';
      }

      if (status === 'cancelled-by-guest') {
        if (booking.refundNotificationSent || booking.moveDateNotificationSent) {
          return '₱0';
        }
        return `₱${resolvedRemaining.toLocaleString()}`;
      }

      if (['pending', 'confirmed', 'check-in'].includes(status)) {
        return `₱${resolvedRemaining.toLocaleString()}`;
      }

      return 'Not Confirmed';
    }

    // Day tour and other booking types
    if (status === 'cancelled') {
      return '₱0';
    }

    if (status === 'cancelled-by-guest') {
      if (booking.refundNotificationSent || booking.moveDateNotificationSent) {
        return '₱0';
      }
      return `₱${resolvedRemaining.toLocaleString()}`;
    }

    if (status === 'completed') {
      return '₱0';
    }

    if (['pending', 'confirmed', 'check-in'].includes(status)) {
      return `₱${resolvedRemaining.toLocaleString()}`;
    }

    return 'Not Confirmed';
  };

  const isNotificationDisabled = (booking) => {
    return notificationSent[booking.id]?.refund === true || notificationSent[booking.id]?.moveDate === true;
  };

  const getTotalGuests = (booking) => {
    return (booking.seniors || 0) + (booking.adults || 0) + (booking.kids || 0);
  };

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = 
      booking.roomType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.guestInfo?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.guestInfo?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.bookingId?.toLowerCase().includes(searchTerm.toLowerCase());
    
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
    <div className="p-6 bg-gradient-to-br from-ocean-ice to-blue-white min-h-screen">
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
      <div className="flex gap-2 mb-6 border-b border-ocean-light/20">
        <button
          onClick={() => setActiveTab('rooms')}
          className={`px-6 py-3 font-medium transition-all duration-200 ${
            activeTab === 'rooms'
              ? 'text-ocean-mid border-b-2 border-ocean-mid'
              : 'text-textSecondary hover:text-ocean-mid'
          }`}
        >
          <i className="fas fa-bed mr-2"></i>
          Rooms
        </button>
        <button
          onClick={() => setActiveTab('daytour')}
          className={`px-6 py-3 font-medium transition-all duration-200 ${
            activeTab === 'daytour'
              ? 'text-ocean-mid border-b-2 border-ocean-mid'
              : 'text-textSecondary hover:text-ocean-mid'
          }`}
        >
          <i className="fas fa-sun mr-2"></i>
          Day Tour
        </button>
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

      {/* Rooms Reservations Table */}
      {activeTab === 'rooms' && (
        <>
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guest Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Room Type</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Check-in</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Check-out</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guests</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Total</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">50% Down Payment</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Balance</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary min-w-[120px]">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan="12" className="px-4 py-12 text-center text-neutral">
                          <i className="fas fa-calendar-alt text-5xl mb-3 opacity-50 block"></i>
                          <p className="text-lg">No reservations found</p>
                          <p className="text-sm">Reservations will appear here once guests book</p>
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((booking) => (
                        <tr key={booking.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm">{booking.bookingId}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-textPrimary">
                              {booking.guestInfo?.firstName} {booking.guestInfo?.lastName}
                            </div>
                            <div className="text-xs text-neutral">{booking.guestInfo?.email}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-textPrimary">{booking.roomType}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary">
                            {formatDateTimeFromDate(booking.checkIn)}
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary">
                            {formatDateTimeFromDate(booking.checkOut)}
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary">
                            {booking.guests}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-ocean-mid">₱{Number(booking.totalPrice).toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-ocean-mid">₱{calculateDownPayment(booking.totalPrice).toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${booking.status === 'confirmed' || (booking.status === 'cancelled-by-guest' && booking.refundNotificationSent) ? 'text-ocean-mid' : 'text-neutral'}`}>
                              {calculateBalance(booking)}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[120px]">
                            <span className={`inline-flex whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                              {booking.status?.charAt(0).toUpperCase() + booking.status?.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {(booking.paymentProof || booking.status === 'pending') && (
                                <button
                                  onClick={() => {
                                    setSelectedBooking(booking);
                                    setShowPaymentModal(true);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-200"
                                  title="View Payment Proof"
                                >
                                  <i className="fas fa-receipt mr-1"></i>
                                  View Payment
                                </button>
                              )}
                              {booking.status === 'cancelled-by-guest' && (
                                <>
                                  <button
                                    onClick={() => setShowReasonModal({ 
                                      show: true, 
                                      booking: booking, 
                                      reason: booking.cancellationReason || 'No reason provided',
                                      sending: false 
                                    })}
                                    className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-all duration-200"
                                    title="View Cancellation Reason"
                                  >
                                    <i className="fas fa-comment-dots mr-1"></i>
                                    Reason
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary">
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

      {/* Day Tour Reservations Table */}
      {activeTab === 'daytour' && (
        <>
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guest Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Senior</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Adult</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Kid</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Total Guests</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">50% Down Payment</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Balance</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary min-w-[157px]">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booked On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDayTours.length === 0 ? (
                      <tr>
                        <td colSpan="12" className="px-4 py-12 text-center text-neutral">
                          <i className="fas fa-sun text-5xl mb-3 opacity-50 block"></i>
                          <p className="text-lg">No day tour reservations found</p>
                          <p className="text-sm">Day tour reservations will appear here once guests book</p>
                        </td>
                      </tr>
                    ) : (
                      filteredDayTours.map((tour) => (
                        <tr key={tour.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm">{tour.bookingId}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-textPrimary">
                              {tour.guestInfo?.firstName} {tour.guestInfo?.lastName}
                            </div>
                            <div className="text-xs text-neutral">{tour.guestInfo?.email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary">
                            {formatDateOnly(tour.selectedDate)}
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary text-center">
                            {tour.seniors || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary text-center">
                            {tour.adults || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary text-center">
                            {tour.kids || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary text-center">
                            <span className="font-semibold">{getTotalGuests(tour)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-ocean-mid">₱{calculateDownPayment(tour.totalPrice).toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${tour.status === 'confirmed' || (tour.status === 'cancelled-by-guest' && tour.refundNotificationSent) ? 'text-ocean-mid' : 'text-neutral'}`}>
                              {calculateBalance(tour)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(tour.status)}`}>
                              {tour.status?.charAt(0).toUpperCase() + tour.status?.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {(tour.paymentProof || tour.status === 'pending') && (
                                <button
                                  onClick={() => {
                                    setSelectedBooking(tour);
                                    setShowPaymentModal(true);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-200"
                                  title="View Payment Proof"
                                >
                                  <i className="fas fa-receipt mr-1"></i>
                                  View Payment
                                </button>
                              )}
                              {tour.status === 'cancelled-by-guest' && (
                                <>
                                  <button
                                    onClick={() => setShowReasonModal({ 
                                      show: true, 
                                      booking: tour, 
                                      reason: tour.cancellationReason || 'No reason provided',
                                      sending: false 
                                    })}
                                    className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-all duration-200"
                                    title="View Cancellation Reason"
                                  >
                                    <i className="fas fa-comment-dots mr-1"></i>
                                    Reason
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-textSecondary">
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

      {/* Payment Proof Modal */}
      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                Payment Proof - {selectedBooking.bookingId}
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-ocean-ice rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Guest Name</p>
                  <p className="text-textPrimary font-medium">
                    {selectedBooking.guestInfo?.firstName} {selectedBooking.guestInfo?.lastName}
                  </p>
                </div>
                {activeTab === 'rooms' ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Room Type</p>
                      <p className="text-textPrimary font-medium">{selectedBooking.roomType}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Check-in Date</p>
                      <p className="text-textPrimary font-medium">
                        {formatDateTimeFromDate(selectedBooking.checkIn)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Check-out Date</p>
                      <p className="text-textPrimary font-medium">
                        {formatDateTimeFromDate(selectedBooking.checkOut)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Tour Date</p>
                      <p className="text-textPrimary font-medium">
                        {formatDateOnly(selectedBooking.selectedDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Guests Breakdown</p>
                      <p className="text-textPrimary font-medium">
                        Senior: {selectedBooking.seniors || 0} | Adult: {selectedBooking.adults || 0} | Kid: {selectedBooking.kids || 0}
                      </p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Total Amount</p>
                  <p className="text-ocean-mid font-bold">₱{Number(selectedBooking.totalPrice).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral uppercase tracking-wide">50% Down Payment</p>
                  <p className="text-ocean-mid font-bold">₱{calculateDownPayment(selectedBooking.totalPrice).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Balance</p>
                  <p className="text-ocean-mid font-bold">
                    {calculateBalance(selectedBooking)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedBooking.status)}`}>
                    {selectedBooking.status?.charAt(0).toUpperCase() + selectedBooking.status?.slice(1)}
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-3">Payment Proof Image</label>
                {selectedBooking.paymentProof ? (
                  <div className="relative bg-ocean-pale/30 rounded-xl overflow-hidden">
                    <img
                      src={selectedBooking.paymentProof}
                      alt="Payment Proof"
                      className="w-full h-auto max-h-[500px] object-contain"
                      onError={(e) => {
                        console.error('Error loading image:', e);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="p-8 text-center"><i class="fas fa-image text-4xl text-neutral mb-2 block"></i><p class="text-textSecondary">Error loading payment proof image</p></div>';
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center bg-ocean-ice rounded-xl">
                    <i className="fas fa-image text-4xl text-neutral mb-2 block"></i>
                    <p className="text-textSecondary">No payment proof uploaded</p>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <label className="block text-sm font-semibold text-textPrimary mb-3">Valid ID</label>
                {selectedBooking.validIdImage ? (
                  <div className="space-y-2">
                    {selectedBooking.validIdType && (
                      <p className="text-sm text-textSecondary">
                        ID Type:{' '}
                        <span className="font-semibold text-textPrimary">
                          {selectedBooking.validIdType}
                        </span>
                      </p>
                    )}
                    <div className="relative bg-ocean-pale/30 rounded-xl overflow-hidden">
                      <img
                        src={selectedBooking.validIdImage}
                        alt="Valid ID"
                        className="w-full h-auto max-h-[400px] object-contain bg-white"
                        onError={(e) => {
                          console.error('Error loading valid ID image:', e);
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = '<div class="p-6 text-center"><i class="fas fa-id-card text-3xl text-neutral mb-2 block"></i><p class="text-textSecondary">Error loading valid ID image</p></div>';
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center bg-ocean-ice rounded-xl">
                    <i className="fas fa-id-card text-3xl text-neutral mb-2 block"></i>
                    <p className="text-textSecondary">No valid ID uploaded</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-ocean-light/10">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Close
              </button>
              {selectedBooking.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setConfirmModal({ show: true, booking: selectedBooking, type: activeTab === 'rooms' ? 'room' : 'daytour' });
                    }}
                    disabled={actionLoading[selectedBooking.id]}
                    className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
                  >
                    <i className="fas fa-check"></i>
                    Confirm Reservation
                  </button>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setCancelModal({ show: true, booking: selectedBooking, reason: '' });
                    }}
                    disabled={actionLoading[selectedBooking.id]}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
                  >
                    <i className="fas fa-times"></i>
                    Cancel Reservation
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reservation Modal */}
      {confirmModal.show && confirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
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
                  {confirmModal.type === 'room' && <><br />Room: {confirmModal.booking.roomType}</>}
                </span>
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmModal({ show: false, booking: null, type: '' })}
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

      {/* Reason Modal */}
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