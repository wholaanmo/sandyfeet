// app/dashboard/admin/archive/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, where, updateDoc, doc, deleteDoc, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { logAdminAction } from '../../../../lib/auditLogger';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function ArchivePage() {
  const [archivedRooms, setArchivedRooms] = useState([]);
  const [archivedDayTours, setArchivedDayTours] = useState([]);
  const [archivedActivities, setArchivedActivities] = useState([]);
  const [archivedBankAccounts, setArchivedBankAccounts] = useState([]);
  const [activeTab, setActiveTab] = useState('rooms');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [restoreModal, setRestoreModal] = useState({ show: false, item: null, type: '' });
  const [deleteModal, setDeleteModal] = useState({ show: false, item: null, type: '' });
  const [archivedGCashQRs, setArchivedGCashQRs] = useState([]);
  const router = useRouter();
  const tabsContainerRef = useRef(null);
const sliderRef = useRef(null);
const buttonRefs = useRef({});


  // Real-time listener for archived rooms
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const roomsList = [];
      querySnapshot.forEach((doc) => {
        roomsList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setArchivedRooms(roomsList);
    }, (error) => {
      console.error('Error fetching archived rooms:', error);
      showNotification('Failed to load archived rooms.', 'error');
    });
    
    return () => unsubscribe();
  }, []);
  
  // Real-time listener for archived day tours
  useEffect(() => {
    const toursRef = collection(db, 'dayTours');
    const q = query(toursRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const toursList = [];
      querySnapshot.forEach((doc) => {
        toursList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setArchivedDayTours(toursList);
    }, (error) => {
      console.error('Error fetching archived day tours:', error);
      showNotification('Failed to load archived day tours.', 'error');
    });
    
    return () => unsubscribe();
  }, []);
  
  // Real-time listener for archived activities
  useEffect(() => {
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const activitiesList = [];
      querySnapshot.forEach((doc) => {
        activitiesList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setArchivedActivities(activitiesList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching archived activities:', error);
      showNotification('Failed to load archived activities.', 'error');
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);
  
  // Real-time listener for archived bank accounts (single correct version)
  useEffect(() => {
    const bankAccountsRef = collection(db, 'bank_accounts');
    const q = query(bankAccountsRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const accountsList = [];
      querySnapshot.forEach((doc) => {
        accountsList.push({
          firestoreId: doc.id, // Store the actual Firestore document ID
          ...doc.data()
        });
      });
      setArchivedBankAccounts(accountsList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching archived bank accounts:', error);
      showNotification('Failed to load archived bank accounts.', 'error');
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
  const archivedQRRef = collection(db, 'archived_gcash_qr');
  const q = query(archivedQRRef, orderBy('archivedAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const qrList = [];
    querySnapshot.forEach((doc) => {
      qrList.push({
        firestoreId: doc.id,
        ...doc.data()
      });
    });
    setArchivedGCashQRs(qrList);
  }, (error) => {
    console.error('Error fetching archived GCash QR codes:', error);
    showNotification('Failed to load archived GCash QR codes.', 'error');
  });
  
  return () => unsubscribe();
}, []);

  // Auto-hide notification
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: '', type: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };
  
  const updateSlider = useCallback(() => {
  const activeButton = buttonRefs.current[activeTab];
  const container = tabsContainerRef.current;
  const slider = sliderRef.current;
  if (activeButton && container && slider) {
    const buttonRect = activeButton.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left = buttonRect.left - containerRect.left;
    const width = buttonRect.width;
    slider.style.transform = `translateX(${left}px)`;
    slider.style.width = `${width}px`;
  }
}, [activeTab]);

  useEffect(() => {
  updateSlider();
  const resizeObserver = new ResizeObserver(() => updateSlider());
  if (tabsContainerRef.current) {
    resizeObserver.observe(tabsContainerRef.current);
  }
  window.addEventListener('resize', updateSlider);
  return () => {
    resizeObserver.disconnect();
    window.removeEventListener('resize', updateSlider);
  };
}, [updateSlider]);

const handleRestore = async () => {
  if (!restoreModal.item) return;
  
  try {
    if (restoreModal.type === 'bankaccount') {
      // Restore bank account: set archived to false and remove archivedAt
      const bankRef = doc(db, 'bank_accounts', restoreModal.item.firestoreId);
      await updateDoc(bankRef, {
        archived: false,
        archivedAt: null
      });
      
      await logAdminAction({
        action: 'Restored Bank Account',
        module: 'Archive',
        details: `Restored bank account: ${restoreModal.item.bankName} - ${restoreModal.item.accountName}`
      });
      
      showNotification(`${restoreModal.item.bankName} has been restored successfully!`);
    } else if (restoreModal.type === 'gcashqr') {
      // Check if a QR code already exists in payment settings
      const settingsRef = doc(db, 'settings', 'payment');
      const settingsDoc = await getDoc(settingsRef);
      const currentQRCode = settingsDoc.exists() ? settingsDoc.data().gcashQRCode : '';
      
      if (currentQRCode && currentQRCode !== '') {
        showNotification('Cannot restore: A GCash QR code already exists in payment settings. Only one QR code is allowed at a time.', 'error');
        setRestoreModal({ show: false, item: null, type: '' });
        return;
      }
      
      // Restore GCash QR code to payment settings
      await setDoc(settingsRef, {
        gcashQRCode: restoreModal.item.qrCodeUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      // Delete from archived collection
      const archivedQRRef = doc(db, 'archived_gcash_qr', restoreModal.item.firestoreId);
      await deleteDoc(archivedQRRef);
      
      await logAdminAction({
        action: 'Restored GCash QR Code',
        module: 'Archive',
        details: 'Admin restored a GCash QR code from archive'
      });
      
      showNotification('GCash QR code has been restored successfully!');
    } else if (restoreModal.type === 'daytour') {
      // Check if a day tour already exists (not archived)
      const toursRef = collection(db, 'dayTours');
      const activeToursQuery = query(toursRef, where('archived', '==', false));
      const activeToursSnapshot = await getDocs(activeToursQuery);
      
      if (!activeToursSnapshot.empty) {
        showNotification('Cannot restore: A day tour already exists. Only one day tour post is allowed at a time. Please archive or delete the existing day tour first.', 'error');
        setRestoreModal({ show: false, item: null, type: '' });
        return;
      }
      
      // Restore day tour: set archived to false and remove archivedAt
      const tourRef = doc(db, 'dayTours', restoreModal.item.id);
      await updateDoc(tourRef, {
        archived: false,
        archivedAt: null,
        restoredAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Restored Day Tour',
        module: 'Archive',
        details: `Restored day tour: ${restoreModal.item.name || 'Day Tour'}`
      });
      
      showNotification('Day tour has been restored successfully!');
    } else {
      // Restore rooms, activities
      const collectionName = restoreModal.type === 'room' ? 'rooms' : 'activities';
      const itemRef = doc(db, collectionName, restoreModal.item.id);
      const itemName = restoreModal.item.name || restoreModal.item.type || restoreModal.item.name;
      const itemType = restoreModal.type;
      
      await updateDoc(itemRef, {
        archived: false,
        restoredAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Restored Item',
        module: 'Archive',
        details: `Restored ${itemType}: ${itemName}`
      });
      
      showNotification(`${itemName} has been restored successfully!`);
    }
    setRestoreModal({ show: false, item: null, type: '' });
  } catch (error) {
    console.error('Error restoring item:', error);
    showNotification('Failed to restore item.', 'error');
  }
};
  
const handleDelete = async () => {
  if (!deleteModal.item) return;
  
  try {
    let collectionName;
    let itemName;
    let itemRef;
    
    if (deleteModal.type === 'bankaccount') {
      // Use the firestoreId for bank accounts
      collectionName = 'bank_accounts';
      itemName = `${deleteModal.item.bankName} - ${deleteModal.item.accountName}`;
      itemRef = doc(db, collectionName, deleteModal.item.firestoreId);
    } else if (deleteModal.type === 'gcashqr') {
      // Handle GCash QR code deletion
      collectionName = 'archived_gcash_qr';
      itemName = 'GCash QR Code';
      itemRef = doc(db, collectionName, deleteModal.item.firestoreId);
    } else {
      collectionName = deleteModal.type === 'room' ? 'rooms' : 
                       deleteModal.type === 'daytour' ? 'dayTours' : 'activities';
      itemName = deleteModal.item.name || deleteModal.item.type || deleteModal.item.name;
      itemRef = doc(db, collectionName, deleteModal.item.id);
    }
    
    await deleteDoc(itemRef);
    
    // Immediately remove from local state (for instant UI update)
    if (deleteModal.type === 'bankaccount') {
      setArchivedBankAccounts(prev => prev.filter(acc => acc.firestoreId !== deleteModal.item.firestoreId));
    } else if (deleteModal.type === 'gcashqr') {
      setArchivedGCashQRs(prev => prev.filter(qr => qr.firestoreId !== deleteModal.item.firestoreId));
    } else if (deleteModal.type === 'room') {
      setArchivedRooms(prev => prev.filter(room => room.id !== deleteModal.item.id));
    } else if (deleteModal.type === 'daytour') {
      setArchivedDayTours(prev => prev.filter(tour => tour.id !== deleteModal.item.id));
    } else if (deleteModal.type === 'activity') {
      setArchivedActivities(prev => prev.filter(act => act.id !== deleteModal.item.id));
    }
    
    const itemType = deleteModal.type === 'bankaccount' ? 'bank account' : 
                     deleteModal.type === 'gcashqr' ? 'GCash QR code' : 
                     deleteModal.type;
    
    await logAdminAction({
      action: 'Deleted Item',
      module: 'Archive',
      details: `Permanently deleted ${itemType}: ${itemName}`
    });
    
    showNotification(`${itemName} has been permanently deleted!`);
    setDeleteModal({ show: false, item: null, type: '' });
  } catch (error) {
    console.error('Error deleting item:', error);
    showNotification('Failed to delete item.', 'error');
  }
};
  
  const getRoomAvailabilityStyle = (availability) => {
    const styles = {
      available: 'bg-green-50 text-green-700 border-green-200',
      unavailable: 'bg-red-50 text-red-700 border-red-200',
      maintenance: 'bg-orange-50 text-orange-700 border-orange-200'
    };
    return styles[availability] || 'bg-gray-100 text-gray-700';
  };
  
  const getRoomAvailabilityLabel = (availability) => {
    const labels = {
      available: 'Available',
      unavailable: 'Unavailable',
      maintenance: 'Under Maintenance'
    };
    return labels[availability] || availability;
  };
  
  const getTourAvailabilityStyle = (availability) => {
    const styles = {
      available: 'bg-green-50 text-green-700 border-green-200',
      unavailable: 'bg-red-50 text-red-700 border-red-200'
    };
    return styles[availability] || 'bg-gray-100 text-gray-700';
  };
  
  const getTourAvailabilityLabel = (availability) => {
    const labels = {
      available: 'Available',
      unavailable: 'Not Available'
    };
    return labels[availability] || availability;
  };
  
  const filteredRooms = archivedRooms.filter(room => {
    const matchesSearch = room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         room.type?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });
  
  const filteredDayTours = archivedDayTours.filter(tour => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      tour.description?.toLowerCase().includes(q) ||
      String(tour.adultPrice ?? '').toLowerCase().includes(q) ||
      String(tour.kidPrice ?? '').toLowerCase().includes(q) ||
      String(tour.seniorPrice ?? '').toLowerCase().includes(q) ||
      String(tour.maxCapacity ?? '').toLowerCase().includes(q) ||
      String(tour.availability ?? '').toLowerCase().includes(q)
    );
  });
  
  const filteredActivities = archivedActivities.filter(activity => {
    const matchesSearch = activity.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });
  
  const filteredBankAccounts = archivedBankAccounts.filter(account => {
    const matchesSearch = account.bankName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         account.accountName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });
  
  const filteredGCashQRs = archivedGCashQRs.filter(qr => {
  return true; // No search filter needed for QR codes
});

  const getPricingLabel = (pricingType) => {
    if (pricingType === 'per_person') return 'Per Person';
    if (pricingType === 'promo') return 'Promo';
    return 'Per Person';
  };
  
  return (
    <div className="p-8 min-h-screen"style={{ backgroundColor: 'var(--color-blue-white)' }} >
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-textPrimary font-playfair mb-1">
            Archive Management
          </h1>
          <p className="text-textSecondary">
            Restore, or permanently delete archived items
          </p>
        </div>
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
      
{/* Tabs with sliding underline */}
<div
  className="relative flex gap-2 mb-6 border-b border-ocean-light/20 overflow-x-auto"
  ref={tabsContainerRef}
>
  {/* Sliding background (dynamic like your original system) */}
  <div
    ref={sliderRef}
    className="absolute top-1 bottom-1 rounded-md bg-ocean-pales/20 transition-all duration-300 ease-in-out shadow-md"
    style={{
      transform: 'translateX(0px)',
      width: '0px',
    }}
  />

  {/* Tabs */}
  <button
    ref={(el) => (buttonRefs.current.rooms = el)}
    onClick={() => setActiveTab('rooms')}
    className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap ${
      activeTab === 'rooms'
        ? 'text-ocean-mid'
        : 'text-textSecondary hover:text-ocean-mid'
    }`}
  >
    <i className="fas fa-bed mr-2"></i>
    Archived Rooms
  </button>

  <button
    ref={(el) => (buttonRefs.current.daytours = el)}
    onClick={() => setActiveTab('daytours')}
    className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap ${
      activeTab === 'daytours'
        ? 'text-ocean-mid'
        : 'text-textSecondary hover:text-ocean-mid'
    }`}
  >
    <i className="fas fa-sun mr-2"></i>
    Archived Day Tours
  </button>

  <button
    ref={(el) => (buttonRefs.current.activities = el)}
    onClick={() => setActiveTab('activities')}
    className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap ${
      activeTab === 'activities'
        ? 'text-ocean-mid'
        : 'text-textSecondary hover:text-ocean-mid'
    }`}
  >
    <i className="fas fa-bicycle mr-2"></i>
    Archived Activities
  </button>

  <button
    ref={(el) => (buttonRefs.current.bankaccounts = el)}
    onClick={() => setActiveTab('bankaccounts')}
    className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap ${
      activeTab === 'bankaccounts'
        ? 'text-ocean-mid'
        : 'text-textSecondary hover:text-ocean-mid'
    }`}
  >
    <i className="fas fa-university mr-2"></i>
    Archived Bank Accounts
  </button>

  <button
    ref={(el) => (buttonRefs.current.gcashqr = el)}
    onClick={() => setActiveTab('gcashqr')}
    className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap ${
      activeTab === 'gcashqr'
        ? 'text-ocean-mid'
        : 'text-textSecondary hover:text-ocean-mid'
    }`}
  >
    <i className="fas fa-wallet mr-2"></i>
    Archived GCash QR
  </button>
</div>

      {/* Search */}
{activeTab !== 'daytours' && activeTab !== 'gcashqr' && (
  <div className="mb-6">
    <div className="relative w-full">
      <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-neutral text-sm"></i>
      <input
        type="text"
        placeholder={`Search archived ${
          activeTab === 'rooms'
            ? 'rooms by room type...'
            : activeTab === 'activities'
            ? 'activities by name...'
            : activeTab === 'bankaccounts'
            ? 'bank accounts by name...'
            : 'items...'
        }`}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full pl-9 pr-3 py-2.5 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300 bg-white"
      />
    </div>
  </div>
)}
      
      {/* Rooms Tab */}
      {activeTab === 'rooms' && (
        <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Room Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Capacity</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Total Rooms</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Price</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-12 text-center text-neutral">
                      <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                      <p className="text-lg">No archived rooms found</p>
                      <p className="text-sm">Archived rooms will appear here</p>
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((room) => (
                    <tr key={room.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-textPrimary">{room.type}</div>
                          {room.name && <div className="text-xs text-textSecondary mt-0.5">{room.name}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        <span className="flex items-center gap-1">
                          <i className="fas fa-users text-xs text-ocean-light"></i>
                          {room.capacity} Guests
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        <span className="flex items-center gap-1">
                          <i className="fas fa-door-open text-xs text-ocean-light"></i>
                          {room.totalRooms} Rooms
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ocean-mid">₱{room.price.toLocaleString()}</span>
                        <span className="text-xs text-neutral">/night</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoomAvailabilityStyle(room.availability)}`}>
                          {getRoomAvailabilityLabel(room.availability)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-textSecondary text-sm">
                        {room.archivedAt ? new Date(room.archivedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRestoreModal({ show: true, item: room, type: 'room' })}
                            className="px-3 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                            title="Restore"
                          >
                            <i className="fas fa-trash-restore"></i>
                            <span className="text-sm">Restore</span>
                          </button>
                          <button
                            onClick={() => setDeleteModal({ show: true, item: room, type: 'room' })}
                            className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                            title="Permanently Delete"
                          >
                            <i className="fas fa-trash-alt"></i>
                            <span className="text-sm">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
 {/* Day Tours Tab */}
{activeTab === 'daytours' && (
  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Adult Price</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Kid Price</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Senior Price</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Max Capacity</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Status</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredDayTours.length === 0 ? (
            <tr>
              <td colSpan="7" className="px-4 py-12 text-center text-neutral">
                <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                <p className="text-lg">No archived day tours found</p>
                <p className="text-sm">Archived day tours will appear here</p>
              </td>
            </tr>
          ) : (
            filteredDayTours.map((tour) => (
              <tr key={tour.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-semibold text-ocean-mid">₱{(tour.adultPrice || 0).toLocaleString()}</span>
                  <span className="text-xs text-neutral">/person</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-ocean-mid">₱{(tour.kidPrice || 0).toLocaleString()}</span>
                  <span className="text-xs text-neutral">/person</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-ocean-mid">₱{(tour.seniorPrice || 0).toLocaleString()}</span>
                  <span className="text-xs text-neutral">/person</span>
                </td>
                <td className="px-4 py-3 text-textSecondary">
                  {tour.maxCapacity ? (
                    <span className="flex items-center gap-1">
                      <i className="fas fa-users text-xs text-ocean-light"></i>
                      {tour.maxCapacity} Guests
                    </span>
                  ) : (
                    <span className="text-neutral">Unlimited</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTourAvailabilityStyle(tour.availability || 'available')}`}>
                    {getTourAvailabilityLabel(tour.availability || 'available')}
                  </span>
                </td>
                <td className="px-4 py-3 text-textSecondary text-sm">
                  {tour.archivedAt ? new Date(tour.archivedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRestoreModal({ show: true, item: tour, type: 'daytour' })}
                      className="px-3 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                      title="Restore"
                    >
                      <i className="fas fa-trash-restore"></i>
                      <span className="text-sm">Restore</span>
                    </button>
                    <button
                      onClick={() => setDeleteModal({ show: true, item: tour, type: 'daytour' })}
                      className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                      title="Permanently Delete"
                    >
                      <i className="fas fa-trash-alt"></i>
                      <span className="text-sm">Delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
)}
      
{/* Activities Tab */}
{activeTab === 'activities' && (
  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Activity Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Price</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Description</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
           </tr>
        </thead>
        <tbody>
          {filteredActivities.length === 0 ? (
            <tr>
              <td colSpan="5" className="px-4 py-12 text-center text-neutral">
                <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                <p className="text-lg">No archived activities found</p>
                <p className="text-sm">Archived activities will appear here</p>
              </td>
            </tr>
          ) : (
            filteredActivities.map((activity) => {
              // Format price display based on priceType
              const getPriceDisplay = () => {
                const priceValue = activity.priceValue || 0;
                const priceType = activity.priceType || 'perHour';
                const formattedPrice = `₱${priceValue.toLocaleString()}`;
                
                switch (priceType) {
                  case 'perHour':
                    return `${formattedPrice}/hour`;
                  case 'per30Mins':
                    return `${formattedPrice}/30 minutes`;
                  case 'per2Hrs':
                    return `${formattedPrice}/2 hours`;
                  case 'per1Hr30Mins':
                    return `${formattedPrice}/1.5 hours`;
                  default:
                    return formattedPrice;
                }
              };
              
              return (
                <tr key={activity.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-textPrimary">{activity.name || 'Untitled'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ocean-mid">{getPriceDisplay()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-textSecondary line-clamp-2 max-w-xs">{activity.description || 'No description'}</p>
                  </td>
                  <td className="px-4 py-3 text-textSecondary text-sm">
                    {activity.archivedAt ? new Date(activity.archivedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRestoreModal({ show: true, item: activity, type: 'activity' })}
                        className="px-3 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                        title="Restore"
                      >
                        <i className="fas fa-trash-restore"></i>
                        <span className="text-sm">Restore</span>
                      </button>
                      <button
                        onClick={() => setDeleteModal({ show: true, item: activity, type: 'activity' })}
                        className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                        title="Permanently Delete"
                      >
                        <i className="fas fa-trash-alt"></i>
                        <span className="text-sm">Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  </div>
)}
      
      {/* Bank Accounts Tab */}
      {activeTab === 'bankaccounts' && (
        <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Bank Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Account Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Account Number</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBankAccounts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-12 text-center text-neutral">
                      <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                      <p className="text-lg">No archived bank accounts found</p>
                      <p className="text-sm">Archived bank accounts will appear here</p>
                    </td>
                  </tr>
                ) : (
                  filteredBankAccounts.map((account) => (
                    <tr key={account.firestoreId} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-textPrimary">{account.bankName}</div>
                       </td>
                      <td className="px-4 py-3 text-textSecondary">{account.accountName}</td>
                      <td className="px-4 py-3 text-textSecondary">{account.accountNumber}</td>
                      <td className="px-4 py-3 text-textSecondary text-sm">
                        {account.archivedAt ? new Date(account.archivedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRestoreModal({ show: true, item: account, type: 'bankaccount' })}
                            className="px-3 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                            title="Restore"
                          >
                            <i className="fas fa-trash-restore"></i>
                            <span className="text-sm">Restore</span>
                          </button>
                          <button
                            onClick={() => setDeleteModal({ show: true, item: account, type: 'bankaccount' })}
                            className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                            title="Permanently Delete"
                          >
                            <i className="fas fa-trash-alt"></i>
                            <span className="text-sm">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GCash QR Tab */}
{activeTab === 'gcashqr' && (
  <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">QR Code Preview</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredGCashQRs.length === 0 ? (
            <tr>
              <td colSpan="3" className="px-4 py-12 text-center text-neutral">
                <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                <p className="text-lg">No archived GCash QR codes found</p>
                <p className="text-sm">Archived GCash QR codes will appear here</p>
              </td>
            </tr>
          ) : (
            filteredGCashQRs.map((qr) => (
              <tr key={qr.firestoreId} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="w-16 h-16 relative">
                    <Image
                      src={qr.qrCodeUrl}
                      alt="Archived GCash QR Code"
                      fill
                      className="object-contain rounded-lg"
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-textSecondary text-sm">
                  {qr.archivedAt ? new Date(qr.archivedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRestoreModal({ show: true, item: qr, type: 'gcashqr' })}
                      className="px-3 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                      title="Restore"
                    >
                      <i className="fas fa-trash-restore"></i>
                      <span className="text-sm">Restore</span>
                    </button>
                    <button
                      onClick={() => setDeleteModal({ show: true, item: qr, type: 'gcashqr' })}
                      className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600 hover:text-white transition-all duration-200 flex items-center gap-1"
                      title="Permanently Delete"
                    >
                      <i className="fas fa-trash-alt"></i>
                      <span className="text-sm">Delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
)}
      
      {/* Restore Confirmation Modal */}
      {restoreModal.show && restoreModal.item && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <i className="fas fa-trash-restore text-green-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Restore Item</h3>
<p className="text-textSecondary text-sm"> 
  Are you sure you want to restore{" "}
  {restoreModal.type === 'bankaccount' 
    ? `${restoreModal.item.bankName?.trim()} - ${restoreModal.item.accountName?.trim()}`
    : restoreModal.type === 'daytour'
      ? 'this day tour'
      : restoreModal.type === 'gcashqr'
        ? 'this QR code'
        : (restoreModal.item.name?.trim() || restoreModal.item.type?.trim())
  }? 
  This item will be moved back to active listings.
</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setRestoreModal({ show: false, item: null, type: '' })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteModal.show && deleteModal.item && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
                <i className="fas fa-trash-alt text-red-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Permanently Delete Item</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to permanently delete{" "}
  {deleteModal.type === 'bankaccount' 
    ? `${deleteModal.item.bankName?.trim()} - ${deleteModal.item.accountName?.trim()}`
    : deleteModal.type === 'daytour'
      ? 'this day tour'
      : deleteModal.type === 'gcashqr'
        ? 'this QR code'
        : (deleteModal.item.name?.trim() || deleteModal.item.type?.trim())
  }? 
                This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteModal({ show: false, item: null, type: '' })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                Delete Permanently
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
        
        @keyframes scaleIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}