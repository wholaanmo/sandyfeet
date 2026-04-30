// app/reservation-tracker/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot } from 'firebase/firestore';
import GuestLayout from '../guest/layout';
import { sendCancellationEmail, sendDayTourCancellationEmail } from '../../lib/emailService';
import ChatBot from '@/components/guest/ChatBot';

export default function ReservationTrackerPage() {
  const [contactIdentifier, setContactIdentifier] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [reservationType, setReservationType] = useState(null);
  const [reservationId, setReservationId] = useState(null);
  const [reservationCollection, setReservationCollection] = useState(null);
  const [isMultiRoomBooking, setIsMultiRoomBooking] = useState(false);
  const [childBookings, setChildBookings] = useState([]);
  
  const unsubscribeRef = useRef(null);
  const childUnsubscribeRefs = useRef([]);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const getBookingTypeDisplay = () => {
    if (!reservation) return '';
    if (reservation.isExclusiveResortBooking) return 'Entire Resort';
    if (reservation.isMultiRoom && reservation.roomTypesArray && reservation.roomTypesArray.length > 1) return 'Multi-Room Types';
    if (reservation.isMultiRoom && reservation.roomTypesArray && reservation.roomTypesArray.length === 1) return 'Single Room Type';
    if (reservation.type === 'room' && !reservation.isMultiRoom) return 'Single Room Type';
    return reservation.type === 'daytour' ? 'Day Tour' : 'Room';
  };

  const getBookingTypeColor = (type) => {
    switch(type) {
      case 'Single Room Type': return 'bg-blue-100 text-blue-700';
      case 'Multi-Room Types': return 'bg-violet-100 text-violet-700';
      case 'Entire Resort': return 'bg-amber-100 text-amber-700';
      case 'Day Tour': return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      childUnsubscribeRefs.current.forEach(unsub => {
        if (unsub) unsub();
      });
      childUnsubscribeRefs.current = [];
    };
  }, []);

  const fetchChildBookings = async (parentBookingId) => {
    try {
      const bookingsRef = collection(db, 'bookings');
      const childQuery = query(
        bookingsRef,
        where('parentBookingId', '==', parentBookingId),
        where('isMultiRoomBooking', '==', true)
      );
      const childSnapshot = await getDocs(childQuery);
      const children = [];
      childSnapshot.forEach((doc) => {
        children.push({
          id: doc.id,
          ...doc.data()
        });
      });
      children.sort((a, b) => (a.roomType || '').localeCompare(b.roomType || ''));
      childUnsubscribeRefs.current.forEach(unsub => {
        if (unsub) unsub();
      });
      childUnsubscribeRefs.current = [];
      children.forEach(child => {
        const childRef = doc(db, 'bookings', child.id);
        const unsubscribe = onSnapshot(childRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const updatedData = docSnapshot.data();
            setChildBookings(prev => prev.map(c => 
              c.id === child.id ? { ...c, ...updatedData } : c
            ));
          }
        }, (err) => {
          console.error('Real-time listener error for child booking:', err);
        });
        childUnsubscribeRefs.current.push(unsubscribe);
      });
      setChildBookings(children);
      return children;
    } catch (err) {
      console.error('Error fetching child bookings:', err);
      return [];
    }
  };

const checkForMultiRoomBooking = async (identifier, identifierType, bookingId) => {
  try {
    const bookingsRef = collection(db, 'bookings');
    const childQuery = query(
      bookingsRef,
      where('parentBookingId', '==', bookingId),
      where('isMultiRoomBooking', '==', true)
    );
    const childSnapshot = await getDocs(childQuery);
    
    if (!childSnapshot.empty) {
      const children = [];
      childSnapshot.forEach((doc) => {
        children.push({
          id: doc.id,
          ...doc.data()
        });
      });

      const firstChild = children[0]; // use first child for shared data
      
      // Validate identifier matches guest info
      let isValid = false;
      if (identifierType === 'email') {
        isValid = firstChild.guestInfo?.email?.toLowerCase() === identifier.toLowerCase();
      } else {
        isValid = firstChild.guestInfo?.phone === identifier;
      }
      if (!isValid) return null;

      // Determine total price: use exclusivePackagePrice if exclusive resort booking
      let totalPrice = 0;
      if (firstChild.isExclusiveResortBooking) {
        totalPrice = firstChild.exclusivePackagePrice || 0;
      } else {
        for (const child of children) {
          totalPrice += child.totalPrice || 0;
        }
      }

      let totalRooms = 0;
      let totalGuests = 0;
      const roomTypes = {};

      for (const child of children) {
        totalRooms += child.numberOfRooms || 1;
        totalGuests += child.guests || 1;
        if (!roomTypes[child.roomType]) {
          roomTypes[child.roomType] = {
            quantity: 1,
            guestsPerRoom: child.guests || 1,
            price: child.price
          };
        } else {
          roomTypes[child.roomType].quantity++;
        }
      }

      // If exclusive resort booking, avoid double-counting tents:
      // total rooms = non-tent rooms + tentCount
      if (firstChild.isExclusiveResortBooking) {
        const tentCount = firstChild.tentCount || 0;
        const nonTentRooms = Object.entries(roomTypes).reduce((sum, [type, data]) => {
          if (type === 'Tent') return sum;
          return sum + (data.quantity || 0);
        }, 0);
        totalRooms = nonTentRooms + tentCount;
      }

      // Build roomTypesArray and rename 'Tent' → 'Tent(s)' for exclusive resort
      let roomTypesArray = Object.entries(roomTypes).map(([type, data]) => ({
        type: type,
        quantity: data.quantity,
        guestsPerRoom: data.guestsPerRoom,
        price: data.price
      }));

      if (firstChild.isExclusiveResortBooking) {
        const tentCount = firstChild.tentCount || 0;
        if (tentCount > 0) {
          const tentIndex = roomTypesArray.findIndex(item => item.type === 'Tent');
          if (tentIndex !== -1) {
            roomTypesArray[tentIndex].type = 'Tent(s)';
            roomTypesArray[tentIndex].quantity = tentCount;
          } else {
            roomTypesArray.push({ type: 'Tent(s)', quantity: tentCount, guestsPerRoom: 0, price: 0 });
          }
        }
      }

      // Determine overall status & cancellation details
      let overallStatus = firstChild.status;
      let cancellationReason = null;
      let cancelledBy = null;
      for (const child of children) {
        if (child.status === 'cancelled') {
          overallStatus = 'cancelled';
          cancellationReason = child.cancellationReason;
          cancelledBy = child.cancelledBy;
          break;
        } else if (child.status === 'cancelled-by-guest') {
          overallStatus = 'cancelled-by-guest';
          cancellationReason = child.cancellationReason;
          cancelledBy = child.cancelledBy;
        }
      }

      const multiRoomReservation = {
        id: bookingId,
        bookingId: bookingId,
        guestInfo: firstChild.guestInfo,
        checkIn: firstChild.checkIn,
        checkOut: firstChild.checkOut,
        status: overallStatus,
        totalPrice: totalPrice,
        type: 'room',
        isMultiRoom: true,
        totalRooms: totalRooms,
        totalGuests: totalGuests,
        roomTypes: roomTypes,
        roomTypesArray: roomTypesArray,
        createdAt: firstChild.createdAt,
        children: children,
        cancellationReason: cancellationReason,
        cancelledBy: cancelledBy,
        adminNote: firstChild.adminNote || null,
        isExclusiveResortBooking: firstChild.isExclusiveResortBooking || false,
        exclusivePackagePrice: firstChild.exclusivePackagePrice || null,
        tentCount: firstChild.tentCount || 0,
        exclusiveAdults: firstChild.exclusiveAdults || 0,
        exclusiveKids: firstChild.exclusiveKids || 0
      };
      return multiRoomReservation;
    }
    return null;
  } catch (err) {
    console.error('Error checking for multi-room booking:', err);
    return null;
  }
};

  const handleSearch = async (e) => {
    e.preventDefault();
    const identifierRaw = contactIdentifier.trim();
    if (!identifierRaw || !referenceNumber.trim()) {
      setError('Please enter both contact information (email or phone) and reservation reference number.');
      return;
    }
    
    // Determine identifier type: email or phone
    const isEmail = identifierRaw.includes('@') && identifierRaw.includes('.');
    let identifierType = isEmail ? 'email' : 'phone';
    
    if (identifierType === 'email') {
      if (!validateEmail(identifierRaw)) {
        setError('Please enter a valid email address.');
        return;
      }
    } else {
      // phone: just ensure it's not empty, basic check
      if (identifierRaw.length < 5) {
        setError('Please enter a valid phone number (at least 5 characters).');
        return;
      }
    }
    
    setLoading(true);
    setError('');
    setReservation(null);
    setReservationType(null);
    setIsMultiRoomBooking(false);
    setChildBookings([]);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    childUnsubscribeRefs.current.forEach(unsub => {
      if (unsub) unsub();
    });
    childUnsubscribeRefs.current = [];
    try {
      const bookingId = referenceNumber.trim().toUpperCase();
      const multiRoomReservation = await checkForMultiRoomBooking(identifierRaw, identifierType, bookingId);
      if (multiRoomReservation) {
        setReservationType('room');
        setIsMultiRoomBooking(true);
        setReservation(multiRoomReservation);
        const updateChildStatuses = () => {
          if (multiRoomReservation.children && multiRoomReservation.children.length > 0) {
            let hasAdminCancelled = false;
            let hasGuestCancelled = false;
            let adminCancellationReason = null;
            let guestCancellationReason = null;
            for (const child of multiRoomReservation.children) {
              if (child.status === 'cancelled') {
                hasAdminCancelled = true;
                adminCancellationReason = child.cancellationReason;
              } else if (child.status === 'cancelled-by-guest') {
                hasGuestCancelled = true;
                guestCancellationReason = child.cancellationReason;
              }
            }
            let newStatus = multiRoomReservation.status;
            let newCancellationReason = null;
            if (hasAdminCancelled) {
              newStatus = 'cancelled';
              newCancellationReason = adminCancellationReason;
            } else if (hasGuestCancelled) {
              newStatus = 'cancelled-by-guest';
              newCancellationReason = guestCancellationReason;
            }
            if (newStatus !== multiRoomReservation.status) {
              setReservation(prev => ({ 
                ...prev, 
                status: newStatus,
                cancellationReason: newCancellationReason,
                cancelledBy: newStatus === 'cancelled' ? 'admin' : 'guest'
              }));
            }
          }
        };
        multiRoomReservation.children.forEach(child => {
          const childRef = doc(db, 'bookings', child.id);
          const unsubscribe = onSnapshot(childRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
              const updatedData = docSnapshot.data();
              setChildBookings(prev => prev.map(c => 
                c.id === child.id ? { ...c, ...updatedData } : c
              ));
              updateChildStatuses();
            }
          }, (err) => {
            console.error('Real-time listener error for child booking:', err);
          });
          childUnsubscribeRefs.current.push(unsubscribe);
        });
        setLoading(false);
        return;
      }
      const bookingsRef = collection(db, 'bookings');
      let roomQuery;
      if (identifierType === 'email') {
        roomQuery = query(
          bookingsRef,
          where('guestInfo.email', '==', identifierRaw.toLowerCase()),
          where('bookingId', '==', bookingId)
        );
      } else {
        roomQuery = query(
          bookingsRef,
          where('guestInfo.phone', '==', identifierRaw),
          where('bookingId', '==', bookingId)
        );
      }
      const roomSnapshot = await getDocs(roomQuery);
      if (!roomSnapshot.empty) {
        const bookingDoc = roomSnapshot.docs[0];
        const bookingData = bookingDoc.data();
        setReservationType('room');
        setReservationId(bookingDoc.id);
        setReservationCollection('bookings');
        setIsMultiRoomBooking(false);
        setReservation({
          id: bookingDoc.id,
          ...bookingData,
          type: 'room',
          adminNote: bookingData.adminNote || null
        });
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
      const dayTourBookingsRef = collection(db, 'dayTourBookings');
      let dayTourQuery;
      if (identifierType === 'email') {
        dayTourQuery = query(
          dayTourBookingsRef,
          where('guestInfo.email', '==', identifierRaw.toLowerCase()),
          where('bookingId', '==', bookingId)
        );
      } else {
        dayTourQuery = query(
          dayTourBookingsRef,
          where('guestInfo.phone', '==', identifierRaw),
          where('bookingId', '==', bookingId)
        );
      }
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
          type: 'daytour',
          adminNote: bookingData.adminNote || null
        });
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
    const notificationData = {
      guestName: `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`,
      bookingId: booking.bookingId,
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
      read: false,
      bookingType: booking.type || 'room'
    };
    
    if (booking.isMultiRoom) {
      notificationData.isMultiRoom = true;
      notificationData.parentBookingId = booking.id || booking.bookingId;
      notificationData.totalRooms = booking.totalRooms;
      notificationData.isExclusiveResortBooking = booking.isExclusiveResortBooking || false;
      
      // Determine room type display for multi-room
      if (booking.isExclusiveResortBooking) {
        notificationData.roomType = 'Entire Resort';
      } else if (booking.roomTypesArray && booking.roomTypesArray.length > 1) {
        notificationData.roomType = 'Multi-Room Types';
      } else {
        notificationData.roomType = 'Single Room Type';
      }
      
      notificationData.roomTypesDisplay = Object.entries(booking.roomTypes || {})
        .map(([type, data]) => `${data.quantity} x ${type}`)
        .join(', ');
    } else if (booking.type === 'daytour') {
      notificationData.bookingTypeLabel = 'Day Tour';
      notificationData.tourDate = booking.selectedDate;
      notificationData.roomType = 'Day Tour';
    } else {
      // Single room booking
      notificationData.bookingTypeLabel = 'Room';
      // Determine room type for single booking
      if (booking.isExclusiveResortBooking) {
        notificationData.roomType = 'Entire Resort';
        notificationData.isExclusiveResortBooking = true;
      } else {
        notificationData.roomType = 'Single Room Type';
      }
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
  if (reservation.isMultiRoom) {
    const anyActive = reservation.children?.some(child => 
      child.status !== 'cancelled' && child.status !== 'cancelled-by-guest'
    );
    if (!anyActive) {
      setError('This reservation cannot be cancelled as it is no longer active.');
      setShowCancelModal(false);
      return;
    }
  } else if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
    setError('This reservation cannot be cancelled as it is no longer active.');
    setShowCancelModal(false);
    return;
  }
  setCancelling(true);
  try {
    if (reservation.isMultiRoom && reservation.children) {
      for (const child of reservation.children) {
        if (child.status !== 'cancelled' && child.status !== 'cancelled-by-guest') {
          const bookingRef = doc(db, 'bookings', child.id);
          await updateDoc(bookingRef, {
            status: 'cancelled-by-guest',
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'guest',
            cancellationReason: cancellationReason,
            updatedAt: new Date().toISOString()
          });
        }
      }
      setReservation({
        ...reservation,
        status: 'cancelled-by-guest',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'guest',
        cancellationReason: cancellationReason
      });
      await addCancellationNotification(reservation, cancellationReason);
      const firstChild = reservation.children[0];
      
      // Prepare room type display without guest counts
      let roomTypesDisplaySimple = '';
      if (reservation.isExclusiveResortBooking) {
        roomTypesDisplaySimple = 'Entire Resort Package';
        if (reservation.tentCount > 0) {
          roomTypesDisplaySimple += ` + ${reservation.tentCount} Tent(s)`;
        }
      } else {
        roomTypesDisplaySimple = getMultiRoomDisplaySimple();
      }
      
      const multiRoomEmailResult = await sendCancellationEmail({
        ...firstChild,
        totalPrice: reservation.totalPrice,
        bookingId: reservation.bookingId,
        isMultiRoomGroup: true,
        roomTypesDisplay: roomTypesDisplaySimple
      }, cancellationReason, 'guest');
      if (!multiRoomEmailResult?.success) {
        setError('Reservation cancelled, but cancellation email could not be sent right now. Please contact the resort if needed.');
      }
    } else if (reservation.type === 'daytour') {
      const bookingRef = doc(db, 'dayTourBookings', reservation.id);
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
      await addCancellationNotification(reservation, cancellationReason);
      const dayTourEmailResult = await sendDayTourCancellationEmail(reservation, cancellationReason, 'guest');
      if (!dayTourEmailResult?.success) {
        setError('Reservation cancelled, but cancellation email could not be sent right now. Please contact the resort if needed.');
      }
    } else {
      const bookingRef = doc(db, 'bookings', reservation.id);
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
      await addCancellationNotification(reservation, cancellationReason);
      // For single room, show "1 x RoomType"
      const roomEmailResult = await sendCancellationEmail({
        ...reservation,
        roomTypesDisplay: `1 x ${reservation.roomType}`
      }, cancellationReason, 'guest');
      if (!roomEmailResult?.success) {
        setError('Reservation cancelled, but cancellation email could not be sent right now. Please contact the resort if needed.');
      }
    }

    // --- Send email notification to the resort (unchanged) ---
try {
  let roomTypesString = '';
  let checkInDate = '';
  let checkOutDate = '';
  let tourDate = '';
  let totalPriceValue = reservation.totalPrice;
  let downPaymentValue = calculateDownPayment(reservation.totalPrice);
  
  if (reservation.type === 'daytour') {
    // Day tour booking - use the actual tour date
    roomTypesString = 'Day Tour';
    tourDate = formatDateOnly(reservation.selectedDate) || 'N/A';
  } else {
    // Room booking
    if (reservation.isExclusiveResortBooking) {
      roomTypesString = 'Entire Resort Package';
      if (reservation.tentCount > 0) {
        roomTypesString += ` + ${reservation.tentCount} Tent(s)`;
      }
    } else if (reservation.isMultiRoom) {
      roomTypesString = getMultiRoomDisplay();
    } else {
      roomTypesString = reservation.roomType || 'Room';
    }
    checkInDate = formatDateOnly(reservation.checkIn);
    checkOutDate = formatDateOnly(reservation.checkOut);
  }

  const guestName = `${reservation.guestInfo?.firstName} ${reservation.guestInfo?.lastName}`;
  const bookingIdValue = reservation.bookingId;

  // Build the email HTML without Booking Type field
  let resortEmailHtml = '';
  
  if (reservation.type === 'daytour') {
    resortEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <h2 style="color: #dc2626;">Reservation Cancelled by Guest</h2>
        <p><strong>Guest Name:</strong> ${guestName}</p>
        <p><strong>Booking ID:</strong> ${bookingIdValue}</p>
        <p><strong>Tour Date:</strong> ${tourDate}</p>
        <p><strong>Total Price:</strong> PHP ${totalPriceValue?.toLocaleString() || '0'}</p>
        <p><strong>Down Payment Paid:</strong> PHP ${downPaymentValue?.toLocaleString() || '0'}</p>
        <hr />
        <p><strong>Cancellation Reason:</strong> ${cancellationReason}</p>
      </div>
    `;
  } else {
    resortEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <h2 style="color: #dc2626;">Reservation Cancelled by Guest</h2>
        <p><strong>Guest Name:</strong> ${guestName}</p>
        <p><strong>Booking ID:</strong> ${bookingIdValue}</p>
        <p><strong>Room Types:</strong> ${roomTypesString}</p>
        <p><strong>Check-in Date:</strong> ${checkInDate}</p>
        <p><strong>Check-out Date:</strong> ${checkOutDate}</p>
        <p><strong>Total Price:</strong> PHP ${totalPriceValue?.toLocaleString() || '0'}</p>
        <p><strong>Down Payment Paid:</strong> PHP ${downPaymentValue?.toLocaleString() || '0'}</p>
        <hr />
        <p><strong>Cancellation Reason:</strong> ${cancellationReason}</p>
      </div>
    `;
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const emailResponse = await fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'sandyfeetreservation@gmail.com',
      subject: `Reservation Cancelled - ${bookingIdValue}`,
      html: resortEmailHtml
    })
  });
  if (!emailResponse.ok) {
    console.error('Failed to send resort notification email');
  }
} catch (emailError) {
  console.error('Error sending resort notification email:', emailError);
}

    setShowCancelModal(false);
    setCancellationReason('');
    setShowSuccessModal(true);
  } catch (err) {
    console.error('Error cancelling reservation:', err);
    setError('Failed to cancel reservation. Please try again later.');
  } finally {
    setCancelling(false);
  }
};

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

  const calculateNumberOfNights = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0;
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
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) return 0;
      const checkInDay = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const checkOutDay = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      const timeDiff = checkOutDay - checkInDay;
      const nights = Math.max(1, Math.round(timeDiff / (1000 * 3600 * 24)));
      return nights;
    } catch (error) {
      console.error('Error calculating nights:', error);
      return 0;
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
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
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

  // FIXED: Handle Firestore Timestamp objects properly
  const formatDateOnly = (dateValue) => {
    if (!dateValue) return 'N/A';
    try {
      let date;
      if (dateValue && typeof dateValue.toDate === 'function') {
        date = dateValue.toDate();
      } else if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
        date = new Date(dateValue.seconds * 1000);
      } else {
        date = new Date(dateValue);
      }
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

  const getStatusBadge = (status, cancelledBy) => {
    if (status === 'cancelled') {
      if (cancelledBy === 'admin') {
        return { label: 'Cancelled by Resort', color: 'bg-red-100 text-red-700' };
      }
      return { label: 'Not Confirmed', color: 'bg-red-100 text-red-700' };
    }
    const statusMap = {
      'pending': { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
      'confirmed': { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
      'check-in': { label: 'Checked In', color: 'bg-blue-100 text-blue-700' },
      'check-out': { label: 'Checked Out', color: 'bg-purple-100 text-purple-700' },
      'cancelled-by-guest': { label: 'Cancelled by Guest', color: 'bg-red-100 text-red-700' }
    };
    const statusInfo = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return statusInfo;
  };

  const calculateDownPayment = (totalPrice) => {
    if (!totalPrice) return 0;
    const total = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
    return total * 0.5;
  };

const calculateBalance = (totalPrice, status) => {
  if (status === 'cancelled' || status === 'cancelled-by-guest' || status === 'completed') {
    return 'PHP 0';
  }
  const total = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
  const downPayment = total * 0.5;
  if (status === 'pending' || status === 'confirmed') {
    const remainingBalance = total - downPayment;
    return `PHP ${remainingBalance.toLocaleString()}`;
  }
  if (status === 'check-in' || status === 'check-out') {
    const remainingBalance = total - downPayment;
    return `PHP ${remainingBalance.toLocaleString()}`;
  }
  return 'Not Confirmed';
};

  const canCancel = (status, isMultiRoom = false, cancelledBy = null) => {
    if (isMultiRoom && (status === 'cancelled' || status === 'cancelled-by-guest')) return false;
    if (!isMultiRoom && (status === 'cancelled' || status === 'cancelled-by-guest')) return false;
    if (isMultiRoom && reservation?.children) {
      const anyActive = reservation.children.some(child => 
        child.status === 'pending' || child.status === 'confirmed'
      );
      return anyActive;
    }
    return status === 'pending' || status === 'confirmed';
  };

  const numberOfNights = reservation && reservation.type === 'room' && !reservation.isMultiRoom 
    ? calculateNumberOfNights(reservation.checkIn, reservation.checkOut) : 0;
  const multiRoomNumberOfNights = reservation && reservation.isMultiRoom && reservation.checkIn && reservation.checkOut
    ? calculateNumberOfNights(reservation.checkIn, reservation.checkOut) : 0;
  const getTotalGuests = () => {
    if (!reservation) return 0;
    return (reservation.seniors || 0) + (reservation.adults || 0) + (reservation.kids || 0);
  };
  const getMultiRoomDisplay = () => {
    if (!reservation.roomTypesArray) return '';
    return reservation.roomTypesArray.map(room => 
      `${room.quantity} x ${room.type}`
    ).join(', ');
  };

  const getMultiRoomDisplaySimple = () => {
  if (!reservation.roomTypesArray) return '';
  return reservation.roomTypesArray.map(room => 
    `${room.quantity} x ${room.type}`
  ).join(', ');
};

  const statusInfo = reservation ? getStatusBadge(reservation.status, reservation.cancelledBy) : { label: '', color: '' };
  const bookingTypeDisplay = reservation ? getBookingTypeDisplay() : '';
  const bookingTypeColor = bookingTypeDisplay ? getBookingTypeColor(bookingTypeDisplay) : '';
  const totalPriceValue = reservation ? Number(reservation.totalPrice || 0) : 0;
  const downPaymentValue = reservation ? calculateDownPayment(reservation.totalPrice) : 0;
  const remainingBalanceValue = Math.max(0, totalPriceValue - downPaymentValue);
const paymentBalanceDisplay = reservation
  ? (reservation.status === 'cancelled' || reservation.status === 'cancelled-by-guest' || reservation.status === 'completed'
      ? 'PHP 0'
      : `PHP ${remainingBalanceValue.toLocaleString()}`)
  : 'PHP 0';
  const totalPriceDisplay = `PHP ${totalPriceValue.toLocaleString()}`;
  const downPaymentDisplay = `PHP ${downPaymentValue.toLocaleString()}`;
  const reservationGuestTotal = reservation
    ? (reservation.type === 'daytour'
        ? getTotalGuests()
        : reservation.isExclusiveResortBooking
          ? (reservation.exclusiveAdults || 0) + (reservation.exclusiveKids || 0)
          : reservation.isMultiRoom
            ? reservation.totalGuests || 0
            : reservation.guests || 1)
    : 0;
  const reservationStayLength = reservation && reservation.type === 'room'
    ? reservation.isMultiRoom ? multiRoomNumberOfNights : numberOfNights
    : 0;

  return (
    <GuestLayout>
      <div suppressHydrationWarning className="relative min-h-screen overflow-x-hidden bg-[#f6f8fc] px-4 pb-8 pt-24 sm:px-6 sm:pt-28 lg:px-8">
        <div className="absolute inset-x-0 top-0 h-[200px] bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_45%),linear-gradient(180deg,_#ffffff_0%,_#f6f8fc_92%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="mb-6 text-center">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#3B82F6] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#F5A623]" />
              Reservation Tracker
            </span>
            <h1 className="mb-2 font-playfair text-3xl font-bold text-blue-600 sm:text-4xl">
              Track Your Reservation
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-600">
              Enter your email or phone number together with your booking reference to see your reservation status.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div>
              <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="border-b border-slate-100 bg-[linear-gradient(135deg,_#3B82F6_0%,_#2563EB_100%)] px-5 py-4 text-white sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Find Reservation</p>
                  <h2 className="mt-1 font-playfair text-2xl">Lookup</h2>
                </div>
                <div className="p-5 sm:p-6">
                <form onSubmit={handleSearch} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Email or Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactIdentifier}
                      onChange={(e) => setContactIdentifier(e.target.value)}
                      placeholder="you@example.com or 09123456789"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Reservation Reference Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value.toUpperCase())}
                        placeholder="BOOK-... or DAYTOUR-..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 pr-11 font-mono text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-sm"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={handlePasteReference}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 transition-colors hover:text-[#2563EB]"
                        title="Paste from clipboard"
                      >
                        <i className="fas fa-paste text-base"></i>
                      </button>
                    </div>
                  </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,_#3B82F6_0%,_#2563EB_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(37,99,235,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(37,99,235,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
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
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                    <div className="flex items-start gap-3">
                      <i className="fas fa-circle-exclamation mt-0.5"></i>
                      <p>{error}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
            <div className="min-w-0">
              {reservation ? (
                <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                  {/* Reservation Details Card */}
                  <div className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                    <div className="border-b border-slate-100 bg-[linear-gradient(135deg,_rgba(59,130,246,0.98)_0%,_rgba(37,99,235,0.94)_100%)] px-5 py-4 text-white sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${bookingTypeColor}`}>
                            {bookingTypeDisplay}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <h2 className="mt-3 font-playfair text-2xl text-white">
                          Reservation Details
                        </h2>
                        <p className="mt-2 text-sm text-white/80">Booking ID: <span className="font-mono font-semibold text-white">{reservation.bookingId}</span></p>
                      </div>
                      {canCancel(reservation.status, reservation.isMultiRoom, reservation.cancelledBy) && (
                        <button
                          onClick={() => setShowCancelModal(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-white/16"
                        >
                          <i className="fas fa-times-circle"></i>
                          Cancel Reservation
                        </button>
                      )}
                    </div>
                    </div>
                    <div className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4 sm:px-6">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Booked On</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">{formatDateTime(reservation.createdAt)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Stay / Access</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {reservation.type === 'daytour'
                            ? formatDateOnly(reservation.selectedDate)
                            : `${reservationStayLength} ${reservationStayLength === 1 ? 'night' : 'nights'}`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Guests</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">{reservationGuestTotal}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Outstanding Balance</p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">{paymentBalanceDisplay}</p>
                      </div>
                    </div>

                    <div className="space-y-2.5 px-5 py-4 sm:px-6">
                    {reservation.adminNote && reservation.status === 'confirmed' && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-blue-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          <strong>Admin Note:</strong> {reservation.adminNote}
                        </p>
                      </div>
                    )}
                    
                    {/* Cancelled by Guest - Show reason */}
                    {reservation.status === 'cancelled-by-guest' && reservation.cancellationReason && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                        <p className="text-red-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          This reservation was cancelled by the guest. 
                        </p>
                        <p className="text-red-700 text-sm mt-2">
                          <strong>Cancellation Reason:</strong> {reservation.cancellationReason}
                        </p>
                      </div>
                    )}
                    
                    {/* Cancelled by Resort - Show reason */}
                    {reservation.status === 'cancelled' && reservation.cancelledBy === 'admin' && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                        <p className="text-red-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          This reservation was cancelled by the resort. 
                        </p>
                        {reservation.cancellationReason && (
                          <p className="text-red-700 text-sm mt-2">
                            <strong>Cancellation Reason:</strong> {reservation.cancellationReason}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Cancelled (generic) - Show reason if available */}
                    {reservation.status === 'cancelled' && reservation.cancelledBy !== 'admin' && reservation.cancellationReason && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                        <p className="text-red-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          Cancellation Reason: {reservation.cancellationReason}
                        </p>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Guest Information */}
                  <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                    <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#2563EB]">
                        <i className="fas fa-user"></i>
                      </span>
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

                  {/* Booking Schedule */}
                  <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                    <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <i className="fas fa-calendar-alt"></i>
                      </span>
                      {reservation.type === 'daytour' ? 'Tour Schedule' : 'Booking Schedule'}
                    </h3>
                    {reservation.type === 'daytour' ? (
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
                          <p className="text-textPrimary font-medium">
                            {reservation.isMultiRoom ? multiRoomNumberOfNights : numberOfNights} 
                            {(reservation.isMultiRoom ? multiRoomNumberOfNights : numberOfNights) === 1 ? ' night' : ' nights'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Room Details – only room types, no guest counts */}
                  {reservation.type === 'room' && (
                    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                      <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                          <i className="fas fa-bed"></i>
                        </span>
                        Room Details
                      </h3>
                      {reservation.isMultiRoom ? (
                        <>
                          <div className="mb-4">
                            <div className="space-y-2">
                              {reservation.roomTypesArray && reservation.roomTypesArray.map((room, idx) => (
                                <div key={idx} className="flex justify-between items-center border-b border-ocean-light/10 pb-2">
                                  <span className="font-medium text-textPrimary">{room.quantity} × {room.type}</span>
                                </div>
                              ))}
                            </div>
 
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-ocean-light/20">
                            <div>
                              <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Total Rooms</p>
                              <p className="text-textPrimary font-medium">{reservation.totalRooms}</p>
                            </div>
                          </div>
                        </>
                      ) : (
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
                      )}
                    </div>
                  )}

                  {/* Guest Count – separate container, matches admin sidebar */}
                  {reservation.type === 'room' && (
                    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                      <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                          <i className="fas fa-users"></i>
                        </span>
                        Guest per Room
                      </h3>
                      {reservation.isExclusiveResortBooking ? (
                        // Entire Resort guest display
                        <div className="space-y-2">
                          <div className="flex justify-between items-center border-b border-ocean-light/10 pb-2">
                            <span className="text-textSecondary">Adults</span>
                            <span className="font-medium text-textPrimary">{reservation.exclusiveAdults || 0}</span>
                          </div>
                          <div className="flex justify-between items-center border-b border-ocean-light/10 pb-2">
                            <span className="text-textSecondary">Kids</span>
                            <span className="font-medium text-textPrimary">{reservation.exclusiveKids || 0}</span>
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <span className="font-semibold text-textPrimary">Total Guests</span>
                            <span className="font-bold text-ocean-mid">{(reservation.exclusiveAdults || 0) + (reservation.exclusiveKids || 0)}</span>
                          </div>
                        </div>
                      ) : reservation.isMultiRoom && reservation.children && reservation.children.length > 0 ? (
                        // Multi‑room: list each room with Adults | Kids
                        <div className="space-y-3">
                          {reservation.children.map((child, idx) => {
                            const adults = child.adults || 0;
                            const kids = child.kids || 0;
                            return (
                              <div key={idx} className="border-b border-ocean-light/10 pb-2 last:border-b-0">
                                <p className="font-medium text-textPrimary">{child.roomType}</p>
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-textSecondary text-sm">Adults</span>
                                  <span className="font-medium text-textPrimary">{adults}</span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-textSecondary text-sm">Kids</span>
                                  <span className="font-medium text-textPrimary">{kids}</span>
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-ocean-light/20">
                            <span className="font-semibold text-textPrimary">Total Guests</span>
                            <span className="font-bold text-ocean-mid">{reservation.totalGuests || 0}</span>
                          </div>
                        </div>
                      ) : (
                        // Single room: show adults and kids
                        <div className="space-y-2">
                          <div className="flex justify-between items-center border-b border-ocean-light/10 pb-2">
                            <span className="text-textSecondary">Adults</span>
                            <span className="font-medium text-textPrimary">{reservation.adults || 1}</span>
                          </div>
                          <div className="flex justify-between items-center border-b border-ocean-light/10 pb-2">
                            <span className="text-textSecondary">Kids</span>
                            <span className="font-medium text-textPrimary">{reservation.kids || 0}</span>
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <span className="font-semibold text-textPrimary">Total Guests</span>
                            <span className="font-bold text-ocean-mid">{reservation.guests || 1}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Summary */}
                  <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                    <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                        <i className="fas fa-credit-card"></i>
                      </span>
                      Payment Summary
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-ocean-light/10">
                        <span className="text-textSecondary">Total Price</span>
                        <span className="font-bold text-ocean-mid text-lg">
                          {totalPriceDisplay}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-ocean-light/10">
                        <span className="text-textSecondary">Down Payment (50%)</span>
                        <span className="font-semibold text-green-600">
                          {downPaymentDisplay}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-textSecondary">Remaining Balance</span>
                        <span className="font-bold text-ocean-mid text-lg">
                          {paymentBalanceDisplay}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                !loading && (
                  <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-white/80 bg-white/95 p-6 text-center shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                    <div className="max-w-md">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">
                        <i className="fas fa-receipt"></i>
                      </div>
                      <h2 className="mt-4 font-playfair text-2xl text-blue-600">Ready when you are</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">Enter your details to load your reservation summary.</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

{/* Cancel Reservation Modal */}
{showCancelModal && (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out]">
      <div className="text-center mb-5">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
          <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
        </div>
        <h3 className="text-lg font-bold text-textPrimary mb-2">Cancel {bookingTypeDisplay} Reservation</h3>
        <div className="bg-yellow-50 p-3 mb-3 rounded">
          <p className="text-sm text-yellow-800">
            <i className="fas fa-info-circle mr-2"></i>
            <span className="font-semibold">Important Note:</span> The full down payment will be retained by the resort upon cancellation.
          </p>
        </div>
        <p className="text-textSecondary text-sm">
          Are you sure you want to cancel your {bookingTypeDisplay.toLowerCase()} reservation for{" "}
          <span className="font-semibold text-textPrimary">
            {reservation?.guestInfo?.firstName} {reservation?.guestInfo?.lastName}
          </span>?<br />
          <span className="text-xs mt-1 block">
            Booking ID: {reservation?.bookingId}
          </span>
        </p>
      </div>
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

{/* Success Modal */}
{showSuccessModal && (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out]">
      <div className="text-center mb-5">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
          <i className="fas fa-check-circle text-green-500 text-2xl"></i>
        </div>
        <h3 className="text-lg font-bold text-textPrimary mb-2">Reservation Cancelled</h3>
        <p className="text-textSecondary text-sm">
          Your {bookingTypeDisplay.toLowerCase()} reservation has been successfully cancelled. 
        </p>
      </div>
      <div className="flex justify-center">
        <button
          onClick={() => setShowSuccessModal(false)}
          className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
        </div>
      </div>
      <ChatBot />
    </GuestLayout>
  );
}