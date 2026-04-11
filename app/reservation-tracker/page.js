// app/reservation-tracker/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot } from 'firebase/firestore';
import GuestLayout from '../guest/layout';

export default function ReservationTrackerPage() {
  const [email, setEmail] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [reservationType, setReservationType] = useState(null); // 'room' or 'daytour'
  const [reservationId, setReservationId] = useState(null);
  const [reservationCollection, setReservationCollection] = useState(null);
  
  // Store the unsubscribe function for real-time listener
  const unsubscribeRef = useRef(null);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // Cleanup previous listener when component unmounts or new search is performed
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!email.trim() || !referenceNumber.trim()) {
      setError('Please enter both email and reservation reference number.');
      return;
    }
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    
    setLoading(true);
    setError('');
    setReservation(null);
    setReservationType(null);
    
    // Unsubscribe from any previous listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    try {
      // First, try to find in room bookings
      const bookingsRef = collection(db, 'bookings');
      const roomQuery = query(
        bookingsRef,
        where('guestInfo.email', '==', email.toLowerCase().trim()),
        where('bookingId', '==', referenceNumber.trim().toUpperCase())
      );
      
      const roomSnapshot = await getDocs(roomQuery);
      
      if (!roomSnapshot.empty) {
        const bookingDoc = roomSnapshot.docs[0];
        const bookingData = bookingDoc.data();
        
        setReservationType('room');
        setReservationId(bookingDoc.id);
        setReservationCollection('bookings');
        
        setReservation({
          id: bookingDoc.id,
          ...bookingData,
          type: 'room'
        });
        
        // Set up real-time listener for this specific booking document
        const bookingRef = doc(db, 'bookings', bookingDoc.id);
        const unsubscribe = onSnapshot(bookingRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const updatedData = docSnapshot.data();
            setReservation(prev => ({
              ...prev,
              ...updatedData
            }));
          } else {
            setError('Reservation no longer exists.');
            setReservation(null);
          }
        }, (err) => {
          console.error('Real-time listener error:', err);
        });
        
        unsubscribeRef.current = unsubscribe;
        setLoading(false);
        return;
      }
      
      // If not found in room bookings, try day tour bookings
      const dayTourBookingsRef = collection(db, 'dayTourBookings');
      const dayTourQuery = query(
        dayTourBookingsRef,
        where('guestInfo.email', '==', email.toLowerCase().trim()),
        where('bookingId', '==', referenceNumber.trim().toUpperCase())
      );
      
      const dayTourSnapshot = await getDocs(dayTourQuery);
      
      if (!dayTourSnapshot.empty) {
        const bookingDoc = dayTourSnapshot.docs[0];
        const bookingData = bookingDoc.data();
        
        setReservationType('daytour');
        setReservationId(bookingDoc.id);
        setReservationCollection('dayTourBookings');
        
        setReservation({
          id: bookingDoc.id,
          ...bookingData,
          type: 'daytour'
        });
        
        // Set up real-time listener for this specific day tour booking document
        const bookingRef = doc(db, 'dayTourBookings', bookingDoc.id);
        const unsubscribe = onSnapshot(bookingRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const updatedData = docSnapshot.data();
            setReservation(prev => ({
              ...prev,
              ...updatedData
            }));
          } else {
            setError('Reservation no longer exists.');
            setReservation(null);
          }
        }, (err) => {
          console.error('Real-time listener error:', err);
        });
        
        unsubscribeRef.current = unsubscribe;
        setLoading(false);
        return;
      }
      
      setError('No reservation found. Please check your details and try again.');
      
    } catch (err) {
      console.error('Error fetching reservation:', err);
      setError('An error occurred while fetching your reservation. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

const addCancellationNotification = async (booking, reason) => {
  try {
    const cancellationsRef = collection(db, 'guest_cancellations');
    
    // Create base notification data
    const notificationData = {
      guestName: `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`,
      bookingId: booking.bookingId,
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
      read: false,
      bookingType: booking.type || 'room'
    };
    
    // Only add roomType for room bookings, add tourDate for day tour bookings
    if (booking.type === 'daytour') {
      notificationData.tourDate = booking.selectedDate;
      notificationData.bookingTypeLabel = 'Day Tour';
    } else {
      notificationData.roomType = booking.roomType;
      notificationData.bookingTypeLabel = 'Room';
    }
    
    await addDoc(cancellationsRef, notificationData);
  } catch (err) {
    console.error('Error adding cancellation notification:', err);
  }
};

  const handleCancelReservation = async () => {
    if (!reservation) return;
    
    if (!cancellationReason.trim()) {
      setError('Please provide a reason for cancellation.');
      return;
    }
    
    if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
      setError('This reservation cannot be cancelled as it is no longer active.');
      setShowCancelModal(false);
      return;
    }
    
    setCancelling(true);
    
    try {
      const collectionName = reservation.type === 'daytour' ? 'dayTourBookings' : 'bookings';
      const bookingRef = doc(db, collectionName, reservation.id);
      
      await updateDoc(bookingRef, {
        status: 'cancelled-by-guest',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'guest',
        cancellationReason: cancellationReason,
        updatedAt: new Date().toISOString()
      });
      
      setReservation({
        ...reservation,
        status: 'cancelled-by-guest',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'guest',
        cancellationReason: cancellationReason
      });
      
      setShowCancelModal(false);
      setCancellationReason('');
      
      // Add notification for admin with reason
      await addCancellationNotification(reservation, cancellationReason);
      
      const guestEmail = reservation.guestInfo?.email;
      if (guestEmail) {
        await fetch('/api/public/guest-cancellation-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: reservation.id,
            type: reservation.type === 'daytour' ? 'daytour' : 'room',
            guestEmail,
            reason: cancellationReason,
          }),
        });
      }
      
      setShowSuccessModal(true);
      
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      setError('Failed to cancel reservation. Please try again later.');
    } finally {
      setCancelling(false);
    }
  };

  // Paste from clipboard
  const handlePasteReference = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setReferenceNumber(text.trim().toUpperCase());
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      setError('Unable to paste. Please allow clipboard permissions.');
    }
  };

  // Calculate number of nights between check-in and check-out (for room bookings)
  const calculateNumberOfNights = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 'N/A';
    try {
      let checkInDate, checkOutDate;
      
      if (checkIn && typeof checkIn.toDate === 'function') {
        checkInDate = checkIn.toDate();
      } else if (checkIn && typeof checkIn === 'object' && checkIn.seconds) {
        checkInDate = new Date(checkIn.seconds * 1000);
      } else {
        checkInDate = new Date(checkIn);
      }
      
      if (checkOut && typeof checkOut.toDate === 'function') {
        checkOutDate = checkOut.toDate();
      } else if (checkOut && typeof checkOut === 'object' && checkOut.seconds) {
        checkOutDate = new Date(checkOut.seconds * 1000);
      } else {
        checkOutDate = new Date(checkOut);
      }
      
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        return 'N/A';
      }
      
      const timeDiff = checkOutDate - checkInDate;
      const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));
      return nights > 0 ? nights : 1;
    } catch (error) {
      console.error('Error calculating nights:', error);
      return 'N/A';
    }
  };

  const formatDateTime = (timestamp) => {
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
      console.error('Error formatting timestamp:', error);
      return 'Invalid Date';
    }
  };

  const formatDateOnly = (dateString) => {
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
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
      'confirmed': { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
      'check-in': { label: 'Checked In', color: 'bg-blue-100 text-blue-700' },
      'check-out': { label: 'Checked Out', color: 'bg-purple-100 text-purple-700' },
      'cancelled': { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
      'cancelled-by-guest': { label: 'Cancelled by Guest', color: 'bg-red-100 text-red-700' }
    };
    
    const statusInfo = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    );
  };

  const calculateDownPayment = (totalPrice) => {
    if (!totalPrice) return 0;
    const total = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
    return total * 0.5;
  };

  const calculateBalance = (totalPrice, status) => {
    if (status !== 'confirmed' && status !== 'check-in' && status !== 'check-out') return 'Not confirmed';
    const total = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
    const downPayment = total * 0.5;
    const balance = total - downPayment;
    return `₱${balance.toLocaleString()}`;
  };

  const canCancel = (status) => {
    return status === 'pending' || status === 'confirmed';
  };

  const numberOfNights = reservation && reservation.type === 'room' ? calculateNumberOfNights(reservation.checkIn, reservation.checkOut) : 0;

  // Calculate total guests for day tour
  const getTotalGuests = () => {
    if (!reservation) return 0;
    return (reservation.seniors || 0) + (reservation.adults || 0) + (reservation.kids || 0);
  };

  return (
    <GuestLayout>
      <div suppressHydrationWarning className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white py-12 px-2 md:px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-textPrimary font-playfair mb-2">
              Track Your Reservation
            </h1>
            <p className="text-textSecondary">
              Enter your email address and reservation reference number to view your booking details
            </p>
          </div>

          {/* Two Column Layout - Form (40%) | Details (60%) */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Column - Search Form */}
            <div className="lg:w-2/5">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-ocean-light/30 p-10 sticky top-6">
                <form onSubmit={handleSearch} className="space-y-5">
                  <div>
                    <label className="block text-base font-semibold text-textPrimary mb-2">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full px-4 py-3 border-2 border-ocean-light/20 rounded-xl text-base focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300"
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-base font-semibold text-textPrimary mb-2">
                      Reservation Reference Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value.toUpperCase())}
                        placeholder="e.g., DAYTOUR-1734567890123-456 or BOOK-1734567890123-456"
                        className="w-full px-4 py-3 border-2 border-ocean-light/20 rounded-xl text-base focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300 font-mono pr-12"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={handlePasteReference}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ocean-light hover:text-ocean-mid transition-colors"
                        title="Paste from clipboard"
                      >
                        <i className="fas fa-paste text-base"></i>
                      </button>
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-ocean-mid to-ocean-light text-white font-semibold py-3 rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-spinner fa-spin"></i>
                        Searching...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-search"></i>
                        Track Reservation
                      </span>
                    )}
                  </button>
                </form>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-lg">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Reservation Details */}
            <div className="lg:w-3/5">
              {reservation ? (
                <div className="space-y-6 animate-fadeIn">
                  {/* Status Card */}
                  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-textPrimary font-playfair mb-1">
                          Reservation Details
                        </h2>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-neutral">Booking ID: {reservation.bookingId}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${reservation.type === 'daytour' ? 'bg-ocean-ice text-ocean-mid' : 'bg-ocean-ice text-ocean-mid'}`}>
                            {reservation.type === 'daytour' ? 'Day Tour' : 'Room Reservation'}
                          </span>
                        </div>
                      </div>
                      {getStatusBadge(reservation.status)}
                    </div>
                    
                    {reservation.status === 'cancelled-by-guest' && (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-red-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          This reservation was cancelled by the guest. 
                        </p>
                        {reservation.cancellationReason && (
                          <p className="text-red-700 text-sm mt-2">
                            <strong>Cancellation Reason:</strong> {reservation.cancellationReason}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {reservation.status === 'cancelled' && reservation.cancellationReason && (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-red-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          Cancellation Reason: {reservation.cancellationReason}
                        </p>
                      </div>
                    )}

                    {/* Cancel Button - Only show for active reservations */}
                    {canCancel(reservation.status) && (
                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={() => setShowCancelModal(true)}
                          className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 text-sm"
                        >
                          <i className="fas fa-times-circle"></i>
                          Cancel Reservation
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Guest Information */}
                  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                    <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
                      <i className="fas fa-user text-ocean-light"></i>
                      Guest Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Full Name</p>
                        <p className="text-textPrimary font-medium">
                          {reservation.guestInfo?.firstName} {reservation.guestInfo?.lastName}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Email Address</p>
                        <p className="text-textPrimary font-medium">{reservation.guestInfo?.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Phone Number</p>
                        <p className="text-textPrimary font-medium">{reservation.guestInfo?.phone || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Reservation Reference</p>
                        <p className="text-textPrimary font-medium font-mono">{reservation.bookingId}</p>
                      </div>
                    </div>
                  </div>

                  {/* Booking Schedule - Different for Room vs Day Tour */}
                  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                    <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
                      <i className="fas fa-calendar-alt text-ocean-light"></i>
                      {reservation.type === 'daytour' ? 'Tour Schedule' : 'Booking Schedule'}
                    </h3>
                    
                    {reservation.type === 'daytour' ? (
                      // Day Tour Schedule
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Tour Date</p>
                          <p className="text-textPrimary font-medium">{formatDateOnly(reservation.selectedDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Total Guests</p>
                          <p className="text-textPrimary font-medium">{getTotalGuests()}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Guest Breakdown</p>
                          <p className="text-textPrimary font-medium">
                            Senior: {reservation.seniors || 0} | Adult: {reservation.adults || 0} | Kid: {reservation.kids || 0}
                          </p>
                        </div>
                      </div>
                    ) : (
                      // Room Booking Schedule
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Check-in Date & Time</p>
                          <p className="text-textPrimary font-medium">{formatDateTime(reservation.checkIn)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Check-out Date & Time</p>
                          <p className="text-textPrimary font-medium">{formatDateTime(reservation.checkOut)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Number of Nights</p>
                          <p className="text-textPrimary font-medium">{numberOfNights} {numberOfNights === 1 ? 'night' : 'nights'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Number of Guests</p>
                          <p className="text-textPrimary font-medium">{reservation.guests}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Room Details - Only for Room Reservations */}
                  {reservation.type === 'room' && (
                    <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                      <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
                        <i className="fas fa-bed text-ocean-light"></i>
                        Room Details
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Room Type</p>
                          <p className="text-textPrimary font-medium">{reservation.roomType}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Number of Rooms</p>
                          <p className="text-textPrimary font-medium">{reservation.numberOfRooms || 1}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment Summary */}
                  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                    <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
                      <i className="fas fa-credit-card text-ocean-light"></i>
                      Payment Summary
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-ocean-light/10">
                        <span className="text-textSecondary">Total Price</span>
                        <span className="font-bold text-ocean-mid text-lg">
                          ₱{Number(reservation.totalPrice).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-ocean-light/10">
                        <span className="text-textSecondary">Down Payment (50%)</span>
                        <span className="font-semibold text-green-600">
                          ₱{calculateDownPayment(reservation.totalPrice).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-textSecondary">Remaining Balance</span>
                        <span className="font-bold text-ocean-mid text-lg">
                          {calculateBalance(reservation.totalPrice, reservation.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Booking Date */}
                  <div className="text-center text-sm text-neutral">
                    <p>Booked on: {formatDateTime(reservation.createdAt)}</p>
                  </div>
                </div>
              ) : (
                !loading && (
                  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-12 text-center">
                    <i className="fas fa-search text-5xl text-neutral mb-3 block"></i>
                    <p className="text-textSecondary">Enter your details above to view your reservation</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Cancel Reservation Modal with Reason Input */}
          {showCancelModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
                <div className="text-center mb-5">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                    <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-bold text-textPrimary mb-2">Cancel {reservation?.type === 'daytour' ? 'Day Tour' : 'Room'} Reservation</h3>
                  <div className="bg-yellow-50 p-3 mb-3 rounded">
                    <p className="text-sm text-yellow-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      <span className="font-semibold">Important Note:</span> 50% of the down payment will be retained by the resort upon cancellation.
                    </p>
                  </div>
                  <p className="text-textSecondary text-sm">
                    Are you sure you want to cancel your {reservation?.type === 'daytour' ? 'day tour' : 'room'} reservation for{" "}
                    <span className="font-semibold text-textPrimary">
                      {reservation?.guestInfo?.firstName} {reservation?.guestInfo?.lastName}
                    </span>?<br />
                    <span className="text-xs mt-1 block">
                      Booking ID: {reservation?.bookingId}
                      {reservation?.type === 'room' ? (
                        <><br />Room: {reservation?.roomType}<br />Dates: {formatDateOnly(reservation?.checkIn)} - {formatDateOnly(reservation?.checkOut)}</>
                      ) : (
                        <><br />Tour Date: {formatDateOnly(reservation?.selectedDate)}</>
                      )}
                    </span>
                  </p>
                </div>
                
                {/* Reason Input */}
                <div className="mb-5">
                  <label className="block text-sm font-semibold text-textPrimary mb-2">
                    Cancellation Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Please provide a reason for your cancellation. If you accidentally selected the wrong date, you may indicate your preferred new date instead."
                    rows="3"
                    className="w-full px-3 py-2 border-2 border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-200 transition-all duration-300 bg-white resize-none"
                  ></textarea>
                  <p className="text-xs text-textSecondary mt-1">
                    This helps us improve our services.
                  </p>
                </div>
                
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancellationReason('');
                    }}
                    className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleCancelReservation}
                    disabled={cancelling || !cancellationReason.trim()}
                    className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelling ? (
                      <span className="flex items-center gap-2">
                        <i className="fas fa-spinner fa-spin"></i>
                        Processing...
                      </span>
                    ) : (
                      'Yes, Cancel Reservation'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Modal after cancellation */}
          {showSuccessModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
                <div className="text-center mb-5">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                    <i className="fas fa-check-circle text-green-500 text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-bold text-textPrimary mb-2">Reservation Cancelled</h3>
                  <p className="text-textSecondary text-sm">
                    Your {reservation?.type === 'daytour' ? 'day tour' : 'room'} reservation has been successfully cancelled. 
                  </p>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowSuccessModal(false)}
                    className="px-6 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fadeIn {
            animation: fadeIn 0.4s ease-out;
          }
          
          @keyframes scaleIn {
            from {
              transform: scale(0.95);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-scaleIn {
            animation: scaleIn 0.2s ease-out;
          }
        `}</style>
      </div>
    </GuestLayout>
  );
}