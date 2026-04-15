// app/rooms/multi-room-booking/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { uploadImage } from '@/lib/cloudinary';

export default function MultiRoomBookingPage() {
  const router = useRouter();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(2); // Start at step 2 (Guest Details)
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
  const [showValidIdModal, setShowValidIdModal] = useState(false);
  const [tempValidIdType, setTempValidIdType] = useState('Passport');
  const [tempValidIdFile, setTempValidIdFile] = useState(null);
  const [validIdUploading, setValidIdUploading] = useState(false);

  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

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

  // Load booking data from session storage
  useEffect(() => {
    const storedData = sessionStorage.getItem('multiRoomBooking');
    if (!storedData) {
      router.push('/rooms/select-room-types');
      return;
    }

    const data = JSON.parse(storedData);
    setBookingData({
      ...data,
      checkIn: new Date(data.checkInDate),
      checkOut: new Date(data.checkOutDate),
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      paymentProofUrl: null,
      validIdType: '',
      validIdUrl: null,
      nights: 1
    });
    setTotalPrice(data.totalPrice);
    setDownPaymentAmount(data.totalPrice * 0.5);
    setLoading(false);
  }, [router]);

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
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNextStep = () => {
    if (step === 2) {
      if (validateStep2()) {
        setStep(step + 1);
      }
    } else {
      setStep(step + 1);
    }
  };

  const handlePreviousStep = () => {
    if (step === 2) {
      router.push('/rooms/select-room-types');
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
      const imageUrl = await uploadFileToCloudinary(file);
      setBookingData(prev => ({ ...prev, paymentProofUrl: imageUrl }));
      setModalNotification({ message: 'Payment proof uploaded successfully!', type: 'success' });
    } catch (error) {
      setModalNotification({ message: error.message || 'Failed to upload file. Please try again.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleValidIdFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setModalNotification({ message: 'File size exceeds 10MB. Please choose a smaller file.', type: 'error' });
      return;
    }

    setValidIdUploading(true);
    try {
      const imageUrl = await uploadFileToCloudinary(file);
      setTempValidIdFile(imageUrl);
      setModalNotification({ message: 'Valid ID uploaded successfully!', type: 'success' });
    } catch (error) {
      setModalNotification({ message: error.message || 'Failed to upload valid ID. Please try again.', type: 'error' });
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
        guestName: `${bookingData.firstName} ${bookingData.lastName}`,
        guestEmail: bookingData.email,
        guestPhone: bookingData.phone,
        roomType: bookingData.roomTypes?.map(t => `${t.quantity} × ${t.type}`).join(', ') || 'Multiple Rooms',
        roomId: 'multiple',
        bookingId: generatedBookingId,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        nights: bookingData.nights || 1,
        numberOfRooms: Object.values(bookingData.selectedRooms).reduce((a, b) => a + b, 0),
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
        isMultiRoom: true
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
      const bookingId = generatedBookingId;
      
      // Create booking document for each room type
      const allRoomIds = [];
      for (const roomType of bookingData.roomTypes) {
        for (let i = 0; i < roomType.quantity; i++) {
          // Assign specific room IDs from the available pool
          const roomId = roomType.roomIds[i % roomType.roomIds.length];
          allRoomIds.push(roomId);
        }
      }

      // Calculate total guests per room (distribute total guests evenly across units)
      const guestsPerRoom = {};
      for (const roomType of bookingData.roomTypes) {
        const totalGuestsForType = roomType.totalGuests || (roomType.quantity * 1);
        guestsPerRoom[roomType.type] = Math.ceil(totalGuestsForType / roomType.quantity);
      }

      // Create individual bookings for each room
      for (let i = 0; i < allRoomIds.length; i++) {
        const roomId = allRoomIds[i];
        const roomTypeObj = bookingData.roomTypes.find(t => t.roomIds.includes(roomId));
        const guestsPerRoomValue = guestsPerRoom[roomTypeObj.type];
        
        const booking = {
          bookingId: `${bookingId}-${i + 1}`,
          roomId: roomId,
          roomType: roomTypeObj.type,
          price: roomTypeObj.price,
          nights: 1,
          guests: guestsPerRoomValue,
          totalPrice: roomTypeObj.price,
          downPayment: roomTypeObj.price * 0.5,
          remainingBalance: roomTypeObj.price * 0.5,
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
          paymentProofUrl: bookingData.paymentProofUrl,
          validIdType: bookingData.validIdType || null,
          validIdUrl: bookingData.validIdUrl || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          type: 'room',
          numberOfRooms: 1,
          specialRequest: bookingData.specialRequest || null,
          parentBookingId: bookingId,
          isMultiRoomBooking: true
        };
        
        // Add bank details if provided
        if (bankDetailsProvided) {
          booking.bankDetailsProvided = bankDetailsProvided;
        }
        
        await addDoc(collection(db, 'bookings'), booking);
      }
      
      setStep(4);
    } catch (error) {
      console.error('Error creating booking:', error);
      setModalNotification({ message: 'Failed to create booking. Please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
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
      return `${qty} × ${type} (${totalGuests} total guest${totalGuests !== 1 ? 's' : ''})`;
    }).join(', ');
  };

  if (loading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
        </div>
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
              onClick={() => router.push('/rooms/select-room-types')}
              className="mt-4 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
            >
              Back to Room Selection
            </button>
          </div>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-16">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6 space-y-3">
            <button
              onClick={() => router.push('/rooms/select-room-types')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <i className="fas fa-arrow-left text-[10px]"></i>
              Back to Room Selection
            </button>

            <nav className="inline-flex bg-white/95 border border-gray-200 rounded-xl px-3 py-2 text-gray-600 text-xs font-semibold uppercase tracking-wider shadow-sm" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-2">
                <li>
                  <button onClick={() => router.push('/')} className="hover:text-blue-500 transition-colors">Home</button>
                </li>
                <li><i className="fas fa-chevron-right text-[10px]"></i></li>
                <li>
                  <button onClick={() => router.push('/rooms')} className="hover:text-blue-500 transition-colors">Rooms</button>
                </li>
                <li><i className="fas fa-chevron-right text-[10px]"></i></li>
                <li className="text-gray-900" aria-current="page">Checkout</li>
              </ol>
            </nav>

            <div>
              <h1 className="text-2xl md:text-3xl font-playfair font-extrabold text-gray-900 tracking-tight">Complete Your Reservation</h1>
              <p className="text-sm text-gray-500 mt-1">Review your room selection, provide guest details, and finalize your down payment.</p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Column - Booking Form */}
            <div className="lg:w-[66%] w-full">
              {/* Progress Steps - Starting from Step 2 */}
              <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
                <div className="flex justify-between items-center gap-2">
                  {[2, 3, 4].map((s, idx) => (
                    <div key={s} className="flex-1 relative">
                      <div className={`w-9 h-9 mx-auto rounded-full flex items-center justify-center text-sm font-bold border ${
                        step >= s ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 text-gray-500'
                      }`}>
                        {idx + 2}
                      </div>
                      <div className="text-center text-[11px] mt-2 font-semibold text-gray-500 uppercase tracking-wide">
                        {s === 2 && 'Guest Details'}
                        {s === 3 && 'Payment'}
                        {s === 4 && 'Confirmation'}
                      </div>
                      {s < 4 && (
                        <div className={`absolute top-[18px] left-1/2 w-full h-[2px] ${
                          step > s ? 'bg-blue-500' : 'bg-gray-200'
                        }`} style={{ transform: 'translateY(-50%)' }}></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2: Guest Details */}
              {step === 2 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
                  <h2 className="text-2xl font-playfair font-bold text-gray-900 mb-6">Guest Details</h2>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">First Name *</label>
                      <input
                        type="text"
                        value={bookingData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        className={`w-full px-4 py-2.5 border ${errors.firstName ? 'border-red-500' : 'border-gray-200'} rounded-xl focus:outline-none focus:border-blue-400`}
                      />
                      {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Last Name *</label>
                      <input
                        type="text"
                        value={bookingData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        className={`w-full px-4 py-2.5 border ${errors.lastName ? 'border-red-500' : 'border-gray-200'} rounded-xl focus:outline-none focus:border-blue-400`}
                      />
                      {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-textPrimary mb-2">Email Address *</label>
                      <input
                        type="email"
                        value={bookingData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`w-full px-4 py-2.5 border ${errors.email ? 'border-red-500' : 'border-gray-200'} rounded-xl focus:outline-none focus:border-blue-400`}
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
                        className={`w-full px-4 py-2.5 border ${errors.phone ? 'border-red-500' : 'border-gray-200'} rounded-xl focus:outline-none focus:border-blue-400`}
                      />
                      {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handlePreviousStep}
                      className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-all duration-300"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300"
                    >
                      Continue to Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment */}
              {step === 3 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
                  <h2 className="text-2xl font-playfair font-bold text-gray-900 mb-6">Payment</h2>
                  
                  {/* Payment Method Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-textPrimary mb-3">Select Payment Method</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('gcash')}
                        className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
                          paymentMethod === 'gcash'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-blue-300'
                        }`}
                      >
                        <i className={`fab fa-gcash text-3xl ${paymentMethod === 'gcash' ? 'text-blue-600' : 'text-gray-400'}`}></i>
                        <span className={`text-sm font-medium ${paymentMethod === 'gcash' ? 'text-blue-600' : 'text-gray-500'}`}>GCash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
                          paymentMethod === 'bank_transfer'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-blue-300'
                        }`}
                      >
                        <i className={`fas fa-university text-3xl ${paymentMethod === 'bank_transfer' ? 'text-blue-600' : 'text-gray-400'}`}></i>
                        <span className={`text-sm font-medium ${paymentMethod === 'bank_transfer' ? 'text-blue-600' : 'text-gray-500'}`}>Bank Transfer</span>
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
                      className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-all duration-300"
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
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:shadow-lg hover:shadow-blue-500/30'
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
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-6 sm:p-8 text-center">
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
                      Down payment of <strong>₱{downPaymentAmount.toLocaleString()}</strong> has been confirmed.
                      Remaining balance of <strong>₱{(totalPrice - downPaymentAmount).toLocaleString()}</strong> is payable at the resort.
                    </p>
                  </div>
                  <div className="flex gap-3">
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
              <div className="bg-[#fffdf8] rounded-2xl shadow-sm border border-amber-200 overflow-hidden sticky top-32">
                <div className="px-5 py-4 border-b border-dashed border-amber-300 bg-amber-50/70">
                  <h3 className="font-bold text-gray-800 text-base flex items-center gap-2 uppercase tracking-wider">
                    <i className="fas fa-receipt text-amber-600"></i>
                    Booking Summary
                  </h3>
                </div>

                <div className="p-5 space-y-4">
                  {/* Selected Rooms Summary */}
                  <div>
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-door-open text-amber-600 text-xs"></i>
                      Selected Rooms
                    </h4>
                    <div className="bg-white rounded-xl border border-amber-200 p-3">
                      {bookingData.roomTypes && bookingData.roomTypes.map((type, idx) => (
                        <div key={`${type.type}-${idx}`} className="text-xs text-gray-600 mt-1">
                          {type.quantity} × {type.type} • ₱{type.price.toLocaleString()}/night
                          ({type.totalGuests || 1} total guest{(type.totalGuests || 1) !== 1 ? 's' : ''})
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Schedule Summary */}
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-calendar-check text-amber-600 text-xs"></i>
                      Schedule
                    </h4>
                    <div className="bg-white rounded-xl border border-amber-200 p-3">
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

                  {/* Price Breakdown */}
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-tag text-amber-600 text-xs"></i>
                      Price Breakdown
                    </h4>
                    <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Total per night:</span>
                        <span className="font-semibold text-gray-800">₱{totalPrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-dashed border-amber-300">
                        <span className="text-gray-500">Down Payment (50%):</span>
                        <span className="font-semibold text-amber-600">₱{downPaymentAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Remaining Balance:</span>
                        <span className="font-semibold text-gray-800">₱{(totalPrice - downPaymentAmount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Special Request Section - Editable */}
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                    <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <i className="fas fa-comment text-amber-600 text-xs"></i>
                      Special Request
                    </h4>
                    <textarea
                      value={bookingData.specialRequest || ''}
                      onChange={(e) => setBookingData(prev => ({ ...prev, specialRequest: e.target.value }))}
                      placeholder="e.g., Request early check-in, room preferences, special occasion, etc."
                      rows="3"
                      className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm focus:outline-none focus:border-blue-400 resize-none bg-white"
                    />
                    <p className="text-xs text-amber-600 mt-1">
                      <i className="fas fa-clock mr-1"></i>
                      Note: Check-in time is fixed at 2:00 PM. If you need early check-in, please specify your requested time here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Valid ID Modal */}
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
    </GuestLayout>
  );
}