// app/dashboard/staff/booking-process/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { uploadImage } from '@/lib/cloudinary';
import { compressImage } from '@/lib/imageUtils';
import { sendConfirmationEmail } from '@/lib/emailService';
import { QRCodeSVG } from 'qrcode.react';
import { getTrustedNowMs } from '@/lib/philippineTime';

// Storage keys
const STAFF_BOOKING_STORAGE_KEY = 'staff_booking_data';
const STAFF_BOOKING_STEP_KEY = 'staff_booking_step';

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

export default function StaffBookingProcess() {
  const router = useRouter();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [generatedBookingId, setGeneratedBookingId] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // NEW: Remaining Balance Payment Method
  const [balancePaymentMethod, setBalancePaymentMethod] = useState('');

  // Guest information form state
  const [guestInfo, setGuestInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    houseNumber: '',
    street: '',
    barangay: '',
    city: '',
    province: ''
  });

  // Valid ID form state - removed selfie fields
  const [validIdData, setValidIdData] = useState({
    idType: '',
    customIdType: '',
    idImageUrl: ''
  });

  const [uploadingId, setUploadingId] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

  // Load booking data from session storage
  useEffect(() => {
    const storedData = sessionStorage.getItem('staffMultiRoomBooking');
    if (!storedData) {
      router.push('/dashboard/staff/booking');
      return;
    }

    try {
      const data = JSON.parse(storedData);
      let mergedData = { ...data, specialRequest: data.specialRequest || '' };

      // Try to load persisted form data
      try {
        const savedData = localStorage.getItem(STAFF_BOOKING_STORAGE_KEY);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          if (parsed.guestInfo) setGuestInfo(parsed.guestInfo);
          if (parsed.validIdData) setValidIdData(prev => ({ ...prev, ...parsed.validIdData }));
          if (parsed.specialRequest) {
            mergedData = { ...mergedData, specialRequest: parsed.specialRequest };
          }
          if (parsed.balancePaymentMethod) {
            setBalancePaymentMethod(parsed.balancePaymentMethod);
          }
        }
      } catch (error) {
        console.error('Error loading persisted data:', error);
      }

      setBookingData(mergedData);

      // Try to load persisted step
      try {
        const savedStep = localStorage.getItem(STAFF_BOOKING_STEP_KEY);
        if (savedStep && !isNaN(parseInt(savedStep))) {
          const stepNum = parseInt(savedStep);
          if (stepNum >= 1 && stepNum <= 3) {
            setStep(stepNum);
          }
        }
      } catch (error) {
        console.error('Error loading persisted step:', error);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error parsing booking data:', error);
      router.push('/dashboard/staff/booking');
    }
  }, [router]);

  // Save form data to localStorage
  useEffect(() => {
    if (!bookingData) return;
    try {
      const dataToSave = {
        guestInfo,
        specialRequest: bookingData?.specialRequest || '',
        validIdData: {
          idType: validIdData.idType,
          customIdType: validIdData.customIdType,
          idImageUrl: validIdData.idImageUrl
        },
        balancePaymentMethod
      };
      localStorage.setItem(STAFF_BOOKING_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }, [guestInfo, validIdData, bookingData?.specialRequest, balancePaymentMethod]);

  // Save step to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STAFF_BOOKING_STEP_KEY, String(step));
    } catch (error) {
      console.error('Error saving step:', error);
    }
  }, [step]);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
  };

  const generateBookingReference = () => {
    const now = getTrustedNowMs();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `BOOK-${now}-${randomNum}`;
  };

  useEffect(() => {
    if (generatedBookingId) return;
    setGeneratedBookingId(generateBookingReference());
  }, [generatedBookingId]);

  const handleGuestInfoChange = (field, value) => {
    setGuestInfo(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSpecialRequestChange = (value) => {
    setBookingData(prev => ({ ...prev, specialRequest: value }));
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

  const uploadFile = async (file) => {
    try {
      const compressedFile = await compressImage(file, {
        maxSizeMB: 0.05,
        maxDimension: 900
      });
      const imageUrl = await uploadImage(compressedFile);
      return imageUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw new Error('Failed to upload image. Please try again.');
    }
  };

  // ============================================================
  // FIXED: Valid ID upload with preview and replace functionality
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
      const imageUrl = await uploadFile(file);
      setValidIdData(prev => ({ ...prev, idImageUrl: imageUrl }));
      showNotification('Valid ID uploaded successfully!', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to upload ID. Please try again.', 'error');
    } finally {
      setUploadingId(false);
      // Reset the file input so the same file can be re-uploaded
      e.target.value = '';
    }
  };

  // ============================================================
  // FIXED: validateStep1 - Guest Info only
  // ============================================================
  const validateStep1 = () => {
    const errors = {};
    const requiredFields = ['firstName', 'lastName', 'email', 'mobileNumber'];
    
    for (const field of requiredFields) {
      if (!guestInfo[field] || guestInfo[field].trim() === '') {
        errors[field] = 'This field is required';
      }
    }

    if (guestInfo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestInfo.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (guestInfo.mobileNumber && !/^\d{11}$/.test(guestInfo.mobileNumber.replace(/\s/g, ''))) {
      errors.mobileNumber = 'Please enter a valid 11-digit mobile number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ============================================================
  // FIXED: validateStep2 - Valid ID (optional) + Balance Payment Method
  // ============================================================
  const validateStep2 = () => {
    const errors = {};
    
    // Valid ID is optional - no validation errors for ID fields
    
    // Validate balance payment method is required
    if (!balancePaymentMethod) {
      errors.balancePaymentMethod = 'Please select a payment method for the remaining balance';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
      localStorage.setItem(STAFF_BOOKING_STEP_KEY, '2');
    } else if (step === 2 && validateStep2()) {
      handleSubmitBooking();
    }
  };

// In app/dashboard/staff/booking-process/page.js - update handlePreviousStep

const handlePreviousStep = () => {
  if (step === 1) {
    // Save draft and go back to booking page with tab
    router.push('/dashboard/staff/book-process?tab=room');
  } else {
    setStep(step - 1);
    localStorage.setItem(STAFF_BOOKING_STEP_KEY, String(step - 1));
  }
};

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

  // ============================================================
  // FIXED: Submit booking with balancePaymentMethod
  // ============================================================
  const handleSubmitBooking = async () => {
    if (!validateStep2()) return;

    setSubmitting(true);
    try {
      const bookingId = generatedBookingId;
      const isExclusiveResortBooking = Boolean(bookingData.isExclusiveResortBooking);
      const exclusivePackagePrice = Number(bookingData.exclusivePackagePrice || bookingData.totalPrice || 0);
      const packageTotalPrice = isExclusiveResortBooking
        ? exclusivePackagePrice
        : Number(bookingData.totalPrice || 0);
      const packageDownPayment = packageTotalPrice * 0.5;
      const packageRemainingBalance = packageTotalPrice - packageDownPayment;
      const stayNights = Number(bookingData.numberOfNights || 1);

      // Build guest info
      const guestInfoObj = {
        firstName: guestInfo.firstName,
        lastName: guestInfo.lastName,
        email: guestInfo.email,
        phone: guestInfo.mobileNumber,
        address: {
          houseNumber: guestInfo.houseNumber,
          street: guestInfo.street,
          barangay: guestInfo.barangay,
          city: guestInfo.city,
          province: guestInfo.province
        }
      };

      // Get the display name for valid ID type (optional)
      const getDisplayIdType = () => {
        if (!validIdData.idType) return null;
        if (validIdData.idType === 'Other') {
          return validIdData.customIdType || null;
        }
        return validIdData.idType;
      };

      const resolvedSpecialRequest = bookingData.specialRequest?.trim() || null;

      // Create booking document for each room type
      const allRoomIds = [];
      for (const roomType of bookingData.roomTypes) {
        for (let i = 0; i < roomType.quantity; i++) {
          const roomId = roomType.roomIds[i % roomType.roomIds.length];
          allRoomIds.push(roomId);
        }
      }

      // Store created booking IDs
      const createdBookings = [];

      if (allRoomIds.length <= 1) {
        const roomTypeObj = bookingData.roomTypes?.[0];
        const singleRoomId = allRoomIds[0] || roomTypeObj?.roomIds?.[0];

        let adultsCount = 0, kidsCount = 0;
        if (isExclusiveResortBooking) {
          adultsCount = bookingData.exclusiveAdults || 0;
          kidsCount = bookingData.exclusiveKids || 0;
        } else if (bookingData.perRoomGuests && bookingData.perRoomGuests[roomTypeObj.type]?.length > 0) {
          const perRoom = bookingData.perRoomGuests[roomTypeObj.type][0];
          adultsCount = perRoom.adults;
          kidsCount = perRoom.kids;
        } else {
          adultsCount = (bookingData.adultsPerType?.[roomTypeObj.type] || 1);
          kidsCount = (bookingData.kidsPerType?.[roomTypeObj.type] || 0);
        }

        const unitCapacity = Math.max(0, Number(roomTypeObj.capacityMin || 0));
        const extraGuestChargeRate = Number(roomTypeObj.additionalGuestCharge || 0);
        const unitGuests = adultsCount + kidsCount;
        const unitExtraGuests = Math.max(0, unitGuests - unitCapacity);
        const unitExtraGuestCharges = unitExtraGuests * extraGuestChargeRate * stayNights;

        const booking = {
          bookingId,
          roomId: singleRoomId,
          roomType: roomTypeObj?.type || 'Room',
          price: roomTypeObj?.price || 0,
          nights: stayNights,
          guests: adultsCount + kidsCount,
          adults: adultsCount,
          kids: kidsCount,
          totalPrice: packageTotalPrice,
          downPayment: packageDownPayment,
          remainingBalance: packageRemainingBalance,
          checkIn: bookingData.checkInDate ? new Date(bookingData.checkInDate) : null,
          checkOut: bookingData.checkOutDate ? new Date(bookingData.checkOutDate) : null,
          guestInfo: guestInfoObj,
          status: 'confirmed',
          // NEW: Save the selected balance payment method
          balancePaymentMethod: balancePaymentMethod,
          paymentProofUrl: null,
          validIdType: getDisplayIdType(),
          validIdUrl: validIdData.idImageUrl || null,
          // Removed validIdSelfieUrl
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          type: 'room',
          numberOfRooms: 1,
          specialRequest: resolvedSpecialRequest,
          extraGuests: unitExtraGuests,
          additionalGuestCharge: extraGuestChargeRate,
          extraGuestCharges: unitExtraGuestCharges,
          totalExtraGuestCharge: unitExtraGuestCharges,
          isExclusiveResortBooking,
          exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null,
          createdByStaff: true,
          ...(isExclusiveResortBooking && {
            exclusiveAdults: bookingData.exclusiveAdults || 0,
            exclusiveKids: bookingData.exclusiveKids || 0,
            tentCount: bookingData.tentCount || 0
          })
        };

        const docRef = await addDoc(collection(db, 'bookings'), booking);
        createdBookings.push({ ...booking, id: docRef.id });
      } else {
        let unitIndex = 0;
        for (const roomType of bookingData.roomTypes) {
          for (let i = 0; i < roomType.quantity; i++) {
            const roomId = roomType.roomIds[i % roomType.roomIds.length];
            const roomTypeObj = bookingData.roomTypes.find(t => t.roomIds.includes(roomId));

            let adultsCount = 0, kidsCount = 0;
            if (isExclusiveResortBooking) {
              adultsCount = bookingData.exclusiveAdults || 0;
              kidsCount = bookingData.exclusiveKids || 0;
            } else if (bookingData.perRoomGuests && bookingData.perRoomGuests[roomTypeObj.type]?.length > unitIndex) {
              const perRoom = bookingData.perRoomGuests[roomTypeObj.type][unitIndex];
              adultsCount = perRoom.adults;
              kidsCount = perRoom.kids;
            } else {
              const totalAdults = bookingData.adultsPerType?.[roomTypeObj.type] || 1;
              const totalKids = bookingData.kidsPerType?.[roomTypeObj.type] || 0;
              adultsCount = Math.floor(totalAdults / roomType.quantity) + (unitIndex < (totalAdults % roomType.quantity) ? 1 : 0);
              kidsCount = Math.floor(totalKids / roomType.quantity);
            }

            const unitCapacity = Math.max(0, Number(roomTypeObj.capacityMin || 0));
            const extraGuestChargeRate = Number(roomTypeObj.additionalGuestCharge || 0);
            const unitGuests = adultsCount + kidsCount;
            const unitExtraGuests = Math.max(0, unitGuests - unitCapacity);
            const unitExtraGuestCharges = unitExtraGuests * extraGuestChargeRate * stayNights;
            const unitTotalPrice = (Number(roomTypeObj.price || 0) * stayNights) + unitExtraGuestCharges;

            const booking = {
              bookingId: `${bookingId}-${unitIndex + 1}`,
              roomId: roomId,
              roomType: roomTypeObj.type,
              price: roomTypeObj.price,
              nights: stayNights,
              guests: unitGuests,
              adults: adultsCount,
              kids: kidsCount,
              totalPrice: unitTotalPrice,
              downPayment: unitTotalPrice * 0.5,
              remainingBalance: unitTotalPrice * 0.5,
              checkIn: bookingData.checkInDate ? new Date(bookingData.checkInDate) : null,
              checkOut: bookingData.checkOutDate ? new Date(bookingData.checkOutDate) : null,
              guestInfo: guestInfoObj,
              status: 'confirmed',
              // NEW: Save the selected balance payment method
              balancePaymentMethod: balancePaymentMethod,
              paymentProofUrl: null,
              validIdType: getDisplayIdType(),
              validIdUrl: validIdData.idImageUrl || null,
              // Removed validIdSelfieUrl
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              type: 'room',
              numberOfRooms: 1,
              specialRequest: resolvedSpecialRequest,
              parentBookingId: bookingId,
              isMultiRoomBooking: true,
              isExclusiveResortBooking,
              exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null,
              parentTotalPrice: isExclusiveResortBooking ? packageTotalPrice : null,
              parentDownPayment: isExclusiveResortBooking ? packageDownPayment : null,
              parentRemainingBalance: isExclusiveResortBooking ? packageRemainingBalance : null,
              extraGuests: unitExtraGuests,
              additionalGuestCharge: extraGuestChargeRate,
              extraGuestCharges: unitExtraGuestCharges,
              totalExtraGuestCharge: unitExtraGuestCharges,
              createdByStaff: true,
              ...(isExclusiveResortBooking && {
                exclusiveAdults: bookingData.exclusiveAdults || 0,
                exclusiveKids: bookingData.exclusiveKids || 0,
                tentCount: bookingData.tentCount || 0
              })
            };

            const docRef = await addDoc(collection(db, 'bookings'), booking);
            createdBookings.push({ ...booking, id: docRef.id });
            unitIndex++;
          }
        }
      }

      // Generate QR code before sending confirmation email
      const checkinToken = await generateQrToken(generatedBookingId);

      // Send confirmation email to guest
      try {
        const selectedRoomsList = Object.entries(bookingData.selectedRooms || {})
          .filter(([_, qty]) => qty > 0)
          .map(([type, qty]) => `${qty} × ${type}`);

        const roomTypesDisplay = selectedRoomsList.join(', ') || 'Room';
        const totalRoomsCount = Object.values(bookingData.selectedRooms || {}).reduce((a, b) => a + b, 0);

        const emailBookingData = {
          bookingId: generatedBookingId,
          guestInfo: guestInfoObj,
          checkIn: bookingData.checkInDate ? new Date(bookingData.checkInDate) : null,
          checkOut: bookingData.checkOutDate ? new Date(bookingData.checkOutDate) : null,
          totalPrice: packageTotalPrice,
          downPayment: packageDownPayment,
          roomTypesDisplay: roomTypesDisplay,
          totalRooms: totalRoomsCount,
          roomTypes: bookingData.roomTypes?.filter(rt => (bookingData.selectedRooms?.[rt.type] || 0) > 0),
          isExclusiveResortBooking: isExclusiveResortBooking,
          tentCount: bookingData.tentCount || 0,
          specialRequest: resolvedSpecialRequest,
          checkinToken,
          createdByStaff: true
        };

        await sendConfirmationEmail(emailBookingData);
        console.log('Confirmation email sent to guest');
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }

      // Clear session storage
      sessionStorage.removeItem('staffMultiRoomBooking');
      localStorage.removeItem(STAFF_BOOKING_STORAGE_KEY);
      localStorage.removeItem(STAFF_BOOKING_STEP_KEY);

      // Mark as confirmed and show confirmation
      setIsConfirmed(true);
      setStep(3);
      showNotification('Booking confirmed successfully!', 'success');

    } catch (error) {
      console.error('Error creating booking:', error);
      showNotification('Failed to create booking. Please try again.', 'error');
    } finally {
      setSubmitting(false);
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

  const formatDateOnly = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getSelectedRoomsSummary = () => {
    if (!bookingData?.selectedRooms) return 'No rooms selected';
    const selected = Object.entries(bookingData.selectedRooms).filter(([_, qty]) => qty > 0);
    if (selected.length === 0) return 'No rooms selected';
    return selected.map(([type, qty]) => {
      const totalGuests = bookingData.totalGuestsPerType?.[type] || 1;
      return `${qty} × ${type} (${totalGuests} guest${totalGuests !== 1 ? 's' : ''})`;
    }).join(', ');
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  if (!bookingData) {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <i className="fas fa-exclamation-triangle text-4xl text-amber-500 mb-4"></i>
            <p className="text-textPrimary">No booking data found. Please start from the booking page.</p>
            <button
              onClick={() => router.push('/dashboard/staff/booking')}
              className="mt-4 px-6 py-2.5 bg-[#4D8CF5] text-white rounded-xl font-semibold hover:bg-[#3B78E7] transition-colors"
            >
              Go to Booking
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isExclusiveBooking = Boolean(bookingData.isExclusiveResortBooking);
  const stayNights = Math.max(1, Number(bookingData.numberOfNights || 1));
  const totalPrice = Number(bookingData.exclusivePackagePrice || bookingData.totalPrice || 0);
  const downPaymentAmount = totalPrice * 0.5;
  const remainingBalance = totalPrice - downPaymentAmount;
  const totalExtraGuestCharges = Number(
    (bookingData.totalExtraGuestCharge ?? bookingData.roomTypes?.reduce((sum, rt) => sum + Number(rt.extraGuestCharges || 0), 0)) || 0
  );
  const derivedNightlyRate = stayNights > 0 ? (totalPrice / stayNights) : totalPrice;
  const checkInDate = bookingData.checkInDate ? new Date(bookingData.checkInDate) : null;
  const checkOutDate = bookingData.checkOutDate ? new Date(bookingData.checkOutDate) : null;

  // Get display name for valid ID type
  const getDisplayIdType = () => {
    if (validIdData.idType === 'Other') {
      return validIdData.customIdType || 'Other';
    }
    return validIdData.idType || 'Not specified';
  };

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
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight flex items-center gap-3">
          <i className="fas fa-clipboard-list text-[#4D8CF5]"></i>
          Complete Booking
        </h1>
        <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
          Enter guest details to complete and confirm the reservation
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - Steps */}
        <div className="lg:w-[65%] w-full">
          {/* Progress Steps */}
          <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <div className="flex justify-between items-start relative w-full mb-4">
              <div className="absolute top-5 left-0 w-full h-[2px] flex px-10 z-0">
                <div className={`w-1/2 h-full transition-all duration-300 ${step >= 2 ? 'bg-[#4D8CF5]' : 'bg-gray-200'}`}></div>
                <div className={`w-1/2 h-full transition-all duration-300 ${step >= 3 ? 'bg-[#4D8CF5]' : 'bg-gray-200'}`}></div>
              </div>

              {[
                { id: 1, label: 'Guest Info' },
                { id: 2, label: 'Valid ID & Payment' },
                { id: 3, label: 'Confirmation' }
              ].map((item) => {
                const isCompleted = item.id < step;
                const isActive = item.id === step;
                const isUpcoming = item.id > step;
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

                    <div className={`text-center text-[10px] sm:text-[11px] mt-2 font-bold uppercase tracking-wider w-full ${isActive ? 'text-blue-700' : isUpcoming ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 1: Guest Information */}
          {step === 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
              <h2 className="text-xl font-bold text-textPrimary mb-4">Guest Information</h2>
              <p className="text-sm text-textSecondary mb-6">Please enter the guest's complete details.</p>

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
                    className={`w-full px-4 py-2.5 border-2 ${formErrors.houseNumber ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    placeholder="123"
                  />
                  {formErrors.houseNumber && <p className="text-red-500 text-[10px] mt-1">{formErrors.houseNumber}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                    Street <span className="normal-case font-medium text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={guestInfo.street}
                    onChange={(e) => handleGuestInfoChange('street', e.target.value)}
                    className={`w-full px-4 py-2.5 border-2 ${formErrors.street ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    placeholder="Main St"
                  />
                  {formErrors.street && <p className="text-red-500 text-[10px] mt-1">{formErrors.street}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                    Barangay <span className="normal-case font-medium text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={guestInfo.barangay}
                    onChange={(e) => handleGuestInfoChange('barangay', e.target.value)}
                    className={`w-full px-4 py-2.5 border-2 ${formErrors.barangay ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    placeholder="Barangay"
                  />
                  {formErrors.barangay && <p className="text-red-500 text-[10px] mt-1">{formErrors.barangay}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                    City <span className="normal-case font-medium text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={guestInfo.city}
                    onChange={(e) => handleGuestInfoChange('city', e.target.value)}
                    className={`w-full px-4 py-2.5 border-2 ${formErrors.city ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    placeholder="City"
                  />
                  {formErrors.city && <p className="text-red-500 text-[10px] mt-1">{formErrors.city}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest mb-1.5">
                    Province <span className="normal-case font-medium text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={guestInfo.province}
                    onChange={(e) => handleGuestInfoChange('province', e.target.value)}
                    className={`w-full px-4 py-2.5 border-2 ${formErrors.province ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    placeholder="Province"
                  />
                  {formErrors.province && <p className="text-red-500 text-[10px] mt-1">{formErrors.province}</p>}
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

          {/* ============================================================
              STEP 2: Valid ID Verification (Optional) + Balance Payment Method
              ============================================================ */}
          {step === 2 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
              <h2 className="text-xl font-bold text-textPrimary mb-4">Valid ID & Payment</h2>
              <p className="text-sm text-textSecondary mb-6">
                Optionally upload the guest's valid ID and select how the remaining balance will be paid.
              </p>

              <div className="space-y-6">
                {/* ============================================================
                    Valid ID Section - Optional with Preview
                    ============================================================ */}
                <div>
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

                {/* ============================================================
                    Remaining Balance Payment Method - Matches multi-room booking style
                    ============================================================ */}
                <div className="border-t border-gray-200 pt-6">
                  <label className="block text-xs sm:text-sm font-semibold text-textPrimary mb-3">
                    How would you like to pay the remaining balance?
                  </label>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {[
                      {
                        value: 'digital',
                        label: 'Digital Payment',
                        icon: 'fa-mobile-alt',
                        description: 'Pay the remaining balance digitally.',
                      },
                      {
                        value: 'cash',
                        label: 'Cash',
                        icon: 'fa-money-bill-wave',
                        description: 'Pay the remaining balance in cash.',
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setBalancePaymentMethod(option.value)}
                        className={`rounded-xl border p-3 sm:p-4 text-left transition-all duration-200 ${
                          balancePaymentMethod === option.value
                            ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
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
                              className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl ${
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

                              <p className="mt-0.5 text-[11px] sm:text-xs leading-tight text-textSecondary">
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

          {/* Step 3: Confirmation */}
          {step === 3 && isConfirmed && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-6 sm:p-8 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-check text-3xl text-emerald-600"></i>
              </div>
              <h2 className="text-2xl font-bold text-textPrimary mb-2">Booking Confirmed!</h2>
              <p className="text-textSecondary mb-4">
                The reservation has been successfully created for {guestInfo.firstName} {guestInfo.lastName}.
                {guestInfo.email && (
                  <> A confirmation email has been sent to {guestInfo.email}.</>
                )}
              </p>

              <div className="p-4 bg-ocean-ice rounded-lg mb-4">
                <div className="flex items-center justify-center gap-2 mt-1">
                  <strong className="text-lg font-mono">Reference Number: {generatedBookingId}</strong>
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
  onClick={() => router.push('/dashboard/staff/book-process?tab=room')}
  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition"
>
  <i className="fas fa-plus mr-2"></i>
  Create Another Booking
</button>
                <button
                  onClick={() => router.push('/dashboard/staff/room-assign')}
                  className="flex-1 py-3 bg-[#4D8CF5] text-white rounded-xl font-semibold hover:bg-[#3B78E7] shadow-sm transition"
                >
                  <i className="fas fa-door-open mr-2"></i>
                  Go to Room Assignment
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Booking Summary */}
        <div className="lg:w-[35%] w-full">
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
                  <i className="fas fa-door-open text-[#4D8CF5] text-xs"></i>
                  {isExclusiveBooking ? 'Entire Resort Package' : 'Selected Rooms'}
                </h4>

                {isExclusiveBooking ? (
                  <div className="bg-blue-50/60 rounded-xl border border-blue-200 p-3 space-y-1.5">
                    <p className="text-sm font-semibold text-blue-900">Whole resort reserved</p>
                    {bookingData.tentCount > 0 && (
                      <p className="text-xs text-amber-700 font-medium">
                        <i className="fas fa-tent mr-1"></i>
                        Tents: {bookingData.tentCount} (+₱{bookingData.tentCount * 1500 * stayNights} for the stay)
                      </p>
                    )}
                    <p className="text-xs text-blue-700">Adults: {bookingData.exclusiveAdults || 0} | Kids: {bookingData.exclusiveKids || 0}</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                    {bookingData.roomTypes && bookingData.roomTypes.length > 0 ? (
                      bookingData.roomTypes.map((roomType, idx) => {
                        const quantity = bookingData.selectedRooms?.[roomType.type] || 0;
                        return (
                          <div key={`${roomType.type}-${idx}`} className="text-xs text-gray-700 leading-relaxed border-b border-gray-100 last:border-b-0 pb-1.5 last:pb-0">
                            <div className="flex justify-between items-start">
                              <span className="font-medium">{quantity} × {roomType.type}</span>
                              <span className="text-gray-500">₱{roomType.price.toLocaleString()}/night</span>
                            </div>
                            {bookingData.perRoomGuests && bookingData.perRoomGuests[roomType.type]?.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {bookingData.perRoomGuests[roomType.type].map((guest, guestIdx) => (
                                  <div key={guestIdx} className="text-[10px] text-gray-500 flex justify-between pl-2">
                                    <span>Unit {guestIdx + 1}:</span>
                                    <span>Adults: {guest.adults} | Kids: {guest.kids}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {roomType.extraGuests > 0 && (
                              <div className="mt-1 text-[10px] text-amber-700 flex justify-between pl-2 font-semibold">
                                <span>Extra guest charge:</span>
                                <span>₱{Number(roomType.extraGuestCharges || 0).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-gray-500">No room selections found.</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <i className="fas fa-calendar-check text-[#4D8CF5] text-xs"></i>
                  Schedule
                </h4>
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  <p className="text-sm font-semibold text-gray-800">
                    {checkInDate ? formatDateOnly(checkInDate) : 'Not set'}
                  </p>
                  <p className="text-sm text-blue-600 font-medium mt-1">
                    <i className="fas fa-clock mr-1"></i>
                    Check-in: {FIXED_CHECK_IN_DISPLAY}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Check-out: {checkOutDate ? formatDateOnly(checkOutDate) : 'Not set'} at {FIXED_CHECK_OUT_DISPLAY}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stayNights} night{stayNights > 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <i className="fas fa-tag text-[#4D8CF5] text-xs"></i>
                  Price Breakdown
                </h4>
                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Rate per night:</span>
                    <span className="font-semibold text-gray-800">₱{derivedNightlyRate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Nights:</span>
                    <span className="font-semibold text-gray-800">{stayNights}</span>
                  </div>
                  {totalExtraGuestCharges > 0 && (
                    <div className="flex justify-between text-sm text-amber-700">
                      <span className="text-gray-500">Extra guest charges:</span>
                      <span className="font-semibold text-amber-700">₱{totalExtraGuestCharges.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm pt-2 border-t border-dashed border-gray-200">
                    <span className="text-gray-500">Stay Total:</span>
                    <span className="font-semibold text-gray-800">₱{totalPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Down Payment (50%):</span>
                    <span className="font-semibold text-amber-600">₱{downPaymentAmount.toLocaleString()}</span>
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
                  <i className="fas fa-comment text-[#4D8CF5] text-xs"></i>
                  Special Request
                </h4>
                <textarea
                  value={bookingData.specialRequest || ''}
                  onChange={(e) => handleSpecialRequestChange(e.target.value)}
                  placeholder="e.g., Request early check-in, room preferences, special occasion, etc."
                  rows="3"
                  readOnly={step === 3}
                  className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none resize-none ${step === 3
                      ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                      : 'border-blue-200 focus:border-blue-400 bg-white'
                    }`}
                />
                <p className="text-xs text-blue-700/80 mt-1">
                  <i className="fas fa-clock mr-1"></i>
                  Check-in is fixed at {FIXED_CHECK_IN_DISPLAY}. Mention preferred early check-in time if needed.
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