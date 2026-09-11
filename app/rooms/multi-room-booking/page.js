// app/rooms/multi-room-booking/page.js
'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GuestLayout from '@/app/guest/layout';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import { uploadImage } from '@/lib/cloudinary';
import { compressImage } from '@/lib/imageUtils';
import { sendRoomPendingEmail } from '@/lib/emailService';
import ChatBot from '@/components/guest/ChatBot';
import InlineValidIdUpload from '@/components/guest/InlineValidIdUpload';
import { QRCodeSVG } from 'qrcode.react';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import { getDisplayValidIdType, hasAccountValidIdVerification, hasAccountMobileNumber } from '@/lib/guestValidId';
import {
  buildGuestInfoWithAddress,
  getGuestAddressFromProfile,
  getAddressBlockerMessage,
  isGuestAddressComplete,
  isProfileAddressComplete,
} from '@/lib/guestAddress';
import {
  getAddressNamesFromCodes,
  getBarangayOptionsForCity,
  getCityOptionsForProvince,
  getProvinceOptions,
  resolveAddressCodesFromNames,
} from '@/lib/philippineAddress';
import { toLocalDateKey } from '@/lib/reservationAvailability';
import { usePhilippineTimeSync } from '@/hooks/usePhilippineTimeSync';
import {
  getPhilippineNowIsoString,
  getTrustedNowMs,
  isPhilippineCalendarDatePast,
  isPhilippineCalendarDateTooSoon,
} from '@/lib/philippineTime';

// Storage keys for persisting data
const MULTI_ROOM_STORAGE_KEY = 'multi_room_booking_data';
const MULTI_ROOM_STEP_KEY = 'multi_room_booking_step';

const getRoomSummaryImage = (roomType = '') => {
  const normalized = roomType.toLowerCase();
  if (normalized.includes('tent')) return '/assets/Tent/Tents.jpg';
  if (normalized.includes('group')) return '/assets/GroupRoom/GroupRoom2.jpg';
  if (normalized.includes('ground')) return '/assets/GroundFloor/GroundRoom.jpg';
  return '/assets/GroupRoom/GroupRoom1.1.jpg';
};

function MultiRoomBookingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading: authLoading, updateGuestProfile } = useGuestAuth();
  const { ready: phTimeReady, nowMs } = usePhilippineTimeSync();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatedBookingId, setGeneratedBookingId] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);
  const [downPaymentAmount, setDownPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('gcash');
  const [balancePaymentMethod, setBalancePaymentMethod] = useState('');
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
  const [guestDetailsSaving, setGuestDetailsSaving] = useState(false);
  const [guestDetailsError, setGuestDetailsError] = useState('');
  const [guestDetails, setGuestDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    address: { houseNumber: '', street: '', barangay: '', city: '', province: '' },
  });
  const [addressCodes, setAddressCodes] = useState({ provinceCode: '', cityCode: '', barangayCode: '' });
  const [calendarMonth, setCalendarMonth] = useState(null);
  const [draftCheckIn, setDraftCheckIn] = useState(null);
  const [draftCheckOut, setDraftCheckOut] = useState(null);
  const [roomDetailsMap, setRoomDetailsMap] = useState({});
  const [bookedDates, setBookedDates] = useState({});
  const [blockedSlots, setBlockedSlots] = useState({});
  const [roomInventoryReady, setRoomInventoryReady] = useState(false);
  const [bookingsAvailabilityReady, setBookingsAvailabilityReady] = useState(false);
  const [blockedSlotsReady, setBlockedSlotsReady] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');

  const provinceOptions = useMemo(() => getProvinceOptions(), []);
  const cityOptions = useMemo(() => getCityOptionsForProvince(addressCodes.provinceCode), [addressCodes.provinceCode]);
  const barangayOptions = useMemo(() => getBarangayOptionsForCity(addressCodes.cityCode), [addressCodes.cityCode]);
  const selectedRoomIds = useMemo(() => (
    Array.from(new Set(
      (bookingData?.roomTypes || [])
        .filter((room) => Number(bookingData?.selectedRooms?.[room.type] || room.quantity || 0) > 0)
        .flatMap((room) => room.roomIds || [])
    ))
  ), [bookingData?.roomTypes, bookingData?.selectedRooms]);

  useEffect(() => {
    if (!profile) return;
    const address = getGuestAddressFromProfile(profile);
    setGuestDetails({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email || user?.email || '',
      mobileNumber: profile.mobileNumber || '',
      address,
    });
    setAddressCodes(resolveAddressCodesFromNames(address));
  }, [profile, user]);

  useEffect(() => {
    if (!bookingData?.checkIn) return;
    const checkIn = new Date(bookingData.checkIn);
    const checkOut = bookingData.checkOut ? new Date(bookingData.checkOut) : null;
    const trustedNow = phTimeReady ? new Date(nowMs) : null;
    const currentMonth = trustedNow
      ? new Date(trustedNow.getFullYear(), trustedNow.getMonth(), 1)
      : null;
    const bookingMonth = new Date(checkIn.getFullYear(), checkIn.getMonth(), 1);
    setCalendarMonth(currentMonth && bookingMonth < currentMonth ? currentMonth : bookingMonth);
    setDraftCheckIn(checkIn);
    setDraftCheckOut(checkOut);
  }, [bookingData?.checkIn, bookingData?.checkOut, phTimeReady, nowMs]);

  useEffect(() => {
    if (!phTimeReady || !nowMs) return;
    const trustedNow = new Date(nowMs);
    const currentMonth = new Date(trustedNow.getFullYear(), trustedNow.getMonth(), 1);
    setCalendarMonth((current) => current && current < currentMonth ? currentMonth : current);
  }, [phTimeReady, nowMs]);

  const FIXED_CHECK_IN_HOUR = 14;
  const FIXED_CHECK_OUT_HOUR = 12;
  const FIXED_CHECK_IN_DISPLAY = '02:00 PM';
  const FIXED_CHECK_OUT_DISPLAY = '12:00 PM';

  // Load booking data from session storage, optional bank-request resume, and localStorage
  useEffect(() => {
    let cancelled = false;

    const loadBookingPage = async () => {
      const bankRequestIdParam = searchParams.get('bankRequestId');

      if (bankRequestIdParam) {
        try {
          const bankSnap = await getDoc(doc(db, 'bank_requests', bankRequestIdParam));
          if (bankSnap.exists() && !cancelled) {
            const bankData = bankSnap.data();
            if (bankData.bookingId) {
              setGeneratedBookingId(bankData.bookingId);
            }
            setBankRequestId(bankRequestIdParam);
            setBankRequestSent(true);
            if (bankData.providedBankDetails) {
              setBankDetailsProvided(bankData.providedBankDetails);
            }
            if (bankData.pendingBookingDraft) {
              sessionStorage.setItem(
                'multiRoomBooking',
                JSON.stringify(bankData.pendingBookingDraft)
              );
            }
          }
        } catch (error) {
          console.error('Error restoring bank request for booking:', error);
        }
      }

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
        if (stepNum >= 1 && stepNum <= 5) {
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
    if (persistedFormData.balancePaymentMethod) {
      setBalancePaymentMethod(persistedFormData.balancePaymentMethod);
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
    };

    loadBookingPage();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  // Keep this booking calendar in sync with the same active room inventory the
  // public rooms page uses. A room archived or taken offline by staff is
  // therefore removed from the calendar's available capacity immediately.
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const roomsQuery = query(roomsRef, where('archived', '!=', true), where('availability', '==', 'available'));

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
      const details = {};
      snapshot.forEach((roomSnapshot) => {
        const roomData = roomSnapshot.data();
        details[roomData.type] = {
          ...(details[roomData.type] || {}),
          [roomSnapshot.id]: roomData,
        };
      });
      setRoomDetailsMap(details);
      setRoomInventoryReady(true);
      setBookingsAvailabilityReady(false);
      setBlockedSlotsReady(false);
      setAvailabilityError('');
    }, (error) => {
      console.error('Error listening to room availability:', error);
      setRoomInventoryReady(false);
      setAvailabilityError('Room availability is still loading. Please wait a moment and try again.');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!roomInventoryReady || selectedRoomIds.length === 0) {
      setBookedDates({});
      setBookingsAvailabilityReady(false);
      return undefined;
    }

    const bookingsRef = collection(db, 'bookings');
    const snapshotsByChunk = {};
    const unsubscribes = [];
    setBookingsAvailabilityReady(false);
    const roomIdChunks = [];
    for (let index = 0; index < selectedRoomIds.length; index += 10) {
      roomIdChunks.push(selectedRoomIds.slice(index, index + 10));
    }

    const getRoomCapacity = (roomId) => {
      for (const roomType of bookingData?.roomTypes || []) {
        const detail = roomDetailsMap[roomType.type]?.[roomId];
        if (detail) {
          return Math.max(0, Number(detail.totalRooms || 1) - Number(detail.maintenanceRooms || 0));
        }
      }
      return 0;
    };

    const rebuildBookedDates = () => {
      const booked = {};
      Object.values(snapshotsByChunk).forEach((snapshot) => {
        snapshot.forEach((bookingSnapshot) => {
          const booking = bookingSnapshot.data();
          const checkIn = booking.checkIn?.toDate ? booking.checkIn.toDate() : new Date(booking.checkIn);
          const checkOut = booking.checkOut?.toDate ? booking.checkOut.toDate() : new Date(booking.checkOut);
          if (!booking.roomId || Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) return;

          const current = new Date(checkIn);
          while (current < checkOut) {
            const dateKey = toLocalDateKey(current);
            const hour = current.getHours();
            if (!booked[dateKey]) booked[dateKey] = {};

            if (booking.isExclusiveResortBooking) {
              selectedRoomIds.forEach((roomId) => {
                if (!booked[dateKey][roomId]) booked[dateKey][roomId] = {};
                const maxUnits = getRoomCapacity(roomId);
                booked[dateKey][roomId][hour] = (booked[dateKey][roomId][hour] || 0) + maxUnits;
              });
            } else {
              if (!booked[dateKey][booking.roomId]) booked[dateKey][booking.roomId] = {};
              booked[dateKey][booking.roomId][hour] = (
                booked[dateKey][booking.roomId][hour] || 0
              ) + Number(booking.numberOfRooms || 1);
            }
            current.setHours(current.getHours() + 1, 0, 0, 0);
          }
        });
      });
      setBookedDates(booked);
    };

    roomIdChunks.forEach((roomIds, index) => {
      const bookingsQuery = query(
        bookingsRef,
        where('roomId', 'in', roomIds),
        where('status', 'in', ['pending', 'confirmed', 'check-in'])
      );
      const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
        snapshotsByChunk[index] = snapshot;
        rebuildBookedDates();
        if (Object.keys(snapshotsByChunk).length === roomIdChunks.length) {
          setBookingsAvailabilityReady(true);
        }
      }, (error) => {
        console.error('Error listening to booking availability:', error);
        setAvailabilityError('We could not refresh room availability. Please try again.');
      });
      unsubscribes.push(unsubscribe);
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [bookingData?.roomTypes, roomDetailsMap, roomInventoryReady, selectedRoomIds]);

  useEffect(() => {
    if (!roomInventoryReady || selectedRoomIds.length === 0) {
      setBlockedSlots({});
      setBlockedSlotsReady(false);
      return undefined;
    }

    setBlockedSlotsReady(false);
    const unsubscribe = onSnapshot(collection(db, 'unavailableSlots'), (snapshot) => {
      const blocks = {};
      snapshot.forEach((slotSnapshot) => {
        const slot = slotSnapshot.data();
        if (!selectedRoomIds.includes(slot.roomId)) return;
        const dateKey = slot.date;
        if (!dateKey) return;
        if (!blocks[dateKey]) blocks[dateKey] = {};
        if (!blocks[dateKey][slot.roomId]) blocks[dateKey][slot.roomId] = {};
        for (let hour = Number(slot.startHour || 0); hour < Number(slot.endHour || 0); hour += 1) {
          blocks[dateKey][slot.roomId][hour] = (
            blocks[dateKey][slot.roomId][hour] || 0
          ) + Number(slot.unitsBlocked || 1);
        }
      });
      setBlockedSlots(blocks);
      setBlockedSlotsReady(true);
    }, (error) => {
      console.error('Error listening to blocked room slots:', error);
      setAvailabilityError('We could not refresh room availability. Please try again.');
    });

    return () => unsubscribe();
  }, [roomInventoryReady, selectedRoomIds]);

  // Save booking data to localStorage whenever it changes
  useEffect(() => {
    if (!bookingData) return;

    try {
      const dataToSave = {
        paymentProofUrl: bookingData.paymentProofUrl,
        specialRequest: bookingData.specialRequest,
        paymentMethod: paymentMethod,
        balancePaymentMethod: balancePaymentMethod,
        bankRequestSent: bankRequestSent,
        bankRequestId: bankRequestId,
        bankDetailsProvided: bankDetailsProvided
      };
      localStorage.setItem(MULTI_ROOM_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving booking data to localStorage:', error);
    }
  }, [bookingData, paymentMethod, balancePaymentMethod, bankRequestSent, bankRequestId, bankDetailsProvided]);

  // Save step to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(MULTI_ROOM_STEP_KEY, String(step));
    } catch (error) {
      console.error('Error saving step to localStorage:', error);
    }
  }, [step]);

  // Clear persisted data when booking is completed (step 5)
  useEffect(() => {
    if (step === 5) {
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
    const timestamp = phTimeReady ? nowMs : getTrustedNowMs();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `BOOK-${timestamp}-${randomNum}`;
  };

  useEffect(() => {
    if (generatedBookingId || !phTimeReady) return;
    setGeneratedBookingId(generateBookingReference());
  }, [generatedBookingId, phTimeReady, nowMs]);

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
    if (step === 1) {
      if (!draftCheckIn || !draftCheckOut) {
        setModalNotification({ message: 'Select an available check-in date and check-out date before continuing.', type: 'error' });
        return;
      }
      if (isBookingRangeUnavailable(draftCheckIn, draftCheckOut)) {
        setModalNotification({ message: 'Those dates are no longer available. Please choose another stay.', type: 'error' });
        return;
      }
    }
    setStep(step + 1);
  };

  const handleAddressSelect = (field, value) => {
    if (field === 'province') {
      const nextCodes = { provinceCode: value, cityCode: '', barangayCode: '' };
      const names = getAddressNamesFromCodes(nextCodes);
      setAddressCodes(nextCodes);
      setGuestDetails((prev) => ({
        ...prev,
        address: { ...prev.address, province: names.province, city: '', barangay: '' },
      }));
      return;
    }
    if (field === 'city') {
      const nextCodes = { provinceCode: addressCodes.provinceCode, cityCode: value, barangayCode: '' };
      const names = getAddressNamesFromCodes(nextCodes);
      setAddressCodes(nextCodes);
      setGuestDetails((prev) => ({
        ...prev,
        address: { ...prev.address, province: names.province, city: names.city, barangay: '' },
      }));
      return;
    }
    const nextCodes = { ...addressCodes, barangayCode: value };
    const names = getAddressNamesFromCodes(nextCodes);
    setAddressCodes(nextCodes);
    setGuestDetails((prev) => ({
      ...prev,
      address: { ...prev.address, province: names.province, city: names.city, barangay: names.barangay },
    }));
  };

  const handleGuestDetailsContinue = async () => {
    const { firstName, lastName, email, mobileNumber, address } = guestDetails;
    if (!firstName.trim() || !lastName.trim()) {
      setGuestDetailsError('Complete your first name and last name before continuing.');
      return;
    }
    if (!email.trim() || !mobileNumber.trim()) {
      setGuestDetailsError('Complete your contact number before continuing.');
      return;
    }
    if (!isGuestAddressComplete(address)) {
      setGuestDetailsError('Complete your province, city/municipality, barangay, and house or unit number before continuing.');
      return;
    }
    setGuestDetailsSaving(true);
    setGuestDetailsError('');
    try {
      await updateGuestProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileNumber: mobileNumber.trim(),
        address: {
          houseNumber: address.houseNumber.trim(),
          street: address.street.trim(),
          barangay: address.barangay.trim(),
          city: address.city.trim(),
          province: address.province.trim(),
        },
      });
      setStep(3);
    } catch (error) {
      setGuestDetailsError('We could not save your details. Please try again.');
    } finally {
      setGuestDetailsSaving(false);
    }
  };

  const getAvailabilityRoomTypes = () => (
    (bookingData?.roomTypes || []).filter((room) => (
      Number(bookingData?.selectedRooms?.[room.type] || room.quantity || 0) > 0
    ))
  );

  const getMaxRoomsForType = (roomType, roomId) => {
    const roomDetail = roomDetailsMap[roomType?.type]?.[roomId];
    if (!roomDetail) return 0;
    return Math.max(0, Number(roomDetail.totalRooms || 1) - Number(roomDetail.maintenanceRooms || 0));
  };

  const isBookingDatePast = (date) => {
    if (!phTimeReady) return true;
    return isPhilippineCalendarDatePast(date, nowMs);
  };

  const isBookingDateTooSoon = (date) => {
    if (!phTimeReady) return true;
    return isPhilippineCalendarDateTooSoon(date, 2, nowMs);
  };

  const isBookingDateFullyBooked = (date) => {
    if (!date || !roomInventoryReady || !bookingsAvailabilityReady || !blockedSlotsReady) return true;
    const roomTypes = getAvailabilityRoomTypes();
    if (roomTypes.length === 0) return true;
    const dateKey = toLocalDateKey(date);
    const checkInHour = Number(bookingData?.checkInHour || FIXED_CHECK_IN_HOUR);

    return roomTypes.some((roomType) => {
      const quantity = Number(bookingData?.selectedRooms?.[roomType.type] || roomType.quantity || 0);
      let availableUnits = 0;

      (roomType.roomIds || []).forEach((roomId) => {
        const maxRooms = getMaxRoomsForType(roomType, roomId);
        if (maxRooms <= 0) return;
        let minimumAvailable = maxRooms;
        for (let hour = checkInHour; hour < 24; hour += 1) {
          const booked = bookedDates[dateKey]?.[roomId]?.[hour] || 0;
          const blocked = blockedSlots[dateKey]?.[roomId]?.[hour] || 0;
          minimumAvailable = Math.min(minimumAvailable, Math.max(0, maxRooms - booked - blocked));
          if (minimumAvailable <= 0) break;
        }
        availableUnits += minimumAvailable;
      });

      return availableUnits < quantity;
    });
  };

  const isBookingDateFullyBlockedByAdmin = (date) => {
    if (!date || !roomInventoryReady || !bookingsAvailabilityReady || !blockedSlotsReady) return true;
    const roomTypes = getAvailabilityRoomTypes();
    if (roomTypes.length === 0) return true;
    const dateKey = toLocalDateKey(date);
    const checkInHour = Number(bookingData?.checkInHour || FIXED_CHECK_IN_HOUR);

    return roomTypes.some((roomType) => {
      let totalUnits = 0;
      let blockedAtMorning = 0;
      let blockedAtCheckIn = 0;
      (roomType.roomIds || []).forEach((roomId) => {
        const maxRooms = getMaxRoomsForType(roomType, roomId);
        if (maxRooms <= 0) return;
        totalUnits += maxRooms;
        blockedAtMorning += Math.min(maxRooms, blockedSlots[dateKey]?.[roomId]?.[0] || 0);
        blockedAtCheckIn += Math.min(maxRooms, blockedSlots[dateKey]?.[roomId]?.[checkInHour] || 0);
      });
      return totalUnits > 0 && blockedAtMorning >= totalUnits && blockedAtCheckIn >= totalUnits;
    });
  };

  const isBookingDateSelectable = (date) => {
    if (!date || isBookingDatePast(date) || isBookingDateTooSoon(date)) return false;
    if (isBookingDateFullyBooked(date)) return false;
    if (isBookingDateFullyBlockedByAdmin(date)) return false;
    return true;
  };

  const isBookingRangeUnavailable = (start, end) => {
    if (!start || !end) return true;
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastNight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (current < lastNight) {
      if (!isBookingDateSelectable(current)) return true;
      current.setDate(current.getDate() + 1);
    }
    return false;
  };

  const isCalendarDateDisabled = (date) => {
    if (!date) return true;
    const selectingCheckout = draftCheckIn && !draftCheckOut && date > draftCheckIn;
    if (selectingCheckout) return isBookingRangeUnavailable(draftCheckIn, date);
    return !isBookingDateSelectable(date);
  };

  const getCalendarDays = () => {
    if (!calendarMonth) return [];
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const leadingDays = firstDay.getDay();
    return Array.from({ length: leadingDays + daysInMonth }, (_, index) => (
      index < leadingDays ? null : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - leadingDays + 1)
    ));
  };

  const handleBookingDateSelect = (date) => {
    if (!date) return;
    if (isCalendarDateDisabled(date)) return;
    const selected = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (!draftCheckIn || draftCheckOut) {
      setDraftCheckIn(selected);
      setDraftCheckOut(null);
      return;
    }
    if (selected <= draftCheckIn) {
      setDraftCheckIn(selected);
      setDraftCheckOut(null);
      return;
    }
    if (isBookingRangeUnavailable(draftCheckIn, selected)) return;
    const nextCheckOut = new Date(selected);
    const nights = Math.max(1, Math.round((nextCheckOut - draftCheckIn) / 86400000));
    setDraftCheckOut(nextCheckOut);
    setBookingData((prev) => {
      const nextTotal = prev.isExclusiveResortBooking
        ? Number(prev.exclusivePackagePrice || totalPrice)
        : (prev.roomTypes || []).reduce((sum, room) => {
          const quantity = Number(prev.selectedRooms?.[room.type] || room.quantity || 1);
          const base = Number(room.price || 0) * quantity * nights;
          const extra = Number(room.extraGuests || 0) * Number(room.additionalGuestCharge || 0) * nights;
          return sum + base + extra;
        }, 0);
      setTotalPrice(nextTotal);
      setDownPaymentAmount(nextTotal * 0.5);
      return {
        ...prev,
      checkIn: draftCheckIn,
      checkOut: nextCheckOut,
      checkInDate: draftCheckIn.toISOString(),
      checkOutDate: nextCheckOut.toISOString(),
      numberOfNights: nights,
      nights,
      };
    });
  };

  const updateBookingGuestCount = (field, value) => {
    const count = Math.max(field === 'adults' ? 1 : 0, Number(value) || 0);
    setBookingData((prev) => {
      const next = { ...prev, totalGuests: 0 };
      if (prev.isExclusiveResortBooking) {
        next.exclusiveAdults = field === 'adults' ? count : Number(prev.exclusiveAdults || 0);
        next.exclusiveKids = field === 'kids' ? count : Number(prev.exclusiveKids || 0);
        next.totalGuests = next.exclusiveAdults + next.exclusiveKids;
        return next;
      }
      const firstType = prev.roomTypes?.[0]?.type;
      const guestsByType = { ...(prev.perRoomGuests || {}) };
      const firstRoomGuests = [...(guestsByType[firstType] || [{ adults: 1, kids: 0 }])];
      firstRoomGuests[0] = { ...firstRoomGuests[0], [field]: count };
      guestsByType[firstType] = firstRoomGuests;
      const adults = firstRoomGuests.reduce((sum, guest) => sum + Number(guest.adults || 0), 0);
      const kids = firstRoomGuests.reduce((sum, guest) => sum + Number(guest.kids || 0), 0);
      next.perRoomGuests = guestsByType;
      next.adultsPerType = { ...(prev.adultsPerType || {}), [firstType]: adults };
      next.kidsPerType = { ...(prev.kidsPerType || {}), [firstType]: kids };
      next.totalGuestsPerType = { ...(prev.totalGuestsPerType || {}), [firstType]: adults + kids };
      next.totalGuests = adults + kids;
      return next;
    });
  };

  const toStoragePayload = (data) => ({
    ...data,
    checkInDate: data?.checkIn instanceof Date ? data.checkIn.toISOString() : data?.checkInDate || null,
    checkOutDate: data?.checkOut instanceof Date ? data.checkOut.toISOString() : data?.checkOutDate || null
  });

  const handlePreviousStep = () => {
    if (step === 1) {
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
        requestedAt: getPhilippineNowIsoString(nowMs)
      });

      let pendingBookingDraft = null;
      try {
        const sessionDraft = sessionStorage.getItem('multiRoomBooking');
        if (sessionDraft) {
          pendingBookingDraft = JSON.parse(sessionDraft);
        }
      } catch (draftError) {
        console.error('Error reading booking draft for bank request:', draftError);
      }

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
        createdAt: getPhilippineNowIsoString(nowMs),
        read: false,
        isMultiRoom: isMultiRoomRequest,
        isExclusiveResortBooking,
        exclusivePackagePrice: isExclusiveResortBooking ? exclusivePackagePrice : null,
        pendingBookingDraft,
        draftSavedAt: getPhilippineNowIsoString(nowMs),
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
    if (!hasAccountValidIdVerification(profile)) {
      setValidIdError('A valid ID photo and selfie holding the same ID are required. Complete the Valid ID step above.');
      valid = false;
    } else {
      setValidIdError('');
    }
    return valid;
  };

  const accountValidIdType = getDisplayValidIdType(profile);
  const accountValidIdUrl = profile?.validIdUrl || '';
  const accountValidIdSelfieUrl = profile?.validIdSelfieUrl || '';

  const handleSubmitBooking = async () => {
    if (!checkBookingRequirements()) {
      return;
    }

    if (!bookingData?.paymentProofUrl) {
      setModalNotification({
        message: 'Please upload your payment receipt or proof of payment before confirming your booking.',
        type: 'error',
      });
      return;
    }

    if (!isProfileAddressComplete(profile)) {
      setModalNotification({
        message: getAddressBlockerMessage(),
        type: 'error',
      });
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
      const guestInfoBase = {
        firstName: userFirstName,
        lastName: userLastName,
        email: userEmail,
        phone: userPhone,
      };
      const guestInfo = buildGuestInfoWithAddress(profile, guestInfoBase);

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

  // --- Get per‑room guest counts ---
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

  // --- Compute extra guest charges for single room ---
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
    checkIn: bookingData.checkIn,
    checkOut: bookingData.checkOut,
    guestInfo,
    status: 'pending',
    paymentMethod: paymentMethod,
    balancePaymentMethod: balancePaymentMethod,
    paymentProofUrl: bookingData.paymentProofUrl,
    validIdType: accountValidIdType || null,
    validIdName: profile?.validIdName || null,
    validIdUrl: accountValidIdUrl || null,
    validIdSelfieUrl: accountValidIdSelfieUrl || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    type: 'room',
    numberOfRooms: 1,
    specialRequest: bookingData.specialRequest || null,
    // ----- NEW: extra guest charge breakdown -----
    extraGuests: unitExtraGuests,
    additionalGuestCharge: extraGuestChargeRate,
    extraGuestCharges: unitExtraGuestCharges,
    totalExtraGuestCharge: unitExtraGuestCharges,
    // --------------------------------------------
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
              checkIn: bookingData.checkIn,
              checkOut: bookingData.checkOut,
              guestInfo,
              status: 'pending',
              paymentMethod: paymentMethod,
              balancePaymentMethod: balancePaymentMethod,
              paymentProofUrl: bookingData.paymentProofUrl,
              validIdType: accountValidIdType || null,
              validIdName: profile?.validIdName || null,
              validIdUrl: accountValidIdUrl || null,
              validIdSelfieUrl: accountValidIdSelfieUrl || null,
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
              extraGuests: unitExtraGuests,
              additionalGuestCharge: extraGuestChargeRate,
              extraGuestCharges: unitExtraGuestCharges,
              totalExtraGuestCharge: unitExtraGuestCharges,
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
          guestInfo,
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
      setStep(5);
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

  const minimumCalendarMonth = phTimeReady && nowMs
    ? new Date(new Date(nowMs).getFullYear(), new Date(nowMs).getMonth(), 1)
    : null;

  if (loading || authLoading) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-14 flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
        </div>
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
  const totalExtraGuestCharges = Number((bookingData.totalExtraGuestCharge ?? bookingData.roomTypes?.reduce((sum, rt) => sum + Number(rt.extraGuestCharges || 0), 0)) || 0);
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
  const summaryRoomType = isExclusiveBooking ? 'Entire Resort Package' : (getFilteredRoomTypes()[0]?.type || 'Selected room');
  const summaryRoomImage = getRoomSummaryImage(summaryRoomType);
  const summaryGuestCount = isExclusiveBooking
    ? exclusiveTotalGuests
    : Number(bookingData.totalGuests || Object.values(bookingData.totalGuestsPerType || {}).reduce((sum, value) => sum + Number(value || 0), 0));
  const summaryNightlyRate = isExclusiveBooking ? (totalPrice / stayNights) : derivedNightlyRate;

  // Get user display name
  const userDisplayName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : 'Guest';
  const userEmail = profile?.email || user?.email || '';
  const userMobileNumber = profile?.mobileNumber || '';

  const hasCompleteAddress = isProfileAddressComplete(profile);

  const canConfirmBooking = Boolean(
    bookingData.paymentProofUrl &&
    !submitting &&
    (paymentMethod !== 'bank_transfer' || bankDetailsProvided || visibleGuestQrBank) &&
    userMobileNumber &&
    hasAccountValidIdVerification(profile) &&
    ['digital', 'cash'].includes(balancePaymentMethod) &&
    hasCompleteAddress
  );

  const confirmBookingBlockers = [];
  if (!bookingData.paymentProofUrl) {
    confirmBookingBlockers.push('Upload your payment receipt or proof of payment to enable confirmation.');
  }
  if (paymentMethod === 'bank_transfer' && !bankDetailsProvided && !visibleGuestQrBank) {
    confirmBookingBlockers.push('Wait for the resort to provide bank transfer details (or use an available QR payment option).');
  }
  if (!userMobileNumber) {
    confirmBookingBlockers.push('Add a mobile number in your account profile.');
  }
  if (!hasAccountValidIdVerification(profile)) {
    confirmBookingBlockers.push('Complete the Valid ID step with both required photos.');
  }
  if (!['digital', 'cash'].includes(balancePaymentMethod)) {
    confirmBookingBlockers.push('Select how you will pay your remaining balance at check-in (Digital or Cash).');
  }
  if (!hasCompleteAddress) {
    confirmBookingBlockers.push(getAddressBlockerMessage());
  }
  if (submitting) {
    confirmBookingBlockers.push('Your booking is being submitted…');
  }

  return (
    <GuestLayout>
      <div className="min-h-screen bg-[#F8FCFF] pt-32 pb-16">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Column - Booking Form */}
            <div className="w-full lg:w-[62%]">
              {/* Five-step progress */}
              <div className="mb-4 rounded-2xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4 sm:py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <button type="button" onClick={() => router.push('/rooms')} aria-label="Back to room selection" title="Back to room selection" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700">
                      <i className="fas fa-arrow-left text-xs" />
                    </button>
                    <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ocean-mid">SandyFeet Reserve</p>
                    <p className="mt-0.5 text-sm font-semibold text-textPrimary sm:text-base">Complete your reservation</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-ocean-ice px-2.5 py-1 text-[11px] font-semibold text-ocean-mid">Step {Math.min(step, 5)} / 5</span>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {[
                    { id: 1, label: 'Dates & guests' },
                    { id: 2, label: 'Your details' },
                    { id: 3, label: 'Valid ID' },
                    { id: 4, label: 'Reservation fee' },
                    { id: 5, label: 'Review' }
                  ].map((item) => {
                    const isCompleted = item.id < step;
                    const isActive = item.id === step;
                    const isUpcoming = item.id > step;
                    const showCheckIcon = isCompleted;

                    return (
                      <div key={item.id} className="relative z-10 flex min-w-0 flex-col items-center">
                        <div className={`flex size-7 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors sm:size-8 sm:text-xs ${isActive
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200'
                              : showCheckIcon
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : 'bg-white border-gray-300 text-gray-400'
                          }`}>
                          {showCheckIcon ? <i className="fas fa-check text-xs"></i> : item.id}
                        </div>

                        <div className={`mt-1.5 w-full truncate text-center text-[8px] font-semibold sm:text-[10px] ${isActive ? 'text-blue-700' : isUpcoming ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                          {item.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 1: Dates & guests */}
              {step === 1 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-mid">Your stay</p><h2 className="mt-2 text-2xl font-bold text-textPrimary">Choose your nights</h2><p className="mt-2 text-sm leading-6 text-textSecondary">Your selected dates are shown below.</p></div>
                  <div>
                      <div className="mb-4 flex items-center justify-between"><button type="button" disabled={!calendarMonth || !minimumCalendarMonth || calendarMonth <= minimumCalendarMonth} onClick={() => calendarMonth && setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} aria-label="Previous month" className="flex size-9 items-center justify-center rounded-xl border border-gray-200 text-textSecondary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"><i className="fas fa-chevron-left text-xs" /></button><p className="font-semibold text-textPrimary">{calendarMonth?.toLocaleString('en-US', { month: 'long', year: 'numeric' }) || 'Choose dates'}</p><button type="button" onClick={() => calendarMonth && setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} aria-label="Next month" className="flex size-9 items-center justify-center rounded-xl border border-gray-200 text-textSecondary transition-colors hover:bg-gray-50"><i className="fas fa-chevron-right text-xs" /></button></div>
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-textSecondary">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="py-1">{day}</span>)}{getCalendarDays().map((date, index) => { const selectedStart = date && draftCheckIn && date.toDateString() === draftCheckIn.toDateString(); const selectedEnd = date && draftCheckOut && date.toDateString() === draftCheckOut.toDateString(); const inRange = date && draftCheckIn && draftCheckOut && date > draftCheckIn && date < draftCheckOut; const dateDisabled = isCalendarDateDisabled(date); return <div key={date ? date.toISOString() : `empty-${index}`} aria-label={date ? `${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${dateDisabled ? ', unavailable' : ''}` : undefined} className={`flex min-h-9 items-center justify-center rounded-lg text-xs ${selectedStart || selectedEnd ? 'bg-ocean-mid font-bold text-white' : inRange ? 'bg-ocean-ice text-textPrimary' : dateDisabled ? 'text-gray-300 line-through' : 'text-textPrimary'} ${!date ? '' : 'cursor-default'}`}>{date?.getDate() || ''}</div>; })}</div>
                      <div className="mt-4 rounded-xl bg-ocean-ice/60 px-3 py-2 text-xs text-textSecondary">{draftCheckIn && draftCheckOut ? `${formatDateOnly(draftCheckIn)} – ${formatDateOnly(draftCheckOut)}` : 'No dates selected.'}</div>
                      {availabilityError && <p className="mt-2 text-xs text-amber-700">{availabilityError}</p>}
                  </div>
                  <div className="hidden grid gap-3 sm:grid-cols-3">
                    {['/assets/GroupRoom/GroupRoom1.1.jpg', '/assets/GroupRoom/GroupRoom1.2.jpg', '/assets/GroupRoom/GroupRoom2.jpg'].map((src, index) => <div key={src} className={`overflow-hidden rounded-2xl ${index === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`}><img src={src} alt="SandyFeet accommodation" className={`w-full object-cover ${index === 0 ? 'h-64 sm:h-full' : 'h-32'}`} /></div>)}
                  </div>
                  <div className="hidden mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-textSecondary">Check-in</p><p className="mt-2 text-lg font-bold text-textPrimary">{formatDateOnly(bookingData.checkIn)}</p><p className="mt-1 text-xs text-textSecondary">{FIXED_CHECK_IN_DISPLAY}</p></div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-textSecondary">Check-out</p><p className="mt-2 text-lg font-bold text-textPrimary">{formatDateOnly(bookingData.checkOut)}</p><p className="mt-1 text-xs text-textSecondary">{FIXED_CHECK_OUT_DISPLAY} · {stayNights} night{stayNights === 1 ? '' : 's'}</p></div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-ocean-light/20 bg-ocean-ice/40 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-textSecondary">Selected rooms</p><div className="mt-2 space-y-2">{getFilteredRoomTypes().map((roomType) => <div key={roomType.type} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-textPrimary">{bookingData.selectedRooms?.[roomType.type] || roomType.quantity} × {roomType.type}</span><span className="text-textSecondary">{roomType.totalGuests || bookingData.totalGuestsPerType?.[roomType.type] || 1} guest{(roomType.totalGuests || bookingData.totalGuestsPerType?.[roomType.type] || 1) === 1 ? '' : 's'}</span></div>)}</div></div>
                  <label className="mt-5 block"><span className="mb-1.5 block text-sm font-semibold text-textPrimary">Special request <span className="font-normal text-textSecondary">(optional)</span></span><textarea value={bookingData.specialRequest || ''} onChange={(e) => setBookingData((prev) => ({ ...prev, specialRequest: e.target.value }))} rows={4} placeholder="Tell us about accessibility needs, celebrations, or room preferences." className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" /></label>
                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={handlePreviousStep} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-textSecondary hover:bg-gray-50">Back to room selection</button><button onClick={handleNextStep} className="flex-1 rounded-xl bg-ocean-mid px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-ocean-deep">Continue to your details<i className="fas fa-arrow-right ml-2" /></button></div>
                </div>
              )}

              {/* Step 2: Your details */}
              {step === 2 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-mid">Your details</p>
                    <h2 className="mt-2 text-2xl font-bold text-textPrimary">Tell us who is booking</h2>
                    <p className="mt-2 text-sm leading-6 text-textSecondary">We filled these in from your SandyFeet account. Check the address and add anything missing.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-textSecondary">First name</span>
                      <input value={guestDetails.firstName} onChange={(e) => setGuestDetails((prev) => ({ ...prev, firstName: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-textSecondary">Last name</span>
                      <input value={guestDetails.lastName} onChange={(e) => setGuestDetails((prev) => ({ ...prev, lastName: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold text-textSecondary">Email address</span>
                      <input value={guestDetails.email} readOnly type="email" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-textPrimary" />
                      <span className="mt-1 block text-[11px] text-textSecondary">Booking updates will be sent here</span>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold text-textSecondary">Mobile number</span>
                      <input value={guestDetails.mobileNumber} onChange={(e) => setGuestDetails((prev) => ({ ...prev, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 11) }))} inputMode="numeric" placeholder="09XXXXXXXXX" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" />
                    </label>
                  </div>

                  <div className="mt-6 rounded-2xl border border-ocean-light/20 bg-ocean-ice/40 p-4 sm:p-5">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-ocean-mid"><i className="fas fa-location-dot" /></span>
                      <div><h3 className="text-sm font-semibold text-textPrimary">Home address</h3><p className="mt-1 text-xs leading-5 text-textSecondary">Select your province, city/municipality, and barangay so staff can verify your booking faster.</p></div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">Province <span className="text-red-500">*</span></span><select required aria-required="true" value={addressCodes.provinceCode} onChange={(e) => handleAddressSelect('province', e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-textPrimary"><option value="">Select province</option>{provinceOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}</select></label>
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">City / municipality <span className="text-red-500">*</span></span><select required aria-required="true" value={addressCodes.cityCode} onChange={(e) => handleAddressSelect('city', e.target.value)} disabled={!addressCodes.provinceCode} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-textPrimary disabled:cursor-not-allowed disabled:bg-gray-100"><option value="">Select city</option>{cityOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}</select></label>
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">Barangay <span className="text-red-500">*</span></span><select required aria-required="true" value={addressCodes.barangayCode} onChange={(e) => handleAddressSelect('barangay', e.target.value)} disabled={!addressCodes.cityCode} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-textPrimary disabled:cursor-not-allowed disabled:bg-gray-100"><option value="">Select barangay</option>{barangayOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}</select></label>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">House / unit number <span className="text-red-500">*</span></span><input required aria-required="true" value={guestDetails.address.houseNumber} onChange={(e) => setGuestDetails((prev) => ({ ...prev, address: { ...prev.address, houseNumber: e.target.value } }))} placeholder="e.g. 24" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" /></label>
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-textSecondary">Street <span className="font-normal">(optional)</span></span><input value={guestDetails.address.street} onChange={(e) => setGuestDetails((prev) => ({ ...prev, address: { ...prev.address, street: e.target.value } }))} placeholder="Street name" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-textPrimary outline-none focus:border-ocean-mid focus:ring-2 focus:ring-ocean-mid/20" /></label>
                    </div>
                  </div>
                  {guestDetailsError && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><i className="fas fa-circle-exclamation mr-2" />{guestDetailsError}</p>}
                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={handlePreviousStep} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-textSecondary hover:bg-gray-50">Back</button><button onClick={handleGuestDetailsContinue} disabled={guestDetailsSaving} className="flex-1 rounded-xl bg-ocean-mid px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-ocean-deep disabled:cursor-not-allowed disabled:opacity-60">{guestDetailsSaving ? 'Saving details…' : 'Continue to valid ID'}<i className="fas fa-arrow-right ml-2" /></button></div>
                </div>
              )}

              {/* Step 3: Valid ID */}
              {step === 3 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-mid">Verification</p><h2 className="mt-2 text-2xl font-bold text-textPrimary">Add one valid ID</h2><p className="mt-2 text-sm leading-6 text-textSecondary">Complete the verification here. Your details will be saved securely for future SandyFeet reservations.</p></div>
                  <InlineValidIdUpload profile={profile} updateGuestProfile={updateGuestProfile} onComplete={() => setStep(4)} />
                  <button onClick={handlePreviousStep} className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-textSecondary hover:bg-gray-50">Back to your details</button>
                </div>
              )}

              {/* Step 4: Reservation fee */}
              {step === 4 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-5 sm:p-6">
                  {/* Account Information Summary */}
                  <div className="hidden mb-5 p-4 bg-blue-50/30 rounded-xl border border-blue-100/80 shadow-sm">
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
                    {!hasCompleteAddress && (
                      <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <i className="fas fa-map-marker-alt mr-1.5" />
                        Complete your home address in account before you can confirm this booking.
                      </p>
                    )}

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
                                onClick={() => setStep(3)}
                                className="mt-1 text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                              >
                                <i className="fas fa-arrow-right text-[9px]"></i> Complete Valid ID step
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

                      <div className="grid grid-cols-1 gap-4">
                        {/* Valid ID Container */}
                        <div className="hidden bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-id-card text-blue-500 text-lg"></i>
                            <label className="text-sm font-semibold text-gray-800">Valid ID (from your account)</label>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
                            Required for booking verification.
                          </p>
                          <div className="relative">
                            {hasAccountValidIdVerification(profile) ? (
                              <button
                                type="button"
                                onClick={() => setStep(3)}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all duration-200 cursor-pointer"
                              >
                                <i className="fas fa-id-card"></i> Review Valid ID
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStep(3)}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 cursor-pointer transition-all duration-200"
                              >
                                <i className="fas fa-upload"></i> Complete Valid ID
                              </button>
                            )}
                          </div>
                          {hasAccountValidIdVerification(profile) ? (
                            <p className="mt-2.5 text-[11px] text-emerald-600 flex items-center gap-1.5">
                              <i className="fas fa-check-circle text-emerald-500"></i>
                              On file — used for this reservation ({accountValidIdType})
                            </p>
                          ) : (
                            <p className="mt-2.5 text-[11px] text-amber-600 flex items-center gap-1.5">
                              <i className="fas fa-exclamation-circle text-amber-500"></i>
                              Not uploaded or incomplete. Required to confirm booking.
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
                                <p className="text-xs text-amber-600">No other bank accounts are available right now.</p>
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

                      <div className="grid grid-cols-1 gap-4">
                        {/* Valid ID Container */}
                        <div className="hidden bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-id-card text-blue-500 text-lg"></i>
                            <label className="text-sm font-semibold text-gray-800">Valid ID (from your account)</label>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
                            Required for booking verification.
                          </p>
                          <div className="relative">
                            {hasAccountValidIdVerification(profile) ? (
                              <button
                                type="button"
                                onClick={() => setStep(3)}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 transition-all duration-200 cursor-pointer"
                              >
                                <i className="fas fa-id-card"></i> Review Valid ID
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStep(3)}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200/50 cursor-pointer transition-all duration-200"
                              >
                                <i className="fas fa-upload"></i> Complete Valid ID
                              </button>
                            )}
                          </div>
                          {hasAccountValidIdVerification(profile) ? (
                            <p className="mt-2.5 text-[11px] text-emerald-600 flex items-center gap-1.5">
                              <i className="fas fa-check-circle text-emerald-500"></i>
                              On file — used for this reservation ({accountValidIdType})
                            </p>
                          ) : (
                            <p className="mt-2.5 text-[11px] text-amber-600 flex items-center gap-1.5">
                              <i className="fas fa-exclamation-circle text-amber-500"></i>
                              Not uploaded or incomplete. Required to confirm booking.
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

                  {/* Balance payment method at check-in */}
<div className="mt-5 mb-5 sm:mt-6 sm:mb-6">
  <label className="block text-xs sm:text-sm font-semibold text-textPrimary mb-2 sm:mb-3">
    How would you like to pay your remaining balance upon check-in?
  </label>

  <div className="grid grid-cols-2 gap-3 sm:gap-4">
    {[
      {
        value: 'digital',
        label: 'Digital',
        icon: 'fa-mobile-alt',
        description: 'Pay digitally at check-in.',
      },
      {
        value: 'cash',
        label: 'Cash',
        icon: 'fa-money-bill-wave',
        description: 'Pay in cash at check-in.',
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
</div>

                  {!canConfirmBooking && confirmBookingBlockers.length > 0 && (
                    <div className="mt-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                        <i className="fas fa-info-circle" />
                        Complete the following to confirm your booking:
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-amber-800 list-disc pl-5">
                        {confirmBookingBlockers.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
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
                      disabled={!canConfirmBooking}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                        canConfirmBooking
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:shadow-lg hover:shadow-blue-500/30'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                      {submitting ? 'Submitting...' : 'Confirm Booking'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Review & confirmation */}
              {step === 5 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_10px_30px_rgb(0,0,0,0.05)] p-6 sm:p-8 text-center">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-check text-3xl text-emerald-600"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-textPrimary mb-2">Reservation request received</h2>
                  <p className="text-textSecondary mb-4">
                    Thank you for your booking. Your request is now pending staff confirmation. Updates will be sent to {userEmail}. You can track your reservation through your account.
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
            <div className="w-full lg:w-[38%] lg:self-stretch">
              <aside className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-[#e7e1d6] bg-white shadow-[0_8px_24px_-12px_rgba(38,50,56,0.18)] lg:overscroll-contain">
                <div className="flex items-center gap-4 p-4">
                  <img src={summaryRoomImage} alt={summaryRoomType} className="size-20 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ocean-mid">{isExclusiveBooking ? 'SandyFeet Camp' : summaryRoomType}</p><h2 className="mt-1 truncate text-base font-semibold text-textPrimary">{summaryRoomType}</h2><p className="mt-1 text-xs text-textSecondary">{stayNights} night{stayNights === 1 ? '' : 's'} · check-in {FIXED_CHECK_IN_DISPLAY}</p></div>
                </div>
                <div className="border-y border-[#e7e1d6] px-4 py-3.5">
                  <div className="flex items-center justify-between gap-4 text-sm"><span className="flex items-center gap-2 text-textSecondary"><i className="fas fa-calendar text-ocean-mid" />Dates</span><span className="font-medium text-textPrimary">{formatDateOnly(bookingData.checkIn)} – {formatDateOnly(bookingData.checkOut)}</span></div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-sm"><span className="flex items-center gap-2 text-textSecondary"><i className="fas fa-users text-ocean-mid" />Guests</span><span className="font-medium text-textPrimary">{summaryGuestCount} guest{summaryGuestCount === 1 ? '' : 's'}</span></div>
                </div>
                <div className="border-b border-[#e7e1d6] px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-textSecondary">Schedule</p>
                  <div className="mt-2 space-y-1.5 text-xs text-textSecondary">
                    <div className="flex items-center justify-between gap-3"><span>Check-in</span><span className="font-medium text-textPrimary">{formatDateOnly(bookingData.checkIn)} · {FIXED_CHECK_IN_DISPLAY}</span></div>
                    <div className="flex items-center justify-between gap-3"><span>Check-out</span><span className="font-medium text-textPrimary">{formatDateOnly(bookingData.checkOut)} · {FIXED_CHECK_OUT_DISPLAY}</span></div>
                  </div>
                </div>
                <div className="px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-textSecondary">Price breakdown</p>
                  <div className="mt-2 space-y-1.5 border-b border-[#e7e1d6] pb-3 text-xs">
                    {isExclusiveBooking ? (
                      <div className="flex items-center justify-between gap-3"><span className="text-textSecondary">Entire resort · {stayNights} night{stayNights === 1 ? '' : 's'}</span><span className="font-medium text-textPrimary">₱{totalPrice.toLocaleString()}</span></div>
                    ) : getFilteredRoomTypes().map((roomType) => {
                      const quantity = Number(bookingData.selectedRooms?.[roomType.type] || roomType.quantity || 0);
                      const roomSubtotal = Number(roomType.price || 0) * quantity * stayNights;
                      return <div key={`summary-${roomType.type}`} className="flex items-center justify-between gap-3"><span className="text-textSecondary">{quantity} × ₱{Number(roomType.price || 0).toLocaleString()} × {stayNights} night{stayNights === 1 ? '' : 's'}</span><span className="font-medium text-textPrimary">₱{roomSubtotal.toLocaleString()}</span></div>;
                    })}
                    {totalExtraGuestCharges > 0 && <div className="flex items-center justify-between gap-3"><span className="text-textSecondary">Additional guest charges</span><span className="font-medium text-textPrimary">₱{totalExtraGuestCharges.toLocaleString()}</span></div>}
                  </div>
                  <div className="flex items-center justify-between pt-3 text-base font-bold text-textPrimary"><span>Total</span><span>₱{totalPrice.toLocaleString()}</span></div>
                </div>
                <div className="border-t border-[#e7e1d6] bg-[#faf8f3] px-4 py-4"><div className="flex items-center justify-between gap-4"><span className="text-sm font-medium text-textPrimary">Reservation fee due now</span><span className="text-lg font-bold text-ocean-mid">₱{downPaymentAmount.toLocaleString()}</span></div><p className="mt-2 text-xs leading-5 text-textSecondary">Send this through GCash, Maya, or bank transfer and upload the receipt. The remaining ₱{(totalPrice - downPaymentAmount).toLocaleString()} is settled in cash at the camp office.</p></div>
              </aside>
            </div>
            <div className="hidden w-full lg:w-[34%] lg:self-stretch">
              <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[2rem] border border-gray-100 bg-white shadow-[0_12px_40px_rgb(0,0,0,0.06)] lg:overscroll-contain">
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
                                {roomType.extraGuests > 0 && (
                                  <div className="mt-1 text-[10px] text-gray-500 flex justify-between pl-2">
                                    <span>Extra guests:</span>
                                    <span>{roomType.extraGuests} × ₱{Number(roomType.additionalGuestCharge || 0).toLocaleString()} × {stayNights}</span>
                                  </div>
                                )}
                                {roomType.extraGuestCharges > 0 && (
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
                      placeholder="e.g., Request early check-in, room preferences, PWD/Senior ID, etc."
                      rows="3"
                      readOnly={step === 5}
                      className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none resize-none ${step === 5
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

export default function MultiRoomBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white flex items-center justify-center">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      }
    >
      <MultiRoomBookingPageContent />
    </Suspense>
  );
}
