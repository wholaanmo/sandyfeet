// app/dashboard/admin/archive/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, query, orderBy, onSnapshot, where, updateDoc, doc, deleteDoc, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { logAdminAction } from '../../../../lib/auditLogger';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

// Room Details Modal component
function RoomDetailsModal({ room, onClose, onRestore, onDelete, restoreLoading, deleteLoading }) {
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-auto p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <i className="fas fa-bed text-blue-500 text-sm"></i>
            </div>
            <h3 className="text-lg font-bold text-textPrimary">Room Details</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>
        
        <div className="border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Room Type</p>
              <p className="text-sm font-medium text-gray-800">{room.type || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Capacity</p>
              <p className="text-sm font-medium text-gray-800">{room.capacityMin && room.capacityMax ? `${room.capacityMin}–${room.capacityMax}` : room.capacity || '—'} Guests</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Total Rooms</p>
              <p className="text-sm font-medium text-gray-800">{room.totalRooms || '—'} Rooms</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Under Maintenance</p>
              <p className="text-sm font-medium text-gray-800">{room.maintenanceRooms || 0} Rooms</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Available for Booking</p>
              <p className="text-sm font-medium text-gray-800">{room.availableRooms || (room.totalRooms - (room.maintenanceRooms || 0))} Rooms</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Price</p>
              <p className="text-sm font-medium text-gray-800">₱{(room.price || 0).toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">/night</span></p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-500 mb-1">Inclusions</p>
              <div className="flex flex-wrap gap-1">
                {room.inclusions && room.inclusions.length > 0 ? (
                  room.inclusions.map((inclusion, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                      {inclusion}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-gray-700">No inclusions listed</p>
                )}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 line-clamp-3">{room.description || 'No description'}</p>
            </div>
          </div>
          
          {/* Status and Archived Date - Side by side row */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getRoomAvailabilityStyle(room.availability)}`}>
                {getRoomAvailabilityLabel(room.availability)}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Archived Date</p>
              <p className="text-sm font-medium text-gray-800">{room.archivedAt ? new Date(room.archivedAt).toLocaleString() : '—'}</p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons at Bottom Right - With text labels */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={() => onRestore(room)}
            disabled={restoreLoading}
            className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-trash-restore text-sm"></i>
            <span>Restore</span>
          </button>
          <button
            onClick={() => onDelete(room)}
            disabled={deleteLoading}
            className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-trash-alt text-sm"></i>
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Day Tour Details Modal component
function DayTourDetailsModal({ tour, onClose, onRestore, onDelete, restoreLoading, deleteLoading }) {
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-auto p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <i className="fas fa-sun text-blue-500 text-sm"></i>
            </div>
            <h3 className="text-lg font-bold text-textPrimary">Day Tour Details</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>
        
        <div className="border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Adult Price (16+)</p>
              <p className="text-sm font-medium text-gray-800">₱{(tour.adultPrice || 0).toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">/person</span></p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Kid Price (15-)</p>
              <p className="text-sm font-medium text-gray-800">₱{(tour.kidPrice || 0).toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">/person</span></p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Max Capacity</p>
              <p className="text-sm font-medium text-gray-800">{tour.maxCapacity ? `${tour.maxCapacity} Guests` : 'Unlimited'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getTourAvailabilityStyle(tour.availability || 'available')}`}>
                {getTourAvailabilityLabel(tour.availability || 'available')}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-500 mb-1">Inclusions</p>
              <div className="flex flex-wrap gap-1">
                {tour.inclusions && tour.inclusions.length > 0 ? (
                  tour.inclusions.map((inclusion, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                      {inclusion}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-gray-700">No inclusions listed</p>
                )}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 line-clamp-3">{tour.description || 'No description'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-500 mb-1">Archived Date</p>
              <p className="text-sm font-medium text-gray-800">{tour.archivedAt ? new Date(tour.archivedAt).toLocaleString() : '—'}</p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons at Bottom Right - With text labels */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={() => onRestore(tour)}
            disabled={restoreLoading}
            className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-trash-restore text-sm"></i>
            <span>Restore</span>
          </button>
          <button
            onClick={() => onDelete(tour)}
            disabled={deleteLoading}
            className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-trash-alt text-sm"></i>
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const [archivedRooms, setArchivedRooms] = useState([]);
  const [archivedDayTours, setArchivedDayTours] = useState([]);
  const [archivedActivities, setArchivedActivities] = useState([]);
  const [archivedBankAccounts, setArchivedBankAccounts] = useState([]);
  const [archivedFeedbacks, setArchivedFeedbacks] = useState([]);
  const [activeTab, setActiveTab] = useState('rooms');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [restoreModal, setRestoreModal] = useState({ show: false, item: null, type: '' });
  const [deleteModal, setDeleteModal] = useState({ show: false, item: null, type: '' });
  const [archivedGCashQRs, setArchivedGCashQRs] = useState([]);
  const [viewRoomModal, setViewRoomModal] = useState({ show: false, item: null });
  const [viewDayTourModal, setViewDayTourModal] = useState({ show: false, item: null });
  const [viewActivityModal, setViewActivityModal] = useState({ show: false, item: null });
  const [viewBankAccountModal, setViewBankAccountModal] = useState({ show: false, item: null });
  const [viewGCashQRModal, setViewGCashQRModal] = useState({ show: false, item: null });
  const [viewFeedbackModal, setViewFeedbackModal] = useState({ show: false, item: null });
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const router = useRouter();
  const tabsContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const buttonRefs = useRef({});

  // Real-time listeners
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const roomsList = [];
      querySnapshot.forEach((doc) => {
        roomsList.push({ id: doc.id, ...doc.data() });
      });
      setArchivedRooms(roomsList);
    }, (error) => {
      console.error('Error fetching archived rooms:', error);
      showNotification('Failed to load archived rooms.', 'error');
    });
    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    const toursRef = collection(db, 'dayTours');
    const q = query(toursRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const toursList = [];
      querySnapshot.forEach((doc) => {
        toursList.push({ id: doc.id, ...doc.data() });
      });
      setArchivedDayTours(toursList);
    }, (error) => {
      console.error('Error fetching archived day tours:', error);
      showNotification('Failed to load archived day tours.', 'error');
    });
    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const activitiesList = [];
      querySnapshot.forEach((doc) => {
        activitiesList.push({ id: doc.id, ...doc.data() });
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
  
  useEffect(() => {
    const bankAccountsRef = collection(db, 'bank_accounts');
    const q = query(bankAccountsRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const accountsList = [];
      querySnapshot.forEach((doc) => {
        accountsList.push({ firestoreId: doc.id, ...doc.data() });
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
        qrList.push({ firestoreId: doc.id, ...doc.data() });
      });
      setArchivedGCashQRs(qrList);
    }, (error) => {
      console.error('Error fetching archived GCash QR codes:', error);
      showNotification('Failed to load archived GCash QR codes.', 'error');
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for archived feedbacks
  useEffect(() => {
    const feedbacksRef = collection(db, 'feedbacks');
    const q = query(feedbacksRef, where('archived', '==', true), orderBy('archivedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const feedbacksList = [];
      querySnapshot.forEach((doc) => {
        feedbacksList.push({ id: doc.id, ...doc.data() });
      });
      setArchivedFeedbacks(feedbacksList);
    }, (error) => {
      console.error('Error fetching archived feedbacks:', error);
      showNotification('Failed to load archived feedbacks.', 'error');
    });
    return () => unsubscribe();
  }, []);

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

  // Helper: consistent date formatting
  const formatDateTimeFull = (date) => {
    if (!date) return 'N/A';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'N/A';
    }
  };

  // Restore handlers
  const handleRestoreFeedback = async (feedback) => {
    setRestoreLoading(true);
    try {
      const feedbackRef = doc(db, 'feedbacks', feedback.id);
      await updateDoc(feedbackRef, {
        archived: false,
        archivedAt: null,
        restoredAt: new Date().toISOString()
      });
      await logAdminAction({
        action: 'Restored Feedback',
        module: 'Archive',
        details: `Restored feedback from ${feedback.guestName} (${feedback.bookingId})`
      });
      showNotification('Feedback restored successfully!');
      setRestoreModal({ show: false, item: null, type: '' });
    } catch (error) {
      console.error('Error restoring feedback:', error);
      showNotification('Failed to restore feedback.', 'error');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreModal.item) return;
    setRestoreLoading(true);
    try {
      if (restoreModal.type === 'bankaccount') {
        if (restoreModal.item.showToGuest === true) {
          const activeBankAccountsRef = collection(db, 'bank_accounts');
          const activeQuery = query(activeBankAccountsRef, where('archived', '==', false), where('showToGuest', '==', true));
          const activeSnapshot = await getDocs(activeQuery);
          if (!activeSnapshot.empty) {
            showNotification('Cannot restore: Another bank account with "Show this to the guest" enabled already exists. Only one QR code can be visible to guests at a time.', 'error');
            setRestoreModal({ show: false, item: null, type: '' });
            setRestoreLoading(false);
            return;
          }
        }
        const bankRef = doc(db, 'bank_accounts', restoreModal.item.firestoreId);
        await updateDoc(bankRef, { archived: false, archivedAt: null });
        await logAdminAction({ action: 'Restored Bank Account', module: 'Archive', details: `Restored bank account: ${restoreModal.item.bankName} - ${restoreModal.item.accountName}` });
        showNotification(`${restoreModal.item.bankName} has been restored successfully!`);
      } else if (restoreModal.type === 'gcashqr') {
        const settingsRef = doc(db, 'settings', 'payment');
        const settingsDoc = await getDoc(settingsRef);
        const currentQRCode = settingsDoc.exists() ? settingsDoc.data().gcashQRCode : '';
        if (currentQRCode && currentQRCode !== '') {
          showNotification('Cannot restore: A GCash QR code already exists in payment settings. Only one QR code is allowed at a time.', 'error');
          setRestoreModal({ show: false, item: null, type: '' });
          setRestoreLoading(false);
          return;
        }
        await setDoc(settingsRef, { gcashQRCode: restoreModal.item.qrCodeUrl, updatedAt: new Date().toISOString() }, { merge: true });
        const archivedQRRef = doc(db, 'archived_gcash_qr', restoreModal.item.firestoreId);
        await deleteDoc(archivedQRRef);
        await logAdminAction({ action: 'Restored GCash QR Code', module: 'Archive', details: 'Admin restored a GCash QR code from archive' });
        showNotification('GCash QR code has been restored successfully!');
      } else if (restoreModal.type === 'daytour') {
        const toursRef = collection(db, 'dayTours');
        const activeToursQuery = query(toursRef, where('archived', '==', false));
        const activeToursSnapshot = await getDocs(activeToursQuery);
        if (!activeToursSnapshot.empty) {
          showNotification('Cannot restore: A day tour already exists. Only one day tour post is allowed at a time. Please archive or delete the existing day tour first.', 'error');
          setRestoreModal({ show: false, item: null, type: '' });
          setRestoreLoading(false);
          return;
        }
        const tourRef = doc(db, 'dayTours', restoreModal.item.id);
        await updateDoc(tourRef, { archived: false, archivedAt: null, restoredAt: new Date().toISOString() });
        await logAdminAction({ action: 'Restored Day Tour', module: 'Archive', details: `Restored day tour: ${restoreModal.item.name || 'Day Tour'}` });
        showNotification('Day tour has been restored successfully!');
      } else if (restoreModal.type === 'feedback') {
        await handleRestoreFeedback(restoreModal.item);
        return;
      } else {
        const collectionName = restoreModal.type === 'room' ? 'rooms' : 'activities';
        const itemRef = doc(db, collectionName, restoreModal.item.id);
        const itemName = restoreModal.item.name || restoreModal.item.type || restoreModal.item.name;
        const itemType = restoreModal.type;
        await updateDoc(itemRef, { archived: false, restoredAt: new Date().toISOString() });
        await logAdminAction({ action: 'Restored Item', module: 'Archive', details: `Restored ${itemType}: ${itemName}` });
        showNotification(`${itemName} has been restored successfully!`);
      }
      setRestoreModal({ show: false, item: null, type: '' });
    } catch (error) {
      console.error('Error restoring item:', error);
      showNotification('Failed to restore item.', 'error');
    } finally {
      setRestoreLoading(false);
    }
  };
  
  // Delete handlers
  const handleDeleteFeedback = async (feedback) => {
    setDeleteLoading(true);
    try {
      const feedbackRef = doc(db, 'feedbacks', feedback.id);
      await deleteDoc(feedbackRef);
      await logAdminAction({
        action: 'Deleted Feedback',
        module: 'Archive',
        details: `Permanently deleted feedback from ${feedback.guestName} (${feedback.bookingId})`
      });
      showNotification('Feedback permanently deleted!');
      setDeleteModal({ show: false, item: null, type: '' });
    } catch (error) {
      console.error('Error deleting feedback:', error);
      showNotification('Failed to delete feedback.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.item) return;
    setDeleteLoading(true);
    try {
      let collectionName;
      let itemName;
      let itemRef;
      if (deleteModal.type === 'bankaccount') {
        collectionName = 'bank_accounts';
        itemName = `${deleteModal.item.bankName} - ${deleteModal.item.accountName}`;
        itemRef = doc(db, collectionName, deleteModal.item.firestoreId);
      } else if (deleteModal.type === 'gcashqr') {
        collectionName = 'archived_gcash_qr';
        itemName = 'GCash QR Code';
        itemRef = doc(db, collectionName, deleteModal.item.firestoreId);
      } else if (deleteModal.type === 'feedback') {
        await handleDeleteFeedback(deleteModal.item);
        return;
      } else {
        collectionName = deleteModal.type === 'room' ? 'rooms' : deleteModal.type === 'daytour' ? 'dayTours' : 'activities';
        itemName = deleteModal.item.name || deleteModal.item.type || deleteModal.item.name;
        itemRef = doc(db, collectionName, deleteModal.item.id);
      }
      await deleteDoc(itemRef);
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
      const itemType = deleteModal.type === 'bankaccount' ? 'bank account' : deleteModal.type === 'gcashqr' ? 'GCash QR code' : deleteModal.type;
      await logAdminAction({ action: 'Deleted Item', module: 'Archive', details: `Permanently deleted ${itemType}: ${itemName}` });
      showNotification(`${itemName} has been permanently deleted!`);
      setDeleteModal({ show: false, item: null, type: '' });
    } catch (error) {
      console.error('Error deleting item:', error);
      showNotification('Failed to delete item.', 'error');
    } finally {
      setDeleteLoading(false);
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
  
  const filteredGCashQRs = archivedGCashQRs.filter(() => true);

  // NEW: Filter for archived feedbacks based on guest name, email, or booking ID
  const filteredFeedbacks = archivedFeedbacks.filter(feedback => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      (feedback.guestName && feedback.guestName.toLowerCase().includes(term)) ||
      (feedback.guestEmail && feedback.guestEmail.toLowerCase().includes(term)) ||
      (feedback.bookingId && feedback.bookingId.toLowerCase().includes(term))
    );
  });

  const getPricingLabel = (pricingType) => {
    if (pricingType === 'per_person') return 'Per Person';
    if (pricingType === 'promo') return 'Promo';
    return 'Per Person';
  };

  // Helpers for feedback
  const renderStars = (rating) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg key={star} className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  const renderBankAccountModal = () => {
    if (!viewBankAccountModal.item) return null;
    const item = viewBankAccountModal.item;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-auto p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="fas fa-university text-blue-500 text-sm"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary">Bank Account Details</h3>
            </div>
            <button
              onClick={() => setViewBankAccountModal({ show: false, item: null })}
className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Bank Name</p>
                <p className="text-sm font-medium text-gray-800">{item.bankName || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Account Name</p>
                <p className="text-sm font-medium text-gray-800">{item.accountName || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Account Number</p>
                <p className="text-sm font-medium text-gray-800">{item.accountNumber || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">QR Code</p>
                {item.qrCodeUrl ? (
                  <div className="w-14 h-14 relative mt-1">
                    <Image src={item.qrCodeUrl} alt="QR Code" fill className="object-contain rounded" />
                  </div>
                ) : (
                  <p className="text-sm font-medium text-gray-800 mt-1">—</p>
                )}
              </div>
              {/* Show to Guest and Archived Date side by side */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Show to Guest</p>
                <p className="text-sm font-medium text-gray-800">{item.showToGuest ? 'Yes' : 'No'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Archived Date</p>
                <p className="text-sm font-medium text-gray-800">{item.archivedAt ? new Date(item.archivedAt).toLocaleString() : '—'}</p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons at Bottom Right - With text labels */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => {
                setRestoreModal({ show: true, item: viewBankAccountModal.item, type: 'bankaccount' });
                setViewBankAccountModal({ show: false, item: null });
              }}
              disabled={restoreLoading}
              className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash-restore text-sm"></i>
              <span>Restore</span>
            </button>
            <button
              onClick={() => {
                setDeleteModal({ show: true, item: viewBankAccountModal.item, type: 'bankaccount' });
                setViewBankAccountModal({ show: false, item: null });
              }}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash-alt text-sm"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGCashQRModal = () => {
    if (!viewGCashQRModal.item) return null;
    const item = viewGCashQRModal.item;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] overflow-auto p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="fas fa-wallet text-blue-500 text-sm"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary">GCash QR Code Details</h3>
            </div>
            <button
              onClick={() => setViewGCashQRModal({ show: false, item: null })}
className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="flex justify-center mb-4">
              <div className="w-40 h-40 relative">
                <Image src={item.qrCodeUrl} alt="GCash QR Code" fill className="object-contain rounded-lg" />
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Archived Date</p>
              <p className="text-sm font-medium text-gray-800">{item.archivedAt ? new Date(item.archivedAt).toLocaleString() : '—'}</p>
            </div>
          </div>
          
          {/* Action Buttons at Bottom Right - With text labels */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => {
                setRestoreModal({ show: true, item: viewGCashQRModal.item, type: 'gcashqr' });
                setViewGCashQRModal({ show: false, item: null });
              }}
              disabled={restoreLoading}
              className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash-restore text-sm"></i>
              <span>Restore</span>
            </button>
            <button
              onClick={() => {
                setDeleteModal({ show: true, item: viewGCashQRModal.item, type: 'gcashqr' });
                setViewGCashQRModal({ show: false, item: null });
              }}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash-alt text-sm"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderActivityModal = () => {
    if (!viewActivityModal.item) return null;
    const item = viewActivityModal.item;
    const getPriceDisplay = () => {
      const priceValue = item.priceValue || 0;
      const priceType = item.priceType || 'perHour';
      const formattedPrice = `₱${priceValue.toLocaleString()}`;
      switch (priceType) {
        case 'perHour': return `${formattedPrice}/hour`;
        case 'per30Mins': return `${formattedPrice}/30 minutes`;
        case 'per2Hrs': return `${formattedPrice}/2 hours`;
        case 'per1Hr30Mins': return `${formattedPrice}/1.5 hours`;
        default: return formattedPrice;
      }
    };
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-auto p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="fas fa-info-circle text-blue-500 text-sm"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary">Activity Details</h3>
            </div>
            <button
              onClick={() => setViewActivityModal({ show: false, item: null })}
className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Activity Name</p>
                <p className="text-sm font-medium text-gray-800">{item.name || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Price</p>
                <p className="text-sm font-medium text-gray-800">{getPriceDisplay()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700 line-clamp-3">{item.description || 'No description'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Archived Date</p>
                <p className="text-sm font-medium text-gray-800">{item.archivedAt ? new Date(item.archivedAt).toLocaleString() : '—'}</p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons at Bottom Right - With text labels */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => {
                setRestoreModal({ show: true, item: viewActivityModal.item, type: 'activity' });
                setViewActivityModal({ show: false, item: null });
              }}
              disabled={restoreLoading}
              className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash-restore text-sm"></i>
              <span>Restore</span>
            </button>
            <button
              onClick={() => {
                setDeleteModal({ show: true, item: viewActivityModal.item, type: 'activity' });
                setViewActivityModal({ show: false, item: null });
              }}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash-alt text-sm"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderFeedbackModal = () => {
    if (!viewFeedbackModal.item) return null;
    const item = viewFeedbackModal.item;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-auto p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="fas fa-comment-dots text-blue-500 text-sm"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary">Feedback Details</h3>
            </div>
            <button
              onClick={() => setViewFeedbackModal({ show: false, item: null })}
className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
              <i className="fas fa-times text-sm"></i>
            </button>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Guest Name</p>
                <p className="text-sm font-medium text-gray-800">{item.guestName || 'Guest'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <p className="text-sm font-medium text-gray-800">{item.guestEmail}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Booking ID</p>
                <p className="text-sm font-medium text-gray-800 font-mono">{item.bookingId}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Rating</p>
                <div className="mt-1">{renderStars(item.rating)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-500 mb-1">Feedback</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.comment}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                  {item.status || 'Pending'}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Submitted On</p>
                <p className="text-sm font-medium text-gray-800">{formatDateTimeFull(item.createdAt)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-500 mb-1">Archived Date</p>
                <p className="text-sm font-medium text-gray-800">{item.archivedAt ? new Date(item.archivedAt).toLocaleString() : '—'}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => {
                setRestoreModal({ show: true, item, type: 'feedback' });
                setViewFeedbackModal({ show: false, item: null });
              }}
              disabled={restoreLoading}
              className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
            >
              <i className="fas fa-trash-restore text-sm"></i><span>Restore</span>
            </button>
            <button
              onClick={() => {
                setDeleteModal({ show: true, item, type: 'feedback' });
                setViewFeedbackModal({ show: false, item: null });
              }}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
            >
              <i className="fas fa-trash-alt text-sm"></i><span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // Wrapper functions for modal actions
  const handleModalRestore = (item) => {
    const type = activeTab === 'rooms' ? 'room' : 
                 activeTab === 'daytours' ? 'daytour' : 
                 activeTab === 'activities' ? 'activity' : '';
    setRestoreModal({ show: true, item, type });
  };

  const handleModalDelete = (item) => {
    const type = activeTab === 'rooms' ? 'room' : 
                 activeTab === 'daytours' ? 'daytour' : 
                 activeTab === 'activities' ? 'activity' : '';
    setDeleteModal({ show: true, item, type });
  };

  // Helper to conditionally render detail modals (hidden when a confirmation modal is open)
  const isConfirmationModalOpen = restoreModal.show || deleteModal.show;

  // Helper to close the underlying detail modal when cancel is clicked on confirmation modal
  const closeDetailModalByType = (type) => {
    if (type === 'room') setViewRoomModal({ show: false, item: null });
    else if (type === 'daytour') setViewDayTourModal({ show: false, item: null });
    else if (type === 'activity') setViewActivityModal({ show: false, item: null });
    else if (type === 'bankaccount') setViewBankAccountModal({ show: false, item: null });
    else if (type === 'gcashqr') setViewGCashQRModal({ show: false, item: null });
    else if (type === 'feedback') setViewFeedbackModal({ show: false, item: null });
  };

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="w-full rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
          <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight mb-1">
            Archive Management
          </h1>
          <p className="text-[#4D6FA8] text-sm leading-relaxed">
            Restore or permanently delete archived items
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
      <div className="relative flex justify-between gap-2 mb-6 border-b border-[#4D8CF5]/20 overflow-x-auto" ref={tabsContainerRef}>
        <div ref={sliderRef} className="absolute top-1 bottom-1 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm" style={{ transform: 'translateX(0px)', width: '0px' }} />
        <button ref={(el) => (buttonRefs.current.rooms = el)} onClick={() => setActiveTab('rooms')} className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${activeTab === 'rooms' ? 'text-[#1E3A8A]' : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'}`}>
          <i className="fas fa-bed"></i> Rooms
        </button>
        <button ref={(el) => (buttonRefs.current.daytours = el)} onClick={() => setActiveTab('daytours')} className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${activeTab === 'daytours' ? 'text-[#1E3A8A]' : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'}`}>
          <i className="fas fa-sun"></i> Day Tours
        </button>
        <button ref={(el) => (buttonRefs.current.activities = el)} onClick={() => setActiveTab('activities')} className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${activeTab === 'activities' ? 'text-[#1E3A8A]' : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'}`}>
          <i className="fas fa-bicycle"></i> Activities
        </button>
        <button ref={(el) => (buttonRefs.current.bankaccounts = el)} onClick={() => setActiveTab('bankaccounts')} className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${activeTab === 'bankaccounts' ? 'text-[#1E3A8A]' : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'}`}>
          <i className="fas fa-university"></i> Bank Accounts
        </button>
        <button ref={(el) => (buttonRefs.current.gcashqr = el)} onClick={() => setActiveTab('gcashqr')} className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${activeTab === 'gcashqr' ? 'text-[#1E3A8A]' : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'}`}>
          <i className="fas fa-wallet"></i> GCash QR
        </button>
        <button ref={(el) => (buttonRefs.current.feedback = el)} onClick={() => setActiveTab('feedback')} className={`relative z-10 px-6 py-3 font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${activeTab === 'feedback' ? 'text-[#1E3A8A]' : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'}`}>
          <i className="fas fa-comment-dots"></i> Feedback
        </button>
      </div>

      {/* Enhanced Search Filter UI - Now also shown for Feedback tab */}
      {activeTab !== 'daytours' && activeTab !== 'gcashqr' && (
        <div className="mb-6">
          <div className="relative w-full group">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>
            <input
              type="text"
              placeholder={
                activeTab === 'rooms' ? 'Search archived rooms by room type...' :
                activeTab === 'activities' ? 'Search archived activities by name...' :
                activeTab === 'bankaccounts' ? 'Search archived bank accounts by name...' :
                activeTab === 'feedback' ? 'Search by guest name, email, or booking ID...' :
                'Search items...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-5 py-3 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
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
                      <td className="px-4 py-3"><div className="font-medium text-textPrimary">{room.type}</div>{room.name && <div className="text-xs text-textSecondary mt-0.5">{room.name}</div>}</td>
                      <td className="px-4 py-3 text-textSecondary"><span className="flex items-center gap-1"><i className="fas fa-users text-xs text-ocean-light"></i>{room.capacity} Guests</span></td>
                      <td className="px-4 py-3 text-textSecondary"><span className="flex items-center gap-1"><i className="fas fa-door-open text-xs text-ocean-light"></i>{room.totalRooms} Rooms</span></td>
                      <td className="px-4 py-3"><span className="font-semibold text-ocean-mid">₱{room.price.toLocaleString()}</span><span className="text-xs text-neutral">/night</span></td>
                      <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoomAvailabilityStyle(room.availability)}`}>{getRoomAvailabilityLabel(room.availability)}</span></td>
                      <td className="px-4 py-3 text-textSecondary text-sm">{room.archivedAt ? new Date(room.archivedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewRoomModal({ show: true, item: room })} className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600/80 hover:text-white transition-all duration-200 flex items-center justify-center"><i className="fas fa-eye text-sm"></i></button>
                          <button onClick={() => setRestoreModal({ show: true, item: room, type: 'room' })} disabled={restoreLoading} className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{restoreLoading && restoreModal.type === 'room' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-restore text-sm"></i>}</button>
                          <button onClick={() => setDeleteModal({ show: true, item: room, type: 'room' })} disabled={deleteLoading} className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{deleteLoading && deleteModal.type === 'room' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-alt text-sm"></i>}</button>
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
                      <td className="px-4 py-3"><span className="font-semibold text-ocean-mid">₱{(tour.adultPrice || 0).toLocaleString()}</span><span className="text-xs text-neutral">/person</span></td>
                      <td className="px-4 py-3"><span className="font-semibold text-ocean-mid">₱{(tour.kidPrice || 0).toLocaleString()}</span><span className="text-xs text-neutral">/person</span></td>
                      <td className="px-4 py-3"><span className="font-semibold text-ocean-mid">₱{(tour.seniorPrice || 0).toLocaleString()}</span><span className="text-xs text-neutral">/person</span></td>
                      <td className="px-4 py-3 text-textSecondary">{tour.maxCapacity ? <span className="flex items-center gap-1"><i className="fas fa-users text-xs text-ocean-light"></i>{tour.maxCapacity} Guests</span> : <span className="text-neutral">Unlimited</span>}</td>
                      <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTourAvailabilityStyle(tour.availability || 'available')}`}>{getTourAvailabilityLabel(tour.availability || 'available')}</span></td>
                      <td className="px-4 py-3 text-textSecondary text-sm">{tour.archivedAt ? new Date(tour.archivedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewDayTourModal({ show: true, item: tour })} className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600/80 hover:text-white transition-all duration-200 flex items-center justify-center"><i className="fas fa-eye text-sm"></i></button>
                          <button onClick={() => setRestoreModal({ show: true, item: tour, type: 'daytour' })} disabled={restoreLoading} className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{restoreLoading && restoreModal.type === 'daytour' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-restore text-sm"></i>}</button>
                          <button onClick={() => setDeleteModal({ show: true, item: tour, type: 'daytour' })} disabled={deleteLoading} className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{deleteLoading && deleteModal.type === 'daytour' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-alt text-sm"></i>}</button>
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
                    const getPriceDisplay = () => {
                      const priceValue = activity.priceValue || 0;
                      const priceType = activity.priceType || 'perHour';
                      const formattedPrice = `₱${priceValue.toLocaleString()}`;
                      switch (priceType) {
                        case 'perHour': return `${formattedPrice}/hour`;
                        case 'per30Mins': return `${formattedPrice}/30 minutes`;
                        case 'per2Hrs': return `${formattedPrice}/2 hours`;
                        case 'per1Hr30Mins': return `${formattedPrice}/1.5 hours`;
                        default: return formattedPrice;
                      }
                    };
                    return (
                      <tr key={activity.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                        <td className="px-4 py-3"><div className="font-medium text-textPrimary">{activity.name || 'Untitled'}</div></td>
                        <td className="px-4 py-3"><span className="font-semibold text-ocean-mid">{getPriceDisplay()}</span></td>
                        <td className="px-4 py-3"><p className="text-sm text-textSecondary line-clamp-2 max-w-xs">{activity.description || 'No description'}</p></td>
                        <td className="px-4 py-3 text-textSecondary text-sm">{activity.archivedAt ? new Date(activity.archivedAt).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => setViewActivityModal({ show: true, item: activity })} className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600/80 hover:text-white transition-all duration-200 flex items-center justify-center"><i className="fas fa-eye text-sm"></i></button>
                            <button onClick={() => setRestoreModal({ show: true, item: activity, type: 'activity' })} disabled={restoreLoading} className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{restoreLoading && restoreModal.type === 'activity' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-restore text-sm"></i>}</button>
                            <button onClick={() => setDeleteModal({ show: true, item: activity, type: 'activity' })} disabled={deleteLoading} className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{deleteLoading && deleteModal.type === 'activity' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-alt text-sm"></i>}</button>
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
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Bank Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Account Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Account Number</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">QR Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBankAccounts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-12 text-center text-neutral">
                      <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                      <p className="text-lg">No archived bank accounts found</p>
                      <p className="text-sm">Archived bank accounts will appear here</p>
                    </td>
                  </tr>
                ) : (
                  filteredBankAccounts.map((account) => (
                    <tr key={account.firestoreId} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3"><div className="font-medium text-textPrimary">{account.bankName}</div></td>
                      <td className="px-4 py-3 text-textSecondary">{account.accountName}</td>
                      <td className="px-4 py-3 text-textSecondary">{account.accountNumber || '—'}</td>
                      <td className="px-4 py-3">
                        {account.qrCodeUrl ? (
                          <div className="w-12 h-12 relative">
                            <Image src={account.qrCodeUrl} alt={`QR Code for ${account.bankName}`} fill className="object-contain rounded border border-gray-200" />
                          </div>
                        ) : <span className="text-neutral text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3 text-textSecondary text-sm">{account.archivedAt ? new Date(account.archivedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewBankAccountModal({ show: true, item: account })} className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600/80 hover:text-white transition-all duration-200 flex items-center justify-center"><i className="fas fa-eye text-sm"></i></button>
                          <button onClick={() => setRestoreModal({ show: true, item: account, type: 'bankaccount' })} disabled={restoreLoading} className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{restoreLoading && restoreModal.type === 'bankaccount' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-restore text-sm"></i>}</button>
                          <button onClick={() => setDeleteModal({ show: true, item: account, type: 'bankaccount' })} disabled={deleteLoading} className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{deleteLoading && deleteModal.type === 'bankaccount' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-alt text-sm"></i>}</button>
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
                          <Image src={qr.qrCodeUrl} alt="Archived GCash QR Code" fill className="object-contain rounded-lg" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-textSecondary text-sm">{qr.archivedAt ? new Date(qr.archivedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewGCashQRModal({ show: true, item: qr })} className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600/80 hover:text-white transition-all duration-200 flex items-center justify-center"><i className="fas fa-eye text-sm"></i></button>
                          <button onClick={() => setRestoreModal({ show: true, item: qr, type: 'gcashqr' })} disabled={restoreLoading} className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{restoreLoading && restoreModal.type === 'gcashqr' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-restore text-sm"></i>}</button>
                          <button onClick={() => setDeleteModal({ show: true, item: qr, type: 'gcashqr' })} disabled={deleteLoading} className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">{deleteLoading && deleteModal.type === 'gcashqr' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-alt text-sm"></i>}</button>
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

      {/* Archived Feedback Tab - with search filter applied */}
      {activeTab === 'feedback' && (
        <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Guest</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Booking ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Submitted On</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Archived Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeedbacks.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-12 text-center text-neutral">
                      <i className="fas fa-archive text-5xl mb-3 opacity-50 block"></i>
                      <p className="text-lg">No archived feedback found</p>
                      <p className="text-sm">Archived feedback will appear here</p>
                    </td>
                  </tr>
                ) : (
                  filteredFeedbacks.map((feedback) => (
                    <tr key={feedback.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-textPrimary text-sm">{feedback.guestName || 'Guest'}</div>
                        <div className="text-[10px] text-neutral">{feedback.guestEmail}</div>
                      </td>
                      <td className="px-4 py-3"><span className="font-mono text-xs">{feedback.bookingId}</span></td>
                      <td className="px-4 py-3 text-xs text-textSecondary">{formatDateTimeFull(feedback.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-textSecondary">{feedback.archivedAt ? new Date(feedback.archivedAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewFeedbackModal({ show: true, item: feedback })} className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600/80 hover:text-white transition-all duration-200 flex items-center justify-center">
                            <i className="fas fa-eye text-sm"></i>
                          </button>
                          <button onClick={() => setRestoreModal({ show: true, item: feedback, type: 'feedback' })} disabled={restoreLoading} className="w-9 h-9 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50">
                            {restoreLoading && restoreModal.type === 'feedback' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-restore text-sm"></i>}
                          </button>
                          <button onClick={() => setDeleteModal({ show: true, item: feedback, type: 'feedback' })} disabled={deleteLoading} className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50">
                            {deleteLoading && deleteModal.type === 'feedback' ? <i className="fas fa-spinner fa-spin text-sm"></i> : <i className="fas fa-trash-alt text-sm"></i>}
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
      
      {/* Modals - conditionally render only when no confirmation modal is open */}
      {!isConfirmationModalOpen && (
        <>
          {viewRoomModal.show && viewRoomModal.item && (
            <RoomDetailsModal 
              room={viewRoomModal.item} 
              onClose={() => setViewRoomModal({ show: false, item: null })}
              onRestore={handleModalRestore}
              onDelete={handleModalDelete}
              restoreLoading={restoreLoading}
              deleteLoading={deleteLoading}
            />
          )}
          {viewDayTourModal.show && viewDayTourModal.item && (
            <DayTourDetailsModal 
              tour={viewDayTourModal.item} 
              onClose={() => setViewDayTourModal({ show: false, item: null })}
              onRestore={handleModalRestore}
              onDelete={handleModalDelete}
              restoreLoading={restoreLoading}
              deleteLoading={deleteLoading}
            />
          )}
          {renderActivityModal()}
          {renderBankAccountModal()}
          {renderGCashQRModal()}
          {renderFeedbackModal()}
        </>
      )}
      
      {/* Restore Confirmation Modal - High z-index to appear on top of all detail modals */}
      {restoreModal.show && restoreModal.item && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
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
                      : restoreModal.type === 'feedback'
                        ? `feedback from ${restoreModal.item.guestName}`
                        : (restoreModal.item.name?.trim() || restoreModal.item.type?.trim())
                }? 
                This item will be moved back to active listings.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => {
                  setRestoreModal({ show: false, item: null, type: '' });
                  closeDetailModalByType(restoreModal.type);
                }} 
                disabled={restoreLoading} 
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button onClick={handleRestore} disabled={restoreLoading} className="px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2">
                {restoreLoading && <i className="fas fa-spinner fa-spin"></i>}
                {restoreLoading ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal - High z-index to appear on top of all detail modals */}
      {deleteModal.show && deleteModal.item && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
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
                      : deleteModal.type === 'feedback'
                        ? `feedback from ${deleteModal.item.guestName}`
                        : (deleteModal.item.name?.trim() || deleteModal.item.type?.trim())
                }? 
                This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => {
                  setDeleteModal({ show: false, item: null, type: '' });
                  closeDetailModalByType(deleteModal.type);
                }} 
                disabled={deleteLoading} 
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteLoading} className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2">
                {deleteLoading && <i className="fas fa-spinner fa-spin"></i>}
                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slideInRight { animation: slideInRight 0.3s ease-out; }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
}