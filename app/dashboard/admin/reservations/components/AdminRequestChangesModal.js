// app/dashboard/admin/reservations/components/AdminRequestChangesModal.js
'use client';

export function resolveChangeRequestFromBooking(booking) {
  if (!booking) return null;

  let request = booking.changeRequest;

  if ((!request || request.status !== 'pending') && booking.originalChildBookings?.length > 0) {
    for (const child of booking.originalChildBookings) {
      if (child.changeRequest?.status === 'pending') {
        request = child.changeRequest;
        break;
      }
    }
  }

  if (!request && booking.originalChildBookings?.length > 0) {
    for (const child of booking.originalChildBookings) {
      if (child.changeRequest && (child.changeRequest.status === 'approved' || child.changeRequest.status === 'rejected')) {
        request = child.changeRequest;
        break;
      }
    }
  }

  return request;
}

export function resolveBookingTypeLabel(booking) {
  if (!booking) return 'Reservation';
  if (booking.bookingIdDisplay) return booking.bookingIdDisplay;
  if (booking.type === 'daytour') return 'Day Tour';
  if (booking.isExclusiveResortBooking) return 'Entire Resort';
  if (booking.isMultiRoomGroup || (booking.roomTypesArray && booking.roomTypesArray.length > 1)) {
    return 'Multi-Room';
  }
  return 'Single Room Type';
}

export default function AdminRequestChangesModal({ isOpen, booking, onClose, onConfirm }) {
  if (!isOpen || !booking) return null;

  const request = resolveChangeRequestFromBooking(booking);
  const requestText = request?.text || 'No request text found.';
  const submittedAt = request?.submittedAt ? new Date(request.submittedAt).toLocaleString() : 'Unknown';

  const isProcessed = request?.status === 'approved' || request?.status === 'rejected';
  const processedStatus = request?.status === 'approved' ? 'Approved' : 'Rejected';
  const adminNote = request?.adminNote || request?.adminReason;

  let title = 'Guest Change Request';
  if (isProcessed) {
    title = `Change Request - ${processedStatus}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
        <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <i className="fas fa-exchange-alt text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-blue-900">{title}</h3>
              <p className="mt-1 text-sm text-blue-600">
                Booking ID: <span className="font-mono font-semibold">{booking.bookingId}</span>
              </p>
            </div>
            <button
              onClick={onClose}
className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className={`rounded-lg p-4 text-sm ${isProcessed ? 'bg-gray-50 text-gray-700' : 'bg-amber-50 text-amber-800'}`}>
            <p className="font-semibold mb-2">Guest&apos;s requested changes:</p>
            <p className="whitespace-pre-wrap">{requestText}</p>
            <p className="text-xs mt-2 text-gray-500">
              Submitted on: {submittedAt}
            </p>
          </div>

          {isProcessed && adminNote && (
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-semibold mb-2">Resort&apos;s response ({processedStatus}):</p>
              <p className="whitespace-pre-wrap">{adminNote}</p>
            </div>
          )}
        </div>

<div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2.5">


          {!isProcessed && (
            <>
              <button
                type="button"
                onClick={() => onConfirm('reject')}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-4 text-sm font-semibold text-red-600 shadow-sm transition-all duration-200 hover:bg-red-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => onConfirm('approve')}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-green-500/10 px-4 text-sm font-semibold text-green-600 shadow-sm transition-all duration-200 hover:bg-green-600 hover:text-white disabled:opacity-50"
              >
                Approve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
