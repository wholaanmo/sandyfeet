// app/dashboard/admin/reservations/components/AdminActionReasonModal.js
'use client';

import { useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  resolveChangeRequestFromBooking,
  resolveBookingTypeLabel,
} from './AdminRequestChangesModal';

function resolveBaseUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
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

function formatDateOnly(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
}

function buildReservationDetailsHtml(booking) {
  const isDayTour = booking.type === 'daytour' || booking.selectedDate !== undefined;

  if (isDayTour) {
    const adults = booking.adults || 0;
    const kids = booking.kids || 0;
    const seniors = booking.seniors || 0;
    return `
      <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Tour Date:</span> <strong>${formatDateOnly(booking.selectedDate)}</strong></p>
      <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Guests:</span> <strong>Adult: ${adults} | Kid: ${kids}${seniors ? ` | Senior: ${seniors}` : ''}</strong></p>
    `;
  }

  let roomTypeDisplay = '';
  if (booking.isExclusiveResortBooking) {
    roomTypeDisplay = 'Entire Resort';
    if (booking.tentCount > 0) {
      roomTypeDisplay += ` + ${booking.tentCount} Tent(s)`;
    }
  } else if (booking.roomTypesDisplay) {
    roomTypeDisplay = booking.roomTypesDisplay;
  } else if (booking.roomTypesArray?.length > 0) {
    roomTypeDisplay = booking.roomTypesArray.map((r) => `${r.quantity} × ${r.type}`).join(', ');
  } else if (booking.roomType) {
    roomTypeDisplay = booking.numberOfRooms > 1
      ? `${booking.numberOfRooms} × ${booking.roomType}`
      : booking.roomType;
  } else {
    roomTypeDisplay = 'Room';
  }

  return `
    <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Room Type(s):</span> <strong>${escapeHtml(roomTypeDisplay)}</strong></p>
    <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-in:</span> <strong>${formatDateForEmail(booking.checkIn)}</strong></p>
    <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Check-out:</span> <strong>${formatDateForEmail(booking.checkOut)}</strong></p>
  `;
}

function buildChangeRequestResponseEmailHtml({ booking, action, reason, requestedChanges }) {
  const isApproved = action === 'approve';
  const statusLabel = isApproved ? 'Confirmed' : 'Cancelled';
  const statusColor = isApproved ? '#059669' : '#dc2626';
  const bookingTypeLabel = resolveBookingTypeLabel(booking);
  const guestName = `${booking.guestInfo?.firstName || ''} ${booking.guestInfo?.lastName || ''}`.trim() || 'Guest';
  const bookingId = booking.bookingId || 'N/A';
  const trackerUrl = `${resolveBaseUrl()}/my-bookings`;
  const safeReason = escapeHtml(reason).replace(/\n/g, '<br />');
  const safeRequestedChanges = escapeHtml(requestedChanges || 'No details provided.').replace(/\n/g, '<br />');
  const subtitle = booking.type === 'daytour' ? 'Day Tour Booking' : 'Room Booking';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Change Request Update</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: ${statusColor}; text-transform: uppercase; letter-spacing: 1px;">${statusLabel}</p>
        <p style="margin: 5px 0 0; font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(subtitle)}</p>
      </div>

      <p>Dear <strong>${escapeHtml(guestName)}</strong>,</p>
      <p>Your change request for your SandyFeet Resort reservation has been reviewed. The resort has <strong>${statusLabel.toLowerCase()}</strong> your requested changes.</p>

      <div style="border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee; padding: 20px 0; margin: 25px 0;">
        <h2 style="margin: 0 0 15px; font-size: 14px; font-weight: bold; color: #999999; text-transform: uppercase;">Reservation Details</h2>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking ID:</span> <strong>${escapeHtml(bookingId)}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Booking Type:</span> <strong>${escapeHtml(bookingTypeLabel)}</strong></p>
        <p style="margin: 5px 0; font-size: 14px;"><span style="color: #999999; width: 140px; display: inline-block;">Request Status:</span> <strong style="color: ${statusColor};">${statusLabel}</strong></p>
        ${buildReservationDetailsHtml(booking)}
      </div>

      <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fef3c7;">
        <p style="margin: 0 0 8px; font-size: 14px; color: #92400e;"><strong>Your requested changes:</strong></p>
        <p style="margin: 0; font-size: 14px; color: #78350f;">${safeRequestedChanges}</p>
      </div>

      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Note from Resort:</strong><br />${safeReason}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackerUrl}" style="background-color: #111111; color: #ffffff; padding: 7px 20px; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: bold; display: inline-block;">View My Bookings</a>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999;">
        <p style="margin: 0;">SandyFeet Resort • sandyfeetreservation@gmail.com</p>
      </div>
    </div>
  `;
}

async function sendChangeRequestResponseEmail({ booking, action, reason, requestedChanges }) {
  const guestEmail = booking?.guestInfo?.email?.trim();
  if (!guestEmail) {
    console.warn('Change request email skipped: guest email missing');
    return { success: false, skipped: true };
  }

  const isApproved = action === 'approve';
  const statusLabel = isApproved ? 'Confirmed' : 'Cancelled';
  const bookingId = booking.bookingId || 'Reservation';
  const subject = `Change Request ${statusLabel} - ${bookingId}`;
  const html = buildChangeRequestResponseEmailHtml({ booking, action, reason, requestedChanges });

  try {
    const response = await fetch(`${resolveBaseUrl()}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: guestEmail, subject, html }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to send email');
    }

    const result = await response.json();
    if (result?.success === false) {
      throw new Error(result.error || 'Email service returned an unsuccessful response');
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending change request response email:', error);
    return { success: false, error: error.message };
  }
}

export default function AdminActionReasonModal({ isOpen, action, booking, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);
  const emailSentRef = useRef(false);

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason || submitLockRef.current) return;

    submitLockRef.current = true;
    setLoading(true);

    const processedAt = new Date().toISOString();
    const changeRequest = resolveChangeRequestFromBooking(booking);
    const requestedChanges = changeRequest?.text || '';

    try {
      const isRoom = booking.type === 'room';
      const collectionName = isRoom ? 'bookings' : 'dayTourBookings';

      if (booking.originalChildBookings?.length > 0) {
        for (const childBooking of booking.originalChildBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            'changeRequest.status': action === 'approve' ? 'approved' : 'rejected',
            'changeRequest.adminReason': trimmedReason,
            'changeRequest.processedAt': processedAt,
            'changeRequest.adminNote': trimmedReason,
            updatedAt: processedAt,
          });
        }
      } else {
        const bookingRef = doc(db, collectionName, booking.id);
        await updateDoc(bookingRef, {
          'changeRequest.status': action === 'approve' ? 'approved' : 'rejected',
          'changeRequest.adminReason': trimmedReason,
          'changeRequest.processedAt': processedAt,
          'changeRequest.adminNote': trimmedReason,
          updatedAt: processedAt,
        });
      }

      if (!emailSentRef.current) {
        emailSentRef.current = true;
        await sendChangeRequestResponseEmail({
          booking,
          action,
          reason: trimmedReason,
          requestedChanges,
        });
      }

      onConfirm(trimmedReason);
      onClose();
    } catch (error) {
      console.error('Error saving admin note:', error);
      emailSentRef.current = false;
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  if (!isOpen) return null;

  const title = action === 'approve' ? 'Approve Change Request' : 'Reject Change Request';
  const buttonLabel = action === 'approve' ? 'Approve & Notify Guest' : 'Reject & Notify Guest';
  const isApprove = action === 'approve';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
        <div className={`border-b px-6 py-5 ${
          isApprove
            ? 'border-green-100 bg-gradient-to-r from-green-50 to-white'
            : 'border-red-100 bg-gradient-to-r from-red-50 to-white'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              isApprove ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            }`}>
              <i className={`fas ${isApprove ? 'fa-check-circle' : 'fa-times-circle'} text-lg`} />
            </div>
            <div className="flex-1">
              <h3 className={`text-xl font-bold ${isApprove ? 'text-green-900' : 'text-red-900'}`}>{title}</h3>
              <p className={`mt-1 text-sm ${isApprove ? 'text-green-600' : 'text-red-600'}`}>
                Booking ID: <span className="font-mono font-semibold">{booking?.bookingId}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Please provide a reason for {isApprove ? 'approving' : 'rejecting'} this change request.
            This will be included in the email sent to the guest and displayed in their booking.
          </p>
          <div>
            <label className="block text-sm font-semibold text-textPrimary mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Type your reason here..."
              className={`w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none transition-all duration-300 bg-white resize-none focus:ring-2 ${
                isApprove
                  ? 'focus:border-green-300 focus:ring-green-200'
                  : 'focus:border-red-300 focus:ring-red-200'
              }`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2.5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 shadow-sm transition-all duration-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
            className={
              isApprove
                ? 'flex h-10 items-center justify-center gap-1.5 rounded-xl bg-green-500/10 px-4 text-sm font-semibold text-green-600 shadow-sm transition-all duration-200 hover:bg-green-600 hover:text-white disabled:opacity-50'
                : 'flex h-10 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-4 text-sm font-semibold text-red-600 shadow-sm transition-all duration-200 hover:bg-red-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin"></i> Processing...</>
            ) : (
              buttonLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
