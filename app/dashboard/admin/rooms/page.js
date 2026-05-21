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
  
  // New state for custom inputs
  const [showCustomRoomTypeInput, setShowCustomRoomTypeInput] = useState(false);
  const [showCustomInclusionInput, setShowCustomInclusionInput] = useState(false);
  const [customInclusionInput, setCustomInclusionInput] = useState('');

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
  const [viewImageIndex, setViewImageIndex] = useState(0);
  const [showInclusionDropdown, setShowInclusionDropdown] = useState(false);

  const roomInclusionOptions = [
    'Access to Pool',
    'Wi-Fi',
    'Free Use of Kitchenwares & Stove',
    'Free Use of Grill with Charcoal',
    'Free Drinking (Mineral) Water',
    'Free Bonfire at Night',
    'Free Parking',
    'Air-Conditioned',
    'Fan Room',
    'Common Bathroom'
  ];
  
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
    } else if (name === 'type') {
      // Handle room type selection
      if (value === 'specify') {
        setShowCustomRoomTypeInput(true);
        setFormData(prev => ({ ...prev, type: '' }));
      } else {
        setShowCustomRoomTypeInput(false);
        setFormData(prev => ({ ...prev, type: value }));
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
  
  // Handle custom room type input
  const handleCustomRoomTypeChange = (e) => {
    setFormData(prev => ({ ...prev, type: e.target.value }));
    if (formErrors.type) {
      setFormErrors(prev => ({ ...prev, type: '' }));
    }
  };
  
  // Handle adding custom inclusion
  const handleAddCustomInclusion = () => {
    if (customInclusionInput.trim() && !formData.inclusions.includes(customInclusionInput.trim())) {
      setFormData(prev => ({
        ...prev,
        inclusions: [...prev.inclusions, customInclusionInput.trim()]
      }));
      setCustomInclusionInput('');
      setShowCustomInclusionInput(false);
      
      // Update hasChanges state in edit mode
      if (modalType === 'edit' && selectedRoom) {
        setHasChanges(detectChanges());
      }
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
    // Check if the room type is a predefined one; if not, show custom input
    const predefinedTypes = ['Tent', 'Ground Floor Room', 'Couple Room', 'Group Room'];
    if (room.type && !predefinedTypes.includes(room.type)) {
      setShowCustomRoomTypeInput(true);
    } else {
      setShowCustomRoomTypeInput(false);
    }
    setManualOverride(false);
    setHasChanges(false);
    setModalType('edit');
    setShowModal(true);
    setShowViewModal(false);
    setShowCustomInclusionInput(false);
    setCustomInclusionInput('');
  };
  
  const handleViewRoom = (room) => {
    setSelectedRoom(room);
    setViewImageIndex(0);
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
    setShowCustomRoomTypeInput(false);
    setShowCustomInclusionInput(false);
    setCustomInclusionInput('');
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
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Statistics Cards */}
   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
  
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
  <div
    className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
      notification.type === 'error'
        ? 'bg-red-50 border-l-4 border-red-500 text-red-700'
        : 'bg-green-50 border-l-4 border-green-500 text-green-700'
    }`}
  >
    <i
      className={`${
        notification.type === 'error'
          ? 'fas fa-exclamation-circle text-red-500'
          : 'fas fa-check-circle text-green-500'
      } text-base`}
    ></i>
    <span className="text-sm font-medium">
      {notification.message}
    </span>
  </div>
)}

{/* Filters and Search */}
<div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
  
  {/* Search */}
  <div className="w-full sm:flex-1 min-w-[250px]">
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

  {/* Status Filter */}
  <div className="relative w-full sm:w-auto">
    <select
      value={filterStatus}
      onChange={(e) => setFilterStatus(e.target.value)}
      className="w-full sm:w-auto px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm text-textPrimary bg-white shadow-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 hover:border-[#4D8CF5]/70 transition-all duration-200 appearance-none cursor-pointer"
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

  {/* Add Button */}
<div className="w-full sm:w-auto sm:ml-auto">
  <button
    onClick={openAddModal}
    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 h-[44px] rounded-xl font-medium border-2 border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
  >
    <i className="fas fa-plus text-sm"></i>
    Add New Room
  </button>
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
            <table className="w-full min-w-[800px]">
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
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                <i className="fas fa-bed text-[#4D8CF5]"></i>
                Room Details
              </h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedRoom(null);
                }}
                 className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            {/* Room Images Slider */}
            {selectedRoom.images && selectedRoom.images.length > 0 && (
              <div className="mb-6">
                <div className="relative group overflow-hidden rounded-xl bg-ocean-pale/10 aspect-[16/9]">
                  <Image
                    src={selectedRoom.images[viewImageIndex]}
                    alt={selectedRoom.type}
                    fill
                    className="object-contain transition-all duration-500"
                  />
                  
                  {selectedRoom.images.length > 1 && (
                    <>
                      <button 
                        onClick={() => setViewImageIndex((prev) => (prev === 0 ? selectedRoom.images.length - 1 : prev - 1))}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-[#1E3A8A] shadow-md transition-all opacity-0 group-hover:opacity-100 z-10"
                      >
                        <i className="fas fa-chevron-left text-sm"></i>
                      </button>
                      <button 
                        onClick={() => setViewImageIndex((prev) => (prev === selectedRoom.images.length - 1 ? 0 : prev + 1))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-[#1E3A8A] shadow-md transition-all opacity-0 group-hover:opacity-100 z-10"
                      >
                        <i className="fas fa-chevron-right text-sm"></i>
                      </button>
                      
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {selectedRoom.images.map((_, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setViewImageIndex(idx)}
                            className={`w-1.5 h-1.5 rounded-full cursor-pointer transition-all ${idx === viewImageIndex ? 'bg-[#4D8CF5] w-4' : 'bg-white/60 hover:bg-white'}`} 
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                {selectedRoom.images.length > 1 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide">
                    {selectedRoom.images.map((img, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setViewImageIndex(idx)}
                        className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${idx === viewImageIndex ? 'border-[#4D8CF5]' : 'border-transparent hover:border-[#4D8CF5]/50'}`}
                      >
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
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 bg-[#4D8CF5]/5 rounded-2xl p-6 border border-[#4D8CF5]/10 mb-6">
              <div className="col-span-1 md:col-span-2 pb-2 border-b border-[#4D8CF5]/10 flex justify-between items-center">
                <h3 className="font-bold text-[#1E3A8A]">{selectedRoom.type}</h3>
                <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${getAvailabilityStyle(selectedRoom.availability)}`}>
                  {getAvailabilityLabel(selectedRoom.availability)}
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#1E3A8A]/50 uppercase tracking-widest mb-1">Pricing</label>
                <p className="text-xl font-bold text-[#4D8CF5]">₱{selectedRoom.price.toLocaleString()}<span className="text-xs font-normal text-textSecondary ml-1">/ night</span></p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#1E3A8A]/50 uppercase tracking-widest mb-1">Guest Capacity</label>
                <p className="text-sm font-semibold text-[#1E3A8A] flex items-center gap-2">
                  <i className="fas fa-users text-[#4D8CF5]/60"></i>
                  {selectedRoom.capacityMin && selectedRoom.capacityMax 
                    ? `${selectedRoom.capacityMin}–${selectedRoom.capacityMax} Guests` 
                    : selectedRoom.capacity || `${selectedRoom.capacityMin || selectedRoom.capacityMax} Guests`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-2">
                <div>
                  <label className="block text-[10px] font-bold text-[#1E3A8A]/50 uppercase tracking-widest mb-1">Room Counts</label>
                  <div className="space-y-1">
                    <p className="text-xs text-textSecondary flex items-center justify-between">
                      <span>Total Units:</span>
                      <span className="font-bold text-[#1E3A8A]">{selectedRoom.totalRooms}</span>
                    </p>
                    <p className="text-xs text-textSecondary flex items-center justify-between">
                      <span>Maintenance:</span>
                      <span className="font-bold text-amber-600">{selectedRoom.maintenanceRooms || 0}</span>
                    </p>
                    <p className="text-xs text-textSecondary flex items-center justify-between">
                      <span>Available:</span>
                      <span className="font-bold text-green-600">{selectedRoom.availableRooms || (selectedRoom.totalRooms - (selectedRoom.maintenanceRooms || 0))}</span>
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#1E3A8A]/50 uppercase tracking-widest mb-1">Description</label>
                  <p className="text-xs text-textSecondary leading-relaxed line-clamp-3">
                    {selectedRoom.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-[10px] font-bold text-[#1E3A8A]/50 uppercase tracking-widest mb-2 px-1">Room Inclusions</label>
              <div className="flex flex-wrap gap-2">
                {selectedRoom.inclusions && selectedRoom.inclusions.length > 0 ? (
                  selectedRoom.inclusions.map((inclusion, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-white border border-[#4D8CF5]/20 text-[#1E3A8A] rounded-xl text-xs font-medium shadow-sm">
                      {inclusion}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-textSecondary px-1 italic">No inclusions listed</p>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 justify-end pt-4 border-t border-ocean-light/10">
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
                className="px-5 py-2.5 bg-[#4D8CF5] rounded-xl text-white text-sm font-medium hover:bg-[#3B78E7] shadow-sm hover:shadow-md transition-all duration-300"
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
            setShowInclusionDropdown(false);
          }
        }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                <i className={`fas ${modalType === 'add' ? 'fa-plus-circle' : 'fa-edit'} text-[#4D8CF5]`}></i>
                {modalType === 'add' ? 'Add New Room' : 'Edit Room'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedRoom(null);
                  setShowInclusionDropdown(false);
                }}
 className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <form onSubmit={modalType === 'add' ? handleAddRoom : handleUpdateRoom}>
              {/* Basic Info Group */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <div className="mb-4">
                  <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Room Type *</label>
                  <select
                    name="type"
                    value={showCustomRoomTypeInput ? 'specify' : formData.type}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2.5 border-2 ${formErrors.type ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/10 bg-white transition-all`}
                  >
                    <option value="">Select Room Type</option>
                    <option value="Tent">Tent</option>
                    <option value="Ground Floor Room">Ground Floor Room</option>
                    <option value="Couple Room">Couple Room</option>
                    <option value="Group Room">Group Room</option>
                    <option value="specify">Specify</option>
                  </select>
                  {showCustomRoomTypeInput && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={formData.type}
                        onChange={handleCustomRoomTypeChange}
                        placeholder="Enter custom room type"
                        className={`w-full px-4 py-2.5 border-2 ${formErrors.type ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                      />
                      {formErrors.type && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.type}</p>}
                    </div>
                  )}
                  {!showCustomRoomTypeInput && formErrors.type && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.type}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Total Units *</label>
                    <input
                      type="number"
                      name="totalRooms"
                      value={formData.totalRooms}
                      onChange={handleInputChange}
                      placeholder="e.g. 10"
                      min="0"
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.totalRooms ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    />
                    {formErrors.totalRooms && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.totalRooms}</p>}
                  </div>

                  <div>
                    <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Maintenance</label>
                    <input
                      type="number"
                      name="maintenanceRooms"
                      value={formData.maintenanceRooms}
                      onChange={handleInputChange}
                      placeholder="e.g. 0"
                      min="0"
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.maintenanceRooms ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    />
                    {formErrors.maintenanceRooms && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.maintenanceRooms}</p>}
                  </div>
                </div>
              </div>
              
              {/* Capacity & Price Group */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Min Guests *</label>
                    <input
                      type="number"
                      name="capacityMin"
                      value={formData.capacityMin}
                      onChange={handleInputChange}
                      placeholder="Min"
                      min="0"
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.capacityMin ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    />
                    {formErrors.capacityMin && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.capacityMin}</p>}
                  </div>
                  
                  <div>
                    <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Max Guests *</label>
                    <input
                      type="number"
                      name="capacityMax"
                      value={formData.capacityMax}
                      onChange={handleInputChange}
                      placeholder="Max"
                      min="0"
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.capacityMax ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    />
                    {formErrors.capacityMax && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.capacityMax}</p>}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Price (₱) *</label>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="Price / night"
                      min="0"
                      step="0.01"
                      className={`w-full px-4 py-2.5 border-2 ${formErrors.price ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all`}
                    />
                    {formErrors.price && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.price}</p>}
                  </div>
                  
                  <div>
                    <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest">Initial Status *</label>
                    <select
                      name="availability"
                      value={formData.availability}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] bg-white transition-all"
                    >
                      {availabilityStatuses.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                    {manualOverride && (
                      <p className="text-[10px] text-amber-600 mt-1 font-medium ml-1">Manual override active</p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Inclusions Dropdown (Standardized) with Custom Option */}
              <div className="mb-4">
                <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest px-1">Room Inclusions</label>
                <div className="relative">
                  <button 
                    type="button" 
                    onClick={() => setShowInclusionDropdown(!showInclusionDropdown)} 
                    className="w-full px-4 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] bg-white text-left flex justify-between items-center transition-all hover:border-[#4D8CF5]/40"
                  >
                    <span className={formData.inclusions.length === 0 ? 'text-gray-400' : 'text-[#1E3A8A] font-medium'}>
                      {formData.inclusions.length === 0 ? 'Select inclusions...' : `${formData.inclusions.length} selected`}
                    </span>
                    <i className={`fas fa-chevron-${showInclusionDropdown ? 'up' : 'down'} text-[#4D8CF5] text-xs`}></i>
                  </button>
                  
                  {showInclusionDropdown && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-[#4D8CF5]/10 rounded-xl shadow-xl z-50 max-h-60 overflow-auto animate-scaleIn">
                      {roomInclusionOptions.map((option) => (
                        <label key={option} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#4D8CF5]/5 cursor-pointer transition-colors border-b border-gray-50 last:border-0">
                          <input 
                            type="checkbox" 
                            checked={formData.inclusions.includes(option)} 
                            onChange={() => {
                              if (formData.inclusions.includes(option)) {
                                setFormData(prev => ({ ...prev, inclusions: prev.inclusions.filter(i => i !== option) }));
                              } else {
                                setFormData(prev => ({ ...prev, inclusions: [...prev.inclusions, option] }));
                              }
                            }} 
                            className="w-4 h-4 rounded border-[#4D8CF5]/30 text-[#4D8CF5] focus:ring-[#4D8CF5]/20" 
                          />
                          <span className="text-sm text-[#1E3A8A]">{option}</span>
                        </label>
                      ))}
                      {/* Custom Inclusion Option */}
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        {!showCustomInclusionInput ? (
                          <button
                            type="button"
                            onClick={() => setShowCustomInclusionInput(true)}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#4D8CF5] hover:bg-[#4D8CF5]/5 flex items-center gap-2 transition-colors"
                          >
                            <i className="fas fa-plus-circle text-xs"></i>
                            <span>Specify custom inclusion</span>
                          </button>
                        ) : (
                          <div className="p-3 border-t border-[#4D8CF5]/10">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customInclusionInput}
                                onChange={(e) => setCustomInclusionInput(e.target.value)}
                                placeholder="Enter custom inclusion"
                                className="flex-1 px-3 py-1.5 border border-[#4D8CF5]/20 rounded-lg text-sm focus:outline-none focus:border-[#4D8CF5]"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={handleAddCustomInclusion}
                                className="px-3 py-1.5 bg-[#4D8CF5] text-white rounded-lg text-sm hover:bg-[#3B78E7] transition-colors"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCustomInclusionInput(false);
                                  setCustomInclusionInput('');
                                }}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {formData.inclusions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 px-1">
                    {formData.inclusions.map((inclusion, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#4D8CF5]/10 text-[#1E3A8A] rounded-full text-[11px] font-medium border border-[#4D8CF5]/10">
                        {inclusion}
                        <button 
                          type="button" 
                          onClick={() => handleInclusionRemove(inclusion)} 
                          className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-[#4D8CF5]/20 transition-colors"
                        >
                          <i className="fas fa-times text-[8px]"></i>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Description & Images */}
              <div className="mb-4">
                <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest px-1">Description *</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Tell guests about this room..."
                  className={`w-full px-4 py-2.5 border-2 ${formErrors.description ? 'border-red-500' : 'border-[#4D8CF5]/20'} rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] transition-all resize-none`}
                />
                {formErrors.description && <p className="text-red-500 text-[10px] mt-1 font-medium ml-1">{formErrors.description}</p>}
              </div>
              
              <div className="mb-6">
                <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest px-1">Room Images</label>
                <div className="border-2 border-dashed border-[#4D8CF5]/20 rounded-xl p-5 text-center hover:border-[#4D8CF5]/40 hover:bg-[#4D8CF5]/5 transition-all group">
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
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#4D8CF5]/10 flex items-center justify-center group-hover:bg-[#4D8CF5]/20 transition-all">
                      <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-xl text-[#4D8CF5]`}></i>
                    </div>
                    <span className="text-xs font-semibold text-[#1E3A8A]">
                      {uploadingImage ? 'Uploading...' : 'Click to upload images'}
                    </span>
                    <span className="text-[10px] text-[#1E3A8A]/40 uppercase tracking-widest">PNG, JPG up to 5MB</span>
                  </label>
                </div>
                
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3 px-1">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-[#4D8CF5]/10 shadow-sm">
                        <Image
                          src={img}
                          alt={`Room image ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleImageRemove(img)}
                          className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Form Actions */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedRoom(null);
                    setShowInclusionDropdown(false);
                  }}
className="px-6 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionLoading || 
                    (modalType === 'add' && isFormIncomplete()) ||
                    (modalType === 'edit' && (!hasChanges))
                  }
                  className={`px-8 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm transition-all ${
                    actionLoading || 
                    (modalType === 'add' && isFormIncomplete()) ||
                    (modalType === 'edit' && (!hasChanges))
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-[#4D8CF5] hover:bg-[#3B78E7] hover:shadow-md active:scale-95'
                  }`}
                >
                  {actionLoading ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> Processing...</span>
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