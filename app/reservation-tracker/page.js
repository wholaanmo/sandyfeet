// app/reservation-tracker/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, onSnapshot } from 'firebase/firestore';
import GuestLayout from '../guest/layout';
import { sendCancellationEmail, sendDayTourCancellationEmail } from '../../lib/emailService';

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
  const [isMultiRoomBooking, setIsMultiRoomBooking] = useState(false);
  const [childBookings, setChildBookings] = useState([]);
  
  // Store the unsubscribe function for real-time listener
  const unsubscribeRef = useRef(null);
  const childUnsubscribeRefs = useRef([]);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // Cleanup previous listeners when component unmounts or new search is performed
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

  // Function to fetch child bookings for a multi-room parent booking ID
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
      
      // Sort by room type for consistent display
      children.sort((a, b) => (a.roomType || '').localeCompare(b.roomType || ''));
      
      // Set up real-time listeners for child bookings
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

  // Function to check if a booking ID is a multi-room parent
  const checkForMultiRoomBooking = async (email, bookingId) => {
    try {
      // First, check if there's a parent booking record
      // For multi-room bookings, we store a consolidated record with isMultiRoomGroup flag
      // But also we can find by checking if there are any child bookings with this parentBookingId
      
      const bookingsRef = collection(db, 'bookings');
      
      // Query for child bookings with this parentBookingId
      const childQuery = query(
        bookingsRef,
        where('parentBookingId', '==', bookingId),
        where('isMultiRoomBooking', '==', true)
      );
      
      const childSnapshot = await getDocs(childQuery);
      
      if (!childSnapshot.empty) {
        // This is a multi-room booking - get the first child to extract shared info
        const firstChild = childSnapshot.docs[0].data();
        
        // Get all child bookings data
        const children = [];
        let totalPrice = 0;
        let totalRooms = 0;
        const roomTypes = {};
        let totalGuests = 0;
        
        childSnapshot.forEach((doc) => {
          const childData = doc.data();
          children.push({
            id: doc.id,
            ...childData
          });
          totalPrice += childData.totalPrice || 0;
          totalRooms += childData.numberOfRooms || 1;
          totalGuests += childData.guests || 1;
          
          if (!roomTypes[childData.roomType]) {
            roomTypes[childData.roomType] = {
              quantity: 1,
              guestsPerRoom: childData.guests || 1,
              price: childData.price
            };
          } else {
            roomTypes[childData.roomType].quantity++;
          }
        });
        
        // Determine the overall status for the multi-room booking
        // If any child is cancelled by admin, show as cancelled
        // If any child is cancelled by guest, show as cancelled-by-guest
        // Otherwise use the first child's status
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
        
        // Create consolidated multi-room reservation object
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
          roomTypesArray: Object.entries(roomTypes).map(([type, data]) => ({
            type: type,
            quantity: data.quantity,
            guestsPerRoom: data.guestsPerRoom,
            price: data.price
          })),
          createdAt: firstChild.createdAt,
          children: children,
          cancellationReason: cancellationReason,
          cancelledBy: cancelledBy,
          adminNote: firstChild.adminNote || null  // Add admin note from confirmation
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
    setIsMultiRoomBooking(false);
    setChildBookings([]);
    
    // Unsubscribe from any previous listeners
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
      
      // First, check if this is a multi-room booking
      const multiRoomReservation = await checkForMultiRoomBooking(email.toLowerCase().trim(), bookingId);
      
      if (multiRoomReservation) {
        // Verify email matches
        if (multiRoomReservation.guestInfo?.email?.toLowerCase() !== email.toLowerCase().trim()) {
          setError('No reservation found. Please check your details and try again.');
          setLoading(false);
          return;
        }
        
        setReservationType('room');
        setIsMultiRoomBooking(true);
        setReservation(multiRoomReservation);
        
        // Set up real-time listener for child bookings to update status
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
        
        // Listen for changes on each child
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
      
      // If not multi-room, try regular room bookings
      const bookingsRef = collection(db, 'bookings');
      const roomQuery = query(
        bookingsRef,
        where('guestInfo.email', '==', email.toLowerCase().trim()),
        where('bookingId', '==', bookingId)
      );
      
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
          adminNote: bookingData.adminNote || null  // Add admin note from confirmation
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
        where('bookingId', '==', bookingId)
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
          type: 'daytour',
          adminNote: bookingData.adminNote || null  // Add admin note from confirmation
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
      
      // Add multi-room specific data
      if (booking.isMultiRoom) {
        notificationData.isMultiRoom = true;
        notificationData.totalRooms = booking.totalRooms;
        notificationData.roomTypesDisplay = Object.entries(booking.roomTypes || {})
          .map(([type, data]) => `${data.quantity} × ${type} (${data.guestsPerRoom} guest${data.guestsPerRoom !== 1 ? 's' : ''})`)
          .join(', ');
      } else if (booking.type === 'daytour') {
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
    
    // Check if multi-room booking can be cancelled
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
        // Cancel all child bookings
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
        
        // Add notification for admin
        await addCancellationNotification(reservation, cancellationReason);
        
        // Send cancellation email (using first child for email details)
        const firstChild = reservation.children[0];
        const multiRoomEmailResult = await sendCancellationEmail({
          ...firstChild,
          totalPrice: reservation.totalPrice,
          bookingId: reservation.bookingId,
          isMultiRoomGroup: true,
          roomTypesDisplay: Object.entries(reservation.roomTypes || {})
            .map(([type, data]) => `${data.quantity} × ${type} (${data.guestsPerRoom} guest${data.guestsPerRoom !== 1 ? 's' : ''})`)
            .join(', ')
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
        const roomEmailResult = await sendCancellationEmail(reservation, cancellationReason, 'guest');
        if (!roomEmailResult?.success) {
          setError('Reservation cancelled, but cancellation email could not be sent right now. Please contact the resort if needed.');
        }
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
      
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        return 0;
      }
      
      // Calculate difference in days
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

  const getStatusBadge = (status, cancelledBy) => {
    // For multi-room bookings, check if cancelled by admin vs guest
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

  // Updated calculateBalance function with new rules:
  // - Pending or Confirmed: 50% of total amount (remaining balance = 50% of total)
  // - Cancelled: "Not Confirmed"
  // - Cancelled by Guest: 50% of down payment amount (down payment * 0.5)
  const calculateBalance = (totalPrice, status) => {
    const total = typeof totalPrice === 'number' ? totalPrice : Number(totalPrice) || 0;
    const downPayment = total * 0.5;
    
    // If status is cancelled, mark as Not Confirmed
    if (status === 'cancelled') {
      return 'Not Confirmed';
    }
    
    // If status is pending or confirmed: remaining balance should be 50% of total amount
    if (status === 'pending' || status === 'confirmed') {
      const remainingBalance = total - downPayment;
      return `₱${remainingBalance.toLocaleString()}`;
    }
    
    // If status is cancelled-by-guest: remaining balance should be 50% of the down payment amount
    if (status === 'cancelled-by-guest') {
      const balanceAfterCancellation = downPayment * 0.5;
      return `₱${balanceAfterCancellation.toLocaleString()}`;
    }
    
    // For check-in, check-out, and other statuses
    if (status === 'check-in' || status === 'check-out') {
      const remainingBalance = total - downPayment;
      return `₱${remainingBalance.toLocaleString()}`;
    }
    
    return 'Not Confirmed';
  };

  const canCancel = (status, isMultiRoom = false, cancelledBy = null) => {
    // For multi-room bookings, if already cancelled (by either party), don't show cancel button
    if (isMultiRoom && (status === 'cancelled' || status === 'cancelled-by-guest')) {
      return false;
    }
    
    // For non-multi-room bookings, check if already cancelled
    if (!isMultiRoom && (status === 'cancelled' || status === 'cancelled-by-guest')) {
      return false;
    }
    
    if (isMultiRoom && reservation?.children) {
      const anyActive = reservation.children.some(child => 
        child.status === 'pending' || child.status === 'confirmed'
      );
      return anyActive;
    }
    return status === 'pending' || status === 'confirmed';
  };

  // Calculate number of nights for room reservations (non-multi-room)
  const numberOfNights = reservation && reservation.type === 'room' && !reservation.isMultiRoom 
    ? calculateNumberOfNights(reservation.checkIn, reservation.checkOut) 
    : 0;

  // Calculate number of nights for multi-room reservations
  const multiRoomNumberOfNights = reservation && reservation.isMultiRoom && reservation.checkIn && reservation.checkOut
    ? calculateNumberOfNights(reservation.checkIn, reservation.checkOut)
    : 0;

  // Calculate total guests for day tour
  const getTotalGuests = () => {
    if (!reservation) return 0;
    return (reservation.seniors || 0) + (reservation.adults || 0) + (reservation.kids || 0);
  };

  // Get multi-room display string
  const getMultiRoomDisplay = () => {
    if (!reservation.roomTypesArray) return '';
    return reservation.roomTypesArray.map(room => 
      `${room.quantity} × ${room.type} (${room.guestsPerRoom} guest${room.guestsPerRoom !== 1 ? 's' : ''})`
    ).join(', ');
  };

  const statusInfo = reservation ? getStatusBadge(reservation.status, reservation.cancelledBy) : { label: '', color: '' };

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
                    <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
                      <div>
                        <h2 className="text-2xl font-bold text-textPrimary font-playfair mb-1">
                          Reservation Details
                        </h2>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-neutral">Booking ID: {reservation.bookingId}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${reservation.isMultiRoom ? 'bg-purple-100 text-purple-700' : (reservation.type === 'daytour' ? 'bg-ocean-ice text-ocean-mid' : 'bg-ocean-ice text-ocean-mid')}`}>
                            {reservation.isMultiRoom ? 'Multi-Room Reservation' : (reservation.type === 'daytour' ? 'Day Tour' : 'Room Reservation')}
                          </span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    
                    {/* Admin Note - Display for all reservation types when confirmed */}
                    {reservation.adminNote && reservation.status === 'confirmed' && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-blue-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          <strong>Admin Note:</strong> {reservation.adminNote}
                        </p>
                      </div>
                    )}
                    
                    {/* Cancelled by Guest - Show reason */}
                    {reservation.status === 'cancelled-by-guest' && reservation.cancellationReason && (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
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
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
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
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-red-700 text-sm">
                          <i className="fas fa-info-circle mr-2"></i>
                          Cancellation Reason: {reservation.cancellationReason}
                        </p>
                      </div>
                    )}

                    {/* Cancel Button - Only show for active reservations (not cancelled) */}
                    {canCancel(reservation.status, reservation.isMultiRoom, reservation.cancelledBy) && (
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

                  {/* Booking Schedule */}
                  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                    <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
                      <i className="fas fa-calendar-alt text-ocean-light"></i>
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

                  {/* Room Details - For Room Reservations */}
                  {reservation.type === 'room' && (
                    <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-6">
                      <h3 className="text-lg font-bold text-textPrimary mb-4 flex items-center gap-2">
                        <i className="fas fa-bed text-ocean-light"></i>
                        Room Details
                      </h3>
                      
                      {reservation.isMultiRoom ? (
                        <>
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-neutral uppercase tracking-wide mb-2">Room Type Breakdown</p>
                            <div className="space-y-2">
                              {reservation.roomTypesArray && reservation.roomTypesArray.map((room, idx) => (
                                <div key={idx} className="flex justify-between items-center border-b border-ocean-light/10 pb-2">
                                  <span className="font-medium text-textPrimary">{room.quantity} × {room.type}</span>
                                  <span className="text-textSecondary">{room.guestsPerRoom} guest{room.guestsPerRoom !== 1 ? 's' : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-ocean-light/20">
                            <div>
                              <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Total Rooms</p>
                              <p className="text-textPrimary font-medium">{reservation.totalRooms}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Total Guests</p>
                              <p className="text-textPrimary font-medium">{reservation.totalGuests}</p>
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
                          <div>
                            <p className="text-xs font-semibold text-neutral uppercase tracking-wide">Number of Guests</p>
                            <p className="text-textPrimary font-medium">{reservation.guests}</p>
                          </div>
                        </div>
                      )}
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
                  <h3 className="text-lg font-bold text-textPrimary mb-2">Cancel {reservation?.isMultiRoom ? 'Multi-Room' : (reservation?.type === 'daytour' ? 'Day Tour' : 'Room')} Reservation</h3>
                  <div className="bg-yellow-50 p-3 mb-3 rounded">
                    <p className="text-sm text-yellow-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      <span className="font-semibold">Important Note:</span> 50% of the down payment will be retained by the resort upon cancellation.
                    </p>
                  </div>
                  <p className="text-textSecondary text-sm">
                    Are you sure you want to cancel your {reservation?.isMultiRoom ? 'multi-room' : (reservation?.type === 'daytour' ? 'day tour' : 'room')} reservation for{" "}
                    <span className="font-semibold text-textPrimary">
                      {reservation?.guestInfo?.firstName} {reservation?.guestInfo?.lastName}
                    </span>?<br />
                    <span className="text-xs mt-1 block">
                      Booking ID: {reservation?.bookingId}
                      {reservation?.isMultiRoom ? (
                        <><br />Room Types: {getMultiRoomDisplay()}</>
                      ) : reservation?.type === 'room' ? (
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
                    Your {reservation?.isMultiRoom ? 'multi-room' : (reservation?.type === 'daytour' ? 'day tour' : 'room')} reservation has been successfully cancelled. 
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