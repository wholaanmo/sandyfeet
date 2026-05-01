// components/admin/notificationService.js
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, writeBatch, getDocs, doc, where, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

export const asDate = (value) => {
  if (!value) return new Date(0);
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};

// Helper function to get current user ID
const getCurrentUserId = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('uid');
  }
  return null;
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
const getRoomTypeDisplay = (bookingData) => {
  if (bookingData.isExclusiveResortBooking === true) {
    return 'Entire Resort';
  }
  if (bookingData.isMultiRoomBooking && bookingData.parentBookingId) {
    return null;
  }
  if (bookingData.roomTypes && Array.isArray(bookingData.roomTypes) && bookingData.roomTypes.length > 1) {
    return 'Multi-Room Types';
  }
  if (bookingData.roomTypesArray && Array.isArray(bookingData.roomTypesArray) && bookingData.roomTypesArray.length > 1) {
    return 'Multi-Room Types';
  }
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

// Helper to save a notification to the notifications collection
const saveNotification = async (notification) => {
  try {
    const notificationId = `${notification.type}_${notification.id}`;
    const notificationRef = doc(db, 'notifications', notificationId);
    await setDoc(notificationRef, {
      ...notification,
      savedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Error saving notification:', error);
  }
};

// Helper to delete a notification from the notifications collection
export const deleteNotification = async (notificationId, type) => {
  try {
    const fullId = `${type}_${notificationId}`;
    const notificationRef = doc(db, 'notifications', fullId);
    await deleteDoc(notificationRef);
    console.log(`Notification ${fullId} deleted successfully`);
    return true;
  } catch (error) {
    console.error('Error deleting notification:', error);
    return false;
  }
};

// Helper to get user-specific read status from Firestore
const getUserReadStatus = async (userId, notificationId, type) => {
  if (!userId) return false;
  try {
    const readStatusRef = doc(db, 'notificationReadStatus', `${userId}_${type}_${notificationId}`);
    const docSnap = await getDoc(readStatusRef);
    return docSnap.exists() ? docSnap.data().read === true : false;
  } catch (error) {
    console.error('Error getting user read status:', error);
    return false;
  }
};

// Helper to set user-specific read status in Firestore
const setUserReadStatus = async (userId, notificationId, type, read = true) => {
  if (!userId) return;
  try {
    const readStatusRef = doc(db, 'notificationReadStatus', `${userId}_${type}_${notificationId}`);
    await setDoc(readStatusRef, {
      userId,
      notificationId,
      type,
      read,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error setting user read status:', error);
  }
};

// Store generated notifications per user (for deduplication)
let generatedRoomCheckIns = new Map();
let generatedRoomCheckOuts = new Map();
let generatedDayTourCheckIns = new Map();

// Set up listener for room check-in and check-out status changes
export const setupRoomStatusListener = (onUpdate) => {
  const bookingsRef = collection(db, 'bookings');
  const dayTourRef = collection(db, 'dayTourBookings');
  const roomQuery = query(bookingsRef, orderBy('createdAt', 'desc'));
  const dayTourQuery = query(dayTourRef, orderBy('createdAt', 'desc'));

  const emitStatusUpdates = async () => {
    const userId = getCurrentUserId();
    const allCheckIns = [...Array.from(generatedRoomCheckIns.values()), ...Array.from(generatedDayTourCheckIns.values())];
    const allCheckOuts = Array.from(generatedRoomCheckOuts.values());
    
    const checkInsWithReadStatus = await Promise.all(allCheckIns.map(async (item) => {
      const isRead = await getUserReadStatus(userId, item.id, item.type);
      return { ...item, read: isRead };
    }));
    
    const checkOutsWithReadStatus = await Promise.all(allCheckOuts.map(async (item) => {
      const isRead = await getUserReadStatus(userId, item.id, item.type);
      return { ...item, read: isRead };
    }));
    
    onUpdate(checkInsWithReadStatus, 'check_in');
    onUpdate(checkOutsWithReadStatus, 'check_out');
  };

  const unsubscribeRoom = onSnapshot(roomQuery, async (querySnapshot) => {
    const now = new Date();
    
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      if (data.type !== 'room') continue;

      const status = normalizeStatus(data.status);
      const bookingKey = getRoomStatusBookingKey(docSnap.id, data);
      const roomTypeDisplay = getRoomTypeDisplay(data);
      const multiRoomDisplay = data.isExclusiveResortBooking ? 'Entire Resort' : 'Multi-Room Types';
      const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
      
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
      
      if (checkInDate && !isNaN(checkInDate.getTime())) {
        checkInDate.setHours(14, 0, 0, 0);
      }
      
      const oneHourBeforeCheckIn = checkInDate ? new Date(checkInDate.getTime() - 60 * 60 * 1000) : null;
      
      let shouldShowCheckIn = false;
      let checkInReason = '';
      
      if (status === 'check-in') {
        shouldShowCheckIn = true;
        checkInReason = 'status';
      } else if (oneHourBeforeCheckIn && now >= oneHourBeforeCheckIn && now < checkInDate) {
        shouldShowCheckIn = true;
        checkInReason = 'early';
      }
      
      if (shouldShowCheckIn && !generatedRoomCheckIns.has(bookingKey)) {
        const notification = {
          id: `${bookingKey}_checkin`,
          type: 'check_in',
          guestName,
          bookingId: bookingKey,
          roomType: (data.isMultiRoomBooking && data.parentBookingId) ? multiRoomDisplay : (roomTypeDisplay || 'Single Room Type'),
          eventDate: formatDateTimeForDisplay(data.checkIn),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          isMultiRoom: !!(data.isMultiRoomBooking && data.parentBookingId),
          isEarlyTrigger: checkInReason === 'early'
        };
        generatedRoomCheckIns.set(bookingKey, notification);
        await saveNotification(notification);
      }
      
      if (status === 'check-out' && !generatedRoomCheckOuts.has(bookingKey)) {
        const notification = {
          id: `${bookingKey}_checkout`,
          type: 'check_out',
          guestName,
          bookingId: bookingKey,
          roomType: (data.isMultiRoomBooking && data.parentBookingId) ? multiRoomDisplay : (roomTypeDisplay || 'Single Room Type'),
          eventDate: formatDateTimeForDisplay(data.checkOut),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          isMultiRoom: !!(data.isMultiRoomBooking && data.parentBookingId)
        };
        generatedRoomCheckOuts.set(bookingKey, notification);
        await saveNotification(notification);
      }
    }
    
    emitStatusUpdates();
  }, (error) => {
    console.error('Error fetching room status notifications:', error);
  });

  const unsubscribeDayTour = onSnapshot(dayTourQuery, async (querySnapshot) => {
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const status = normalizeStatus(data.status);
      const bookingKey = data.bookingId || docSnap.id;
      
      if (status === 'check-in' && !generatedDayTourCheckIns.has(bookingKey)) {
        const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
        const guestCount = getDayTourGuestCount(data);
        
        const notification = {
          id: `${bookingKey}_daytour_checkin`,
          type: 'check_in',
          guestName: `${guestName} | Booking ID: ${bookingKey} | Guests: ${guestCount}`,
          bookingId: bookingKey,
          roomType: 'Day Tour',
          eventDate: formatDateForDisplay(data.selectedDate),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          isMultiRoom: false
        };
        generatedDayTourCheckIns.set(bookingKey, notification);
        await saveNotification(notification);
      }
    }
    
    emitStatusUpdates();
  }, (error) => {
    console.error('Error fetching day tour status notifications:', error);
  });

  return () => {
    unsubscribeRoom();
    unsubscribeDayTour();
  };
};

// Set up listener for bank transfer requests
export const setupBankRequestsListener = (onUpdate) => {
  const bankRequestsRef = collection(db, 'bank_requests');
  const q = query(bankRequestsRef, orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const requests = [];
    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      const isRead = await getUserReadStatus(userId, doc.id, 'bank_transfer');
      
      let roomTypeDisplay = 'Room';
      if (data.isExclusiveResortBooking) {
        roomTypeDisplay = 'Entire Resort';
      } else if (data.isMultiRoomBooking) {
        roomTypeDisplay = 'Multi-Room Types';
      } else if (data.roomType) {
        roomTypeDisplay = 'Single Room Type';
      }
      
      const notification = {
        id: doc.id,
        type: 'bank_transfer',
        guestName: data.guestName,
        totalPrice: data.totalPrice,
        createdAt: data.createdAt,
        read: isRead,
        roomType: roomTypeDisplay,
        bookingId: data.bookingId,
        selectedBank: data.requestedBank?.bankName || 'N/A'
      };
      requests.push(notification);
      await saveNotification(notification);
    }
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

  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const requests = [];
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const isRead = await getUserReadStatus(userId, docSnap.id, 'bank_transfer_daytour');
      
      const notification = {
        id: docSnap.id,
        type: 'bank_transfer_daytour',
        guestName: data.guestName,
        createdAt: data.createdAt,
        read: isRead,
        bookingId: data.bookingId,
        selectedDate: formatDateForDisplay(data.selectedDate),
        selectedBank: data.requestedBank?.bankName || 'N/A'
      };
      requests.push(notification);
      await saveNotification(notification);
    }
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

  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const reservationNotifications = [];
    const processedParents = new Set();

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      if (data.type !== 'room') continue;
      
      let roomTypeDisplay = getRoomTypeDisplay(data);
      
      if (data.isMultiRoomBooking && data.parentBookingId) {
        if (!processedParents.has(data.parentBookingId)) {
          processedParents.add(data.parentBookingId);
          let multiRoomDisplay = 'Multi-Room Types';
          if (data.isExclusiveResortBooking) {
            multiRoomDisplay = 'Entire Resort';
          }
          const isRead = await getUserReadStatus(userId, data.parentBookingId, 'reservation_room');
          const notification = {
            id: data.parentBookingId,
            type: 'reservation_room',
            guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
            bookingId: data.parentBookingId,
            roomType: multiRoomDisplay,
            createdAt: data.createdAt,
            read: isRead,
            isMultiRoom: true
          };
          reservationNotifications.push(notification);
          await saveNotification(notification);
        }
      } else if (!data.isMultiRoomBooking) {
        const isRead = await getUserReadStatus(userId, docSnap.id, 'reservation_room');
        const notification = {
          id: docSnap.id,
          type: 'reservation_room',
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
          bookingId: data.bookingId,
          roomType: roomTypeDisplay || 'Single Room Type',
          createdAt: data.createdAt,
          read: isRead,
          isMultiRoom: false
        };
        reservationNotifications.push(notification);
        await saveNotification(notification);
      }
    }
    
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

  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const reservationNotifications = [];
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const isRead = await getUserReadStatus(userId, docSnap.id, 'reservation_daytour');
      
      const notification = {
        id: docSnap.id,
        type: 'reservation_daytour',
        guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
        bookingId: data.bookingId,
        reservationDate: formatDateForDisplay(data.selectedDate),
        createdAt: data.createdAt,
        read: isRead
      };
      reservationNotifications.push(notification);
      await saveNotification(notification);
    }
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
  
  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const cancellations = [];
    const processedParents = new Set();

    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      
      if (data.isMultiRoom && data.parentBookingId) {
        if (!processedParents.has(data.parentBookingId)) {
          processedParents.add(data.parentBookingId);
          let multiRoomDisplay = 'Multi-Room Types';
          if (data.isExclusiveResortBooking) {
            multiRoomDisplay = 'Entire Resort';
          }
          const isRead = await getUserReadStatus(userId, data.parentBookingId, 'cancellation');
          const notification = {
            id: data.parentBookingId,
            type: 'cancellation',
            guestName: data.guestName,
            bookingId: data.parentBookingId,
            roomType: multiRoomDisplay,
            selectedDate: formatDateForDisplay(data.selectedDate || data.reservationDate || data.date || data.tourDate),
            createdAt: data.cancelledAt,
            read: isRead,
            isMultiRoom: true
          };
          cancellations.push(notification);
          await saveNotification(notification);
        }
      } else if (data.bookingType === 'room') {
        let singleRoomDisplay = 'Single Room Type';
        if (data.isExclusiveResortBooking) {
          singleRoomDisplay = 'Entire Resort';
        }
        const isRead = await getUserReadStatus(userId, doc.id, 'cancellation');
        const notification = {
          id: doc.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: singleRoomDisplay,
          selectedDate: formatDateForDisplay(data.selectedDate || data.reservationDate || data.date),
          createdAt: data.cancelledAt,
          read: isRead,
          isMultiRoom: false
        };
        cancellations.push(notification);
        await saveNotification(notification);
      } else {
        const dateToShow = data.tourDate || data.selectedDate || data.reservationDate || data.date;
        const isRead = await getUserReadStatus(userId, doc.id, 'cancellation');
        const notification = {
          id: doc.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: 'Day Tour',
          selectedDate: formatDateForDisplay(dateToShow),
          createdAt: data.cancelledAt,
          read: isRead,
          isMultiRoom: false
        };
        cancellations.push(notification);
        await saveNotification(notification);
      }
    }
    
    onUpdate(cancellations, 'cancellation');
  }, (error) => {
    console.error('Error fetching guest cancellations:', error);
  });
  
  return unsubscribe;
};

// Mark a single notification as read - PER USER
export const markNotificationAsRead = async (notification) => {
  if (notification.read) return;
  
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    if (notification.type === 'check_in' || notification.type === 'check_out') {
      await setUserReadStatus(userId, notification.id, notification.type, true);
      return;
    }
    
    await setUserReadStatus(userId, notification.id, notification.type, true);
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

// Mark all notifications as read - PER USER
export const markAllNotificationsAsRead = async () => {
  const userId = getCurrentUserId();
  if (!userId) return;
  
  try {
    const notificationTypes = ['bank_transfer', 'bank_transfer_daytour', 'reservation_room', 'reservation_daytour', 'cancellation'];
    
    for (const type of notificationTypes) {
      let collectionName = '';
      if (type === 'bank_transfer') collectionName = 'bank_requests';
      if (type === 'bank_transfer_daytour') collectionName = 'daytour_bank_requests';
      if (type === 'reservation_room') collectionName = 'bookings';
      if (type === 'reservation_daytour') collectionName = 'dayTourBookings';
      if (type === 'cancellation') collectionName = 'guest_cancellations';
      
      if (collectionName) {
        const ref = collection(db, collectionName);
        const snapshot = await getDocs(query(ref));
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          let notificationId = docSnap.id;
          
          if (type === 'reservation_room' && data.isMultiRoomBooking && data.parentBookingId) {
            notificationId = data.parentBookingId;
          }
          if (type === 'cancellation' && data.isMultiRoom && data.parentBookingId) {
            notificationId = data.parentBookingId;
          }
          
          await setUserReadStatus(userId, notificationId, type, true);
        }
      }
    }
    
    const allCheckInIds = [...generatedRoomCheckIns.keys(), ...generatedDayTourCheckIns.keys()];
    const allCheckOutIds = [...generatedRoomCheckOuts.keys()];
    
    for (const id of allCheckInIds) {
      await setUserReadStatus(userId, id, 'check_in', true);
    }
    for (const id of allCheckOutIds) {
      await setUserReadStatus(userId, id, 'check_out', true);
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
};

// Function to get all saved notifications from the database
export const getAllNotifications = async () => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const notifications = [];
    snapshot.forEach((doc) => {
      notifications.push({ ...doc.data(), firestoreId: doc.id });
    });
    return notifications;
  } catch (error) {
    console.error('Error fetching all notifications:', error);
    return [];
  }
};