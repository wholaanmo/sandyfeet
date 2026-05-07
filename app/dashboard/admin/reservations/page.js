// app/dashboard/admin/reservations/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, getDoc, getDocs, where } from 'firebase/firestore';
import { logAdminAction } from '../../../../lib/auditLogger';
import { sendConfirmationEmail, sendCancellationEmail } from '../../../../lib/emailService';
import { useSearchParams } from 'next/navigation';

export default function AdminReservations() {
    const searchParams = useSearchParams(); // <-- ADDED
  const checkinToken = searchParams.get('checkinToken'); 
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
  const [idRequestModal, setIdRequestModal] = useState({ show: false, booking: null, message: '', sending: false });

  const [editingNote, setEditingNote] = useState(false);
const [tempNoteForEdit, setTempNoteForEdit] = useState('');
const [savingNote, setSavingNote] = useState(false);

  // New state for confirmation modals
  const [confirmModal, setConfirmModal] = useState({ show: false, booking: null, type: '', note: '', loading: false });
  const [cancelModal, setCancelModal] = useState({ show: false, booking: null, type: '', note: '', loading: false });

  // New state for refund confirmation modal
  const [refundConfirmModal, setRefundConfirmModal] = useState({ show: false, booking: null, sending: false });

  // New state for move date confirmation modal
  const [moveDateConfirmModal, setMoveDateConfirmModal] = useState({ show: false, booking: null, message: '', sending: false });

  // New state for image zoom modal
  const [imageZoomModal, setImageZoomModal] = useState({ show: false, imageUrl: '', title: '' });

  // New state for check-in confirmation modal
  const [checkInConfirmModal, setCheckInConfirmModal] = useState({ show: false, booking: null, loading: false });

  // Fixed check-in and check-out times
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

  const [editingPayment, setEditingPayment] = useState(false);
  const [tempBalance, setTempBalance] = useState('');
  const [tempNote, setTempNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

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
  const openSidebarFromToken = async () => {
    if (!checkinToken) return;
    try {
      const tokenRef = doc(db, 'checkinTokens', checkinToken);
      const tokenDoc = await getDoc(tokenRef);
      if (!tokenDoc.exists()) return;

      const tokenData = tokenDoc.data();
      const bookingId = tokenData.bookingId;

      // 1. Try day tour collection first (unchanged – already working)
      const dayTourQuery = query(collection(db, 'dayTourBookings'), where('bookingId', '==', bookingId));
      const dayTourSnapshot = await getDocs(dayTourQuery);
      if (!dayTourSnapshot.empty) {
        const tourDoc = dayTourSnapshot.docs[0];
        const tourData = tourDoc.data();
        const dayTourBooking = {
          id: tourDoc.id,
          ...tourData,
          type: 'daytour',
          bookingId: tourData.bookingId,
          guestInfo: tourData.guestInfo,
          selectedDate: tourData.selectedDate,
          adults: tourData.adults,
          kids: tourData.kids,
          seniors: tourData.seniors || 0,
          totalPrice: tourData.totalPrice,
          status: tourData.status,
          paymentProof: tourData.paymentProof,
          validIdImage: tourData.validIdImage,
          validIdType: tourData.validIdType,
          specialRequest: tourData.specialRequest,
          createdAt: tourData.createdAt
        };
        setActiveTab('daytour');
        openSidebar(dayTourBooking);
        return;
      }

      // 2. Room booking – use the existing grouping function to handle all cases
      const roomQuery1 = query(collection(db, 'bookings'), where('bookingId', '==', bookingId));
      const roomQuery2 = query(collection(db, 'bookings'), where('parentBookingId', '==', bookingId));
      const [snap1, snap2] = await Promise.all([getDocs(roomQuery1), getDocs(roomQuery2)]);
      const matchedDocs = [...snap1.docs, ...snap2.docs];
      if (matchedDocs.length === 0) {
        console.warn('No room booking found for token', bookingId);
        return;
      }

      // Convert to plain objects and group them (works for single and multi‑room)
      const roomBookingsList = matchedDocs.map(doc => ({ id: doc.id, ...doc.data() }));
      const groupedRooms = groupMultiRoomBookings(roomBookingsList);
      if (groupedRooms.length > 0) {
        setActiveTab('rooms');
        openSidebar(groupedRooms[0]); // The first (and only) grouped object is the correct booking
      } else {
        console.warn('No room booking to display for token', bookingId);
      }
    } catch (error) {
      console.error('Error retrieving booking from token:', error);
    }
  };

  if (checkinToken) {
    openSidebarFromToken();
  }
}, [checkinToken]);

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
          manualDownPayment: booking.manualDownPayment,
          createdAt: booking.createdAt,
          type: 'room',
          isMultiRoomGroup: true,
          roomTypes: [],
          tentCount: booking.tentCount || 0,
          exclusiveAdults: booking.exclusiveAdults || 0,
          exclusiveKids: booking.exclusiveKids || 0,
          manualBalance: booking.manualBalance,
          adminNote: booking.adminNote,
          manualTotalPrice: booking.manualTotalPrice
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
    // If only one child in group, treat as single booking with "Single Room Type" label
    if (group.bookings.length === 1) {
      const singleBooking = group.bookings[0];
      singleBookings.push({
        ...singleBooking,
        bookingIdDisplay: 'Single Room Type'
      });
      continue;
    }

    // Aggregate flags from all child bookings
    let hasRefundNotification = false;
    let hasMoveDateNotification = false;
    for (const child of group.bookings) {
      if (child.refundNotificationSent) hasRefundNotification = true;
      if (child.moveDateNotificationSent) hasMoveDateNotification = true;
    }

    // Get unique room types and aggregate quantities
    const roomTypeMap = new Map();
    let totalRooms = 0;
    let totalPrice = 0;
    let totalGuests = 0;
    let tentCount = group.tentCount || 0;
    let exclusiveAdults = group.exclusiveAdults || 0;
    let exclusiveKids = group.exclusiveKids || 0;
    let childBookingsWithGuests = [];

    for (const booking of group.bookings) {
      totalRooms++;
      totalPrice += booking.totalPrice || 0;
      totalGuests += booking.guests || 1;

      if (booking.isExclusiveResortBooking) {
        tentCount = booking.tentCount || 0;
        exclusiveAdults = booking.exclusiveAdults || 0;
        exclusiveKids = booking.exclusiveKids || 0;
      }

      childBookingsWithGuests.push({
        roomType: booking.roomType,
        guests: booking.guests || 1,
        adults: booking.adults || booking.guests || 1,
        kids: booking.kids || 0,
        price: booking.price
      });

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

    const roomTypesArray = Array.from(roomTypeMap.entries()).map(([type, data]) => ({
      type: type,
      quantity: data.count,
      guestsPerRoom: data.guests
    }));

    const exclusiveChildBooking = group.bookings.find(b => b.isExclusiveResortBooking);
    const isExclusiveResortBooking = Boolean(exclusiveChildBooking);
    const exclusivePackagePrice = Number(exclusiveChildBooking?.exclusivePackagePrice || 0);

    if (isExclusiveResortBooking && tentCount > 0) {
      const tentIndex = roomTypesArray.findIndex(item => item.type === 'Tent');
      if (tentIndex !== -1) {
        roomTypesArray[tentIndex].type = 'Tent(s)';
      } else {
        roomTypesArray.push({ type: 'Tent(s)', quantity: tentCount, guestsPerRoom: 0 });
      }
    }

    // Total rooms count (including tents)
    let totalRoomsCount = totalRooms;
    if (isExclusiveResortBooking) {
      let exclusiveRoomCount = 0;
      for (const [type, data] of roomTypeMap) {
        if (type !== 'Tent') exclusiveRoomCount += data.count;
      }
      totalRoomsCount = exclusiveRoomCount + (tentCount || 0);
    }

    let roomTypesDisplay = '';
    if (isExclusiveResortBooking) {
      roomTypesDisplay = tentCount > 0
        ? `Entire Resort Package + ${tentCount} Tent(s)`
        : 'Entire Resort Package';
    } else if (roomTypesArray.length > 1) {
      roomTypesDisplay = roomTypesArray.map(item => `${item.quantity} × ${item.type}`).join(', ');
    } else {
      roomTypesDisplay = roomTypesArray.map(item => `${item.quantity} × ${item.type}`).join(', ');
    }

    const displayTotalPrice = isExclusiveResortBooking && exclusivePackagePrice > 0
      ? exclusivePackagePrice
      : totalPrice;
    const displayDownPayment = displayTotalPrice * 0.5;
    const displayRemainingBalance = displayTotalPrice - displayDownPayment;

    let bookingIdDisplay = '';
    if (isExclusiveResortBooking) {
      bookingIdDisplay = 'Entire Resort';
    } else if (roomTypesArray.length > 1) {
      bookingIdDisplay = 'Multi-Room Types';
    } else {
      bookingIdDisplay = 'Single Room Type';
    }

    consolidatedGroups.push({
      id: parentId,
      bookingId: parentId,
      bookingIdDisplay: bookingIdDisplay,
      guestInfo: group.guestInfo,
      checkIn: group.checkIn,
      checkOut: group.checkOut,
      status: group.status,
      paymentMethod: group.paymentMethod,
      paymentProofUrl: group.paymentProofUrl,
      validIdType: group.validIdType,
      validIdUrl: group.validIdUrl,
      specialRequest: group.specialRequest,
      manualDownPayment: group.manualDownPayment,
      createdAt: group.createdAt,
      type: 'room',
      isMultiRoomGroup: true,
      isExclusiveResortBooking,
      exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null,
      roomTypesDisplay,
      roomTypesArray,
      totalRooms: totalRoomsCount,
      totalPrice: displayTotalPrice,
      downPayment: displayDownPayment,
      remainingBalance: displayRemainingBalance,
      totalGuests,
      childBookings: childBookingsWithGuests,
      originalChildBookings: group.bookings,
      tentCount: tentCount,
      exclusiveAdults: exclusiveAdults,
      exclusiveKids: exclusiveKids,
      exclusiveTotalGuests: exclusiveAdults + exclusiveKids,
      // Preserve edited payment fields
      manualBalance: group.manualBalance,
      adminNote: group.adminNote,
      manualTotalPrice: group.manualTotalPrice,
      // NEW: aggregated notification flags
      refundNotificationSent: hasRefundNotification,
      moveDateNotificationSent: hasMoveDateNotification,
      manualDownPayment: group.manualDownPayment
    });
  }

  // Enhanced single bookings (non‑multi-room)
  const enhancedSingleBookings = singleBookings.map(booking => ({
    ...booking,
    bookingIdDisplay: booking.bookingIdDisplay || 'Single Room Type'
  }));

  return [...enhancedSingleBookings, ...consolidatedGroups];
};

 const handleConfirmCheckIn = async () => {
    const booking = checkInConfirmModal.booking || sidebarBooking;
    if (!booking) return;
    if (booking.status !== 'confirmed') {
      showNotification('Booking must be confirmed before check-in.', 'error');
      setCheckInConfirmModal({ show: false, booking: null, loading: false });
      return;
    }
    
    setCheckInConfirmModal(prev => ({ ...prev, loading: true }));
    setActionLoading((prev) => ({ ...prev, [booking.id]: true }));
    try {
      if (booking.isMultiRoomGroup && booking.originalChildBookings) {
        for (const childBooking of booking.originalChildBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            status: 'check-in',
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        const collectionName = booking.type === 'room' ? 'bookings' : 'dayTourBookings';
        const bookingRef = doc(db, collectionName, booking.id);
        await updateDoc(bookingRef, {
          status: 'check-in',
          updatedAt: new Date().toISOString(),
        });
      }
      await logAdminAction({
        action: 'Manual Check-In',
        module: 'Reservations',
        details: `Manually checked in ${booking.isMultiRoomGroup ? 'multi-room' : ''} booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`,
      });
      showNotification('Guest checked in successfully.', 'success');
      // Update local sidebarBooking status so button disables immediately
      setSidebarBooking((prev) => ({ ...prev, status: 'check-in' }));
      setCheckInConfirmModal({ show: false, booking: null, loading: false });
    } catch (error) {
      console.error('Error during check-in:', error);
      showNotification('Failed to check in guest.', 'error');
      setCheckInConfirmModal(prev => ({ ...prev, loading: false }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [booking.id]: false }));
    }
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

        if (booking.isMultiRoomGroup && booking.originalChildBookings) {
          const firstChild = booking.originalChildBookings[0];
          checkInRaw = firstChild.checkIn?.toDate ? firstChild.checkIn.toDate() : new Date(firstChild.checkIn);
          checkOutRaw = firstChild.checkOut?.toDate ? firstChild.checkOut.toDate() : new Date(firstChild.checkOut);
        } else {
          checkInRaw = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          checkOutRaw = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
        }

        if (isNaN(checkInRaw?.getTime?.()) || isNaN(checkOutRaw?.getTime?.())) continue;

        const checkOutDateObj = new Date(checkOutRaw);
        const checkOutDay = new Date(checkOutDateObj.getFullYear(), checkOutDateObj.getMonth(), checkOutDateObj.getDate());
        const checkOutTime = new Date(checkOutDay);
        checkOutTime.setHours(12, 0, 0, 0);
        const completedTime = new Date(checkOutDay);
        completedTime.setHours(13, 0, 0, 0);

        let targetStatus = null;
        if (now >= completedTime) {
          targetStatus = 'completed';
        } else if (now >= checkOutTime && now < completedTime) {
          targetStatus = 'check-out';
        }
        // No automatic 'check-in' transition

        if (targetStatus && booking.status !== targetStatus) {
          if (booking.isMultiRoomGroup && booking.originalChildBookings) {
            for (const childBooking of booking.originalChildBookings) {
              await updateDoc(doc(db, 'bookings', childBooking.id), {
                status: targetStatus,
                updatedAt: new Date().toISOString(),
              });
            }
          } else {
            await updateDoc(doc(db, 'bookings', booking.id), {
              status: targetStatus,
              updatedAt: new Date().toISOString(),
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
    switch (status) {
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

      // Update Firestore documents (set balance to 0, mark refund processed)
      if (booking.isMultiRoomGroup && booking.originalChildBookings) {
        for (const childBooking of booking.originalChildBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            refundProcessed: true,
            refundProcessedAt: new Date().toISOString(),
            balance: 0,
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
          updatedAt: new Date().toISOString()
        });
      }

      // Determine a valid booking ID for the API call
      let apiBookingId = booking.id;
      if (booking.isMultiRoomGroup && booking.originalChildBookings?.length > 0) {
        // Use the first child booking's ID – it is a valid Firestore document ID
        apiBookingId = booking.originalChildBookings[0].id;
      }

      const response = await fetch('/api/admin/send-refund-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: apiBookingId, type: isRoomBooking ? 'room' : 'daytour' })
      });
      const data = await response.json();

      if (response.ok) {
        const total = typeof booking.totalPrice === 'number' ? booking.totalPrice : Number(booking.totalPrice) || 0;
        const downPayment = total * 0.5;
        const refundAmount = downPayment * 0.5;

        await logAdminAction({
          action: 'Refund Notification Sent',
          module: 'Reservations',
          details: `Sent refund notification for ${booking.isMultiRoomGroup ? 'multi-room' : 'room'} booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}). Refund amount: ₱${refundAmount.toLocaleString()} (50% of down payment). Balance updated to 0.`
        });

        if (booking.isMultiRoomGroup && booking.originalChildBookings) {
          for (const childBooking of booking.originalChildBookings) {
            const bookingRef = doc(db, 'bookings', childBooking.id);
            await updateDoc(bookingRef, {
              refundNotificationSent: true,
              refundNotificationSentAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          const collectionName = isRoomBooking ? 'bookings' : 'dayTourBookings';
          const bookingRef = doc(db, collectionName, booking.id);
          await updateDoc(bookingRef, {
            refundNotificationSent: true,
            refundNotificationSentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

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

  const handleMoveDateNotify = async (booking, adminMessage) => {
    setMoveDateConfirmModal(prev => ({ ...prev, sending: true }));
    try {
      const isRoomBooking = booking?.type === 'room';
      let apiBookingId = booking.id;
      if (booking.isMultiRoomGroup && booking.originalChildBookings?.length > 0) {
        apiBookingId = booking.originalChildBookings[0].id;
      }
      const response = await fetch('/api/admin/send-move-date-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: apiBookingId,
          type: isRoomBooking ? 'room' : 'daytour',
          adminMessage: adminMessage
        })
      });
      const data = await response.json();
      if (response.ok) {
        await logAdminAction({
          action: 'Move Date Notification Sent',
          module: 'Reservations',
          details: `Sent move date notification for ${booking.isMultiRoomGroup ? 'multi-room' : 'room'} booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}). Message: ${adminMessage}`
        });
        if (booking.isMultiRoomGroup && booking.originalChildBookings) {
          for (const childBooking of booking.originalChildBookings) {
            const bookingRef = doc(db, 'bookings', childBooking.id);
            await updateDoc(bookingRef, {
              moveDateNotificationSent: true,
              moveDateNotificationSentAt: new Date().toISOString(),
              balance: 0, 
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          const collectionName = isRoomBooking ? 'bookings' : 'dayTourBookings';
          const bookingRef = doc(db, collectionName, booking.id);
          await updateDoc(bookingRef, {
            moveDateNotificationSent: true,
            moveDateNotificationSentAt: new Date().toISOString(),
            balance: 0,    
            updatedAt: new Date().toISOString()
          });
        }

        showNotification(`Move date notification sent to ${booking.guestInfo?.email}`, 'success');
      } else {
        showNotification(data.error || 'Failed to send move date notification', 'error');
      }
    } catch (error) {
      console.error('Error sending move date notification:', error);
      showNotification('Failed to send move date notification', 'error');
    } finally {
      setMoveDateConfirmModal({ show: false, booking: null, message: '', sending: false });
      setShowReasonModal({ show: false, booking: null, reason: '', sending: false });
    }
  };

  const handleSendIdRequest = async (booking, adminMessage) => {
    setIdRequestModal(prev => ({ ...prev, sending: true }));
    try {
      const isRoomBooking = booking?.type === 'room';
      let apiBookingId = booking.id;
      if (booking.isMultiRoomGroup && booking.originalChildBookings?.length > 0) {
        apiBookingId = booking.originalChildBookings[0].id;
      }

      // Build proper roomTypesDisplay for email
      let roomTypesDisplayForEmail = '';
      if (booking.isExclusiveResortBooking) {
        roomTypesDisplayForEmail = booking.roomTypesDisplay || 'Entire Resort';
        if (booking.tentCount > 0 && !roomTypesDisplayForEmail.includes('Tent')) {
          roomTypesDisplayForEmail += ` + ${booking.tentCount} Tent(s)`;
        }
      } else if (booking.isMultiRoomGroup) {
        // Use existing display (already formatted as "2 × Room A, 1 × Room B")
        roomTypesDisplayForEmail = booking.roomTypesDisplay || '';
      } else {
        // Single booking (non-group)
        const roomQty = booking.numberOfRooms || 1;
        const roomType = booking.roomType || 'Room';
        roomTypesDisplayForEmail = `${roomQty} × ${roomType}`;
      }

      const response = await fetch('/api/admin/send-id-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: apiBookingId,
          type: isRoomBooking ? 'room' : 'daytour',
          adminMessage: adminMessage,
          roomTypesDisplay: roomTypesDisplayForEmail   // <-- added
        })
      });
      const data = await response.json();
      if (response.ok) {
        await logAdminAction({
          action: 'ID Request Sent',
          module: 'Reservations',
          details: `Sent ID request email for booking ${booking.bookingId} to ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName} (${booking.guestInfo?.email}). Message: ${adminMessage}`
        });
        showNotification(`ID request email sent to ${booking.guestInfo?.email}`, 'success');

        // Close the sidebar after successful send
        closeSidebar();
      } else {
        showNotification(data.error || 'Failed to send ID request', 'error');
      }
    } catch (error) {
      console.error('Error sending ID request:', error);
      showNotification('Failed to send ID request', 'error');
    } finally {
      setIdRequestModal({ show: false, booking: null, message: '', sending: false });
    }
  };

  const handleSavePaymentInfo = async () => {
    if (!sidebarBooking) return;
    setSavingPayment(true);
    try {
      const newBalance = parseFloat(tempBalance);
      if (isNaN(newBalance) || newBalance < 0) {
        showNotification('Please enter a valid balance amount.', 'error');
        setSavingPayment(false);
        return;
      }

      const downPayment = calculateDownPayment(sidebarBooking.totalPrice);
      const newTotalAmount = newBalance + downPayment;
      const updateData = {
        manualBalance: newBalance,
        adminNote: tempNote.trim() || null,
        manualTotalPrice: newTotalAmount,
        updatedAt: new Date().toISOString()
      };

      // Handle multi‑room groups
      if (sidebarBooking.isMultiRoomGroup && sidebarBooking.originalChildBookings) {
        for (const childBooking of sidebarBooking.originalChildBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, updateData);
        }
        // Update local sidebarBooking state for immediate UI feedback
        setSidebarBooking(prev => ({
          ...prev,
          manualBalance: newBalance,
          adminNote: tempNote.trim() || null,
          manualTotalPrice: newTotalAmount
        }));
      } else {
        const collectionName = sidebarBooking.type === 'room' ? 'bookings' : 'dayTourBookings';
        const bookingRef = doc(db, collectionName, sidebarBooking.id);
        await updateDoc(bookingRef, updateData);
        setSidebarBooking(prev => ({
          ...prev,
          manualBalance: newBalance,
          adminNote: tempNote.trim() || null,
          manualTotalPrice: newTotalAmount
        }));
      }

      await logAdminAction({
        action: 'Updated Payment Information',
        module: 'Reservations',
        details: `Updated balance to ₱${newBalance.toLocaleString()} and added note: ${tempNote || 'No note'} for booking ${sidebarBooking.bookingId}`
      });

      showNotification('Payment information updated successfully.', 'success');
      setEditingPayment(false);
    } catch (error) {
      console.error('Error saving payment info:', error);
      showNotification('Failed to update payment information.', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSaveNote = async () => {
  if (!sidebarBooking) return;
  setSavingNote(true);
  try {
    const updateData = {
      adminNote: tempNoteForEdit.trim() || null,
      updatedAt: new Date().toISOString()
    };

    // Handle multi‑room groups
    if (sidebarBooking.isMultiRoomGroup && sidebarBooking.originalChildBookings) {
      for (const child of sidebarBooking.originalChildBookings) {
        const bookingRef = doc(db, 'bookings', child.id);
        await updateDoc(bookingRef, updateData);
      }
      setSidebarBooking(prev => ({ ...prev, adminNote: tempNoteForEdit.trim() || null }));
    } else {
      const collectionName = sidebarBooking.type === 'room' ? 'bookings' : 'dayTourBookings';
      const bookingRef = doc(db, collectionName, sidebarBooking.id);
      await updateDoc(bookingRef, updateData);
      setSidebarBooking(prev => ({ ...prev, adminNote: tempNoteForEdit.trim() || null }));
    }

    await logAdminAction({
      action: 'Updated Note for Cancelled Booking',
      module: 'Reservations',
      details: `Updated note for ${sidebarBooking.isMultiRoomGroup ? 'multi-room' : ''} booking ${sidebarBooking.bookingId}: ${tempNoteForEdit || 'No note'}`
    });

    showNotification('Note updated successfully.', 'success');
    setEditingNote(false);
  } catch (error) {
    console.error('Error saving note:', error);
    showNotification('Failed to update note.', 'error');
  } finally {
    setSavingNote(false);
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
      setConfirmModal({ show: false, booking: null, type: '', note: '', loading: false });
      return;
    }

    setConfirmModal(prev => ({ ...prev, loading: true }));
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
        showNotification(`Day tour booking ${booking.bookingId} has been confirmed. A confirmation email has been sent to the guest.`, 'success');
      } else {
        console.warn('Failed to send day tour confirmation email:', emailResult.error);
        showNotification(`Day tour booking ${booking.bookingId} has been confirmed, but the confirmation email failed to send.`, 'error');
      }

      await logAdminAction({
        action: 'Confirmed Day Tour Reservation',
        module: 'Reservations',
        details: `Confirmed day tour booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Note: ${confirmModal.note || 'No note provided'}`
      });

      setShowPaymentModal(false);
      setConfirmModal({ show: false, booking: null, type: '', note: '', loading: false });
    } catch (error) {
      console.error('Error confirming day tour reservation:', error);
      showNotification('Failed to confirm reservation.', 'error');
      setConfirmModal(prev => ({ ...prev, loading: false }));
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
      setCancelModal({ show: false, booking: null, reason: '', loading: false });
      return;
    }

    setCancelModal(prev => ({ ...prev, loading: true }));
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
        showNotification(`Day tour booking ${booking.bookingId} has been cancelled. A cancellation email has been sent to the guest.`, 'success');
      } else {
        console.warn('Failed to send day tour cancellation email:', emailResult.error);
        showNotification(`Day tour booking ${booking.bookingId} has been cancelled, but the cancellation email failed to send.`, 'error');
      }

      await logAdminAction({
        action: 'Cancelled Day Tour Reservation',
        module: 'Reservations',
        details: `Cancelled day tour booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Reason: ${reason}`
      });

      setShowPaymentModal(false);
      setCancelModal({ show: false, booking: null, reason: '', loading: false });
    } catch (error) {
      console.error('Error cancelling day tour reservation:', error);
      showNotification('Failed to cancel reservation.', 'error');
      setCancelModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Confirm room reservation
  const handleConfirmReservation = async () => {
    const booking = confirmModal.booking;
    if (!booking) return;

    if (booking.status !== 'pending') {
      showNotification('This reservation is no longer pending.', 'error');
      setConfirmModal({ show: false, booking: null, type: '', note: '', loading: false });
      return;
    }

    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      if (booking.isMultiRoomGroup && booking.originalChildBookings) {
        // Update all child bookings
        for (const childBooking of booking.originalChildBookings) {
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
        showNotification(`Booking ${booking.bookingId} has been confirmed. A confirmation email has been sent to the guest.`, 'success');
      } else {
        console.warn('Failed to send confirmation email:', emailResult.error);
        showNotification(`Booking ${booking.bookingId} has been confirmed, but the confirmation email failed to send.`, 'error');
      }

      await logAdminAction({
        action: 'Confirmed Reservation',
        module: 'Reservations',
        details: `Confirmed ${booking.isMultiRoomGroup ? 'multi-room' : ''} booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Note: ${confirmModal.note || 'No note provided'}`
      });

      setShowPaymentModal(false);
      setConfirmModal({ show: false, booking: null, type: '', note: '', loading: false });
    } catch (error) {
      console.error('Error confirming reservation:', error);
      showNotification('Failed to confirm reservation.', 'error');
      setConfirmModal(prev => ({ ...prev, loading: false }));
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
      setCancelModal({ show: false, booking: null, reason: '', loading: false });
      return;
    }

    setCancelModal(prev => ({ ...prev, loading: true }));
    try {
      if (booking.isMultiRoomGroup && booking.originalChildBookings) {
        // Update all child bookings
        for (const childBooking of booking.originalChildBookings) {
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
        showNotification(`Booking ${booking.bookingId} has been cancelled. A cancellation email has been sent to the guest.`, 'success');
      } else {
        console.warn('Failed to send cancellation email:', emailResult.error);
        showNotification(`Booking ${booking.bookingId} has been cancelled, but the cancellation email failed to send.`, 'error');
      }

      await logAdminAction({
        action: 'Cancelled Reservation',
        module: 'Reservations',
        details: `Cancelled ${booking.isMultiRoomGroup ? 'multi-room' : ''} booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}. Reason: ${reason}`
      });

      setShowPaymentModal(false);
      setCancelModal({ show: false, booking: null, reason: '', loading: false });
    } catch (error) {
      console.error('Error cancelling reservation:', error);
      showNotification('Failed to cancel reservation.', 'error');
      setCancelModal(prev => ({ ...prev, loading: false }));
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
          module: 'Reservations',
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
  // For multi‑room groups, check the aggregated flags
  if (booking.refundNotificationSent || booking.moveDateNotificationSent) {
    return true;
  }
  return false;
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
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesSearch =
      (booking.roomType?.toLowerCase().includes(normalizedSearch) ||
        booking.roomTypesDisplay?.toLowerCase().includes(normalizedSearch) ||
        booking.guestInfo?.firstName?.toLowerCase().includes(normalizedSearch) ||
        booking.guestInfo?.lastName?.toLowerCase().includes(normalizedSearch) ||
        booking.bookingId?.toLowerCase().includes(normalizedSearch) ||
        booking.bookingIdDisplay?.toLowerCase().includes(normalizedSearch) ||
        (booking.isExclusiveResortBooking && 'entire resort'.includes(normalizedSearch)));

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

  // State for sidebar modal
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarBooking, setSidebarBooking] = useState(null);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  // Function to open sidebar
  const openSidebar = (booking) => {
    setSidebarBooking(booking);
    setIsSidebarOpen(true);
    setShowPaymentModal(false);
  };

  // Function to close sidebar
  const closeSidebar = () => {
    setIsSidebarOpen(false);
    setSidebarBooking(null);
  };

  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
            Reservations Management
          </h1>
          <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
            Manage all room and day tour reservations
          </p>
        </div>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
          }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle text-red-500' : 'fas fa-check-circle text-green-500'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="relative flex items-center mb-6 border-b border-[#4D8CF5]/20">
        <div className="relative flex w-full">

          {/* Sliding background */}
          <div
            className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
            style={{
              transform: `
          translateX(${activeTab === 'rooms' ? '0%' : '100%'})
          scale(0.98)
        `,
            }}
          />

          {/* Left Tab - Rooms */}
          <div className="flex-1 flex justify-center">
            <button
              ref={el => buttonRefs.current['rooms'] = el}
              onClick={() => setActiveTab('rooms')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${activeTab === 'rooms'
                ? 'text-[#1E3A8A]'
                : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
                }`}
            >
              <i className="fas fa-bed"></i>
              Rooms
            </button>
          </div>

          {/* Right Tab - Day Tour */}
          <div className="flex-1 flex justify-center">
            <button
              ref={el => buttonRefs.current['daytour'] = el}
              onClick={() => setActiveTab('daytour')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${activeTab === 'daytour'
                ? 'text-[#1E3A8A]'
                : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
                }`}
            >
              <i className="fas fa-sun"></i>
              Day Tour
            </button>
          </div>

        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative w-full group">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>

          <input
            type="text"
            placeholder={`Search by ${activeTab === 'rooms'
              ? 'room type, guest name, or booking ID'
              : 'guest name or booking ID'
              }...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-5 py-3 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
          />
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        {(activeTab === 'rooms' ? roomStatuses : dayTourStatuses).map((status) => {
          const isActive = statusFilter === status;
          
          // Icon and Color mapping
          const statusConfig = {
            all: { icon: 'fa-layer-group', active: 'bg-[#4D8CF5] shadow-blue-200', text: 'All' },
            pending: { icon: 'fa-clock', active: 'bg-yellow-500 shadow-yellow-200', text: 'Pending' },
            confirmed: { icon: 'fa-check-circle', active: 'bg-green-500 shadow-green-200', text: 'Confirmed' },
            'check-in': { icon: 'fa-door-open', active: 'bg-blue-500 shadow-blue-100', text: 'Check-In' },
            'check-out': { icon: 'fa-door-closed', active: 'bg-purple-500 shadow-purple-100', text: 'Check-Out' },
            completed: { icon: 'fa-calendar-check', active: 'bg-emerald-400 shadow-emerald-100', text: 'Completed' },
            cancelled: { icon: 'fa-times-circle', active: 'bg-red-500 shadow-red-200', text: 'Cancelled' },
            'cancelled-by-guest': { icon: 'fa-user-slash', active: 'bg-rose-500 shadow-rose-200', text: 'Cancelled By Guest' }
          };

          const config = statusConfig[status] || { icon: 'fa-filter', active: 'bg-[#4D8CF5]', text: status };

          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`group flex items-center gap-2.5 ${activeTab === 'daytour' ? 'px-4 sm:px-6' : 'px-3 sm:px-4'} py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 whitespace-nowrap active:scale-95 ${
                isActive
                  ? `${config.active} text-white shadow-md`
                  : 'bg-white border border-[#4D8CF5]/10 text-[#4D6FA8] hover:bg-[#4D8CF5]/5 hover:border-[#4D8CF5]/30 hover:text-[#3B78E7]'
              }`}
            >
              <i className={`fas ${config.icon} ${isActive ? 'text-white' : 'text-[#4D8CF5] opacity-70 group-hover:opacity-100'} transition-all duration-300 text-xs sm:text-sm`}></i>
              {config.text}
            </button>
          );
        })}
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
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guest Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Room Type(s)</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Rooms</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Check-in</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Check-out</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary min-w-[80px]">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booked On</th>
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
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{booking.bookingId}</span>
                              <span className={`text-xs font-medium ${booking.bookingIdDisplay === 'Single Room Type' ? 'text-blue-600' :
                                booking.bookingIdDisplay === 'Multi-Room Types' ? 'text-purple-600' :
                                  booking.bookingIdDisplay === 'Entire Resort' ? 'text-amber-600' :
                                    'text-gray-500'
                                }`}>
                                {booking.bookingIdDisplay}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-textPrimary text-xs">
                              {booking.guestInfo?.firstName} {booking.guestInfo?.lastName}
                            </div>
                            <div className="text-[10px] text-neutral">{booking.guestInfo?.email}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-xs text-textPrimary">
                              {booking.roomTypesDisplay || booking.roomType || 'N/A'}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-textSecondary">
                            {booking.totalRooms || (booking.isMultiRoomGroup ? booking.childBookings?.length || 0 : (booking.numberOfRooms || 1))}
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
                              <button
                                onClick={() => openSidebar(booking)}
                                className="w-8 h-8 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center justify-center"
                                title="View Details"
                              >
                                <i className="fas fa-eye text-sm"></i>
                              </button>
                              {booking.status === 'cancelled-by-guest' && (
                                <button
                                  onClick={() => {
                                    // Collect cancellation reason from child bookings if multi-room
                                    let reasonText = booking.cancellationReason || 'No reason provided';
                                    if (booking.isMultiRoomGroup && booking.originalChildBookings && booking.originalChildBookings.length > 0) {
                                      const firstChild = booking.originalChildBookings[0];
                                      reasonText = firstChild.cancellationReason || 'No reason provided';
                                    }
                                    setShowReasonModal({
                                      show: true,
                                      booking: booking,
                                      reason: reasonText,
                                      sending: false
                                    });
                                  }}
                                  className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] hover:bg-[#F59E0B] hover:text-white transition-all duration-200 flex items-center justify-center"
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
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guest Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Senior</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Adult</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Kid</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary min-w-[80px]">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booked On</th>
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
                              <button
                                onClick={() => openSidebar(tour)}
                                className="w-8 h-8 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center justify-center"
                                title="View Details"
                              >
                                <i className="fas fa-eye text-sm"></i>
                              </button>
                              {tour.status === 'cancelled-by-guest' && (
                                <button
                                  onClick={() => setShowReasonModal({
                                    show: true,
                                    booking: tour,
                                    reason: tour.cancellationReason || 'No reason provided',
                                    sending: false
                                  })}
                                  className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] hover:bg-[#F59E0B] hover:text-white transition-all duration-200 flex items-center justify-center"
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

      {/* Right Sidebar Modal for Booking Details */}
      {isSidebarOpen && sidebarBooking && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300"
            onClick={closeSidebar}
          />

          {/* Sidebar that slides in from right */}
          <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-white/50 backdrop-blur-xl border-l border-white/30 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>

            {/* Sidebar Header */}
            <div className="sticky top-0 bg-white/80 backdrop-blur-lg border-b border-[#4D8CF5]/10 px-6 py-4 flex justify-between items-center z-10 flex-shrink-0 shadow-sm">
              <div>
<h2 className="text-lg font-bold text-[#1E3A8A] leading-tight flex flex-col items-start gap-1">
  Booking Details 
  <span className="text-sm font-semibold text-[#4D8CF5]">{sidebarBooking.bookingId}</span>
</h2>
                {activeTab === 'rooms' && (
                  <p className="text-[#1E3A8A]/70 text-xs mt-1 font-medium">
                    {sidebarBooking.bookingIdDisplay || 'Single Room Type'}
                  </p>
                )}
              </div>
              <button
                onClick={closeSidebar}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-md border border-[#4D8CF5]/20 text-[#1E3A8A] shadow-sm transition-all duration-200 hover:bg-[#4D8CF5]/80 hover:text-white hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Guest Information */}
              <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-[#4D8CF5]/10 pb-2">
                  <i className="fas fa-user text-[#4D8CF5]"></i>
                  Guest Information
                </h3>
                <p className="text-sm font-medium text-[#1E3A8A]">
                  {sidebarBooking.guestInfo?.firstName} {sidebarBooking.guestInfo?.lastName}
                </p>
                <p className="text-xs text-[#1E3A8A]/70">{sidebarBooking.guestInfo?.email}</p>
                <p className="text-xs text-[#1E3A8A]/70">{sidebarBooking.guestInfo?.phone}</p>
              </div>

              {/* Room/Tour Details */}
              {activeTab === 'rooms' ? (
                <>
                  <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-[#4D8CF5]/10 pb-2">
                      <i className="fas fa-bed text-[#4D8CF5]"></i>
                      Room Details
                    </h3>
                    {sidebarBooking.isExclusiveResortBooking && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2 font-semibold">
                        Entire Resort Package: all room types are booked for this schedule.
                      </p>
                    )}
                    {/* Multi-Room Detailed Display - without guest counts */}
                    {sidebarBooking.isMultiRoomGroup && sidebarBooking.roomTypesArray && sidebarBooking.roomTypesArray.length > 0 ? (
                      <div className="space-y-1">
                        {sidebarBooking.roomTypesArray.map((room, idx) => (
                          <div key={idx} className="flex items-center text-sm">
                            <span className="text-[#1E3A8A]/70">{room.quantity} × {room.type}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">
                          <span className="text-[#1E3A8A]/70">Room Type:</span>{' '}
                          <span className="font-medium text-[#1E3A8A]">{sidebarBooking.roomType}</span>
                        </p>
                        <p className="text-sm mt-1">
                          <span className="text-[#1E3A8A]/70">Number of Rooms:</span>{' '}
                          <span className="font-medium text-[#1E3A8A]">{sidebarBooking.numberOfRooms || 1}</span>
                        </p>
                      </>
                    )}
                    {/* Added Total Rooms field */}
                    <p className="text-sm mt-2 pt-1 border-t border-[#4D8CF5]/20">
                      <span className="text-[#1E3A8A]/70">Total Rooms:</span>{' '}
                      <span className="font-medium text-[#1E3A8A]">{sidebarBooking.totalRooms || sidebarBooking.numberOfRooms || 1}</span>
                    </p>
                  </div>

                  <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-[#4D8CF5]/10 pb-2">
                      <i className="fas fa-calendar-alt text-[#4D8CF5]"></i>
                      Schedule
                    </h3>
                    <p className="text-sm">
                      <span className="text-[#1E3A8A]/70">Check-in:</span>{' '}
                      <span className="font-medium text-[#1E3A8A]">{formatDateWithTime(sidebarBooking.checkIn, 'check-in')}</span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-[#1E3A8A]/70">Check-out:</span>{' '}
                      <span className="font-medium text-[#1E3A8A]">{formatDateWithTime(sidebarBooking.checkOut, 'check-out')}</span>
                    </p>
                  </div>

                  {/* Guest Count Container for ALL room bookings */}
                  <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-[#4D8CF5]/10 pb-2">
                      <i className="fas fa-users text-[#4D8CF5]"></i>
                      Guest Count
                    </h3>

                    {sidebarBooking.isExclusiveResortBooking ? (
                      // Exclusive booking guest display
                      <>
                        <p className="text-sm">
                          <span className="text-[#1E3A8A]/70">Adults:</span>{' '}
                          <span className="font-medium text-[#1E3A8A]">{sidebarBooking.exclusiveAdults || 0}</span>
                        </p>
                        <p className="text-sm mt-1">
                          <span className="text-[#1E3A8A]/70">Kids:</span>{' '}
                          <span className="font-medium text-[#1E3A8A]">{sidebarBooking.exclusiveKids || 0}</span>
                        </p>
                        <p className="text-sm mt-1 pt-2 border-t border-[#4D8CF5]/20">
                          <span className="font-semibold text-[#1E3A8A]">Total Guests:</span>{' '}
                          <span className="font-bold text-[#1E3A8A]">{sidebarBooking.exclusiveTotalGuests || (sidebarBooking.exclusiveAdults + sidebarBooking.exclusiveKids)}</span>
                        </p>
                      </>
                    ) : sidebarBooking.isMultiRoomGroup && sidebarBooking.childBookings && sidebarBooking.childBookings.length > 0 ? (
                      // Multi-room booking - display each room type with Adults | Kids format (without quantity prefix)
                      <div className="space-y-2">
                        {sidebarBooking.childBookings.map((child, idx) => {
                          // Find the matching room type in roomTypesArray to get quantity
                          const roomTypeInfo = sidebarBooking.roomTypesArray?.find(r => r.type === child.roomType);
                          const quantity = roomTypeInfo?.quantity || 1;
                          return (
                            <div key={idx} className="border-b border-[#4D8CF5]/10 last:border-b-0 pb-2 last:pb-0">
                              <p className="text-xs font-medium text-[#1E3A8A]">{child.roomType} — Adults: {child.adults || child.guests || 1} | Kids: {child.kids || 0}</p>
                            </div>
                          );
                        })}
                        <div className="pt-2 mt-1 border-t border-[#4D8CF5]/20">
                          <p className="text-sm">
                            <span className="font-semibold text-[#1E3A8A]">Total Guests:</span>{' '}
                            <span className="font-bold text-[#1E3A8A]">{sidebarBooking.totalGuests || 0}</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      // Single room booking - display adults and kids from the booking
                      <div>
                        <p className="text-sm">
                          <span className="text-[#1E3A8A]/70">Adults:</span>{' '}
                          <span className="font-medium text-[#1E3A8A]">{sidebarBooking.adults || sidebarBooking.guests || 1}</span>
                        </p>
                        <p className="text-sm mt-1">
                          <span className="text-[#1E3A8A]/70">Kids:</span>{' '}
                          <span className="font-medium text-[#1E3A8A]">{sidebarBooking.kids || 0}</span>
                        </p>
                        <p className="text-sm mt-1 pt-2 border-t border-[#4D8CF5]/20">
                          <span className="font-semibold text-[#1E3A8A]">Total Guests:</span>{' '}
                          <span className="font-bold text-[#1E3A8A]">{sidebarBooking.guests || (sidebarBooking.adults + sidebarBooking.kids) || 1}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                // Day tour booking - guest count already displayed in Tour Details section
                <>
                  <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                    <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-[#4D8CF5]/10 pb-2">
                      <i className="fas fa-sun text-[#4D8CF5]"></i>
                      Tour Details
                    </h3>
                    <p className="text-sm">
                      <span className="text-[#1E3A8A]/70">Tour Date:</span>{' '}
                      <span className="font-medium text-[#1E3A8A]">{formatDateOnly(sidebarBooking.selectedDate)}</span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-[#1E3A8A]/70">Guest Breakdown:</span>{' '}
                      <span className="font-medium text-[#1E3A8A]"> Senior: {sidebarBooking.seniors || 0} | Adult: {sidebarBooking.adults || 0} | Kid: {sidebarBooking.kids || 0} </span>
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-[#1E3A8A]/70">Total Guests:</span>{' '}
                      <span className="font-medium text-[#1E3A8A]">{getTotalGuests(sidebarBooking)}</span>
                    </p>
                  </div>
                </>
              )}

              {/* Payment Information */}
 <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
  <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#4D8CF5]/10">
    <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide flex items-center gap-2">
      <i className="fas fa-credit-card text-[#4D8CF5]"></i>
      Payment Information
    </h3>
    {(() => {
      const isCancelled = ['cancelled', 'cancelled-by-guest'].includes(sidebarBooking.status);
      // Regular balance editing for check-in/completed (existing logic)
      let balanceEditable = false;
      if (activeTab === 'rooms') {
        balanceEditable = ['check-in', 'check-out', 'completed'].includes(sidebarBooking.status);
      } else {
        balanceEditable = ['check-in', 'completed'].includes(sidebarBooking.status);
      }

      if (isCancelled && !editingNote && !editingPayment) {
        return (
          <button
            onClick={() => {
              setTempNoteForEdit(sidebarBooking.adminNote || '');
              setEditingNote(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#4D8CF5]/10 text-[#4D8CF5] hover:bg-[#4D8CF5] hover:text-white transition-all duration-200 text-[10px] font-bold uppercase tracking-wider shadow-sm active:scale-95"
          >
            <i className="fas fa-edit"></i> Add Note
          </button>
        );
      }
      if (balanceEditable && !editingPayment) {
        return (
          <button
            onClick={() => {
              const currentBalance = sidebarBooking.manualBalance ?? (() => {
                const total = Number(sidebarBooking.totalPrice) || 0;
                const down = total * 0.5;
                if (sidebarBooking.status === 'cancelled' || sidebarBooking.status === 'check-out' || sidebarBooking.status === 'completed') return 0;
                if (sidebarBooking.status === 'cancelled-by-guest' && (sidebarBooking.refundNotificationSent || sidebarBooking.moveDateNotificationSent)) return 0;
                return down;
              })();
              setTempBalance(currentBalance.toString());
              setTempNote(sidebarBooking.adminNote || '');
              setEditingPayment(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#4D8CF5]/10 text-[#4D8CF5] hover:bg-[#4D8CF5] hover:text-white transition-all duration-200 text-[10px] font-bold uppercase tracking-wider shadow-sm active:scale-95"
          >
            <i className="fas fa-edit"></i> Edit Balance
          </button>
        );
      }
      return null;
    })()}
  </div>

  {/* Edit Note Mode (for cancelled bookings) */}
  {editingNote && (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[#1E3A8A]/70 mb-1">Note:</label>
        <textarea
          value={tempNoteForEdit}
          onChange={(e) => setTempNoteForEdit(e.target.value)}
          rows={3}
          placeholder="Add internal note about this booking..."
          className="w-full px-2 py-1.5 text-sm border border-[#4D8CF5]/30 rounded-lg focus:outline-none focus:border-ocean-mid resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setEditingNote(false)}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveNote}
          disabled={savingNote}
          className="px-3 py-1.5 text-xs rounded-lg bg-ocean-mid text-white hover:bg-ocean-dark disabled:opacity-50"
        >
          {savingNote ? 'Saving...' : 'Save Note'}
        </button>
      </div>
    </div>
  )}

  {/* Existing Balance Edit Mode (unchanged) */}
  {!editingNote && editingPayment && (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-[#1E3A8A]/70 mb-1">Balance (₱)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={tempBalance}
          onChange={(e) => setTempBalance(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-[#4D8CF5]/30 rounded-lg focus:outline-none focus:border-ocean-mid"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[#1E3A8A]/70 mb-1">Admin Note</label>
        <textarea
          value={tempNote}
          onChange={(e) => setTempNote(e.target.value)}
          rows={2}
          placeholder="Add internal note about payment adjustments..."
          className="w-full px-2 py-1.5 text-sm border border-[#4D8CF5]/30 rounded-lg focus:outline-none focus:border-ocean-mid resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditingPayment(false)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100">Cancel</button>
        <button onClick={handleSavePaymentInfo} disabled={savingPayment} className="px-3 py-1.5 text-xs rounded-lg bg-ocean-mid text-white hover:bg-ocean-dark disabled:opacity-50">
          {savingPayment ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )}



  {/* Display Mode */}
  {!editingNote && !editingPayment && (
    <div className="space-y-3">
      {(() => {
     const isCancelled = ['cancelled', 'cancelled-by-guest'].includes(sidebarBooking.status);
let downPayment, totalAmount;

if (isCancelled) {
  // For cancelled: Total = Down Payment (balance = 0)
  if (sidebarBooking.manualDownPayment !== undefined && sidebarBooking.manualDownPayment !== null) {
    downPayment = sidebarBooking.manualDownPayment;
  } else {
    const originalTotal = Number(sidebarBooking.totalPrice) || 0;
    downPayment = originalTotal * 0.5;
  }
  totalAmount = downPayment; // Total = Down + 0
} else {
  // Non-cancelled bookings: use existing logic (balance editing, etc.)
  if (sidebarBooking.manualTotalPrice !== undefined && sidebarBooking.manualTotalPrice !== null) {
    totalAmount = sidebarBooking.manualTotalPrice;
    downPayment = totalAmount * 0.5;
  } else {
    const originalTotal = Number(sidebarBooking.totalPrice) || 0;
    totalAmount = originalTotal;
    downPayment = originalTotal * 0.5;
  }
}
const balance = isCancelled ? 0 : (sidebarBooking.manualBalance !== undefined ? sidebarBooking.manualBalance : downPayment);

        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
              <p className="text-xs text-[#1E3A8A]/70 mb-1">Total Amount</p>
              <p className="font-bold text-[#1E3A8A] text-lg">₱{totalAmount.toLocaleString()}</p>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
              <p className="text-xs text-[#1E3A8A]/70 mb-1">Balance</p>
              <p className="font-bold text-[#1E3A8A] text-lg">₱{balance.toLocaleString()}</p>
            </div>
            <div className="col-span-2 flex justify-between items-center bg-gray-50/80 p-3 rounded-lg border border-gray-100">
              <p className="text-sm">
                <span className="text-[#1E3A8A]/70">50% Down:</span>{' '}
                <span className="font-bold text-amber-600">₱{downPayment.toLocaleString()}</span>
              </p>
              <p className="text-sm flex items-center">
                <span className="text-[#1E3A8A]/70 mr-2">Status:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(sidebarBooking.status)}`}>
                  {sidebarBooking.status?.charAt(0).toUpperCase() + sidebarBooking.status?.slice(1)}
                </span>
              </p>
            </div>
            {sidebarBooking.adminNote && (
              <div className="col-span-2 mt-1">
                <p className="text-xs p-2 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                  <span className="font-medium">Note:</span> {sidebarBooking.adminNote}
                </p>
              </div>
            )}
          </div>
        );
      })()}
      
      {/* Confirm Check-In Button - Relocated to bottom right */}
      {sidebarBooking.status === 'confirmed' && (
        <div className="flex justify-end mt-2">
          <button
            onClick={() => setCheckInConfirmModal({ show: true, booking: sidebarBooking, loading: false })}
            disabled={actionLoading[sidebarBooking.id]}
            className="px-4 py-1.5 rounded-lg border border-[#7AAAF8]/20 bg-[#7AAAF8]/10 text-[#1E3A8A] text-xs hover:bg-[#4D8CF5]/80 hover:text-white transition-all duration-200 shadow-sm flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:bg-gray-400">
            {actionLoading[sidebarBooking.id] ? (
              <><i className="fas fa-spinner fa-spin text-xs"></i> Processing...</>
            ) : (
              <><i className="fas fa-door-open text-xs"></i> Confirm Check-In</>
            )}
          </button>
        </div>
      )}


    </div>
  )}
</div>

              {/* Payment Proof Image - Clickable */}
              {(sidebarBooking.paymentProof || sidebarBooking.paymentProofUrl) && (
                <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                  <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-[#4D8CF5]/10 pb-2">
                    <i className="fas fa-receipt text-[#4D8CF5]"></i>
                    Payment Proof
                  </h3>
                  <div
                    className="relative bg-gray-50 rounded-xl border border-gray-100 overflow-hidden cursor-pointer group transition-all duration-300 hover:shadow-md"
                    onClick={() => setImageZoomModal({ show: true, imageUrl: sidebarBooking.paymentProof || sidebarBooking.paymentProofUrl, title: 'Payment Proof' })}
                  >
                    <img
                      src={sidebarBooking.paymentProof || sidebarBooking.paymentProofUrl}
                      alt="Payment Proof"
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        console.error('Error loading image:', e);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="p-6 text-center"><i class="fas fa-image text-3xl text-gray-400 mb-2 block"></i><p class="text-sm text-gray-500">Error loading payment proof image</p></div>';
                      }}
                    />
                    <div className="absolute inset-0 bg-[#1E3A8A]/0 group-hover:bg-[#1E3A8A]/20 transition-all duration-300 flex items-center justify-center">
                      <i className="fas fa-search-plus text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-50 group-hover:scale-100"></i>
                    </div>
                  </div>
                </div>
              )}

              {/* Valid ID - Clickable */}
              {(sidebarBooking.validIdImage || sidebarBooking.validIdUrl) && (
                <div className="bg-white/70 backdrop-blur-md border border-[#4D8CF5]/10 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#4D8CF5]/10">
                    <h3 className="text-xs font-semibold text-[#1E3A8A] uppercase tracking-wide flex items-center gap-2">
                      <i className="fas fa-id-card text-[#4D8CF5]"></i>
                      Valid ID
                    </h3>
                    {sidebarBooking.validIdType && (
                      <span className="text-[10px] font-semibold bg-[#4D8CF5]/10 text-[#1E3A8A] px-2 py-1 rounded-md">
                        {sidebarBooking.validIdType}
                      </span>
                    )}
                  </div>
                  <div
                    className="relative bg-gray-50 rounded-xl border border-gray-100 overflow-hidden cursor-pointer group transition-all duration-300 hover:shadow-md"
                    onClick={() => setImageZoomModal({ show: true, imageUrl: sidebarBooking.validIdImage || sidebarBooking.validIdUrl, title: `Valid ID - ${sidebarBooking.validIdType || 'ID'}` })}
                  >
                    <img
                      src={sidebarBooking.validIdImage || sidebarBooking.validIdUrl}
                      alt="Valid ID"
                      className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        console.error('Error loading valid ID image:', e);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="p-6 text-center"><i class="fas fa-id-card text-3xl text-gray-400 mb-2 block"></i><p class="text-sm text-gray-500">Error loading valid ID image</p></div>';
                      }}
                    />
                    <div className="absolute inset-0 bg-[#1E3A8A]/0 group-hover:bg-[#1E3A8A]/20 transition-all duration-300 flex items-center justify-center">
                      <i className="fas fa-search-plus text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-50 group-hover:scale-100"></i>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Request */}
              <div className="bg-amber-50/70 backdrop-blur-md border border-amber-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2 border-b border-amber-200/50 pb-2">
                  <i className="fas fa-comment-alt text-amber-600"></i>
                  Special Request
                </h3>
                {sidebarBooking.specialRequest ? (
                  <p className="text-sm text-amber-800">{sidebarBooking.specialRequest}</p>
                ) : (
                  <p className="text-sm text-amber-600 italic">No special requests from guest</p>
                )}
              </div>
            </div>

            {/* Fixed Footer with Confirm and Cancel buttons */}
            <div className="sticky bottom-0 bg-white/80 backdrop-blur-lg border-t border-[#4D8CF5]/10 px-5 py-2.5 flex gap-2 justify-end flex-shrink-0">
              {!['cancelled', 'cancelled-by-guest', 'confirmed', 'check-in', 'check-out', 'completed'].includes(sidebarBooking.status) && (
                <button
                  onClick={() => setIdRequestModal({ show: true, booking: sidebarBooking, message: '', sending: false })}
                  className="px-3.5 py-2.5 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-200 flex items-center gap-1.5 text-xs font-medium"
                >
                  <i className="fas fa-id-card text-[10px]"></i> Send ID Request
                </button>
              )}
              {sidebarBooking.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      closeSidebar();
                      setConfirmModal({ show: true, booking: sidebarBooking, type: activeTab === 'rooms' ? 'room' : 'daytour', note: '', loading: false });
                    }}
                    disabled={actionLoading[sidebarBooking.id] || confirmModal.loading}
                    className="px-3.5 py-2.5 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {confirmModal.loading ? (
                      <><i className="fas fa-spinner fa-spin text-[10px]"></i> Processing...</>
                    ) : (
                      <><i className="fas fa-check text-[10px]"></i> Confirm</>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      closeSidebar();
                      setCancelModal({ show: true, booking: sidebarBooking, reason: '', loading: false });
                    }}
                    disabled={actionLoading[sidebarBooking.id] || cancelModal.loading}
                    className="px-3.5 py-2.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {cancelModal.loading ? (
                      <><i className="fas fa-spinner fa-spin text-[10px]"></i> Processing...</>
                    ) : (
                      <><i className="fas fa-times text-[10px]"></i> Cancel</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Original Payment Modal - Kept for backward compatibility but hidden via CSS when sidebar is open */}
      {showPaymentModal && selectedBooking && !isSidebarOpen && (
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
                    {selectedBooking.isExclusiveResortBooking && (
                      <>
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2 font-semibold">
                          Entire Resort Package: all room types are booked for this schedule.
                        </p>
                        {selectedBooking.tentCount > 0 && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2 font-semibold">
                            Tents Added: {selectedBooking.tentCount} tent(s)
                          </p>
                        )}
                      </>
                    )}

                    {/* Multi-Room Detailed Display - without guest counts */}
                    {selectedBooking.isMultiRoomGroup && selectedBooking.roomTypesArray && selectedBooking.roomTypesArray.length > 0 ? (
                      <div className="space-y-1">
                        {selectedBooking.roomTypesArray.map((room, idx) => (
                          <div key={idx} className="flex items-center text-sm">
                            <span className="text-textSecondary">{room.quantity} × {room.type}</span>
                          </div>
                        ))}
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
                      </>
                    )}
                  </div>

                  {/* Guest Count Display for Exclusive Booking - reflects exact values from multi-room-booking */}
                  {selectedBooking.isExclusiveResortBooking && (
                    <div className="bg-ocean-ice rounded-lg p-3">
                      <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Guest Count</h3>
                      <p className="text-sm">
                        <span className="text-textSecondary">Adults:</span>{' '}
                        <span className="font-medium text-textPrimary">{selectedBooking.exclusiveAdults || 0}</span>
                      </p>
                      <p className="text-sm mt-1">
                        <span className="text-textSecondary">Kids:</span>{' '}
                        <span className="font-medium text-textPrimary">{selectedBooking.exclusiveKids || 0}</span>
                      </p>
                      <p className="text-sm mt-1 pt-2 border-t border-ocean-light/20">
                        <span className="font-semibold text-textPrimary">Total Guests:</span>{' '}
                        <span className="font-bold text-ocean-mid">{selectedBooking.exclusiveTotalGuests || (selectedBooking.exclusiveAdults + selectedBooking.exclusiveKids)}</span>
                      </p>
                    </div>
                  )}

                  {/* Guest Count for Non-Exclusive Single/Multi Room */}
                  {!selectedBooking.isExclusiveResortBooking && (
                    <div className="bg-ocean-ice rounded-lg p-3">
                      <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2">Guest Count</h3>
                      {selectedBooking.isMultiRoomGroup && selectedBooking.childBookings && selectedBooking.childBookings.length > 0 ? (
                        <div className="space-y-2">
                          {selectedBooking.childBookings.map((child, idx) => {
                            const roomTypeInfo = selectedBooking.roomTypesArray?.find(r => r.type === child.roomType);
                            const quantity = roomTypeInfo?.quantity || 1;
                            return (
                              <div key={idx} className="border-b border-ocean-light/20 last:border-b-0 pb-2 last:pb-0">
                                <p className="text-xs font-medium text-textPrimary">{quantity} × {child.roomType}</p>
                                <div className="flex gap-3 mt-1 text-xs">
                                  <span className="text-textSecondary">Adults: <span className="font-medium text-textPrimary">{child.adults || child.guests || 1}</span></span>
                                  <span className="text-textSecondary">Kids: <span className="font-medium text-textPrimary">{child.kids || 0}</span></span>
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-2 mt-1 border-t border-ocean-light/20">
                            <p className="text-sm">
                              <span className="font-semibold text-textPrimary">Total Guests:</span>{' '}
                              <span className="font-bold text-ocean-mid">{selectedBooking.totalGuests || 0}</span>
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm">
                            <span className="text-textSecondary">Adults:</span>{' '}
                            <span className="font-medium text-textPrimary">{selectedBooking.adults || selectedBooking.guests || 1}</span>
                          </p>
                          <p className="text-sm mt-1">
                            <span className="text-textSecondary">Kids:</span>{' '}
                            <span className="font-medium text-textPrimary">{selectedBooking.kids || 0}</span>
                          </p>
                          <p className="text-sm mt-1 pt-2 border-t border-ocean-light/20">
                            <span className="font-semibold text-textPrimary">Total Guests:</span>{' '}
                            <span className="font-bold text-ocean-mid">{selectedBooking.guests || (selectedBooking.adults + selectedBooking.kids) || 1}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}

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

            {/* Footer Actions with loading states */}
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
                      setConfirmModal({ show: true, booking: selectedBooking, type: activeTab === 'rooms' ? 'room' : 'daytour', note: '', loading: false });
                    }}
                    disabled={actionLoading[selectedBooking.id] || confirmModal.loading}
                    className="px-4 py-1.5 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white text-sm font-medium hover:shadow-lg transition-all duration-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    {confirmModal.loading ? (
                      <><i className="fas fa-spinner fa-spin text-xs"></i> Processing...</>
                    ) : (
                      <><i className="fas fa-check text-xs"></i> Confirm</>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setCancelModal({ show: true, booking: selectedBooking, reason: '', loading: false });
                    }}
                    disabled={actionLoading[selectedBooking.id] || cancelModal.loading}
                    className="px-4 py-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-lg text-white text-sm font-medium hover:shadow-lg transition-all duration-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    {cancelModal.loading ? (
                      <><i className="fas fa-spinner fa-spin text-xs"></i> Processing...</>
                    ) : (
                      <><i className="fas fa-times text-xs"></i> Cancel</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal - Minimalist */}
      {imageZoomModal.show && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-6"
          style={{ zIndex: 9999 }}
          onClick={() => setImageZoomModal({ show: false, imageUrl: '', title: '' })}
        >
          {/* Close button */}
          <button
            onClick={() => setImageZoomModal({ show: false, imageUrl: '', title: '' })}
            className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200"
          >
            <i className="fas fa-times text-lg"></i>
          </button>

          {/* Image container */}
          <div className="flex flex-col items-center gap-3 max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-white/50 text-[11px] font-medium uppercase tracking-widest">{imageZoomModal.title}</p>
            <img
              src={imageZoomModal.imageUrl}
              alt={imageZoomModal.title}
              className="max-w-full max-h-[82vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Confirm Reservation Modal with Note Field and Loading State */}
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
                  {confirmModal.type === 'room' && confirmModal.booking.isExclusiveResortBooking && (
                    <><br />Entire Resort Booking (All Room Types)</>
                  )}
                  {confirmModal.type === 'room' && confirmModal.booking.isMultiRoomGroup && !confirmModal.booking.isExclusiveResortBooking && (
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
                onClick={() => setConfirmModal({ show: false, booking: null, type: '', note: '', loading: false })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.type === 'room' ? handleConfirmReservation : handleConfirmDayTourReservation}
                disabled={confirmModal.loading}
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {confirmModal.loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Confirming...</>
                ) : (
                  'Confirm Reservation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reservation Modal with Loading State */}
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
                This reason will be included in the confirmation email sent to the guest.
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setCancelModal({ show: false, booking: null, reason: '', loading: false })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Go Back
              </button>
              <button
                onClick={activeTab === 'rooms' ? handleCancelReservation : handleCancelDayTourReservation}
                disabled={!cancelModal.reason.trim() || cancelModal.loading}
                className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2"
              >
                {cancelModal.loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Cancelling...</>
                ) : (
                  'Cancel Reservation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Notification Confirmation Modal with Loading State */}
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
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {refundModal.sending ? (
                  <><i className="fas fa-spinner fa-spin"></i> Sending...</>
                ) : (
                  <><i className="fas fa-paper-plane"></i> Send Email</>
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
                className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 flex items-center gap-2 ${isNotificationDisabled(showReasonModal.booking)
                  ? 'bg-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-green-500 to-green-600 hover:shadow-lg hover:-translate-y-0.5'
                  }`}
                title={isNotificationDisabled(showReasonModal.booking) ? "Notification already sent" : ""}
              >
                <i className="fas fa-dollar-sign mr-1"></i>
                Notify Guest
              </button>
              <button
                onClick={() => setMoveDateConfirmModal({ show: true, booking: showReasonModal.booking, message: '', sending: false })}
                disabled={isNotificationDisabled(showReasonModal.booking)}
                className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 flex items-center gap-2 ${isNotificationDisabled(showReasonModal.booking)
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

      {/* ID Request Confirmation Modal with Message Field */}
      {idRequestModal.show && idRequestModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="fas fa-id-card text-blue-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Send ID Request</h3>
              <p className="text-textSecondary text-sm">
                Send an email to <strong>{idRequestModal.booking.guestInfo?.firstName} {idRequestModal.booking.guestInfo?.lastName}</strong><br />
                requesting them to resend their valid ID.
              </p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-textPrimary mb-2">
                Message to Guest (Optional)
              </label>
              <textarea
                value={idRequestModal.message}
                onChange={(e) => setIdRequestModal(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Add a custom message to include in the email (e.g., 'Please ensure the ID is clear and not blurred.')"
                rows="3"
                className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200 transition-all duration-300 bg-white resize-none"
              ></textarea>
              <p className="text-xs text-textSecondary mt-1">
                This message will be included in the email sent to the guest.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setIdRequestModal({ show: false, booking: null, message: '', sending: false })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                disabled={idRequestModal.sending}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendIdRequest(idRequestModal.booking, idRequestModal.message)}
                disabled={idRequestModal.sending}
                className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {idRequestModal.sending ? (
                  <><i className="fas fa-spinner fa-spin"></i> Sending...</>
                ) : (
                  <><i className="fas fa-paper-plane"></i> Send ID Request</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal with Loading State */}
      {refundConfirmModal.show && refundConfirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-yellow-100 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-yellow-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Send Non-Refundable Payment Notice</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to send a non-refundable payment notice to{" "}
                <strong>{refundConfirmModal.booking.guestInfo?.firstName} {refundConfirmModal.booking.guestInfo?.lastName}</strong>?
              </p>
              <p className="text-xs text-neutral mt-2">
                This will send an email regarding the cancellation and non-refundable down payment.
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
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {refundConfirmModal.sending ? (
                  <><i className="fas fa-spinner fa-spin"></i> Sending...</>
                ) : (
                  <><i className="fas fa-check"></i> Yes, Send Refund Notification</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Check-In Modal */}
      {checkInConfirmModal.show && checkInConfirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="fas fa-door-open text-blue-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Confirm Check-In</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to confirm check-in for{" "}
                <strong>{checkInConfirmModal.booking.guestInfo?.firstName} {checkInConfirmModal.booking.guestInfo?.lastName}</strong>?
              </p>
              <p className="text-xs text-neutral mt-2">
                Booking ID: {checkInConfirmModal.booking.bookingId}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setCheckInConfirmModal({ show: false, booking: null, loading: false })}
                className="px-4 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                disabled={checkInConfirmModal.loading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCheckIn}
                disabled={checkInConfirmModal.loading}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {checkInConfirmModal.loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                ) : (
                  <><i className="fas fa-check"></i> Yes, Confirm Check-In</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Date Confirmation Modal with Loading State */}
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
            <div className="mb-5">
              <label className="block text-sm font-semibold text-textPrimary mb-2">
                Message to Guest (Optional)
              </label>
              <textarea
                value={moveDateConfirmModal.message}
                onChange={(e) => setMoveDateConfirmModal(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Add a custom message to include in the email (e.g., 'We have updated your reservation dates as requested.')"
                rows="3"
                className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200 transition-all duration-300 bg-white resize-none"
              ></textarea>
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
                onClick={() => handleMoveDateNotify(moveDateConfirmModal.booking, moveDateConfirmModal.message)}
                disabled={moveDateConfirmModal.sending}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {moveDateConfirmModal.sending ? (
                  <><i className="fas fa-spinner fa-spin"></i> Sending...</>
                ) : (
                  <><i className="fas fa-check"></i> Yes, Send Move Date Notification</>
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