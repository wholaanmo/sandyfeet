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

  // Function to check time-based conditions for all bookings
  const checkTimeBasedConditions = async () => {
    const now = new Date();
    
    // Get all room bookings
    const roomBookingsSnapshot = await getDocs(roomQuery);
    for (const docSnap of roomBookingsSnapshot.docs) {
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
      
      // Check if already checked in via status
      if (status === 'check-in') {
        shouldShowCheckIn = true;
        checkInReason = 'status';
      }
      // Check time-based condition (1 hour before check-in up to check-in time)
      else if (oneHourBeforeCheckIn && now >= oneHourBeforeCheckIn && now < checkInDate) {
        shouldShowCheckIn = true;
        checkInReason = 'early';
      }
      // Also check if it's exactly check-in day/time (within check-in hour)
      else if (checkInDate && now >= checkInDate && now < new Date(checkInDate.getTime() + 60 * 60 * 1000)) {
        shouldShowCheckIn = true;
        checkInReason = 'on-time';
      }
      
      // Only create notification if not already exists
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
      
      // Check-out condition
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
    
    // Check day tour bookings
    const dayTourSnapshot = await getDocs(dayTourQuery);
    for (const docSnap of dayTourSnapshot.docs) {
      const data = docSnap.data();
      const status = normalizeStatus(data.status);
      const bookingKey = data.bookingId || docSnap.id;
      
      let tourDate = null;
      if (data.selectedDate) {
        if (data.selectedDate && typeof data.selectedDate.toDate === 'function') {
          tourDate = data.selectedDate.toDate();
        } else if (data.selectedDate && typeof data.selectedDate === 'object' && data.selectedDate.seconds) {
          tourDate = new Date(data.selectedDate.seconds * 1000);
        } else {
          tourDate = new Date(data.selectedDate);
        }
      }
      
      if (tourDate && !isNaN(tourDate.getTime())) {
        tourDate.setHours(8, 0, 0, 0); // Assuming tours start at 8 AM
      }
      
      const twoHoursBeforeTour = tourDate ? new Date(tourDate.getTime() - 2 * 60 * 60 * 1000) : null;
      
      let shouldShowCheckIn = false;
      
      if (status === 'check-in') {
        shouldShowCheckIn = true;
      } else if (twoHoursBeforeTour && now >= twoHoursBeforeTour && now < tourDate) {
        shouldShowCheckIn = true;
      } else if (tourDate && now >= tourDate && now < new Date(tourDate.getTime() + 2 * 60 * 60 * 1000)) {
        shouldShowCheckIn = true;
      }
      
      if (shouldShowCheckIn && !generatedDayTourCheckIns.has(bookingKey)) {
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
    
    await emitStatusUpdates();
  };

  // Set up the Firestore listeners
  const unsubscribeRoom = onSnapshot(roomQuery, async () => {
    await checkTimeBasedConditions();
  }, (error) => {
    console.error('Error fetching room status notifications:', error);
  });

  const unsubscribeDayTour = onSnapshot(dayTourQuery, async () => {
    await checkTimeBasedConditions();
  }, (error) => {
    console.error('Error fetching day tour status notifications:', error);
  });

  // Set up periodic check (every minute) for time-based conditions
  const intervalId = setInterval(async () => {
    await checkTimeBasedConditions();
  }, 60000); // Check every minute

  // Initial check
  checkTimeBasedConditions();

  // Return cleanup function that clears the interval
  return () => {
    unsubscribeRoom();
    unsubscribeDayTour();
    clearInterval(intervalId);
  };
};