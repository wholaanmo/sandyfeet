// app/rooms/booking/page.js
'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { uploadImage } from '@/lib/cloudinary';
import GuestAuthModal from '@/components/guest/GuestAuthModal';

function BookingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get('roomId');
  const roomType = searchParams.get('roomType');
  const price = parseFloat(searchParams.get('price'));
  // Fix: Properly parse maxCapacity with fallback and validation
  const maxCapacityParam = searchParams.get('maxCapacity');
  const maxCapacity = maxCapacityParam && !isNaN(parseInt(maxCapacityParam)) ? parseInt(maxCapacityParam) : 0;
  const totalRooms = parseInt(searchParams.get('totalRooms') || '1');
  const checkInDateParam = searchParams.get('checkIn');
  const checkOutDateParam = searchParams.get('checkOut');
  const nightsParam = searchParams.get('nights');
  const numberOfRoomsParam = searchParams.get('numberOfRooms');
  const specialRequestParam = searchParams.get('specialRequest');
  
  const [notifyingResort, setNotifyingResort] = useState(false);
  const [bankRequestSent, setBankRequestSent] = useState(false);
  const [requestedBankInfo, setRequestedBankInfo] = useState(null);
  const [modalNotification, setModalNotification] = useState(null);
  const [bankRequestId, setBankRequestId] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [generatedBookingId, setGeneratedBookingId] = useState('');
  const [roomDetails, setRoomDetails] = useState(null);
  const [guestAccount, setGuestAccount] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [pendingNextStep, setPendingNextStep] = useState(false);
  const hasAuthenticatedRef = useRef(false);

  const [step, setStep] = useState(1);
  const stepRef = useRef(step);
  const [bookingData, setBookingData] = useState({
    roomId,
    roomType,
    price,
    maxCapacity,
    totalRooms,
    checkIn: checkInDateParam ? new Date(checkInDateParam) : null,
    checkOut: checkOutDateParam ? new Date(checkOutDateParam) : null,
    nights: nightsParam && !isNaN(parseInt(nightsParam)) ? parseInt(nightsParam) : 1,
    guests: 1,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    paymentProofUrl: null, // Changed to store URL instead of Base64
    validIdType: '',
    validIdUrl: null, // Changed to store URL instead of Base64
    bookingId: null,
    numberOfRooms: numberOfRoomsParam ? parseInt(numberOfRoomsParam) : 1,
    specialRequest: specialRequestParam ? decodeURIComponent(specialRequestParam) : ''
  });
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [totalPrice, setTotalPrice] = useState(price);
  const [submitting, setSubmitting] = useState(false);
  const [checkOutTime, setCheckOutTime] = useState('');
  
  // Fixed times (check-in: 2:00 PM, check-out: 12:00 PM)
  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';
  
  // Add availability status state at component level
  const [availabilityStatus, setAvailabilityStatus] = useState({
    checking: false,
    isAvailable: true,
    message: ''
  });

  const [paymentMethod, setPaymentMethod] = useState('gcash');
  const [paymentSettings, setPaymentSettings] = useState({
    gcashQRCode: '',
    bankAccounts: []
  });
  const [bankDetailsProvided, setBankDetailsProvided] = useState(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);
  const [showBankSelection, setShowBankSelection] = useState(false);
  const [downPaymentAmount, setDownPaymentAmount] = useState(0);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const cancelBookingFlow = () => {
    setIsAuthOpen(false);
    setPendingNextStep(false);
    setGuestAccount(null);
    router.replace('/rooms');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const isGoogleGuest = user?.providerData?.some((provider) => provider.providerId === 'google.com');

      if (!user || !isGoogleGuest) {
        setGuestAccount(null);
        if (hasAuthenticatedRef.current && stepRef.current < 4) {
          cancelBookingFlow();
        }
        hasAuthenticatedRef.current = false;
        return;
      }

      const nameParts = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
      const nextGuest = {
        uid: user.uid,
        email: user.email || '',
        firstName: nameParts[0] || '',
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''
      };

      setGuestAccount(nextGuest);
      hasAuthenticatedRef.current = true;
      setBookingData((prev) => ({
        ...prev,
        firstName: prev.firstName || nextGuest.firstName,
        lastName: prev.lastName || nextGuest.lastName,
        email: prev.email || nextGuest.email
      }));

      // If the user just signed in to continue from step 1, advance automatically
      setPendingNextStep((pending) => {
        if (pending) {
          setStep((s) => (s === 1 ? 2 : s));
          return false;
        }
        return false;
      });
    });

    return () => unsubscribe();
  }, []);

  const [showValidIdModal, setShowValidIdModal] = useState(false);
  const [tempValidIdType, setTempValidIdType] = useState('Passport');
  const [tempValidIdFile, setTempValidIdFile] = useState(null);
  const [validIdUploading, setValidIdUploading] = useState(false);

  const validIdOptions = [
    'Passport',
    "Driver's License",
    'National ID',
    'UMID',
    'Postal ID',
    "Voter's ID / Voter's Certificate",
    'PhilHealth ID',
    'Other Government IDs'
  ];

  // Generate unique booking reference number
  const generateBookingReference = () => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 900) + 100; // 3-digit random number (100-999)
    return `BOOK-${timestamp}-${randomNum}`;
  };

  // Generate booking reference on component mount
  useEffect(() => {
    const newBookingId = generateBookingReference();
    setGeneratedBookingId(newBookingId);
    setBookingData(prev => ({ ...prev, bookingId: newBookingId }));
  }, []);

  // Copy to clipboard function
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Calculate down payment (50% of total price)
  useEffect(() => {
    const nights = bookingData.nights;
    const baseTotal = price * nights;
    const totalWithRooms = baseTotal * (bookingData.numberOfRooms || 1);
    setTotalPrice(totalWithRooms);
    setDownPaymentAmount(totalWithRooms * 0.5);
  }, [price, bookingData.nights, bookingData.numberOfRooms]);

  // Fetch room details to get accurate max capacity
  useEffect(() => {
    const fetchRoomDetails = async () => {
      if (roomId) {
        try {
          const roomDoc = await getDoc(doc(db, 'rooms', roomId));
          if (roomDoc.exists()) {
            const roomData = roomDoc.data();
            setRoomDetails(roomData);
            // Update maxCapacity from database to ensure accuracy
            const dbMaxCapacity = roomData.capacityMax || maxCapacity;
            setBookingData(prev => ({ 
              ...prev, 
              maxCapacity: dbMaxCapacity 
            }));
          }
        } catch (error) {
          console.error('Error fetching room details:', error);
        }
      }
    };
    fetchRoomDetails();
  }, [roomId, maxCapacity]);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'payment');
    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (settingsDoc) => {
        const data = settingsDoc.exists() ? settingsDoc.data() : {};
        setPaymentSettings((prev) => ({
          ...prev,
          gcashQRCode: data.gcashQRCode || ''
        }));
      },
      (error) => {
        console.error('Error listening to payment settings:', error);
      }
    );

    const bankAccountsRef = collection(db, 'bank_accounts');
    const bankAccountsQuery = query(bankAccountsRef, where('archived', '==', false));
    const unsubscribeBankAccounts = onSnapshot(
      bankAccountsQuery,
      (snapshot) => {
        const activeBankAccounts = [];
        snapshot.forEach((docSnap) => {
          activeBankAccounts.push(docSnap.data());
        });
        setPaymentSettings((prev) => ({
          ...prev,
          bankAccounts: activeBankAccounts
        }));
      },
      (error) => {
        console.error('Error listening to bank accounts:', error);
      }
    );

    return () => {
      unsubscribeSettings();
      unsubscribeBankAccounts();
    };
  }, []);

  // Also listen for bank details provided for this booking
  useEffect(() => {
    if (bookingData.bookingId) {
      const fetchBankDetails = async () => {
        try {
          const bookingRef = doc(db, 'bookings', bookingData.bookingId);
          const bookingDoc = await getDoc(bookingRef);
          if (bookingDoc.exists() && bookingDoc.data().bankDetailsProvided) {
            setBankDetailsProvided(bookingDoc.data().bankDetailsProvided);
          }
        } catch (error) {
          console.error('Error fetching bank details:', error);
        }
      };
      fetchBankDetails();
    }
  }, [bookingData.bookingId]);

  // Real-time listener for bank request document to get provided bank details from admin
  useEffect(() => {
    if (!bankRequestId) return;
    
    const bankRequestRef = doc(db, 'bank_requests', bankRequestId);
    
    const unsubscribe = onSnapshot(bankRequestRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        // If admin has provided bank details, update the guest side
        if (data.providedBankDetails && !bankDetailsProvided) {
          setBankDetailsProvided(data.providedBankDetails);
          setModalNotification({ message: 'Bank details have been provided by the resort! You can now proceed with payment.', type: 'success' });
        }
      }
    }, (error) => {
      console.error('Error listening for bank request:', error);
    });
    
    return () => unsubscribe();
  }, [bankRequestId, bankDetailsProvided]);

  // Real-time listener for bank details provided by admin
  useEffect(() => {
    if (!bookingData.bookingId) return;
    
    const bookingRef = doc(db, 'bookings', bookingData.bookingId);
    
    const unsubscribe = onSnapshot(bookingRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        // If admin has provided bank details, update the guest side
        if (data.bankDetailsProvided && !bankDetailsProvided) {
          setBankDetailsProvided(data.bankDetailsProvided);
          showNotification('Bank details have been provided by the resort! You can now proceed with payment.', 'success');
        }
      }
    }, (error) => {
      console.error('Error listening for bank details:', error);
    });
    
    return () => unsubscribe();
  }, [bookingData.bookingId]);

  // Define checkAvailability function at component level
  const checkAvailability = async () => {
    if (!bookingData.checkIn || !bookingData.checkOut) return;
    
    setAvailabilityStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const bookingsRef = collection(db, 'bookings');
      const checkInDate = new Date(bookingData.checkIn);
      const checkOutDate = new Date(bookingData.checkOut);
      const requestedRooms = bookingData.numberOfRooms || 1;
      
      // Get room details
      const roomDoc = await getDoc(doc(db, 'rooms', bookingData.roomId));
      if (!roomDoc.exists()) {
        setAvailabilityStatus({
          checking: false,
          isAvailable: false,
          message: 'Room not found'
        });
        return;
      }
      
      const roomData = roomDoc.data();
      const totalRoomsAvailable = roomData.totalRooms || 1;
      
      // Only check pending, confirmed, and check-in statuses (cancelled bookings are ignored)
      const q = query(
        bookingsRef,
        where('roomId', '==', bookingData.roomId),
        where('status', 'in', ['confirmed', 'check-in', 'pending']),
        where('checkIn', '<', checkOutDate),
        where('checkOut', '>', checkInDate)
      );
      
      const existingBookings = await getDocs(q);
      let totalBookedCount = 0;
      existingBookings.forEach((bookingDoc) => {
        const booking = bookingDoc.data();
        totalBookedCount += booking.numberOfRooms || 1;
      });
      
      const isAvailable = totalBookedCount + requestedRooms <= totalRoomsAvailable;
      const remainingRooms = totalRoomsAvailable - totalBookedCount;
      
      setAvailabilityStatus({
        checking: false,
        isAvailable,
        message: isAvailable 
          ? `${remainingRooms} room(s) available for these dates (you're booking ${requestedRooms})`
          : `Not enough rooms! Only ${remainingRooms} room(s) available, but you're booking ${requestedRooms}.`
      });
    } catch (error) {
      console.error('Error checking availability:', error);
      setAvailabilityStatus({
        checking: false,
        isAvailable: false,
        message: 'Unable to check availability. Please try again.'
      });
    }
  };

  // Call checkAvailability when dates change
  useEffect(() => {
    if (bookingData.checkIn && bookingData.checkOut && bookingData.roomId) {
      checkAvailability();
    }
  }, [bookingData.checkIn, bookingData.checkOut, bookingData.nights, bookingData.numberOfRooms]);

  // Calculate check-out date & time (fixed: 12:00 PM next day)
  useEffect(() => {
    if (bookingData.checkIn && bookingData.nights) {
      const checkOutDate = new Date(bookingData.checkIn);
      checkOutDate.setDate(checkOutDate.getDate() + bookingData.nights);
      // Fixed check-out time: 12:00 PM
      checkOutDate.setHours(FIXED_CHECK_OUT_HOUR, 0, 0, 0);
      
      setCheckOutTime(FIXED_CHECK_OUT_DISPLAY);
      
      setBookingData(prev => ({ ...prev, checkOut: checkOutDate }));
    }
  }, [bookingData.checkIn, bookingData.nights]);

  const validatePhone = (phone) => {
    const phoneRegex = /^\d{11}$/;
    return phoneRegex.test(phone);
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Calculate max total guests based on number of rooms × max capacity per room
  const getMaxTotalGuests = () => {
    const numberOfRooms = bookingData.numberOfRooms || 1;
    const currentMaxCapacity = roomDetails?.capacityMax || bookingData.maxCapacity;
    return numberOfRooms * currentMaxCapacity;
  };

  // Calculate min total guests based on number of rooms × min capacity per room
  const getMinTotalGuests = () => {
    const numberOfRooms = bookingData.numberOfRooms || 1;
    const currentMinCapacity = roomDetails?.capacityMin || 1;
    return numberOfRooms * currentMinCapacity;
  };

  const validateGuests = () => {
    const guestValue = parseInt(bookingData.guests);
    const maxTotalGuests = getMaxTotalGuests();
    const minTotalGuests = getMinTotalGuests();
    
    // Check for negative or NaN
    if (isNaN(guestValue) || guestValue < 0) {
      setErrors(prev => ({ ...prev, guests: 'Please enter a valid number of guests' }));
      return false;
    }
    
    if (guestValue < 1) {
      setErrors(prev => ({ ...prev, guests: 'At least 1 guest is required' }));
      return false;
    }
    
    if (guestValue > maxTotalGuests) {
      setErrors(prev => ({ ...prev, guests: `Maximum ${maxTotalGuests} guests allowed` }));
      return false;
    }
    
    if (guestValue < minTotalGuests) {
      setErrors(prev => ({ ...prev, guests: `Minimum ${minTotalGuests} guests required` }));
      return false;
    }
    
    setErrors(prev => ({ ...prev, guests: '' }));
    return true;
  };

  const validateStep2 = () => {
    const newErrors = {};
    
    if (!bookingData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!bookingData.lastName.trim()) newErrors.lastName = 'Last name is required';
    
    if (!bookingData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(bookingData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (!bookingData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!validatePhone(bookingData.phone)) {
      newErrors.phone = 'Phone number must be exactly 11 digits';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setBookingData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'guests') {
      const guestValue = parseInt(value);
      const maxTotalGuests = getMaxTotalGuests();
      const minTotalGuests = getMinTotalGuests();
      
      // Validate on change
      if (isNaN(guestValue) || guestValue < 0) {
        setErrors(prev => ({ ...prev, guests: 'Please enter a valid number of guests' }));
      } else if (guestValue < 1) {
        setErrors(prev => ({ ...prev, guests: 'At least 1 guest is required' }));
      } else if (guestValue > maxTotalGuests) {
        setErrors(prev => ({ ...prev, guests: `Maximum ${maxTotalGuests} guests allowed` }));
      } else if (guestValue < minTotalGuests) {
        setErrors(prev => ({ ...prev, guests: `Minimum ${minTotalGuests} guests required` }));
      } else {
        setErrors(prev => ({ ...prev, guests: '' }));
      }
    }
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

 const handleNotifyResort = async () => {
  if (!selectedBankAccount) {
    setModalNotification({ message: 'Please select a bank account first', type: 'error' });
    return;
  }
  
  setNotifyingResort(true);
  try {
    setRequestedBankInfo({
      bankName: selectedBankAccount.bankName,
      accountName: selectedBankAccount.accountName,
      accountNumber: selectedBankAccount.accountNumber,
      requestedAt: new Date().toISOString()
    });
    
    const bankRequestsRef = collection(db, 'bank_requests');
      const docRef = await addDoc(bankRequestsRef, {
      guestUid: guestAccount?.uid || null,
      guestName: `${bookingData.firstName} ${bookingData.lastName}`,
      guestEmail: bookingData.email,
      guestPhone: bookingData.phone,
      roomType: bookingData.roomType,
      roomId: bookingData.roomId,
      bookingId: generatedBookingId,
      checkIn: bookingData.checkIn,
      checkOut: bookingData.checkOut,
      nights: bookingData.nights,
      numberOfRooms: bookingData.numberOfRooms,
      totalPrice: totalPrice,
      downPayment: downPaymentAmount,
      specialRequest: bookingData.specialRequest,
      requestedBank: {
        bankName: selectedBankAccount.bankName,
        accountName: selectedBankAccount.accountName,
        accountNumber: selectedBankAccount.accountNumber || '',
        qrCodeUrl: selectedBankAccount.qrCodeUrl || ''
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      read: false
    });
    
    setBankRequestId(docRef.id);
    setBankRequestSent(true);
    setModalNotification({ message: 'Request sent to resort! You will receive bank details shortly.', type: 'success' });
    setShowBankSelection(false);
    setSelectedBankAccount(null);
  } catch (error) {
    console.error('Error sending bank transfer request:', error);
    setModalNotification({ message: 'Failed to send request. Please try again.', type: 'error' });
  } finally {
    setNotifyingResort(false);
  }
};

  const showNotification = (message, type = 'success') => {
    // Store notification in state to show in modal
    setModalNotification({ message, type });
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setModalNotification(null);
    }, 3000);
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!validateGuests()) return;
      // Room bookings require an account
      if (!guestAccount) {
        setPendingNextStep(true);
        setIsAuthOpen(true);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (validateStep2()) {
        setStep(step + 1);
      }
    } else {
      setStep(step + 1);
    }
  };

  const handlePreviousStep = () => {
    if (step === 1) {
      router.push(`/rooms/calendar?roomId=${roomId}&roomType=${encodeURIComponent(roomType)}&price=${price}&capacity=${bookingData.maxCapacity}&totalRooms=${totalRooms}`);
    } else {
      setStep(step - 1);
    }
  };

  // Upload file to Cloudinary and return URL
  const uploadFileToCloudinary = async (file) => {
    try {
      const imageUrl = await uploadImage(file);
      return imageUrl;
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      throw new Error('Failed to upload image. Please try again.');
    }
  };

  const handlePaymentProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File size exceeds 10MB. Please choose a smaller file.', 'error');
      return;
    }
    
    setUploading(true);
    try {
      showNotification('Uploading to server... Please wait.', 'info');
      const imageUrl = await uploadFileToCloudinary(file);
      setBookingData(prev => ({ ...prev, paymentProofUrl: imageUrl }));
      showNotification('Payment proof uploaded successfully!');
    } catch (error) {
      console.error('Error uploading file:', error);
      showNotification(error.message || 'Failed to upload file. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleValidIdFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File size exceeds 10MB. Please choose a smaller file.', 'error');
      return;
    }

    setValidIdUploading(true);
    try {
      showNotification('Uploading ID to server... Please wait.', 'info');
      const imageUrl = await uploadFileToCloudinary(file);
      setTempValidIdFile(imageUrl);
      showNotification('Valid ID uploaded successfully!');
    } catch (error) {
      console.error('Error uploading valid ID:', error);
      showNotification(error.message || 'Failed to upload valid ID. Please try again.', 'error');
    } finally {
      setValidIdUploading(false);
    }
  };

  const handleSaveValidId = () => {
    if (!tempValidIdFile || !tempValidIdType) return;
    setBookingData(prev => ({
      ...prev,
      validIdType: tempValidIdType,
      validIdUrl: tempValidIdFile
    }));
    setShowValidIdModal(false);
  };

  const handleSubmitBooking = async () => {
    setSubmitting(true);
    try {
      // First, check if the room is still available for the selected dates
      const bookingsRef = collection(db, 'bookings');
      const checkInDate = new Date(bookingData.checkIn);
      const checkOutDate = new Date(bookingData.checkOut);
      const requestedRooms = bookingData.numberOfRooms || 1;
      
      // Get room details to know total rooms
      const roomDoc = await getDoc(doc(db, 'rooms', bookingData.roomId));
      
      if (!roomDoc.exists()) {
        alert('Room not found. Please try again.');
        router.push('/rooms');
        return;
      }
      
      const roomData = roomDoc.data();
      const totalRoomsAvailable = roomData.totalRooms || 1;
      
      // Check existing confirmed AND pending bookings for this room during the selected dates
      const q = query(
        bookingsRef,
        where('roomId', '==', bookingData.roomId),
        where('status', 'in', ['confirmed', 'check-in', 'pending']),
        where('checkIn', '<', checkOutDate),
        where('checkOut', '>', checkInDate)
      );
      
      const existingBookings = await getDocs(q);
      let totalBookedCount = 0;
      existingBookings.forEach((bookingDoc) => {
        const booking = bookingDoc.data();
        totalBookedCount += booking.numberOfRooms || 1;
      });
      
      // Check if adding this booking would exceed available rooms
      if (totalBookedCount + requestedRooms > totalRoomsAvailable) {
        alert(`Sorry, only ${totalRoomsAvailable - totalBookedCount} room(s) available for the selected dates, but you're trying to book ${requestedRooms}.`);
        router.push('/rooms');
        return;
      }
      
      // Use the pre-generated booking ID
      const bookingId = generatedBookingId;
      
      const booking = {
        bookingId, // This is the formatted BOOK-xxx-xxx ID
        guestUid: guestAccount?.uid || null,
        guestAuthProvider: guestAccount?.uid ? 'google' : null,
        roomId: bookingData.roomId,
        roomType: bookingData.roomType,
        price: bookingData.price,
        nights: bookingData.nights,
        guests: bookingData.guests,
        totalPrice,
        downPayment: downPaymentAmount,
        remainingBalance: totalPrice - downPaymentAmount,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        guestInfo: {
          firstName: bookingData.firstName,
          lastName: bookingData.lastName,
          email: bookingData.email,
          phone: bookingData.phone
        },
        status: 'pending',
        paymentMethod: paymentMethod,
        paymentProofUrl: bookingData.paymentProofUrl, // Store URL instead of Base64
        validIdType: bookingData.validIdType || null,
        validIdUrl: bookingData.validIdUrl || null, // Store URL instead of Base64
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        type: 'room',
        numberOfRooms: bookingData.numberOfRooms,
        specialRequest: bookingData.specialRequest || null
      };
      
      // Add bank details if provided
      if (bankDetailsProvided) {
        booking.bankDetailsProvided = bankDetailsProvided;
      }
      
      // Add the booking to Firestore - Firestore will generate its own document ID
      // but we're storing our formatted bookingId as a field in the document
      await addDoc(collection(db, 'bookings'), booking);
      
      setStep(4);
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Failed to create booking. Please try again: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDateOnly = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  const formatTimeOnly = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Get capacity display
  const getCapacityDisplay = () => {
    if (roomDetails) {
      const minCap = roomDetails.capacityMin || 1;
      const maxCap = roomDetails.capacityMax || bookingData.maxCapacity;
      return `${minCap} – ${maxCap} guests per room`;
    }
    return `${bookingData.maxCapacity} guests per room`;
  };

  if (!checkInDateParam) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <div className="text-center">
            <i className="fas fa-calendar-times text-5xl text-ocean-light mb-4"></i>
            <p className="text-textPrimary">No check-in date selected. Please select a date first.</p>
            <button
              onClick={() => router.push('/rooms')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-lg"
            >
              Back to Rooms
            </button>
          </div>
        </div>
      </GuestLayout>
    );
  }

  // Get the current max capacity for display (from roomDetails)
  const currentMaxCapacity = roomDetails?.capacityMax || bookingData.maxCapacity;
  const currentMinCapacity = roomDetails?.capacityMin || 1;
  const maxTotalGuests = getMaxTotalGuests();
  const minTotalGuests = getMinTotalGuests();

  return (
    <GuestLayout>
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white py-12">
        <div className="max-w-7xl w-full mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column - Booking Form (70%) */}
            <div className="lg:w-[70%]">
              {/* Progress Steps */}
              <div className="mb-8">
                <div className="flex justify-between items-center">
                  {[1, 2, 3, 4].map((s) => (
                    <div key={s} className="flex-1 relative">
                      <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-semibold ${
                        step >= s ? 'bg-ocean-mid text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {s}
                      </div>
                      <div className="text-center text-xs mt-2 text-textSecondary">
                        {s === 1 && 'Dates'}
                        {s === 2 && 'Guest Details'}
                        {s === 3 && 'Payment'}
                        {s === 4 && 'Confirmation'}
                      </div>
                      {s < 4 && (
                        <div className={`absolute top-5 left-1/2 w-full h-0.5 ${
                          step > s ? 'bg-ocean-mid' : 'bg-gray-200'
                        }`} style={{ transform: 'translateY(-50%)' }}></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 1: Dates */}
              {step === 1 && (
                <div className="bg-white rounded-2xl shadow-lg p-8">
                  <h2 className="text-2xl font-bold text-textPrimary mb-6">Step 1: Booking Summary</h2>
                  
                  {availabilityStatus.checking && (
                    <div className="mb-5 p-4 bg-ocean-ice rounded-xl">
                      <div className="flex items-center gap-2 text-ocean-mid">
                        <i className="fas fa-spinner fa-spin"></i>
                        <span className="font-medium">Checking availability...</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-5">
                    <div className="p-5 bg-ocean-ice rounded-xl">
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Check-in Date & Time</label>
                      <p className="text-lg font-medium text-ocean-mid">
                        {formatDateTime(bookingData.checkIn)} ({FIXED_CHECK_IN_DISPLAY})
                      </p>
                      <p className="text-xs text-textSecondary mt-1">
                        Check-in time is fixed at 2:00 PM
                      </p>
                    </div>
                    
                    {/* Number of nights is handled in the calendar selection flow */}
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Number of Guests *</label>
                      <input
                        type="number"
                        min="1"
                        value={bookingData.guests}
                        onChange={(e) => handleInputChange('guests', parseInt(e.target.value))}
                        className={`w-full px-4 py-2 border ${errors.guests ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.guests && <p className="text-red-500 text-sm mt-1">{errors.guests}</p>}
                      <p className="text-xs text-textSecondary mt-1">
                        Maximum of {maxTotalGuests} guests allowed
                      </p>
                    </div>
                    
                    {bookingData.checkOut && (
                      <div className="p-5 bg-ocean-ice rounded-xl">
                        <label className="block text-sm font-semibold text-textPrimary mb-2">Check-out Date & Time</label>
                        <p className="text-lg font-medium text-ocean-mid">
                          {formatDateOnly(bookingData.checkOut)} at {FIXED_CHECK_OUT_DISPLAY}
                        </p>
                        <p className="text-xs text-textSecondary mt-1">
                          Check-out time is fixed at 12:00 PM (noon)
                        </p>
                      </div>
                    )}
                    
                    <div className="p-5 bg-gradient-to-r from-ocean-ice to-blue-white rounded-xl">
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Total Price</label>
                      <p className="text-3xl font-bold text-ocean-mid">₱{totalPrice.toLocaleString()}</p>
                      <p className="text-xs text-textSecondary">₱{price.toLocaleString()} x {bookingData.numberOfRooms} room(s) x {bookingData.nights} night(s)</p>
                      
                      {/* Down Payment Display */}
                      <div className="mt-3 pt-3 border-t border-ocean-light/20">
                        <p className="text-sm font-semibold text-amber-600 mb-1">Down Payment Required (50%)</p>
                        <p className="text-2xl font-bold text-amber-600">₱{downPaymentAmount.toLocaleString()}</p>
                        <p className="text-xs text-textSecondary mt-1">Pay 50% upfront to confirm your reservation</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 py-3 border border-ocean-light/20 rounded-xl text-textSecondary font-medium hover:bg-ocean-ice transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      disabled={!availabilityStatus.isAvailable || availabilityStatus.checking || !!errors.guests}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                        availabilityStatus.isAvailable && !availabilityStatus.checking && !errors.guests
                          ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Continue to Guest Details
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Guest Details */}
              {step === 2 && (
                <div className="bg-white rounded-2xl shadow-lg p-8">
                  <h2 className="text-2xl font-bold text-textPrimary mb-6">Step 2: Guest Details</h2>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">First Name *</label>
                      <input
                        type="text"
                        value={bookingData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        className={`w-full px-4 py-2 border ${errors.firstName ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Last Name *</label>
                      <input
                        type="text"
                        value={bookingData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        className={`w-full px-4 py-2 border ${errors.lastName ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Email Address *</label>
                      <input
                        type="email"
                        value={bookingData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`w-full px-4 py-2 border ${errors.email ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Phone Number * (11 digits)</label>
                      <input
                        type="tel"
                        value={bookingData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="09123456789"
                        className={`w-full px-4 py-2 border ${errors.phone ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 py-3 border border-ocean-light/20 rounded-xl text-textSecondary font-medium hover:bg-ocean-ice transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      className="flex-1 py-3 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                    >
                      Continue to Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment */}
              {step === 3 && (
                <div className="bg-white rounded-2xl shadow-lg p-8">
                  <h2 className="text-2xl font-bold text-textPrimary mb-6">Step 3: Payment</h2>
                  
                  {/* Payment Method Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-textPrimary mb-3">Select Payment Method</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('gcash')}
                        className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
                          paymentMethod === 'gcash'
                            ? 'border-ocean-mid bg-ocean-ice'
                            : 'border-ocean-light/20 bg-white hover:border-ocean-light'
                        }`}
                      >
                        <i className={`fab fa-gcash text-3xl ${paymentMethod === 'gcash' ? 'text-ocean-mid' : 'text-gray-400'}`}></i>
                        <span className={`text-sm font-medium ${paymentMethod === 'gcash' ? 'text-ocean-mid' : 'text-textSecondary'}`}>GCash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
                          paymentMethod === 'bank_transfer'
                            ? 'border-ocean-mid bg-ocean-ice'
                            : 'border-ocean-light/20 bg-white hover:border-ocean-light'
                        }`}
                      >
                        <i className={`fas fa-university text-3xl ${paymentMethod === 'bank_transfer' ? 'text-ocean-mid' : 'text-gray-400'}`}></i>
                        <span className={`text-sm font-medium ${paymentMethod === 'bank_transfer' ? 'text-ocean-mid' : 'text-textSecondary'}`}>Bank Transfer</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* GCash Payment Section */}
                  {paymentMethod === 'gcash' && (
                    <div className="space-y-6">
                      <div className="p-5 bg-ocean-ice rounded-xl text-center">
                        <h3 className="text-lg font-semibold text-textPrimary mb-3 flex items-center justify-center gap-2">
                          <i className="fab fa-gcash text-ocean-mid"></i>
                          GCash Payment
                        </h3>
                        {paymentSettings.gcashQRCode ? (
                          <>
                            <div className="flex justify-center mb-3">
                              <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center border border-ocean-light/20 overflow-hidden relative">
                                <img
                                  src={paymentSettings.gcashQRCode}
                                  alt="GCash QR Code"
                                  className="object-contain w-full h-full"
                                />
                              </div>
                            </div>
                            <p className="text-sm text-textSecondary">Scan QR code to pay with GCash</p>
                          </>
                        ) : (
                          <p className="text-sm text-amber-600">GCash QR code not available. Please contact the resort.</p>
                        )}
                      </div>
                      
                      <div className="p-5 bg-gradient-to-r from-ocean-ice to-blue-white rounded-xl">
                        <p className="text-sm font-semibold text-textPrimary mb-1">Down Payment Required</p>
                        <p className="text-2xl font-bold text-amber-600">₱{downPaymentAmount.toLocaleString()}</p>
                        <p className="text-xs text-textSecondary mt-1">50% of total price</p>
                      </div>

                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <p className="text-sm text-blue-800 mb-2">
                          <i className="fas fa-info-circle mr-2"></i>
                          <strong>Payment Notes:</strong>
                        </p>
                        <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                          <li>You are only required to pay the <strong>down payment (50%)</strong> to confirm your reservation.</li>
                          <li>The <strong>remaining balance</strong> (₱{(totalPrice - downPaymentAmount).toLocaleString()}) should be paid at the resort upon check-in.</li>
                          <li>If you cancel your reservation, the resort will retain <strong>50% of the down payment</strong>.</li>
                        </ul>
                      </div>

                      <div className="bg-gradient-to-br from-white to-ocean-ice/30 rounded-xl border border-ocean-light/30 p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <i className="fas fa-id-card text-ocean-mid text-lg"></i>
                          <label className="text-sm font-semibold text-textPrimary">Upload Valid ID *</label>
                        </div>
                        <p className="text-xs text-textSecondary mb-3">
                          Full name on the ID must match the booking details. Image must be clear (front only) with no blur. Max file size: 10MB.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTempValidIdType(bookingData.validIdType || 'Passport');
                            setShowValidIdModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-ocean-light/40 text-sm font-medium text-textPrimary bg-white hover:bg-ocean-ice hover:border-ocean-mid/50 transition-all duration-200 shadow-sm"
                        >
                          <i className="fas fa-cloud-upload-alt text-ocean-mid"></i>
                          {bookingData.validIdUrl ? 'Change Uploaded Valid ID' : 'Choose File'}
                        </button>
                        {bookingData.validIdType && (
                          <p className="mt-3 text-xs text-ocean-mid flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Selected ID: <span className="font-semibold">{bookingData.validIdType}</span>
                          </p>
                        )}
                        {bookingData.validIdUrl && (
                          <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Valid ID uploaded
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-textPrimary mb-2">Upload Proof of Payment (Down Payment) *</label>
                        <p className="text-xs text-textSecondary mb-2">Max file size: 10MB. Supported formats: PNG, JPG, JPEG.</p>
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePaymentProofUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            id="payment-proof-upload"
                            disabled={uploading}
                          />
                          <label
                            htmlFor="payment-proof-upload"
                            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all duration-300 cursor-pointer ${
                              uploading
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                            }`}
                          >
                            <i className="fas fa-upload"></i>
                            {uploading ? 'Uploading...' : 'Choose File'}
                          </label>
                          {bookingData.paymentProofUrl && (
                            <span className="ml-3 text-sm text-green-600">
                              <i className="fas fa-check-circle mr-1"></i>
                              File uploaded
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Bank Transfer Section */}
                  {paymentMethod === 'bank_transfer' && (
                    <div className="space-y-6">
                      <div className="p-5 bg-ocean-ice rounded-xl">
                        <h3 className="text-lg font-semibold text-textPrimary mb-3 flex items-center gap-2">
                          <i className="fas fa-university text-ocean-mid"></i>
                          Bank Transfer
                        </h3>

                        {modalNotification && (
                          <div className={`mb-4 p-3 rounded-lg text-sm ${
                            modalNotification.type === 'error' 
                              ? 'bg-red-50 text-red-700 border border-red-200' 
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            <i className={`fas ${modalNotification.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2`}></i>
                            {modalNotification.message}
                          </div>
                        )}
                        
                        {bankDetailsProvided ? (
  <div className="space-y-3">
    <div className="bg-white rounded-lg p-4 space-y-2">
      <p><strong>Bank:</strong> {bankDetailsProvided.bankName}</p>
      <p><strong>Account Name:</strong> {bankDetailsProvided.accountName}</p>
      {bankDetailsProvided.accountNumber && bankDetailsProvided.accountNumber !== 'QR Code Provided' ? (
        <p><strong>Account Number:</strong> {bankDetailsProvided.accountNumber}</p>
      ) : bankDetailsProvided.qrCodeUrl ? (
        <div className="mt-3">
          <p><strong>QR Code:</strong></p>
          <div className="mt-2 flex flex-col items-center">
            <div className="w-48 h-48 bg-white rounded-xl border border-ocean-light/20 overflow-hidden relative">
              <img
                src={bankDetailsProvided.qrCodeUrl}
                alt="Bank QR Code"
                className="object-contain w-full h-full"
              />
            </div>
            <p className="text-sm text-textSecondary mt-2">Scan to pay.</p>
          </div>
        </div>
      ) : null}
    </div>
  </div>
) : bankRequestSent ? (
                          <div className="text-center py-4">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                              <i className="fas fa-clock text-blue-600 text-2xl"></i>
                            </div>
                            <p className="text-textSecondary font-medium mb-2">
                              Request Sent!
                            </p>
                            <p className="text-sm text-textSecondary">
                              Your bank transfer request has been sent to the resort.
                            </p>
                            <p className="text-xs text-textSecondary mt-2">
                              The resort will provide bank account details shortly. Please check back.
                            </p>
                            {requestedBankInfo && (
                              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                <p className="text-xs text-blue-700">
                                  <i className="fas fa-university mr-1"></i>
                                  Requested Bank: <strong>{requestedBankInfo.bankName}</strong>
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            {!showBankSelection ? (
                              <>
                                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <i className="fas fa-university text-amber-600 text-2xl"></i>
                                </div>
                                <p className="text-textSecondary mb-3">
                                  Select your preferred bank to receive account details:
                                </p>
                                {paymentSettings.bankAccounts.length > 0 ? (
                                  <div className="space-y-2 mb-4">
                                    {paymentSettings.bankAccounts.map((bank) => (
                                      <button
                                        key={bank.id}
                                        onClick={() => {
                                          setSelectedBankAccount(bank);
                                          setShowBankSelection(true);
                                        }}
                                        className="w-full text-left p-3 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition-all duration-200"
                                      >
                                        <p className="font-semibold text-textPrimary">{bank.bankName}</p>
                                        <p className="text-xs text-textSecondary">{bank.accountName}</p>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-amber-600">No bank accounts available. Please contact the resort.</p>
                                )}
                              </>
                            ) : (
                              <div className="space-y-4">
                                <div className="bg-amber-50 rounded-lg p-4">
                                  <p className="font-semibold text-amber-800 mb-2">Selected Bank:</p>
                                  <p><strong>Bank:</strong> {selectedBankAccount?.bankName}</p>
                                  <p><strong>Account Name:</strong> {selectedBankAccount?.accountName}</p>
                                </div>
                                <button
                                  onClick={handleNotifyResort}
                                  disabled={notifyingResort}
                                  className="w-full px-6 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-all duration-200"
                                >
                                  {notifyingResort ? (
                                    <><i className="fas fa-spinner fa-spin mr-2"></i>Sending Request...</>
                                  ) : (
                                    <><i className="fas fa-paper-plane mr-2"></i>Confirm & Send Request</>
                                  )}
                                </button>
                                <button
                                  onClick={() => setShowBankSelection(false)}
                                  className="w-full px-6 py-2 border border-ocean-light/20 rounded-lg text-textSecondary hover:bg-ocean-ice transition-all duration-200"
                                >
                                  Back to Bank Selection
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="p-5 bg-gradient-to-r from-ocean-ice to-blue-white rounded-xl">
                        <p className="text-sm font-semibold text-textPrimary mb-1">Down Payment Required</p>
                        <p className="text-2xl font-bold text-amber-600">₱{downPaymentAmount.toLocaleString()}</p>
                        <p className="text-xs text-textSecondary mt-1">50% of total price</p>
                      </div>

                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <p className="text-sm text-blue-800 mb-2">
                          <i className="fas fa-info-circle mr-2"></i>
                          <strong>Payment Notes:</strong>
                        </p>
                        <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                          <li>You are only required to pay the <strong>down payment (50%)</strong> to confirm your reservation.</li>
                          <li>The <strong>remaining balance</strong> (₱{(totalPrice - downPaymentAmount).toLocaleString()}) should be paid at the resort upon check-in.</li>
                          <li>If you cancel your reservation, the resort will retain <strong>50% of the down payment</strong>.</li>
                        </ul>
                      </div>

                      <div className="bg-gradient-to-br from-white to-ocean-ice/30 rounded-xl border border-ocean-light/30 p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <i className="fas fa-id-card text-ocean-mid text-lg"></i>
                          <label className="text-sm font-semibold text-textPrimary">Upload Valid ID *</label>
                        </div>
                        <p className="text-xs text-textSecondary mb-3">
                          Full name on the ID must match the booking details. Image must be clear (front only) with no blur. Max file size: 10MB.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTempValidIdType(bookingData.validIdType || 'Passport');
                            setShowValidIdModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-ocean-light/40 text-sm font-medium text-textPrimary bg-white hover:bg-ocean-ice hover:border-ocean-mid/50 transition-all duration-200 shadow-sm"
                        >
                          <i className="fas fa-cloud-upload-alt text-ocean-mid"></i>
                          {bookingData.validIdUrl ? 'Change Uploaded Valid ID' : 'Choose File'}
                        </button>
                        {bookingData.validIdType && (
                          <p className="mt-3 text-xs text-ocean-mid flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Selected ID: <span className="font-semibold">{bookingData.validIdType}</span>
                          </p>
                        )}
                        {bookingData.validIdUrl && (
                          <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Valid ID uploaded
                          </p>
                        )}
                      </div>
                      
                      {bankDetailsProvided && (
                        <div>
                          <label className="block text-sm font-semibold text-textPrimary mb-2">Upload Proof of Payment (Down Payment) *</label>
                          <p className="text-xs text-textSecondary mb-2">Max file size: 10MB. Supported formats: PNG, JPG, JPEG.</p>
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePaymentProofUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              id="payment-proof-upload"
                              disabled={uploading}
                            />
                            <label
                              htmlFor="payment-proof-upload"
                              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all duration-300 cursor-pointer ${
                                uploading
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                              }`}
                            >
                              <i className="fas fa-upload"></i>
                              {uploading ? 'Uploading...' : 'Choose File'}
                            </label>
                            {bookingData.paymentProofUrl && (
                              <span className="ml-3 text-sm text-green-600">
                                <i className="fas fa-check-circle mr-1"></i>
                                File uploaded
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 py-3 border border-ocean-light/20 rounded-xl text-textSecondary font-medium hover:bg-ocean-ice transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleSubmitBooking}
                      disabled={
                        !bookingData.paymentProofUrl ||
                        !bookingData.validIdUrl ||
                        submitting ||
                        (paymentMethod === 'bank_transfer' && !bankDetailsProvided)
                      }
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                        bookingData.paymentProofUrl &&
                        bookingData.validIdUrl &&
                        !submitting &&
                        (paymentMethod !== 'bank_transfer' || bankDetailsProvided)
                          ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {submitting ? 'Submitting...' : 'Confirm Booking'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Confirmation */}
              {step === 4 && (
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-check text-3xl text-green-600"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-textPrimary mb-2">Booking Confirmed!</h2>
                  <p className="text-textSecondary mb-4">
                    Thank you for your booking! A confirmation email will be sent to {bookingData.email}. You can also track and cancel your reservation anytime through the Reservation Tracker page.
                  </p>
                  
                  <div className="p-4 bg-ocean-ice rounded-lg mb-4">
                    <p className="text-sm text-textPrimary">Copy your booking reference to track your reservation.</p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <strong className="text-lg font-mono">{generatedBookingId}</strong>
                      <button
                        onClick={() => copyToClipboard(generatedBookingId)}
                        className="p-1.5 rounded-lg bg-white hover:bg-ocean-light/10 text-ocean-mid transition-all duration-200"
                        title="Copy to clipboard"
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                    {copiedMessage && (
                      <p className="text-xs text-green-600 mt-1 animate-fadeIn">
                        <i className="fas fa-check-circle mr-1"></i>
                        Copied!
                      </p>
                    )}
                  </div>
                  
                  <div className="p-4 bg-amber-50 rounded-lg mb-6">
                    <p className="text-sm text-amber-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      Down payment of <strong>₱{downPaymentAmount.toLocaleString()}</strong> has been confirmed for {bookingData.numberOfRooms} room(s) with {bookingData.guests} total guest(s).
                      Remaining balance of <strong>₱{(totalPrice - downPaymentAmount).toLocaleString()}</strong> is payable at the resort.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => router.push('/rooms')}
                      className="flex-1 py-3 border border-ocean-light/20 rounded-xl text-textSecondary font-medium hover:bg-ocean-ice transition"
                    >
                      Back to Room Page
                    </button>
                    <button
                      onClick={() => router.push('/')}
                      className="flex-1 py-3 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-xl font-medium hover:shadow-lg transition"
                    >
                      Go to Home Page
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Room Details Card (30%) */}
            <div className="lg:w-[30%]">
              <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 overflow-hidden sticky top-8">
                <div className="relative h-48 bg-gradient-to-br from-ocean-pale to-ocean-ice overflow-hidden">
                  {roomDetails?.images && roomDetails.images[0] ? (
                    <Image
                      src={roomDetails.images[0]}
                      alt={roomType}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <i className="fas fa-hotel text-5xl text-ocean-light/30"></i>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <h3 className="font-bold text-textPrimary text-xl mb-2">{roomType}</h3>
                  <div className="mb-4">
                    <p className="text-2xl font-bold text-ocean-mid">
                      ₱{parseInt(price).toLocaleString()}
                      <span className="text-sm font-normal text-textSecondary">/night</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-textSecondary mb-4">
                    <i className="fas fa-users text-ocean-light"></i>
                    <span className="text-sm">{getCapacityDisplay()}</span>
                  </div>
                  
                  {/* Room Quantity Display - Read Only */}
                  <div className="bg-ocean-ice rounded-lg p-3 mb-4">
                    <h4 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-door-open text-ocean-light text-xs"></i>
                      Booking Summary
                    </h4>
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="text-textSecondary">Number of Rooms:</span>{' '}
                        <span className="font-semibold text-textPrimary">{bookingData.numberOfRooms} room(s)</span>
                      </p>
                      <p className="text-sm">
                        <span className="text-textSecondary">Guests:</span>{' '}
                        <span className="font-semibold text-textPrimary">{bookingData.guests} total guest(s)</span>
                      </p>
                      <p className="text-sm">
                        <span className="text-textSecondary">Per room average:</span>{' '}
                        <span className="font-semibold text-ocean-mid">~{Math.ceil(bookingData.guests / bookingData.numberOfRooms)} guests/room</span>
                      </p>
                      <p className="text-sm">
                        <span className="text-textSecondary">Price per night:</span>{' '}
                        <span className="font-semibold text-ocean-mid">₱{price.toLocaleString()}</span>
                      </p>
                      <p className="text-sm">
                        <span className="text-textSecondary">Total per night:</span>{' '}
                        <span className="font-semibold text-ocean-mid">₱{(price * bookingData.numberOfRooms).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Selected Schedule Section */}
                  <div className="bg-ocean-ice rounded-lg p-3 mb-4">
                    <h4 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-calendar-check text-ocean-light text-xs"></i>
                      Selected Schedule
                    </h4>
                    {bookingData.checkIn ? (
                      <>
                        <p className="text-base font-semibold text-textPrimary">
                          {formatDateOnly(bookingData.checkIn)}
                        </p>
                        <p className="text-sm text-ocean-mid font-medium mt-1">
                          <i className="fas fa-clock mr-1"></i>
                          Check-in: {FIXED_CHECK_IN_DISPLAY}
                        </p>
                        {bookingData.checkOut && (
                          <p className="text-xs text-textSecondary mt-2">
                            Check-out: {formatDateOnly(bookingData.checkOut)} at {FIXED_CHECK_OUT_DISPLAY}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-base font-semibold text-textPrimary">No date selected</p>
                    )}
                  </div>

                  {/* Special Request Field - Editable in room card */}
                  <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-comment text-amber-600 text-xs"></i>
                      Special Request
                    </h4>
                    <textarea
                      value={bookingData.specialRequest}
                      onChange={(e) => setBookingData(prev => ({ ...prev, specialRequest: e.target.value }))}
                      placeholder="e.g., Request early check-in, room preference, special occasion, etc."
                      rows="3"
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-ocean-light resize-none bg-white"
                    />
                    <p className="text-xs text-amber-600 mt-1">
                      <i className="fas fa-clock mr-1"></i>
                      Note: Check-in time is fixed at 2:00 PM. If you need early check-in, please specify your requested time here.
                    </p>
                  </div>

                  {/* Room Amenities (if available) */}
                  {roomDetails?.amenities && roomDetails.amenities.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-textPrimary mb-2 flex items-center gap-1">
                        <i className="fas fa-concierge-bell text-ocean-light text-xs"></i>
                        Amenities
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {roomDetails.amenities.slice(0, 4).map((amenity, idx) => (
                          <span key={idx} className="text-xs bg-ocean-ice text-textSecondary px-2 py-1 rounded-full">
                            {amenity}
                          </span>
                        ))}
                        {roomDetails.amenities.length > 4 && (
                          <span className="text-xs bg-ocean-ice text-textSecondary px-2 py-1 rounded-full">
                            +{roomDetails.amenities.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showValidIdModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-textPrimary">Upload Valid ID</h3>
              <button
                onClick={() => setShowValidIdModal(false)}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/30 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-2">ID Type</label>
                <select
                  value={tempValidIdType}
                  onChange={(e) => setTempValidIdType(e.target.value)}
                  className="w-full px-3 py-2 border border-ocean-light/30 rounded-lg text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20"
                >
                  {validIdOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-textSecondary">
                Requirements:
                <br />- Full name must match booking details
                <br />- Image must be clear (front only)
                <br />- No blurred images allowed
                <br />- Max file size: 10MB
              </p>

              <div className="pt-1 border-t border-ocean-light/20">
                <label className="block text-sm font-semibold text-textPrimary mb-2">Valid ID Image (front only)</label>
                <div className="relative mb-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleValidIdFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="valid-id-upload"
                    disabled={validIdUploading}
                  />
                  <label
                    htmlFor="valid-id-upload"
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-300 cursor-pointer ${
                      validIdUploading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                    }`}
                  >
                    <i className="fas fa-upload"></i>
                    {validIdUploading ? 'Uploading...' : tempValidIdFile ? 'Change Image' : 'Choose File'}
                  </label>
                </div>

                {tempValidIdFile && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-textPrimary mb-1">Preview</p>
                    <div className="border border-ocean-light/30 rounded-lg overflow-hidden bg-ocean-ice">
                      <img
                        src={tempValidIdFile}
                        alt="Valid ID Preview"
                        className="w-full max-h-64 object-contain bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowValidIdModal(false)}
                className="px-4 py-2 border border-ocean-light/30 rounded-lg text-sm text-textSecondary hover:bg-ocean-ice transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveValidId}
                disabled={!tempValidIdFile || !tempValidIdType || validIdUploading}
                className="px-4 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-lg text-sm font-medium text-white hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Valid ID
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>

      <GuestAuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          setIsAuthOpen(false);
          setPendingNextStep(false);
        }}
      />
    </GuestLayout>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <GuestLayout>
          <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
            <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
          </div>
        </GuestLayout>
      }
    >
      <BookingPageContent />
    </Suspense>
  );
}
