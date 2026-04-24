// components/admin/notificationService.js
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, writeBatch, getDocs, doc, where } from 'firebase/firestore';

export const asDate = (value) => {
  if (!value) return new Date(0);
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};

// Helper function to format date for display
const formatDateForDisplay = (dateValue) => {
  if (!dateValue) return 'N/A';
  try {
    let date;
    if (dateValue && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate();
    } else if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
      date = new Date(dateValue.seconds * 1000);
    } else {
      date = new Date(dateValue);
    }
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'N/A';
  }
};

// Helper function to format date with time for display
const formatDateTimeForDisplay = (dateValue) => {
  if (!dateValue) return 'N/A';
  try {
    let date;
    if (dateValue && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate();
    } else if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
      date = new Date(dateValue.seconds * 1000);
    } else {
      date = new Date(dateValue);
    }
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date with time:', error);
    return 'N/A';
  }
};

// Helper function to determine room type display for notifications
// Returns: 'Single Room Type', 'Multi-Room Types', or 'Entire Resort'
const getRoomTypeDisplay = (bookingData) => {
  // Check for Entire Resort Package
  if (bookingData.isExclusiveResortBooking === true) {
    return 'Entire Resort';
  }
  
  // Check if this is part of a multi-room booking (has parentBookingId)
  if (bookingData.isMultiRoomBooking && bookingData.parentBookingId) {
    // This is a child of a multi-room booking - we'll let the parent handle it
    return null;
  }
  
  // Check if this is a multi-room group (has multiple room types)
  if (bookingData.roomTypes && Array.isArray(bookingData.roomTypes) && bookingData.roomTypes.length > 1) {
    return 'Multi-Room Types';
  }
  
  // Check via roomTypesArray
  if (bookingData.roomTypesArray && Array.isArray(bookingData.roomTypesArray) && bookingData.roomTypesArray.length > 1) {
    return 'Multi-Room Types';
  }
  
  // Single room type
  return 'Single Room Type';
};

const normalizeStatus = (status) => {
  if (!status) return '';
  return String(status).trim().toLowerCase().replace(/[_\s]+/g, '-');
};

const getRoomStatusBookingKey = (docId, data) => {
  return data.parentBookingId || data.bookingId || docId;
};

const getDayTourGuestCount = (data) => {
  if (typeof data.totalGuests === 'number') return data.totalGuests;
  if (typeof data.guests === 'number') return data.guests;
  return 1;
};

// Store generated notifications to prevent duplicates and keep them visible
let generatedRoomCheckIns = new Map();
let generatedRoomCheckOuts = new Map();
let generatedDayTourCheckIns = new Map();

// Set up listener for room check-in and check-out status changes
export const setupRoomStatusListener = (onUpdate) => {
  const bookingsRef = collection(db, 'bookings');
  const dayTourRef = collection(db, 'dayTourBookings');
  const roomQuery = query(bookingsRef, orderBy('createdAt', 'desc'));
  const dayTourQuery = query(dayTourRef, orderBy('createdAt', 'desc'));

  const emitStatusUpdates = () => {
    const allCheckIns = [...Array.from(generatedRoomCheckIns.values()), ...Array.from(generatedDayTourCheckIns.values())];
    const allCheckOuts = Array.from(generatedRoomCheckOuts.values());
    onUpdate(allCheckIns, 'check_in');
    onUpdate(allCheckOuts, 'check_out');
  };

  const unsubscribeRoom = onSnapshot(roomQuery, (querySnapshot) => {
    const now = new Date();
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.type !== 'room') return;

      const status = normalizeStatus(data.status);
      const bookingKey = getRoomStatusBookingKey(docSnap.id, data);
      const roomTypeDisplay = getRoomTypeDisplay(data);
      const multiRoomDisplay = data.isExclusiveResortBooking ? 'Entire Resort' : 'Multi-Room Types';
      const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
      
      // Parse check-in date for 1-hour early trigger
      let checkInDate = null;
      if (data.checkIn) {
        if (data.checkIn && typeof data.checkIn.toDate === 'function') {
          checkInDate = data.checkIn.toDate();
        } else if (data.checkIn && typeof data.checkIn === 'object' && data.checkIn.seconds) {
          checkInDate = new Date(data.checkIn.seconds * 1000);
        } else {
          checkInDate = new Date(data.checkIn);
        }
      }
      
      // Set check-in time to 2:00 PM (14:00)
      if (checkInDate && !isNaN(checkInDate.getTime())) {
        checkInDate.setHours(14, 0, 0, 0);
      }
      
      // Calculate 1 hour before check-in
      const oneHourBeforeCheckIn = checkInDate ? new Date(checkInDate.getTime() - 60 * 60 * 1000) : null;
      
      // Check if we should show check-in notification (1 hour before OR status is 'check-in')
      let shouldShowCheckIn = false;
      let checkInReason = '';
      
      if (status === 'check-in') {
        shouldShowCheckIn = true;
        checkInReason = 'status';
      } else if (oneHourBeforeCheckIn && now >= oneHourBeforeCheckIn && now < checkInDate) {
        shouldShowCheckIn = true;
        checkInReason = 'early';
      }
      
      // Handle check-in notification (remains visible, only marked as read)
      if (shouldShowCheckIn && !generatedRoomCheckIns.has(bookingKey)) {
        generatedRoomCheckIns.set(bookingKey, {
          id: `${bookingKey}_checkin`,
          type: 'check_in',
          guestName,
          bookingId: bookingKey,
          roomType: (data.isMultiRoomBooking && data.parentBookingId) ? multiRoomDisplay : (roomTypeDisplay || 'Single Room Type'),
          eventDate: formatDateTimeForDisplay(data.checkIn),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          read: false,
          isMultiRoom: !!(data.isMultiRoomBooking && data.parentBookingId),
          isEarlyTrigger: checkInReason === 'early'
        });
      } else if (!shouldShowCheckIn && generatedRoomCheckIns.has(bookingKey)) {
        // Don't remove - keep it visible even after check-in time passes
        // The notification should remain in the list
      }
      
      // Handle check-out notification (remains visible, only marked as read)
      if (status === 'check-out' && !generatedRoomCheckOuts.has(bookingKey)) {
        generatedRoomCheckOuts.set(bookingKey, {
          id: `${bookingKey}_checkout`,
          type: 'check_out',
          guestName,
          bookingId: bookingKey,
          roomType: (data.isMultiRoomBooking && data.parentBookingId) ? multiRoomDisplay : (roomTypeDisplay || 'Single Room Type'),
          eventDate: formatDateTimeForDisplay(data.checkOut),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          read: false,
          isMultiRoom: !!(data.isMultiRoomBooking && data.parentBookingId)
        });
      }
    });
    
    emitStatusUpdates();
  }, (error) => {
    console.error('Error fetching room status notifications:', error);
  });

  const unsubscribeDayTour = onSnapshot(dayTourQuery, (querySnapshot) => {
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const status = normalizeStatus(data.status);
      
      const bookingKey = data.bookingId || docSnap.id;
      
      // Handle day tour check-in (remains visible, only marked as read)
      if (status === 'check-in' && !generatedDayTourCheckIns.has(bookingKey)) {
        const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
        const guestCount = getDayTourGuestCount(data);
        
        generatedDayTourCheckIns.set(bookingKey, {
          id: `${bookingKey}_daytour_checkin`,
          type: 'check_in',
          guestName: `${guestName} | Booking ID: ${bookingKey} | Guests: ${guestCount}`,
          bookingId: bookingKey,
          roomType: 'Day Tour',
          eventDate: formatDateForDisplay(data.selectedDate),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          read: false,
          isMultiRoom: false
        });
      }
    });
    
    emitStatusUpdates();
  }, (error) => {
    console.error('Error fetching day tour status notifications:', error);
  });

  return () => {
    unsubscribeRoom();
    unsubscribeDayTour();
    // Don't clear the maps on unmount - they will be recreated when component remounts
  };
};

// Set up listener for bank transfer requests
export const setupBankRequestsListener = (onUpdate) => {
  const bankRequestsRef = collection(db, 'bank_requests');
  const q = query(bankRequestsRef, orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const requests = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const isRead = data.read === true;
      
      // Determine room type display for bank transfer requests
      let roomTypeDisplay = 'Room';
      if (data.isExclusiveResortBooking) {
        roomTypeDisplay = 'Entire Resort';
      } else if (data.isMultiRoomBooking) {
        roomTypeDisplay = 'Multi-Room Types';
      } else if (data.roomType) {
        roomTypeDisplay = 'Single Room Type';
      }
      
      requests.push({
        id: doc.id,
        type: 'bank_transfer',
        guestName: data.guestName,
        totalPrice: data.totalPrice,
        createdAt: data.createdAt,
        read: isRead,
        roomType: roomTypeDisplay,
        bookingId: data.bookingId,
        selectedBank: data.requestedBank?.bankName || 'N/A'
      });
    });
    onUpdate(requests, 'bank_transfer');
  }, (error) => {
    console.error('Error fetching bank transfer requests:', error);
  });
  
  return unsubscribe;
};

// Set up listener for day tour bank transfer requests
export const setupDayTourBankRequestsListener = (onUpdate) => {
  const dayTourBankRequestsRef = collection(db, 'daytour_bank_requests');
  const q = query(dayTourBankRequestsRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const requests = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const isRead = data.read === true;
      requests.push({
        id: docSnap.id,
        type: 'bank_transfer_daytour',
        guestName: data.guestName,
        createdAt: data.createdAt,
        read: isRead,
        bookingId: data.bookingId,
        selectedDate: formatDateForDisplay(data.selectedDate),
        selectedBank: data.requestedBank?.bankName || 'N/A'
      });
    });
    onUpdate(requests, 'bank_transfer_daytour');
  }, (error) => {
    console.error('Error fetching day tour bank transfer requests:', error);
  });

  return unsubscribe;
};

// Set up listener for room reservations
export const setupRoomReservationsListener = (onUpdate) => {
  const bookingsRef = collection(db, 'bookings');
  const q = query(bookingsRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const reservationNotifications = [];
    const processedParents = new Set();

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.type !== 'room') return;
      
      // Determine room type display
      let roomTypeDisplay = getRoomTypeDisplay(data);
      
      // Check if this is a child of a multi-room booking
      if (data.isMultiRoomBooking && data.parentBookingId) {
        // Only add one notification per parentBookingId
        if (!processedParents.has(data.parentBookingId)) {
          processedParents.add(data.parentBookingId);
          // For multi-room, we need to determine if it's Entire Resort or Multi-Room Types
          let multiRoomDisplay = 'Multi-Room Types';
          if (data.isExclusiveResortBooking) {
            multiRoomDisplay = 'Entire Resort';
          }
          reservationNotifications.push({
            id: data.parentBookingId,
            type: 'reservation_room',
            guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
            bookingId: data.parentBookingId,
            roomType: multiRoomDisplay,
            createdAt: data.createdAt,
            read: data.read === true,
            isMultiRoom: true
          });
        }
      } else if (!data.isMultiRoomBooking) {
        // Single room booking - use the determined display
        reservationNotifications.push({
          id: docSnap.id,
          type: 'reservation_room',
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
          bookingId: data.bookingId,
          roomType: roomTypeDisplay || 'Single Room Type',
          createdAt: data.createdAt,
          read: data.read === true,
          isMultiRoom: false
        });
      }
    });
    
    onUpdate(reservationNotifications, 'reservation_room');
  }, (error) => {
    console.error('Error fetching room reservations notifications:', error);
  });

  return unsubscribe;
};

// Set up listener for day tour reservations
export const setupDayTourReservationsListener = (onUpdate) => {
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
        reservationDate: formatDateForDisplay(data.selectedDate),
        createdAt: data.createdAt,
        read: data.read === true
      });
    });
    onUpdate(reservationNotifications, 'reservation_daytour');
  }, (error) => {
    console.error('Error fetching day tour reservation notifications:', error);
  });

  return unsubscribe;
};

// Set up listener for guest cancellations
export const setupGuestCancellationsListener = (onUpdate) => {
  const cancellationsRef = collection(db, 'guest_cancellations');
  const q = query(cancellationsRef, orderBy('cancelledAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const cancellations = [];
    const processedParents = new Set();

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const isRead = data.read === true;
      
      // Determine room type display for cancellation
      let roomTypeDisplay = data.roomType || 'Room';
      
      // Check if this is a multi-room cancellation
      if (data.isMultiRoom && data.parentBookingId) {
        if (!processedParents.has(data.parentBookingId)) {
          processedParents.add(data.parentBookingId);
          // Determine if it's Entire Resort or Multi-Room Types
          let multiRoomDisplay = 'Multi-Room Types';
          if (data.isExclusiveResortBooking) {
            multiRoomDisplay = 'Entire Resort';
          }
          cancellations.push({
            id: data.parentBookingId,
            type: 'cancellation',
            guestName: data.guestName,
            bookingId: data.parentBookingId,
            roomType: multiRoomDisplay,
            selectedDate: formatDateForDisplay(data.selectedDate || data.reservationDate || data.date || data.tourDate),
            createdAt: data.cancelledAt,
            read: isRead,
            isMultiRoom: true
          });
        }
      } else if (data.bookingType === 'room') {
        // Single room booking cancellation
        // Check if it's an exclusive resort booking
        let singleRoomDisplay = 'Single Room Type';
        if (data.isExclusiveResortBooking) {
          singleRoomDisplay = 'Entire Resort';
        }
        cancellations.push({
          id: doc.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: singleRoomDisplay,
          selectedDate: formatDateForDisplay(data.selectedDate || data.reservationDate || data.date),
          createdAt: data.cancelledAt,
          read: isRead,
          isMultiRoom: false
        });
      } else {
        // Day tour cancellation - use tourDate or selectedDate
        const dateToShow = data.tourDate || data.selectedDate || data.reservationDate || data.date;
        cancellations.push({
          id: doc.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: 'Day Tour',
          selectedDate: formatDateForDisplay(dateToShow),
          createdAt: data.cancelledAt,
          read: isRead,
          isMultiRoom: false
        });
      }
    });
    
    onUpdate(cancellations, 'cancellation');
  }, (error) => {
    console.error('Error fetching guest cancellations:', error);
  });
  
  return unsubscribe;
};

// Mark a single notification as read
export const markNotificationAsRead = async (notification) => {
  if (notification.read) return;

  try {
    // For check-in/check-out notifications, update the local read status only
    // We don't need to mark anything in Firestore as they are generated dynamically
    if (notification.type === 'check_in' || notification.type === 'check_out') {
      // These notifications are virtual - update the local Map
      if (notification.type === 'check_in') {
        if (notification.roomType === 'Day Tour') {
          const existing = generatedDayTourCheckIns.get(notification.bookingId);
          if (existing) {
            generatedDayTourCheckIns.set(notification.bookingId, { ...existing, read: true });
          }
        } else {
          const existing = generatedRoomCheckIns.get(notification.bookingId);
          if (existing) {
            generatedRoomCheckIns.set(notification.bookingId, { ...existing, read: true });
          }
        }
      } else if (notification.type === 'check_out') {
        const existing = generatedRoomCheckOuts.get(notification.bookingId);
        if (existing) {
          generatedRoomCheckOuts.set(notification.bookingId, { ...existing, read: true });
        }
      }
      return;
    }
    
    let collectionName = 'guest_cancellations';
    if (notification.type === 'bank_transfer') collectionName = 'bank_requests';
    if (notification.type === 'bank_transfer_daytour') collectionName = 'daytour_bank_requests';
    if (notification.type === 'reservation_room') collectionName = 'bookings';
    if (notification.type === 'reservation_daytour') collectionName = 'dayTourBookings';
    
    if (notification.type === 'reservation_room' && notification.isMultiRoom) {
      // For multi-room notifications, mark all child bookings as read
      const bookingsRef = collection(db, 'bookings');
      const q = query(bookingsRef, where('parentBookingId', '==', notification.id));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.type === 'room' && data.read !== true) {
          batch.update(docSnap.ref, { read: true });
        }
      });
      await batch.commit();
    } else if (notification.type === 'cancellation' && notification.isMultiRoom) {
      // For multi-room cancellation notifications, mark all child cancellations as read
      const cancellationsRef = collection(db, 'guest_cancellations');
      const q = query(cancellationsRef, where('parentBookingId', '==', notification.id));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.read !== true) {
          batch.update(docSnap.ref, { read: true });
        }
      });
      await batch.commit();
    } else {
      const docRef = doc(db, collectionName, notification.id);
      await updateDoc(docRef, { read: true });
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async () => {
  try {
    const batch = writeBatch(db);
    
    // Mark bank requests as read
    const bankRequestsRef = collection(db, 'bank_requests');
    const bankSnapshot = await getDocs(query(bankRequestsRef));
    bankSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.read !== true) {
        batch.update(doc.ref, { read: true });
      }
    });
    
    // Mark guest cancellations as read
    const cancellationsRef = collection(db, 'guest_cancellations');
    const cancelSnapshot = await getDocs(query(cancellationsRef));
    cancelSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.read !== true) {
        batch.update(doc.ref, { read: true });
      }
    });

    // Mark room reservation notifications as read (including multi-room children)
    const bookingsRef = collection(db, 'bookings');
    const bookingsSnapshot = await getDocs(query(bookingsRef));
    bookingsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.type === 'room' && data.read !== true) {
        batch.update(docSnap.ref, { read: true });
      }
    });

    // Mark day tour reservation notifications as read
    const dayTourBookingsRef = collection(db, 'dayTourBookings');
    const dayTourSnapshot = await getDocs(query(dayTourBookingsRef));
    dayTourSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.read !== true) {
        batch.update(docSnap.ref, { read: true });
      }
    });

    // Mark day tour bank requests as read
    const dayTourBankRef = collection(db, 'daytour_bank_requests');
    const dayTourBankSnapshot = await getDocs(query(dayTourBankRef));
    dayTourBankSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.read !== true) {
        batch.update(docSnap.ref, { read: true });
      }
    });
    
    await batch.commit();
    
    // Also mark virtual check-in/check-out notifications as read locally
    generatedRoomCheckIns.forEach((value, key) => {
      generatedRoomCheckIns.set(key, { ...value, read: true });
    });
    generatedRoomCheckOuts.forEach((value, key) => {
      generatedRoomCheckOuts.set(key, { ...value, read: true });
    });
    generatedDayTourCheckIns.forEach((value, key) => {
      generatedDayTourCheckIns.set(key, { ...value, read: true });
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
  }
};