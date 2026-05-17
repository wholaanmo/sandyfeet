// app/dashboard/admin/reservations/components/AdminActionReasonModal.js
'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AdminActionReasonModal({ isOpen, action, booking, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      // Update the booking with the admin's note
      const isRoom = booking.type === 'room';
      const collectionName = isRoom ? 'bookings' : 'dayTourBookings';
      
      // Handle multi-room groups
      if (booking.originalChildBookings && booking.originalChildBookings.length > 0) {
        for (const childBooking of booking.originalChildBookings) {
          const bookingRef = doc(db, 'bookings', childBooking.id);
          await updateDoc(bookingRef, {
            'changeRequest.status': action === 'approve' ? 'approved' : 'rejected',
            'changeRequest.adminReason': reason,
            'changeRequest.processedAt': new Date().toISOString(),
            'changeRequest.adminNote': reason,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const bookingRef = doc(db, collectionName, booking.id);
        await updateDoc(bookingRef, {
          'changeRequest.status': action === 'approve' ? 'approved' : 'rejected',
          'changeRequest.adminReason': reason,
          'changeRequest.processedAt': new Date().toISOString(),
          'changeRequest.adminNote': reason,
          updatedAt: new Date().toISOString()
        });
      }
      
      // Call onConfirm and pass the reason
      onConfirm(reason);
      
      // Close the modal
      onClose();
    } catch (error) {
      console.error('Error saving admin note:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const title = action === 'approve' ? 'Approve Change Request' : 'Reject Change Request';
  const buttonLabel = action === 'approve' ? 'Approve & Notify Guest' : 'Reject & Notify Guest';
  const buttonColor = action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]">
        <div className="border-b border-gray-100 px-6 py-5">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Please provide a reason for {action === 'approve' ? 'approving' : 'rejecting'} this change request.
            This will be included in the email sent to the guest and displayed in their booking.
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Type your reason here..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm ${buttonColor} disabled:opacity-50`}
          >
            {loading ? 'Processing...' : buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}