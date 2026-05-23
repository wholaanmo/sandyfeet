// app/day-tour/booking/page.js
'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { uploadImage } from '@/lib/cloudinary';
import { sendDayTourPendingEmail } from '@/lib/emailService';
import ChatBot from '@/components/guest/ChatBot';
import { QRCodeSVG } from 'qrcode.react';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { getDisplayValidIdType, hasAccountValidId, hasAccountMobileNumber } from '@/lib/guestValidId';
import {
  buildGuestInfoWithAddress,
  getAddressBlockerMessage,
  isProfileAddressComplete,
} from '@/lib/guestAddress';

// Storage key for persisting payment‑related data
const STORAGE_KEY = 'daytour_booking_data';
const STEP_STORAGE_KEY = 'daytour_booking_step';

function DayTourBookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useGuestAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const HARD_MAX_PACKS = 38;
  const LEAD_TIME_DAYS = 2;
  const dateParam = searchParams.get('date');
  const adultsParam = searchParams.get('adults');
  const kidsParam = searchParams.get('kids');
  const bankRequestIdParam = searchParams.get('bankRequestId');
  const bookingIdParam = searchParams.get('bookingId');
  
  const [loading, setLoading] = useState(true);
  const [dayTour, setDayTour] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [remainingCapacity, setRemainingCapacity] = useState(0);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatedBookingId, setGeneratedBookingId] = useState('');
  const [paymentSettings, setPaymentSettings] = useState({
    gcashQRCode: '',
    bankAccounts: []
  });
  const [paymentMethod, setPaymentMethod] = useState('gcash');
  const [balancePaymentMethod, setBalancePaymentMethod] = useState('');
  const [bankRequestSent, setBankRequestSent] = useState(false);
  const [bankRequestId, setBankRequestId] = useState(null);
  const [bankDetailsProvided, setBankDetailsProvided] = useState(null);
  const [notifyingResort, setNotifyingResort] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);
  const [showBankSelection, setShowBankSelection] = useState(false);
  const [requestedBankInfo, setRequestedBankInfo] = useState(null);
  const [modalNotification, setModalNotification] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  
  const initialAdultsRaw = parseInt(adultsParam) || 1;
  const initialKidsRaw = parseInt(kidsParam) || 0;
  const initialAdults = Math.max(1, Math.min(HARD_MAX_PACKS, initialAdultsRaw));
  const initialKids = Math.max(0, Math.min(HARD_MAX_PACKS - initialAdults, initialKidsRaw));

  // Booking data now only stores guest counts, uploaded files, and special request.
  const [bookingData, setBookingData] = useState({
    adults: String(initialAdults),
    kids: String(initialKids),
    paymentProof: null,
    specialRequest: ''
  });
  
  const [errors, setErrors] = useState({});
  const [validIdError, setValidIdError] = useState('');
  const [mobileNumberError, setMobileNumberError] = useState('');

  const hasMobileNumber = hasAccountMobileNumber(profile);
  const accountValidIdType = getDisplayValidIdType(profile);
  const accountValidIdUrl = profile?.validIdUrl || '';

  // Restore bank transfer request when returning from Pending Payment
  useEffect(() => {
    if (!bankRequestIdParam) return undefined;

    let cancelled = false;

    const restoreBankRequest = async () => {
      try {
        const bankSnap = await getDoc(doc(db, 'daytour_bank_requests', bankRequestIdParam));
        if (!bankSnap.exists() || cancelled) return;

        const bankData = bankSnap.data();
        if (bankData.bookingId) {
          setGeneratedBookingId(bankData.bookingId);
        } else if (bookingIdParam) {
          setGeneratedBookingId(bookingIdParam);
        }
        setBankRequestId(bankRequestIdParam);
        setBankRequestSent(true);
        if (bankData.providedBankDetails) {
          setBankDetailsProvided(bankData.providedBankDetails);
        }
        if (bankData.pendingBookingDraft) {
          setBookingData((prev) => ({
            ...prev,
            adults: String(bankData.pendingBookingDraft.adults ?? prev.adults),
            kids: String(bankData.pendingBookingDraft.kids ?? prev.kids),
            specialRequest: bankData.pendingBookingDraft.specialRequest || prev.specialRequest,
            paymentProof: bankData.pendingBookingDraft.paymentProof || prev.paymentProof,
          }));
          if (bankData.pendingBookingDraft.paymentMethod) {
            setPaymentMethod(bankData.pendingBookingDraft.paymentMethod);
          }
        }
      } catch (error) {
        console.error('Error restoring day tour bank request:', error);
      }
    };

    restoreBankRequest();

    return () => {
      cancelled = true;
    };
  }, [bankRequestIdParam, bookingIdParam]);

  // Load persisted payment data from localStorage on mount
  useEffect(() => {
    try {
      const savedStep = localStorage.getItem(STEP_STORAGE_KEY);
      if (savedStep && !isNaN(parseInt(savedStep))) {
        const stepNum = parseInt(savedStep);
        if (stepNum >= 1 && stepNum <= 3) {
          setStep(stepNum);
        }
      }
      
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        setBookingData(prev => ({
          ...prev,
          paymentProof: parsed.paymentProof,
          specialRequest: parsed.specialRequest || ''
        }));
        if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
        if (parsed.balancePaymentMethod) setBalancePaymentMethod(parsed.balancePaymentMethod);
        if (parsed.bankRequestSent) setBankRequestSent(parsed.bankRequestSent);
        if (parsed.bankRequestId) setBankRequestId(parsed.bankRequestId);
        if (parsed.bankDetailsProvided) setBankDetailsProvided(parsed.bankDetailsProvided);
      }
    } catch (error) {
      console.error('Error loading persisted booking data:', error);
    }
  }, []);

  // Save payment‑related data to localStorage
  useEffect(() => {
    try {
      const dataToSave = {
        adults: bookingData.adults,
        kids: bookingData.kids,
        paymentProof: bookingData.paymentProof,
        paymentMethod: paymentMethod,
        balancePaymentMethod: balancePaymentMethod,
        bankRequestSent: bankRequestSent,
        bankRequestId: bankRequestId,
        bankDetailsProvided: bankDetailsProvided,
        specialRequest: bookingData.specialRequest
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving payment data:', error);
    }
  }, [bookingData, paymentMethod, balancePaymentMethod, bankRequestSent, bankRequestId, bankDetailsProvided]);

  // Save step to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STEP_STORAGE_KEY, String(step));
    } catch (error) {
      console.error('Error saving step:', error);
    }
  }, [step]);

  // Clear persisted data when booking is completed (step 3)
  useEffect(() => {
    if (step === 3) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STEP_STORAGE_KEY);
      } catch (error) {
        console.error('Error clearing persisted data:', error);
      }
    }
  }, [step]);

  const toGuestNumber = (value) => {
    const parsed = parseInt(String(value), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const isDateBeforeLeadTime = (targetDate) => {
    if (!targetDate) return true;
    const normalizedTarget = new Date(targetDate);
    normalizedTarget.setHours(0, 0, 0, 0);

    const minBookableDate = new Date();
    minBookableDate.setHours(0, 0, 0, 0);
    minBookableDate.setDate(minBookableDate.getDate() + LEAD_TIME_DAYS);

    return normalizedTarget < minBookableDate;
  };

  // Generate unique booking reference number
  const generateBookingReference = () => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `DAYTOUR-${timestamp}-${randomNum}`;
  };

  useEffect(() => {
    const newBookingId = generateBookingReference();
    setGeneratedBookingId(newBookingId);
  }, []);

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

  // Real-time listener for bank request status updates
  useEffect(() => {
    if (!bankRequestId) return;
    
    const bankRequestRef = doc(db, 'daytour_bank_requests', bankRequestId);
    
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

  // Real-time listener for capacity updates from other bookings
  useEffect(() => {
    if (!selectedDate || !dayTour) return;
    
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    
    const bookingsRef = collection(db, 'dayTourBookings');
    const bookingsQuery = query(
      bookingsRef,
      where('selectedDate', '==', dateKey),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    const unavailableRef = collection(db, 'daytour_unavailable_dates');
    const unavailableQuery = query(unavailableRef, where('date', '==', dateKey));

    let latestBookedGuests = 0;
    let latestUnavailableGuests = 0;

    const updateRemainingCapacity = () => {
      const capacity = dayTour.maxCapacity
        ? dayTour.maxCapacity - (latestBookedGuests + latestUnavailableGuests)
        : Infinity;
      setRemainingCapacity(capacity);

      const currentTotalGuests = toGuestNumber(bookingData.adults) + toGuestNumber(bookingData.kids);
      if (capacity !== Infinity && currentTotalGuests > capacity) {
        setErrors(prev => ({ ...prev, guests: `Only ${capacity} slot(s) remaining for this date` }));
      } else if (errors.guests && errors.guests.includes('remaining')) {
        setErrors(prev => ({ ...prev, guests: '' }));
      }
    };

    const unsubscribeBookings = onSnapshot(bookingsQuery, (querySnapshot) => {
      let totalBookedGuests = 0;
      querySnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        totalBookedGuests += (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
      });
      latestBookedGuests = totalBookedGuests;
      updateRemainingCapacity();
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
    });

    const unsubscribeUnavailable = onSnapshot(unavailableQuery, (querySnapshot) => {
      let totalUnavailableGuests = 0;
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        totalUnavailableGuests += Number(data.unavailableGuests || 0);
      });
      latestUnavailableGuests = totalUnavailableGuests;
      updateRemainingCapacity();
    }, (error) => {
      console.error('Error fetching unavailable guest count:', error);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeUnavailable();
    };
  }, [selectedDate, dayTour, bookingData.adults, bookingData.kids]);

  // Parse selected date from URL params
  useEffect(() => {
    if (dateParam) {
      const date = new Date(dateParam);
      if (!isNaN(date.getTime()) && !isDateBeforeLeadTime(date)) {
        setSelectedDate(date);
      } else {
        router.push('/day-tour');
      }
    } else {
      router.push('/day-tour');
    }
  }, [dateParam, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/day-tour');
    }
  }, [authLoading, user, router]);

  // Fetch day tour details
  useEffect(() => {
    const fetchDayTour = async () => {
      if (!selectedDate) return;
      
      try {
        const toursRef = collection(db, 'dayTours');
        const q = query(toursRef, where('archived', '!=', true));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          router.push('/day-tour');
          return;
        }
        
        const tourDoc = querySnapshot.docs[0];
        const tour = { id: tourDoc.id, ...tourDoc.data() };
        setDayTour(tour);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching day tour:', error);
        setLoading(false);
      }
    };
    
    fetchDayTour();
  }, [selectedDate, router]);

  // Calculate total guests and total price
  const adultsCount = toGuestNumber(bookingData.adults);
  const kidsCount = toGuestNumber(bookingData.kids);
  const totalGuests = adultsCount + kidsCount;
  const maxAllowedGuests = HARD_MAX_PACKS;
  const totalPrice = (adultsCount * (dayTour?.adultPrice || 0)) +
                     (kidsCount * (dayTour?.kidPrice || 0));
  const downPaymentAmount = totalPrice * 0.5;
  const remainingBalance = totalPrice - downPaymentAmount;
  const userDisplayName = profile
    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
    : 'Guest';
  const userEmail = profile?.email || user?.email || '';
  const userMobileNumber = profile?.mobileNumber || '';
  const hasCompleteAddress = isProfileAddressComplete(profile);

  const canSubmitPayment = Boolean(
    bookingData.paymentProof &&
    !submitting &&
    hasMobileNumber &&
    hasAccountValidId(profile) &&
    (paymentMethod !== 'bank_transfer' || bankDetailsProvided || visibleGuestQrBank) &&
    ['digital', 'cash'].includes(balancePaymentMethod) &&
    hasCompleteAddress
  );
  const visibleGuestQrBank = paymentSettings.bankAccounts.find(
    (account) => account.qrCodeUrl && account.showToGuest === true
  ) || null;
  const requestableBankAccounts = paymentSettings.bankAccounts.filter(
    (account) => account.accountNumber && String(account.accountNumber).trim().length > 0
  );

  // Format date for display
  const formatSelectedDate = () => {
    if (!selectedDate) return '';
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const validateGuests = () => {
    if (bookingData.adults === '' || adultsCount < 1) {
      setErrors(prev => ({ ...prev, guests: 'At least 1 adult is required' }));
      return false;
    }

    if (bookingData.kids === '') {
      setErrors(prev => ({ ...prev, guests: 'Please enter a valid number of kids (use 0 if none)' }));
      return false;
    }

    if (totalGuests < 1) {
      setErrors(prev => ({ ...prev, guests: 'At least 1 guest is required' }));
      return false;
    }

    if (adultsCount > maxAllowedGuests || kidsCount > maxAllowedGuests || totalGuests > maxAllowedGuests) {
      setErrors(prev => ({ ...prev, guests: `We only allow up to ${maxAllowedGuests} guests per booking.` }));
      return false;
    }
    
    if (remainingCapacity !== Infinity && totalGuests > remainingCapacity) {
      setErrors(prev => ({ ...prev, guests: `Only ${remainingCapacity} slot(s) remaining for this date` }));
      return false;
    }
    
    setErrors(prev => ({ ...prev, guests: '' }));
    return true;
  };

  const handleGuestChange = (field, value) => {
    if (value === '') {
      setBookingData(prev => ({ ...prev, [field]: '' }));
      if (errors.guests) {
        setErrors(prev => ({ ...prev, guests: '' }));
      }
      return;
    }

    if (!/^\d+$/.test(value)) return;

    setBookingData(prev => ({ ...prev, [field]: value }));

    const nextAdults = field === 'adults' ? toGuestNumber(value) : adultsCount;
    const nextKids = field === 'kids' ? toGuestNumber(value) : kidsCount;
    const nextTotal = nextAdults + nextKids;

    if (nextAdults > maxAllowedGuests || nextKids > maxAllowedGuests || nextTotal > maxAllowedGuests) {
      setErrors(prev => ({ ...prev, guests: `We only allow up to ${maxAllowedGuests} guests per booking.` }));
      return;
    }

    if (errors.guests) {
      validateGuests();
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (validateGuests()) {
        // If user is not logged in, show auth modal and prevent moving to payment
        if (!user) {
          setIsAuthModalOpen(true);
          return;
        }
        setStep(2);
      }
    } else {
      setStep(step + 1);
    }
  };

  const handlePreviousStep = () => {
    if (step === 1) {
      router.push('/day-tour');
    } else {
      setStep(step - 1);
    }
  };

  const handlePaymentProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const cloudinaryUrl = await uploadImage(file);
      setBookingData(prev => ({ ...prev, paymentProof: cloudinaryUrl }));
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      setModalNotification({ message: 'Failed to upload payment proof. Please try again.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleNotifyResort = async () => {
    if (!selectedBankAccount) {
      setModalNotification({ message: 'Please select a bank account first', type: 'error' });
      return;
    }
    
    setNotifyingResort(true);
    try {
      const dateKey = formatSelectedDate();
      
      const bankRequestsRef = collection(db, 'daytour_bank_requests');
      const docRef = await addDoc(bankRequestsRef, {
        guestName: `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        guestEmail: user?.email || '',
        guestPhone: profile?.mobileNumber || '',
        bookingType: 'daytour',
        bookingId: generatedBookingId,
        selectedDate: dateKey,
        totalAmount: totalPrice,
        downPaymentRequired: downPaymentAmount,
        requestedBank: {
          bankName: selectedBankAccount.bankName,
          accountName: selectedBankAccount.accountName,
          accountNumber: selectedBankAccount.accountNumber || '',
          qrCodeUrl: selectedBankAccount.qrCodeUrl || ''
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
        read: false,
        pendingBookingDraft: {
          adults: bookingData.adults,
          kids: bookingData.kids,
          specialRequest: bookingData.specialRequest,
          paymentProof: bookingData.paymentProof,
          paymentMethod,
        },
        draftSavedAt: new Date().toISOString(),
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

  const handleSubmitBooking = async () => {
    if (!selectedDate || isDateBeforeLeadTime(selectedDate)) {
      alert('Walk-ins or same-day bookings are not allowed. Please choose a later date.');
      router.push('/day-tour');
      return;
    }

    // Double-check that user is logged in and has mobile number
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!hasMobileNumber) {
      setMobileNumberError('A mobile number is required to confirm your booking. Please update your account profile.');
      setModalNotification({ message: 'Please add a mobile number in your account settings before booking.', type: 'error' });
      return;
    }
    setMobileNumberError('');
    if (!hasAccountValidId(profile)) {
      setValidIdError('Please upload a valid ID in your account profile before booking.');
      setModalNotification({ message: 'A valid ID photo is required. Upload it in your account profile.', type: 'error' });
      return;
    }
    setValidIdError('');
    if (!isProfileAddressComplete(profile)) {
      setModalNotification({ message: getAddressBlockerMessage(), type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      const bookingsRef = collection(db, 'dayTourBookings');
      const bookingsQuery = query(
        bookingsRef,
        where('selectedDate', '==', dateKey),
        where('status', 'in', ['pending', 'confirmed', 'check-in'])
      );
      const bookingsSnapshot = await getDocs(bookingsQuery);
      
      let totalBookedGuests = 0;
      bookingsSnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        totalBookedGuests += (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
      });

      const unavailableRef = collection(db, 'daytour_unavailable_dates');
      const unavailableQuery = query(unavailableRef, where('date', '==', dateKey));
      const unavailableSnapshot = await getDocs(unavailableQuery);
      let totalUnavailableGuests = 0;
      unavailableSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        totalUnavailableGuests += Number(data.unavailableGuests || 0);
      });

      const availableCapacity = dayTour.maxCapacity
        ? dayTour.maxCapacity - (totalBookedGuests + totalUnavailableGuests)
        : Infinity;
      
      if (totalGuests > availableCapacity) {
        alert(`Sorry, only ${availableCapacity} slot(s) remain for this date. Please adjust your guest count.`);
        setStep(1);
        setSubmitting(false);
        return;
      }
      
      const booking = {
        bookingId: generatedBookingId,
        dayTourId: dayTour.id,
        selectedDate: dateKey,
        selectedDateISO: selectedDate.toISOString(),
        adults: adultsCount,
        kids: kidsCount,
        totalGuests: totalGuests,
        totalPrice: totalPrice,
        downPayment: downPaymentAmount,
        remainingBalance: totalPrice - downPaymentAmount,
        guestInfo: buildGuestInfoWithAddress(profile, {
          firstName: profile?.firstName || '',
          lastName: profile?.lastName || '',
          email: user.email,
          phone: profile?.mobileNumber || '',
        }),
        status: 'pending',
        paymentMethod: paymentMethod,
        balancePaymentMethod: balancePaymentMethod,
        paymentProof: bookingData.paymentProof,
        validIdType: accountValidIdType || null,
        validIdImage: accountValidIdUrl || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        type: 'daytour',
        specialRequest: bookingData.specialRequest || null
      };
      
      if (bankDetailsProvided) {
        booking.bankDetailsProvided = bankDetailsProvided;
      }
      
      await addDoc(collection(db, 'dayTourBookings'), booking);

      const emailResult = await sendDayTourPendingEmail(booking);
      if (!emailResult?.success) {
        console.warn('Failed to send pending day tour email:', emailResult?.error);
      }

      await generateQrToken(generatedBookingId);
      setStep(3);
      
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Failed to create booking. Please try again: ' + error.message);
    } finally {
      setSubmitting(false);
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
      }
    } catch (error) {
      console.error('Error generating QR token:', error);
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
      setModalNotification({ message: 'Failed to download QR code. Please try again.', type: 'error' });
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = date.toLocaleString('default', { month: 'long' });
    const day = date.getDate();
    const weekday = date.toLocaleString('default', { weekday: 'long' });
    return `${weekday}, ${month} ${day}, ${year}`;
  };

  const paymentChecklist = [
    {
      icon: 'fa-map-marker-alt',
      label: 'Complete Address',
      description: hasCompleteAddress
        ? 'Your home address is saved in your account profile.'
        : getAddressBlockerMessage(),
      complete: hasCompleteAddress,
    },
    {
      icon: 'fa-hand-holding-usd',
      label: 'Balance at Check-In',
      description: ['digital', 'cash'].includes(balancePaymentMethod)
        ? `Pay remaining balance via ${balancePaymentMethod === 'digital' ? 'Digital' : 'Cash'}.`
        : 'Select Digital or Cash for your remaining balance at check-in.',
      complete: ['digital', 'cash'].includes(balancePaymentMethod),
    },
    {
      icon: 'fa-wallet',
      label: 'Choose Method',
      description: paymentMethod === 'gcash' ? 'GCash QR payment selected.' : 'Bank transfer request flow selected.',
      complete: true
    },
    {
      icon: 'fa-id-card',
      label: 'Valid ID on File',
      description: hasAccountValidId(profile)
        ? `${accountValidIdType} from your account.`
        : 'Upload your valid ID in Account settings.',
      complete: hasAccountValidId(profile)
    },
    {
      icon: 'fa-receipt',
      label: 'Upload Proof',
      description: bookingData.paymentProof
        ? 'Payment proof uploaded successfully.'
        : 'Upload your payment receipt screenshot.',
      complete: Boolean(bookingData.paymentProof)
    }
  ];

  const paymentNotes = [
    'You only need to pay the 50% down payment to reserve this date.',
    `The remaining balance of ₱${remainingBalance.toLocaleString()} is paid at the resort.`,
    'Cancellations will result in forfeiture of the down payment, unless the booking is rescheduled.'
  ];

  const renderPaymentNotesCard = () => (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
          <i className="fas fa-circle-info"></i>
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-900">Payment Notes</p>
          <p className="text-xs text-blue-700">Review these before confirming the booking.</p>
        </div>
      </div>
      <div className="space-y-2">
        {paymentNotes.map((note) => (
          <div key={note} className="flex items-start gap-2 text-sm text-blue-800">
            <i className="fas fa-check mt-1 text-[11px]"></i>
            <span>{note}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAccountValidIdCard = () => {
    const hasValidId = hasAccountValidId(profile);
    return (
      <div className="rounded-2xl border p-5 shadow-sm border-ocean-light/20 bg-white">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-textPrimary">Valid ID (from your account)</p>
            <p className="text-xs text-textSecondary mt-1">
              Used automatically for this reservation.
            </p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${hasValidId ? 'bg-green-100 text-green-600' : 'bg-ocean-ice text-ocean-mid'}`}>
            <i className={`fas ${hasValidId ? 'fa-check' : 'fa-id-card'}`}></i>
          </div>
        </div>

        <div className="relative">
          {hasValidId ? (
            <div>
              <button
                type="button"
                onClick={() => router.push('/account#photo-details')}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200/60 shadow-xs"
              >
                <i className="fas fa-id-card"></i> Manage Valid ID
              </button>
              <p className="mt-3 text-xs text-green-600 flex items-center gap-1.5">
                <i className="fas fa-check-circle"></i>
                On file — used for this reservation ({accountValidIdType})
              </p>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => router.push('/account#photo-details')}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg"
              >
                <i className="fas fa-upload"></i> Upload in Account
              </button>
              <p className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
                <i className="fas fa-exclamation-circle"></i>
                No valid ID on file. Required to confirm booking.
              </p>
            </div>
          )}
          {validIdError && (
            <p className="mt-2 text-xs text-rose-600 flex items-center gap-1.5 font-medium">
              <i className="fas fa-exclamation-triangle text-xs"></i> {validIdError}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderPaymentProofCard = (inputId) => {
    return (
      <div className={`rounded-2xl border p-5 shadow-sm border-ocean-light/20 bg-white`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-textPrimary">Proof of Payment</p>
            <p className="text-xs text-textSecondary mt-1">
              Upload the screenshot or image of your down payment receipt.
            </p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${bookingData.paymentProof ? 'bg-green-100 text-green-600' : 'bg-ocean-ice text-ocean-mid'}`}>
            <i className={`fas ${bookingData.paymentProof ? 'fa-check' : 'fa-upload'}`}></i>
          </div>
        </div>

        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handlePaymentProofUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            id={inputId}
            disabled={uploading}
          />
          <label
            htmlFor={inputId}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
              uploading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
            }`}
          >
            <i className="fas fa-upload"></i>
            {uploading ? 'Uploading...' : bookingData.paymentProof ? 'Replace Proof' : 'Upload Proof'}
          </label>
          {bookingData.paymentProof && (
            <p className="mt-3 text-xs text-green-600">
              <i className="fas fa-check-circle mr-1"></i>
              Payment proof uploaded
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderGcashPanel = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ocean-light/20 bg-gradient-to-br from-[#e9f7ff] via-white to-[#f4fbff] p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ocean-mid shadow-sm">
              <i className="fas fa-bolt"></i>
              Fastest Option
            </div>
            <h3 className="mt-4 text-xl font-semibold text-textPrimary">Pay with GCash</h3>
            <p className="mt-2 text-sm text-textSecondary">
              Scan the resort QR code, pay the exact down payment, then upload your receipt to finish this booking.
            </p>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Amount To Send</p>
              <p className="mt-1 text-3xl font-bold text-amber-700">₱{downPaymentAmount.toLocaleString()}</p>
              <p className="mt-1 text-xs text-amber-700">50% down payment required to secure the reservation.</p>
            </div>
          </div>

          <div className="flex justify-center">
            {paymentSettings.gcashQRCode ? (
              <div className="rounded-[1.75rem] bg-white p-4 shadow-[0_18px_40px_rgba(18,78,124,0.16)]">
                <div className="flex h-64 w-64 items-center justify-center overflow-hidden rounded-[1.25rem] border border-ocean-light/20 bg-white">
                  <img
                    src={paymentSettings.gcashQRCode}
                    alt="GCash QR Code"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-64 w-full max-w-xs items-center justify-center rounded-[1.75rem] border border-dashed border-amber-300 bg-amber-50 px-6 text-center text-sm text-amber-700">
                GCash QR code is not available right now. Please contact the resort before proceeding.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {renderAccountValidIdCard()}
        {renderPaymentProofCard('payment-proof-upload')}
      </div>
    </div>
  );

  const renderBankTransferPanel = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ocean-light/20 bg-gradient-to-br from-white via-[#f7fbff] to-[#eef7fb] p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-ocean-ice px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ocean-mid">
                <i className="fas fa-credit-card"></i>
                Manual Verification
              </div>
              <h3 className="mt-4 text-xl font-semibold text-textPrimary">Pay via QR Code or Bank Transfer</h3>
              <p className="mt-2 text-sm text-textSecondary">
                You may scan the QR code for instant payment or request alternative bank details. Please upload your transfer receipt once completed.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 lg:min-w-[220px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Amount To Send</p>
              <p className="mt-1 text-3xl font-bold text-amber-700">₱{downPaymentAmount.toLocaleString()}</p>
            </div>
          </div>

          {modalNotification && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              modalNotification.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}>
              <i className={`fas ${modalNotification.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2`}></i>
              {modalNotification.message}
            </div>
          )}

          {/* QR Code Section */}
          {visibleGuestQrBank && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <i className="fas fa-qrcode text-sm"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">QR Code Payment</p>
                  <p className="text-xs text-blue-700">Scan to pay via your banking app</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-60 w-60 items-center justify-center overflow-hidden rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
                  <img
                    src={visibleGuestQrBank.qrCodeUrl}
                    alt={`${visibleGuestQrBank.bankName} QR Code`}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-textPrimary">{visibleGuestQrBank.bankName}</p>
                  <p className="text-sm text-textSecondary">{visibleGuestQrBank.accountName}</p>
                </div>
              </div>
            </div>
          )}

          {/* Requested Bank Details Section */}
          {bankDetailsProvided ? (
            <div className="rounded-2xl border border-green-200 bg-green-50/80 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <i className="fas fa-check text-sm"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-900">Bank Details Provided</p>
                  <p className="text-xs text-green-700">Use these details for your bank transfer</p>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.16em] text-textSecondary">Bank Name</p>
                  <p className="mt-1 font-semibold text-textPrimary">{bankDetailsProvided.bankName}</p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.16em] text-textSecondary">Account Name</p>
                  <p className="mt-1 font-semibold text-textPrimary">{bankDetailsProvided.accountName}</p>
                </div>
                {bankDetailsProvided.accountNumber && bankDetailsProvided.accountNumber !== 'QR Code Provided' && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-textSecondary">Account Number</p>
                    <p className="mt-1 font-semibold font-mono text-textPrimary">{bankDetailsProvided.accountNumber}</p>
                  </div>
                )}
                {bankDetailsProvided.qrCodeUrl && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-textSecondary mb-3">QR Code</p>
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <img
                          src={bankDetailsProvided.qrCodeUrl}
                          alt="Bank QR Code"
                          className="h-full w-full object-contain"
                      />
                      </div>
                      <p className="text-xs text-textSecondary">Scan to pay</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : bankRequestSent ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
                <i className="fas fa-clock text-xl"></i>
              </div>
              <p className="text-base font-semibold text-blue-900">Request Sent</p>
              <p className="mt-2 text-sm text-blue-800">
                The resort has been notified. Bank details will appear here once they respond.
              </p>
            </div>
          ) : !showBankSelection ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-textPrimary">Choose your other preferred bank</p>
                <span className="text-xs text-textSecondary">{requestableBankAccounts.length} option(s)</span>
              </div>
              {requestableBankAccounts.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {requestableBankAccounts.map((bank) => (
                    <button
                      key={bank.id}
                      type="button"
                      onClick={() => {
                        setSelectedBankAccount(bank);
                        setShowBankSelection(true);
                      }}
                      className="rounded-2xl border border-ocean-light/20 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ocean-mid/40 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-textPrimary">{bank.bankName}</p>
                          <p className="mt-1 text-xs text-textSecondary">{bank.accountName}</p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ocean-ice text-ocean-mid">
                          <i className="fas fa-arrow-right"></i>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  No other bank accounts are available right now. 
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Selected Bank</p>
              <p className="mt-2 text-lg font-semibold text-textPrimary">{selectedBankAccount?.bankName}</p>
              <p className="text-sm text-textSecondary">{selectedBankAccount?.accountName}</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleNotifyResort}
                  disabled={notifyingResort}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {notifyingResort ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Sending Request...</>
                  ) : (
                    <><i className="fas fa-paper-plane mr-2"></i>Confirm And Send Request</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBankSelection(false)}
                  className="flex-1 rounded-xl border border-ocean-light/20 px-4 py-3 text-sm font-semibold text-textSecondary transition hover:bg-ocean-ice"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {renderAccountValidIdCard()}
        {renderPaymentProofCard('payment-proof-upload-bank')}
      </div>
    </div>
  );

  if (loading || authLoading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </GuestLayout>
    );
  }

  if (!dayTour) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <div className="text-center">
            <i className="fas fa-umbrella-beach text-5xl text-ocean-light/40 mb-4"></i>
            <h2 className="text-2xl font-bold text-textPrimary mb-2">Day Tour Unavailable</h2>
            <p className="text-textSecondary">No day tour package is currently available.</p>
            <button
              onClick={() => router.push('/day-tour')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-lg"
            >
              Go Back
            </button>
          </div>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white pt-28 sm:pt-32 pb-10">
        <div className="max-w-7xl w-full mx-auto px-4">
          <div className="flex flex-col gap-8">
            {/* Main Column - Booking Form */}
            <div className="w-full">
              {/* Progress Steps - Now only 3 steps */}
              <div className="mb-8 rounded-2xl border border-ocean-light/20 bg-white/70 px-3 py-4 sm:px-5">
                <div className="relative">
                  <div className="absolute left-[15%] right-[15%] top-5 h-0.5 bg-gray-200"></div>
                  <div className="absolute left-[15%] right-[15%] top-5 h-0.5 bg-transparent">
                    <div
                      className="h-full bg-ocean-mid transition-all duration-300"
                      style={{ width: `${Math.max(0, ((step - 1) / 2) * 100)}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 1, label: 'Guests' },
                      { id: 2, label: 'Payment' },
                      { id: 3, label: 'Confirmation' }
                    ].map((item) => {
                      const isCurrent = step === item.id;
                      const isDone = step > item.id || (item.id === 3 && step === 3);
                      return (
                        <div key={item.id} className="relative z-10 flex flex-col items-center">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border transition-all duration-300 ${
                              isCurrent
                                ? 'bg-ocean-mid text-white border-ocean-mid shadow-[0_6px_14px_rgba(33,105,243,0.28)]'
                                : isDone
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {isDone ? <i className="fas fa-check text-xs"></i> : item.id}
                          </div>
                          <span className={`mt-2 text-[12px] font-medium ${isCurrent ? 'text-textPrimary' : 'text-textSecondary'}`}>
                            {item.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Step 1: Guest Count */}
              {step === 1 && (
                <div className="bg-white rounded-2xl shadow-lg border border-ocean-light/15 p-6 sm:p-8">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-textPrimary">Number of Guests</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[80%_20%] gap-4">
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-ocean-light/20 bg-gradient-to-br from-white to-ocean-ice/35 p-4">
                          <label className="text-xs uppercase tracking-[0.16em] font-bold text-textSecondary">Adults (16+)</label>
                          <div className="mt-2 relative">
                            <i className="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-ocean-mid text-sm"></i>
                            <input
                              type="number"
                              min="1"
                              value={bookingData.adults}
                              onChange={(e) => handleGuestChange('adults', e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="w-full h-12 pl-10 pr-3 rounded-xl border border-ocean-light/25 bg-white text-lg font-semibold text-textPrimary focus:outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-light/30"
                            />
                          </div>
                        </div>

                        <div className="rounded-xl border border-ocean-light/20 bg-gradient-to-br from-white to-ocean-ice/35 p-4">
                          <label className="text-xs uppercase tracking-[0.16em] font-bold text-textSecondary">Kids (15 and below)</label>
                          <div className="mt-2 relative">
                            <i className="fas fa-child absolute left-3 top-1/2 -translate-y-1/2 text-ocean-mid text-sm"></i>
                            <input
                              type="number"
                              min="0"
                              value={bookingData.kids}
                              onChange={(e) => handleGuestChange('kids', e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="w-full h-12 pl-10 pr-3 rounded-xl border border-ocean-light/25 bg-white text-lg font-semibold text-textPrimary focus:outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-light/30"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-ocean-light/20 bg-gradient-to-r from-ocean-ice/80 to-blue-white/80 p-4 sm:p-5">
                        <h3 className="text-base font-semibold text-textPrimary mb-3">Booking Summary</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-lg bg-white/80 border border-ocean-light/15 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-textSecondary">Total Guests</p>
                            <p className="text-xl font-bold text-textPrimary mt-1">{totalGuests}</p>
                          </div>
                          <div className="rounded-lg bg-white/80 border border-ocean-light/15 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-textSecondary">Total Price</p>
                            <p className="text-xl font-bold text-ocean-mid mt-1">₱{totalPrice.toLocaleString()}</p>
                          </div>
                          <div className="rounded-lg bg-white/80 border border-ocean-light/15 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-textSecondary">Down Payment</p>
                            <p className="text-xl font-bold text-amber-600 mt-1">₱{downPaymentAmount.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-ocean-light/20 bg-gradient-to-br from-white to-ocean-ice/35 p-4 h-full">
                      <label className="text-xs uppercase tracking-[0.16em] font-bold text-textSecondary">Special Request (Optional)</label>
                      <div className="mt-2">
                        <textarea
                          value={bookingData.specialRequest}
                          onChange={(e) => setBookingData(prev => ({ ...prev, specialRequest: e.target.value }))}
                          rows={2}
                          placeholder="e.g., request to add additional guests, etc."
                          className="w-full px-3 py-2.5 h-46 rounded-xl border border-ocean-light/25 bg-white text-sm text-textPrimary focus:outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-light/30 resize-none overflow-hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {errors.guests && (
                    <p className="text-[12px] text-rose-600/80 mt-3">{errors.guests}</p>
                  )}

                  <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 h-12 border border-ocean-light/25 rounded-xl text-textSecondary font-medium bg-white hover:bg-ocean-ice transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      disabled={
                        bookingData.adults === '' ||
                        bookingData.kids === '' ||
                        adultsCount < 1 ||
                        totalGuests < 1 ||
                        totalGuests > maxAllowedGuests ||
                        (remainingCapacity !== Infinity && totalGuests > remainingCapacity)
                      }
                      className={`flex-1 h-12 rounded-xl font-semibold transition-all duration-300 ${
                        bookingData.adults !== '' && bookingData.kids !== '' && adultsCount >= 1 && totalGuests >= 1 && totalGuests <= maxAllowedGuests && (remainingCapacity === Infinity || totalGuests <= remainingCapacity) && user
                          ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Continue to Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Payment (formerly step 3) */}
              {step === 2 && (
                <div className="rounded-[2rem] border border-ocean-light/20 bg-white p-5 shadow-lg sm:p-8">
                  <div className="overflow-hidden rounded-[1.75rem] border border-ocean-light/20 bg-[radial-gradient(circle_at_top_left,_rgba(103,183,255,0.22),_transparent_32%),linear-gradient(135deg,_rgba(244,251,255,0.98),_rgba(255,255,255,0.98))] p-6">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                      <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-mid shadow-sm">
                          <i className="fas fa-lock"></i>
                          Secure Payment
                        </div>
                        <h2 className="mt-4 text-3xl font-bold text-textPrimary">Complete Your Down Payment</h2>
                        <p className="mt-2 text-sm leading-6 text-textSecondary">
                          Choose how you want to pay, upload your ID and receipt, then confirm the reservation once everything is complete.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px] xl:max-w-[460px]">
                        <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Total Price</p>
                          <p className="mt-2 text-2xl font-bold text-textPrimary">₱{totalPrice.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700">Pay Now</p>
                          <p className="mt-2 text-2xl font-bold text-amber-700">₱{downPaymentAmount.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Remaining On Arrival</p>
                          <p className="mt-2 text-xl font-bold text-textPrimary">₱{remainingBalance.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Booking For</p>
                          <p className="mt-2 text-xl font-bold text-textPrimary">{totalGuests} guest{totalGuests === 1 ? '' : 's'}</p>
                          <p className="mt-1 text-xs text-textSecondary">{selectedDate ? formatDate(selectedDate) : ''}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Guest profile from account */}
                  <div className="mt-6 mb-5 p-4 bg-blue-50/30 rounded-xl border border-blue-100/80 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-blue-100/60 mb-3">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-user-circle text-blue-600 text-lg"></i>
                        <span className="text-sm font-semibold text-gray-800">
                          Booking For: <span className="font-bold text-blue-900">{userDisplayName || '—'}</span>
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
                    {!hasCompleteAddress && (
                      <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <i className="fas fa-map-marker-alt mr-1.5" />
                        Complete your home address in Account → Profile Details before you can confirm this booking.
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-envelope text-blue-500/70 w-4 text-center"></i>
                        <span className="font-medium text-gray-500">Email:</span>
                        <span className="text-gray-800 break-all">{userEmail || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <i className="fas fa-phone-alt text-blue-500/70 w-4 text-center"></i>
                        <span className="font-medium text-gray-500">Mobile Number:</span>
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

                  <div className="mt-6 mb-6">
                    <label className="mb-3 block text-xs font-bold uppercase tracking-[0.18em] text-textSecondary">Select Payment Method</label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('gcash')}
                        className={`rounded-[1.5rem] border p-5 text-left transition-all duration-200 ${
                          paymentMethod === 'gcash'
                            ? 'border-ocean-mid bg-ocean-ice shadow-[0_14px_32px_rgba(33,105,243,0.14)]'
                            : 'border-ocean-light/20 bg-white hover:-translate-y-0.5 hover:border-ocean-light hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${paymentMethod === 'gcash' ? 'bg-ocean-mid text-white' : 'bg-ocean-ice text-ocean-mid'}`}>
                              <i className="fas fa-wallet text-base"></i>
                            </div>
                            <div>
                              <p className={`text-base font-semibold ${paymentMethod === 'gcash' ? 'text-ocean-mid' : 'text-textPrimary'}`}>GCash</p>
                              <p className="mt-1 text-sm text-textSecondary">Scan the QR code, pay instantly, then upload your receipt.</p>
                            </div>
                          </div>
                          {paymentMethod === 'gcash' && <i className="fas fa-check-circle text-ocean-mid"></i>}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`rounded-[1.5rem] border p-5 text-left transition-all duration-200 ${
                          paymentMethod === 'bank_transfer'
                            ? 'border-ocean-mid bg-ocean-ice shadow-[0_14px_32px_rgba(33,105,243,0.14)]'
                            : 'border-ocean-light/20 bg-white hover:-translate-y-0.5 hover:border-ocean-light hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${paymentMethod === 'bank_transfer' ? 'bg-ocean-mid text-white' : 'bg-ocean-ice text-ocean-mid'}`}>
                              <i className="fas fa-credit-card text-base"></i>
                            </div>
                            <div>
                              <p className={`text-base font-semibold ${paymentMethod === 'bank_transfer' ? 'text-ocean-mid' : 'text-textPrimary'}`}>Bank Transfer</p>
                              <p className="mt-1 text-sm text-textSecondary">Request the resort account details before uploading proof.</p>
                            </div>
                          </div>
                          {paymentMethod === 'bank_transfer' && <i className="fas fa-check-circle text-ocean-mid"></i>}
                        </div>
                      </button>
                    </div>
                  </div>
                  
                  {paymentMethod === 'gcash' && renderGcashPanel()}
                  {paymentMethod === 'bank_transfer' && renderBankTransferPanel()}

                   <div className="mt-6 mb-6">
  <label className="mb-2 block text-xs font-semibold text-textPrimary sm:text-sm">
    How would you like to pay your remaining balance upon check-in?
  </label>

  <div className="grid gap-3 md:grid-cols-2">
    {[
      {
        value: 'digital',
        label: 'Digital',
        icon: 'fa-mobile-alt',
        description: 'Pay the remaining balance digitally at check-in.',
      },
      {
        value: 'cash',
        label: 'Cash',
        icon: 'fa-money-bill-wave',
        description: 'Pay the remaining balance in cash at check-in.',
      },
    ].map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => setBalancePaymentMethod(option.value)}
        className={`rounded-[1.5rem] border p-4 text-left transition-all duration-200 ${
          balancePaymentMethod === option.value
            ? 'border-ocean-mid bg-ocean-ice shadow-[0_14px_32px_rgba(33,105,243,0.14)]'
            : 'border-ocean-light/20 bg-white hover:-translate-y-0.5 hover:border-ocean-light hover:shadow-md'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span
              className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                balancePaymentMethod === option.value
                  ? 'border-ocean-mid'
                  : 'border-gray-300'
              }`}
            >
              {balancePaymentMethod === option.value && (
                <span className="h-1.5 w-1.5 rounded-full bg-ocean-mid" />
              )}
            </span>

            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                balancePaymentMethod === option.value
                  ? 'bg-ocean-mid text-white'
                  : 'bg-ocean-ice text-ocean-mid'
              }`}
            >
              <i className={`fas ${option.icon} text-sm`} />
            </div>

            <div>
              <p
                className={`text-sm font-semibold ${
                  balancePaymentMethod === option.value
                    ? 'text-ocean-mid'
                    : 'text-textPrimary'
                }`}
              >
                {option.label}
              </p>

              <p className="mt-0.5 text-xs leading-snug text-textSecondary">
                {option.description}
              </p>
            </div>
          </div>

          {balancePaymentMethod === option.value && (
            <i className="fas fa-check-circle text-sm text-ocean-mid" />
          )}
        </div>
      </button>
    ))}
  </div>
</div>
                  
                  <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-[1.75rem] border border-ocean-light/20 bg-[#f7fbff] p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-textPrimary">Payment Checklist</p>
                          <p className="mt-1 text-xs text-textSecondary">Finish all items below before confirming.</p>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${canSubmitPayment ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {canSubmitPayment ? 'Ready' : 'In Progress'}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {paymentChecklist.map((item) => (
                          <div key={item.label} className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-sm">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.complete ? 'bg-green-100 text-green-600' : 'bg-ocean-ice text-ocean-mid'}`}>
                              <i className={`fas ${item.complete ? 'fa-check' : item.icon}`}></i>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-textPrimary">{item.label}</p>
                              <p className="mt-1 text-xs leading-5 text-textSecondary">{item.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderPaymentNotesCard()}
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 py-3 border border-ocean-light/20 rounded-xl text-textSecondary font-medium hover:bg-ocean-ice transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleSubmitBooking}
                      disabled={!canSubmitPayment}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                        canSubmitPayment
                          ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
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
                <div className="rounded-[2rem] bg-white p-6 shadow-lg sm:p-8">
                  <div className="mx-auto max-w-3xl">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
                        <i className="fas fa-hourglass-half text-3xl text-amber-600"></i>
                      </div>
                      <h2 className="text-2xl font-bold text-textPrimary mb-2">Reservation Received</h2>
                      <p className="text-textSecondary mb-6">
                        Your day tour reservation is pending admin confirmation. We sent your booking details to {user?.email}. Once the resort confirms your reservation, you will receive a separate confirmation email. 
                      </p>
                    </div>

                    <div className="mx-auto mb-6 max-w-2xl rounded-[1.75rem] border border-ocean-light/20 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4 border-b border-dashed border-ocean-light/30 pb-4">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-mid">Sandy Feet Day Tour</p>
                          <h3 className="mt-2 text-xl font-bold text-textPrimary">Reservation Receipt</h3>
                          <p className="mt-1 text-sm text-textSecondary">{selectedDate ? formatDate(selectedDate) : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Reference</p>
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <strong className="text-sm font-mono text-textPrimary">{generatedBookingId}</strong>
                            <button
                              onClick={() => copyToClipboard(generatedBookingId)}
                              className="rounded-lg bg-white p-1.5 text-ocean-mid transition hover:bg-ocean-light/10"
                              title="Copy to clipboard"
                            >
                              <i className="fas fa-copy"></i>
                            </button>
                          </div>
                          {copiedMessage && (
                            <p className="mt-1 text-xs text-green-600">
                              <i className="fas fa-check-circle mr-1"></i>Copied!
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-6 border-b border-dashed border-ocean-light/30 py-5 md:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Guest</p>
                          <p className="text-base font-semibold text-textPrimary">
                            {profile?.firstName || ''} {profile?.lastName || ''}
                          </p>
                          <p className="text-sm text-textSecondary">{user?.email}</p>
                          <p className="text-sm text-textSecondary">{profile?.mobileNumber || ''}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Payment Method</p>
                          <p className="text-base font-semibold text-textPrimary">{paymentMethod === 'gcash' ? 'GCash' : 'Bank Transfer'}</p>
                          <p className="text-sm text-textSecondary">Reservation Status: Pending admin confirmation</p>
                          <p className="text-sm text-textSecondary">Payment Status: Down payment received</p>
                          <p className="text-sm text-textSecondary">Valid ID: {accountValidIdType || 'Submitted'}</p>
                        </div>
                      </div>

                      <div className="space-y-3 py-5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-textSecondary">Adults</span>
                          <span className="font-semibold text-textPrimary">{adultsCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-textSecondary">Kids</span>
                          <span className="font-semibold text-textPrimary">{kidsCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-textSecondary">Total Guests</span>
                          <span className="font-semibold text-textPrimary">{totalGuests}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-dashed border-ocean-light/30 pt-3 text-sm">
                          <span className="text-textSecondary">Total Price</span>
                          <span className="font-semibold text-textPrimary">₱{totalPrice.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-textSecondary">Down Payment Paid</span>
                          <span className="font-bold text-amber-700">₱{downPaymentAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-textSecondary">Remaining Balance</span>
                          <span className="font-semibold text-textPrimary">₱{remainingBalance.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <i className="fas fa-info-circle mr-2"></i>
                        You can track your reservation through your account. Remaining balance is payable at the resort. Cancellations will result in forfeiture of the down payment, unless the booking is rescheduled.
                      </div>
                      {qrToken && (
                        <div className="mt-6 mb-6 p-4 bg-white rounded-xl border-2 border-blue-200">
                          <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Check-in QR Code</h3>
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
                          <p className="text-xs text-gray-500 mt-3 text-center">
                            Staff will scan this QR code at the resort.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-3">
                      <button
                        onClick={() => router.push('/day-tour')}
                        className="flex-1 py-3 border border-ocean-light/20 rounded-xl text-textSecondary font-medium hover:bg-ocean-ice transition"
                      >
                        Back to Day Tour Page
                      </button>
                      <button
                        onClick={() => router.push('/')}
                        className="flex-1 py-3 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-xl font-medium hover:shadow-lg transition"
                      >
                        Go to Home Page
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Guest Auth Modal */}
      <GuestAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        prefillEmail={user?.email || ''}
      />

      <ChatBot />
    </GuestLayout>
  );
}

export default function DayTourBookingPage() {
  return (
    <Suspense
      fallback={
        // Removed GuestLayout wrapper – just a plain loading indicator
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      }
    >
      <DayTourBookingContent />
    </Suspense>
  );
}