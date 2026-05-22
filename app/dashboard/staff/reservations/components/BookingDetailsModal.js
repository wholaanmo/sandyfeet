// app/dashboard/admin/reservations/components/BookingDetailsModal.js
'use client';

import React, { useState, useEffect } from 'react';
import { formatBalancePaymentMethodLabel } from '@/lib/balancePaymentMethod';
import {
  formatDateOnly,
  formatDateTime,
  calcNights,
  getTypeDisplay,
  getGuestTotal,
} from '@/app/my-bookings/utils';

const BASE_EXCLUSIVE_PRICE = 22500;
const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

const formatAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.street, address.city, address.province, address.postalCode]
    .map(p => String(p || '').trim()).filter(Boolean).join(', ');
};

const getStatusBadge = (status, cancelledBy) => {
  if (status === 'cancelled') {
    return { label: cancelledBy === 'admin' ? 'Cancelled by Resort' : 'Not Confirmed', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
  }
  const map = {
    pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    'check-in': { label: 'Checked In', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    'check-out': { label: 'Checked Out', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
    completed: { label: 'Completed', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
    'cancelled-by-guest': { label: 'Cancelled by Guest', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  };
  return map[status] || { label: status || 'Unknown', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
};

const computePaymentDisplay = (booking) => {
  const isCancelled = ['cancelled', 'cancelled-by-guest'].includes(booking.status);
  let downPayment;
  let totalAmount;
  let balance;

  if (booking.type === 'daytour' && booking.downPayment !== undefined) {
    totalAmount = booking.manualTotalPrice ?? booking.totalPrice;
    downPayment = booking.downPayment;
    if (isCancelled) {
      balance = 0;
      totalAmount = downPayment;
    } else {
      balance = booking.manualBalance !== undefined
        ? booking.manualBalance
        : (booking.remainingBalance !== undefined
          ? booking.remainingBalance
          : totalAmount - downPayment);
    }
  } else if (isCancelled) {
    if (booking.manualDownPayment !== undefined && booking.manualDownPayment !== null) {
      downPayment = booking.manualDownPayment;
    } else {
      downPayment = (Number(booking.totalPrice) || 0) * 0.5;
    }
    totalAmount = downPayment;
    balance = 0;
  } else {
    if (booking.manualTotalPrice !== undefined && booking.manualTotalPrice !== null) {
      totalAmount = booking.manualTotalPrice;
      downPayment = totalAmount * 0.5;
    } else {
      totalAmount = Number(booking.totalPrice) || 0;
      downPayment = totalAmount * 0.5;
    }
    balance = booking.manualBalance !== undefined ? booking.manualBalance : downPayment;
  }

  return { totalAmount, downPayment, balance };
};

const formatDateWithTime = (date, type) => {
  if (!date) return 'N/A';
  try {
    let dateObj;
    if (date && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (date && typeof date === 'object' && date.seconds) {
      dateObj = new Date(date.seconds * 1000);
    } else {
      dateObj = new Date(date);
    }
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    if (type === 'check-in') return `${formattedDate} at ${FIXED_CHECK_IN_DISPLAY}`;
    if (type === 'check-out') return `${formattedDate} at ${FIXED_CHECK_OUT_DISPLAY}`;
    return formattedDate;
  } catch {
    return 'Invalid Date';
  }
};

const getBookingTypeLabel = (booking) => {
  if (booking.type === 'daytour') return 'Day Tour';
  if (booking.isExclusiveResortBooking) return 'Entire Resort';
  if (booking.isMultiRoom && booking.roomTypesArray?.length > 1) return 'Multi-Room Types';
  return 'Single Room Type';
};

const getTotalGuestsForDisplay = (booking) => {
  if (booking.type === 'daytour') {
    return (booking.seniors || 0) + (booking.adults || 0) + (booking.kids || 0);
  }
  if (booking.isExclusiveResortBooking) {
    return (booking.exclusiveAdults || 0) + (booking.exclusiveKids || 0);
  }
  if (booking.children?.length) {
    return booking.totalGuests || booking.children.reduce((s, c) => s + Number(c.guests || 0), 0);
  }
  return booking.guests || (booking.adults || 0) + (booking.kids || 0) || 1;
};

export default function BookingDetailsModal({ booking, feedback, onClose }) {
  const [imageZoom, setImageZoom] = useState({ show: false, imageUrl: '', title: '' });
  const typeInfo = getTypeDisplay(booking);
  const statusInfo = getStatusBadge(booking.status, booking.cancelledBy);
  const address = formatAddress(booking.guestInfo?.address);
  const paymentProofUrl = booking.paymentProof || booking.paymentProofUrl;
  const validIdUrl = booking.validIdImage || booking.validIdUrl;
  const paymentDisplay = computePaymentDisplay(booking);
  const bookingTypeLabel = booking.bookingIdDisplay || getBookingTypeLabel(booking);
  const displayGuestTotal = getTotalGuestsForDisplay(booking);
  const nights = booking.type === 'daytour' ? 0 : calcNights(booking.checkIn, booking.checkOut);
  const openImage = (imageUrl, title) => {
    if (!imageUrl) return;
    setImageZoom({ show: true, imageUrl, title });
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-all duration-300"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#f8fbff] shadow-2xl shadow-[#1E3A8A]/10 transition-all duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="z-10 flex items-center justify-between border-b border-[#4D8CF5]/10 bg-white px-5 sm:px-6 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
                <i className={`fas ${typeInfo.icon} text-lg`} />
              </div>
              <div>
                <h2 className="text-lg font-black text-[#1E3A8A] tracking-tight">Booking Details</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="rounded bg-[#4D8CF5]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1E3A8A] uppercase tracking-wider">BOOKING ID</span>
                  <p className="font-mono text-[11px] font-semibold text-[#5C7AA6]">{booking.bookingId}</p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
              <i className="fas fa-times text-sm" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Booking Information */}
            <DetailSection title="Booking Information" icon="fa-info-circle" iconColor="text-[#4D8CF5]">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Booking Type" value={bookingTypeLabel} />
                <DetailRow label="Status" value={statusInfo.label} />
                <DetailRow label="Booked On" value={formatDateTime(booking.createdAt)} />
                {booking.paymentMethod && <DetailRow label="Payment Method" value={booking.paymentMethod} />}
              </div>
              {booking.adminNote && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Admin Note</p>
                  <p className="text-xs font-medium text-amber-900">{booking.adminNote}</p>
                </div>
              )}
            </DetailSection>

            {/* Room / Tour Details */}
            {booking.type === 'room' ? (
              <>
                <DetailSection title="Room Details" icon="fa-bed" iconColor="text-amber-500">
                  {booking.isExclusiveResortBooking && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <i className="fas fa-gem text-amber-500 mt-0.5" />
                      <p className="text-xs font-semibold text-amber-700">
                        Entire Resort Package: all room types are booked for this schedule.
                      </p>
                    </div>
                  )}
                  {booking.isMultiRoomGroup && booking.roomTypesArray?.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {booking.roomTypesArray.map((room, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-[#f8fbff] p-2 border border-[#4D8CF5]/5">
                          <span className="text-sm font-medium text-[#1E3A8A]">{room.type}</span>
                          <span className="rounded bg-[#4D8CF5]/10 px-2 py-0.5 text-xs font-bold text-[#4D8CF5]">× {room.quantity}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <DetailRow label="Room Type" value={booking.roomType || '—'} />
                      <DetailRow label="Number of Rooms" value={String(booking.numberOfRooms || 1)} />
                    </div>
                  )}
                  <div className="mt-4 flex items-center justify-between border-t border-[#4D8CF5]/10 pt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6]">Total Rooms</span>
                    <span className="text-sm font-black text-[#1E3A8A]">{booking.totalRooms || booking.numberOfRooms || 1}</span>
                  </div>
                </DetailSection>

                <div className="grid gap-5 sm:grid-cols-2">
                  <DetailSection title="Schedule" icon="fa-calendar-alt" iconColor="text-emerald-500">
                    <div className="grid gap-4">
                      <DetailRow label="Check-in" value={formatDateWithTime(booking.checkIn, 'check-in')} />
                      <DetailRow label="Check-out" value={formatDateWithTime(booking.checkOut, 'check-out')} />
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[#4D8CF5]/10 pt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6]">Duration</span>
                      <span className="text-sm font-black text-[#1E3A8A]">{nights} night{nights !== 1 ? 's' : ''}</span>
                    </div>
                  </DetailSection>

                  <DetailSection title="Guest Count" icon="fa-users" iconColor="text-violet-500">
                    {booking.isExclusiveResortBooking ? (
                      <div className="grid gap-4">
                        <DetailRow label="Adults" value={String(booking.exclusiveAdults || 0)} />
                        <DetailRow label="Kids" value={String(booking.exclusiveKids || 0)} />
                      </div>
                    ) : booking.childBookings?.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {booking.childBookings.map((child, idx) => (
                          <div key={idx} className="flex flex-col rounded-lg bg-[#f8fbff] p-2 border border-[#4D8CF5]/5">
                            <span className="text-xs font-bold text-[#1E3A8A] mb-1">{child.roomType}</span>
                            <span className="text-[11px] font-medium text-[#5C7AA6]">Adults: {child.adults || child.guests || 1} • Kids: {child.kids || 0}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        <DetailRow label="Adults" value={String(booking.adults || booking.guests || 1)} />
                        <DetailRow label="Kids" value={String(booking.kids || 0)} />
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-[#4D8CF5]/10 pt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6]">Total Guests</span>
                      <span className="text-sm font-black text-[#1E3A8A]">
                        {booking.isExclusiveResortBooking 
                          ? (booking.exclusiveAdults || 0) + (booking.exclusiveKids || 0)
                          : (booking.totalGuests || booking.guests || displayGuestTotal)
                        }
                      </span>
                    </div>
                  </DetailSection>
                </div>
              </>
            ) : (
              <DetailSection title="Tour Details" icon="fa-sun" iconColor="text-emerald-500">
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailRow label="Tour Date" value={formatDateOnly(booking.selectedDate)} />
                  <DetailRow
                    label="Guest Breakdown"
                    value={`Adults: ${booking.adults || 0} • Kids: ${booking.kids || 0}${booking.seniors ? ` • Seniors: ${booking.seniors}` : ''}`}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#4D8CF5]/10 pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6]">Total Guests</span>
                  <span className="text-sm font-black text-[#1E3A8A]">{String(displayGuestTotal)}</span>
                </div>
              </DetailSection>
            )}

            {/* Payment Information */}
            <DetailSection title="Payment Information" icon="fa-credit-card" iconColor="text-[#4D8CF5]">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="rounded-xl border border-[#4D8CF5]/20 bg-[#4D8CF5]/5 p-4 transition-all hover:bg-[#4D8CF5]/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A]/70 mb-1">Total Amount</p>
                  <p className="font-black text-[#1E3A8A] text-xl">₱{paymentDisplay.totalAmount.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-[#4D8CF5]/20 bg-[#4D8CF5]/5 p-4 transition-all hover:bg-[#4D8CF5]/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A]/70 mb-1">Balance</p>
                  <p className="font-black text-[#1E3A8A] text-xl">₱{paymentDisplay.balance.toLocaleString()}</p>
                </div>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4D8CF5]/10 bg-white p-4 shadow-sm mt-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6]">50% Down Payment</span>
                    <span className="font-bold text-amber-600 text-sm">₱{paymentDisplay.downPayment.toLocaleString()}</span>
                  </div>
                  <span className={`inline-flex px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider shadow-sm ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {formatBalancePaymentMethodLabel(booking.balancePaymentMethod) && (
                  <div className="col-span-2 rounded-xl border border-[#4D8CF5]/10 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6] mb-1">Balance Payment at Check-In</p>
                    <p className="font-bold text-[#1E3A8A] text-sm">
                      {formatBalancePaymentMethodLabel(booking.balancePaymentMethod)}
                    </p>
                  </div>
                )}
              </div>
            </DetailSection>

            {/* Images */}
            {(paymentProofUrl || validIdUrl) && (
              <div className={`grid gap-5 ${paymentProofUrl && validIdUrl ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                {paymentProofUrl && (
                  <DetailSection title="Payment Proof" icon="fa-receipt" iconColor="text-[#4D8CF5]">
                    <UploadImagePreview src={paymentProofUrl} alt="Payment Proof" onClick={() => openImage(paymentProofUrl, 'Payment Proof')} />
                  </DetailSection>
                )}
                {validIdUrl && (
                  <DetailSection title="Valid ID" icon="fa-id-card" iconColor="text-[#4D8CF5]" badge={booking.validIdType}>
                    <UploadImagePreview src={validIdUrl} alt="Valid ID" onClick={() => openImage(validIdUrl, `Valid ID - ${booking.validIdType || 'ID'}`)} />
                  </DetailSection>
                )}
              </div>
            )}

            {/* Special Request */}
            <DetailSection title="Special Request" icon="fa-comment-alt" iconColor="text-amber-600" amber>
              <p className={`text-sm ${booking.specialRequest ? 'text-amber-800' : 'italic text-amber-600'}`}>
                {booking.specialRequest || 'No special requests from guest'}
              </p>
            </DetailSection>

            {/* Cancellation Reason */}
            {booking.cancellationReason && (
              <DetailSection title="Cancellation Reason" icon="fa-ban" iconColor="text-red-600">
                <p className="text-sm text-red-700">{booking.cancellationReason}</p>
              </DetailSection>
            )}

            {/* Feedback */}
            {feedback && (
              <DetailSection title="Guest Feedback" icon="fa-star" iconColor="text-amber-600">
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <i
                        key={star}
                        className={`fas fa-star text-sm ${star <= (feedback.rating || 0) ? 'text-amber-400' : 'text-amber-200'}`}
                      />
                    ))}
                    <span className="ml-2 text-xs font-semibold text-amber-700">{feedback.rating}/5</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{feedback.comment}</p>
                  {feedback.createdAt && (
                    <p className="text-[10px] text-slate-400">Submitted {formatFeedbackDate(feedback.createdAt)}</p>
                  )}
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Read-only</p>
                </div>
              </DetailSection>
            )}
          </div>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {imageZoom.show && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImageZoom({ show: false, imageUrl: '', title: '' })}
        >
          <div className="relative max-h-[90vh] max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImageZoom({ show: false, imageUrl: '', title: '' })}
              className="absolute -top-10 right-0 text-white hover:text-gray-200"
            >
              <i className="fas fa-times text-xl" />
            </button>
            <p className="mb-2 text-center text-sm font-semibold text-white">{imageZoom.title}</p>
            <img src={imageZoom.imageUrl} alt={imageZoom.title} className="max-h-[80vh] w-full rounded-xl object-contain bg-white" />
          </div>
        </div>
      )}
    </>
  );
}

function DetailSection({ title, icon, iconColor, badge, amber, children }) {
  return (
    <div className={`rounded-xl border shadow-sm transition-all hover:shadow-md h-full flex flex-col ${amber ? 'border-amber-200/60 bg-amber-50/50' : 'border-[#4D8CF5]/15 bg-white'}`}>
      <div className={`mb-4 flex items-center justify-between gap-2 border-b pb-3 pt-4 px-5 ${amber ? 'border-amber-200/50' : 'border-[#4D8CF5]/10'}`}>
        <h4 className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest ${amber ? 'text-amber-700' : 'text-[#1E3A8A]'}`}>
          <i className={`fas ${icon} ${iconColor} text-sm`} />
          {title}
        </h4>
        {badge && (
          <span className="rounded-md bg-[#4D8CF5]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A]">{badge}</span>
        )}
      </div>
      <div className="px-5 pb-5 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C7AA6]">{label}</span>
      <span className={`text-sm font-semibold text-[#1E3A8A] ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function UploadImagePreview({ src, alt, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50 group transition hover:shadow-md"
    >
      <img
        src={src}
        alt={alt}
        className="h-48 w-full object-cover transition group-hover:scale-105"
        onError={(e) => {
          e.target.style.display = 'none';
          const parent = e.target.parentElement;
          if (parent) {
            parent.innerHTML = '<div class="p-6 text-center"><i class="fas fa-image text-3xl text-gray-400 mb-2 block"></i><p class="text-sm text-gray-500">Unable to load image</p></div>';
          }
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-[#1E3A8A]/0 transition group-hover:bg-[#1E3A8A]/20">
        <i className="fas fa-search-plus text-2xl text-white opacity-0 transition group-hover:opacity-100" />
      </div>
    </button>
  );
}

function formatFeedbackDate(value) {
  if (!value) return '';
  if (value?.toDate) return formatDateTime(value.toDate());
  if (value?.seconds) return formatDateTime(new Date(value.seconds * 1000));
  return formatDateTime(value);
}