// components/admin/notificationService.js
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, writeBatch, getDocs, doc } from 'firebase/firestore';

export const asDate = (value) => {
  if (!value) return new Date(0);
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
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
      requests.push({
        id: doc.id,
        type: 'bank_transfer',
        guestName: data.guestName,
        totalPrice: data.totalPrice,
        createdAt: data.createdAt,
        read: isRead,
        roomType: data.roomType,
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
        selectedDate: data.selectedDate,
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
      
      // Check if this is a child of a multi-room booking
      if (data.isMultiRoomBooking && data.parentBookingId) {
        // Only add one notification per parentBookingId
        if (!processedParents.has(data.parentBookingId)) {
          processedParents.add(data.parentBookingId);
          reservationNotifications.push({
            id: data.parentBookingId,
            type: 'reservation_room',
            guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
            bookingId: data.parentBookingId,
            roomType: 'Multi-Room Booking',
            createdAt: data.createdAt,
            read: data.read === true,
            isMultiRoom: true
          });
        }
      } else if (!data.isMultiRoomBooking) {
        // Single room booking
        reservationNotifications.push({
          id: docSnap.id,
          type: 'reservation_room',
          guestName: `${data.guestInfo?.firstName || ''} ${data.guestInfo?.lastName || ''}`.trim() || 'Guest',
          bookingId: data.bookingId,
          roomType: data.roomType || 'N/A',
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
        reservationDate: data.selectedDate || 'N/A',
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
      
      // Check if this is a multi-room cancellation (based on parentBookingId in the data)
      if (data.isMultiRoom && data.parentBookingId) {
        if (!processedParents.has(data.parentBookingId)) {
          processedParents.add(data.parentBookingId);
          cancellations.push({
            id: data.parentBookingId,
            type: 'cancellation',
            guestName: data.guestName,
            bookingId: data.parentBookingId,
            roomType: 'Multi-Room Booking',
            selectedDate: data.selectedDate || data.reservationDate || data.date,
            createdAt: data.cancelledAt,
            read: isRead,
            isMultiRoom: true
          });
        }
      } else {
        // Single booking cancellation
        cancellations.push({
          id: doc.id,
          type: 'cancellation',
          guestName: data.guestName,
          bookingId: data.bookingId,
          roomType: data.roomType,
          selectedDate: data.selectedDate || data.reservationDate || data.date,
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
    let collectionName = 'guest_cancellations';
    if (notification.type === 'bank_transfer') collectionName = 'bank_requests';
    if (notification.type === 'bank_transfer_daytour') collectionName = 'daytour_bank_requests';
    if (notification.type === 'reservation_room') collectionName = 'bookings';
    if (notification.type === 'reservation_daytour') collectionName = 'dayTourBookings';
    
    if (notification.type === 'reservation_room' && notification.isMultiRoom) {
      // For multi-room notifications, mark all child bookings as read
      const bookingsRef = collection(db, 'bookings');
      const q = query(bookingsRef);
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.type === 'room' && data.isMultiRoomBooking && data.parentBookingId === notification.id && data.read !== true) {
          batch.update(docSnap.ref, { read: true });
        }
      });
      await batch.commit();
    } else if (notification.type === 'cancellation' && notification.isMultiRoom) {
      // For multi-room cancellation notifications, mark all child cancellations as read
      const cancellationsRef = collection(db, 'guest_cancellations');
      const q = query(cancellationsRef);
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isMultiRoom && data.parentBookingId === notification.id && data.read !== true) {
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
  } catch (error) {
    console.error('Error marking notifications as read:', error);
  }
};