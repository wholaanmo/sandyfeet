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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Reservation Confirmed!</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your reservation has been successfully <strong style="color: #2C7A7A;">CONFIRMED</strong>!</p>
        
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Room Type(s):</strong> ${roomTypeDisplay}</p>
          ${totalRoomsCount > 0 ? `<p><strong>Total Rooms:</strong> ${totalRoomsCount}</p>` : ''}
          <p><strong>Check-in:</strong> ${checkInDate}</p>
          <p><strong>Check-out:</strong> ${checkOutDate}</p>
          <p><strong>Total Price:</strong> ₱${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
          <p><strong>Remaining Balance:</strong> ₱${(totalPrice - downPayment).toLocaleString()} (payable at the resort)</p>
        </div>
        
        ${adminNote ? `
        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #0B3B4F; margin: 0; font-size: 14px;">
            <strong>Note:</strong><br />
            ${adminNote.replace(/\n/g, '<br />')}
          </p>
        </div>
        ` : ''}
        
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong> Important Note:</strong> You can still cancel your reservation even after it has been confirmed. 
            Upon cancellation, the resort will retain the <strong>full down payment</strong>. 
          </p>
        </div>
        
        <p style="margin: 15px 0;">
          <a href="${trackerUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Your Reservation Details
          </a>
        </p>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>Thank you for choosing our resort!</p>
      </div>

          <div style="text-align: center; color: #666; font-size: 12px;">
      <p>If you have any questions, please contact our resort:</p>
      <p><strong>Phone:</strong> 09123456789</p>
      <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
      <p>Or reply to this email.</p>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Reservation Cancelled</h1>
        <div style="width: 50px; height: 3px; background-color: #dc2626; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your reservation has been <strong style="color: #dc2626;">CANCELLED</strong> by ${cancelledByText}.</p>
        
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Cancelled Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Room Type(s):</strong> ${roomTypeDisplay}</p>
          ${totalRoomsCount > 0 ? `<p><strong>Total Rooms:</strong> ${totalRoomsCount}</p>` : ''}
          <p><strong>Check-in:</strong> ${checkInDate}</p>
          <p><strong>Check-out:</strong> ${checkOutDate}</p>
          <p><strong>Total Price:</strong> ₱${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
        </div>
        
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; ">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong>Cancellation Reason:</strong> ${reason}
          </p>
${cancelledBy === 'guest' ? `
  <p style="color: #e65100; margin: 10px 0 0 0; font-size: 14px;">
    <strong>Refund Policy:</strong> The full down payment will be retained by the resort in accordance with our cancellation policy.
  </p>
` : ''}
        </div>
        
        <p style="margin: 15px 0;">
          <a href="${trackerUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Cancellation Details
          </a>
        </p>
      </div>

          <div style="text-align: center; color: #666; font-size: 12px;">
      <p>If you have any questions, please contact our resort:</p>
      <p><strong>Phone:</strong> 09123456789</p>
      <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
      <p>Or reply to this email.</p>
    </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Reservation Cancelled - ${bookingId}`, emailContent);
}

export async function sendRefundNotificationEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  
  // Handle multi-room booking display for total price
  let totalPrice = booking.totalPrice;
  let downPayment = totalPrice * 0.5;
  let refundAmount = downPayment * 0.5; // 50% of down payment
  
  // If this is a multi-room group, totalPrice is already aggregated
  // If it's a single booking, use the booking's totalPrice
  
const emailContent = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Cancellation Notification</h1>
      <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
    </div>
    
    <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
      
      <p style="color: #0B3B4F; font-size: 16px;">
        We have received and confirmed your reservation cancellation request.
      </p>

      <p style="color: #0B3B4F; font-size: 16px;">
        Based on the resort’s cancellation policy, the <strong>full down payment will be retained by the resort</strong> and is <strong>non-refundable</strong>.
      </p>
      
      <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3 style="color: #0B3B4F; margin-bottom: 10px;">Cancellation Details:</h3>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Total Amount:</strong> ₱${totalPrice.toLocaleString()}</p>
        <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
        <p><strong>Amount Retained by Resort:</strong> ₱${downPayment.toLocaleString()}</p>
        <p><strong>Refund Amount:</strong> ₱0</p>
      </div>
      
      <p style="color: #0B3B4F;">
        Thank you for your understanding. We appreciate your interest in our resort and hope to welcome you in the future.
      </p>
    </div>
    
    <div style="text-align: center; color: #666; font-size: 12px;">
      <p>If you have any questions, please contact our resort:</p>
      <p><strong>Phone:</strong> 09123456789</p>
      <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
      <p>Or reply to this email.</p>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Reservation Date Change</h1>
        <div style="width: 50px; height: 3px; background-color: #3B82F6; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">We have received your cancellation request, along with the reason you provided.</p>
        
        <div style="background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Original Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          ${isDayTour ? `
            <p><strong>Tour Date:</strong> ${formatDateOnly(booking.selectedDate)}</p>
          ` : `
            <p><strong>Room Type(s):</strong> ${roomTypeDisplay}</p>
            <p><strong>Original Check-in:</strong> ${originalCheckIn}</p>
            <p><strong>Original Check-out:</strong> ${originalCheckOut}</p>
          `}
          <p><strong>Total Price:</strong> ₱${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
        </div>
        
        <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #92400E; margin: 0; font-size: 14px;">
            <i class="fas fa-calendar-alt mr-2"></i>
            <strong>Your reservation has been successfully updated to your preferred date!</strong>
          </p>
          <p style="color: #92400E; margin: 10px 0 0 0; font-size: 14px;">
              We will also send your reservation reference number so you can easily track your booking. If you have any further questions, please feel free to contact our resort.
          </p>
        </div>
        
        ${adminMessage ? `
        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #0B3B4F; margin: 0; font-size: 14px;">
            <strong>Message from the resort:</strong><br />
            ${adminMessage.replace(/\n/g, '<br />')}
          </p>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 20px 0;">
          <p style="margin: 10px 0;">
            <strong>Contact our resort:</strong><br />
            Phone: 09123456789<br />
            Email: sandyfeetreservation@gmail.com<br />
            Or reply to this email
          </p>
        </div>
        
        <p style="margin: 15px 0;">
          <a href="${trackerUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Your Reservation
          </a>
        </p>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>We hope to accommodate your new preferred dates!</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Valid ID Request</h1>
        <div style="width: 50px; height: 3px; background-color: #3B82F6; margin: 10px auto;"></div>
      </div>
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">We kindly request that you resend a clear copy of your valid government-issued ID for your booking.</p>
        <div style="background-color: #EFF6FF; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          ${isDayTour ? `
            <p><strong>Tour Date:</strong> ${formatDateOnly(booking.selectedDate)}</p>
          ` : `
            <p><strong>Room Type(s):</strong> ${roomTypeDisplay}</p>
          `}
        </div>
        ${adminMessage ? `
        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #0B3B4F; margin: 0; font-size: 14px;">
            <strong>Message from the resort:</strong><br />
            ${adminMessage.replace(/\n/g, '<br />')}
          </p>
        </div>
        ` : ''}
        <p style="color: #0B3B4F;">Please reply to this email with your valid ID attached (front side only, clear photo). Thank you for your cooperation.</p>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>If you have any questions, please contact our resort:</p>
        <p><strong>Phone:</strong> 09123456789</p>
        <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
        <p>Or reply to this email.</p>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Day Tour Reservation Received</h1>
        <div style="width: 50px; height: 3px; background-color: #f59e0b; margin: 10px auto;"></div>
      </div>

      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">
          We received your day tour reservation. Your booking is currently
          <strong style="color: #d97706;"> PENDING ADMIN CONFIRMATION</strong>.
        </p>

        <div style="background-color: #fff7ed; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Reservation Details</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Tour Date:</strong> ${tourDate}</p>
          <p><strong>Total Guests:</strong> ${totalGuests}</p>
          <p><strong>Guest Breakdown:</strong> ${seniors} Senior(s), ${adults} Adult(s), ${kids} Kid(s)</p>
          <p><strong>Payment Method:</strong> ${paymentMethod}</p>
          <p><strong>Total Price:</strong> PHP ${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Received:</strong> PHP ${downPayment.toLocaleString()}</p>
          <p><strong>Remaining Balance:</strong> PHP ${remainingBalance.toLocaleString()} (payable at the resort)</p>
        </div>

        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #1d4ed8; margin: 0; font-size: 14px;">
            Use your <strong>Booking ID</strong> together with your email address in the reservation tracker to view or manage this reservation while it is pending.
          </p>
        </div>

        <p style="color: #0B3B4F; font-size: 15px;">
          Once the resort admin confirms your reservation, we will send you a separate confirmation email.
        </p>

        <p style="margin: 15px 0;">
          <a href="${trackerUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Open Reservation Tracker
          </a>
        </p>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>If you have any questions, please contact our resort:</p>
        <p><strong>Phone:</strong> 09123456789</p>
        <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
        <p>Or reply to this email.</p>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Day Tour Reservation Confirmed!</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your day tour reservation has been successfully <strong style="color: #2C7A7A;">CONFIRMED</strong>!</p>
        
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Tour Date:</strong> ${tourDate}</p>
          <p><strong>Number of Guests:</strong> ${totalGuests}</p>
          <p><strong>Guest Breakdown:</strong> ${seniors} Senior(s), ${adults} Adult(s), ${kids} Kid(s)</p>
          <p><strong>Total Price:</strong> ₱${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
          <p><strong>Remaining Balance:</strong> ₱${(totalPrice - downPayment).toLocaleString()} (payable at the resort)</p>
        </div>
        
        ${adminNote ? `
        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #0B3B4F; margin: 0; font-size: 14px;">
            <strong>Note:</strong><br />
            ${adminNote.replace(/\n/g, '<br />')}
          </p>
        </div>
        ` : ''}
        
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong> Important Note:</strong> You can still cancel your day tour reservation even after it has been confirmed. 
            Upon cancellation, the system will retain <strong>50% of the down payment</strong>.
          </p>
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>Thank you for choosing our resort for your day tour!</p>
      </div>

          <div style="text-align: center; color: #666; font-size: 12px;">
      <p>If you have any questions, please contact our resort:</p>
      <p><strong>Phone:</strong> 09123456789</p>
      <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
      <p>Or reply to this email.</p>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Day Tour Reservation Cancelled</h1>
        <div style="width: 50px; height: 3px; background-color: #dc2626; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your day tour reservation has been <strong style="color: #dc2626;">CANCELLED</strong> by ${cancelledByText}.</p>
        
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Cancelled Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Tour Date:</strong> ${tourDate}</p>
          <p><strong>Total Price:</strong> ₱${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
        </div>
        
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0; ">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong>Cancellation Reason:</strong> ${reason}
          </p>
${cancelledBy === 'guest' ? `
  <p style="color: #e65100; margin: 10px 0 0 0; font-size: 14px;">
    <strong>Refund Policy:</strong> The full down payment will be retained by the resort in accordance with our cancellation policy.
  </p>
` : ''}
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>We hope to welcome you for a day tour in the future!</p>
      </div>

          <div style="text-align: center; color: #666; font-size: 12px;">
      <p>If you have any questions, please contact our resort:</p>
      <p><strong>Phone:</strong> 09123456789</p>
      <p><strong>Email:</strong> sandyfeetreservation@gmail.com</p>
      <p>Or reply to this email.</p>
    </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Day Tour Reservation Cancelled - ${bookingId}`, emailContent);
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
