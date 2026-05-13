// app/day-tour/booking/page.js
'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { uploadImage } from '@/lib/cloudinary';
import { sendDayTourPendingEmail } from '@/lib/emailService';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';

// Storage key for persisting booking data
const STORAGE_KEY = 'daytour_booking_data';
const STEP_STORAGE_KEY = 'daytour_booking_step';

const resolveAddressPart = (address, key) => {
  if (!address) return '';
  if (typeof address === 'string') {
    return key === 'street' ? address : '';
  }
  return address[key] || '';
};

function DayTourBookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile } = useGuestAuth();
  const HARD_MAX_PACKS = 38;
  const LEAD_TIME_DAYS = 2;
  const dateParam = searchParams.get('date');
  const adultsParam = searchParams.get('adults');
  const kidsParam = searchParams.get('kids');
  
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
  const [bankRequestSent, setBankRequestSent] = useState(false);
  const [bankRequestId, setBankRequestId] = useState(null);
  const [bankDetailsProvided, setBankDetailsProvided] = useState(null);
  const [notifyingResort, setNotifyingResort] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);
  const [showBankSelection, setShowBankSelection] = useState(false);
  const [requestedBankInfo, setRequestedBankInfo] = useState(null);
  const [modalNotification, setModalNotification] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [guestAccount, setGuestAccount] = useState(null);
  const hasAuthenticatedRef = useRef(false);
  const stepRef = useRef(step);
  
  const initialAdultsRaw = parseInt(adultsParam) || 1;
  const initialKidsRaw = parseInt(kidsParam) || 0;
  const initialAdults = Math.max(1, Math.min(HARD_MAX_PACKS, initialAdultsRaw));
  const initialKids = Math.max(0, Math.min(HARD_MAX_PACKS - initialAdults, initialKidsRaw));

  const [bookingData, setBookingData] = useState({
    adults: String(initialAdults),
    kids: String(initialKids),
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressStreet: '',
    addressBarangay: '',
    addressCity: '',
    addressProvince: '',
    addressPostalCode: '',
    paymentProof: null,
    validIdType: '',
    validIdImage: null
  });
  
  const [errors, setErrors] = useState({});

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const cancelBookingFlow = () => {
    setGuestAccount(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STEP_STORAGE_KEY);
    } catch {
      // ignore storage cleanup errors
    }
    router.replace('/day-tour');
  };

  const [showValidIdModal, setShowValidIdModal] = useState(false);
  const [tempValidIdType, setTempValidIdType] = useState('Passport');
  const [tempValidIdImage, setTempValidIdImage] = useState(null);
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
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile) return;

    setBookingData((prev) => ({
      ...prev,
      phone: prev.phone || profile.mobileNumber || '',
      addressStreet: prev.addressStreet || resolveAddressPart(profile.address, 'street'),
      addressBarangay: prev.addressBarangay || resolveAddressPart(profile.address, 'barangay'),
      addressCity: prev.addressCity || resolveAddressPart(profile.address, 'city'),
      addressProvince: prev.addressProvince || resolveAddressPart(profile.address, 'province'),
      addressPostalCode: prev.addressPostalCode || resolveAddressPart(profile.address, 'postalCode')
    }));
  }, [profile]);

  // Load persisted data from localStorage on mount
  useEffect(() => {
    try {
      // Load persisted step
      const savedStep = localStorage.getItem(STEP_STORAGE_KEY);
      if (savedStep && !isNaN(parseInt(savedStep))) {
        const stepNum = parseInt(savedStep);
        if (stepNum >= 1 && stepNum <= 4) {
          setStep(stepNum);
        }
      }
      
      // Load persisted booking data
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        setBookingData(prev => ({
          ...prev,
          ...parsed,
          // Don't override URL params for adults/kids if they exist
          adults: adultsParam ? prev.adults : (parsed.adults || prev.adults),
          kids: kidsParam ? prev.kids : (parsed.kids || prev.kids)
        }));
        
        // Load payment method
        if (parsed.paymentMethod) {
          setPaymentMethod(parsed.paymentMethod);
        }
        
        // Load bank request state if needed
        if (parsed.bankRequestSent) {
          setBankRequestSent(parsed.bankRequestSent);
        }
        if (parsed.bankRequestId) {
          setBankRequestId(parsed.bankRequestId);
        }
        if (parsed.bankDetailsProvided) {
          setBankDetailsProvided(parsed.bankDetailsProvided);
        }
      }
    } catch (error) {
      console.error('Error loading persisted booking data:', error);
    }
  }, [adultsParam, kidsParam]);

  // Save booking data to localStorage whenever it changes
  useEffect(() => {
    try {
      const dataToSave = {
        adults: bookingData.adults,
        kids: bookingData.kids,
        firstName: bookingData.firstName,
        lastName: bookingData.lastName,
        email: bookingData.email,
        phone: bookingData.phone,
        addressStreet: bookingData.addressStreet,
        addressBarangay: bookingData.addressBarangay,
        addressCity: bookingData.addressCity,
        addressProvince: bookingData.addressProvince,
        addressPostalCode: bookingData.addressPostalCode,
        paymentProof: bookingData.paymentProof,
        validIdType: bookingData.validIdType,
        validIdImage: bookingData.validIdImage,
        paymentMethod: paymentMethod,
        bankRequestSent: bankRequestSent,
        bankRequestId: bankRequestId,
        bankDetailsProvided: bankDetailsProvided
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving booking data to localStorage:', error);
    }
  }, [bookingData, paymentMethod, bankRequestSent, bankRequestId, bankDetailsProvided]);

  // Save step to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STEP_STORAGE_KEY, String(step));
    } catch (error) {
      console.error('Error saving step to localStorage:', error);
    }
  }, [step]);

  // Clear persisted data when booking is completed (step 4)
  useEffect(() => {
    if (step === 4) {
      // Clear the persisted data after successful completion
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

      // Re-validate guests if capacity changed
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
  const canSubmitPayment = Boolean(
    bookingData.paymentProof &&
    bookingData.validIdImage &&
    !submitting
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

  const validateContactInfo = () => {
    const newErrors = {};
    
    if (!bookingData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!bookingData.lastName.trim()) newErrors.lastName = 'Last name is required';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!bookingData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(bookingData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    const phoneRegex = /^\d{11}$/;
    if (!bookingData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!phoneRegex.test(bookingData.phone)) {
      newErrors.phone = 'Phone number must be exactly 11 digits';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

  const handleInputChange = (field, value) => {
    const nextValue = field === 'phone' ? String(value).replace(/\D/g, '').slice(0, 11) : value;
    setBookingData(prev => ({ ...prev, [field]: nextValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (validateGuests()) {
        setStep(2);
      }
    } else if (step === 2) {
      if (validateContactInfo()) {
        setStep(3);
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

  const handleValidIdFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setValidIdUploading(true);
    try {
      const cloudinaryUrl = await uploadImage(file);
      setTempValidIdImage(cloudinaryUrl);
    } catch (error) {
      console.error('Error uploading valid ID to Cloudinary:', error);
      setModalNotification({ message: 'Failed to upload valid ID. Please try again.', type: 'error' });
    } finally {
      setValidIdUploading(false);
    }
  };

  const handleSaveValidId = () => {
    if (!tempValidIdImage || !tempValidIdType) return;
    setBookingData(prev => ({
      ...prev,
      validIdType: tempValidIdType,
      validIdImage: tempValidIdImage
    }));
    setShowValidIdModal(false);
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
        guestUid: guestAccount?.uid || null,
        guestName: `${bookingData.firstName} ${bookingData.lastName}`,
        guestEmail: bookingData.email,
        guestPhone: bookingData.phone,
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

  const handleSubmitBooking = async () => {
    if (!selectedDate || isDateBeforeLeadTime(selectedDate)) {
      alert('Walk-ins or same-day bookings are not allowed. Please choose a later date.');
      router.push('/day-tour');
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
        guestUid: guestAccount?.uid || null,
        guestAuthProvider: guestAccount?.uid ? 'google' : null,
        dayTourId: dayTour.id,
        selectedDate: dateKey,
        selectedDateISO: selectedDate.toISOString(),
        adults: adultsCount,
        kids: kidsCount,
        totalGuests: totalGuests,
        totalPrice: totalPrice,
        downPayment: downPaymentAmount,
        remainingBalance: totalPrice - downPaymentAmount,
        guestInfo: {
          firstName: bookingData.firstName,
          lastName: bookingData.lastName,
          email: bookingData.email,
          phone: bookingData.phone,
          address: {
            street: bookingData.addressStreet || '',
            barangay: bookingData.addressBarangay || '',
            city: bookingData.addressCity || '',
            province: bookingData.addressProvince || '',
            postalCode: bookingData.addressPostalCode || ''
          }
        },
        status: 'pending',
        paymentMethod: paymentMethod,
        paymentProof: bookingData.paymentProof,
        validIdType: bookingData.validIdType || null,
        validIdImage: bookingData.validIdImage || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        type: 'daytour'
      };
      
      if (bankDetailsProvided) {
        booking.bankDetailsProvided = bankDetailsProvided;
      }
      
      await addDoc(collection(db, 'dayTourBookings'), booking);

      const emailResult = await sendDayTourPendingEmail(booking);
      if (!emailResult?.success) {
        console.warn('Failed to send pending day tour email:', emailResult?.error);
      }

      setStep(4);
      
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Failed to create booking. Please try again: ' + error.message);
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
      icon: 'fa-wallet',
      label: 'Choose Method',
      description: paymentMethod === 'gcash' ? 'GCash QR payment selected.' : 'Bank transfer request flow selected.',
      complete: true
    },
    {
      icon: 'fa-id-card',
      label: 'Upload Valid ID',
      description: bookingData.validIdImage ? `${bookingData.validIdType || 'Valid ID'} uploaded.` : 'Required before confirmation.',
      complete: Boolean(bookingData.validIdImage)
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
    'If you cancel your reservation, the resort retains 50% of the down payment.'
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

  const renderValidIdCard = () => (
    <div className="rounded-2xl border border-ocean-light/20 bg-gradient-to-br from-white to-ocean-ice/40 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-textPrimary">Valid ID</p>
          <p className="text-xs text-textSecondary mt-1">Full name must match the booking details. Front image only.</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${bookingData.validIdImage ? 'bg-green-100 text-green-600' : 'bg-ocean-ice text-ocean-mid'}`}>
          <i className={`fas ${bookingData.validIdImage ? 'fa-check' : 'fa-id-card'}`}></i>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setTempValidIdType(bookingData.validIdType || 'Passport');
          setTempValidIdImage(bookingData.validIdImage || null);
          setShowValidIdModal(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-ocean-light/40 bg-white px-4 py-2.5 text-sm font-medium text-textPrimary transition-all duration-200 hover:border-ocean-mid/50 hover:bg-ocean-ice"
      >
        <i className="fas fa-cloud-upload-alt text-ocean-mid"></i>
        {bookingData.validIdImage ? 'Update Valid ID' : 'Upload Valid ID'}
      </button>

      {bookingData.validIdType && (
        <p className="mt-3 text-xs text-ocean-mid">
          Selected ID: <span className="font-semibold">{bookingData.validIdType}</span>
        </p>
      )}
      {bookingData.validIdImage && (
        <p className="mt-1 text-xs text-green-600">
          <i className="fas fa-check-circle mr-1"></i>
          Valid ID uploaded
        </p>
      )}
    </div>
  );

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
        {renderValidIdCard()}
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
                <i className="fas fa-building-columns"></i>
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

          {/* QR Code Section - Separate Section */}
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
                <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
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

          {/* Requested Bank Details Section - Separate Section */}
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
        {renderValidIdCard()}
        {renderPaymentProofCard('payment-proof-upload-bank')}
      </div>
    </div>
  );

  if (loading) {
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
              {/* Progress Steps */}
              <div className="mb-8 rounded-2xl border border-ocean-light/20 bg-white/70 px-3 py-4 sm:px-5">
                <div className="relative">
                  <div className="absolute left-[12%] right-[12%] top-5 h-0.5 bg-gray-200"></div>
                  <div className="absolute left-[12%] right-[12%] top-5 h-0.5 bg-transparent">
                    <div
                      className="h-full bg-ocean-mid transition-all duration-300"
                      style={{ width: `${Math.max(0, ((step - 1) / 3) * 100)}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((s) => {
                      const label = s === 1 ? 'Guests' : s === 2 ? 'Details' : s === 3 ? 'Payment' : 'Confirmation';
                      const isCurrent = step === s;
                      const isDone = step > s || (s === 4 && step === 4);

                      return (
                        <div key={s} className="relative z-10 flex flex-col items-center">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border transition-all duration-300 ${
                              isCurrent
                                ? 'bg-ocean-mid text-white border-ocean-mid shadow-[0_6px_14px_rgba(33,105,243,0.28)]'
                                : isDone
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {isDone ? <i className="fas fa-check text-xs"></i> : s}
                          </div>
                          <span className={`mt-2 text-[12px] font-medium ${isCurrent ? 'text-textPrimary' : 'text-textSecondary'}`}>
                            {label}
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
                    <h2 className="text-2xl font-bold text-textPrimary">Step 1: Number of Guests</h2>
                    <p className="text-sm text-textSecondary mt-1">Set your party size first so we can validate available capacity.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-ocean-light/20 bg-gradient-to-br from-white to-ocean-ice/35 p-4">
                      <label className="text-xs uppercase tracking-[0.16em] font-bold text-textSecondary">Adults (16+) *</label>
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

                  {errors.guests && (
                    <p className="text-[12px] text-rose-600/80 mt-3">{errors.guests}</p>
                  )}

                  <div className="mt-5 rounded-xl border border-ocean-light/20 bg-gradient-to-r from-ocean-ice/80 to-blue-white/80 p-4 sm:p-5">
                    <h3 className="text-base font-semibold text-textPrimary mb-3">Booking Summary</h3>
                    <div className="grid grid-cols-3 gap-3">
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

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 h-12 border border-ocean-light/25 rounded-xl text-textSecondary font-medium bg-white hover:bg-ocean-ice transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      disabled={bookingData.adults === '' || bookingData.kids === '' || adultsCount < 1 || totalGuests < 1 || totalGuests > maxAllowedGuests || (remainingCapacity !== Infinity && totalGuests > remainingCapacity)}
                      className={`flex-1 h-12 rounded-xl font-semibold transition-all duration-300 ${
                        bookingData.adults !== '' && bookingData.kids !== '' && adultsCount >= 1 && totalGuests >= 1 && totalGuests <= maxAllowedGuests && (remainingCapacity === Infinity || totalGuests <= remainingCapacity)
                          ? 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Continue to Details
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
                      {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Last Name *</label>
                      <input
                        type="text"
                        value={bookingData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        className={`w-full px-4 py-2 border ${errors.lastName ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Email Address *</label>
                      <input
                        type="email"
                        value={bookingData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`w-full px-4 py-2 border ${errors.email ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Phone Number * (11 digits)</label>
                      <input
                        type="tel"
                        value={bookingData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        maxLength={11}
                        inputMode="numeric"
                        placeholder="09123456789"
                        className={`w-full px-4 py-2 border ${errors.phone ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Street / House No.</label>
                      <input
                        type="text"
                        value={bookingData.addressStreet}
                        onChange={(e) => handleInputChange('addressStreet', e.target.value)}
                        className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-textPrimary mb-2">Barangay</label>
                        <input
                          type="text"
                          value={bookingData.addressBarangay}
                          onChange={(e) => handleInputChange('addressBarangay', e.target.value)}
                          className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-textPrimary mb-2">City / Municipality</label>
                        <input
                          type="text"
                          value={bookingData.addressCity}
                          onChange={(e) => handleInputChange('addressCity', e.target.value)}
                          className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-textPrimary mb-2">Province</label>
                        <input
                          type="text"
                          value={bookingData.addressProvince}
                          onChange={(e) => handleInputChange('addressProvince', e.target.value)}
                          className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-textPrimary mb-2">Postal Code</label>
                        <input
                          type="text"
                          value={bookingData.addressPostalCode}
                          onChange={(e) => handleInputChange('addressPostalCode', e.target.value)}
                          className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                        />
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
                      className="flex-1 py-3 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                    >
                      Continue to Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment */}
              {step === 3 && (
                <div className="rounded-[2rem] border border-ocean-light/20 bg-white p-5 shadow-lg sm:p-8">
                  <div className="overflow-hidden rounded-[1.75rem] border border-ocean-light/20 bg-[radial-gradient(circle_at_top_left,_rgba(103,183,255,0.22),_transparent_32%),linear-gradient(135deg,_rgba(244,251,255,0.98),_rgba(255,255,255,0.98))] p-6">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                      <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-mid shadow-sm">
                          <i className="fas fa-lock"></i>
                          Secure Payment
                        </div>
                        <h2 className="mt-4 text-3xl font-bold text-textPrimary">Step 3: Complete Your Down Payment</h2>
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
                              <i className="fas fa-building-columns text-base"></i>
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

              {/* Step 4: Confirmation */}
              {step === 4 && (
                <div className="rounded-[2rem] bg-white p-6 shadow-lg sm:p-8">
                  <div className="mx-auto max-w-3xl">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
                        <i className="fas fa-hourglass-half text-3xl text-amber-600"></i>
                      </div>
                      <h2 className="text-2xl font-bold text-textPrimary mb-2">Reservation Received</h2>
                      <p className="text-textSecondary mb-6">
                        Your day tour reservation is pending admin confirmation. We sent your tracker details to {bookingData.email}. Once the resort confirms your reservation, you will receive a separate confirmation email.
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
                          <p className="text-base font-semibold text-textPrimary">{bookingData.firstName} {bookingData.lastName}</p>
                          <p className="text-sm text-textSecondary">{bookingData.email}</p>
                          <p className="text-sm text-textSecondary">{bookingData.phone}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-textSecondary">Payment Method</p>
                          <p className="text-base font-semibold text-textPrimary">{paymentMethod === 'gcash' ? 'GCash' : 'Bank Transfer'}</p>
                          <p className="text-sm text-textSecondary">Reservation Status: Pending admin confirmation</p>
                          <p className="text-sm text-textSecondary">Payment Status: Down payment received</p>
                          <p className="text-sm text-textSecondary">Valid ID: {bookingData.validIdType || 'Submitted'}</p>
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
                        Use your reference number in the Reservation Tracker while this booking is pending. Remaining balance is payable at the resort upon arrival.
                      </div>
                    </div>

                    <div className="flex gap-3">
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
              </p>

              <div className="pt-1 border-t border-ocean-light/20">
                <label className="block text-sm font-semibold text-textPrimary mb-2">Valid ID Image (front only)</label>
                <div className="relative mb-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleValidIdFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="valid-id-upload-daytour"
                    disabled={validIdUploading}
                  />
                  <label
                    htmlFor="valid-id-upload-daytour"
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-300 cursor-pointer ${
                      validIdUploading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                    }`}
                  >
                    <i className="fas fa-upload"></i>
                    {validIdUploading ? 'Uploading...' : tempValidIdImage ? 'Change Image' : 'Choose File'}
                  </label>
                </div>

                <div className="mt-2">
                  <p className="text-xs font-semibold text-textPrimary mb-1">Preview</p>
                  <div className="h-64 border border-ocean-light/30 rounded-lg overflow-hidden bg-ocean-ice flex items-center justify-center">
                    {tempValidIdImage ? (
                      <img
                        src={tempValidIdImage}
                        alt="Valid ID Preview"
                        className="w-full h-full object-contain bg-white"
                      />
                    ) : (
                      <p className="text-xs text-textSecondary">No image selected</p>
                    )}
                  </div>
                </div>
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
                disabled={!tempValidIdImage || !tempValidIdType || validIdUploading}
                className="px-4 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-lg text-sm font-medium text-white hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Valid ID
              </button>
            </div>
          </div>
        </div>
      )}
    </GuestLayout>
  );
}

export default function DayTourBookingPage() {
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
      <DayTourBookingContent />
    </Suspense>
  );
}
