// lib/emailService.js

function resolveBaseUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

export async function sendConfirmationEmail(booking, adminNote = '') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const checkInDate = formatDateForEmail(booking.checkIn);
  const checkOutDate = formatDateForEmail(booking.checkOut);
  
  // Handle multi-room booking display
  let roomTypeDisplay = '';
  let totalRoomsCount = 0;
  let totalPrice = booking.totalPrice;
  let downPayment = booking.totalPrice * 0.5;
  
  if (booking.isMultiRoomGroup && booking.roomTypesDisplay) {
    // This is a multi-room booking from admin view
    roomTypeDisplay = booking.roomTypesDisplay;
    totalRoomsCount = booking.totalRooms || 0;
  } else if (booking.isMultiRoomBooking && booking.parentBookingId) {
    // This is a child booking of a multi-room booking - should not happen for confirmation
    // Fall back to single room display
    roomTypeDisplay = booking.roomType;
    totalRoomsCount = 1;
  } else if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 0) {
    // This is a multi-room booking from the booking data
    const roomTypeStrings = booking.roomTypes.map(rt => 
      `${rt.quantity} × ${rt.type} (${rt.guestsPerRoom || 1} guest${(rt.guestsPerRoom || 1) !== 1 ? 's' : ''})`
    );
    roomTypeDisplay = roomTypeStrings.join(', ');
    totalRoomsCount = booking.roomTypes.reduce((sum, rt) => sum + rt.quantity, 0);
  } else {
    // Single room booking
    roomTypeDisplay = booking.roomType;
    totalRoomsCount = booking.numberOfRooms || 1;
  }
  
  const trackerUrl = `${resolveBaseUrl()}/reservation-tracker`;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Reservation Confirmed</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #059669; text-transform: uppercase; letter-spacing: 1px;">Room Booking</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>Your reservation at SandyFeet Resort has been successfully <strong>confirmed</strong>. We look forward to welcoming you!</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Booking Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Room Type(s):</span> <strong>${roomTypeDisplay}</strong></p>
        ${totalRoomsCount > 0 ? `<p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Rooms:</span> <strong>${totalRoomsCount}</strong></p>` : ''}
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-in:</span> <strong>${checkInDate}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-out:</span> <strong>${checkOutDate}</strong></p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #eeeeee;">
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Price:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px; color: #111111;"><span style="color: #999999; width: 140px; display: inline-block;">Balance:</span> <strong>₱${(totalPrice - downPayment).toLocaleString()}</strong></p>
        </div>
      </div>

      ${adminNote ? `
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Note from Resort:</strong><br />${adminNote.replace(/\n/g, '<br />')}</p>
      </div>
      ` : ''}

      <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fef3c7;">
        <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Cancellation Policy:</strong> You may cancel this reservation, but the full down payment will be retained by the resort unless the booking is rescheduled.</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackerUrl}" style="background-color: #111111; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">Manage Reservation</a>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Reservation Confirmed - ${bookingId}`, emailContent);
}

export async function sendCancellationEmail(booking, reason, cancelledBy = 'admin') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const checkInDate = formatDateForEmail(booking.checkIn);
  const checkOutDate = formatDateForEmail(booking.checkOut);
  
  // Handle multi-room booking display
  let roomTypeDisplay = '';
  let totalRoomsCount = 0;
  let totalPrice = booking.totalPrice;
  let downPayment = booking.totalPrice * 0.5;
  
  if (booking.isMultiRoomGroup && booking.roomTypesDisplay) {
    // This is a multi-room booking from admin view
    roomTypeDisplay = booking.roomTypesDisplay;
    totalRoomsCount = booking.totalRooms || 0;
  } else if (booking.isMultiRoomBooking && booking.parentBookingId) {
    // This is a child booking of a multi-room booking
    roomTypeDisplay = booking.roomType;
    totalRoomsCount = 1;
  } else if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 0) {
    // This is a multi-room booking from the booking data
    const roomTypeStrings = booking.roomTypes.map(rt => 
      `${rt.quantity} × ${rt.type} (${rt.guestsPerRoom || 1} guest${(rt.guestsPerRoom || 1) !== 1 ? 's' : ''})`
    );
    roomTypeDisplay = roomTypeStrings.join(', ');
    totalRoomsCount = booking.roomTypes.reduce((sum, rt) => sum + rt.quantity, 0);
  } else {
    // Single room booking
    roomTypeDisplay = booking.roomType;
    totalRoomsCount = booking.numberOfRooms || 1;
  }
  
  const cancelledByText = cancelledBy === 'admin' ? 'the resort' : 'you';
  const trackerUrl = `${resolveBaseUrl()}/reservation-tracker`;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Reservation Cancelled</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #dc2626; text-transform: uppercase; letter-spacing: 1px;">Room Booking</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>Your reservation at SandyFeet Resort has been <strong>cancelled</strong> by ${cancelledByText}.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Cancelled Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Room Type(s):</span> <strong>${roomTypeDisplay}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-in:</span> <strong>${checkInDate}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-out:</span> <strong>${checkOutDate}</strong></p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #eeeeee;">
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Price:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
        </div>
      </div>

      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Reason:</strong> ${reason}</p>
        ${cancelledBy === 'guest' ? `
          <p style="margin: 10px 0 0; font-size: 13px; color: #991b1b;"><strong>Refund Policy:</strong> The full down payment will be retained by the resort in accordance with our cancellation policy. If you reschedule your booking, please wait for another confirmation email confirming that your requested schedule has been successfully updated.</p>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Reservation Cancelled - ${bookingId}`, emailContent);
}

export async function sendRefundNotificationEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  
  let totalPrice = booking.totalPrice;
  let downPayment = totalPrice * 0.5;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Cancellation Update</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Refund Policy Notice</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>We have received and confirmed your reservation cancellation request.</p>
      <p>In accordance with our policy, please be informed that the <strong>full down payment will be retained by the resort</strong> and is non-refundable.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Booking Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Amount:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
        <p style="margin: 5px 0; font-size: 14px; color: #991b1b;"><span style="color: #999999; width: 140px; display: inline-block;">Amount Retained:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Refund Amount:</span> <strong>₱0</strong></p>
      </div>

      <p style="font-size: 14px; color: #666666;">We appreciate your understanding and hope to welcome you in the future.</p>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;

  return await sendEmail(guestEmail, `Cancellation Notification - ${bookingId}`, emailContent);
}

export async function sendMoveDateNotificationEmail(booking, adminMessage = '') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const originalCheckIn = formatDateForEmail(booking.checkIn);
  const originalCheckOut = formatDateForEmail(booking.checkOut);
  const totalPrice = booking.totalPrice || 0;
  const downPayment = totalPrice * 0.5;
  
  // Check if this is a day tour booking
  const isDayTour = booking.selectedDate !== undefined;
  
  // Handle room type display for room bookings
  let roomTypeDisplay = '';
  if (!isDayTour) {
    if (booking.isMultiRoomGroup && booking.roomTypesDisplay) {
      roomTypeDisplay = booking.roomTypesDisplay;
    } else if (booking.isMultiRoomBooking && booking.parentBookingId) {
      roomTypeDisplay = booking.roomType;
    } else if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 0) {
      const roomTypeStrings = booking.roomTypes.map(rt => 
        `${rt.quantity} × ${rt.type} (${rt.guestsPerRoom || 1} guest${(rt.guestsPerRoom || 1) !== 1 ? 's' : ''})`
      );
      roomTypeDisplay = roomTypeStrings.join(', ');
    } else {
      roomTypeDisplay = booking.roomType;
    }
  }

  const trackerUrl = `${resolveBaseUrl()}/reservation-tracker`;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Date Changed</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #3b82f6; text-transform: uppercase; letter-spacing: 1px;">Reservation Update</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>We have successfully updated your reservation to your newly preferred date as requested.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Previous Reservation Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        ${isDayTour ? `
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Tour Date:</span> <strong>${formatDateOnly(booking.selectedDate)}</strong></p>
        ` : `
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-in:</span> <strong>${originalCheckIn}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-out:</span> <strong>${originalCheckOut}</strong></p>
        `}
      </div>

      ${adminMessage ? `
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Note from Resort:</strong><br />${adminMessage.replace(/\n/g, '<br />')}</p>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackerUrl}" style="background-color: #111111; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">Manage Reservation</a>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;

  return await sendEmail(guestEmail, `Reservation Date Change - ${bookingId}`, emailContent);
}

export async function sendIdRequestEmail(booking, adminMessage = '') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  
  // Check if this is a day tour booking
  const isDayTour = booking.selectedDate !== undefined;
  
  // Build room type display string (for room bookings) with proper formatting
  let roomTypeDisplay = '';
  if (!isDayTour) {
    if (booking.isExclusiveResortBooking) {
      roomTypeDisplay = 'Entire Resort';
      if (booking.tentCount > 0) {
        roomTypeDisplay += ` + ${booking.tentCount} Tent(s)`;
      }
    } else if (booking.roomTypesDisplay) {
      // Use existing display if available
      roomTypeDisplay = booking.roomTypesDisplay;
    } else if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 0) {
      // Format multi-room types with quantities
      const roomTypeStrings = booking.roomTypes.map(rt => 
        `${rt.quantity} × ${rt.type}`
      );
      roomTypeDisplay = roomTypeStrings.join(', ');
    } else if (booking.roomType && booking.numberOfRooms && booking.numberOfRooms > 1) {
      // Single room type with multiple units
      roomTypeDisplay = `${booking.numberOfRooms} × ${booking.roomType}`;
    } else if (booking.roomType) {
      // Single room type single unit
      roomTypeDisplay = `1 × ${booking.roomType}`;
    } else {
      roomTypeDisplay = 'Room';
    }
  }
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">ID Request</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #3b82f6; text-transform: uppercase; letter-spacing: 1px;">Action Required</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>To finalize your reservation at SandyFeet Resort, we kindly request a clear copy of your valid government-issued ID.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Booking Reference</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        ${isDayTour ? `
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Tour Date:</span> <strong>${formatDateOnly(booking.selectedDate)}</strong></p>
        ` : `
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Room Type(s):</span> <strong>${roomTypeDisplay}</strong></p>
        `}
      </div>

      ${adminMessage ? `
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Note from Resort:</strong><br />${adminMessage.replace(/\n/g, '<br />')}</p>
      </div>
      ` : ''}

      <p style="font-size: 14px;">Please reply directly to this email and attach a clear photo of your ID (front side). Thank you for your cooperation.</p>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;

  return await sendEmail(guestEmail, `ID Request - ${bookingId}`, emailContent);
}

// Day Tour Email Functions
export async function sendDayTourPendingEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const tourDate = formatDateOnly(booking.selectedDate);
  const totalPrice = booking.totalPrice || 0;
  const downPayment = booking.downPayment ?? totalPrice * 0.5;
  const remainingBalance = Math.max(totalPrice - downPayment, 0);
  const adults = booking.adults || 0;
  const kids = booking.kids || 0;
  const seniors = booking.seniors || 0;
  const totalGuests = adults + kids + seniors;
  const paymentMethod =
    booking.paymentMethod === 'bank'
      ? 'Bank Transfer'
      : booking.paymentMethod === 'gcash'
        ? 'GCash'
        : booking.paymentMethod || 'Online Payment';
  const trackerUrl = `${resolveBaseUrl()}/reservation-tracker`;

  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Reservation Received</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #f59e0b; text-transform: uppercase; letter-spacing: 1px;">Pending Confirmation • Day Tour</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>We have received your day tour reservation request. Your booking is currently <strong>pending administrator confirmation</strong>.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Reservation Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Tour Date:</span> <strong>${tourDate}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Guests:</span> <strong>${totalGuests}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Guest Breakdown:</span> <strong>${adults} Adult, ${kids} Kid</strong></p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #eeeeee;">
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Price:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px; color: #111111;"><span style="color: #999999; width: 140px; display: inline-block;">Balance:</span> <strong>₱${remainingBalance.toLocaleString()}</strong></p>
        </div>
      </div>

      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;">You will receive a separate confirmation email once the resort admin confirms your reservation.</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackerUrl}" style="background-color: #111111; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">Track Reservation</a>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;

  return await sendEmail(guestEmail, `Day Tour Reservation Received - ${bookingId}`, emailContent);
}

export async function sendDayTourConfirmationEmail(booking, adminNote = '') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const tourDate = formatDateOnly(booking.selectedDate);
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  const seniors = booking.seniors || 0;
  const adults = booking.adults || 0;
  const kids = booking.kids || 0;
  const totalGuests = seniors + adults + kids;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Reservation Confirmed</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #059669; text-transform: uppercase; letter-spacing: 1px;">Day Tour Booking</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>Your day tour reservation at SandyFeet Resort has been successfully <strong>confirmed</strong>. We look forward to seeing you!</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Booking Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Tour Date:</span> <strong>${tourDate}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Guests:</span> <strong>${totalGuests}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Guest Breakdown:</span> <strong>${seniors} Sen, ${adults} Adu, ${kids} Kid</strong></p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #eeeeee;">
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Price:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px; color: #111111;"><span style="color: #999999; width: 140px; display: inline-block;">Balance:</span> <strong>₱${(totalPrice - downPayment).toLocaleString()}</strong></p>
        </div>
      </div>

      ${adminNote ? `
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Note from Resort:</strong><br />${adminNote.replace(/\n/g, '<br />')}</p>
      </div>
      ` : ''}

      <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fef3c7;">
        <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Cancellation Policy:</strong> You may cancel this day tour reservation, but the full down payment will be retained by the resort unless the booking is rescheduled.</p>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Day Tour Reservation Confirmed - ${bookingId}`, emailContent);
}

export async function sendDayTourCancellationEmail(booking, reason, cancelledBy = 'admin') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const tourDate = formatDateOnly(booking.selectedDate);
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  
  const cancelledByText = cancelledBy === 'admin' ? 'the resort administrator' : 'you';
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Reservation Cancelled</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #dc2626; text-transform: uppercase; letter-spacing: 1px;">Day Tour Booking</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>Your day tour reservation at SandyFeet Resort has been <strong>cancelled</strong> by ${cancelledByText}.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Cancelled Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Tour Date:</span> <strong>${tourDate}</strong></p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #eeeeee;">
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Price:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
        </div>
      </div>

      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Reason:</strong> ${reason}</p>
        ${cancelledBy === 'guest' ? `
          <p style="margin: 10px 0 0; font-size: 13px; color: #991b1b;"><strong>Refund Policy:</strong> The full down payment will be retained by the resort in accordance with our cancellation policy. If you reschedule your booking, please wait for another confirmation email confirming that your requested schedule has been successfully updated.</p>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Day Tour Reservation Cancelled - ${bookingId}`, emailContent);
}

export async function sendRoomPendingEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const checkInDate = formatDateForEmail(booking.checkIn);
  const checkOutDate = formatDateForEmail(booking.checkOut);
  const totalPrice = booking.totalPrice || 0;
  const downPayment = booking.downPayment || totalPrice * 0.5;
  const remainingBalance = totalPrice - downPayment;
  
  // Handle room type display
  let roomTypeDisplay = '';
  let totalRoomsCount = 0;
  
  if (booking.isExclusiveResortBooking) {
    roomTypeDisplay = 'Entire Resort';
    if (booking.tentCount > 0) {
      roomTypeDisplay += ` + ${booking.tentCount} Tent(s)`;
    }
    totalRoomsCount = booking.totalRooms || 0;
  } else if (booking.roomTypesDisplay) {
    roomTypeDisplay = booking.roomTypesDisplay;
    totalRoomsCount = booking.totalRooms || 0;
  } else if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 0) {
    const roomTypeStrings = booking.roomTypes.map(rt => 
      `${rt.quantity} × ${rt.type}`
    );
    roomTypeDisplay = roomTypeStrings.join(', ');
    totalRoomsCount = booking.roomTypes.reduce((sum, rt) => sum + rt.quantity, 0);
  } else {
    roomTypeDisplay = 'Room';
    totalRoomsCount = 1;
  }
  
  const trackerUrl = `${resolveBaseUrl()}/reservation-tracker`;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Reservation Received</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #f59e0b; text-transform: uppercase; letter-spacing: 1px;">Pending Confirmation • Room Booking</p>
      </div>

      <p>Dear <strong>${guestName}</strong>,</p>
      <p>We have received your room reservation request. Your booking is currently <strong>pending administrator confirmation</strong>.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Reservation Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${bookingId}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Room Type(s):</span> <strong>${roomTypeDisplay}</strong></p>
        ${totalRoomsCount > 0 ? `<p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Rooms:</span> <strong>${totalRoomsCount}</strong></p>` : ''}
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-in:</span> <strong>${checkInDate}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-out:</span> <strong>${checkOutDate}</strong></p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #eeeeee;">
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Total Price:</span> <strong>₱${totalPrice.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Down Payment:</span> <strong>₱${downPayment.toLocaleString()}</strong></p>
          <p style="margin: 5px 0; font-size: 14px; color: #111111;"><span style="color: #999999; width: 140px; display: inline-block;">Balance:</span> <strong>₱${remainingBalance.toLocaleString()}</strong></p>
        </div>
      </div>

        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;">You will receive a separate confirmation email once the resort admin confirms your reservation.</p>
      </div>

      ${booking.specialRequest ? `
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Special Request:</strong><br />${booking.specialRequest}</p>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackerUrl}" style="background-color: #111111; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">Track Reservation</a>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • 09123456789 • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Room Reservation Received - ${bookingId} (Pending Confirmation)`, emailContent);
}

function formatDateForEmail(timestamp) {
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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    console.error('Error formatting date for email:', error);
    return 'Invalid Date';
  }
}

function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

async function sendEmail(to, subject, htmlContent) {
  try {
    const baseUrl = resolveBaseUrl();
    const url = `${baseUrl}/api/send-email`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send email');
    }

    const result = await response.json();
    if (result?.success === false) {
      throw new Error(result.error || 'Email service returned an unsuccessful response');
    }

    console.log('Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw – email failure shouldn't break the main flow
    return { success: false, error: error.message };
  }
}
