// app/dashboard/admin/rooms/page.js
'use client';

import { useState, useEffect } from 'react';
import { db } from '../../../../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { uploadImage } from '../../../../lib/cloudinary';
import { logAdminAction } from '../../../../lib/auditLogger';
import Image from 'next/image';

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmArchiveModal, setConfirmArchiveModal] = useState({ show: false, room: null });
  const [hasChanges, setHasChanges] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  const [formData, setFormData] = useState({
    type: '',
    totalRooms: '',
    maintenanceRooms: '',
    capacityMin: '',
    capacityMax: '',
    inclusions: [],
    price: '',
    availability: 'available',
    description: '',
    images: []
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [inclusionInput, setInclusionInput] = useState('');
  
  const availabilityStatuses = [
    { value: 'available', label: 'Available', color: 'bg-green-50 text-green-700 border-green-200' },
    { value: 'unavailable', label: 'Unavailable', color: 'bg-red-50 text-red-700 border-red-200' },
    { value: 'maintenance', label: 'Under Maintenance', color: 'bg-orange-50 text-orange-700 border-orange-200' }
  ];
  
  // Real-time listener for active rooms (not archived)
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const roomsList = [];
      querySnapshot.forEach((doc) => {
        roomsList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setRooms(roomsList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching rooms:', error);
      showNotification('Failed to load rooms.', 'error');
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
  if (modalType === 'edit' && selectedRoom) {
    setHasChanges(detectChanges());
  }
}, [formData, selectedRoom, modalType]);
  
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
  
  // Update availability based on room counts
  const updateAvailabilityBasedOnCounts = (totalRooms, maintenanceRooms, currentAvailability) => {
    // If manually overridden, don't auto-update
    if (manualOverride) {
      return currentAvailability;
    }
    
    const totalRoomsInt = parseInt(totalRooms) || 0;
    const maintenanceRoomsInt = parseInt(maintenanceRooms) || 0;
    
    if (totalRoomsInt > maintenanceRoomsInt) {
      return 'available';
    } else if (totalRoomsInt === maintenanceRoomsInt) {
      return 'maintenance';
    }
    return currentAvailability;
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Validate numeric fields to prevent negative numbers
    if (name === 'totalRooms' || name === 'maintenanceRooms' || name === 'capacityMin' || name === 'capacityMax' || name === 'price') {
      if (value === '') {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }));
      } else {
        const numValue = parseInt(value);
        if (numValue >= 0 || (name === 'price' && parseFloat(value) >= 0)) {
          setFormData(prev => ({
            ...prev,
            [name]: value
          }));
        }
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    
    // Update availability when totalRooms or maintenanceRooms change
    if (name === 'totalRooms' || name === 'maintenanceRooms') {
      const newAvailability = updateAvailabilityBasedOnCounts(
        name === 'totalRooms' ? value : formData.totalRooms,
        name === 'maintenanceRooms' ? value : formData.maintenanceRooms,
        formData.availability
      );
      
      setFormData(prev => ({
        ...prev,
        availability: newAvailability
      }));
      
      // Reset manual override when counts change
      setManualOverride(false);
    }
    
    // Handle manual availability override
    if (name === 'availability') {
      setManualOverride(true);
    }
    
    // Update hasChanges state in edit mode
    if (modalType === 'edit' && selectedRoom) {
      setHasChanges(detectChanges());
    }
  };
  
  const handleInclusionAdd = () => {
    if (inclusionInput.trim() && !formData.inclusions.includes(inclusionInput.trim())) {
      setFormData(prev => ({
        ...prev,
        inclusions: [...prev.inclusions, inclusionInput.trim()]
      }));
      setInclusionInput('');
      
      // Update hasChanges state in edit mode
      if (modalType === 'edit' && selectedRoom) {
        setHasChanges(detectChanges());
      }
    }
  };
  
  const handleInclusionRemove = (inclusion) => {
    setFormData(prev => ({
      ...prev,
      inclusions: prev.inclusions.filter(i => i !== inclusion)
    }));
    
    // Update hasChanges state in edit mode
    if (modalType === 'edit' && selectedRoom) {
      setHasChanges(detectChanges());
    }
  };
  
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingImage(true);
    try {
      const uploadPromises = files.map(file => uploadImage(file));
      const uploadedUrls = await Promise.all(uploadPromises);
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...uploadedUrls]
      }));
      showNotification(`${files.length} image(s) uploaded successfully!`);
      
      // Update hasChanges state in edit mode
      if (modalType === 'edit' && selectedRoom) {
        setHasChanges(detectChanges());
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      showNotification('Failed to upload images.', 'error');
    } finally {
      setUploadingImage(false);
    }
  };
  
  const handleImageRemove = (imageUrl) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter(img => img !== imageUrl)
    }));
    
    // Update hasChanges state in edit mode
    if (modalType === 'edit' && selectedRoom) {
      setHasChanges(detectChanges());
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.type.trim()) {
      errors.type = 'Room type is required';
    }
    
    if (!formData.totalRooms && formData.totalRooms !== 0) {
      errors.totalRooms = 'Total number of rooms is required';
    } else if (parseInt(formData.totalRooms) < 0) {
      errors.totalRooms = 'Total rooms cannot be negative';
    }
    
    // Validate maintenanceRooms
    if (formData.maintenanceRooms !== '') {
      const maintenanceValue = parseInt(formData.maintenanceRooms);
      const totalValue = parseInt(formData.totalRooms);
      
      if (maintenanceValue < 0) {
        errors.maintenanceRooms = 'Maintenance rooms cannot be negative';
      } else if (totalValue && maintenanceValue > totalValue) {
        errors.maintenanceRooms = 'Maintenance rooms cannot exceed total rooms available';
      }
    }
    
    if (!formData.capacityMin && formData.capacityMin !== 0) {
      errors.capacityMin = 'Minimum capacity is required';
    } else if (parseInt(formData.capacityMin) < 0) {
      errors.capacityMin = 'Minimum capacity cannot be negative';
    }
    
    if (!formData.capacityMax && formData.capacityMax !== 0) {
      errors.capacityMax = 'Maximum capacity is required';
    } else if (parseInt(formData.capacityMax) < 0) {
      errors.capacityMax = 'Maximum capacity cannot be negative';
    } else if (parseInt(formData.capacityMin) > parseInt(formData.capacityMax)) {
      errors.capacityMax = 'Maximum capacity must be greater than minimum capacity';
    }
    
    if (!formData.price && formData.price !== 0) {
      errors.price = 'Price is required';
    } else if (parseFloat(formData.price) < 0) {
      errors.price = 'Price cannot be negative';
    }
    
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    
    return errors;
  };
  
  const isFormIncomplete = () => {
    // Only check required fields (image is optional)
    return !formData.type.trim() || 
           formData.totalRooms === '' || 
           formData.capacityMin === '' || 
           formData.capacityMax === '' || 
           formData.price === '' || 
           !formData.description.trim();
  };
  
  const handleAddRoom = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setActionLoading(true);
    
    try {
      const totalRoomsInt = parseInt(formData.totalRooms) || 0;
      const maintenanceRoomsInt = formData.maintenanceRooms ? parseInt(formData.maintenanceRooms) : 0;
      const availableRoomsInt = totalRoomsInt - maintenanceRoomsInt;
      
      // Final availability check with manual override consideration
      let finalAvailability = formData.availability;
      if (!manualOverride) {
        finalAvailability = updateAvailabilityBasedOnCounts(totalRoomsInt, maintenanceRoomsInt, formData.availability);
      }
      
      const roomData = {
        ...formData,
        totalRooms: totalRoomsInt,
        maintenanceRooms: maintenanceRoomsInt,
        availableRooms: availableRoomsInt,
        capacityMin: parseInt(formData.capacityMin) || 0,
        capacityMax: parseInt(formData.capacityMax) || 0,
        capacity: `${formData.capacityMin || 0}–${formData.capacityMax || 0}`,
        price: parseFloat(formData.price) || 0,
        availability: finalAvailability,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'rooms'), roomData);
      
      await logAdminAction({
        action: 'Created Room',
        module: 'Room Management',
        details: `Added new room: ${roomData.type} (Capacity: ${roomData.capacityMin}–${roomData.capacityMax} guests, Price: ₱${roomData.price.toLocaleString()}, Total Rooms: ${roomData.totalRooms}, Available Rooms: ${roomData.availableRooms}, Maintenance Rooms: ${roomData.maintenanceRooms}, Status: ${roomData.availability})`
      });
      
      showNotification('Room added successfully!');
      resetForm();
      
      setTimeout(() => {
        setShowModal(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error adding room:', error);
      showNotification('Failed to add room.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setActionLoading(true);
    
    try {
      const roomRef = doc(db, 'rooms', selectedRoom.id);
      
      const totalRoomsInt = parseInt(formData.totalRooms) || 0;
      const maintenanceRoomsInt = formData.maintenanceRooms ? parseInt(formData.maintenanceRooms) : 0;
      const availableRoomsInt = totalRoomsInt - maintenanceRoomsInt;
      
      // Final availability check with manual override consideration
      let finalAvailability = formData.availability;
      if (!manualOverride) {
        finalAvailability = updateAvailabilityBasedOnCounts(totalRoomsInt, maintenanceRoomsInt, formData.availability);
      }
      
      const previousData = {
        type: selectedRoom.type,
        totalRooms: selectedRoom.totalRooms,
        maintenanceRooms: selectedRoom.maintenanceRooms || 0,
        capacityMin: selectedRoom.capacityMin,
        capacityMax: selectedRoom.capacityMax,
        price: selectedRoom.price,
        availability: selectedRoom.availability,
        description: selectedRoom.description,
        inclusions: selectedRoom.inclusions || [],
        imagesCount: selectedRoom.images?.length || 0
      };
      
      const newData = {
        type: formData.type,
        totalRooms: totalRoomsInt,
        maintenanceRooms: maintenanceRoomsInt,
        capacityMin: parseInt(formData.capacityMin) || 0,
        capacityMax: parseInt(formData.capacityMax) || 0,
        price: parseFloat(formData.price) || 0,
        availability: finalAvailability,
        description: formData.description,
        inclusions: formData.inclusions,
        imagesCount: formData.images.length
      };
      
      await updateDoc(roomRef, {
        ...formData,
        totalRooms: totalRoomsInt,
        maintenanceRooms: maintenanceRoomsInt,
        availableRooms: availableRoomsInt,
        capacityMin: parseInt(formData.capacityMin) || 0,
        capacityMax: parseInt(formData.capacityMax) || 0,
        capacity: `${formData.capacityMin || 0}–${formData.capacityMax || 0}`,
        price: parseFloat(formData.price) || 0,
        availability: finalAvailability,
        updatedAt: new Date().toISOString()
      });
      
      const changes = [];
      
      if (previousData.type !== newData.type) changes.push(`type from "${previousData.type}" to "${newData.type}"`);
      if (previousData.totalRooms !== newData.totalRooms) changes.push(`total rooms from ${previousData.totalRooms} to ${newData.totalRooms}`);
      if (previousData.maintenanceRooms !== newData.maintenanceRooms) changes.push(`maintenance rooms from ${previousData.maintenanceRooms} to ${newData.maintenanceRooms}`);
      if (previousData.capacityMin !== newData.capacityMin || previousData.capacityMax !== newData.capacityMax) 
        changes.push(`capacity from ${previousData.capacityMin}–${previousData.capacityMax} to ${newData.capacityMin}–${newData.capacityMax} guests`);
      if (previousData.price !== newData.price) changes.push(`price from ₱${previousData.price.toLocaleString()} to ₱${newData.price.toLocaleString()}`);
      if (previousData.availability !== newData.availability) changes.push(`availability from "${previousData.availability}" to "${newData.availability}"`);
      if (previousData.description !== newData.description) changes.push(`updated the description`);
      if (previousData.imagesCount !== newData.imagesCount) changes.push(`images count from ${previousData.imagesCount} to ${newData.imagesCount}`);
      
      const previousInclusionsSet = new Set(previousData.inclusions);
      const newInclusionsSet = new Set(newData.inclusions);
      const addedInclusions = newData.inclusions.filter(i => !previousInclusionsSet.has(i));
      const removedInclusions = previousData.inclusions.filter(i => !newInclusionsSet.has(i));
      
      if (addedInclusions.length > 0) {
        changes.push(`added inclusions: ${addedInclusions.join(', ')}`);
      }
      if (removedInclusions.length > 0) {
        changes.push(`removed inclusions: ${removedInclusions.join(', ')}`);
      }
      
      let logDetails = `Updated room "${selectedRoom.type}"`;
      if (changes.length === 1 && changes[0] === 'updated the description') {
        logDetails += `: updated the description.`;
      } else if (changes.length === 1 && changes[0].includes('inclusions')) {
        logDetails += `: ${changes[0]}.`;
      } else if (changes.length > 0) {
        logDetails += `: ${changes.join(', ')}.`;
      } else {
        setActionLoading(false);
        return;
      }
      
      await logAdminAction({
        action: 'Updated Room',
        module: 'Room Management',
        details: logDetails
      });
      
      showNotification('Room updated successfully!');
      
      setTimeout(() => {
        setShowModal(false);
        setShowViewModal(false);
        setSelectedRoom(null);
      }, 2000);
      
    } catch (error) {
      console.error('Error updating room:', error);
      showNotification('Failed to update room.', 'error');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleArchiveRoom = async (room) => {
    try {
      const roomRef = doc(db, 'rooms', room.id);
      await updateDoc(roomRef, {
        archived: true,
        archivedAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Archived Room',
        module: 'Room Management',
        details: `Archived room: ${room.type} (Capacity: ${room.capacity} guests, Price: ₱${room.price.toLocaleString()}, Total Rooms: ${room.totalRooms})`
      });
      
      showNotification(`${room.type} has been archived successfully!`);
      setConfirmArchiveModal({ show: false, room: null });
    } catch (error) {
      console.error('Error archiving room:', error);
      showNotification('Failed to archive room.', 'error');
    }
  };
  
  const handleEditRoom = (room) => {
    setSelectedRoom(room);
    setFormData({
      type: room.type || '',
      totalRooms: room.totalRooms || '',
      maintenanceRooms: room.maintenanceRooms || '',
      capacityMin: room.capacityMin || '',
      capacityMax: room.capacityMax || '',
      inclusions: room.inclusions || [],
      price: room.price || '',
      availability: room.availability || 'available',
      description: room.description || '',
      images: room.images || []
    });
    setManualOverride(false);
    setHasChanges(false);
    setModalType('edit');
    setShowModal(true);
    setShowViewModal(false);
  };
  
  const handleViewRoom = (room) => {
    setSelectedRoom(room);
    setShowViewModal(true);
  };
  
  const resetForm = () => {
    setFormData({
      type: '',
      totalRooms: '',
      maintenanceRooms: '',
      capacityMin: '',
      capacityMax: '',
      inclusions: [],
      price: '',
      availability: 'available',
      description: '',
      images: []
    });
    setInclusionInput('');
    setFormErrors({});
    setManualOverride(false);
    setHasChanges(false);
  };

  const detectChanges = () => {
    if (!selectedRoom) return false;
    
    const hasTypeChanged = formData.type !== (selectedRoom.type || '');
    const hasTotalRoomsChanged = parseInt(formData.totalRooms) !== (selectedRoom.totalRooms || '');
    const hasMaintenanceRoomsChanged = parseInt(formData.maintenanceRooms || 0) !== (selectedRoom.maintenanceRooms || 0);
    const hasCapacityMinChanged = parseInt(formData.capacityMin) !== (selectedRoom.capacityMin || '');
    const hasCapacityMaxChanged = parseInt(formData.capacityMax) !== (selectedRoom.capacityMax || '');
    const hasPriceChanged = parseFloat(formData.price) !== (selectedRoom.price || '');
    const hasAvailabilityChanged = formData.availability !== (selectedRoom.availability || 'available');
    const hasDescriptionChanged = formData.description !== (selectedRoom.description || '');
    
    const hasInclusionsChanged = JSON.stringify(formData.inclusions.sort()) !== 
                                JSON.stringify((selectedRoom.inclusions || []).sort());
    
    const hasImagesChanged = JSON.stringify(formData.images) !== 
                            JSON.stringify(selectedRoom.images || []);
    
    return hasTypeChanged || hasTotalRoomsChanged || hasMaintenanceRoomsChanged ||
           hasCapacityMinChanged || hasCapacityMaxChanged || hasPriceChanged || 
           hasAvailabilityChanged || hasDescriptionChanged || hasInclusionsChanged || 
           hasImagesChanged;
  };
  
  const openAddModal = () => {
    setModalType('add');
    resetForm();
    setSelectedRoom(null);
    setManualOverride(false);
    setShowModal(true);
  };
  
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || room.availability === filterStatus;
    return matchesSearch && matchesFilter;
  });
  
  const getAvailabilityStyle = (availability) => {
    const status = availabilityStatuses.find(s => s.value === availability);
    return status ? status.color : 'bg-gray-100 text-gray-700';
  };
  
  const getAvailabilityLabel = (availability) => {
    const status = availabilityStatuses.find(s => s.value === availability);
    return status ? status.label : availability;
  };
  
  // FIXED: Calculate total units, available rooms, and maintenance rooms correctly
  // Total units: sum of all totalRooms across all room types
  const totalUnits = rooms.reduce((sum, room) => sum + (room.totalRooms || 0), 0);
  
  // Available rooms: sum of availableRooms for each room type
  // availableRooms is already calculated as totalRooms - maintenanceRooms
  const availableRooms = rooms.reduce((sum, room) => sum + (room.availableRooms || (room.totalRooms - (room.maintenanceRooms || 0))), 0);
  
  // Maintenance rooms: sum of maintenanceRooms across all room types
  const totalMaintenanceRooms = rooms.reduce((sum, room) => sum + (room.maintenanceRooms || 0), 0);
  
  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
<div className="mb-6 flex justify-end">
<button
  onClick={openAddModal}
  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
>
  <i className="fas fa-plus text-sm"></i>
  Add New Room
</button>
</div>


      
      {/* Statistics Cards */}
   <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
  
  {/* Total Units */}
  <div className="bg-gradient-to-br from-white to-ocean-light/5 rounded-2xl shadow-md border border-ocean-light/10 p-5 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
    <div className="flex items-center justify-between h-full">
      <div>
        <h3 className="text-sm font-semibold text-textSecondary uppercase tracking-wide mb-2">
          Total Units
        </h3>
        <div className="text-3xl font-bold text-textPrimary leading-tight">
          {totalUnits}
        </div>
      </div>
      <div className="w-12 h-12 rounded-xl bg-ocean-light/10 flex items-center justify-center">
        <i className="fas fa-building text-ocean-light text-2xl"></i>
      </div>
    </div>
  </div>

  {/* Available Rooms */}
  <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-md border border-ocean-light/10 p-5 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
    <div className="flex items-center justify-between h-full">
      <div>
        <h3 className="text-sm font-semibold text-textSecondary uppercase tracking-wide mb-2">
          Available Rooms
        </h3>
        <div className="text-3xl font-bold text-textPrimary leading-tight">
          {availableRooms}
        </div>
      </div>
      <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
        <i className="fas fa-check-circle text-green-500 text-2xl"></i>
      </div>
    </div>
  </div>

  {/* Under Maintenance */}
  <div className="bg-gradient-to-br from-white to-yellow-50 rounded-2xl shadow-md border border-ocean-light/10 p-5 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
    <div className="flex items-center justify-between h-full">
      <div>
        <h3 className="text-sm font-semibold text-textSecondary uppercase tracking-wide mb-2">
          Under Maintenance
        </h3>
        <div className="text-3xl font-bold text-textPrimary leading-tight">
          {totalMaintenanceRooms}
        </div>
      </div>
      <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
        <i className="fas fa-tools text-yellow-500 text-2xl"></i>
      </div>
    </div>
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
      
      {/* Filters and Search */}
<div className="flex gap-4 mb-6 flex-wrap">
  <div className="flex-1 min-w-[250px]">
    <div className="relative w-full group">
      <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>
      
      <input
        type="text"
        placeholder="Search by room type..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full pl-9 pr-3 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
      />
    </div>
  </div>
        
<div className="relative">
  <select
    value={filterStatus}
    onChange={(e) => setFilterStatus(e.target.value)}
    className="px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm text-textPrimary bg-white shadow-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 hover:border-[#4D8CF5]/70 transition-all duration-200 appearance-none cursor-pointer"
  >
    <option value="all">All Status</option>
    <option value="available">Available</option>
    <option value="unavailable">Unavailable</option>
    <option value="maintenance">Under Maintenance</option>
  </select>

  {/* Custom dropdown arrow */}
  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
    ▼
  </div>
</div>
      </div>
      
      {/* Rooms Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      ) : (
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-12 text-center text-neutral">
                      <i className="fas fa-bed text-5xl mb-3 opacity-50 block"></i>
                      <p className="text-lg">No rooms found</p>
                      <p className="text-sm">Click "Add New Room" to get started</p>
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((room) => (
                    <tr key={room.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-textPrimary">{room.type}</div>
                      </td>
                      <td className="px-4 py-3 text-textSecondary">
                        <span className="flex items-center gap-1">
                          <i className="fas fa-users text-xs text-ocean-light"></i>
                          {room.capacityMin && room.capacityMax ? `${room.capacityMin}–${room.capacityMax} Guests` : room.capacity || `${room.capacityMin || room.capacityMax} Guests`}
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
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getAvailabilityStyle(room.availability)}`}>
                          {getAvailabilityLabel(room.availability)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewRoom(room)}
                            className="p-2 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] border border-[#7AAAF8]/20 hover:bg-[#4D8CF5]/80 hover:text-white transition-all duration-200 flex items-center disabled:opacity-50"
                            title="View Details"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            onClick={() => handleEditRoom(room)}
                            className="p-2 rounded-lg bg-[#93C5FD]/10 text-[#1E3A8A] border border-[#93C5FD]/20 hover:bg-[#93C5FD]/80 hover:text-white transition-all duration-200 flex items-center disabled:opacity-50"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => setConfirmArchiveModal({ show: true, room })}
                            className="p-2 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] border border-[#F59E0B]/20 hover:bg-[#F59E0B] hover:text-white hover:border-[#F59E0B] transition-all duration-200"
                            title="Archive Room"
                          >
                            <i className="fas fa-archive"></i>
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
      
      {/* View Room Modal */}
      {showViewModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          if (!actionLoading) {
            setShowViewModal(false);
            setSelectedRoom(null);
          }
        }}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-2xl font-bold text-textPrimary font-playfair">
                Room Details - {selectedRoom.type}
              </h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedRoom(null);
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            {/* Room Images Slider/Gallery */}
            {selectedRoom.images && selectedRoom.images.length > 0 && (
              <div className="mb-6">
                <div className="relative">
                  <div className="relative overflow-hidden rounded-xl bg-ocean-pale/30" style={{ height: '300px' }}>
                    <Image
                      src={selectedRoom.images[0]}
                      alt={selectedRoom.type}
                      fill
                      className="object-contain"
                    />
                  </div>
                  
                  {selectedRoom.images.length > 1 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                      {selectedRoom.images.map((img, idx) => (
                        <div key={idx} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-ocean-mid transition-all">
                          <Image
                            src={img}
                            alt={`Thumbnail ${idx + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Room Type</label>
                <p className="text-lg font-semibold text-textPrimary">{selectedRoom.type}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Capacity</label>
                <p className="text-textPrimary flex items-center gap-2">
                  <i className="fas fa-users text-ocean-light"></i>
                  {selectedRoom.capacityMin && selectedRoom.capacityMax 
                    ? `${selectedRoom.capacityMin}–${selectedRoom.capacityMax} Guests` 
                    : selectedRoom.capacity || `${selectedRoom.capacityMin || selectedRoom.capacityMax} Guests`}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Total Rooms</label>
                <p className="text-textPrimary flex items-center gap-2">
                  <i className="fas fa-door-open text-ocean-light"></i>
                  {selectedRoom.totalRooms} Rooms
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Under Maintenance</label>
                <p className="text-textPrimary flex items-center gap-2">
                  <i className="fas fa-tools text-yellow-500"></i>
                  {selectedRoom.maintenanceRooms || 0} Rooms
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Available for Booking</label>
                <p className="text-textPrimary flex items-center gap-2">
                  <i className="fas fa-check-circle text-green-500"></i>
                  {selectedRoom.availableRooms || (selectedRoom.totalRooms - (selectedRoom.maintenanceRooms || 0))} Rooms
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Price per Night</label>
                <p className="text-2xl font-bold text-ocean-mid">₱{selectedRoom.price.toLocaleString()}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Status</label>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getAvailabilityStyle(selectedRoom.availability)}`}>
                  {getAvailabilityLabel(selectedRoom.availability)}
                </span>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Inclusions</label>
                <div className="flex flex-wrap gap-2">
                  {selectedRoom.inclusions && selectedRoom.inclusions.length > 0 ? (
                    selectedRoom.inclusions.map((inclusion, idx) => (
                      <span key={idx} className="px-3 py-1 bg-ocean-ice text-ocean-mid rounded-full text-sm">
                        {inclusion}
                      </span>
                    ))
                  ) : (
                    <p className="text-textSecondary">No inclusions listed</p>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Description</label>
                <p className="text-textSecondary leading-relaxed whitespace-pre-wrap">
                  {selectedRoom.description}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-ocean-light/10">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedRoom(null);
                }}
                className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Close
              </button>
              <button
                onClick={() => handleEditRoom(selectedRoom)}
                className="px-5 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                <i className="fas fa-edit mr-2"></i>
                Edit Room
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Add/Edit Room Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          if (!actionLoading) {
            setShowModal(false);
            setSelectedRoom(null);
          }
        }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                {modalType === 'add' ? 'Add New Room' : 'Edit Room'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedRoom(null);
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <form onSubmit={modalType === 'add' ? handleAddRoom : handleUpdateRoom}>
              {/* Room Type Dropdown */}
              <div className="mb-3">
                <label className="block mb-1 text-sm font-medium text-textPrimary">Room Type *</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${formErrors.type ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 bg-white`}
                >
                  <option value="">Select Room Type</option>
                  <option value="Tent">Tent</option>
                  <option value="Ground Floor Rooms">Ground Floor Rooms</option>
                  <option value="Couple Room">Couple Room</option>
                  <option value="Group Room">Group Room</option>
                </select>
                {formErrors.type && <p className="text-red-500 text-xs mt-1">{formErrors.type}</p>}
              </div>

              {/* Total Rooms Available */}
              <div className="mb-3">
                <label className="block mb-1 text-sm font-medium text-textPrimary">Total Rooms Available *</label>
                <input
                  type="number"
                  name="totalRooms"
                  value={formData.totalRooms}
                  onChange={handleInputChange}
                  placeholder="Number of rooms available"
                  min="0"
                  className={`w-full px-3 py-2 border ${formErrors.totalRooms ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20`}
                />
                {formErrors.totalRooms && <p className="text-red-500 text-xs mt-1">{formErrors.totalRooms}</p>}
              </div>

              {/* Rooms Under Maintenance */}
              <div className="mb-3">
                <label className="block mb-1 text-sm font-medium text-textPrimary">Rooms Under Maintenance</label>
                <input
                  type="number"
                  name="maintenanceRooms"
                  value={formData.maintenanceRooms}
                  onChange={handleInputChange}
                  placeholder="Number of rooms under maintenance"
                  min="0"
                  className={`w-full px-3 py-2 border ${formErrors.maintenanceRooms ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20`}
                />
                {formErrors.maintenanceRooms && <p className="text-red-500 text-xs mt-1">{formErrors.maintenanceRooms}</p>}
                <p className="text-xs text-neutral mt-0.5">
                  Available Rooms will be automatically calculated as: Total Rooms Available - Rooms Under Maintenance
                </p>
              </div>
              
              {/* Capacity Fields */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block mb-1 text-sm font-medium text-textPrimary">Min Capacity (Guests) *</label>
                  <input
                    type="number"
                    name="capacityMin"
                    value={formData.capacityMin}
                    onChange={handleInputChange}
                    placeholder="Minimum guests"
                    min="0"
                    className={`w-full px-3 py-2 border ${formErrors.capacityMin ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                  />
                  {formErrors.capacityMin && <p className="text-red-500 text-xs mt-1">{formErrors.capacityMin}</p>}
                </div>
                
                <div>
                  <label className="block mb-1 text-sm font-medium text-textPrimary">Max Capacity (Guests) *</label>
                  <input
                    type="number"
                    name="capacityMax"
                    value={formData.capacityMax}
                    onChange={handleInputChange}
                    placeholder="Maximum guests"
                    min="0"
                    className={`w-full px-3 py-2 border ${formErrors.capacityMax ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                  />
                  {formErrors.capacityMax && <p className="text-red-500 text-xs mt-1">{formErrors.capacityMax}</p>}
                </div>
              </div>
              
              {/* Price and Availability */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block mb-1 text-sm font-medium text-textPrimary">Price (₱) *</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="Price per night"
                    min="0"
                    step="0.01"
                    className={`w-full px-3 py-2 border ${formErrors.price ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                  />
                  {formErrors.price && <p className="text-red-500 text-xs mt-1">{formErrors.price}</p>}
                </div>
                
                <div>
                  <label className="block mb-1 text-sm font-medium text-textPrimary">Availability *</label>
                  <select
                    name="availability"
                    value={formData.availability}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light bg-white"
                  >
                    {availabilityStatuses.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  {manualOverride && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      Manual override active. Status won't auto-update based on room counts.
                    </p>
                  )}
                </div>
              </div>
              
              {/* Inclusions Dropdown */}
              <div className="mb-3">
                <label className="block mb-1 text-sm font-medium text-textPrimary">Inclusions</label>
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && !formData.inclusions.includes(value)) {
                      setFormData(prev => ({
                        ...prev,
                        inclusions: [...prev.inclusions, value]
                      }));
                    }
                    e.target.value = '';
                  }}
                  className="w-full px-3 py-2 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light bg-white"
                >
                  <option value="">Select an inclusion to add</option>
                  <option value="Access to Pool">Access to Pool</option>
                  <option value="Wi-Fi">Wi-Fi</option>
                  <option value="Free Use of Kitchenwares & Stove">Free Use of Kitchenwares & Stove</option>
                  <option value="Free Use of Grill with Charcoal">Free Use of Grill with Charcoal</option>
                  <option value="Free Drinking (Mineral) Water">Free Drinking (Mineral) Water</option>
                  <option value="Free Bonfire at Night">Free Bonfire at Night</option>
                  <option value="Free Parking">Free Parking</option>
                  <option value="Air-Conditioned">Air-Conditioned</option>
                  <option value="Fan Room">Fan Room</option>
                  <option value="Common Bathroom">Common Bathroom</option>
                </select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formData.inclusions.map((inclusion, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-ocean-ice text-ocean-mid rounded-full text-xs">
                      {inclusion}
                      <button
                        type="button"
                        onClick={() => handleInclusionRemove(inclusion)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Description */}
              <div className="mb-3">
                <label className="block mb-1 text-sm font-medium text-textPrimary">Description *</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Describe the room features, amenities, and highlights..."
                  className={`w-full px-3 py-2 border ${formErrors.description ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                />
                {formErrors.description && <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>}
              </div>
              
              {/* Images Upload */}
              <div className="mb-4">
                <label className="block mb-1 text-sm font-medium text-textPrimary">Room Images</label>
                <div className="border-2 border-dashed border-ocean-light/20 rounded-xl p-3 text-center hover:border-ocean-light transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center gap-1"
                  >
                    <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-2xl text-ocean-light`}></i>
                    <span className="text-xs text-textSecondary">
                      {uploadingImage ? 'Uploading...' : 'Click to upload images'}
                    </span>
                    <span className="text-xs text-neutral">PNG, JPG up to 5MB (Optional)</span>
                  </label>
                </div>
                
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-ocean-light/20">
                        <Image
                          src={img}
                          alt={`Room image ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleImageRemove(img)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <i className="fas fa-times text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Form Actions */}
              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedRoom(null);
                  }}
                  className="px-4 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionLoading || 
                    (modalType === 'add' && isFormIncomplete()) ||
                    (modalType === 'edit' && (!hasChanges))
                  }
                  className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 ${
                    actionLoading || 
                    (modalType === 'add' && isFormIncomplete()) ||
                    (modalType === 'edit' && (!hasChanges))
                      ? 'bg-gray-200 text-gray-700 cursor-not-allowed opacity-50 hover:shadow-none'
                      : 'bg-gradient-to-r from-ocean-mid to-ocean-light hover:shadow-lg hover:-translate-y-0.5'
                  }`}
                >
                  {actionLoading ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> {modalType === 'add' ? 'Adding...' : 'Updating...'}</span>
                  ) : (
                    modalType === 'add' ? 'Add Room' : 'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Archive Confirmation Modal */}
      {confirmArchiveModal.show && confirmArchiveModal.room && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="fas fa-archive text-amber-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Archive Room</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to archive "{confirmArchiveModal.room.type}"? 
                This room will be moved to the archive and won't appear in active listings.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmArchiveModal({ show: false, room: null })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchiveRoom(confirmArchiveModal.room)}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                Archive
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
      `}</style>
    </div>
  );
}