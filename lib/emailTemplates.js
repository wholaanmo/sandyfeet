/** Pure HTML builders + date helpers (safe for server and client import). */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDateForEmail(timestamp) {
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

    if (Number.isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }

    return dateObj.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

export function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
}

function trackerUrl(baseUrl) {
  const b = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${b.replace(/\/$/, '')}/reservation-tracker`;
}

export function buildPasswordResetEmailHtml(resetLink, name = '') {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Reset Your Password</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      <div style="background-color: white; border-radius: 12px; padding: 20px;">
        <p style="color: #0B3B4F;">Hello${name ? ` ${name}` : ''},</p>
        <p>We received a request to reset your password. Click the button below to set a new password. This link will expire in <strong>15 minutes</strong>.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Reset Password</a>
        </p>
        <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
      </div>
    </div>
  `;
}

export function buildRoomConfirmationEmail(booking, baseUrl) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const checkInDate = formatDateForEmail(booking.checkIn);
  const checkOutDate = formatDateForEmail(booking.checkOut);
  const roomType = booking.roomType;
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  const tUrl = trackerUrl(baseUrl);

  const html = `
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
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong> Important Note:</strong> You can still cancel your reservation even after it has been confirmed.
            Upon cancellation, the system will retain <strong>50% of the down payment</strong>. This policy is clearly enforced by the system.
          </p>
        </div>
        <p style="margin: 15px 0;">
          <a href="${tUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
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
  return { to: guestEmail, subject: `Reservation Confirmed - ${bookingId}`, html };
}

export function buildRoomCancellationEmail(booking, reason, cancelledBy, baseUrl) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const checkInDate = formatDateForEmail(booking.checkIn);
  const checkOutDate = formatDateForEmail(booking.checkOut);
  const roomType = booking.roomType;
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  const cancelledByText = cancelledBy === 'admin' ? 'the resort administrator' : 'you';
  const tUrl = trackerUrl(baseUrl);
  const guestPolicy =
    cancelledBy === 'guest'
      ? `
  <p style="color: #e65100; margin: 10px 0 0 0; font-size: 14px;">
    <strong>Refund Policy:</strong> 50% of the down payment will be retained by the resort in accordance with our cancellation policy.
  </p>
`
      : '';

  const html = `
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
            <strong>Cancellation Reason:</strong> ${escapeHtml(reason)}
          </p>
          ${guestPolicy}
        </div>
        <p style="margin: 15px 0;">
          <a href="${tUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
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
  return { to: guestEmail, subject: `Reservation Cancelled - ${bookingId}`, html };
}

export function buildRefundNotificationEmail(booking) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const totalPrice = booking.totalPrice;
  const downPayment = totalPrice * 0.5;
  const refundAmount = downPayment * 0.5;

  const html = `
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
  return { to: guestEmail, subject: `Refund Processed - ${bookingId}`, html };
}

export function buildMoveDateNotificationEmail(booking, baseUrl) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const originalCheckIn = formatDateForEmail(booking.checkIn);
  const originalCheckOut = formatDateForEmail(booking.checkOut);
  const roomType = booking.roomType;
  const tUrl = trackerUrl(baseUrl);

  const html = `
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
          <a href="${tUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
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
  return { to: guestEmail, subject: `Reservation Date Change - ${bookingId}`, html };
}

export function buildDayTourConfirmationEmail(booking) {
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

  const html = `
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
  return { to: guestEmail, subject: `Day Tour Reservation Confirmed - ${bookingId}`, html };
}

export function buildDayTourCancellationEmail(booking, reason, cancelledBy) {
  const guestEmail = booking.guestInfo?.email;
  const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
  const bookingId = booking.bookingId;
  const tourDate = formatDateOnly(booking.selectedDate);
  const totalPrice = booking.totalPrice;
  const downPayment = booking.totalPrice * 0.5;
  const cancelledByText = cancelledBy === 'admin' ? 'the resort administrator' : 'you';
  const guestPolicy =
    cancelledBy === 'guest'
      ? `
  <p style="color: #e65100; margin: 10px 0 0 0; font-size: 14px;">
    <strong>Refund Policy:</strong> 50% of the down payment will be retained by the resort in accordance with our cancellation policy.
  </p>
`
      : '';

  const html = `
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
            <strong>Cancellation Reason:</strong> ${escapeHtml(reason)}
          </p>
          ${guestPolicy}
        </div>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>We hope to welcome you for a day tour in the future!</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
      </div>
    </div>
  `;
  return { to: guestEmail, subject: `Day Tour Reservation Cancelled - ${bookingId}`, html };
}

export function buildStaffVerificationEmailHtml(email, name, verificationLink, role) {
  const displayRole = role === 'admin' ? 'Admin' : 'Staff Member';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Welcome to Sandy Feet Resort!</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${name}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your staff account has been created for the Sandy Feet Resort management system.</p>
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Account Details:</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> ${displayRole}</p>
        </div>
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong>Important:</strong> Please verify your email address to activate your account. The verification link will expire in <strong>15 minutes</strong>.
          </p>
        </div>
        <p style="margin: 15px 0; text-align: center;">
          <a href="${verificationLink}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p style="color: #666; font-size: 12px; text-align: center; margin-top: 15px;">
          Or copy and paste this link into your browser:<br>
          <span style="color: #2C7A7A;">${verificationLink}</span>
        </p>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>If you did not request this account, please ignore this email.</p>
        <p>&copy; ${new Date().getFullYear()} Sandy Feet Resort. All rights reserved.</p>
      </div>
    </div>
  `;
  return { to: email, subject: 'Verify Your Account - Sandy Feet Resort', html };
}

export function buildStaffWelcomeEmailHtml(email, name, baseUrl) {
  const b = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const loginUrl = `${b.replace(/\/$/, '')}/login`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Email Verified Successfully!</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${name}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your email address has been successfully verified! Your account is now <strong style="color: #2C7A7A;">ACTIVE</strong>.</p>
        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Next Steps:</h3>
          <p>1. Click the button below to log in to your account</p>
          <p>2. Use your email address and the password provided by the administrator</p>
          <p>3. You can change your password after logging in</p>
        </div>
        <p style="margin: 15px 0; text-align: center;">
          <a href="${loginUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Login to Your Account
          </a>
        </p>
      </div>
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>Welcome to the team!</p>
        <p>&copy; ${new Date().getFullYear()} Sandy Feet Resort. All rights reserved.</p>
      </div>
    </div>
  `;
  return { to: email, subject: 'Welcome to Sandy Feet Resort - Account Activated', html };
}
