// app/dashboard/admin/payment/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, where, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { uploadImage } from '../../../../lib/cloudinary';
import { logAdminAction } from '../../../../lib/auditLogger';
import Image from 'next/image';

export default function AdminPaymentPage() {
  const [gcashQRCode, setGcashQRCode] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQR, setUploadingQR] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [bankTransferRequests, setBankTransferRequests] = useState([]);
  const [dayTourBankRequests, setDayTourBankRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [bankToArchive, setBankToArchive] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState('paymentSettings');
  const [activeRequestsTab, setActiveRequestsTab] = useState('room');
  const [tempBankDetails, setTempBankDetails] = useState({
    bankName: '',
    accountName: '',
    accountNumber: '',
    showToGuest: false
  });
  const [showEditQRModal, setShowEditQRModal] = useState(false);
  const [tempQRFile, setTempQRFile] = useState(null);
  const [tempQRPreview, setTempQRPreview] = useState('');
  const [viewedRoomRequests, setViewedRoomRequests] = useState(new Set());
  const [viewedDayTourRequests, setViewedDayTourRequests] = useState(new Set());
  const [hasBankChanges, setHasBankChanges] = useState(false);
  const [originalBankDetails, setOriginalBankDetails] = useState(null);
  const [showArchiveQRModal, setShowArchiveQRModal] = useState(false);
  const [archivingQR, setArchivingQR] = useState(false);
  const [requestsSearchTerm, setRequestsSearchTerm] = useState('');

  // NEW STATE for QR Code upload in Add Bank Modal
  const [bankQRFile, setBankQRFile] = useState(null);
  const [bankQRPreview, setBankQRPreview] = useState('');
  const [bankQRUrl, setBankQRUrl] = useState('');

  // Tab slider refs
  const mainTabsContainerRef = useRef(null);
  const mainSliderRef = useRef(null);
  const mainButtonRefs = useRef({});
  
  const requestsTabsContainerRef = useRef(null);
  const requestsSliderRef = useRef(null);
  const requestsButtonRefs = useRef({});

  // Update slider for main tabs
  const updateMainSlider = useCallback(() => {
    const activeButton = mainButtonRefs.current[activeMainTab];
    const container = mainTabsContainerRef.current;
    const slider = mainSliderRef.current;
    if (activeButton && container && slider) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;
      slider.style.transform = `translateX(${left}px)`;
      slider.style.width = `${width}px`;
    }
  }, [activeMainTab]);

  // Update slider for requests tabs
  const updateRequestsSlider = useCallback(() => {
    const activeButton = requestsButtonRefs.current[activeRequestsTab];
    const container = requestsTabsContainerRef.current;
    const slider = requestsSliderRef.current;
    if (activeButton && container && slider) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;
      slider.style.transform = `translateX(${left}px)`;
      slider.style.width = `${width}px`;
    }
  }, [activeRequestsTab]);

  useEffect(() => {
    updateMainSlider();
    const resizeObserver = new ResizeObserver(() => updateMainSlider());
    if (mainTabsContainerRef.current) {
      resizeObserver.observe(mainTabsContainerRef.current);
    }
    window.addEventListener('resize', updateMainSlider);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateMainSlider);
    };
  }, [updateMainSlider]);

  useEffect(() => {
    updateRequestsSlider();
    const resizeObserver = new ResizeObserver(() => updateRequestsSlider());
    if (requestsTabsContainerRef.current) {
      resizeObserver.observe(requestsTabsContainerRef.current);
    }
    window.addEventListener('resize', updateRequestsSlider);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRequestsSlider);
    };
  }, [updateRequestsSlider]);

  // Fetch payment settings
 useEffect(() => {
  const fetchPaymentSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'payment');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setGcashQRCode(data.gcashQRCode || '');
      }
      
      // Fetch bank accounts from bank_accounts collection (only non-archived ones)
      const bankAccountsRef = collection(db, 'bank_accounts');
      const q = query(bankAccountsRef, where('archived', '==', false));
      const bankAccountsSnapshot = await getDocs(q);
      const bankAccountsList = [];
      bankAccountsSnapshot.forEach((doc) => {
        bankAccountsList.push(doc.data());
      });
      setBankAccounts(bankAccountsList);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching payment settings:', error);
      setLoading(false);
    }
  };
  
  fetchPaymentSettings();
}, []);

  // Load viewed requests from localStorage
  useEffect(() => {
    const storedViewedRoom = localStorage.getItem('viewedRoomRequests');
    const storedViewedDayTour = localStorage.getItem('viewedDayTourRequests');
    if (storedViewedRoom) {
      setViewedRoomRequests(new Set(JSON.parse(storedViewedRoom)));
    }
    if (storedViewedDayTour) {
      setViewedDayTourRequests(new Set(JSON.parse(storedViewedDayTour)));
    }
  }, []);

  // Save viewed requests to localStorage
  const markRoomRequestsAsViewed = () => {
    const requestIds = bankTransferRequests.map(req => req.id);
    const newViewedSet = new Set([...viewedRoomRequests, ...requestIds]);
    setViewedRoomRequests(newViewedSet);
    localStorage.setItem('viewedRoomRequests', JSON.stringify([...newViewedSet]));
  };

  const markDayTourRequestsAsViewed = () => {
    const requestIds = dayTourBankRequests.map(req => req.id);
    const newViewedSet = new Set([...viewedDayTourRequests, ...requestIds]);
    setViewedDayTourRequests(newViewedSet);
    localStorage.setItem('viewedDayTourRequests', JSON.stringify([...newViewedSet]));
  };

  // Mark requests as viewed when tab is clicked
  const handleTabChange = (tab) => {
    setActiveRequestsTab(tab);
    if (tab === 'room') {
      markRoomRequestsAsViewed();
    } else if (tab === 'daytour') {
      markDayTourRequestsAsViewed();
    }
  };

  // Calculate unread counts - EXCLUDE completed requests (bank details already provided)
  const unreadRoomCount = bankTransferRequests.filter(req => !viewedRoomRequests.has(req.id) && req.status !== 'completed').length;
  const unreadDayTourCount = dayTourBankRequests.filter(req => !viewedDayTourRequests.has(req.id) && req.status !== 'completed').length;

  // Real-time listener for room bank transfer requests
  useEffect(() => {
    const bankRequestsRef = collection(db, 'bank_requests');
    const q = query(
      bankRequestsRef,
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const requests = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        requests.push({
          id: doc.id,
          ...data
        });
      });
      setBankTransferRequests(requests);
    }, (error) => {
      console.error('Error fetching bank transfer requests:', error);
    });
    
    return () => unsubscribe();
  }, []);

  // Real-time listener for DAY TOUR bank transfer requests (separate collection)
  useEffect(() => {
    const dayTourBankRequestsRef = collection(db, 'daytour_bank_requests');
    const q = query(
      dayTourBankRequestsRef,
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const requests = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        requests.push({
          id: doc.id,
          ...data
        });
      });
      setDayTourBankRequests(requests);
    }, (error) => {
      console.error('Error fetching day tour bank transfer requests:', error);
    });
    
    return () => unsubscribe();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 4000);
  };

  const handleGCashQRUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadingQR(true);
    try {
      const qrCodeUrl = await uploadImage(file);
      
      const settingsRef = doc(db, 'settings', 'payment');
      await setDoc(settingsRef, {
        gcashQRCode: qrCodeUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      setGcashQRCode(qrCodeUrl);
      
      await logAdminAction({
        action: 'Updated GCash QR Code',
        module: 'Payment Settings',
        details: 'Admin updated the GCash payment QR code'
      });
      
      showNotification('GCash QR code uploaded successfully!');
    } catch (error) {
      console.error('Error uploading QR code:', error);
      showNotification('Failed to upload QR code.', 'error');
    } finally {
      setUploadingQR(false);
    }
  };

const isBankFormValid = () => {
  const { bankName, accountName, accountNumber } = tempBankDetails;
  // Check if either account number OR QR code is provided (mutually exclusive logic)
  const hasAccountNumber = accountNumber.trim().length > 0;
  const hasQRCode = bankQRUrl !== '' || bankQRFile !== null;
  const isMutuallyExclusiveValid = (hasAccountNumber && !hasQRCode) || (!hasAccountNumber && hasQRCode);
  
  if (!bankName.trim() || !accountName.trim()) return false;
  if (!isMutuallyExclusiveValid) return false;
  
  // For edit mode, check if ANY changes were made
  if (editingBank) {
    // Check text field changes
    const hasTextChanges = 
      tempBankDetails.bankName !== originalBankDetails?.bankName ||
      tempBankDetails.accountName !== originalBankDetails?.accountName ||
      tempBankDetails.accountNumber !== originalBankDetails?.accountNumber ||
      tempBankDetails.showToGuest !== originalBankDetails?.showToGuest;
    
    // Check QR code changes (if original had QR and now has different QR, or if QR was added/removed)
    const hasQRChange = 
      (bankQRFile !== null) || // New QR uploaded
      (originalBankDetails?.qrCodeUrl !== '' && !bankQRFile && !bankQRUrl) || // QR was removed
      (originalBankDetails?.qrCodeUrl === '' && bankQRUrl !== '' && !bankQRFile); // QR was added from existing
    
    // Button is enabled if either text changed OR QR changed
    if (!hasTextChanges && !hasQRChange) return false;
  }
  
  return true;
};

  const handleArchiveGCashQR = async () => {
  setArchivingQR(true);
  try {
    // Get current QR code URL before archiving
    const currentQRCode = gcashQRCode;
    
    // Create archived QR code record
    const archivedQRRef = collection(db, 'archived_gcash_qr');
    await addDoc(archivedQRRef, {
      qrCodeUrl: currentQRCode,
      archivedAt: new Date().toISOString(),
      originalSettings: {
        gcashQRCode: currentQRCode
      }
    });
    
    // Remove QR code from settings
    const settingsRef = doc(db, 'settings', 'payment');
    await updateDoc(settingsRef, {
      gcashQRCode: ''
    });
    
    setGcashQRCode('');
    
    await logAdminAction({
      action: 'Archived GCash QR Code',
      module: 'Payment Settings',
      details: 'Admin archived the GCash payment QR code'
    });
    
    showNotification('GCash QR code archived successfully!');
    setShowArchiveQRModal(false);
  } catch (error) {
    console.error('Error archiving QR code:', error);
    showNotification('Failed to archive QR code.', 'error');
  } finally {
    setArchivingQR(false);
  }
};

  // Handle Account Number input – only numeric
  const handleAccountNumberChange = (e) => {
    const numericValue = e.target.value.replace(/\D/g, '');
    // Clear QR code if user starts typing account number
    if (numericValue.length > 0) {
      setBankQRFile(null);
      setBankQRPreview('');
      setBankQRUrl('');
      setTempBankDetails((prev) => ({ ...prev, showToGuest: false }));
    }
    handleBankDetailsChange('accountNumber', numericValue);
  };

  const handleRemoveGCashQR = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'payment');
      await updateDoc(settingsRef, {
        gcashQRCode: ''
      });
      
      setGcashQRCode('');
      
      await logAdminAction({
        action: 'Removed GCash QR Code',
        module: 'Payment Settings',
        details: 'Admin removed the GCash payment QR code'
      });
      
      showNotification('GCash QR code removed successfully!');
    } catch (error) {
      console.error('Error removing QR code:', error);
      showNotification('Failed to remove QR code.', 'error');
    }
  };

  // Handle editing GCash QR code
  const handleEditGCashQR = async () => {
    if (!tempQRFile) {
      showNotification('Please select a new QR code image', 'error');
      return;
    }
    
    setUploadingQR(true);
    try {
      const qrCodeUrl = await uploadImage(tempQRFile);
      
      const settingsRef = doc(db, 'settings', 'payment');
      await setDoc(settingsRef, {
        gcashQRCode: qrCodeUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      setGcashQRCode(qrCodeUrl);
      
      await logAdminAction({
        action: 'Edited GCash QR Code',
        module: 'Payment Settings',
        details: 'Admin edited the GCash payment QR code'
      });
      
      showNotification('GCash QR code updated successfully!');
      setShowEditQRModal(false);
      setTempQRFile(null);
      setTempQRPreview('');
    } catch (error) {
      console.error('Error editing QR code:', error);
      showNotification('Failed to update QR code.', 'error');
    } finally {
      setUploadingQR(false);
    }
  };

  const handleEditQRFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setTempQRFile(file);
    const previewUrl = URL.createObjectURL(file);
    setTempQRPreview(previewUrl);
  };

const handleAddBankAccount = async () => {
  // Validation: Must have either account number OR QR code, not both
  const hasAccountNumber = tempBankDetails.accountNumber.trim().length > 0;
  const hasQRCode = bankQRUrl !== '' || bankQRFile !== null;
  const shouldShowQrToGuest = hasQRCode && tempBankDetails.showToGuest === true;
  
  if (!tempBankDetails.bankName || !tempBankDetails.accountName) {
    showNotification('Please fill in all bank details', 'error');
    return;
  }
  
  if ((!hasAccountNumber && !hasQRCode) || (hasAccountNumber && hasQRCode)) {
    showNotification('Please provide either Account Number OR QR Code, not both.', 'error');
    return;
  }

  if (shouldShowQrToGuest) {
    const alreadyVisibleQr = bankAccounts.find(
      (account) => account.qrCodeUrl && account.showToGuest === true && !account.archived
    );
    if (alreadyVisibleQr) {
      showNotification('Only one QR code can be displayed to the guest at a time.', 'error');
      return;
    }
  }
  
  setSaving(true);
  try {
    let qrCodeUrl = '';
    if (hasQRCode && bankQRFile) {
      qrCodeUrl = await uploadImage(bankQRFile);
    }
    
    // Create new bank account with archived: false
    const newBankAccount = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bankName: tempBankDetails.bankName,
      accountName: tempBankDetails.accountName,
      accountNumber: hasAccountNumber ? tempBankDetails.accountNumber : '', // Empty if QR is used
      qrCodeUrl: hasQRCode ? qrCodeUrl : '', // Empty if account number is used
      showToGuest: shouldShowQrToGuest,
      createdAt: new Date().toISOString(),
      archived: false // Add archived flag
    };
    
    // Save directly to the bank_accounts collection
    const bankAccountsRef = collection(db, 'bank_accounts');
    await addDoc(bankAccountsRef, newBankAccount);
    
    // Also add to local state for UI display
    const updatedBankAccounts = [...bankAccounts, { ...newBankAccount, firestoreId: newBankAccount.id }];
    setBankAccounts(updatedBankAccounts);
    
    await logAdminAction({
      action: 'Added Bank Account',
      module: 'Payment Settings',
      details: `Admin added bank account: ${tempBankDetails.bankName} - ${tempBankDetails.accountName}`
    });
    
    showNotification('Bank account added successfully!');
    setShowAddBankModal(false);
    // Reset form
    setTempBankDetails({ bankName: '', accountName: '', accountNumber: '', showToGuest: false });
    setBankQRFile(null);
    setBankQRPreview('');
    setBankQRUrl('');
  } catch (error) {
    console.error('Error adding bank account:', error);
    showNotification('Failed to add bank account.', 'error');
  } finally {
    setSaving(false);
  }
};

// Replace the handleUpdateBankAccount function
const handleUpdateBankAccount = async () => {
  // Validation: Must have either account number OR QR code, not both
  const hasAccountNumber = tempBankDetails.accountNumber.trim().length > 0;
  const hasQRCode = bankQRUrl !== '' || bankQRFile !== null;
  const shouldShowQrToGuest = hasQRCode && tempBankDetails.showToGuest === true;
  
  if (!tempBankDetails.bankName || !tempBankDetails.accountName) {
    showNotification('Please fill in all bank details', 'error');
    return;
  }
  
  if ((!hasAccountNumber && !hasQRCode) || (hasAccountNumber && hasQRCode)) {
    showNotification('Please provide either Account Number OR QR Code, not both.', 'error');
    return;
  }

  if (shouldShowQrToGuest) {
    const alreadyVisibleQr = bankAccounts.find(
      (account) =>
        account.id !== editingBank.id &&
        account.qrCodeUrl &&
        account.showToGuest === true &&
        !account.archived
    );
    if (alreadyVisibleQr) {
      showNotification('Only one QR code can be displayed to the guest at a time.', 'error');
      return;
    }
  }
  
  setSaving(true);
  try {
    let qrCodeUrl = editingBank.qrCodeUrl || '';
    if (hasQRCode && bankQRFile) {
      qrCodeUrl = await uploadImage(bankQRFile);
    } else if (!hasQRCode) {
      qrCodeUrl = '';
    }
    
    // Find the bank account document in bank_accounts collection
    const bankAccountsRef = collection(db, 'bank_accounts');
    const q = query(bankAccountsRef, where('id', '==', editingBank.id));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const bankDoc = querySnapshot.docs[0];
      const bankRef = doc(db, 'bank_accounts', bankDoc.id);
      
      await updateDoc(bankRef, {
        bankName: tempBankDetails.bankName,
        accountName: tempBankDetails.accountName,
        accountNumber: hasAccountNumber ? tempBankDetails.accountNumber : '',
        qrCodeUrl: qrCodeUrl,
        showToGuest: shouldShowQrToGuest,
        updatedAt: new Date().toISOString()
      });
    }
    
    // Update local state
    const updatedBankAccounts = bankAccounts.map(account => 
      account.id === editingBank.id 
        ? { ...account, ...tempBankDetails, accountNumber: hasAccountNumber ? tempBankDetails.accountNumber : '', qrCodeUrl: qrCodeUrl, showToGuest: shouldShowQrToGuest, updatedAt: new Date().toISOString() }
        : account
    );
    
    setBankAccounts(updatedBankAccounts);
    
    await logAdminAction({
      action: 'Updated Bank Account',
      module: 'Payment Settings',
      details: `Admin updated bank account: ${tempBankDetails.bankName} - ${tempBankDetails.accountName}`
    });
    
    showNotification('Bank account updated successfully!');
    setShowAddBankModal(false);
    setEditingBank(null);
    setTempBankDetails({ bankName: '', accountName: '', accountNumber: '', showToGuest: false });
    setBankQRFile(null);
    setBankQRPreview('');
    setBankQRUrl('');
    setHasBankChanges(false);
    setOriginalBankDetails(null);
  } catch (error) {
    console.error('Error updating bank account:', error);
    showNotification('Failed to update bank account.', 'error');
  } finally {
    setSaving(false);
  }
};

// Replace the handleArchiveBankAccount function
const handleArchiveBankAccount = async () => {
  if (!bankToArchive) return;
  
  setSaving(true);
  try {
    // Find the bank account in bank_accounts collection
    const bankAccountsRef = collection(db, 'bank_accounts');
    const q = query(bankAccountsRef, where('id', '==', bankToArchive.id));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const bankDoc = querySnapshot.docs[0];
      const bankRef = doc(db, 'bank_accounts', bankDoc.id);
      
      // Update the bank account: set archived to true and add archivedAt
      await updateDoc(bankRef, {
        archived: true,
        archivedAt: new Date().toISOString()
      });
    }
    
    // Update local state - filter out archived accounts from active list
    const updatedBankAccounts = bankAccounts.filter(account => account.id !== bankToArchive.id);
    setBankAccounts(updatedBankAccounts);
    
    await logAdminAction({
      action: 'Archived Bank Account',
      module: 'Payment Settings',
      details: `Archived bank account: ${bankToArchive.bankName} - ${bankToArchive.accountName}`
    });
    
    showNotification('Bank account archived successfully!');
    setShowArchiveModal(false);
    setBankToArchive(null);
  } catch (error) {
    console.error('Error archiving bank account:', error);
    showNotification('Failed to archive bank account.', 'error');
  } finally {
    setSaving(false);
  }
};

  const openEditBankModal = (account) => {
    setEditingBank(account);
    setOriginalBankDetails({
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      showToGuest: account.showToGuest === true,
      qrCodeUrl: account.qrCodeUrl || '' 
    });
    setTempBankDetails({
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber || '', // Ensure it's a string
      showToGuest: account.showToGuest === true
    });
    // Set existing QR if present
    if (account.qrCodeUrl) {
      setBankQRUrl(account.qrCodeUrl);
      setBankQRPreview(account.qrCodeUrl);
    } else {
      setBankQRUrl('');
      setBankQRPreview('');
    }
    setBankQRFile(null);
    setHasBankChanges(false);
    setShowAddBankModal(true);
  };

  const handleBankDetailsChange = (field, value) => {
    const newDetails = { ...tempBankDetails, [field]: value };
    setTempBankDetails(newDetails);
    
    // Check if any changes were made
    if (originalBankDetails) {
      const hasChanges = 
        newDetails.bankName !== originalBankDetails.bankName ||
        newDetails.accountName !== originalBankDetails.accountName ||
        newDetails.accountNumber !== originalBankDetails.accountNumber ||
        newDetails.showToGuest !== originalBankDetails.showToGuest;
      setHasBankChanges(hasChanges);
    } else {
      setHasBankChanges(true);
    }
  };

  const openArchiveModal = (account) => {
    setBankToArchive(account);
    setShowArchiveModal(true);
  };

  // Open confirmation dialog with the guest's requested bank details
  const openConfirmationDialog = (request) => {
    if (request.status === 'completed') {
      showNotification('Bank details already provided for this request.', 'error');
      return;
    }
    
    // Use the bank details that the guest originally requested
    const requestedBank = request.requestedBank;
    if (!requestedBank) {
      showNotification('No bank account was requested by the guest.', 'error');
      return;
    }
    
    setSelectedRequest({ ...request, requestType: activeRequestsTab });
    setShowConfirmationModal(true);
  };

  // Handle providing bank details after confirmation - send the guest's requested bank
  const handleConfirmSendBankDetails = async () => {
    if (!selectedRequest) return;
    
    // Use the bank details that the guest originally requested
    const bankToSend = selectedRequest.requestedBank;
    if (!bankToSend) {
      showNotification('No bank account was requested by the guest.', 'error');
      setShowConfirmationModal(false);
      setSelectedRequest(null);
      return;
    }
    
    setSaving(true);
    try {
      const isDayTour = selectedRequest.requestType === 'daytour';
      const collectionName = isDayTour ? 'daytour_bank_requests' : 'bank_requests';
      const bankRequestRef = doc(db, collectionName, selectedRequest.id);
      
      await updateDoc(bankRequestRef, {
        status: 'completed',
        providedBankDetails: {
          bankName: bankToSend.bankName,
          accountName: bankToSend.accountName,
          accountNumber: bankToSend.accountNumber || 'QR Code Provided',
          qrCodeUrl: bankToSend.qrCodeUrl || '',
          providedAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Provided Bank Details',
        module: isDayTour ? 'Day Tour Payment' : 'Room Payment',
        details: `Provided bank details to guest: ${selectedRequest.guestName} for ${isDayTour ? 'day tour' : 'room'} booking`
      });
      
      showNotification('Bank details sent to guest successfully!');
      setShowConfirmationModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error providing bank details:', error);
      showNotification('Failed to send bank details.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  // Filter out archived bank accounts from display
  const activeBankAccounts = bankAccounts.filter(account => !account.archived);

  const normalizeDateText = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).toLowerCase();
    return `${d.toLocaleDateString()} ${d.toLocaleString()}`.toLowerCase();
  };

  const roomRequestsFiltered = bankTransferRequests.filter((request) => {
    const q = requestsSearchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      String(request.guestName || '').toLowerCase().includes(q) ||
      String(request.guestEmail || '').toLowerCase().includes(q) ||
      String(request.requestedBank?.bankName || '').toLowerCase().includes(q) ||
      String(request.requestedBank?.accountName || '').toLowerCase().includes(q) ||
      String(request.requestedBank?.accountNumber || '').toLowerCase().includes(q) ||
      normalizeDateText(request.createdAt).includes(q)
    );
  });

  const dayTourRequestsFiltered = dayTourBankRequests.filter((request) => {
    const q = requestsSearchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      String(request.guestName || '').toLowerCase().includes(q) ||
      String(request.guestEmail || '').toLowerCase().includes(q) ||
      String(request.requestedBank?.bankName || '').toLowerCase().includes(q) ||
      String(request.requestedBank?.accountName || '').toLowerCase().includes(q) ||
      String(request.requestedBank?.accountNumber || '').toLowerCase().includes(q) ||
      String(request.selectedDate || '').toLowerCase().includes(q) ||
      normalizeDateText(request.createdAt).includes(q)
    );
  });

  // Handler for QR Code file selection in Add Bank Modal
const handleBankQRFileSelect = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // Clear account number if QR is selected
  if (tempBankDetails.accountNumber) {
    handleBankDetailsChange('accountNumber', '');
  }
  
  setBankQRFile(file);
  const previewUrl = URL.createObjectURL(file);
  setBankQRPreview(previewUrl);
  setBankQRUrl('');
  
  // Mark that changes have been made (QR image changed)
  if (editingBank) {
    // Check if the new QR is different from the original
    const hasQRChange = originalBankDetails?.qrCodeUrl !== '' || true;
    if (hasQRChange) {
      setHasBankChanges(true);
    }
  }
};

  if (loading) {
    return (
      <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
<div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
  <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
    Payment Settings
  </h1>
  <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
    Manage GCash QR code, bank account details, and provide bank transfer information for guest payment requests.
  </p>
</div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
          notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
        }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle text-red-500' : 'fas fa-check-circle text-green-500'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Main Tabs - Copied from day-tour/page.js */}
      <div className="relative flex items-center mb-8 border-b border-[#4D8CF5]/20">
        <div className="relative flex w-full" ref={mainTabsContainerRef}>
          {/* Sliding background */}
          <div
            ref={mainSliderRef}
            className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
          />

          {/* Payment Settings Tab */}
          <div className="flex-1 flex justify-center">
            <button
              ref={(el) => { mainButtonRefs.current['paymentSettings'] = el; }}
              onClick={() => setActiveMainTab('paymentSettings')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeMainTab === 'paymentSettings'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-credit-card"></i>
              Payment Settings
            </button>
          </div>

          {/* Bank Transfer Requests Tab */}
          <div className="flex-1 flex justify-center">
            <button
              ref={(el) => { mainButtonRefs.current['bankTransferRequests'] = el; }}
              onClick={() => setActiveMainTab('bankTransferRequests')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeMainTab === 'bankTransferRequests'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-exchange-alt"></i>
              Bank Transfer Requests
              {(unreadRoomCount > 0 || unreadDayTourCount > 0) && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {unreadRoomCount + unreadDayTourCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Payment Settings Tab Content */}
      {activeMainTab === 'paymentSettings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* GCash Settings */}
          <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden">
            {/* Header */}
            <div className="bg-[#4D8CF5]/10 px-6 py-4 border-b border-[#4D8CF5]/20 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-wallet"></i>
                GCash QR Code
              </h2>
              {gcashQRCode && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEditQRModal(true)}
                    className="px-4 py-2 rounded-lg border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-sm font-medium flex items-center justify-center"
                    title="Edit QR Code"
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    onClick={() => setShowArchiveQRModal(true)}
                    className="px-4 py-2 rounded-lg border border-[#F59E0B]/20 bg-white/70 text-[#C2410C] shadow-sm hover:bg-[#F59E0B] hover:text-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/70 disabled:hover:text-[#C2410C]"
                    title="Archive QR Code"
                  >
                    <i className="fas fa-archive"></i>
                  </button>
                </div>
              )}
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                {gcashQRCode ? (
                  <div className="relative inline-block">
                    <div className="w-48 h-48 bg-white rounded-xl border border-ocean-light/20 overflow-hidden relative">
                      <Image
                        src={gcashQRCode}
                        alt="GCash QR Code"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-ocean-light/20 rounded-xl p-8 text-center hover:border-ocean-light transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleGCashQRUpload}
                      disabled={uploadingQR}
                      className="hidden"
                      id="gcash-qr-upload"
                    />
                    <label
                      htmlFor="gcash-qr-upload"
                      className="cursor-pointer flex flex-col items-center gap-3"
                    >
                      <i className={`fas ${uploadingQR ? 'fa-spinner fa-spin' : 'fa-qrcode'} text-5xl text-ocean-light`}></i>
                      <span className="text-sm text-textSecondary">
                        {uploadingQR ? 'Uploading...' : 'Click to upload GCash QR code'}
                      </span>
                      <span className="text-xs text-neutral">PNG, JPG up to 5MB</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bank Account Settings */}
          <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden">
            {/* Header */}
            <div className="bg-[#4D8CF5]/10 px-6 py-4 border-b border-[#4D8CF5]/20 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-university"></i>
                Bank Accounts
              </h2>
              <button
                onClick={() => {
                  setEditingBank(null);
                  setOriginalBankDetails(null);
                  setTempBankDetails({ bankName: '', accountName: '', accountNumber: '', showToGuest: false });
                  setBankQRFile(null);
                  setBankQRPreview('');
                  setBankQRUrl('');
                  setHasBankChanges(false);
                  setShowAddBankModal(true);
                }}
                className="px-4 py-2 rounded-lg border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-sm font-medium flex items-center justify-center"
              >
                <i className="fas fa-plus mr-1"></i> Add Account
              </button>
            </div>
            
            <div className="p-6">
              {activeBankAccounts.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-university text-4xl text-ocean-light/30 mb-2"></i>
                  <p className="text-textSecondary">No bank accounts added yet</p>
                  <button
                    onClick={() => {
                      setEditingBank(null);
                      setOriginalBankDetails(null);
                      setTempBankDetails({ bankName: '', accountName: '', accountNumber: '', showToGuest: false });
                      setBankQRFile(null);
                      setBankQRPreview('');
                      setBankQRUrl('');
                      setHasBankChanges(false);
                      setShowAddBankModal(true);
                    }}
                    className="mt-3 text-sm text-ocean-mid hover:underline"
                  >
                    Add your first bank account
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeBankAccounts.map((account) => (
                    <div key={account.id} className="border border-ocean-light/20 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-semibold text-textPrimary">{account.bankName}</p>
                          <p className="text-sm text-textSecondary mt-1">{account.accountName}</p>
                          {account.accountNumber ? (
                            <p className="text-sm text-textSecondary">{account.accountNumber}</p>
                          ) : account.qrCodeUrl ? (
                            <div className="mt-1 flex items-center gap-2">
                              <i className="fas fa-qrcode text-ocean-mid text-sm"></i>
                              <span className="text-sm text-textSecondary">QR Code provided</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditBankModal(account)}
                            className="p-2 rounded-lg bg-[#93C5FD]/10 text-[#1E3A8A] border border-[#93C5FD]/15 hover:bg-[#93C5FD]/60 hover:text-white transition-all duration-200"
                            title="Edit"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => openArchiveModal(account)}
                            className="p-2 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] border border-[#F59E0B]/20 hover:bg-[#F59E0B] hover:text-white transition-all duration-200"
                            title="Archive"
                          >
                            <i className="fas fa-archive"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bank Transfer Requests Tab Content */}
   {activeMainTab === 'bankTransferRequests' && (
  <div className="bg-white rounded-2xl shadow-lg border border-[#4D8CF5]/10 overflow-hidden">
    {/* Tabs for Room vs Day Tour - IMPROVED ACTIVE STATE */}
    <div className="relative flex items-center justify-between border-b border-[#4D8CF5]/20 px-6 bg-gradient-to-r from-white to-[#F8FBFF]">
      <div
        className="relative flex justify-between items-center w-full gap-8"
        ref={requestsTabsContainerRef}
      >
        {/* Sliding background */}
        <div
          ref={requestsSliderRef}
          className="absolute bottom-0 left-0 h-0.5 bg-[#1E3A8A] transition-all duration-300 ease-in-out"
        />

        {/* Room Bookings Tab */}
        <button
          ref={(el) => { requestsButtonRefs.current['room'] = el; }}
          onClick={() => handleTabChange('room')}
          className={`relative z-10 flex-1 px-2 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeRequestsTab === 'room'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-bed text-sm"></i>
          <span>Room Bookings</span>
          {unreadRoomCount > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full shadow-sm">
              {unreadRoomCount}
            </span>
          )}
        </button>

        {/* Day Tour Bookings Tab */}
        <button
          ref={(el) => { requestsButtonRefs.current['daytour'] = el; }}
          onClick={() => handleTabChange('daytour')}
          className={`relative z-10 flex-1 px-2 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeRequestsTab === 'daytour'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-sun text-sm"></i>
          <span>Day Tour Bookings</span>
          {unreadDayTourCount > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full shadow-sm">
              {unreadDayTourCount}
            </span>
          )}
        </button>
      </div>
    </div>

          {/* Search Filter - FULL WIDTH with improved alignment */}
<div className="px-6 pt-5 pb-3">
  <div className="relative w-full group">
    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>
    
    <input
      type="text"
      value={requestsSearchTerm}
      onChange={(e) => setRequestsSearchTerm(e.target.value)}
      placeholder="Search by name, email, bank account, or date"
      className="w-full pl-11 pr-4 py-3 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
    />
  </div>
</div>
          
          <div className="p-6 pt-2">
            {/* Room Bookings Requests - IMPROVED CARD DESIGN */}
            {activeRequestsTab === 'room' && (
              <>
                {roomRequestsFiltered.length === 0 ? (
                  <div className="text-center py-12">
                    <i className="fas fa-check-circle text-5xl text-green-300 mb-3"></i>
                    <p className="text-textSecondary">No bank transfer requests for room bookings</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {roomRequestsFiltered.map((request) => {
                      const isCompleted = request.status === 'completed';
                      const isNew = !viewedRoomRequests.has(request.id);
                      const cardBorderClass = isNew && !isCompleted 
                        ? 'border-l-4 border-l-amber-400 border border-amber-200 bg-amber-50/20' 
                        : 'border border-gray-200';

                      return (
                        <div key={request.id} className={`${cardBorderClass} rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col`}>
                          {/* Card Header */}
                          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/30">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-800">
                                  {request.guestName}
                                </p>
                                {isNew && !isCompleted && (
                                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <span>{getTimeAgo(request.createdAt)}</span>
                                <span className="text-gray-300">•</span>
                                <span title={new Date(request.createdAt).toLocaleString()}>
                                  {new Date(request.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-4 space-y-3 flex-1">
                            {/* Contact Info */}
                            <div className="space-y-1">
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <i className="fas fa-envelope text-gray-400 text-xs w-4"></i>
                                {request.guestEmail}
                              </p>
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <i className="fas fa-phone text-gray-400 text-xs w-4"></i>
                                {request.guestPhone}
                              </p>
                            </div>

                            {/* Booking Details */}
                            <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                              <p className="text-sm font-medium text-gray-700 flex justify-between">
                                <span>Room:</span>
                                <span className="font-normal">{request.roomType}</span>
                              </p>
                              <p className="text-sm text-gray-600 flex justify-between">
                                <span>Total:</span>
                                <span>₱{request.totalPrice?.toLocaleString()}</span>
                              </p>
                              <p className="text-sm font-semibold text-amber-600 flex justify-between">
                                <span>Down Payment (50%):</span>
                                <span>₱{request.downPayment?.toLocaleString()}</span>
                              </p>
                            </div>

                            {/* Requested Bank Details - Clean & Organized */}
                            {request.requestedBank && (
                              <div className="border-t border-gray-100 pt-2 mt-1">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <i className="fas fa-university"></i>
                                  Requested Bank
                                </p>
                                <div className="bg-blue-50/30 rounded-lg p-2 space-y-1">
                                  <p className="text-sm font-medium text-gray-800">{request.requestedBank.bankName}</p>
                                  <p className="text-xs text-gray-600">{request.requestedBank.accountName}</p>
                                  {request.requestedBank.qrCodeUrl ? (
                                    <div className="mt-2 flex flex-col items-start">
                                      <div className="w-16 h-16 bg-white rounded border border-gray-200 overflow-hidden relative">
                                        <img
                                          src={request.requestedBank.qrCodeUrl}
                                          alt="Bank QR Code"
                                          className="object-contain w-full h-full"
                                        />
                                      </div>
                                      <p className="text-[11px] text-gray-500 mt-1">QR Code</p>
                                    </div>
                                  ) : request.requestedBank.accountNumber && request.requestedBank.accountNumber !== 'QR Code Provided' ? (
                                    <p className="text-xs text-gray-600 break-all">
                                      <span className="font-medium">Account No.:</span> {request.requestedBank.accountNumber}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            )}

                            {isCompleted && request.providedBankDetails && (
                              <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded-lg flex items-start gap-2">
                                <i className="fas fa-check-circle mt-0.5"></i>
                                <span>Bank details sent: {request.providedBankDetails.bankName} - {request.providedBankDetails.accountName}</span>
                              </div>
                            )}
                          </div>

                          {/* Card Footer */}
                          <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100">
                            {!isCompleted ? (
                              <button
                                onClick={() => openConfirmationDialog(request)}
                                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-paper-plane text-xs"></i>
                                Provide Bank Details
                              </button>
                            ) : (
                              <div className="w-full py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                                <i className="fas fa-check-circle"></i>
                                Already Provided
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Day Tour Bookings Requests - IMPROVED CARD DESIGN */}
            {activeRequestsTab === 'daytour' && (
              <>
                {dayTourRequestsFiltered.length === 0 ? (
                  <div className="text-center py-12">
                    <i className="fas fa-sun text-5xl text-amber-300 mb-3"></i>
                    <p className="text-textSecondary">No bank transfer requests for day tour bookings</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {dayTourRequestsFiltered.map((request) => {
                      const isCompleted = request.status === 'completed';
                      const isNew = !viewedDayTourRequests.has(request.id);
                      const cardBorderClass = isNew && !isCompleted 
                        ? 'border-l-4 border-l-amber-400 border border-amber-200 bg-amber-50/20' 
                        : 'border border-gray-200';

                      return (
                        <div key={request.id} className={`${cardBorderClass} rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col`}>
                          {/* Card Header */}
                          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/30">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-800">
                                  {request.guestName}
                                </p>
                                {isNew && !isCompleted && (
                                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <span>{getTimeAgo(request.createdAt)}</span>
                                <span className="text-gray-300">•</span>
                                <span title={new Date(request.createdAt).toLocaleString()}>
                                  {new Date(request.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-4 space-y-3 flex-1">
                            {/* Contact Info */}
                            <div className="space-y-1">
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <i className="fas fa-envelope text-gray-400 text-xs w-4"></i>
                                {request.guestEmail}
                              </p>
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <i className="fas fa-phone text-gray-400 text-xs w-4"></i>
                                {request.guestPhone}
                              </p>
                            </div>

                            {/* Booking Details */}
                            <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                              <p className="text-sm text-gray-600 flex justify-between">
                                <span>Selected Date:</span>
                                <span className="font-medium">{request.selectedDate}</span>
                              </p>
                              <p className="text-sm text-gray-600 flex justify-between">
                                <span>Total:</span>
                                <span>₱{request.totalAmount?.toLocaleString()}</span>
                              </p>
                              <p className="text-sm font-semibold text-amber-600 flex justify-between">
                                <span>Down Payment (50%):</span>
                                <span>₱{request.downPaymentRequired?.toLocaleString()}</span>
                              </p>
                            </div>

                            {/* Requested Bank Details - Clean & Organized */}
                            {request.requestedBank && (
                              <div className="border-t border-gray-100 pt-2 mt-1">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <i className="fas fa-university"></i>
                                  Requested Bank
                                </p>
                                <div className="bg-blue-50/30 rounded-lg p-2 space-y-1">
                                  <p className="text-sm font-medium text-gray-800">{request.requestedBank.bankName}</p>
                                  <p className="text-xs text-gray-600">{request.requestedBank.accountName}</p>
                                  {request.requestedBank.qrCodeUrl ? (
                                    <div className="mt-2 flex flex-col items-start">
                                      <div className="w-16 h-16 bg-white rounded border border-gray-200 overflow-hidden relative">
                                        <img
                                          src={request.requestedBank.qrCodeUrl}
                                          alt="Bank QR Code"
                                          className="object-contain w-full h-full"
                                        />
                                      </div>
                                      <p className="text-[11px] text-gray-500 mt-1">QR Code</p>
                                    </div>
                                  ) : request.requestedBank.accountNumber && request.requestedBank.accountNumber !== 'QR Code Provided' ? (
                                    <p className="text-xs text-gray-600 break-all">
                                      <span className="font-medium">Account No.:</span> {request.requestedBank.accountNumber}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            )}

                            {isCompleted && request.providedBankDetails && (
                              <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded-lg flex items-start gap-2">
                                <i className="fas fa-check-circle mt-0.5"></i>
                                <span>Bank details sent: {request.providedBankDetails.bankName} - {request.providedBankDetails.accountName}</span>
                              </div>
                            )}
                          </div>

                          {/* Card Footer */}
                          <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100">
                            {!isCompleted ? (
                              <button
                                onClick={() => openConfirmationDialog(request)}
                                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors duration-200 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-paper-plane text-xs"></i>
                                Provide Bank Details
                              </button>
                            ) : (
                              <div className="w-full py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                                <i className="fas fa-check-circle"></i>
                                Already Provided
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Bank Account Modal - REDUCED HEIGHT (more compact) */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddBankModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-textPrimary font-playfair">
                {editingBank ? 'Edit Bank Account' : 'Add Bank Account'}
              </h2>
              <button
                onClick={() => {
                  setShowAddBankModal(false);
                  setHasBankChanges(false);
                  setOriginalBankDetails(null);
                  setBankQRFile(null);
                  setBankQRPreview('');
                  setBankQRUrl('');
                }}
                className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-1.5">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={tempBankDetails.bankName}
                  onChange={(e) => handleBankDetailsChange('bankName', e.target.value)}
                  placeholder="e.g., BDO, BPI, Metrobank"
                  className="w-full px-4 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-1.5">
                  Account Name
                </label>
                <input
                  type="text"
                  value={tempBankDetails.accountName}
                  onChange={(e) => handleBankDetailsChange('accountName', e.target.value)}
                  placeholder="Account holder's name"
                  className="w-full px-4 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light"
                />
              </div>
              
              {/* Helper Text */}
              <div className="text-xs text-amber-600 bg-amber-50 p-1.5 rounded-lg flex items-center gap-1.5">
                <i className="fas fa-info-circle text-xs"></i>
                <span>Choose only one: Account Number or QR Code.</span>
              </div>

              {/* Account Number Field - Disabled if QR is uploaded */}
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-1.5">
                  Account Number
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tempBankDetails.accountNumber}
                  onChange={handleAccountNumberChange}
                  placeholder="Account number"
                  disabled={bankQRFile !== null || bankQRPreview !== ''}
                  className={`w-full px-4 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light ${(bankQRFile !== null || bankQRPreview !== '') ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* QR Code Upload Field - Disabled if Account Number is entered */}
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-1.5">
                  QR Code Image
                </label>
                <div className={`border-2 border-dashed border-ocean-light/20 rounded-xl p-3 text-center transition-colors ${tempBankDetails.accountNumber ? 'opacity-50 bg-gray-50' : 'hover:border-ocean-light'}`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBankQRFileSelect}
                    disabled={tempBankDetails.accountNumber.length > 0}
                    className="hidden"
                    id="bank-qr-upload"
                  />
                  <label
                    htmlFor="bank-qr-upload"
                    className={`cursor-pointer flex flex-col items-center gap-1.5 ${tempBankDetails.accountNumber ? 'cursor-not-allowed' : ''}`}
                  >
                    {bankQRPreview ? (
                      <div className="relative w-20 h-20">
                        <Image
                          src={bankQRPreview}
                          alt="Bank QR Code Preview"
                          fill
                          className="object-contain rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setBankQRFile(null);
                            setBankQRPreview('');
                            setBankQRUrl('');
                            setTempBankDetails((prev) => ({ ...prev, showToGuest: false }));
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ) : (
                      <>
                        <i className="fas fa-qrcode text-2xl text-ocean-light"></i>
                        <span className="text-xs text-textSecondary">
                          Click to upload QR code
                        </span>
                      </>
                    )}
                    <span className="text-xs text-neutral">PNG, JPG up to 5MB</span>
                  </label>
                </div>
              </div>

              {(bankQRFile !== null || bankQRPreview !== '' || bankQRUrl !== '') && (
                <div>
                  <label className="block text-sm font-semibold text-textPrimary mb-1.5">
                    QR Code Visibility
                  </label>
<div className="relative">
  <select
    value={tempBankDetails.showToGuest ? 'show' : 'hide'}
    onChange={(e) =>
      handleBankDetailsChange('showToGuest', e.target.value === 'show')
    }
    className="w-full px-4 py-2 pr-10 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light appearance-none cursor-pointer transition-all duration-200"
  >
    <option value="show">Show this to the guest</option>
    <option value="hide">Don&apos;t show this to the guest</option>
  </select>

  {/* Custom dropdown arrow */}
  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ocean-light text-xs">
    ▼
  </div>
</div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => {
                  setShowAddBankModal(false);
                  setHasBankChanges(false);
                  setOriginalBankDetails(null);
                  setBankQRFile(null);
                  setBankQRPreview('');
                  setBankQRUrl('');
                  setEditingBank(null);
                }}
                className="px-4 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={editingBank ? handleUpdateBankAccount : handleAddBankAccount}
                disabled={saving || !isBankFormValid()}
                className="px-4 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : (editingBank ? 'Update' : 'Add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Sending Bank Details - Shows guest's requested bank automatically */}
      {showConfirmationModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="fas fa-paper-plane text-amber-600 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Confirm Send</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to send the bank account details to <strong>{selectedRequest.guestName}</strong>?
              </p>
            </div>
            {/* Display the guest's requested bank details */}
            <div className="bg-ocean-ice rounded-lg p-3 mb-5">
              <p className="text-xs font-semibold text-ocean-mid uppercase">Requested Bank</p>
              <p className="text-sm font-semibold text-textPrimary mt-1">{selectedRequest.requestedBank?.bankName}</p>
              <p className="text-sm text-textSecondary">{selectedRequest.requestedBank?.accountName}</p>
              {selectedRequest.requestedBank?.qrCodeUrl ? (
                <div className="mt-2">
                  <div className="w-32 h-32 bg-white rounded border border-ocean-light/20 overflow-hidden relative mx-auto">
                    <img
                      src={selectedRequest.requestedBank.qrCodeUrl}
                      alt="Bank QR Code"
                      className="object-contain w-full h-full"
                    />
                  </div>
                  <p className="text-xs text-center text-textSecondary mt-1">QR Code</p>
                </div>
              ) : selectedRequest.requestedBank?.accountNumber && selectedRequest.requestedBank.accountNumber !== 'QR Code Provided' ? (
                <p className="text-sm text-textSecondary">{selectedRequest.requestedBank.accountNumber}</p>
              ) : null}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setShowConfirmationModal(false);
                  setSelectedRequest(null);
                }}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSendBankDetails}
                disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white text-sm font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              >
                {saving ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal for Bank Account */}
      {showArchiveModal && bankToArchive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="fas fa-archive text-amber-600 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Archive Bank Account</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to archive "{bankToArchive.bankName}"? 
                This account will be moved to the archive and won't be available for new bank transfer requests.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowArchiveModal(false)}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveBankAccount}
                disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                {saving ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit GCash QR Code Modal */}
      {showEditQRModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEditQRModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                Edit GCash QR Code
              </h2>
              <button
                onClick={() => {
                  setShowEditQRModal(false);
                  setTempQRFile(null);
                  setTempQRPreview('');
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-3">
                  Current QR Code
                </label>
                <div className="w-32 h-32 bg-white rounded-xl border border-ocean-light/20 overflow-hidden relative mb-4">
                  <Image
                    src={gcashQRCode}
                    alt="Current GCash QR Code"
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-textPrimary mb-3">
                  New QR Code
                </label>
                <div className="border-2 border-dashed border-ocean-light/20 rounded-xl p-6 text-center hover:border-ocean-light transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditQRFileSelect}
                    disabled={uploadingQR}
                    className="hidden"
                    id="edit-qr-upload"
                  />
                  <label
                    htmlFor="edit-qr-upload"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    {tempQRPreview ? (
                      <div className="relative w-32 h-32">
                        <Image
                          src={tempQRPreview}
                          alt="New QR Code Preview"
                          fill
                          className="object-contain rounded-lg"
                        />
                      </div>
                    ) : (
                      <>
                        <i className="fas fa-qrcode text-4xl text-ocean-light"></i>
                        <span className="text-sm text-textSecondary">
                          Click to upload new QR code
                        </span>
                      </>
                    )}
                    <span className="text-xs text-neutral">PNG, JPG up to 5MB</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowEditQRModal(false);
                  setTempQRFile(null);
                  setTempQRPreview('');
                }}
                className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleEditGCashQR}
                disabled={uploadingQR || !tempQRFile}
                className="px-5 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingQR ? 'Uploading...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive GCash QR Code Confirmation Modal */}
{showArchiveQRModal && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
      <div className="text-center mb-5">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
          <i className="fas fa-archive text-amber-600 text-2xl"></i>
        </div>
        <h3 className="text-lg font-bold text-textPrimary mb-2">Archive GCash QR Code</h3>
        <p className="text-textSecondary text-sm">
          Are you sure you want to archive the current GCash QR code? 
          This will remove it from the payment settings and move it to the archive.
        </p>
      </div>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setShowArchiveQRModal(false)}
          className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
        >
          Cancel
        </button>
        <button
          onClick={handleArchiveGCashQR}
          disabled={archivingQR}
          className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white text-sm font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
        >
          {archivingQR ? 'Archiving...' : 'Archive'}
        </button>
      </div>
    </div>
  </div>
)}

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
      `}</style>
    </div>
  );
}