// app/dashboard/staff/payment/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, where, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { uploadImage } from '../../../../lib/cloudinary';
import { logAdminAction } from '../../../../lib/auditLogger';
import Image from 'next/image';

export default function StaffPaymentPage() {
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
  const [activeMainTab, setActiveMainTab] = useState('paymentSettings');
  const [activeRequestsTab, setActiveRequestsTab] = useState('room');
  const [viewedRoomRequests, setViewedRoomRequests] = useState(new Set());
  const [viewedDayTourRequests, setViewedDayTourRequests] = useState(new Set());
  const [requestsSearchTerm, setRequestsSearchTerm] = useState('');
  
  // State for view bank account details modal
  const [showViewBankModal, setShowViewBankModal] = useState(false);
  const [selectedBankForView, setSelectedBankForView] = useState(null);

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

  // REAL-TIME SYNC: Use onSnapshot for payment settings
  useEffect(() => {
    // Real-time listener for GCash payment settings
    const settingsRef = doc(db, 'settings', 'payment');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setGcashQRCode(data.gcashQRCode || '');
      }
    }, (error) => {
      console.error('Error fetching payment settings:', error);
    });
    
    // Real-time listener for bank accounts (only non-archived ones)
    const bankAccountsRef = collection(db, 'bank_accounts');
    const q = query(bankAccountsRef, where('archived', '==', false));
    const unsubscribeBankAccounts = onSnapshot(q, (querySnapshot) => {
      const bankAccountsList = [];
      querySnapshot.forEach((doc) => {
        bankAccountsList.push(doc.data());
      });
      setBankAccounts(bankAccountsList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching bank accounts:', error);
      setLoading(false);
    });
    
    return () => {
      unsubscribeSettings();
      unsubscribeBankAccounts();
    };
  }, []);

  // Load viewed requests from localStorage
  useEffect(() => {
    const storedViewedRoom = localStorage.getItem('staff_viewedRoomRequests');
    const storedViewedDayTour = localStorage.getItem('staff_viewedDayTourRequests');
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
    localStorage.setItem('staff_viewedRoomRequests', JSON.stringify([...newViewedSet]));
  };

  const markDayTourRequestsAsViewed = () => {
    const requestIds = dayTourBankRequests.map(req => req.id);
    const newViewedSet = new Set([...viewedDayTourRequests, ...requestIds]);
    setViewedDayTourRequests(newViewedSet);
    localStorage.setItem('staff_viewedDayTourRequests', JSON.stringify([...newViewedSet]));
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

  // STAFF RESTRICTION: No handleGCashQRUpload function - staff cannot upload QR codes
  // STAFF RESTRICTION: No handleAddBankAccount function - staff cannot add bank accounts
  // STAFF RESTRICTION: No handleUpdateBankAccount function - staff cannot update bank accounts
  // STAFF RESTRICTION: No handleArchiveBankAccount function - staff cannot archive bank accounts
  // STAFF RESTRICTION: No handleArchiveGCashQR function - staff cannot archive QR codes

  // Open view bank details modal
  const openViewBankModal = (account) => {
    setSelectedBankForView(account);
    setShowViewBankModal(true);
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
        details: `Staff provided bank details to guest: ${selectedRequest.guestName} for ${isDayTour ? 'day tour' : 'room'} booking`
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
    View payment settings and provide bank transfer information for guest payment requests.
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

      {/* Main Tabs */}
      <div className="relative flex items-center mb-8 border-b border-[#4D8CF5]/20">
        <div className="relative flex w-full" ref={mainTabsContainerRef}>
          {/* Sliding background */}
          <div
            ref={mainSliderRef}
            className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
          />

          {/* Payment Settings Tab (View Only for Staff) */}
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

      {/* Payment Settings Tab Content - VIEW ONLY for Staff */}
      {activeMainTab === 'paymentSettings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* GCash Settings - View Only */}
          <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden">
            {/* Header - No action buttons for staff */}
            <div className="bg-[#4D8CF5]/10 px-6 py-4 border-b border-[#4D8CF5]/20">
              <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-wallet"></i>
                GCash QR Code
              </h2>
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
                  <div className="border-2 border-dashed border-ocean-light/20 rounded-xl p-8 text-center">
                    <i className="fas fa-qrcode text-5xl text-ocean-light/30 mb-2"></i>
                    <p className="text-textSecondary">No QR code configured</p>
                    <p className="text-xs text-neutral mt-1">Please contact administrator</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bank Account Settings - View Only for Staff with View button */}
          <div className="bg-white rounded-2xl shadow-md border border-[#4D8CF5]/10 overflow-hidden">
            {/* Header - No "Add Account" button for staff */}
            <div className="bg-[#4D8CF5]/10 px-6 py-4 border-b border-[#4D8CF5]/20">
              <h2 className="text-xl font-bold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-university"></i>
                Bank Accounts
              </h2>
            </div>
            
            <div className="p-6">
              {activeBankAccounts.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-university text-4xl text-ocean-light/30 mb-2"></i>
                  <p className="text-textSecondary">No bank accounts configured</p>
                  <p className="text-xs text-neutral mt-1">Please contact administrator</p>
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
                            <p className="text-sm text-textSecondary">••••{account.accountNumber.slice(-4)}</p>
                          ) : account.qrCodeUrl ? (
                            <div className="mt-1 flex items-center gap-2">
                              <i className="fas fa-qrcode text-ocean-mid text-sm"></i>
                              <span className="text-sm text-textSecondary">QR Code provided</span>
                            </div>
                          ) : null}
                        </div>
                        {/* View button for staff to see full details */}
                        <button
                          onClick={() => openViewBankModal(account)}
                          className="p-2 rounded-lg bg-[#93C5FD]/10 text-[#1E3A8A] border border-[#93C5FD]/15 hover:bg-[#93C5FD]/60 hover:text-white transition-all duration-200"
                          title="View Details"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Bank Account Details Modal - REMOVED Close text button, Updated X button hover to square */}
      {showViewBankModal && selectedBankForView && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowViewBankModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                Bank Account Details
              </h2>
<button
  onClick={() => setShowViewBankModal(false)}
  className="w-8 h-8 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
>
  <i className="fas fa-times"></i>
</button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-ocean-ice rounded-lg p-4">
                <div className="mb-3">
                  <label className="text-xs font-semibold text-ocean-mid uppercase tracking-wider">Bank Name</label>
                  <p className="text-base font-semibold text-textPrimary mt-1">{selectedBankForView.bankName}</p>
                </div>
                
                <div className="mb-3">
                  <label className="text-xs font-semibold text-ocean-mid uppercase tracking-wider">Account Name</label>
                  <p className="text-base text-textPrimary mt-1">{selectedBankForView.accountName}</p>
                </div>
                
                {selectedBankForView.accountNumber ? (
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-ocean-mid uppercase tracking-wider">Account Number</label>
                    <p className="text-base text-textPrimary mt-1 font-mono tracking-wider">{selectedBankForView.accountNumber}</p>
                  </div>
                ) : selectedBankForView.qrCodeUrl ? (
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-ocean-mid uppercase tracking-wider">QR Code</label>
                    <div className="mt-2 flex justify-center">
                      <div className="w-48 h-48 bg-white rounded-xl border border-ocean-light/20 overflow-hidden relative">
                        <Image
                          src={selectedBankForView.qrCodeUrl}
                          alt="Bank QR Code"
                          fill
                          className="object-contain"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                
                <div>
                  <label className="text-xs font-semibold text-ocean-mid uppercase tracking-wider">Visibility to Guest</label>
                  <p className="text-base text-textPrimary mt-1">
                    {selectedBankForView.showToGuest ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <i className="fas fa-check-circle"></i> Visible to guests
                      </span>
                    ) : (
                      <span className="text-gray-500 flex items-center gap-1">
                        <i className="fas fa-eye-slash"></i> Not visible to guests
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Close text button removed - only X button remains */}
          </div>
        </div>
      )}

      {/* Bank Transfer Requests Tab Content - Staff CAN provide bank details */}
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
            {/* Room Bookings Requests */}
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

                            {/* Requested Bank Details */}
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

            {/* Day Tour Bookings Requests */}
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

                            {/* Requested Bank Details */}
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

      {/* Confirmation Modal for Sending Bank Details */}
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