// app/day-tour/booking/page.js
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

export default function DayTourBooking() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dateParam = searchParams.get('date');
  
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
  
  const [bookingData, setBookingData] = useState({
    adults: 1,
    kids: 0,
    seniors: 0,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    paymentProof: null,
    validIdType: '',
    validIdImage: null
  });
  
  const [errors, setErrors] = useState({});

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
    const q = query(
      bookingsRef,
      where('selectedDate', '==', dateKey),
      where('status', 'in', ['pending', 'confirmed', 'check-in'])
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let totalBookedGuests = 0;
      querySnapshot.forEach((docSnap) => {
        const booking = docSnap.data();
        totalBookedGuests += (booking.adults || 0) + (booking.kids || 0) + (booking.seniors || 0);
      });
      
      const capacity = dayTour.maxCapacity ? dayTour.maxCapacity - totalBookedGuests : Infinity;
      setRemainingCapacity(capacity);
      
      // Re-validate guests if capacity changed
      const currentTotalGuests = bookingData.adults + bookingData.kids + bookingData.seniors;
      if (capacity !== Infinity && currentTotalGuests > capacity) {
        setErrors(prev => ({ ...prev, guests: `Only ${capacity} slot(s) remaining for this date` }));
      } else if (errors.guests && errors.guests.includes('remaining')) {
        setErrors(prev => ({ ...prev, guests: '' }));
      }
    }, (error) => {
      console.error('Error fetching day tour bookings:', error);
    });
    
    return () => unsubscribe();
  }, [selectedDate, dayTour, bookingData.adults, bookingData.kids, bookingData.seniors]);

  // Parse selected date
  useEffect(() => {
    if (dateParam) {
      const date = new Date(dateParam);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date);
      } else {
        router.push('/day-tour/calendar');
      }
    } else {
      router.push('/day-tour/calendar');
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
  const totalGuests = bookingData.adults + bookingData.kids + bookingData.seniors;
  const totalPrice = (bookingData.adults * (dayTour?.adultPrice || 0)) +
                     (bookingData.kids * (dayTour?.kidPrice || 0)) +
                     (bookingData.seniors * (dayTour?.seniorPrice || 0));
  const downPaymentAmount = totalPrice * 0.5;

  // Format date for display
  const formatSelectedDate = () => {
    if (!selectedDate) return '';
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Upload file to Cloudinary
  const uploadToCloudinary = async (file, folder) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'daytour_uploads'); // You'll need to create this preset in Cloudinary
    formData.append('folder', `daytour/${folder}`);
    
    const response = await fetch('https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    const data = await response.json();
    return data.secure_url;
  };

  // Convert data URL to File object
  const dataURLToFile = (dataURL, filename) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const validateGuests = () => {
    if (totalGuests < 1) {
      setErrors(prev => ({ ...prev, guests: 'At least 1 guest is required' }));
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
    const numValue = parseInt(value) || 0;
    setBookingData(prev => ({ ...prev, [field]: numValue }));
    if (errors.guests) {
      validateGuests();
    }
  };

  const handleInputChange = (field, value) => {
    setBookingData(prev => ({ ...prev, [field]: value }));
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
      router.push('/day-tour/calendar');
    } else {
      setStep(step - 1);
    }
  };

  const handlePaymentProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    try {
      // Upload directly to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(file, 'payment_proofs');
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
      // Upload directly to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(file, 'valid_ids');
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
      
      const availableCapacity = dayTour.maxCapacity ? dayTour.maxCapacity - totalBookedGuests : Infinity;
      
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
        adults: bookingData.adults,
        kids: bookingData.kids,
        seniors: bookingData.seniors,
        totalGuests: totalGuests,
        totalPrice: totalPrice,
        downPayment: downPaymentAmount,
        remainingBalance: totalPrice - downPaymentAmount,
        guestInfo: {
          firstName: bookingData.firstName,
          lastName: bookingData.lastName,
          email: bookingData.email,
          phone: bookingData.phone
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
                        {s === 1 && 'Guests'}
                        {s === 2 && 'Details'}
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

              {/* Step 1: Guest Count */}
              {step === 1 && (
                <div className="bg-white rounded-2xl shadow-lg p-8">
                  <h2 className="text-2xl font-bold text-textPrimary mb-6">Step 1: Number of Guests</h2>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Adults (16+) *</label>
                      <input
                        type="number"
                        min="0"
                        value={bookingData.adults}
                        onChange={(e) => handleGuestChange('adults', e.target.value)}
                        className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Kids (15 and below)</label>
                      <input
                        type="number"
                        min="0"
                        value={bookingData.kids}
                        onChange={(e) => handleGuestChange('kids', e.target.value)}
                        className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Seniors</label>
                      <input
                        type="number"
                        min="0"
                        value={bookingData.seniors}
                        onChange={(e) => handleGuestChange('seniors', e.target.value)}
                        className="w-full px-4 py-2 border border-ocean-light/20 rounded-lg focus:outline-none focus:border-ocean-light"
                      />
                    </div>
                    
                    {errors.guests && (
                      <p className="text-red-500 text-sm">{errors.guests}</p>
                    )}
                    
                    <div className="p-5 bg-gradient-to-r from-ocean-ice to-blue-white rounded-xl">
                      <h3 className="text-lg font-semibold text-textPrimary mb-3">Booking Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-textSecondary">Total Guests:</span>
                          <span className="font-semibold">{totalGuests}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-textSecondary">Total Price:</span>
                          <span className="font-bold text-ocean-mid">₱{totalPrice.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-ocean-light/20">
                          <span className="text-textSecondary">Down Payment (50%):</span>
                          <span className="font-bold text-amber-600">₱{downPaymentAmount.toLocaleString()}</span>
                        </div>
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
                      disabled={totalGuests < 1 || (remainingCapacity !== Infinity && totalGuests > remainingCapacity)}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                        totalGuests >= 1 && (remainingCapacity === Infinity || totalGuests <= remainingCapacity)
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
                        placeholder="09123456789"
                        className={`w-full px-4 py-2 border ${errors.phone ? 'border-red-500' : 'border-ocean-light/20'} rounded-lg focus:outline-none focus:border-ocean-light`}
                      />
                      {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
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
                              <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center border border-ocean-light/20 overflow-hidden">
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
                          <li>The <strong>remaining balance</strong> (₱{(totalPrice - downPaymentAmount).toLocaleString()}) should be paid at the resort.</li>
                          <li>If you cancel your reservation, the resort will retain <strong>50% of the down payment</strong>.</li>
                        </ul>
                      </div>
                      
                        <div className="bg-gradient-to-br from-white to-ocean-ice/30 rounded-xl border border-ocean-light/30 p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <i className="fas fa-id-card text-ocean-mid text-lg"></i>
                          <label className="text-sm font-semibold text-textPrimary">Upload Valid ID *</label>
                        </div>
                        <p className="text-xs text-textSecondary mb-3">
                          Full name on the ID must match the booking details. Image must be clear (front only) with no blur.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTempValidIdType(bookingData.validIdType || 'Passport');
                            setTempValidIdImage(bookingData.validIdImage || null);
                            setShowValidIdModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-ocean-light/40 text-sm font-medium text-textPrimary bg-white hover:bg-ocean-ice hover:border-ocean-mid/50 transition-all duration-200 shadow-sm"
                        >
                          <i className="fas fa-cloud-upload-alt text-ocean-mid"></i>
                          {bookingData.validIdImage ? 'Change Uploaded Valid ID' : 'Choose File'}
                        </button>
                        {bookingData.validIdType && (
                          <p className="mt-3 text-xs text-ocean-mid flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Selected ID: <span className="font-semibold">{bookingData.validIdType}</span>
                          </p>
                        )}
                        {bookingData.validIdImage && (
                          <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Valid ID uploaded
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-textPrimary mb-2">Upload Proof of Payment (Down Payment) *</label>
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
                          {bookingData.paymentProof && (
                            <span className="ml-3 text-sm text-green-600">
                              <i className="fas fa-check-circle mr-1"></i>
                              File uploaded
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Bank Transfer Section for Day Tour */}
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
                            <p className="text-textSecondary font-medium mb-2">Request Sent!</p>
                            <p className="text-sm text-textSecondary">Your bank transfer request has been sent to the resort.</p>
                            <p className="text-xs text-textSecondary mt-2">The resort will provide bank account details shortly.</p>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            {!showBankSelection ? (
                              <>
                                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <i className="fas fa-university text-amber-600 text-2xl"></i>
                                </div>
                                <p className="text-textSecondary mb-3">Select your preferred bank:</p>
                                {paymentSettings.bankAccounts.length > 0 ? (
                                  <div className="space-y-2 mb-4">
                                    {paymentSettings.bankAccounts.map((bank) => (
                                      <button
                                        key={bank.id}
                                        onClick={() => {
                                          setSelectedBankAccount(bank);
                                          setShowBankSelection(true);
                                        }}
                                        className="w-full text-left p-3 border border-ocean-light/20 rounded-lg hover:bg-ocean-ice transition"
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
                                  className="w-full px-6 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition"
                                >
                                  {notifyingResort ? (
                                    <><i className="fas fa-spinner fa-spin mr-2"></i>Sending Request...</>
                                  ) : (
                                    <><i className="fas fa-paper-plane mr-2"></i>Confirm & Send Request</>
                                  )}
                                </button>
                                <button
                                  onClick={() => setShowBankSelection(false)}
                                  className="w-full px-6 py-2 border border-ocean-light/20 rounded-lg text-textSecondary hover:bg-ocean-ice transition"
                                >
                                  Back
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
                          <li>The <strong>remaining balance</strong> (₱{(totalPrice - downPaymentAmount).toLocaleString()}) should be paid at the resort.</li>
                          <li>If you cancel your reservation, the resort will retain <strong>50% of the down payment</strong>.</li>
                        </ul>
                      </div>

                                              <div className="bg-gradient-to-br from-white to-ocean-ice/30 rounded-xl border border-ocean-light/30 p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <i className="fas fa-id-card text-ocean-mid text-lg"></i>
                          <label className="text-sm font-semibold text-textPrimary">Upload Valid ID *</label>
                        </div>
                        <p className="text-xs text-textSecondary mb-3">
                          Full name on the ID must match the booking details. Image must be clear (front only) with no blur.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTempValidIdType(bookingData.validIdType || 'Passport');
                            setTempValidIdImage(bookingData.validIdImage || null);
                            setShowValidIdModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-ocean-light/40 text-sm font-medium text-textPrimary bg-white hover:bg-ocean-ice hover:border-ocean-mid/50 transition-all duration-200 shadow-sm"
                        >
                          <i className="fas fa-cloud-upload-alt text-ocean-mid"></i>
                          {bookingData.validIdImage ? 'Change Uploaded Valid ID' : 'Choose File'}
                        </button>
                        {bookingData.validIdType && (
                          <p className="mt-3 text-xs text-ocean-mid flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Selected ID: <span className="font-semibold">{bookingData.validIdType}</span>
                          </p>
                        )}
                        {bookingData.validIdImage && (
                          <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                            <i className="fas fa-check-circle"></i>
                            Valid ID uploaded
                          </p>
                        )}
                      </div>
                      
                      {bankDetailsProvided && (
                        <div>
                          <label className="block text-sm font-semibold text-textPrimary mb-2">Upload Proof of Payment (Down Payment) *</label>
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePaymentProofUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              id="payment-proof-upload-bank"
                              disabled={uploading}
                            />
                            <label
                              htmlFor="payment-proof-upload-bank"
                              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all duration-300 cursor-pointer ${
                                uploading
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg'
                              }`}
                            >
                              <i className="fas fa-upload"></i>
                              {uploading ? 'Uploading...' : 'Choose File'}
                            </label>
                            {bookingData.paymentProof && (
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
                        !bookingData.paymentProof ||
                        !bookingData.validIdImage ||
                        submitting ||
                        (paymentMethod === 'bank_transfer' && !bankDetailsProvided)
                      }
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                        bookingData.paymentProof &&
                        bookingData.validIdImage &&
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
                    Thank you for booking your day tour! A confirmation email will be sent to {bookingData.email}. You can also track and cancel your reservation anytime through the Reservation Tracker page.
                  </p>
                  
                  <div className="p-4 bg-ocean-ice rounded-lg mb-4">
                    <p className="text-sm text-textPrimary">Copy your booking reference to track your reservation.</p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <strong className="text-lg font-mono">{generatedBookingId}</strong>
                      <button
                        onClick={() => copyToClipboard(generatedBookingId)}
                        className="p-1.5 rounded-lg bg-white hover:bg-ocean-light/10 text-ocean-mid transition"
                        title="Copy to clipboard"
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                    {copiedMessage && (
                      <p className="text-xs text-green-600 mt-1">
                        <i className="fas fa-check-circle mr-1"></i>Copied!
                      </p>
                    )}
                  </div>
                  
                  <div className="p-4 bg-amber-50 rounded-lg mb-6">
                    <p className="text-sm text-amber-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      Down payment of <strong>₱{downPaymentAmount.toLocaleString()}</strong> has been confirmed.
                      Remaining balance of <strong>₱{(totalPrice - downPaymentAmount).toLocaleString()}</strong> is payable at the resort.
                    </p>
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
              )}
            </div>

            {/* Right Column - Day Tour Pricing Container + Capacity Display + Guest Breakdown */}
            {/* Fixed layout: No sticky on the outer container, only the pricing container has sticky positioning */}
            <div className="lg:w-[30%]">
              <div className="sticky top-8 space-y-4">
                <div className="bg-white rounded-xl shadow-md border border-ocean-light/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-ocean-mid to-ocean-light px-5 py-3">
                    <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                      <i className="fas fa-tag"></i>
                      Day Tour Pricing
                    </h3>
                  </div>
                  
                  <div className="p-5 space-y-4">
                    <div className="bg-ocean-ice rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2 flex items-center gap-1">
                        <i className="fas fa-calendar-check text-ocean-light text-xs"></i>
                        Selected Schedule
                      </h4>
                      <p className="text-base font-semibold text-textPrimary">
                        {selectedDate ? formatDate(selectedDate) : 'No date selected'}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-textPrimary mb-2 flex items-center gap-1">
                        <i className="fas fa-coins text-ocean-light text-xs"></i>
                        Rates
                      </h4>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-ocean-ice rounded-lg p-2">
                          <p className="text-xs text-textSecondary">Adult (16+)</p>
                          <p className="text-base font-bold text-ocean-mid">₱{dayTour.adultPrice?.toLocaleString()}</p>
                        </div>
                        <div className="bg-ocean-ice rounded-lg p-2">
                          <p className="text-xs text-textSecondary">Kid (15-)</p>
                          <p className="text-base font-bold text-ocean-mid">₱{dayTour.kidPrice?.toLocaleString()}</p>
                        </div>
                        <div className="bg-ocean-ice rounded-lg p-2">
                          <p className="text-xs text-textSecondary">Senior</p>
                          <p className="text-base font-bold text-ocean-mid">₱{dayTour.seniorPrice?.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {dayTour.inclusions && dayTour.inclusions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-textPrimary mb-2 flex items-center gap-1">
                          <i className="fas fa-check-circle text-green-600 text-xs"></i>
                          Inclusions
                        </h4>
                        <ul className="space-y-1.5">
                          {dayTour.inclusions.map((item, idx) => (
                            <li key={idx} className="text-sm text-textSecondary flex items-start gap-2">
                              <i className="fas fa-check text-ocean-light text-xs mt-0.5"></i>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {dayTour.description && (
                      <div>
                        <h4 className="text-sm font-semibold text-textPrimary mb-2 flex items-center gap-1">
                          <i className="fas fa-info-circle text-ocean-light text-xs"></i>
                          Description
                        </h4>
                      <p className="text-sm text-textSecondary leading-relaxed">
                        {dayTour.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Maximum & Remaining Capacity Display - Now inside the sticky container */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <i className="fas fa-users text-amber-600"></i>
                    </div>
                    <div>
                      <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold">
                        Maximum Capacity
                      </p>
                      <p className="text-2xl font-bold text-amber-800">
                        {dayTour.maxCapacity} <span className="text-sm font-normal">guests</span>
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <i className="fas fa-chart-line text-green-600"></i>
                    </div>
                    <div>
                      <p className="text-xs text-green-700 uppercase tracking-wide font-semibold">
                        Remaining Capacity
                      </p>
                      <p className="text-2xl font-bold text-green-700">
                        {remainingCapacity !== Infinity ? remainingCapacity : dayTour.maxCapacity} <span className="text-sm font-normal">guests</span>
                      </p>
                    </div>
                  </div>
                  {remainingCapacity !== Infinity && remainingCapacity <= 10 && remainingCapacity > 0 && (
                    <div className="bg-orange-100 rounded-lg px-3 py-1">
                      <p className="text-xs text-orange-700 font-semibold">⚠️ Limited Slots</p>
                    </div>
                  )}
                </div>

                {/* Guest Breakdown Section */}
                <div className="mt-4 pt-3 border-t border-amber-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <i className="fas fa-users text-blue-600 text-xs"></i>
                    </div>
                    <p className="text-sm font-semibold text-textPrimary">Guest Breakdown</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-textSecondary">
                        <i className="fas fa-user-tie text-blue-500 mr-2 text-xs"></i>
                        Senior Guests
                      </span>
                      <span className="font-semibold text-textPrimary">{bookingData.seniors}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-textSecondary">
                        <i className="fas fa-user text-green-500 mr-2 text-xs"></i>
                        Adult Guests
                      </span>
                      <span className="font-semibold text-textPrimary">{bookingData.adults}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-textSecondary">
                        <i className="fas fa-child text-yellow-500 mr-2 text-xs"></i>
                        Kid Guests
                      </span>
                      <span className="font-semibold text-textPrimary">{bookingData.kids}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-amber-100">
                      <span className="text-sm font-semibold text-textPrimary">Total Guests</span>
                      <span className="font-bold text-ocean-mid">{totalGuests}</span>
                    </div>
                  </div>
                </div>
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

              {tempValidIdImage && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-textPrimary mb-1">Preview</p>
                  <div className="border border-ocean-light/30 rounded-lg overflow-hidden bg-ocean-ice">
                    <img
                      src={tempValidIdImage}
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