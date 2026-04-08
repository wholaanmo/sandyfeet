// lib/emailService.js

export async function sendConfirmationEmail(booking, adminNote = '') {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const checkInDate = formatDateForEmail(booking.checkIn);
  const checkOutDate = formatDateForEmail(booking.checkOut);
  const roomType = booking.roomType;
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  
  const trackerUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')}/reservation-tracker`;
  
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
          <p><strong>Room Type:</strong> ${roomType}</p>
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
            Upon cancellation, the system will retain <strong>50% of the down payment</strong>. This policy is clearly enforced by the system.
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
        <p>If you have any questions, please don't hesitate to contact us.</p>
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
  const roomType = booking.roomType;
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  
  const cancelledByText = cancelledBy === 'admin' ? 'the resort administrator' : 'you';
  const trackerUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')}/reservation-tracker`;
  
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
          <p><strong>Room Type:</strong> ${roomType}</p>
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
    <strong>Refund Policy:</strong> 50% of the down payment will be retained by the resort in accordance with our cancellation policy.
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
        <p>We hope to welcome you in the future!</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
      </div>
    </div>
  `;
  
  return await sendEmail(guestEmail, `Reservation Cancelled - ${bookingId}`, emailContent);
}

export async function sendRefundNotificationEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const totalPrice = booking.totalPrice;
  const downPayment = totalPrice * 0.5;
  const refundAmount = downPayment * 0.5; // 50% of down payment

  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Refund Notification</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">We have processed the refund for your cancelled reservation.</p>
        
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Refund Details:</h3>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Total Amount:</strong> ₱${totalPrice.toLocaleString()}</p>
          <p><strong>Down Payment Paid:</strong> ₱${downPayment.toLocaleString()}</p>
          <p><strong>Refund Amount (50% of Down Payment):</strong> ₱${refundAmount.toLocaleString()}</p>
        </div>
        
        <p style="color: #0B3B4F;">The refund has been credited back to your original payment method. Please allow 3-5 business days for the amount to reflect in your account.</p>
        <p style="color: #0B3B4F;">Thank you for choosing our resort, and we hope to welcome you in the future!</p>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>If you have any questions, please don't hesitate to contact us.</p>
      </div>
    </div>
  `;

  return await sendEmail(guestEmail, `Refund Processed - ${bookingId}`, emailContent);
}

export async function sendMoveDateNotificationEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const originalCheckIn = formatDateForEmail(booking.checkIn);
  const originalCheckOut = formatDateForEmail(booking.checkOut);
  const roomType = booking.roomType;

  const trackerUrl = `${process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')}/reservation-tracker`;
  
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
          <p><strong>Room Type:</strong> ${roomType}</p>
          <p><strong>Original Check-in:</strong> ${originalCheckIn}</p>
          <p><strong>Original Check-out:</strong> ${originalCheckOut}</p>
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

// Day Tour Email Functions
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
        <p>If you have any questions, please don't hesitate to contact us.</p>
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
    <strong>Refund Policy:</strong> 50% of the down payment will be retained by the resort in accordance with our cancellation policy.
` : ''}
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>We hope to welcome you for a day tour in the future!</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
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
    // Build absolute URL for the internal API endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
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
    console.log('Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw – email failure shouldn't break the main flow
    return { success: false, error: error.message };
  }
}