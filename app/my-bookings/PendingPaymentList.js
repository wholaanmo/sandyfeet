// app/my-bookings/PendingPaymentList.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getBookingResumePath,
  getPendingPaymentBookingDetails,
  getPendingPaymentTypeLabel,
  isPendingBankPaymentRequest,
} from '@/lib/pendingBankPayments';

function formatBankDetails(bank) {
  if (!bank) return null;
  return {
    bankName: bank.bankName || '—',
    accountName: bank.accountName || '—',
    accountNumber: bank.accountNumber || (bank.qrCodeUrl ? 'QR Code Provided' : '—'),
    qrCodeUrl: bank.qrCodeUrl || '',
    providedAt: bank.providedAt || null,
  };
}

// Helper function to check if a booking is fully settled (down payment due is ₱0)
// This checks both the bank request and the actual booking payment status
const isBookingFullySettled = async (bankRequest, bookings) => {
  // First, check if the down payment amount on the bank request is 0
  const downPaymentAmount = Number(bankRequest?.downPayment || bankRequest?.downPaymentRequired || bankRequest?.totalPrice || bankRequest?.totalAmount || 0);
  if (downPaymentAmount === 0) return true;
  
  // If down payment is not 0, check if the actual booking has been fully paid
  const relatedBookings = bookings.filter(b => 
    String(b.bookingId || b.id || '') === String(bankRequest?.bookingId || '') ||
    String(b.parentBookingId || '') === String(bankRequest?.bookingId || '')
  );
  
  // Check if any related booking has been confirmed or completed (which implies payment)
  // Also check if balance is 0 (fully paid)
  for (const booking of relatedBookings) {
    // If booking is confirmed, check-in, check-out, or completed, and balance is 0
    if (['confirmed', 'check-in', 'check-out', 'completed'].includes(booking.status)) {
      // Check if balance is 0 or down payment has been fully paid
      const balance = Number(booking.balance || booking.manualBalance || 0);
      if (balance === 0) return true;
      
      // Also check if the down payment has been fully paid via manualTotalPrice
      const totalPrice = Number(booking.totalPrice || booking.manualTotalPrice || 0);
      const downPayment = totalPrice * 0.5;
      const paidAmount = totalPrice - balance;
      if (paidAmount >= downPayment && downPayment > 0) {
        // If paid amount meets or exceeds down payment, consider it settled for pending payment purposes
        return true;
      }
    }
  }
  
  return false;
};

export default function PendingPaymentList({ user, bookings }) {
  const [roomBankRequests, setRoomBankRequests] = useState([]);
  const [dayTourBankRequests, setDayTourBankRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settledStatusMap, setSettledStatusMap] = useState({});

  const normalizedEmail = user?.email?.toLowerCase().trim() || '';

  useEffect(() => {
    if (!normalizedEmail) {
      setRoomBankRequests([]);
      setDayTourBankRequests([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const roomQuery = query(
      collection(db, 'bank_requests'),
      where('guestEmail', '==', normalizedEmail)
    );
    const dayTourQuery = query(
      collection(db, 'daytour_bank_requests'),
      where('guestEmail', '==', normalizedEmail)
    );

    const unsubRoom = onSnapshot(
      roomQuery,
      async (snapshot) => {
        const requests = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setRoomBankRequests(requests);
        
        // Check settled status for these requests
        const settledMap = { ...settledStatusMap };
        for (const request of requests) {
          const isSettled = await isBookingFullySettled(request, []);
          settledMap[`room-${request.id}`] = isSettled;
        }
        setSettledStatusMap(settledMap);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading room bank requests:', err);
        setLoading(false);
      }
    );

    const unsubDayTour = onSnapshot(
      dayTourQuery,
      async (snapshot) => {
        const requests = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setDayTourBankRequests(requests);
        
        // Check settled status for these requests
        const settledMap = { ...settledStatusMap };
        for (const request of requests) {
          const isSettled = await isBookingFullySettled(request, []);
          settledMap[`daytour-${request.id}`] = isSettled;
        }
        setSettledStatusMap(settledMap);
      },
      (err) => console.error('Error loading day tour bank requests:', err)
    );

    return () => {
      unsubRoom();
      unsubDayTour();
    };
  }, [normalizedEmail]);

  // Listen for booking updates to re-check settled status when bookings change
  useEffect(() => {
    const checkAllSettledStatus = async () => {
      const settledMap = { ...settledStatusMap };
      
      for (const request of roomBankRequests) {
        const isSettled = await isBookingFullySettled(request, rawBookings);
        settledMap[`room-${request.id}`] = isSettled;
      }
      
      for (const request of dayTourBankRequests) {
        const isSettled = await isBookingFullySettled(request, rawBookings);
        settledMap[`daytour-${request.id}`] = isSettled;
      }
      
      setSettledStatusMap(settledMap);
    };
    
    if (roomBankRequests.length > 0 || dayTourBankRequests.length > 0) {
      checkAllSettledStatus();
    }
  }, [bookings, roomBankRequests, dayTourBankRequests]);

  const rawBookings = useMemo(() => {
    const list = [];
    bookings.forEach((b) => {
      list.push(b);
      if (b.children?.length) {
        b.children.forEach((child) => list.push(child));
      }
    });
    return list;
  }, [bookings]);

  const pendingPayments = useMemo(() => {
    const allRequests = [
      ...roomBankRequests.map((r) => ({ ...r, requestType: 'room' })),
      ...dayTourBankRequests.map((r) => ({ ...r, requestType: 'daytour' })),
    ];

    return allRequests
      .filter((request) => {
        // Check if this is still a pending payment request
        const isPending = isPendingBankPaymentRequest(request, rawBookings);
        if (!isPending) return false;
        
        // Check if the booking has been fully settled (down payment due is ₱0)
        const requestKey = `${request.requestType}-${request.id}`;
        const isSettled = settledStatusMap[requestKey];
        
        // Only show if not settled (down payment due > 0)
        return !isSettled;
      })
      .sort((a, b) => {
        const aTime = new Date(a.providedBankDetails?.providedAt || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.providedBankDetails?.providedAt || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [roomBankRequests, dayTourBankRequests, rawBookings, settledStatusMap]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-blue-50 bg-white py-16 shadow-[0_10px_40px_rgba(30,58,138,0.04)]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-blue-50 border-t-blue-600" />
        <p className="mt-4 text-sm font-medium text-blue-600/50">Loading pending payments…</p>
      </div>
    );
  }

  if (pendingPayments.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <i className="fas fa-wallet text-xl text-slate-400" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-600">No pending payments right now.</p>
        <p className="mt-1 text-xs text-slate-400">
          Bank details from the resort will appear here after you request them and before you upload payment proof.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendingPayments.map((request) => {
        const bank = formatBankDetails(request.providedBankDetails);
        const resumePath = getBookingResumePath(request);
        const typeLabel = getPendingPaymentTypeLabel(request);
        const bookingDetails = getPendingPaymentBookingDetails(request, rawBookings);
        
        // Calculate the actual down payment due (should be > 0 for pending payments)
        const downPaymentDue = Number(request.downPayment || request.totalPrice || 0);

        return (
          <div
            key={`${request.requestType}-${request.id}`}
            className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    <i className="fas fa-university text-[9px]" />
                    Pending Payment
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-[#1E3A8A]">{typeLabel}</h3>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    Booking ID: {request.bookingId || '—'}
                  </p>
                </div>
                <p className="text-right text-sm font-bold text-amber-700">
                  ₱{downPaymentDue.toLocaleString()}
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-amber-600/80">
                    Down payment due
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Booking details
                </p>
                <div className="mt-3 grid gap-2 text-sm text-[#1E3A8A] sm:grid-cols-2">
                  {bookingDetails.map((row) => (
                    <p key={row.label}>
                      <span className="text-[#5C7AA6]">{row.label}:</span> {row.value}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#5C7AA6]">
                  Upload your payment receipt on the booking page, then confirm your reservation to complete this payment.
                </p>
              </div>

              {bank && (
                <div className="rounded-xl border border-[#4D8CF5]/15 bg-[#f8fbff] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#4D8CF5]">
                    Bank details from resort
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-[#1E3A8A] sm:grid-cols-2">
                    <p><span className="text-[#5C7AA6]">Bank:</span> {bank.bankName}</p>
                    <p><span className="text-[#5C7AA6]">Account name:</span> {bank.accountName}</p>
                    <p className="sm:col-span-2">
                      <span className="text-[#5C7AA6]">Account / QR:</span> {bank.accountNumber}
                    </p>
                  </div>
                  {bank.qrCodeUrl && (
                    <a
                      href={bank.qrCodeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#4D8CF5] hover:underline"
                    >
                      <i className="fas fa-qrcode" />
                      View payment QR code
                    </a>
                  )}
                </div>
              )}

              <Link
                href={resumePath}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4D8CF5] to-[#3b7add] px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-[#3b7add] hover:to-[#2a68c9]"
              >
                <i className="fas fa-arrow-right text-xs" />
                Continue to booking &amp; upload payment
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}