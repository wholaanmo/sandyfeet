'use client';
import { useState } from 'react';
import {
  formatDateOnly, formatDateTime, formatAddress, calcNights,
  getStatusBadge, getTypeDisplay, getBookingTitle, getGuestTotal,
  getDownPayment, getBalance, getRoomTypes, canCancel,
} from './utils';

export default function BookingCard({ booking, onCancel }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = getTypeDisplay(booking);
  const statusInfo = getStatusBadge(booking.status, booking.cancelledBy);
  const guestTotal = getGuestTotal(booking);
  const nights = booking.type === 'daytour' ? 0 : calcNights(booking.checkIn, booking.checkOut);
  const primaryDate = booking.type === 'daytour' ? formatDateOnly(booking.selectedDate) : formatDateOnly(booking.checkIn);
  const balance = getBalance(booking);
  const dp = getDownPayment(booking);
  const roomTypes = getRoomTypes(booking);
  const address = formatAddress(booking.guestInfo?.address);
  const showCancel = canCancel(booking);

  return (
    <div 
      className={`group overflow-hidden rounded-3xl border transition-all duration-500 bg-white ${
        expanded 
          ? 'border-blue-200 shadow-[0_20px_50px_rgba(37,99,235,0.12)] ring-1 ring-blue-50' 
          : 'border-blue-100/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_50px_rgba(37,99,235,0.08)] hover:border-blue-200 hover:scale-[1.005] active:scale-[0.995]'
      }`}
    >
      {/* ── Card Header (Clickable) ── */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="relative cursor-pointer select-none px-5 py-5 sm:px-6 transition-colors hover:bg-slate-50/50"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: Type, Status, Title */}
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] shadow-sm ${typeInfo.color}`}>
                <i className={`fas ${typeInfo.icon} text-[9px]`} />
                {typeInfo.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] shadow-sm ${statusInfo.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot} animate-pulse`} />
                {statusInfo.label}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">{getBookingTitle(booking)}</h3>
            <p className="font-mono text-[11px] text-slate-400">ID: {booking.bookingId}</p>
          </div>

          {/* Right: Date + Price */}
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <p className="text-sm font-semibold text-slate-800">{primaryDate}</p>
            {booking.type !== 'daytour' && booking.checkOut && (
              <p className="text-xs text-slate-500">to {formatDateOnly(booking.checkOut)}</p>
            )}
            <p className="mt-1 text-xl font-bold text-slate-900">₱{booking.totalPrice.toLocaleString()}</p>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <i className="fas fa-users text-slate-400" />
            <span>{guestTotal} guest{guestTotal !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <i className={`fas ${booking.type === 'daytour' ? 'fa-sun' : 'fa-moon'} text-slate-400`} />
            <span>{booking.type === 'daytour' ? 'Day tour' : `${nights} night${nights !== 1 ? 's' : ''}`}</span>
          </div>
          {balance > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <i className="fas fa-wallet text-slate-400" />
              <span>Balance ₱{balance.toLocaleString()}</span>
            </div>
          )}

          {/* Expand Toggle Visual */}
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600">
            {expanded ? 'Hide details' : 'View details'}
            <i className={`fas fa-chevron-down text-[10px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* ── Expanded Detail ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-5 py-5 sm:px-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="grid gap-4 md:grid-cols-2">

            {/* Guest Information */}
            <div className="rounded-xl border border-slate-100 bg-white p-4">
              <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                  <i className="fas fa-user text-[10px]" />
                </span>
                Guest Info
              </h4>
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="font-semibold text-slate-900">
                  {`${booking.guestInfo?.firstName || ''} ${booking.guestInfo?.lastName || ''}`.trim() || 'Guest'}
                </p>
                <p className="text-slate-600">{booking.guestInfo?.email || 'Email not available'}</p>
                <p className="text-slate-600">{booking.guestInfo?.phone || 'Phone not available'}</p>
                {address && <p className="text-xs text-slate-500">{address}</p>}
              </div>
            </div>

            {/* Schedule */}
            <div className="rounded-xl border border-slate-100 bg-white p-4">
              <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <i className="fas fa-calendar-alt text-[10px]" />
                </span>
                {booking.type === 'daytour' ? 'Tour Schedule' : 'Stay Schedule'}
              </h4>
              <div className="mt-3 space-y-1.5 text-sm">
                {booking.type === 'daytour' ? (
                  <>
                    <p className="font-semibold text-slate-900">{formatDateOnly(booking.selectedDate)}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{booking.seniors || 0} senior(s)</span>
                      <span>{booking.adults || 0} adult(s)</span>
                      <span>{booking.kids || 0} kid(s)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-[10px] font-bold text-slate-400">IN</span>
                      <span className="font-semibold text-slate-900">{formatDateTime(booking.checkIn)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-[10px] font-bold text-slate-400">OUT</span>
                      <span className="font-semibold text-slate-900">{formatDateTime(booking.checkOut)}</span>
                    </div>
                    <p className="text-xs text-slate-500">{nights} night{nights !== 1 ? 's' : ''} stay</p>
                  </>
                )}
              </div>
            </div>

            {/* Room Details (room bookings only) */}
            {booking.type === 'room' && (
              <div className="rounded-xl border border-slate-100 bg-white p-4">
                <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                    <i className="fas fa-bed text-[10px]" />
                  </span>
                  Room Details
                </h4>
                <div className="mt-3 space-y-2 text-sm">
                  {booking.isExclusiveResortBooking ? (
                    <>
                      <p className="font-semibold text-slate-900">Entire Resort Package</p>
                      {booking.tentCount > 0 && <p className="text-xs text-slate-500">+ {booking.tentCount} tent(s)</p>}
                      <div className="mt-2 space-y-1 text-slate-600">
                        <div className="flex justify-between"><span>Adults</span><span className="font-medium">{booking.exclusiveAdults || 0}</span></div>
                        <div className="flex justify-between"><span>Kids</span><span className="font-medium">{booking.exclusiveKids || 0}</span></div>
                      </div>
                    </>
                  ) : booking.isMultiRoom && booking.children?.length > 0 ? (
                    <>
                      {roomTypes.map((r, i) => (
                        <div key={i} className="flex justify-between border-b border-slate-50 pb-1.5 last:border-0">
                          <span className="font-medium text-slate-700">{r.quantity} × {r.type}</span>
                        </div>
                      ))}
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="text-xs font-semibold uppercase text-slate-400">Guest Breakdown</p>
                        {booking.children.map((child, i) => (
                          <div key={i} className="mt-1.5 text-xs text-slate-600">
                            <span className="font-medium text-slate-700">{child.roomType}:</span>{' '}
                            {child.adults || 0} adult(s), {child.kids || 0} kid(s)
                          </div>
                        ))}
                        <div className="mt-2 flex justify-between text-sm font-semibold text-slate-900">
                          <span>Total Guests</span><span>{booking.totalGuests || guestTotal}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900">{booking.roomType}</p>
                      <p className="text-xs text-slate-500">{booking.numberOfRooms || 1} room(s)</p>
                      <div className="mt-2 space-y-1 text-slate-600">
                        <div className="flex justify-between"><span>Adults</span><span className="font-medium">{booking.adults || 1}</span></div>
                        <div className="flex justify-between"><span>Kids</span><span className="font-medium">{booking.kids || 0}</span></div>
                        <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{booking.guests || 1}</span></div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Payment Summary */}
            <div className="rounded-xl border border-slate-100 bg-white p-4">
              <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <i className="fas fa-credit-card text-[10px]" />
                </span>
                Payment Summary
              </h4>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Total Price</span>
                  <span className="font-bold text-slate-900">₱{booking.totalPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Down Payment (50%)</span>
                  <span className="font-semibold text-emerald-600">₱{dp.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-600">
                  <span>Remaining Balance</span>
                  <span className="font-bold text-slate-900">₱{balance.toLocaleString()}</span>
                </div>
                {booking.paymentMethod && (
                  <p className="text-xs text-slate-500">Via {booking.paymentMethod}</p>
                )}
              </div>
            </div>

            {/* Notes / Cancellation Info */}
            {(booking.adminNote || booking.cancellationReason) && (
              <div className="rounded-xl border border-slate-100 bg-white p-4 md:col-span-2">
                <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                    <i className="fas fa-sticky-note text-[10px]" />
                  </span>
                  Notes
                </h4>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {booking.adminNote && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                      <p className="text-blue-700"><i className="fas fa-info-circle mr-1.5" /><strong>Resort note:</strong> {booking.adminNote}</p>
                    </div>
                  )}
                  {booking.cancellationReason && (
                    <div className="rounded-lg border border-red-100 bg-red-50/60 p-3">
                      <p className="text-red-700">
                        <i className="fas fa-times-circle mr-1.5" />
                        <strong>{booking.cancelledBy === 'admin' ? 'Cancelled by resort:' : 'Cancellation reason:'}</strong>{' '}
                        {booking.cancellationReason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cancel Button (pending bookings only) */}
          {showCancel && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400">
                You can cancel while your booking is pending.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(booking);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 hover:border-red-300 hover:shadow-sm"
              >
                <i className="fas fa-times-circle text-xs" />
                Cancel Reservation
              </button>
            </div>
          )}

          {/* Feedback Button (completed bookings only) */}
          {(booking.status === 'check-out' || booking.status === 'completed') && (
            <div className="mt-5 flex items-center justify-between border-t border-blue-50 pt-4">
              <p className="text-xs font-medium text-blue-600/70">
                Share your experience with us!
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/feedback?bookingId=${booking.bookingId}`;
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 hover:shadow-[0_10px_20px_-5px_rgba(37,99,235,0.4)] active:scale-[0.98]"
              >
                <i className="fas fa-star text-[10px] text-amber-300" />
                Share Feedback
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-slate-400">
            Booked on {formatDateTime(booking.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}
