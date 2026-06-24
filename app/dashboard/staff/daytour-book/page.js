// app/dashboard/staff/daytour-book/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { buildExclusiveResortBlockedDateMap } from '@/lib/exclusiveResortDayTourBlocks';
import { usePhilippineTimeSync } from '@/hooks/usePhilippineTimeSync';
import {
  isPhilippineCalendarDatePast,
  isPhilippineCalendarDateTooSoon,
} from '@/lib/philippineTime';
import { QRCodeSVG } from 'qrcode.react';
// FIXED: Use sendDayTourConfirmationEmail instead of generic sendConfirmationEmail
import { sendDayTourConfirmationEmail } from '@/lib/emailService';
import { uploadImage } from '@/lib/cloudinary';
import { compressImage } from '@/lib/imageUtils';

// Storage keys for persisting data
const STAFF_DAYTOUR_STORAGE_KEY = 'staff_daytour_booking_data';
const STAFF_DAYTOUR_STEP_KEY = 'staff_daytour_booking_step';

export default function StaffDayTourBook() {
  const router = useRouter();
  const { ready: phTimeReady, nowMs } = usePhilippineTimeSync();
  
  // Day tour data
  const [dayTour, setDayTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  
  // Date and guest count state
  const [date, setDate] = useState('');
  const [adults, setAdults] = useState('1');
  const [kids, setKids] = useState('0');
  const [bookedDates, setBookedDates] = useState({});
  const [unavailableDates, setUnavailableDates] = useState({});
  const [exclusiveResortBlockedDates, setExclusiveResortBlockedDates] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [hoveredDateKey, setHoveredDateKey] = useState('');
  const [dateError, setDateError] = useState('');
  const calendarPopoverRef = useRef(null);
  const calendarTriggerRef = useRef(null);
  
  // Step state
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [generatedBookingId, setGeneratedBookingId] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  
  // Guest information form state
  const [guestInfo, setGuestInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    houseNumber: '',
    street: '',
    city: '',
    province: ''
  });
  
  // Valid ID form state - now optional
  const [validIdData, setValidIdData] = useState({
    idType: '',
    customIdType: '',
    idImageUrl: ''
  });
  
  // NEW: Remaining Balance Payment Method
  const [balancePaymentMethod, setBalancePaymentMethod] = useState('');
  const [specialRequest, setSpecialRequest] = useState('');
  
  const [uploadingId, setUploadingId] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Valid ID options
  const VALID_ID_OPTIONS = [
    'Passport',
    "Driver's License",
    'National ID',
    'UMID',
    'SSS ID',
    'PRC ID',
    "Voter's ID",
    'Postal ID',
    'Other'
  ];

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const HARD_MAX_PACKS = 38;

  const toLocalDateKey = (targetDate) => {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateKey = (value) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const formatInputDate = (value) => {
    if (!value) return 'mm/dd/yyyy';
    const parsedDate = parseDateKey(value);
    if (!parsedDate) return 'mm/dd/yyyy';
    return parsedDate.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  const formatLongDate = (value) => {
    const parsedDate = parseDateKey(value);
    if (!parsedDate) return '';
    return parsedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDaysInMonth = (targetDate) => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const isDatePast = (targetDate) => {
    if (!phTimeReady) return false;
    return isPhilippineCalendarDatePast(targetDate, nowMs);
  };

  const isDateTooSoon = (targetDate) => {
    if (!phTimeReady) return false;
    return isPhilippineCalendarDateTooSoon(targetDate, 2, nowMs);
  };

  const getRemainingCapacity = (targetDate) => {
    const dateKey = toLocalDateKey(targetDate);
    if (exclusiveResortBlockedDates[dateKey]) return 0;
    if (!dayTour?.maxCapacity) return Infinity;
    const bookedCount = bookedDates[dateKey] || 0;
    const unavailableCount = unavailableDates[dateKey] || 0;
    return dayTour.maxCapacity - (bookedCount + unavailableCount);
  };

  const isDateSelectable = (targetDate) => {
    if (isDatePast(targetDate)) return false;
    if (isDateTooSoon(targetDate)) return false;
    return getRemainingCapacity(targetDate) > 0;
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
  };

  // Load persisted data
  useEffect(() => {
    try {
      const savedStep = localStorage.getItem(STAFF_DAYTOUR_STEP_KEY);
      if (savedStep && !isNaN(parseInt(savedStep))) {
        const stepNum = parseInt(savedStep);
        if (stepNum >= 1 && stepNum <= 3) {
          setStep(stepNum);
        }
      }
      
      const savedData = localStorage.getItem(STAFF_DAYTOUR_STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.guestInfo) setGuestInfo(parsed.guestInfo);
        if (parsed.validIdData) setValidIdData(parsed.validIdData);
        if (parsed.date) setDate(parsed.date);
        if (parsed.adults) setAdults(parsed.adults);
        if (parsed.kids) setKids(parsed.kids);
        if (parsed.balancePaymentMethod) setBalancePaymentMethod(parsed.balancePaymentMethod);
        if (parsed.specialRequest) setSpecialRequest(parsed.specialRequest);
      }
    } catch (error) {
      console.error('Error loading persisted data:', error);
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    try {
      const dataToSave = {
        guestInfo,
        validIdData,
        date,
        adults,
        kids,
        balancePaymentMethod,
        specialRequest
      };
      localStorage.setItem(STAFF_DAYTOUR_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }, [guestInfo, validIdData, date, adults, kids, balancePaymentMethod, specialRequest]);

  // Save step to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STAFF_DAYTOUR_STEP_KEY, String(step));
    } catch (error) {
      console.error('Error saving step:', error);
    }
  }, [step]);

  // Clear persisted data when booking is completed
  useEffect(() => {
    if (step === 3 && isConfirmed) {
      try {
        localStorage.removeItem(STAFF_DAYTOUR_STORAGE_KEY);
        localStorage.removeItem(STAFF_DAYTOUR_STEP_KEY);
      } catch (error) {
        console.error('Error clearing persisted data:', error);
      }
    }
  }, [step, isConfirmed]);

  // Fetch day tour
  useEffect(() => {
    const toursRef = collection(db, 'dayTours');
    const toursQuery = query(toursRef, where('archived', '==', false));

    const unsubscribeTours = onSnapshot(toursQuery, (querySnapshot) => {
      const tours = [];
      querySnapshot.forEach((docSnap) => {
        tours.push({ id: docSnap.id, ...docSnap.data() });
      });
      const currentTour = tours[0] || null;
      setDayTour(currentTour);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching day tour:', error);
      setLoading(false);
    });

    return () => unsubscribeTours();
  }, []);

  // Fetch bookings
  useEffect(() => {
    if (!dayTour) return;

    const bookingsRef = collection(db, 'dayTourBookings');
    const bookingsQuery = query(bookingsRef, where('status', 'in', ['pending', 'confirmed', 'check-in']));

    const unsubscribeBookings = onSnapshot(bookingsQuery, (querySnapshot) => {
      const booked = {};
      querySnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        const dateKey = booking.selectedDate || booking.selectedDateISO?.split('T')[0];
        if (!dateKey) return;
        if (!booked[dateKey]) booked[dateKey] = 0;
        booked[dateKey] += (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
      });
      setBookedDates(booked);
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
    });

    return () => unsubscribeBookings();
  }, [dayTour]);

  // Fetch unavailable dates
  useEffect(() => {
    const unavailableRef = collection(db, 'daytour_unavailable_dates');

    const unsubscribeUnavailable = onSnapshot(unavailableRef, (querySnapshot) => {
      const unavailable = {};
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.date) return;
        unavailable[data.date] = (unavailable[data.date] || 0) + Number(data.unavailableGuests || 0);
      });
      setUnavailableDates(unavailable);
    }, (error) => {
      console.error('Error fetching day tour unavailable dates:', error);
    });

    return () => unsubscribeUnavailable();
  }, []);

  // Fetch exclusive resort blocks
  useEffect(() => {
    const exclusiveQuery = query(
      collection(db, 'bookings'),
      where('isExclusiveResortBooking', '==', true),
      where('status', 'in', ['pending', 'confirmed'])
    );

    const unsubscribeExclusive = onSnapshot(exclusiveQuery, (querySnapshot) => {
      const bookings = querySnapshot.docs.map((docSnap) => docSnap.data());
      setExclusiveResortBlockedDates(buildExclusiveResortBlockedDateMap(bookings));
    }, (error) => {
      console.error('Error fetching exclusive resort blocks for day tour:', error);
      setExclusiveResortBlockedDates({});
    });

    return () => unsubscribeExclusive();
  }, []);

  // Calendar click outside handler
  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event) => {
      if (calendarPopoverRef.current?.contains(event.target)) return;
      if (calendarTriggerRef.current?.contains(event.target)) return;
      setIsCalendarOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarOpen]);

  useEffect(() => {
    if (!isCalendarOpen) {
      setHoveredDateKey('');
    }
  }, [isCalendarOpen]);

  const adultsCount = Number.isNaN(parseInt(adults, 10)) ? 0 : parseInt(adults, 10);
  const kidsCount = Number.isNaN(parseInt(kids, 10)) ? 0 : parseInt(kids, 10);
  const totalGuests = adultsCount + kidsCount;
  const totalPrice = (adultsCount * (dayTour?.adultPrice || 0)) +
                     (kidsCount * (dayTour?.kidPrice || 0));
  const downPaymentAmount = totalPrice * 0.5;
  const remainingBalance = totalPrice - downPaymentAmount;

  // Validate guest counts
  useEffect(() => {
    if (!dayTour) {
      setDateError('');
      return;
    }

    if (!date) {
      setDateError('');
      return;
    }

    if (adults === '' || kids === '') {
      setDateError('');
      return;
    }

    if (adultsCount < 1) {
      setDateError('At least 1 adult is required.');
      return;
    }

    const effectiveMaxAllowed = dayTour.maxCapacity || Infinity;

    if (adultsCount > effectiveMaxAllowed || kidsCount > effectiveMaxAllowed || totalGuests > effectiveMaxAllowed) {
      setDateError(`We only allow up to ${effectiveMaxAllowed === Infinity ? 'unlimited' : effectiveMaxAllowed} guests per booking.`);
      return;
    }

    const selectedDate = parseDateKey(date);
    if (!selectedDate) {
      setDateError('Invalid date selected.');
      return;
    }

    if (!isDateSelectable(selectedDate)) {
      setDateError('Selected date is unavailable from admin settings or existing bookings.');
      return;
    }

    const remaining = getRemainingCapacity(selectedDate);
    if (remaining !== Infinity && totalGuests > remaining) {
      setDateError(`Only ${remaining} slot(s) left for the selected date.`);
      return;
    }

    setDateError('');
  }, [date, adults, kids, adultsCount, kidsCount, totalGuests, dayTour, bookedDates, unavailableDates, phTimeReady, nowMs]);

  const handleDateSelect = (targetDate) => {
    if (!isDateSelectable(targetDate)) return;
    setDate(toLocalDateKey(targetDate));
    setHoveredDateKey('');
    setCurrentMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    setDateError('');
    setIsCalendarOpen(false);
  };

  const handleAdultsChange = (value) => {
    if (value === '') {
      setAdults('');
      return;
    }
    if (/^\d+$/.test(value)) {
      setAdults(value);
    }
  };

  const handleKidsChange = (value) => {
    if (value === '') {
      setKids('');
      return;
    }
    if (/^\d+$/.test(value)) {
      setKids(value);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleGuestInfoChange = (field, value) => {
    setGuestInfo(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleValidIdChange = (field, value) => {
    setValidIdData(prev => ({ ...prev, [field]: value }));
    if (field === 'idType') {
      setValidIdData(prev => ({ ...prev, customIdType: '' }));
    }
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSpecialRequestChange = (value) => {
    setSpecialRequest(value);
  };

  // Step 1 validates only Day Tour Details (date + guests)
  const validateStep1 = () => {
    const errors = {};
    
    if (!date) {
      errors.date = 'Please select a date';
    }

    if (adults === '' || adultsCount < 1) {
      errors.guests = 'At least 1 adult is required';
    }

    if (kids === '') {
      errors.guests = 'Please enter a valid number of kids (use 0 if none)';
    }

    if (dateError) {
      errors.availability = dateError;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ============================================================
  // FIXED: Step 2 validates Guest Info only - Valid ID is optional
  // ============================================================
  const validateStep2 = () => {
    const errors = {};
    
    // Guest info validation - required fields
    if (!guestInfo.firstName || guestInfo.firstName.trim() === '') {
      errors.firstName = 'First name is required';
    }
    
    if (!guestInfo.lastName || guestInfo.lastName.trim() === '') {
      errors.lastName = 'Last name is required';
    }
    
    if (!guestInfo.email || guestInfo.email.trim() === '') {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestInfo.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!guestInfo.mobileNumber || guestInfo.mobileNumber.trim() === '') {
      errors.mobileNumber = 'Mobile number is required';
    } else if (!/^\d{11}$/.test(guestInfo.mobileNumber.replace(/\s/g, ''))) {
      errors.mobileNumber = 'Please enter a valid 11-digit mobile number';
    }
    
    // NEW: Validate balance payment method
    if (!balancePaymentMethod) {
      errors.balancePaymentMethod = 'Please select a payment method for the remaining balance';
    }

    // Valid ID is optional - no validation errors for ID fields
    // If ID type is 'Other', customIdType is still optional

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Next Step with proper validation
  const handleNextStep = () => {
    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
        localStorage.setItem(STAFF_DAYTOUR_STEP_KEY, '2');
      }
    } else if (step === 2) {
      if (validateStep2()) {
        handleSubmitBooking();
      }
    }
  };

const handlePreviousStep = () => {
  if (step === 1) {
    router.push('/dashboard/staff/book-process?tab=daytour');
  } else {
    setStep(step - 1);
    localStorage.setItem(STAFF_DAYTOUR_STEP_KEY, String(step - 1));
  }
};

  const generateBookingReference = () => {
    const now = Date.now();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `DAYTOUR-${now}-${randomNum}`;
  };

  useEffect(() => {
    if (generatedBookingId) return;
    setGeneratedBookingId(generateBookingReference());
  }, [generatedBookingId]);

  const generateQrToken = async (bookingId) => {
    try {
      setQrLoading(true);
      const response = await fetch('/api/checkin/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId })
      });
      const data = await response.json();
      if (data.token) {
        setQrToken(data.token);
        return data.token;
      }
      return null;
    } catch (error) {
      console.error('Error generating QR token:', error);
      return null;
    } finally {
      setQrLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const downloadQRCode = async () => {
    if (!qrToken) return;
    try {
      const response = await fetch(`/api/download-qr?token=${qrToken}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'checkin_qrcode.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      showNotification('Failed to download QR code. Please try again.', 'error');
    }
  };

  // ============================================================
  // FIXED: Handle ID image upload with preview
  // ============================================================
  const handleIdImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showNotification('File size exceeds 10MB. Please choose a smaller file.', 'error');
      return;
    }

    setUploadingId(true);
    try {
      const compressedFile = await compressImage(file, {
        maxSizeMB: 0.05,
        maxDimension: 900
      });
      const imageUrl = await uploadImage(compressedFile);
      setValidIdData(prev => ({ ...prev, idImageUrl: imageUrl }));
      showNotification('Valid ID uploaded successfully!', 'success');
    } catch (error) {
      console.error('Error uploading ID:', error);
      showNotification('Failed to upload ID. Please try again.', 'error');
    } finally {
      setUploadingId(false);
      // Reset the file input so the same file can be re-uploaded
      e.target.value = '';
    }
  };

  // ============================================================
  // FIXED: Use sendDayTourConfirmationEmail for day tour bookings
  // ============================================================
  const handleSubmitBooking = async () => {
    if (!validateStep2()) return;

    setSubmitting(true);
    try {
      const bookingId = generatedBookingId;
      const selectedDate = parseDateKey(date);
      
      if (!selectedDate) {
        showNotification('Invalid date selected.', 'error');
        setSubmitting(false);
        return;
      }

      const guestInfoObj = {
        firstName: guestInfo.firstName,
        lastName: guestInfo.lastName,
        email: guestInfo.email,
        phone: guestInfo.mobileNumber,
        address: {
          houseNumber: guestInfo.houseNumber || '',
          street: guestInfo.street || '',
          city: guestInfo.city || '',
          province: guestInfo.province || ''
        }
      };

      // Get display name for valid ID type (optional)
      const getDisplayIdType = () => {
        if (validIdData.idType === 'Other') {
          return validIdData.customIdType || null;
        }
        return validIdData.idType || null;
      };

      const booking = {
        bookingId,
        dayTourId: dayTour.id,
        selectedDate: date,
        selectedDateISO: selectedDate.toISOString(),
        adults: adultsCount,
        kids: kidsCount,
        totalGuests: totalGuests,
        totalPrice: totalPrice,
        downPayment: downPaymentAmount,
        remainingBalance: remainingBalance,
        guestInfo: guestInfoObj,
        status: 'confirmed',
        paymentMethod: 'walk-in',
        // NEW: Save the balance payment method
        balancePaymentMethod: balancePaymentMethod,
        paymentProof: null,
        validIdType: getDisplayIdType(),
        validIdImage: validIdData.idImageUrl || null,
        specialRequest: specialRequest?.trim() || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: 'daytour',
        createdByStaff: true
      };

      await addDoc(collection(db, 'dayTourBookings'), booking);

      // Generate QR code
      const checkinToken = await generateQrToken(generatedBookingId);

      // ============================================================
      // FIXED: Use sendDayTourConfirmationEmail for day tour bookings
      // ============================================================
      try {
        const emailBookingData = {
          ...booking,
          checkinToken
        };

        await sendDayTourConfirmationEmail(emailBookingData);
        console.log('Day tour confirmation email sent to guest');
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Don't block the booking flow if email fails
      }

      localStorage.removeItem(STAFF_DAYTOUR_STORAGE_KEY);
      localStorage.removeItem(STAFF_DAYTOUR_STEP_KEY);

      setIsConfirmed(true);
      setStep(3);
      showNotification('Day tour booking confirmed successfully!', 'success');

    } catch (error) {
      console.error('Error creating booking:', error);
      showNotification('Failed to create booking. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const days = getDaysInMonth(currentMonth);
  const selectedDateObj = parseDateKey(date);
  const hoveredDateObj = parseDateKey(hoveredDateKey);
  const activePreviewDate = hoveredDateObj || selectedDateObj;
  const activePreviewDateKey = activePreviewDate ? toLocalDateKey(activePreviewDate) : '';
  const activePreviewRemaining = activePreviewDate ? getRemainingCapacity(activePreviewDate) : null;
  const isPreviewPast = activePreviewDate ? isDatePast(activePreviewDate) : false;
  const isPreviewTooSoon = activePreviewDate ? isDateTooSoon(activePreviewDate) : false;
  const isPreviewSelectable = activePreviewDate ? isDateSelectable(activePreviewDate) : false;
  const isPreviewFullyBooked = Boolean(activePreviewDate && !isPreviewPast && !isPreviewTooSoon && activePreviewRemaining <= 0);
  const isHoverPreview = Boolean(hoveredDateKey && activePreviewDateKey === hoveredDateKey);

  if (loading) {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  if (!dayTour || dayTour.archived === true || dayTour.availability === 'unavailable') {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <div className="text-center bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <i className="fas fa-umbrella-beach text-5xl text-ocean-light/40 mb-4"></i>
            <h2 className="text-2xl font-bold text-textPrimary mb-2">Day Tour Unavailable</h2>
            <p className="text-textSecondary">No day tour package is currently available.</p>
            <button
              onClick={() => router.push('/dashboard/staff')}
              className="mt-4 px-6 py-2.5 bg-[#4D8CF5] text-white rounded-xl font-semibold hover:bg-[#3B78E7] transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Notification */}
      {notification.show && (
        <div
          className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${notification.type === 'error'
            ? 'bg-red-50 border-l-4 border-red-500 text-red-700'
            : 'bg-green-50 border-l-4 border-green-500 text-green-700'
          }`}
        >
          <i
            className={`${notification.type === 'error'
              ? 'fas fa-exclamation-circle text-red-500'
              : 'fas fa-check-circle text-green-500'
            } text-base`}
          ></i>
          <span className="text-sm font-medium">
            {notification.message}
          </span>
        </div>
      )}

      {/* Header */}

      {/* Layout - Form on LEFT, Summary on RIGHT */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN - Form / Steps (Order 1) */}
        <div className="lg:w-[65%] w-full order-1">
          {/* Progress Steps */}
          <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <div className="flex justify-between items-start relative w-full mb-4">
              <div className="absolute top-5 left-0 w-full h-[2px] flex px-10 z-0">
                <div className={`w-1/2 h-full transition-all duration-300 ${step >= 2 ? 'bg-[#4D8CF5]' : 'bg-gray-200'}`}></div>
                <div className={`w-1/2 h-full transition-all duration-300 ${step >= 3 ? 'bg-[#4D8CF5]' : 'bg-gray-200'}`}></div>
              </div>

              {[
                { id: 1, label: 'Day Tour Details' },
                { id: 2, label: 'Guest Info & ID' },
                { id: 3, label: 'Confirmation' }
              ].map((item) => {
                const isCompleted = item.id < step;
                const isActive = item.id === step;
                const showCheckIcon = isCompleted || (item.id === 3 && step === 3);

                return (
                  <div key={item.id} className="flex flex-col items-center relative z-10 w-1/3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${isActive
                        ? 'bg-[#4D8CF5] border-[#4D8CF5] text-white shadow-md shadow-blue-200'
                        : showCheckIcon
                          ? 'bg-[#4D8CF5] border-[#4D8CF5] text-white'
                          : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {showCheckIcon ? <i className="fas fa-check text-xs"></i> : item.id}
                    </div>

                    <div className={`text-center text-[10px] sm:text-[11px] mt-2 font-bold uppercase tracking-wider w-full ${isActive ? 'text-blue-700' : isCompleted ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 1: Day Tour Details */}
          {step === 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
              <h2 className="text-xl font-bold text-textPrimary mb-4">Day Tour Details</h2>
              <p className="text-sm text-textSecondary mb-6">Select the date and number of guests for the day tour.</p>

              <div className="space-y-4">
                {/* Date Selection */}
                <div>
                  <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                    Select Date *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      ref={calendarTriggerRef}
                      onClick={() => setIsCalendarOpen((prev) => !prev)}
                      className={`w-full rounded-2xl border-2 ${formErrors.date ? 'border-red-500' : 'border-[#4D8CF5]/20'} bg-white px-4 py-3.5 text-sm font-medium shadow-sm outline-none transition hover:border-ocean-mid flex items-center justify-between`}
                    >
                      <span className="flex items-center gap-3">
                        <i className="fas fa-calendar text-[#4D8CF5]"></i>
                        <span className={date ? 'text-textPrimary' : 'text-gray-400'}>{formatInputDate(date)}</span>
                      </span>
                      <i className="far fa-calendar-alt text-gray-600"></i>
                    </button>

                    {isCalendarOpen && (
                      <div
                        ref={calendarPopoverRef}
                        className="absolute left-0 top-[calc(100%+0.5rem)] z-[110] bg-white w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.15)] p-4 border border-gray-100"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-base font-semibold text-textPrimary">
                            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                          </h3>
                          <div className="flex items-center gap-3 text-gray-600">
                            <button type="button" onClick={goToPreviousMonth} className="hover:text-ocean-mid" aria-label="Previous month">
                              <i className="fas fa-arrow-left"></i>
                            </button>
                            <button type="button" onClick={goToNextMonth} className="hover:text-ocean-mid" aria-label="Next month">
                              <i className="fas fa-arrow-right"></i>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dayLabel) => (
                            <div key={dayLabel} className="text-center text-xs font-semibold text-textSecondary py-1">
                              {dayLabel}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {days.map((dayItem, index) => {
                            if (!dayItem) return <div key={index} className="h-9"></div>;

                            const isPast = isDatePast(dayItem);
                            const isTooSoon = isDateTooSoon(dayItem);
                            const remaining = getRemainingCapacity(dayItem);
                            const isFullyBooked = !isPast && !isTooSoon && remaining <= 0;
                            const isSelected = date && toLocalDateKey(dayItem) === date;
                            const selectable = isDateSelectable(dayItem);

                            let styleClass = 'text-textPrimary border border-transparent';
                            if (isPast || isTooSoon) styleClass = 'text-gray-300 border border-transparent';
                            if (isFullyBooked) styleClass = 'text-gray-300 border border-transparent';
                            if (isSelected) styleClass = 'text-white bg-[#4D8CF5] border border-[#4D8CF5]';

                            const titleText = isPast
                              ? 'Past date'
                              : isTooSoon
                                ? 'Must be booked at least 2 days in advance'
                                : isFullyBooked
                                  ? 'Fully Booked'
                                  : `${remaining} slot(s) available`;

                            return (
                              <button
                                key={index}
                                type="button"
                                onClick={() => handleDateSelect(dayItem)}
                                onMouseEnter={() => setHoveredDateKey(toLocalDateKey(dayItem))}
                                onFocus={() => setHoveredDateKey(toLocalDateKey(dayItem))}
                                onMouseLeave={() => setHoveredDateKey('')}
                                disabled={!selectable}
                                title={titleText}
                                className={`h-9 rounded-md text-sm transition-colors ${styleClass} ${selectable && !isSelected ? 'hover:bg-ocean-ice' : ''} ${!selectable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {dayItem.getDate()}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-3 border-t border-gray-100 pt-3">
                          {!activePreviewDate && (
                            <p className="text-xs text-textSecondary">Hover or select a date to view remaining capacity.</p>
                          )}
                          {activePreviewDate && (
                            <div className="rounded-xl bg-ocean-ice/40 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-ocean-mid">
                                {isHoverPreview ? 'Date Availability Preview' : 'Selected Date Availability'}
                              </p>
                              <p className="text-xs text-textSecondary mt-0.5">{formatLongDate(activePreviewDateKey)}</p>
                              <p className="text-sm font-semibold text-textPrimary mt-1">
                                {isPreviewPast
                                  ? 'Past date is not available.'
                                  : isPreviewTooSoon
                                    ? 'Book at least 2 days in advance.'
                                    : isPreviewFullyBooked
                                      ? 'Fully booked. Remaining capacity: 0.'
                                      : `Remaining capacity: ${activePreviewRemaining} guest(s).`}
                              </p>
                              {isPreviewSelectable && activePreviewRemaining <= 10 && (
                                <p className="text-[11px] text-amber-700 mt-1">Limited slots left.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {formErrors.date && <p className="text-red-500 text-[10px] mt-1">{formErrors.date}</p>}
                  {formErrors.availability && <p className="text-red-500 text-[10px] mt-1">{formErrors.availability}</p>}
                </div>

                {/* Guest Count */}
                <div>
                  <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                    Number of Guests *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[#4D8CF5]/20 bg-gradient-to-br from-white to-ocean-ice/35 p-4">
                      <label className="text-xs uppercase tracking-[0.16em] font-bold text-textSecondary">Adults (16+)</label>
                      <div className="mt-2 relative">
                        <i className="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm"></i>
                        <input
                          type="number"
                          min="1"
                          value={adults}
                          onChange={(e) => handleAdultsChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full h-12 pl-10 pr-3 rounded-xl border border-[#4D8CF5]/25 bg-white text-lg font-semibold text-textPrimary focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/30"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#4D8CF5]/20 bg-gradient-to-br from-white to-ocean-ice/35 p-4">
                      <label className="text-xs uppercase tracking-[0.16em] font-bold text-textSecondary">Kids (15 and below)</label>
                      <div className="mt-2 relative">
                        <i className="fas fa-child absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm"></i>
                        <input
                          type="number"
                          min="0"
                          value={kids}
                          onChange={(e) => handleKidsChange(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full h-12 pl-10 pr-3 rounded-xl border border-[#4D8CF5]/25 bg-white text-lg font-semibold text-textPrimary focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/30"
                        />
                      </div>
                    </div>
                  </div>
                  {formErrors.guests && <p className="text-red-500 text-[10px] mt-1">{formErrors.guests}</p>}
                </div>

                {/* Price Display */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#F8FCFF] p-4 border border-[#4D8CF5]/20">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-textSecondary">Adults</p>
                    <p className="text-lg font-bold text-[#4D8CF5]">₱{dayTour?.adultPrice?.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-textSecondary">Kids</p>
                    <p className="text-lg font-bold text-[#4D8CF5]">₱{dayTour?.kidPrice?.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-textSecondary">Total Guests</p>
                    <p className="text-lg font-bold text-[#1E3A8A]">{totalGuests}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-6 border-t border-gray-100 mt-6">
                <button
                  onClick={handlePreviousStep}
                  className="px-6 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back
                </button>
                <button
                  onClick={handleNextStep}
                  className="px-8 py-2.5 bg-[#4D8CF5] rounded-xl text-white text-sm font-bold shadow-sm hover:bg-[#3B78E7] hover:shadow-md transition-all duration-300"
                >
                  Next Step <i className="fas fa-arrow-right ml-2"></i>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Guest Information & Valid ID (optional) */}
          {step === 2 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
              <h2 className="text-xl font-bold text-textPrimary mb-4">Guest Information</h2>
              <p className="text-sm text-textSecondary mb-6">Enter the guest's details. Valid ID upload is optional.</p>

              <div className="space-y-6">
                {/* Guest Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={guestInfo.firstName}
                      onChange={(e) => handleGuestInfoChange('firstName', e.target.value)}
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.firstName ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                      placeholder="Enter first name"
                    />
                    {formErrors.firstName && <p className="text-red-500 text-[10px] mt-1">{formErrors.firstName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={guestInfo.lastName}
                      onChange={(e) => handleGuestInfoChange('lastName', e.target.value)}
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.lastName ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                      placeholder="Enter last name"
                    />
                    {formErrors.lastName && <p className="text-red-500 text-[10px] mt-1">{formErrors.lastName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={guestInfo.email}
                      onChange={(e) => handleGuestInfoChange('email', e.target.value)}
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.email ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                      placeholder="guest@email.com"
                    />
                    {formErrors.email && <p className="text-red-500 text-[10px] mt-1">{formErrors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      value={guestInfo.mobileNumber}
                      onChange={(e) => handleGuestInfoChange('mobileNumber', e.target.value)}
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.mobileNumber ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                      placeholder="09123456789"
                    />
                    {formErrors.mobileNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.mobileNumber}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      House Number <span className="normal-case font-medium text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={guestInfo.houseNumber}
                      onChange={(e) => handleGuestInfoChange('houseNumber', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all"
                      placeholder="123"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      Street <span className="normal-case font-medium text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={guestInfo.street}
                      onChange={(e) => handleGuestInfoChange('street', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all"
                      placeholder="Main St"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      City / Municipality <span className="normal-case font-medium text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={guestInfo.city}
                      onChange={(e) => handleGuestInfoChange('city', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all"
                      placeholder="City"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                      Province <span className="normal-case font-medium text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={guestInfo.province}
                      onChange={(e) => handleGuestInfoChange('province', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all"
                      placeholder="Province"
                    />
                  </div>
                </div>

                {/* ============================================================
                    NEW: Remaining Balance Payment Method - matches multi-room booking style
                    ============================================================ */}
          <div className="border-t border-gray-200 pt-6">
  <label className="block text-xs sm:text-sm font-semibold text-textPrimary mb-3">
    Remaining Balance Payment Method
  </label>

  <div className="grid grid-cols-2 gap-3 sm:gap-4">
    {[
      {
        value: 'digital',
        label: 'Digital Payment',
        icon: 'fa-mobile-alt',
      },
      {
        value: 'cash',
        label: 'Cash',
        icon: 'fa-money-bill-wave',
      },
    ].map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => setBalancePaymentMethod(option.value)}
        className={`rounded-xl border p-2.5 sm:p-3 text-left transition-all duration-200 ${
          balancePaymentMethod === option.value
            ? 'border-blue-500 bg-blue-50/50 shadow-sm'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                balancePaymentMethod === option.value
                  ? 'border-blue-600'
                  : 'border-gray-300'
              }`}
            >
              {balancePaymentMethod === option.value && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              )}
            </span>

            <div
              className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl ${
                balancePaymentMethod === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-600'
              }`}
            >
              <i className={`fas ${option.icon} text-xs sm:text-sm`} />
            </div>

            <div>
              <p
                className={`text-xs sm:text-sm font-semibold ${
                  balancePaymentMethod === option.value
                    ? 'text-blue-600'
                    : 'text-textPrimary'
                }`}
              >
                {option.label}
              </p>

              <p className="mt-0.5 text-[10px] sm:text-[11px] leading-tight text-textSecondary">
                {option.description}
              </p>
            </div>
          </div>

          {balancePaymentMethod === option.value && (
            <i className="fas fa-check-circle text-blue-600 text-xs sm:text-sm" />
          )}
        </div>
      </button>
    ))}
  </div>
  {formErrors.balancePaymentMethod && (
    <p className="text-red-500 text-[10px] mt-1">{formErrors.balancePaymentMethod}</p>
  )}
</div>

                {/* ============================================================
                    Valid ID Section - Now Optional with Preview
                    ============================================================ */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-base font-semibold text-textPrimary mb-4">Valid ID <span className="font-normal text-gray-400">(Optional)</span></h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                        Valid ID Type <span className="normal-case font-medium text-gray-400">(Optional)</span>
                      </label>
                      <select
                        value={validIdData.idType}
                        onChange={(e) => handleValidIdChange('idType', e.target.value)}
                        className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all bg-white"
                      >
                        <option value="">Select ID Type</option>
                        {VALID_ID_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>

                    {validIdData.idType === 'Other' && (
                      <div>
                        <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                          Specify Valid ID <span className="normal-case font-medium text-gray-400">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={validIdData.customIdType}
                          onChange={(e) => handleValidIdChange('customIdType', e.target.value)}
                          className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all"
                          placeholder="Enter the ID type"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                        Valid ID Image <span className="normal-case font-medium text-gray-400">(Optional)</span>
                      </label>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleIdImageUpload}
                        disabled={uploadingId}
                        className="hidden"
                        id={validIdData.idImageUrl ? 'id-upload-replace' : 'id-upload'}
                      />

                      {validIdData.idImageUrl ? (
                        <div className="flex flex-col items-center">
                          <div className="w-full max-w-sm rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                            <div className="relative aspect-[4/3] max-h-[200px]">
                              <img
                                src={validIdData.idImageUrl}
                                alt="Valid ID Preview"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="p-2 border-t border-gray-200 bg-white flex justify-between items-center">
                              <span className="text-xs text-green-600 flex items-center gap-1.5">
                                <i className="fas fa-check-circle text-emerald-500"></i>
                                ID uploaded
                              </span>
                              <label
                                htmlFor="id-upload-replace"
                                className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                              >
                                <i className="fas fa-sync-alt"></i>
                                Replace ID
                              </label>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed rounded-xl p-5 text-center hover:border-[#4D8CF5]/40 hover:bg-[#4D8CF5]/5 transition-all group border-[#4D8CF5]/20">
                          <label
                            htmlFor="id-upload"
                            className="cursor-pointer flex flex-col items-center gap-2"
                          >
                            <div className="w-12 h-12 rounded-full bg-[#4D8CF5]/10 flex items-center justify-center group-hover:bg-[#4D8CF5]/20 transition-all">
                              <i className={`fas ${uploadingId ? 'fa-spinner fa-spin' : 'fa-id-card'} text-xl text-[#4D8CF5]`}></i>
                            </div>
                            <span className="text-xs font-semibold text-[#1E3A8A]">
                              {uploadingId ? 'Uploading...' : 'Upload Valid ID Image'}
                            </span>
                            <span className="text-[10px] text-[#1E3A8A]/40 uppercase tracking-widest">PNG, JPG up to 5MB</span>
                          </label>
                        </div>
                      )}
                      {formErrors.idImage && <p className="text-red-500 text-[10px] mt-1">{formErrors.idImage}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-6 border-t border-gray-100 mt-6">
                <button
                  onClick={handlePreviousStep}
                  className="px-6 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={submitting}
                  className={`px-8 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm transition-all duration-300 ${
                    submitting
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-[#4D8CF5] hover:bg-[#3B78E7] hover:shadow-md'
                  }`}
                >
                  {submitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Processing...
                    </>
                  ) : (
                    <>
                      Confirm Booking
                      <i className="fas fa-check ml-2"></i>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Confirmation */}
          {step === 3 && isConfirmed && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-6 sm:p-8 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-check text-3xl text-emerald-600"></i>
              </div>
              <h2 className="text-2xl font-bold text-textPrimary mb-2">Booking Confirmed!</h2>
              <p className="text-textSecondary mb-4">
                The day tour reservation has been successfully created for {guestInfo.firstName} {guestInfo.lastName}.
                {guestInfo.email && (
                  <> A confirmation email has been sent to {guestInfo.email}.</>
                )}
              </p>

              <div className="p-4 bg-ocean-ice rounded-lg mb-4">
               <div className="flex items-center justify-center gap-2 mt-0.5">
  <strong className="text-sm sm:text-base font-mono">Reference Number: {generatedBookingId}</strong>
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

              <div className="p-4 bg-emerald-50 rounded-lg mb-6">
                <p className="text-sm text-emerald-800">
                  <i className="fas fa-check-circle mr-2"></i>
                  Reservation status: <strong>Confirmed</strong>. Down payment of <strong>₱{downPaymentAmount.toLocaleString()}</strong> and remaining balance of <strong>₱{remainingBalance.toLocaleString()}</strong> are recorded for this booking.
                  {balancePaymentMethod && (
                    <> Remaining balance will be paid via <strong>{balancePaymentMethod === 'digital' ? 'Digital Payment' : 'Cash'}</strong>.</>
                  )}
                </p>
              </div>

              {qrToken && (
                <div className="mt-6 mb-6 p-4 bg-white rounded-xl border-2 border-blue-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Check-in QR Code</h3>
                  <div className="flex justify-center">
                    <QRCodeSVG
                      value={`${window.location.origin}/check-in?token=${qrToken}`}
                      size={200}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={downloadQRCode}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#4D8CF5] text-white text-sm font-medium rounded-lg hover:bg-[#3B78E7] transition shadow-sm"
                    >
                      <i className="fas fa-download"></i>
                      Download QR Code
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    Staff will scan this QR code at check-in.
                  </p>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
<button
  onClick={() => {
    setStep(1);
    setIsConfirmed(false);
    setDate('');
    setAdults('1');
    setKids('0');
    setGuestInfo({
      firstName: '',
      lastName: '',
      email: '',
      mobileNumber: '',
      houseNumber: '',
      street: '',
      city: '',
      province: ''
    });
    setValidIdData({
      idType: '',
      customIdType: '',
      idImageUrl: ''
    });
    setBalancePaymentMethod('');
    setSpecialRequest('');
    setGeneratedBookingId('');
    setQrToken('');
    localStorage.removeItem(STAFF_DAYTOUR_STORAGE_KEY);
    localStorage.removeItem(STAFF_DAYTOUR_STEP_KEY);
    router.push('/dashboard/staff/daytour-book');
  }}
  className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition"
>
  <i className="fas fa-plus mr-1.5 text-xs"></i>
  Create Another Booking
</button>
<button
  onClick={() => router.push('/dashboard/staff/reservations')}
  className="flex-1 py-2.5 text-sm bg-[#4D8CF5] text-white rounded-xl font-semibold hover:bg-[#3B78E7] shadow-sm transition"
>
  <i className="fas fa-list mr-1.5 text-xs"></i>
  View All Reservations
</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Booking Summary (Order 2) */}
        <div className="lg:w-[35%] w-full order-2 lg:order-2">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] overflow-hidden sticky top-24">
            <div className="px-5 py-4 border-b border-gray-100 bg-[#F8FCFF]">
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 uppercase tracking-wider">
                <i className="fas fa-receipt text-[#4D8CF5]"></i>
                Booking Summary
              </h3>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <i className="fas fa-calendar-day text-[#4D8CF5] text-xs"></i>
                  Day Tour Details
                </h4>
                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date:</span>
                    <span className="font-semibold text-gray-800">
                      {date ? formatLongDate(date) : 'Not selected'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Adults:</span>
                    <span className="font-semibold text-gray-800">{adultsCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Kids:</span>
                    <span className="font-semibold text-gray-800">{kidsCount}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-dashed border-gray-200">
                    <span className="text-gray-500">Total Guests:</span>
                    <span className="font-semibold text-gray-800">{totalGuests}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <i className="fas fa-tag text-[#4D8CF5] text-xs"></i>
                  Price Breakdown
                </h4>
                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Adult Price:</span>
                    <span className="font-semibold text-gray-800">₱{dayTour?.adultPrice?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Kid Price:</span>
                    <span className="font-semibold text-gray-800">₱{dayTour?.kidPrice?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-dashed border-gray-200">
                    <span className="text-gray-500">Total Price:</span>
                    <span className="font-semibold text-gray-800">₱{totalPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-amber-700">
                    <span className="font-medium">Down Payment (50%):</span>
                    <span className="font-bold">₱{downPaymentAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Remaining Balance:</span>
                    <span className="font-semibold text-gray-800">₱{remainingBalance.toLocaleString()}</span>
                  </div>
                  {balancePaymentMethod && (
                    <div className="flex justify-between text-sm text-blue-700 bg-blue-50/50 rounded-lg p-2 -mx-1 mt-1">
                      <span className="font-medium">Balance Payment:</span>
                      <span className="font-bold">{balancePaymentMethod === 'digital' ? 'Digital Payment' : 'Cash'}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#F8FCFF] rounded-xl p-3 border border-blue-100">
                <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <i className="fas fa-info-circle text-[#4D8CF5] text-xs"></i>
                  Reservation Details
                </h4>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-600">
                    <span className="font-medium">Package:</span> {dayTour?.name || 'Day Tour'}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">Max Capacity:</span> {dayTour?.maxCapacity || 'Unlimited'} guests
                  </p>
                  {date && (
                    <p className="text-gray-600">
                      <span className="font-medium">Selected Date:</span> {formatLongDate(date)}
                    </p>
                  )}
                  {validIdData.idImageUrl && (
                    <p className="text-gray-600 mt-1">
                      <span className="font-medium">Valid ID:</span> <span className="text-emerald-600">Uploaded</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-[#F8FCFF] rounded-xl p-3 border border-blue-100">
                <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <i className="fas fa-comment text-[#4D8CF5] text-xs"></i>
                  Special Request
                </h4>
                <textarea
                  value={specialRequest}
                  onChange={(e) => handleSpecialRequestChange(e.target.value)}
                  placeholder="e.g., request to add additional guests, special occasion, PWD/Senior ID, etc."
                  rows="3"
                  readOnly={step === 3}
                  className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none resize-none ${step === 3
                      ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                      : 'border-blue-200 focus:border-blue-400 bg-white'
                    }`}
                />
                <p className="text-xs text-blue-700/80 mt-1">
                  <i className="fas fa-info-circle mr-1"></i>
                  Optional notes for the guest&apos;s day tour visit.
                </p>
              </div>

              {step === 2 && !balancePaymentMethod && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                  <p className="text-xs text-amber-800 font-medium">
                    <i className="fas fa-info-circle mr-1"></i>
                    Please select a payment method for the remaining balance before confirming.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
        
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
    </div>
  );
}