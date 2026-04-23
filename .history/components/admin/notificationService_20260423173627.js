// Update only the addCancellationNotification function in app/reservation-tracker/page.js
// Replace the existing addCancellationNotification function with this one:

const addCancellationNotification = async (booking, reason) => {
  try {
    const cancellationsRef = collection(db, 'guest_cancellations');
    const notificationData = {
      guestName: `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`,
      bookingId: booking.bookingId,
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
      read: false,
      bookingType: booking.type || 'room'
    };
    
    if (booking.isMultiRoom) {
      notificationData.isMultiRoom = true;
      notificationData.parentBookingId = booking.id || booking.bookingId;
      notificationData.totalRooms = booking.totalRooms;
      notificationData.isExclusiveResortBooking = booking.isExclusiveResortBooking || false;
      
      // Determine room type display for multi-room
      if (booking.isExclusiveResortBooking) {
        notificationData.roomType = 'Entire Resort';
      } else if (booking.roomTypesArray && booking.roomTypesArray.length > 1) {
        notificationData.roomType = 'Multi-Room Types';
      } else {
        notificationData.roomType = 'Single Room Type';
      }
      
      notificationData.roomTypesDisplay = Object.entries(booking.roomTypes || {})
        .map(([type, data]) => `${data.quantity} × ${type}`)
        .join(', ');
    } else if (booking.type === 'daytour') {
      notificationData.bookingTypeLabel = 'Day Tour';
      notificationData.tourDate = booking.selectedDate;
      notificationData.roomType = 'Day Tour';
    } else {
      // Single room booking
      notificationData.bookingTypeLabel = 'Room';
      // Determine room type for single booking
      if (booking.isExclusiveResortBooking) {
        notificationData.roomType = 'Entire Resort';
        notificationData.isExclusiveResortBooking = true;
      } else {
        notificationData.roomType = 'Single Room Type';
      }
    }
    
    await addDoc(cancellationsRef, notificationData);
  } catch (err) {
    console.error('Error adding cancellation notification:', err);
  }
};