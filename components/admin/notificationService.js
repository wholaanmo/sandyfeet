// components/admin/notificationService.js
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, writeBatch, getDocs, doc, where, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

export const asDate = (value) => {
  if (!value) return new Date(0);
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};

const getCurrentUserId = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('uid');
  }
  return null;
};

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

export const setupGuestIdSubmissionListener = (onUpdate) => {
  const submissionsRef = collection(db, 'guest_id_submissions');
  const q = query(submissionsRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const submissions = [];

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const notificationId = docSnap.id;
      const isRead = await getUserReadStatus(userId, notificationId, 'guest_id_submission');
      
      const notification = {
        id: notificationId,
        type: 'guest_id_submission',
        guestName: data.guestName,
        bookingId: data.bookingId,
        bookingType: data.bookingType,
        createdAt: data.createdAt,
        read: isRead,
      };
      
      submissions.push(notification);
      await saveNotification(notification);
    }
    
    if (submissions.length > 0) {
      onUpdate(submissions, 'guest_id_submission');
    }
  }, (error) => {
    console.error('Error fetching guest ID submissions:', error);
  });
  
  return unsubscribe;
};

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

// Returns the generic room type label used in the admin dashboard's Booking ID column
const getRoomTypeLabel = (isExclusiveResort, distinctRoomTypeCount) => {
  if (isExclusiveResort) return 'Entire Resort';
  if (distinctRoomTypeCount > 1) return 'Multi-Room Types';
  return 'Single Room Type';
};

// Helper to fetch all children for a parent booking and count distinct room types
const getDistinctRoomTypeCountForParent = async (parentBookingId) => {
  try {
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('parentBookingId', '==', parentBookingId),
      where('isMultiRoomBooking', '==', true)
    );
    const snapshot = await getDocs(q);
    const distinctTypes = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.roomType) {
        distinctTypes.add(data.roomType);
      }
    });
    return distinctTypes.size;
  } catch (err) {
    console.error('Error fetching children for parent:', err);
    return 0;
  }
};

// Cache for parent booking distinct room type count (per parent)
const parentRoomTypeCountCache = new Map();

const getCachedParentRoomTypeCount = async (parentBookingId) => {
  if (parentRoomTypeCountCache.has(parentBookingId)) {
    return parentRoomTypeCountCache.get(parentBookingId);
  }
  const count = await getDistinctRoomTypeCountForParent(parentBookingId);
  parentRoomTypeCountCache.set(parentBookingId, count);
  return count;
};

const normalizeStatus = (status) => {
  if (!status) return '';
  return String(status).trim().toLowerCase().replace(/[_\s]+/g, '-');
};

const isCancelledBookingStatus = (status) => {
  const normalized = normalizeStatus(status);
  return normalized === 'cancelled' || normalized === 'cancelled-by-guest';
};

const clearRoomStatusNotificationsForBooking = (bookingKey) => {
  generatedRoomCheckIns.delete(bookingKey);
  generatedRoomCheckOuts.delete(bookingKey);
  currentBookings.delete(bookingKey);
};

const clearDayTourStatusNotificationsForBooking = (bookingKey) => {
  generatedDayTourCheckIns.delete(bookingKey);
};

const getRoomStatusBookingKey = (docId, data) => {
  return data.parentBookingId || data.bookingId || docId;
};

const getRoomCheckOutNotificationKey = (bookingKey, checkOut) => {
  const checkoutMs = asDate(checkOut).getTime();
  return `${bookingKey}_checkout_${checkoutMs}`;
};

const clearGeneratedRoomCheckOutsForBooking = (bookingKey) => {
  for (const key of [...generatedRoomCheckOuts.keys()]) {
    if (key === bookingKey || key.startsWith(`${bookingKey}_checkout`)) {
      generatedRoomCheckOuts.delete(key);
    }
  }
};

const getDayTourGuestCount = (data) => {
  if (typeof data.totalGuests === 'number') return data.totalGuests;
  if (typeof data.guests === 'number') return data.guests;
  return 1;
};

const saveNotification = async (notification) => {
  if (isNotificationDismissed(notification.type, notification.id)) return;

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

const dismissedNotificationKeys = new Set();
let dismissedNotificationsLoaded = false;

const getDismissedNotificationKey = (type, id) => `${type}_${id}`;

export const isNotificationDismissed = (type, id) =>
  dismissedNotificationKeys.has(getDismissedNotificationKey(type, id));

export const initializeDismissedNotifications = async () => {
  if (dismissedNotificationsLoaded) return;
  try {
    const snapshot = await getDocs(collection(db, 'dismissedNotifications'));
    snapshot.forEach((docSnap) => dismissedNotificationKeys.add(docSnap.id));
    dismissedNotificationsLoaded = true;
  } catch (error) {
    console.error('Error loading dismissed notifications:', error);
  }
};

const markNotificationDismissed = async (type, id) => {
  const key = getDismissedNotificationKey(type, id);
  dismissedNotificationKeys.add(key);
  await setDoc(doc(db, 'dismissedNotifications', key), {
    type,
    id,
    dismissedAt: new Date().toISOString(),
  });
};

const removeNotificationFromInternalState = (notification) => {
  const { type, id } = notification;

  if (type === 'check_in') {
    generatedRoomCheckIns.delete(id.replace('_checkin', ''));
    generatedDayTourCheckIns.delete(id.replace('_checkin', ''));
  }
  if (type === 'check_out') {
    const baseKey = id.replace(/_checkout.*$/, '');
    clearGeneratedRoomCheckOutsForBooking(baseKey);
  }
  if (type === 'guest_reservation_edit') {
    generatedGuestEdits.delete(id);
  }
  if (type === 'guest_change_request') {
    generatedGuestChangeRequests.delete(id);
  }
};

export const deleteNotification = async (notificationId, type) => {
  try {
    const fullId = `${type}_${notificationId}`;
    const notificationRef = doc(db, 'notifications', fullId);
    await deleteDoc(notificationRef);
    return true;
  } catch (error) {
    console.error('Error deleting notification:', error);
    return false;
  }
};

export const permanentlyDeleteNotification = async (notification) => {
  if (!notification?.type || !notification?.id) return false;

  try {
    const userId = getCurrentUserId();
    await markNotificationDismissed(notification.type, notification.id);
    await deleteNotification(notification.id, notification.type);
    removeNotificationFromInternalState(notification);

    if (userId) {
      const readStatusRef = doc(
        db,
        'notificationReadStatus',
        `${userId}_${notification.type}_${notification.id}`
      );
      await deleteDoc(readStatusRef).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error('Error permanently deleting notification:', error);
    return false;
  }
};

export const filterActiveNotifications = (notifications = []) =>
  notifications.filter(
    (notification) => !isNotificationDismissed(notification.type, notification.id)
  );

const getReadStatusCacheKey = (type, notificationId) => `${type}_${notificationId}`;

const readStatusCache = new Map();
const readStatusChangeCallbacks = new Set();
let readStatusUnsubscribe = null;

const notifyReadStatusChange = () => {
  readStatusChangeCallbacks.forEach((callback) => callback());
};

export const subscribeToReadStatusChanges = (callback) => {
  readStatusChangeCallbacks.add(callback);
  return () => readStatusChangeCallbacks.delete(callback);
};

export const getCachedReadStatus = (notificationId, type) =>
  readStatusCache.get(getReadStatusCacheKey(type, notificationId)) === true;

export const setupNotificationReadStatusListener = () => {
  const userId = getCurrentUserId();
  if (!userId) return () => {};

  if (readStatusUnsubscribe) {
    readStatusUnsubscribe();
    readStatusUnsubscribe = null;
  }

  const readStatusQuery = query(
    collection(db, 'notificationReadStatus'),
    where('userId', '==', userId)
  );

  readStatusUnsubscribe = onSnapshot(
    readStatusQuery,
    (snapshot) => {
      readStatusCache.clear();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.read === true && data.type && data.notificationId) {
          readStatusCache.set(getReadStatusCacheKey(data.type, data.notificationId), true);
        }
      });
      notifyReadStatusChange();
    },
    (error) => {
      console.error('Error listening to notification read status:', error);
    }
  );

  return () => {
    if (readStatusUnsubscribe) {
      readStatusUnsubscribe();
      readStatusUnsubscribe = null;
    }
    readStatusCache.clear();
  };
};

const getUserReadStatus = async (userId, notificationId, type) => {
  if (!userId) return false;
  const cacheKey = getReadStatusCacheKey(type, notificationId);
  if (readStatusCache.has(cacheKey)) {
    return readStatusCache.get(cacheKey) === true;
  }
  try {
    const readStatusRef = doc(db, 'notificationReadStatus', `${userId}_${type}_${notificationId}`);
    const docSnap = await getDoc(readStatusRef);
    const isRead = docSnap.exists() ? docSnap.data().read === true : false;
    readStatusCache.set(cacheKey, isRead);
    return isRead;
  } catch (error) {
    console.error('Error getting user read status:', error);
    return false;
  }
};

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
    readStatusCache.set(getReadStatusCacheKey(type, notificationId), read);
  } catch (error) {
    console.error('Error setting user read status:', error);
  }
};

let generatedRoomCheckIns = new Map();
let generatedRoomCheckOuts = new Map();
let generatedDayTourCheckIns = new Map();

// Store the current bookings data for real-time checking
let currentBookings = new Map();
let realTimeInterval = null;
let onUpdateCallback = null;

// Function to load existing notifications from Firestore on page load
const loadExistingNotifications = async (onUpdate) => {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const existingCheckIns = [];
    const existingCheckOuts = [];
    
    for (const docSnap of snapshot.docs) {
      const notification = docSnap.data();
      
      // Load check-in notifications
      if (notification.type === 'check_in') {
        const isRead = await getUserReadStatus(userId, notification.id, notification.type);
        const notificationWithRead = { ...notification, read: isRead };
        existingCheckIns.push(notificationWithRead);
        
        // Restore to memory map to prevent duplicate generation
        const notificationId = notification.id;
        generatedRoomCheckIns.set(notificationId.replace('_checkin', ''), notification);
      }
      
      // Load check-out notifications
      if (notification.type === 'check_out') {
        const isRead = await getUserReadStatus(userId, notification.id, notification.type);
        const notificationWithRead = { ...notification, read: isRead };
        existingCheckOuts.push(notificationWithRead);
        
        // Restore to memory map to prevent duplicate generation
        const notificationId = notification.id;
        generatedRoomCheckOuts.set(notificationId, notification);
      }
    }
    
    // Check-in/out are emitted after the first booking snapshot syncs statuses (see emitStatusUpdates)
  } catch (error) {
    console.error('Error loading existing notifications:', error);
  }
};

// Function to check for check-in notifications in real-time (every minute)
const startRealTimeCheckInChecker = (onUpdate) => {
  if (realTimeInterval) {
    clearInterval(realTimeInterval);
  }
  
  realTimeInterval = setInterval(async () => {
    if (currentBookings.size === 0) return;
    
    const now = new Date();
    const userId = getCurrentUserId();
    let newNotifications = [];
    
    for (const [bookingKey, data] of currentBookings.entries()) {
      if (isCancelledBookingStatus(data.status)) continue;

      // Skip if check-in notification already generated for this booking
      if (generatedRoomCheckIns.has(bookingKey)) continue;
      
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
      
      // Check if current time is at or after the 1-hour threshold but before check-in time
      if (oneHourBeforeCheckIn && now >= oneHourBeforeCheckIn && now < checkInDate) {
        // Determine room type label
        let roomTypeLabel = 'Single Room Type';
        if (data.isExclusiveResortBooking) {
          roomTypeLabel = 'Entire Resort';
        } else if (data.isMultiRoomBooking && data.parentBookingId) {
          const distinctCount = await getCachedParentRoomTypeCount(data.parentBookingId);
          roomTypeLabel = getRoomTypeLabel(false, distinctCount);
        }
        
        const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
        
        const notification = {
          id: `${bookingKey}_checkin`,
          type: 'check_in',
          guestName,
          bookingId: bookingKey,
          roomType: roomTypeLabel,
          eventDate: formatDateTimeForDisplay(data.checkIn),
          createdAt: new Date().toISOString(),
          isMultiRoom: !!(data.isMultiRoomBooking && data.parentBookingId),
          isEarlyTrigger: true
        };
        
        generatedRoomCheckIns.set(bookingKey, notification);
        await saveNotification(notification);
        newNotifications.push(notification);
      }
    }
    
    // Emit any new notifications
    if (newNotifications.length > 0 && onUpdate) {
      const notificationsWithRead = await Promise.all(newNotifications.map(async (notification) => {
        const isRead = await getUserReadStatus(userId, notification.id, notification.type);
        return { ...notification, read: isRead };
      }));
      onUpdate(notificationsWithRead, 'check_in');
    }
  }, 30000); // Check every 30 seconds for real-time updates
};

const stopRealTimeCheckInChecker = () => {
  if (realTimeInterval) {
    clearInterval(realTimeInterval);
    realTimeInterval = null;
  }
};

export const setupRoomStatusListener = (onUpdate) => {
  const bookingsRef = collection(db, 'bookings');
  const dayTourRef = collection(db, 'dayTourBookings');
  const roomQuery = query(bookingsRef, orderBy('createdAt', 'desc'));
  const dayTourQuery = query(dayTourRef, orderBy('createdAt', 'desc'));
  
  // Store onUpdate callback for real-time checker
  onUpdateCallback = onUpdate;
  
  // Load existing notifications from database on page load
  loadExistingNotifications(onUpdate);
  
  const emitSingleNotification = async (notification, type, onUpdate) => {
    const userId = getCurrentUserId();
    const isRead = await getUserReadStatus(userId, notification.id, type);
    const notificationWithRead = { ...notification, read: isRead };
    onUpdate([notificationWithRead], type);
  };

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
    
    // Clear and repopulate currentBookings
    currentBookings.clear();
    
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      if (data.type !== 'room') continue;

      const status = normalizeStatus(data.status);
      const bookingKey = getRoomStatusBookingKey(docSnap.id, data);

      if (isCancelledBookingStatus(status)) {
        clearRoomStatusNotificationsForBooking(bookingKey);
        continue;
      }

      // Store booking data for real-time checking
      currentBookings.set(bookingKey, data);
      
      // Determine room type label for the notification
      let roomTypeLabel = 'Single Room Type';
      if (data.isExclusiveResortBooking) {
        roomTypeLabel = 'Entire Resort';
      } else if (data.isMultiRoomBooking && data.parentBookingId) {
        const distinctCount = await getCachedParentRoomTypeCount(data.parentBookingId);
        roomTypeLabel = getRoomTypeLabel(false, distinctCount);
      } else {
        // Single room booking always shows 'Single Room Type'
        roomTypeLabel = 'Single Room Type';
      }
      
      const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
      
      if (status !== 'check-out') {
        clearGeneratedRoomCheckOutsForBooking(bookingKey);
      }

      // Check-out notifications (triggered on status change; keyed by checkout time for schedule extensions)
      const checkOutNotificationKey = getRoomCheckOutNotificationKey(bookingKey, data.checkOut);
      if (status === 'check-out' && !generatedRoomCheckOuts.has(checkOutNotificationKey)) {
        const notification = {
          id: checkOutNotificationKey,
          type: 'check_out',
          guestName,
          bookingId: bookingKey,
          roomType: roomTypeLabel,
          eventDate: formatDateTimeForDisplay(data.checkOut),
          createdAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          isMultiRoom: !!(data.isMultiRoomBooking && data.parentBookingId)
        };
        generatedRoomCheckOuts.set(checkOutNotificationKey, notification);
        await saveNotification(notification);
        await emitSingleNotification(notification, 'check_out', onUpdate);
      }
    }
    
    emitStatusUpdates();
    
    // Start or restart the real-time checker
    if (currentBookings.size > 0) {
      stopRealTimeCheckInChecker();
      startRealTimeCheckInChecker(onUpdate);
    }
  }, (error) => {
    console.error('Error fetching room status notifications:', error);
  });

  const unsubscribeDayTour = onSnapshot(dayTourQuery, async (querySnapshot) => {
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const status = normalizeStatus(data.status);
      const bookingKey = data.bookingId || docSnap.id;

      if (isCancelledBookingStatus(status)) {
        clearDayTourStatusNotificationsForBooking(bookingKey);
        continue;
      }

      if (status === 'check-in' && !generatedDayTourCheckIns.has(bookingKey)) {
        const guestName = `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';
        const guestCount = getDayTourGuestCount(data);
        
        const notification = {
          id: `${bookingKey}_daytour_checkin`,
          type: 'check_in',
          guestName: `${guestName} | Guests: ${guestCount}`,
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

  // Return cleanup function
  return () => {
    unsubscribeRoom();
    unsubscribeDayTour();
    stopRealTimeCheckInChecker();
  };
};

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

export const setupRoomReservationsListener = (onUpdate) => {
  const bookingsRef = collection(db, 'bookings');
  const q = query(bookingsRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(q, async (querySnapshot) => {
    const userId = getCurrentUserId();
    const reservationNotifications = [];
    const processedParents = new Set();
    const parentBookingsData = new Map(); // Store parent booking data for processing

    // First pass: Collect all bookings and identify parents
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      if (data.type !== 'room') continue;
      
      if (data.isMultiRoomBooking && data.parentBookingId) {
        // This is a child of a multi-room booking
        if (!parentBookingsData.has(data.parentBookingId)) {
          parentBookingsData.set(data.parentBookingId, {
            parentBookingId: data.parentBookingId,
            children: [],
            guestInfo: data.guestInfo,
            createdAt: data.createdAt,
            isExclusiveResortBooking: data.isExclusiveResortBooking || false
          });
        }
        parentBookingsData.get(data.parentBookingId).children.push(data);
      } else if (!data.isMultiRoomBooking) {
        // Single booking - process immediately
        let roomTypeLabel = 'Single Room Type';
        if (data.isExclusiveResortBooking) {
          roomTypeLabel = 'Entire Resort';
        }
        
        // Check if notification already exists for this booking
        const notificationId = docSnap.id;
        const existingNotificationRef = doc(db, 'notifications', `reservation_room_${notificationId}`);
        const existingNotification = await getDoc(existingNotificationRef);
        
        const isRead = await getUserReadStatus(userId, notificationId, 'reservation_room');
        const notification = {
          id: notificationId,
          type: 'reservation_room',
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
          bookingId: data.bookingId || notificationId,
          roomType: roomTypeLabel,
          createdAt: data.createdAt,
          read: isRead,
          isMultiRoom: false
        };
        
        // Only add if not already processed or if it's new
        if (!processedParents.has(notificationId)) {
          processedParents.add(notificationId);
          reservationNotifications.push(notification);
          await saveNotification(notification);
        }
      }
    }

    // Second pass: Process multi-room parent bookings
    for (const [parentId, parentData] of parentBookingsData.entries()) {
      if (processedParents.has(parentId)) continue;
      
      // Wait a short moment to ensure all child bookings are collected
      // This allows Firestore to sync all child documents
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Re-fetch the parent data to ensure we have all children
      const childrenQuery = query(
        collection(db, 'bookings'),
        where('parentBookingId', '==', parentId),
        where('isMultiRoomBooking', '==', true)
      );
      const childrenSnapshot = await getDocs(childrenQuery);
      const allChildren = [];
      childrenSnapshot.forEach(doc => {
        allChildren.push(doc.data());
      });
      
      // Determine the correct room type label based on all children
      let roomTypeLabel = 'Single Room Type';
      let isExclusiveResort = false;
      const distinctRoomTypes = new Set();
      
      for (const child of allChildren) {
        if (child.roomType) {
          distinctRoomTypes.add(child.roomType);
        }
        if (child.isExclusiveResortBooking) {
          isExclusiveResort = true;
        }
      }
      
      if (isExclusiveResort) {
        roomTypeLabel = 'Entire Resort';
      } else if (distinctRoomTypes.size > 1) {
        roomTypeLabel = 'Multi-Room Types';
      } else {
        roomTypeLabel = 'Single Room Type';
      }
      
      // Use the first child's guest info (they should all be the same)
      const firstChild = allChildren[0] || parentData.children[0];
      if (!firstChild) continue;
      
      const guestName = `${firstChild.guestInfo?.firstName || ''} ${firstChild.guestInfo?.lastName || ''}`.trim() || 'Guest';
      const createdAt = firstChild.createdAt;
      
      const isRead = await getUserReadStatus(userId, parentId, 'reservation_room');
      const notification = {
        id: parentId,
        type: 'reservation_room',
        guestName: guestName,
        bookingId: parentId,
        roomType: roomTypeLabel,
        createdAt: createdAt,
        read: isRead,
        isMultiRoom: true
      };
      
      processedParents.add(parentId);
      reservationNotifications.push(notification);
      await saveNotification(notification);
    }
    
    // Sort notifications by createdAt (newest first)
    reservationNotifications.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB - dateA;
    });
    
    onUpdate(reservationNotifications, 'reservation_room');
  }, (error) => {
    console.error('Error fetching room reservations notifications:', error);
  });

  return unsubscribe;
};

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
          let roomTypeLabel = 'Single Room Type';
          if (data.isExclusiveResortBooking) {
            roomTypeLabel = 'Entire Resort';
          } else {
            const distinctCount = await getCachedParentRoomTypeCount(data.parentBookingId);
            roomTypeLabel = getRoomTypeLabel(false, distinctCount);
          }
          const isRead = await getUserReadStatus(userId, data.parentBookingId, 'cancellation');
          const notification = {
            id: data.parentBookingId,
            type: 'cancellation',
            guestName: data.guestName,
            bookingId: data.parentBookingId,
            roomType: roomTypeLabel,
            selectedDate: formatDateForDisplay(data.selectedDate || data.reservationDate || data.date || data.tourDate),
            createdAt: data.cancelledAt,
            read: isRead,
            isMultiRoom: true
          };
          cancellations.push(notification);
          await saveNotification(notification);
        }
      } else if (data.bookingType === 'room') {
        let roomTypeLabel = 'Single Room Type';
        if (data.isExclusiveResortBooking) {
          roomTypeLabel = 'Entire Resort';
        }
        const isRead = await getUserReadStatus(userId, doc.id, 'cancellation');
        const notification = {
          id: doc.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: roomTypeLabel,
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

export const markAllNotificationsAsRead = async () => {
  const userId = getCurrentUserId();
  if (!userId) return;
  
  try {
    const notificationTypes = [
      'bank_transfer',
      'bank_transfer_daytour',
      'reservation_room',
      'reservation_daytour',
      'cancellation',
      'guest_reservation_edit',
      'guest_change_request',
    ];
    
    for (const type of notificationTypes) {
      let collectionName = '';
      if (type === 'bank_transfer') collectionName = 'bank_requests';
      if (type === 'bank_transfer_daytour') collectionName = 'daytour_bank_requests';
      if (type === 'reservation_room') collectionName = 'bookings';
      if (type === 'reservation_daytour') collectionName = 'dayTourBookings';
      if (type === 'cancellation') collectionName = 'guest_cancellations';

      if (type === 'guest_reservation_edit') {
        for (const notification of generatedGuestEdits.values()) {
          await setUserReadStatus(userId, notification.id, type, true);
        }
        continue;
      }

      if (type === 'guest_change_request') {
        for (const notification of generatedGuestChangeRequests.values()) {
          await setUserReadStatus(userId, notification.id, type, true);
        }
        continue;
      }
      
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
    
    const allCheckInIds = [
      ...Array.from(generatedRoomCheckIns.values()).map(n => n.id),
      ...Array.from(generatedDayTourCheckIns.values()).map(n => n.id)
    ];
    const allCheckOutIds = Array.from(generatedRoomCheckOuts.values()).map(n => n.id);
    
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

let guestBookingPreviousStates = new Map();
let generatedGuestEdits = new Map();
let generatedGuestChangeRequests = new Map();
let guestBookingActivitySeeded = false;

const toIsoTimestamp = (value) => {
  if (!value) return new Date().toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value?.seconds) return new Date(value.seconds * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const getGuestFullName = (data) =>
  `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest';

const getGuestActivityGroupKey = (data, docId) => {
  if (data.isMultiRoomBooking && data.parentBookingId) return data.parentBookingId;
  return docId;
};

const getGuestActivityRoomTypeLabel = async (data, isDayTour) => {
  if (isDayTour) return 'Day Tour';
  if (data.isExclusiveResortBooking) return 'Entire Resort';
  if (data.isMultiRoomBooking && data.parentBookingId) {
    const distinctCount = await getCachedParentRoomTypeCount(data.parentBookingId);
    return getRoomTypeLabel(false, distinctCount);
  }
  return 'Single Room Type';
};

const emitGuestActivityNotification = async (notification, onUpdate) => {
  const userId = getCurrentUserId();
  const isRead = await getUserReadStatus(userId, notification.id, notification.type);
  const notificationWithRead = { ...notification, read: isRead };
  await saveNotification(notificationWithRead);
  onUpdate([notificationWithRead], notification.type);
};

const processGuestBookingActivityDoc = async (docSnap, isDayTour, onUpdate) => {
  const data = docSnap.data();
  const docId = docSnap.id;
  const prev = guestBookingPreviousStates.get(docId);
  const guestName = getGuestFullName(data);
  const groupKey = getGuestActivityGroupKey(data, docId);
  const bookingId = data.bookingId || groupKey;
  const roomType = await getGuestActivityRoomTypeLabel(data, isDayTour);

  if (guestBookingActivitySeeded && data.hasBeenEdited === true && !prev?.hasBeenEdited) {
    const notificationId = `${groupKey}_guest_edit`;
    if (!generatedGuestEdits.has(notificationId)) {
      const notification = {
        id: notificationId,
        type: 'guest_reservation_edit',
        action: 'Reservation Edited',
        guestName,
        bookingId,
        roomType,
        createdAt: toIsoTimestamp(data.updatedAt),
        read: false,
      };
      generatedGuestEdits.set(notificationId, notification);
      await emitGuestActivityNotification(notification, onUpdate);
    }
  }

  if (
    guestBookingActivitySeeded &&
    data.changeRequest?.status === 'pending' &&
    prev?.changeRequestStatus !== 'pending'
  ) {
    const notificationId = `${groupKey}_guest_change`;
    if (!generatedGuestChangeRequests.has(notificationId)) {
      const notification = {
        id: notificationId,
        type: 'guest_change_request',
        action: 'Request Change Submitted',
        guestName,
        bookingId,
        roomType,
        createdAt: toIsoTimestamp(data.changeRequest?.submittedAt || data.updatedAt),
        read: false,
      };
      generatedGuestChangeRequests.set(notificationId, notification);
      await emitGuestActivityNotification(notification, onUpdate);
    }
  }

  guestBookingPreviousStates.set(docId, {
    hasBeenEdited: data.hasBeenEdited === true,
    changeRequestStatus: data.changeRequest?.status || null,
  });
};

const seedGuestBookingActivityStates = (snapshot) => {
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    guestBookingPreviousStates.set(docSnap.id, {
      hasBeenEdited: data.hasBeenEdited === true,
      changeRequestStatus: data.changeRequest?.status || null,
    });
  });
};

const loadExistingGuestActivityNotifications = async (onUpdate) => {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    const notificationsRef = collection(db, 'notifications');
    const snapshot = await getDocs(notificationsRef);
    const edits = [];
    const changeRequests = [];

    for (const docSnap of snapshot.docs) {
      const notification = docSnap.data();
      if (notification.type === 'guest_reservation_edit') {
        const isRead = await getUserReadStatus(userId, notification.id, notification.type);
        const withRead = { ...notification, read: isRead };
        generatedGuestEdits.set(notification.id, withRead);
        edits.push(withRead);
      }
      if (notification.type === 'guest_change_request') {
        const isRead = await getUserReadStatus(userId, notification.id, notification.type);
        const withRead = { ...notification, read: isRead };
        generatedGuestChangeRequests.set(notification.id, withRead);
        changeRequests.push(withRead);
      }
    }

    if (edits.length > 0) onUpdate(edits, 'guest_reservation_edit');
    if (changeRequests.length > 0) onUpdate(changeRequests, 'guest_change_request');
  } catch (error) {
    console.error('Error loading guest activity notifications:', error);
  }
};

let guestActivityRoomSeeded = false;
let guestActivityDayTourSeeded = false;
let guestActivityUnsubscribers = null;

const tryEnableGuestBookingActivityProcessing = () => {
  if (guestActivityRoomSeeded && guestActivityDayTourSeeded) {
    guestBookingActivitySeeded = true;
  }
};

const setupGuestBookingActivityListener = (onUpdate) => {
  if (guestActivityUnsubscribers) {
    return guestActivityUnsubscribers;
  }

  loadExistingGuestActivityNotifications(onUpdate);

  const bookingsRef = collection(db, 'bookings');
  const dayTourRef = collection(db, 'dayTourBookings');
  const roomQuery = query(bookingsRef, orderBy('createdAt', 'desc'));
  const dayTourQuery = query(dayTourRef, orderBy('createdAt', 'desc'));

  const handleRoomSnapshot = async (snapshot) => {
    if (!guestBookingActivitySeeded) {
      seedGuestBookingActivityStates(snapshot);
      guestActivityRoomSeeded = true;
      tryEnableGuestBookingActivityProcessing();
      return;
    }

    for (const docSnap of snapshot.docs) {
      if (docSnap.data().type !== 'room') continue;
      await processGuestBookingActivityDoc(docSnap, false, onUpdate);
    }
  };

  const handleDayTourSnapshot = async (snapshot) => {
    if (!guestBookingActivitySeeded) {
      seedGuestBookingActivityStates(snapshot);
      guestActivityDayTourSeeded = true;
      tryEnableGuestBookingActivityProcessing();
      return;
    }

    for (const docSnap of snapshot.docs) {
      await processGuestBookingActivityDoc(docSnap, true, onUpdate);
    }
  };

  const unsubscribeRoom = onSnapshot(roomQuery, handleRoomSnapshot, (error) => {
    console.error('Error fetching guest booking activity notifications (room):', error);
  });

  const unsubscribeDayTour = onSnapshot(dayTourQuery, handleDayTourSnapshot, (error) => {
    console.error('Error fetching guest booking activity notifications (day tour):', error);
  });

  guestActivityUnsubscribers = () => {
    unsubscribeRoom();
    unsubscribeDayTour();
    guestActivityUnsubscribers = null;
    guestBookingActivitySeeded = false;
    guestActivityRoomSeeded = false;
    guestActivityDayTourSeeded = false;
    guestBookingPreviousStates = new Map();
  };

  return guestActivityUnsubscribers;
};

export const setupGuestReservationEditsListener = (onUpdate) =>
  setupGuestBookingActivityListener(onUpdate);

export const setupGuestChangeRequestsListener = (onUpdate) =>
  setupGuestBookingActivityListener(onUpdate);

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

export function NotificationDeleteConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  isDeleting,
}) {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <NotificationDeleteConfirmOverlay onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-5 py-4">
          <h3 id="notification-delete-title" className="text-base font-bold text-[#1E3A8A]">
            Delete Notification
          </h3>
          <p className="mt-1 text-sm text-[#5C7AA6]">
            Are you sure you want to delete this notification? This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2 text-sm font-semibold text-[#1E3A8A] transition hover:bg-[#4D8CF5]/5 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {isDeleting ? 'Deleting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </NotificationDeleteConfirmOverlay>,
    document.body
  );
}

function NotificationDeleteConfirmOverlay({ children, onClick }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center p-4"
      onClick={onClick}
      role="presentation"
    >
      {children}
    </div>
  );
}

export function NotificationDeleteButton({ notification, onDeleted }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async (event) => {
    event.stopPropagation();
    setIsDeleting(true);
    const success = await permanentlyDeleteNotification(notification);
    setIsDeleting(false);
    setConfirmOpen(false);
    if (success && onDeleted) {
      onDeleted(notification);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Delete notification"
        onClick={(event) => {
          event.stopPropagation();
          setConfirmOpen(true);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200/80 bg-red-50 text-red-500 transition hover:bg-red-100 hover:text-red-600"
      >
        <i className="fas fa-trash-alt text-[10px]" />
      </button>

      <NotificationDeleteConfirmModal
        isOpen={confirmOpen}
        onConfirm={handleConfirm}
        onCancel={(event) => {
          event?.stopPropagation?.();
          if (!isDeleting) setConfirmOpen(false);
        }}
        isDeleting={isDeleting}
      />
    </>
  );
}