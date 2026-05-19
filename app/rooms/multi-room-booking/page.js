// app/rooms/multi-room-booking/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { uploadImage } from '@/lib/cloudinary';
import { compressImage } from '@/lib/imageUtils';
import { sendRoomPendingEmail } from '@/lib/emailService';
import ChatBot from '@/components/guest/ChatBot';
import { QRCodeSVG } from 'qrcode.react';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { getDisplayValidIdType, hasAccountValidId, hasAccountMobileNumber } from '@/lib/guestValidId';

// Storage keys for persisting data
const MULTI_ROOM_STORAGE_KEY = 'multi_room_booking_data';
const MULTI_ROOM_STEP_KEY = 'multi_room_booking_step';

export default function MultiRoomBookingPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useGuestAuth();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(2);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatedBookingId, setGeneratedBookingId] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);
  const [downPaymentAmount, setDownPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('gcash');
  const [paymentSettings, setPaymentSettings] = useState({
    gcashQRCode: '',
    bankAccounts: []
  });
  const [bankDetailsProvided, setBankDetailsProvided] = useState(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);
  const [showBankSelection, setShowBankSelection] = useState(false);
  const [notifyingResort, setNotifyingResort] = useState(false);
  const [bankRequestSent, setBankRequestSent] = useState(false);
  const [requestedBankInfo, setRequestedBankInfo] = useState(null);
  const [bankRequestId, setBankRequestId] = useState(null);
  const [modalNotification, setModalNotification] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [mobileNumberError, setMobileNumberError] = useState('');
  const [validIdError, setValidIdError] = useState('');

  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

  // Load booking data from session storage (room selection) AND localStorage (persisted form data)
  useEffect(() => {
    const storedData = sessionStorage.getItem('multiRoomBooking');
    if (!storedData) {
      router.push('/rooms');
      return;
    }

    const data = JSON.parse(storedData);

    // Try to load persisted form data from localStorage
    let persistedFormData = {};
    try {
      const savedData = localStorage.getItem(MULTI_ROOM_STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        persistedFormData = parsed;
      }
    } catch (error) {
      console.error('Error loading persisted booking data:', error);
    }

    // Try to load persisted step
    try {
      const savedStep = localStorage.getItem(MULTI_ROOM_STEP_KEY);
      if (savedStep && !isNaN(parseInt(savedStep))) {
        const stepNum = parseInt(savedStep);
        if (stepNum >= 2 && stepNum <= 3) {
          setStep(stepNum);
        }
      }
    } catch (error) {
      console.error('Error loading persisted step:', error);
    }

    // Try to load persisted payment method
    if (persistedFormData.paymentMethod) {
      setPaymentMethod(persistedFormData.paymentMethod);
    }

    // Try to load persisted bank request state
    if (persistedFormData.bankRequestSent) {
      setBankRequestSent(persistedFormData.bankRequestSent);
    }
    if (persistedFormData.bankRequestId) {
      setBankRequestId(persistedFormData.bankRequestId);
    }
    if (persistedFormData.bankDetailsProvided) {
      setBankDetailsProvided(persistedFormData.bankDetailsProvided);
    }

    setBookingData({
      ...data,
      checkIn: new Date(data.checkInDate),
      checkOut: new Date(data.checkOutDate),
      paymentProofUrl: persistedFormData.paymentProofUrl || null,
      specialRequest: persistedFormData.specialRequest || '',
      nights: 1
    });
    const initialTotalPrice = Number(data.exclusivePackagePrice || data.totalPrice || 0);
    setTotalPrice(initialTotalPrice);
    setDownPaymentAmount(initialTotalPrice * 0.5);
    setLoading(false);
  }, [router]);

  // Save booking data to localStorage whenever it changes
  useEffect(() => {
    if (!bookingData) return;

    try {
      const dataToSave = {
        paymentProofUrl: bookingData.paymentProofUrl,
        specialRequest: bookingData.specialRequest,
        paymentMethod: paymentMethod,
        bankRequestSent: bankRequestSent,
        bankRequestId: bankRequestId,
        bankDetailsProvided: bankDetailsProvided
      };
      localStorage.setItem(MULTI_ROOM_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving booking data to localStorage:', error);
    }
  }, [bookingData, paymentMethod, bankRequestSent, bankRequestId, bankDetailsProvided]);

  // Save step to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(MULTI_ROOM_STEP_KEY, String(step));
    } catch (error) {
      console.error('Error saving step to localStorage:', error);
    }
  }, [step]);

  // Clear persisted data when booking is completed (step 3)
  useEffect(() => {
    if (step === 3) {
      try {
        localStorage.removeItem(MULTI_ROOM_STORAGE_KEY);
        localStorage.removeItem(MULTI_ROOM_STEP_KEY);
      } catch (error) {
        console.error('Error clearing persisted data:', error);
      }
    }
  }, [step]);

  // Generate booking reference
  const generateBookingReference = () => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `BOOK-${timestamp}-${randomNum}`;
  };

  useEffect(() => {
    const newBookingId = generateBookingReference();
    setGeneratedBookingId(newBookingId);
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
      setModalNotification({ message: 'Failed to download QR code. Please try again.', type: 'error' });
    }
  };

  // Fetch payment settings
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

  // Real-time listener for bank request document
  useEffect(() => {
    if (!bankRequestId) return;

    const bankRequestRef = doc(db, 'bank_requests', bankRequestId);

    const unsubscribe = onSnapshot(bankRequestRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
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

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone) => {
    const phoneRegex = /^\d{11}$/;
    return phoneRegex.test(phone);
  };

  const handleInputChange = (field, value) => {
    setBookingData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const toStoragePayload = (data) => ({
    ...data,
    checkInDate: data?.checkIn instanceof Date ? data.checkIn.toISOString() : data?.checkInDate || null,
    checkOutDate: data?.checkOut instanceof Date ? data.checkOut.toISOString() : data?.checkOutDate || null
  });

  const handlePreviousStep = () => {
    if (step === 2) {
      if (bookingData) {
        const storagePayload = toStoragePayload(bookingData);
        sessionStorage.setItem('multiRoomBooking', JSON.stringify(storagePayload));
        sessionStorage.setItem('multiRoomBookingDraft', JSON.stringify(storagePayload));
      }
      router.push('/rooms');
    } else {
      setStep(step - 1);
    }
  };

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

    if (file.size > 10 * 1024 * 1024) {
      setModalNotification({ message: 'File size exceeds 10MB. Please choose a smaller file.', type: 'error' });
      return;
    }

    setUploading(true);
    try {
      const compressedFile = await compressImage(file, {
        maxSizeMB: 0.05,
        maxDimension: 900
      });
      const imageUrl = await uploadFileToCloudinary(compressedFile);
      setBookingData(prev => ({ ...prev, paymentProofUrl: imageUrl }));
      setModalNotification({ message: 'Payment proof uploaded successfully!', type: 'success' });
    } catch (error) {
      setModalNotification({ message: error.message || 'Failed to upload file. Please try again.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleNotifyResort = async () => {
    if (!selectedBankAccount) {
      setModalNotification({ message: 'Please select a bank account first', type: 'error' });
      return;
    }

    const totalSelectedRooms = Object.values(bookingData.selectedRooms || {}).reduce((a, b) => a + b, 0);
    const isMultiRoomRequest = totalSelectedRooms > 1;
    const isExclusiveResortBooking = Boolean(bookingData.isExclusiveResortBooking);
    const exclusivePackagePrice = Number(bookingData.exclusivePackagePrice || totalPrice || 0);
    const fallbackRoomType = bookingData.roomTypes?.[0]?.type || 'Room';
    const fallbackRoomId = bookingData.roomTypes?.[0]?.roomIds?.[0] || bookingData.roomTypes?.[0]?.id || 'multiple';

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
        guestName: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : 'Guest',
        guestEmail: profile?.email || user?.email || '',
        guestPhone: profile?.mobileNumber || '',
        roomType: isExclusiveResortBooking
          ? 'Entire Resort Package'
          : isMultiRoomRequest
            ? (bookingData.roomTypes?.map(t => `${t.quantity} x ${t.type}`).join(', ') || 'Multiple Rooms')
            : fallbackRoomType,
        roomId: isMultiRoomRequest ? 'multiple' : fallbackRoomId,
        bookingId: generatedBookingId,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        nights: bookingData.nights || 1,
        numberOfRooms: totalSelectedRooms || 1,
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
        read: false,
        isMultiRoom: isMultiRoomRequest,
        isExclusiveResortBooking,
        exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null
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

  const checkBookingRequirements = () => {
    let valid = true;
    if (!hasAccountMobileNumber(profile)) {
      setMobileNumberError('A mobile number is required to confirm your booking. Please update your account profile.');
      valid = false;
    } else {
      setMobileNumberError('');
    }
    if (!hasAccountValidId(profile)) {
      setValidIdError('A valid ID photo is required. Please upload your valid ID in your account profile.');
      valid = false;
    } else {
      setValidIdError('');
    }
    return valid;
  };

  const accountValidIdType = getDisplayValidIdType(profile);
  const accountValidIdUrl = profile?.validIdUrl || '';

  const handleSubmitBooking = async () => {
    if (!checkBookingRequirements()) {
      return;
    }

    setSubmitting(true);
    try {
      const bookingId = generatedBookingId;
      const isExclusiveResortBooking = Boolean(bookingData.isExclusiveResortBooking);
      const exclusivePackagePrice = Number(bookingData.exclusivePackagePrice || totalPrice || 0);
      const packageTotalPrice = isExclusiveResortBooking ? exclusivePackagePrice : Number(totalPrice || 0);
      const packageDownPayment = packageTotalPrice * 0.5;
      const packageRemainingBalance = packageTotalPrice - packageDownPayment;

      // Get user info from profile
      const userFirstName = profile?.firstName || '';
      const userLastName = profile?.lastName || '';
      const userEmail = profile?.email || user?.email || '';
      const userPhone = profile?.mobileNumber || '';

      // Create booking document for each room type
      const allRoomIds = [];
      for (const roomType of bookingData.roomTypes) {
        for (let i = 0; i < roomType.quantity; i++) {
          const roomId = roomType.roomIds[i % roomType.roomIds.length];
          allRoomIds.push(roomId);
        }
      }

      // Store created booking IDs for email
      const createdBookings = [];

      if (allRoomIds.length <= 1) {
        const roomTypeObj = bookingData.roomTypes?.[0];
        const singleRoomId = allRoomIds[0] || roomTypeObj?.roomIds?.[0];

        // --- Get per‑room guest counts from perRoomGuests if available ---
        let adultsCount = 0, kidsCount = 0;
        if (isExclusiveResortBooking) {
          adultsCount = bookingData.exclusiveAdults || 0;
          kidsCount = bookingData.exclusiveKids || 0;
        } else if (bookingData.perRoomGuests && bookingData.perRoomGuests[roomTypeObj.type]?.length > 0) {
          const perRoom = bookingData.perRoomGuests[roomTypeObj.type][0]; // only one unit
          adultsCount = perRoom.adults;
          kidsCount = perRoom.kids;
        } else {
          // Fallback to aggregated values
          adultsCount = (bookingData.adultsPerType?.[roomTypeObj.type] || 1);
          kidsCount = (bookingData.kidsPerType?.[roomTypeObj.type] || 0);
        }

        const booking = {
          bookingId,
          roomId: singleRoomId,
          roomType: roomTypeObj?.type || 'Room',
          price: roomTypeObj?.price || 0,
          nights: 1,
          guests: adultsCount + kidsCount,
          adults: adultsCount,
          kids: kidsCount,
          totalPrice: packageTotalPrice,
          downPayment: packageDownPayment,
          remainingBalance: packageRemainingBalance,
          checkIn: bookingData.checkIn,
          checkOut: bookingData.checkOut,
          guestInfo: {
            firstName: userFirstName,
            lastName: userLastName,
            email: userEmail,
            phone: userPhone
          },
          status: 'pending',
          paymentMethod: paymentMethod,
          paymentProofUrl: bookingData.paymentProofUrl,
          validIdType: accountValidIdType || null,
          validIdUrl: accountValidIdUrl || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          type: 'room',
          numberOfRooms: 1,
          specialRequest: bookingData.specialRequest || null,
          isExclusiveResortBooking,
          exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null,
          ...(isExclusiveResortBooking && {
            exclusiveAdults: bookingData.exclusiveAdults || 0,
            exclusiveKids: bookingData.exclusiveKids || 0,
            tentCount: bookingData.tentCount || 0
          })
        };

        if (bankDetailsProvided) {
          booking.bankDetailsProvided = bankDetailsProvided;
        }

        const docRef = await addDoc(collection(db, 'bookings'), booking);
        createdBookings.push({ ...booking, id: docRef.id });
      } else {
        // Create individual bookings for each room
        let unitIndex = 0;
        for (const roomType of bookingData.roomTypes) {
          for (let i = 0; i < roomType.quantity; i++) {
            const roomId = roomType.roomIds[i % roomType.roomIds.length];
            const roomTypeObj = bookingData.roomTypes.find(t => t.roomIds.includes(roomId));

            // --- Get per‑unit guest counts from perRoomGuests ---
            let adultsCount = 0, kidsCount = 0;
            if (isExclusiveResortBooking) {
              adultsCount = bookingData.exclusiveAdults || 0;
              kidsCount = bookingData.exclusiveKids || 0;
            } else if (bookingData.perRoomGuests && bookingData.perRoomGuests[roomTypeObj.type]?.length > unitIndex) {
              const perRoom = bookingData.perRoomGuests[roomTypeObj.type][unitIndex];
              adultsCount = perRoom.adults;
              kidsCount = perRoom.kids;
            } else {
              // Fallback to evenly distributed totals
              const totalAdults = bookingData.adultsPerType?.[roomTypeObj.type] || 1;
              const totalKids = bookingData.kidsPerType?.[roomTypeObj.type] || 0;
              adultsCount = Math.floor(totalAdults / roomType.quantity) + (unitIndex < (totalAdults % roomType.quantity) ? 1 : 0);
              kidsCount = Math.floor(totalKids / roomType.quantity);
            }

            const booking = {
              bookingId: `${bookingId}-${unitIndex + 1}`,
              roomId: roomId,
              roomType: roomTypeObj.type,
              price: roomTypeObj.price,
              nights: 1,
              guests: adultsCount + kidsCount,
              adults: adultsCount,
              kids: kidsCount,
              totalPrice: roomTypeObj.price,
              downPayment: roomTypeObj.price * 0.5,
              remainingBalance: roomTypeObj.price * 0.5,
              checkIn: bookingData.checkIn,
              checkOut: bookingData.checkOut,
              guestInfo: {
                firstName: userFirstName,
                lastName: userLastName,
                email: userEmail,
                phone: userPhone
              },
              status: 'pending',
              paymentMethod: paymentMethod,
              paymentProofUrl: bookingData.paymentProofUrl,
              validIdType: accountValidIdType || null,
              validIdUrl: accountValidIdUrl || null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              type: 'room',
              numberOfRooms: 1,
              specialRequest: bookingData.specialRequest || null,
              parentBookingId: bookingId,
              isMultiRoomBooking: true,
              isExclusiveResortBooking,
              exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null,
              parentTotalPrice: isExclusiveResortBooking ? packageTotalPrice : null,
              parentDownPayment: isExclusiveResortBooking ? packageDownPayment : null,
              parentRemainingBalance: isExclusiveResortBooking ? packageRemainingBalance : null,
              ...(isExclusiveResortBooking && {
                exclusiveAdults: bookingData.exclusiveAdults || 0,
                exclusiveKids: bookingData.exclusiveKids || 0,
                tentCount: bookingData.tentCount || 0
              })
            };

            if (bankDetailsProvided) {
              booking.bankDetailsProvided = bankDetailsProvided;
            }

            const docRef = await addDoc(collection(db, 'bookings'), booking);
            createdBookings.push({ ...booking, id: docRef.id });
            unitIndex++;
          }
        }
      }

      sessionStorage.setItem('resetRoomsPage', 'true');

      // Send email notification to guest
      try {
        // Prepare booking data for email
        const selectedRoomsList = Object.entries(bookingData.selectedRooms || {})
          .filter(([_, qty]) => qty > 0)
          .map(([type, qty]) => `${qty} × ${type}`);

        const roomTypesDisplay = selectedRoomsList.join(', ') || 'Room';
        const totalRoomsCount = Object.values(bookingData.selectedRooms || {}).reduce((a, b) => a + b, 0);

        const emailBookingData = {
          bookingId: generatedBookingId,
          guestInfo: {
            firstName: userFirstName,
            lastName: userLastName,
            email: userEmail,
            phone: userPhone
          },
          checkIn: bookingData.checkIn,
          checkOut: bookingData.checkOut,
          totalPrice: packageTotalPrice,
          downPayment: packageDownPayment,
          roomTypesDisplay: roomTypesDisplay,
          totalRooms: totalRoomsCount,
          roomTypes: bookingData.roomTypes?.filter(rt => (bookingData.selectedRooms?.[rt.type] || 0) > 0),
          isExclusiveResortBooking: isExclusiveResortBooking,
          tentCount: bookingData.tentCount || 0,
          specialRequest: bookingData.specialRequest || null
        };

        await sendRoomPendingEmail(emailBookingData);
        console.log('Pending confirmation email sent to guest');
      } catch (emailError) {
        console.error('Failed to send pending confirmation email:', emailError);
        // Don't block the booking flow if email fails
      }

      await generateQrToken(generatedBookingId);

      // Mark as confirmed and go to confirmation step (step 3)
      setIsConfirmed(true);
      setStep(3);
    } catch (error) {
      console.error('Error creating booking:', error);
      setModalNotification({ message: 'Failed to create booking. Please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const generateQrToken = async (bookingId) => {
    try {
      setQrLoading(true);
      // Generate a unique token (you can use crypto.randomBytes in API route)
      const response = await fetch('/api/checkin/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId })
      });
      const data = await response.json();
      if (data.token) {
        setQrToken(data.token);
      }
    } catch (error) {
      console.error('Error generating QR token:', error);
    } finally {
      setQrLoading(false);
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

  // Filter selected rooms to only show those with quantity > 0
  const getSelectedRoomsSummary = () => {
    if (!bookingData?.selectedRooms) return 'No rooms selected';
    const selected = Object.entries(bookingData.selectedRooms).filter(([_, qty]) => qty > 0);
    if (selected.length === 0) return 'No rooms selected';
    return selected.map(([type, qty]) => {
      const totalGuests = bookingData.totalGuestsPerType?.[type] || 1;
      return `${qty} × ${type} (${totalGuests} total guest${totalGuests !== 1 ? 's' : ''})`;
    }).join(', ');
  };

  // Get filtered room types for display (only those with quantity > 0)
  const getFilteredRoomTypes = () => {
    if (!bookingData?.roomTypes) return [];
    return bookingData.roomTypes.filter(room => (bookingData.selectedRooms?.[room.type] || 0) > 0);
  };

  if (loading || authLoading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
        </div>
        <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
        <ChatBot />
      </GuestLayout>
    );
  }

  if (!bookingData) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 flex items-center justify-center px-4">
          <div className="text-center bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <i className="fas fa-exclamation-triangle text-5xl text-amber-500 mb-4"></i>
            <p className="text-gray-700">No booking data found. Please select rooms first.</p>
            <button
              onClick={() => router.push('/rooms')}
              className="mt-4 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
            >
              Back to Room Selection
            </button>
          </div>
        </div>
      </GuestLayout>
    );
  }

  const isExclusiveBooking = Boolean(bookingData.isExclusiveResortBooking);
  const stayNights = Math.max(1, Number(bookingData.numberOfNights || 1));
  const derivedNightlyRate = stayNights > 0 ? (totalPrice / stayNights) : totalPrice;
  const visibleGuestQrBank = paymentSettings.bankAccounts.find(
    (account) => account.qrCodeUrl && account.showToGuest === true
  ) || null;
  const requestableBankAccounts = paymentSettings.bankAccounts.filter(
    (account) => account.accountNumber && String(account.accountNumber).trim().length > 0
  );
  const exclusiveAdults = Math.max(0, Number(bookingData.exclusiveAdults || 0));
  const exclusiveKids = Math.max(0, Number(bookingData.exclusiveKids || 0));
  const exclusiveTotalGuests = Math.max(0, Number(bookingData.totalGuests || 0));
  const tentCount = Math.max(0, Number(bookingData.tentCount || 0));

  // Get user display name
  const userDisplayName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : 'Guest';
  const userEmail = profile?.email || user?.email || '';
  const userMobileNumber = profile?.mobileNumber || '';

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-16">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6 space-y-3">
            <button
              onClick={() => router.push('/rooms')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-200 bg-white text-blue-700 text-xs font-semibold uppercase tracking-wider hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <i className="fas fa-arrow-left text-[10px]"></i>
              Back to Room Selection
            </button>

            <div>
              <h1 className="text-2xl md:text-3xl font-playfair font-extrabold text-gray-900 tracking-tight">Complete Your Reservation</h1>
              <p className="text-sm text-gray-500 mt-1">Review your room selection and finalize your down payment.</p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Column - Booking Form */}
            <div className="lg:w-[66%] w-full">
              {/* Progress Steps */}
              <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 pb-2">
                <div className="flex justify-between items-start relative w-full mb-4">
                  <div className="absolute top-5 left-0 w-full h-[2px] flex px-10 z-0">
                    <div className="w-1/3 h-full bg-blue-500 transition-all duration-300"></div>
                    <div className={`w-1/3 h-full transition-all duration-300 ${step >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                    <div className={`w-1/3 h-full transition-all duration-300 ${step >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                  </div>

                  {[
                    { id: 1, label: 'Select Rooms' },
                    { id: 2, label: 'Payment' },
                    { id: 3, label: 'Confirmation' }
                  ].map((item) => {
                    const isCompleted = item.id < step;
                    const isActive = item.id === step;
                    const isUpcoming = item.id > step;
                    const showCheckIcon = isCompleted || (item.id === 3 && step === 3);

                    return (
                      <div key={item.id} className="flex flex-col items-center relative z-10 w-1/3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${isActive
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200'
                            : showCheckIcon
                              ? 'bg-blue-500 border-blue-500 text-white'
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

              {/* Step 2: Payment */}
              {step === 2 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
                  <h2 className="text-xl md:text-2xl font-playfair font-bold text-gray-900 mb-4 sm:mb-6">Payment</h2>

                  {/* Account Information Summary */}
                  <div className="mb-5 p-4 bg-blue-50/30 rounded-xl border border-blue-100/80 shadow-sm">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-blue-100/60 mb-3">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-user-circle text-blue-600 text-lg"></i>
                        <span className="text-sm font-semibold text-gray-800">
                          Booking For: <span className="font-bold text-blue-900">{userDisplayName}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push('/account')}
                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 self-start sm:self-auto"
                      >
                        <i className="fas fa-user-cog text-[10px]"></i>
                        Update Profile
                      </button>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-envelope text-blue-500/70 w-4 text-center"></i>
                        <span className="font-medium text-gray-500">Email:</span>
                        <span className="text-gray-800 break-all">{userEmail}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="fas fa-phone-alt text-blue-500/70 w-4 text-center"></i>
                        <span className="font-medium text-gray-500">Mobile:</span>
                        <span>
                          {userMobileNumber ? (
                            <span className="text-gray-800 font-mono font-medium">{userMobileNumber}</span>
                          ) : (
                            <span className="text-amber-600 inline-flex items-center gap-1 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
                              <i className="fas fa-exclamation-triangle text-[10px]"></i> Contact number required to confirm.
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Error Alerts */}
                    {(mobileNumberError || validIdError) && (
                      <div className="mt-3 space-y-2">
                        {mobileNumberError && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-lg flex items-start gap-2 shadow-xs">
                            <i className="fas fa-exclamation-circle text-amber-600 mt-0.5 text-sm"></i>
                            <div className="flex-1">
                              <p className="text-xs text-amber-800 leading-relaxed font-medium">{mobileNumberError}</p>
                              <button
                                type="button"
                                onClick={() => router.push('/account')}
                                className="mt-1 text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                              >
                                <i className="fas fa-arrow-right text-[9px]"></i> Update My Account
                              </button>
                            </div>
                          </div>
                        )}
                        {validIdError && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-lg flex items-start gap-2 shadow-xs">
                            <i className="fas fa-exclamation-circle text-amber-600 mt-0.5 text-sm"></i>
                            <div className="flex-1">
                              <p className="text-xs text-amber-800 leading-relaxed font-medium">{validIdError}</p>
                              <button
                                type="button"
                                onClick={() => router.push('/account#photo-details')}
                                className="mt-1 text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                              >
                                <i className="fas fa-arrow-right text-[9px]"></i> Upload Valid ID in Account
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment Method Selection */}
                  <div className="mb-5 sm:mb-6">
                    <label className="block text-sm font-semibold text-textPrimary mb-2 sm:mb-3">Select Payment Method</label>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('gcash')}
                        className={`p-3 sm:p-4 rounded-xl border transition-all duration-200 flex flex-row items-center justify-center gap-2 sm:gap-3 ${paymentMethod === 'gcash'
                            ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                      >
                        <i className={`fas fa-wallet text-2xl sm:text-3xl ${paymentMethod === 'gcash' ? 'text-blue-600' : 'text-gray-400'}`}></i>
                        <span className={`text-sm font-medium ${paymentMethod === 'gcash' ? 'text-blue-600' : 'text-gray-500'}`}>GCash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`p-3 sm:p-4 rounded-xl border transition-all duration-200 flex flex-row items-center justify-center gap-2 sm:gap-3 ${paymentMethod === 'bank_transfer'
                            ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                      >
                        <i className={`fas fa-credit-card text-xl sm:text-2xl ${paymentMethod === 'bank_transfer' ? 'text-blue-600' : 'text-gray-400'}`}></i>
                        <span className={`text-sm font-medium ${paymentMethod === 'bank_transfer' ? 'text-blue-600' : 'text-gray-500'}`}>Bank Transfer</span>
                      </button>
                    </div>
                  </div>

                  {/* GCash Payment Section */}
                  {paymentMethod === 'gcash' && (
                    <div className="space-y-4 sm:space-y-5">
                      <div className="flex flex-col md:flex-row gap-4 sm:gap-5">
                        <div className="flex-1 p-4 sm:p-5 bg-gradient-to-r from-ocean-ice to-blue-white rounded-xl flex flex-col justify-center items-center md:items-start text-center md:text-left border border-blue-100/50">
                          <p className="text-sm font-semibold text-textPrimary mb-1">Down Payment Required</p>
                          <p className="text-2xl sm:text-3xl font-bold text-amber-600">₱{downPaymentAmount.toLocaleString()}</p>
                          <p className="text-xs text-textSecondary mt-1">50% of total price</p>
                        </div>

                        <div className="flex-1 p-4 sm:p-5 bg-ocean-ice/50 rounded-xl text-center border border-ocean-light/20">
                          <h3 className="text-sm font-semibold text-textPrimary mb-2 flex items-center justify-center gap-1.5">
                            <i className="fas fa-qrcode text-ocean-mid"></i>
                            Scan to Pay
                          </h3>
                          {paymentSettings.gcashQRCode ? (
                            <div className="flex flex-col items-center">
                              <div className="w-60 h-60 sm:w-70 sm:h-70 bg-white rounded-lg flex items-center justify-center border border-ocean-light/20 overflow-hidden shadow-sm">
                                <img
                                  src={paymentSettings.gcashQRCode}
                                  alt="GCash QR Code"
                                  className="object-contain w-full h-full"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-amber-600 mt-4">GCash QR code not available. Contact resort.</p>
                          )}
                        </div>
                      </div>

                      <div className="p-3 sm:p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                        <p className="text-xs sm:text-sm text-blue-800 mb-1.5 font-medium flex items-center">
                          <i className="fas fa-info-circle mr-1.5"></i>
                          Payment Notes
                        </p>
                        <ul className="text-xs text-blue-700/80 space-y-1 ml-5 list-disc leading-relaxed">
                          <li>Pay only the <strong>down payment (50%)</strong> to confirm.</li>
                          <li>Balance (₱{(totalPrice - downPaymentAmount).toLocaleString()}) is due upon check-in.</li>
                          <li>Cancellations will result in forfeiture of the down payment, unless the booking is rescheduled.</li>
                        </ul>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Valid ID Container */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-id-card text-blue-500 text-lg"></i>
                            <label className="text-sm font-semibold text-gray-800">Valid ID (from your account)</label>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
                            Required for booking verification.
                          </p>
                          <div className="relative">
                            {hasAccountValidId(profile) ? (
                              <button
                                type="button"
                                onClick={() => router.push('/account#photo-details')}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all duration-200 cursor-pointer"
                              >
                                <i className="fas fa-id-card"></i> Manage Valid ID
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => router.push('/account#photo-details')}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 cursor-pointer transition-all duration-200"
                              >
                                <i className="fas fa-upload"></i> Upload in Account
                              </button>
                            )}
                          </div>
                          {hasAccountValidId(profile) ? (
                            <p className="mt-2.5 text-[11px] text-emerald-600 flex items-center gap-1.5">
                              <i className="fas fa-check-circle text-emerald-500"></i>
                              On file — used for this reservation ({accountValidIdType})
                            </p>
                          ) : (
                            <p className="mt-2.5 text-[11px] text-amber-600 flex items-center gap-1.5">
                              <i className="fas fa-exclamation-circle text-amber-500"></i>
                              No valid ID on file. Required to confirm booking.
                            </p>
                          )}
                        </div>

                        {/* Receipt Container */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-file-invoice-dollar text-blue-500 text-lg"></i>
                            <label className="text-sm font-semibold text-gray-800">Receipt</label>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
                            Proof of down payment.
                          </p>
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
                              className={`w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${uploading
                                  ? 'bg-gray-100 text-gray-400 cursor-wait border border-gray-200'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 cursor-pointer'
                                }`}
                            >
                              {uploading ? (
                                <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                              ) : (
                                <><i className="fas fa-upload"></i> Upload Receipt</>
                              )}
                            </label>
                          </div>
                          {bookingData.paymentProofUrl && (
                            <p className="mt-2.5 text-[11px] text-emerald-600 flex items-center gap-1.5">
                              <i className="fas fa-check-circle text-emerald-500"></i>
                              Payment proof uploaded
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bank Transfer Section */}
                  {paymentMethod === 'bank_transfer' && (
                    <div className="space-y-4 sm:space-y-5">
                      <div className="flex flex-col md:flex-row gap-4 sm:gap-5">
                        <div className="flex-1 p-4 sm:p-5 bg-gradient-to-r from-ocean-ice to-blue-white rounded-xl flex flex-col justify-center items-center md:items-start text-center md:text-left border border-blue-100/50">
                          <p className="text-sm font-semibold text-textPrimary mb-1">Down Payment Required</p>
                          <p className="text-2xl sm:text-3xl font-bold text-amber-600">₱{downPaymentAmount.toLocaleString()}</p>
                          <p className="text-xs text-textSecondary mt-1">50% of total price</p>
                        </div>

                        <div className="flex-1 space-y-3">
                          {/* QR CODE CONTAINER - Separate section for QR code details */}
                          {visibleGuestQrBank && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                              <div className="flex items-center gap-2 mb-3 border-b border-blue-200 pb-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                                  <i className="fas fa-qrcode text-xs"></i>
                                </div>
                                <h3 className="text-sm font-semibold text-blue-900">QR Code Payment</h3>
                              </div>
                              <div className="flex flex-col items-center gap-3">
                                <div className="flex w-60 h-60 sm:w-70 sm:h-70 items-center justify-center overflow-hidden rounded-lg border border-blue-200 bg-white p-2 shadow-sm">
                                  <img
                                    src={visibleGuestQrBank.qrCodeUrl}
                                    alt={`${visibleGuestQrBank.bankName} QR Code`}
                                    className="h-full w-full object-contain"
                                  />
                                </div>
                                <div className="text-center">
                                  <p className="font-semibold text-textPrimary text-sm">{visibleGuestQrBank.bankName}</p>
                                  <p className="text-xs text-textSecondary">{visibleGuestQrBank.accountName}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* REQUESTED BANK DETAILS CONTAINER - Separate section for bank details */}
                          {bankDetailsProvided ? (
                            <div className="rounded-xl border border-green-200 bg-green-50/40 p-4">
                              <div className="flex items-center gap-2 mb-3 border-b border-green-200 pb-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-600">
                                  <i className="fas fa-credit-card text-xs"></i>
                                </div>
                                <h3 className="text-sm font-semibold text-green-900">Bank Details Provided</h3>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank Name</p>
                                  <p className="text-sm font-medium text-gray-800 mt-0.5">{bankDetailsProvided.bankName}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account Name</p>
                                  <p className="text-sm font-medium text-gray-800 mt-0.5">{bankDetailsProvided.accountName}</p>
                                </div>
                                {bankDetailsProvided.accountNumber && bankDetailsProvided.accountNumber !== 'QR Code Provided' ? (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account Number</p>
                                    <p className="text-sm font-mono font-medium text-gray-800 mt-0.5">{bankDetailsProvided.accountNumber}</p>
                                  </div>
                                ) : bankDetailsProvided.qrCodeUrl ? (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">QR Code</p>
                                    <a href={bankDetailsProvided.qrCodeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                      <i className="fas fa-qrcode mr-1"></i> View QR Code
                                    </a>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : bankRequestSent ? (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 text-center">
                              <div className="flex flex-col items-center justify-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-2">
                                  <i className="fas fa-clock text-lg"></i>
                                </div>
                                <p className="text-sm font-semibold text-gray-800">Request Sent!</p>
                                <p className="text-xs text-gray-500 mt-1">Waiting for resort to provide bank details...</p>
                              </div>
                            </div>
                          ) : (!showBankSelection ? (
                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                              <div className="flex items-center gap-2 mb-3 border-b border-gray-200 pb-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                                  <i className="fas fa-credit-card text-xs"></i>
                                </div>
                                <h3 className="text-sm font-semibold text-gray-800">Choose your other preferred bank:</h3>
                              </div>
                              {requestableBankAccounts.length > 0 ? (
                                <select
                                  className="w-full p-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 bg-white"
                                  onChange={(e) => {
                                    if (e.target.value !== '') {
                                      const bank = requestableBankAccounts.find(b => b.id === e.target.value || b.bankName === e.target.value);
                                      if (bank) {
                                        setSelectedBankAccount(bank);
                                        setShowBankSelection(true);
                                      }
                                    }
                                  }}
                                  defaultValue=""
                                >
                                  <option value="" disabled>-- Select a bank --</option>
                                  {requestableBankAccounts.map((bank) => (
                                    <option key={bank.id || bank.bankName} value={bank.id || bank.bankName}>
                                      {bank.bankName}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="text-xs text-amber-600">No bank accounts are available right now.</p>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                              <div className="flex items-center gap-2 mb-3 border-b border-amber-200 pb-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                  <i className="fas fa-check-circle text-xs"></i>
                                </div>
                                <h3 className="text-sm font-semibold text-amber-900">Selected Bank</h3>
                              </div>
                              <div className="mb-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank Name</p>
                                <p className="text-sm font-semibold text-gray-800 mt-0.5">{selectedBankAccount?.bankName}</p>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Account Name</p>
                                <p className="text-sm text-gray-700 mt-0.5">{selectedBankAccount?.accountName}</p>
                              </div>

                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={() => setShowBankSelection(false)}
                                  className="flex-1 py-2 px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold transition"
                                >
                                  Change
                                </button>
                                <button
                                  onClick={handleNotifyResort}
                                  disabled={notifyingResort}
                                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
                                >
                                  {notifyingResort ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-paper-plane"></i> Request</>}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 sm:p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                        <p className="text-xs sm:text-sm text-blue-800 mb-1.5 font-medium flex items-center">
                          <i className="fas fa-info-circle mr-1.5"></i>
                          Payment Notes
                        </p>
                        <ul className="text-xs text-blue-700/80 space-y-1 ml-5 list-disc leading-relaxed">
                          <li>Pay only the <strong>down payment (50%)</strong> to confirm.</li>
                          <li>Balance (₱{(totalPrice - downPaymentAmount).toLocaleString()}) is due upon check-in.</li>
                          <li>Cancellations will result in forfeiture of the down payment, unless the booking is rescheduled.</li>
                        </ul>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Valid ID Container */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-id-card text-blue-500 text-lg"></i>
                            <label className="text-sm font-semibold text-gray-800">Valid ID (from your account)</label>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
                            Required for booking verification.
                          </p>
                          <div className="relative">
                            {hasAccountValidId(profile) ? (
                              <button
                                type="button"
                                onClick={() => router.push('/account#photo-details')}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all duration-200 cursor-pointer"
                              >
                                <i className="fas fa-id-card"></i> Manage Valid ID
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => router.push('/account#photo-details')}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 cursor-pointer transition-all duration-200"
                              >
                                <i className="fas fa-upload"></i> Upload in Account
                              </button>
                            )}
                          </div>
                          {hasAccountValidId(profile) ? (
                            <p className="mt-2.5 text-[11px] text-emerald-600 flex items-center gap-1.5">
                              <i className="fas fa-check-circle text-emerald-500"></i>
                              On file — used for this reservation ({accountValidIdType})
                            </p>
                          ) : (
                            <p className="mt-2.5 text-[11px] text-amber-600 flex items-center gap-1.5">
                              <i className="fas fa-exclamation-circle text-amber-500"></i>
                              Not uploaded. Required to confirm booking.
                            </p>
                          )}
                        </div>

                        {/* Receipt Container */}
                        <div className={`bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm transition-colors ${(bankDetailsProvided || visibleGuestQrBank) ? 'hover:border-blue-200' : 'opacity-50'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-file-invoice-dollar text-blue-500 text-lg"></i>
                            <label className="text-sm font-semibold text-gray-800">Receipt</label>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
                            Proof of down payment.
                          </p>
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePaymentProofUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              id="payment-proof-upload-bank"
                              disabled={uploading || (!bankDetailsProvided && !visibleGuestQrBank)}
                            />
                            <label
                              htmlFor="payment-proof-upload-bank"
                              className={`w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${uploading || (!bankDetailsProvided && !visibleGuestQrBank)
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 cursor-pointer'
                                }`}
                            >
                              {uploading ? (
                                <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                              ) : (
                                <><i className="fas fa-upload"></i> Upload Receipt</>
                              )}
                            </label>
                          </div>
                          {!bankDetailsProvided && !visibleGuestQrBank && (
                            <p className="mt-2.5 text-[11px] text-amber-600 flex items-center gap-1.5">
                              <i className="fas fa-exclamation-circle"></i>
                              Waiting for bank details...
                            </p>
                          )}
                          {bookingData.paymentProofUrl && (bankDetailsProvided || visibleGuestQrBank) && (
                            <p className="mt-2.5 text-[11px] text-emerald-600 flex items-center gap-1.5">
                              <i className="fas fa-check-circle text-emerald-500"></i>
                              Payment proof uploaded
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleSubmitBooking}
                      disabled={
                        !bookingData.paymentProofUrl ||
                        submitting ||
                        (paymentMethod === 'bank_transfer' && !bankDetailsProvided && !visibleGuestQrBank) ||
                        !userMobileNumber ||
                        !hasAccountValidId(profile)
                      }
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${bookingData.paymentProofUrl &&
                          !submitting &&
                          (paymentMethod !== 'bank_transfer' || bankDetailsProvided || visibleGuestQrBank) &&
                          userMobileNumber &&
                          hasAccountValidId(profile)
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:shadow-lg hover:shadow-blue-500/30'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                      {submitting ? 'Submitting...' : 'Confirm Booking'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirmation */}
              {step === 3 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-6 sm:p-8 text-center">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-check text-3xl text-emerald-600"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-textPrimary mb-2">Booking Confirmed!</h2>
                  <p className="text-textSecondary mb-4">
                    Thank you for your booking! A confirmation email will be sent to {userEmail}. You can track your reservation through your account.
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

                  <div className="p-4 bg-amber-50 rounded-lg mb-6">
                    <p className="text-sm text-amber-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      Down payment of <strong>₱{downPaymentAmount.toLocaleString()}</strong> has been confirmed.
                      Remaining balance of <strong>₱{(totalPrice - downPaymentAmount).toLocaleString()}</strong> is payable at the resort. Cancellations will result in forfeiture of the down payment, unless the booking is rescheduled.
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
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
                        >
                          <i className="fas fa-download"></i>
                          Download QR Code
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        Staff will scan this QR code at the resort.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
                    <button
                      onClick={() => router.push('/rooms')}
                      className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition"
                    >
                      Back to Room Page
                    </button>
                    <button
                      onClick={() => router.push('/')}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition"
                    >
                      Go to Home Page
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Booking Summary Panel */}
            <div className="lg:w-[34%] w-full">
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_12px_40px_rgb(0,0,0,0.06)] overflow-hidden sticky top-32">
                <div className="px-5 py-4 border-b border-gray-100 bg-[#F8FCFF]">
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 uppercase tracking-wider">
                    <i className="fas fa-receipt text-blue-500 "></i>
                    Booking Summary
                  </h3>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-door-open text-blue-500 text-xs"></i>
                      {isExclusiveBooking ? 'Entire Resort Package' : 'Selected Rooms'}
                    </h4>

                    {isExclusiveBooking ? (
                      <div className="bg-blue-50/60 rounded-xl border border-blue-200 p-3 space-y-1.5">
                        <p className="text-sm font-semibold text-blue-900">Whole resort reserved for your selected dates</p>
                        {tentCount > 0 && (
                          <p className="text-xs text-amber-700 font-medium">
                            <i className="fas fa-tent mr-1"></i>
                            Tents: {tentCount} (+₱{tentCount * 1500 * stayNights} for the stay)
                          </p>
                        )}
                        <p className="text-xs text-blue-700">Adults: {exclusiveAdults} | Kids: {exclusiveKids}</p>
                      </div>
                    ) : (
                      // Non‑exclusive: show filtered rooms (only those with quantity > 0)
                      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                        {getFilteredRoomTypes().length > 0 ? (
                          getFilteredRoomTypes().map((roomType, idx) => {
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
                                {bookingData.totalGuestsPerType?.[roomType.type] && !bookingData.perRoomGuests?.[roomType.type] && (
                                  <div className="mt-1 text-gray-500">
                                    Total Guests: {bookingData.totalGuestsPerType[roomType.type]}
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
                      <i className="fas fa-calendar-check text-blue-500 text-xs"></i>
                      Schedule
                    </h4>
                    <div className="bg-white rounded-xl border border-gray-200 p-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {formatDateOnly(bookingData.checkIn)}
                      </p>
                      <p className="text-sm text-blue-600 font-medium mt-1">
                        <i className="fas fa-clock mr-1"></i>
                        Check-in: {FIXED_CHECK_IN_DISPLAY}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        Check-out: {formatDateOnly(bookingData.checkOut)} at {FIXED_CHECK_OUT_DISPLAY}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-tag text-blue-500 text-xs"></i>
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
                        <span className="font-semibold text-gray-800">₱{(totalPrice - downPaymentAmount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F8FCFF] rounded-xl p-3 border border-blue-100">
                    <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-comment text-blue-500 text-xs"></i>
                      Special Request
                    </h4>
                    <textarea
                      value={bookingData.specialRequest || ''}
                      onChange={(e) => setBookingData(prev => ({ ...prev, specialRequest: e.target.value }))}
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
                      Check-in is fixed at 2:00 PM. Mention preferred early check-in time if needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </GuestLayout>
  );
}   