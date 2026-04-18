// app/dashboard/admin/day-tour/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';  
import { db } from '../../../../lib/firebase';
import { collection, addDoc, updateDoc, doc, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { uploadImage } from '../../../../lib/cloudinary';
import { logAdminAction } from '../../../../lib/auditLogger';
import Image from 'next/image';
import ImageSlider from '@/components/guest/ImageSlider';

export default function AdminDayTour() {
  const [dayTour, setDayTour] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activeTab, setActiveTab] = useState('tours');
  const [loading, setLoading] = useState(true);
  const [showTourModal, setShowTourModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showTourDetailsModal, setShowTourDetailsModal] = useState(false);
  const [showActivityDetailsModal, setShowActivityDetailsModal] = useState(false);
  const [tourModalType, setTourModalType] = useState('add');
  const [activityModalType, setActivityModalType] = useState('add');
  const [selectedTour, setSelectedTour] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmArchiveModal, setConfirmArchiveModal] = useState({ show: false, tour: null });
  const [confirmArchiveActivityModal, setConfirmArchiveActivityModal] = useState({ show: false, activity: null });
    const tabsContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const buttonRefs = useRef({});

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

  // Track original form data for edit mode
  const [originalTourData, setOriginalTourData] = useState(null);
  const [originalActivityData, setOriginalActivityData] = useState(null);
  
  // Tour Form State
  const [tourFormData, setTourFormData] = useState({
    adultPrice: '',
    kidPrice: '',
    seniorPrice: '',
    maxCapacity: '',
    availability: 'available',
    images: [],
    inclusions: [],
    description: ''
  });
  
  // Activity Form State
  const [activityFormData, setActivityFormData] = useState({
    name: '',
    priceType: 'perHour', // New field for pricing type
    priceValue: '',
    description: '',
    images: []
  });
  
  const [tourFormErrors, setTourFormErrors] = useState({});
  const [activityFormErrors, setActivityFormErrors] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [inclusionInput, setInclusionInput] = useState('');
  
  const availabilityStatuses = [
    { value: 'available', label: 'Available', color: 'bg-green-50 text-green-700 border-green-200' },
    { value: 'unavailable', label: 'Not Available', color: 'bg-red-50 text-red-700 border-red-200' }
  ];
  
  // Pricing type options
  const pricingTypes = [
    { value: 'perHour', label: 'Per Hour' },
    { value: 'per30Mins', label: 'Per 30 Minutes' },
    { value: 'per2Hrs', label: 'Per 2 Hours' },
    { value: 'per1Hr30Mins', label: 'Per 1 Hour 30 Minutes' }
  ];
  
  // Helper function to format price display text
  const getPriceDisplayText = (priceType, priceValue) => {
    const price = parseFloat(priceValue).toLocaleString();
    switch (priceType) {
      case 'perHour':
        return `₱${price}/hour`;
      case 'per30Mins':
        return `₱${price}/30 minutes`;
      case 'per2Hrs':
        return `₱${price}/2 hours`;
      case 'per1Hr30Mins':
        return `₱${price}/1.5 hours`;
      default:
        return `₱${price}`;
    }
  };
  
  // Real-time listener for day tours (only get the first non-archived one)
useEffect(() => {
  const toursRef = collection(db, 'dayTours');
  // Changed from 'archived', '!=', true to 'archived', '==', false for clarity
  const q = query(toursRef, where('archived', '==', false), orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const toursList = [];
    querySnapshot.forEach((doc) => {
      toursList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    // Only keep the first tour (since only one is allowed)
    setDayTour(toursList[0] || null);
  }, (error) => {
    console.error('Error fetching day tours:', error);
    showNotification('Failed to load day tours.', 'error');
  });
  
  return () => unsubscribe();
}, []);
  
  // Real-time listener for activities (only show non-archived)
  useEffect(() => {
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, where('archived', '!=', true), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const activitiesList = [];
      querySnapshot.forEach((doc) => {
        activitiesList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setActivities(activitiesList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching activities:', error);
      showNotification('Failed to load activities.', 'error');
      setLoading(false);
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
  
  // Check if tour form has changes
  const hasTourChanges = () => {
    if (!originalTourData) return false;
    return JSON.stringify(tourFormData) !== JSON.stringify(originalTourData);
  };
  
  // Check if activity form has changes
  const hasActivityChanges = () => {
    if (!originalActivityData) return false;
    return JSON.stringify(activityFormData) !== JSON.stringify(originalActivityData);
  };
  
  // Tour Handlers
  const handleTourInputChange = (e) => {
    const { name, value } = e.target;
    
    // Handle numeric field validation to prevent negative numbers
    if (name === 'adultPrice' || name === 'kidPrice' || name === 'seniorPrice' || name === 'maxCapacity') {
      const numValue = parseFloat(value);
      if (value !== '' && (isNaN(numValue) || numValue < 0)) {
        setTourFormErrors(prev => ({
          ...prev,
          [name]: `${name === 'adultPrice' ? 'Adult price' : name === 'kidPrice' ? 'Kid price' : name === 'seniorPrice' ? 'Senior price' : 'Maximum capacity'} cannot be negative`
        }));
        setTourFormData(prev => ({
          ...prev,
          [name]: value
        }));
        return;
      } else {
        setTourFormErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
    }
    
    setTourFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (tourFormErrors[name]) {
      setTourFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };
  
  const handleInclusionAdd = () => {
    if (inclusionInput.trim() && !tourFormData.inclusions.includes(inclusionInput.trim())) {
      setTourFormData(prev => ({
        ...prev,
        inclusions: [...prev.inclusions, inclusionInput.trim()]
      }));
      setInclusionInput('');
    }
  };
  
  const handleInclusionRemove = (inclusion) => {
    setTourFormData(prev => ({
      ...prev,
      inclusions: prev.inclusions.filter(i => i !== inclusion)
    }));
  };
  
  const handleTourImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingImage(true);
    try {
      const uploadPromises = files.map(file => uploadImage(file));
      const uploadedUrls = await Promise.all(uploadPromises);
      
      setTourFormData(prev => ({
        ...prev,
        images: [...prev.images, ...uploadedUrls]
      }));
      showNotification(`${files.length} image(s) uploaded successfully!`);
    } catch (error) {
      console.error('Error uploading images:', error);
      showNotification('Failed to upload images.', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleTourImageRemove = (imageUrl) => {
    setTourFormData(prev => ({
      ...prev,
      images: prev.images.filter(img => img !== imageUrl)
    }));
  };
  
  const validateTourForm = () => {
    const errors = {};
    
    if (!tourFormData.adultPrice) errors.adultPrice = 'Adult price is required';
    else if (isNaN(tourFormData.adultPrice) || parseFloat(tourFormData.adultPrice) <= 0) {
      errors.adultPrice = 'Adult price must be a positive number';
    }
    
    if (!tourFormData.kidPrice) errors.kidPrice = 'Kid price is required';
    else if (isNaN(tourFormData.kidPrice) || parseFloat(tourFormData.kidPrice) <= 0) {
      errors.kidPrice = 'Kid price must be a positive number';
    }
    
    if (!tourFormData.seniorPrice) errors.seniorPrice = 'Senior price is required';
    else if (isNaN(tourFormData.seniorPrice) || parseFloat(tourFormData.seniorPrice) <= 0) {
      errors.seniorPrice = 'Senior price must be a positive number';
    }
    
    if (tourFormData.maxCapacity) {
      if (isNaN(tourFormData.maxCapacity) || parseInt(tourFormData.maxCapacity) <= 0) {
        errors.maxCapacity = 'Maximum capacity must be a positive number';
      }
    }
    
    if (!tourFormData.description.trim()) errors.description = 'Description is required';
    
    return errors;
  };
  
  const isTourFormIncomplete = () => {
    return !tourFormData.adultPrice || !tourFormData.kidPrice || !tourFormData.seniorPrice || !tourFormData.description.trim();
  };
  
 const handleAddTour = async (e) => {
  e.preventDefault();
  const errors = validateTourForm();
  
  if (Object.keys(errors).length > 0) {
    setTourFormErrors(errors);
    return;
  }
  
  setActionLoading(true);
  
  try {
    // Check if a day tour already exists (not archived)
const toursRef = collection(db, 'dayTours');
const activeToursQuery = query(toursRef, where('archived', '==', false));
const activeToursSnapshot = await getDocs(activeToursQuery);

if (!activeToursSnapshot.empty) {
  showNotification('Cannot create: A day tour already exists. Only one day tour post is allowed at a time. Please archive the existing day tour first.', 'error');
  setActionLoading(false);
  return;
}
    
    const tourData = {
      adultPrice: parseFloat(tourFormData.adultPrice),
      kidPrice: parseFloat(tourFormData.kidPrice),
      seniorPrice: parseFloat(tourFormData.seniorPrice),
      maxCapacity: tourFormData.maxCapacity ? parseInt(tourFormData.maxCapacity) : null,
      availability: tourFormData.availability,
      images: tourFormData.images,
      inclusions: tourFormData.inclusions,
      description: tourFormData.description,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, 'dayTours'), tourData);
    
    await logAdminAction({
      action: 'Created Day Tour',
      module: 'Day Tour Management',
      details: `Added new day tour (Adult: ₱${parseFloat(tourFormData.adultPrice).toLocaleString()}, Kid: ₱${parseFloat(tourFormData.kidPrice).toLocaleString()}, Senior: ₱${parseFloat(tourFormData.seniorPrice).toLocaleString()}, Capacity: ${tourFormData.maxCapacity || 'Unlimited'}, Status: ${tourFormData.availability})`
    });
    
    showNotification('Day tour added successfully!');
    resetTourForm();
    
    setTimeout(() => {
      setShowTourModal(false);
    }, 2000);
    
  } catch (error) {
    console.error('Error adding day tour:', error);
    showNotification('Failed to add day tour.', 'error');
  } finally {
    setActionLoading(false);
  }
};
  
  const handleUpdateTour = async (e) => {
    e.preventDefault();
    const errors = validateTourForm();
    
    if (Object.keys(errors).length > 0) {
      setTourFormErrors(errors);
      return;
    }
    
    setActionLoading(true);
    
    try {
      const tourRef = doc(db, 'dayTours', selectedTour.id);
      
      const previousData = {
        adultPrice: selectedTour.adultPrice,
        kidPrice: selectedTour.kidPrice,
        seniorPrice: selectedTour.seniorPrice,
        maxCapacity: selectedTour.maxCapacity,
        availability: selectedTour.availability,
        description: selectedTour.description,
        inclusions: selectedTour.inclusions || []
      };
      
      const newData = {
        adultPrice: parseFloat(tourFormData.adultPrice),
        kidPrice: parseFloat(tourFormData.kidPrice),
        seniorPrice: parseFloat(tourFormData.seniorPrice),
        maxCapacity: tourFormData.maxCapacity ? parseInt(tourFormData.maxCapacity) : null,
        availability: tourFormData.availability,
        description: tourFormData.description,
        inclusions: tourFormData.inclusions
      };
      
      await updateDoc(tourRef, {
        adultPrice: parseFloat(tourFormData.adultPrice),
        kidPrice: parseFloat(tourFormData.kidPrice),
        seniorPrice: parseFloat(tourFormData.seniorPrice),
        maxCapacity: tourFormData.maxCapacity ? parseInt(tourFormData.maxCapacity) : null,
        availability: tourFormData.availability,
        images: tourFormData.images,
        inclusions: tourFormData.inclusions,
        description: tourFormData.description,
        updatedAt: new Date().toISOString()
      });
      
      const changes = [];
      
      if (previousData.adultPrice !== newData.adultPrice) changes.push(`adult price from ₱${previousData.adultPrice?.toLocaleString()} to ₱${newData.adultPrice?.toLocaleString()}`);
      if (previousData.kidPrice !== newData.kidPrice) changes.push(`kid price from ₱${previousData.kidPrice?.toLocaleString()} to ₱${newData.kidPrice?.toLocaleString()}`);
      if (previousData.seniorPrice !== newData.seniorPrice) changes.push(`senior price from ₱${previousData.seniorPrice?.toLocaleString()} to ₱${newData.seniorPrice?.toLocaleString()}`);
      if (previousData.maxCapacity !== newData.maxCapacity) changes.push(`max capacity from ${previousData.maxCapacity || 'Unlimited'} to ${newData.maxCapacity || 'Unlimited'}`);
      if (previousData.availability !== newData.availability) changes.push(`availability from "${previousData.availability}" to "${newData.availability}"`);
      if (previousData.description !== newData.description) changes.push(`updated the description`);
      
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
      
      if (changes.length > 0) {
        let logDetails = `Updated Day Tour`;
        if (changes.length === 1 && changes[0] === 'updated the description') {
          logDetails += `: updated the description.`;
        } else if (changes.length === 1 && changes[0].includes('inclusions')) {
          logDetails += `: ${changes[0]}.`;
        } else if (changes.length > 0) {
          logDetails += `: ${changes.join(', ')}.`;
        }
        
        await logAdminAction({
          action: 'Updated Day Tour',
          module: 'Day Tour Management',
          details: logDetails
        });
      }
      
      showNotification('Day tour updated successfully!');
      
      setTimeout(() => {
        setShowTourModal(false);
        setSelectedTour(null);
        setOriginalTourData(null);
      }, 2000);
      
    } catch (error) {
      console.error('Error updating day tour:', error);
      showNotification('Failed to update day tour.', 'error');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleArchiveTour = async (tour) => {
    try {
      const tourRef = doc(db, 'dayTours', tour.id);
      await updateDoc(tourRef, {
        archived: true,
        archivedAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Archived Day Tour',
        module: 'Day Tour Management',
        details: `Archived day tour (Adult: ₱${tour.adultPrice?.toLocaleString()}, Kid: ₱${tour.kidPrice?.toLocaleString()}, Senior: ₱${tour.seniorPrice?.toLocaleString()}, Capacity: ${tour.maxCapacity || 'Unlimited'})`
      });
      
      showNotification(`Day tour has been archived successfully!`);
      // Reflect removal immediately in this view while listeners settle.
      setDayTour(null);
      setConfirmArchiveModal({ show: false, tour: null });
    } catch (error) {
      console.error('Error archiving day tour:', error);
      showNotification('Failed to archive day tour.', 'error');
    }
  };
  
  const handleEditTour = (tour) => {
    const formData = {
      adultPrice: tour.adultPrice || '',
      kidPrice: tour.kidPrice || '',
      seniorPrice: tour.seniorPrice || '',
      maxCapacity: tour.maxCapacity || '',
      availability: tour.availability || 'available',
      images: tour.images || [],
      inclusions: tour.inclusions || [],
      description: tour.description || ''
    };
    setSelectedTour(tour);
    setTourFormData(formData);
    setOriginalTourData(JSON.parse(JSON.stringify(formData)));
    setTourModalType('edit');
    setShowTourModal(true);
  };
  
  const resetTourForm = () => {
    const emptyForm = {
      adultPrice: '',
      kidPrice: '',
      seniorPrice: '',
      maxCapacity: '',
      availability: 'available',
      images: [],
      inclusions: [],
      description: ''
    };
    setTourFormData(emptyForm);
    setOriginalTourData(null);
    setInclusionInput('');
    setTourFormErrors({});
  };
  
  const openAddTourModal = () => {
    setTourModalType('add');
    resetTourForm();
    setSelectedTour(null);
    setShowTourModal(true);
  };
  
  // Activity Handlers
  const handleActivityInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'priceValue') {
      const numValue = parseFloat(value);
      if (value !== '' && (isNaN(numValue) || numValue < 0)) {
        setActivityFormErrors(prev => ({
          ...prev,
          [name]: 'Price cannot be negative'
        }));
        setActivityFormData(prev => ({
          ...prev,
          [name]: value
        }));
        return;
      } else {
        setActivityFormErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
    }
    
    setActivityFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (activityFormErrors[name]) {
      setActivityFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleActivityImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingImage(true);
    try {
      const uploadPromises = files.map(file => uploadImage(file));
      const uploadedUrls = await Promise.all(uploadPromises);
      
      setActivityFormData(prev => ({
        ...prev,
        images: [...prev.images, ...uploadedUrls]
      }));
      showNotification(`${files.length} image(s) uploaded successfully!`);
    } catch (error) {
      console.error('Error uploading images:', error);
      showNotification('Failed to upload images.', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleActivityImageRemove = (imageUrl) => {
    setActivityFormData(prev => ({
      ...prev,
      images: prev.images.filter(img => img !== imageUrl)
    }));
  };
  
  const validateActivityForm = () => {
    const errors = {};
    
    if (!activityFormData.name.trim()) errors.name = 'Activity name is required';
    if (!activityFormData.priceValue) errors.priceValue = 'Price is required';
    else if (isNaN(activityFormData.priceValue) || parseFloat(activityFormData.priceValue) <= 0) {
      errors.priceValue = 'Price must be a positive number';
    }
    if (!activityFormData.description.trim()) errors.description = 'Description is required';
    
    return errors;
  };
  
  const isActivityFormIncomplete = () => {
    return !activityFormData.name.trim() || !activityFormData.priceValue || !activityFormData.description.trim();
  };
  
  const handleAddActivity = async (e) => {
    e.preventDefault();
    const errors = validateActivityForm();
    
    if (Object.keys(errors).length > 0) {
      setActivityFormErrors(errors);
      return;
    }
    
    setActionLoading(true);
    
    try {
      const activityData = {
        name: activityFormData.name,
        priceType: activityFormData.priceType,
        priceValue: parseFloat(activityFormData.priceValue),
        description: activityFormData.description,
        images: activityFormData.images,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await addDoc(collection(db, 'activities'), activityData);
      
      await logAdminAction({
        action: 'Created Activity',
        module: 'Day Tour Management',
        details: `Added new activity: ${activityFormData.name} (${getPriceDisplayText(activityFormData.priceType, activityFormData.priceValue)})`
      });
      
      showNotification('Activity added successfully!');
      resetActivityForm();
      
      setTimeout(() => {
        setShowActivityModal(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error adding activity:', error);
      showNotification('Failed to add activity.', 'error');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleUpdateActivity = async (e) => {
    e.preventDefault();
    const errors = validateActivityForm();
    
    if (Object.keys(errors).length > 0) {
      setActivityFormErrors(errors);
      return;
    }
    
    setActionLoading(true);
    
    try {
      const activityRef = doc(db, 'activities', selectedActivity.id);
      
      const previousData = {
        name: selectedActivity.name,
        priceType: selectedActivity.priceType,
        priceValue: selectedActivity.priceValue,
        description: selectedActivity.description
      };
      
      const newData = {
        name: activityFormData.name,
        priceType: activityFormData.priceType,
        priceValue: parseFloat(activityFormData.priceValue),
        description: activityFormData.description
      };
      
      await updateDoc(activityRef, {
        name: activityFormData.name,
        priceType: activityFormData.priceType,
        priceValue: parseFloat(activityFormData.priceValue),
        description: activityFormData.description,
        images: activityFormData.images,
        updatedAt: new Date().toISOString()
      });
      
      const changes = [];
      
      if (previousData.name !== newData.name) changes.push(`name from "${previousData.name}" to "${newData.name}"`);
      if (previousData.priceType !== newData.priceType || previousData.priceValue !== newData.priceValue) {
        const oldPriceDisplay = getPriceDisplayText(previousData.priceType, previousData.priceValue);
        const newPriceDisplay = getPriceDisplayText(newData.priceType, newData.priceValue);
        changes.push(`price from ${oldPriceDisplay} to ${newPriceDisplay}`);
      }
      if (previousData.description !== newData.description) changes.push(`updated the description`);
      
      if (changes.length > 0) {
        let logDetails = `Updated Activity '${newData.name || previousData.name}'`;
        if (changes.length === 1 && changes[0] === 'updated the description') {
          logDetails += `: updated the description.`;
        } else if (changes.length > 0) {
          logDetails += `: ${changes.join(', ')}.`;
        }
        
        await logAdminAction({
          action: 'Updated Activity',
          module: 'Day Tour Management',
          details: logDetails
        });
      }
      
      showNotification('Activity updated successfully!');
      
      setTimeout(() => {
        setShowActivityModal(false);
        setSelectedActivity(null);
        setOriginalActivityData(null);
      }, 2000);
      
    } catch (error) {
      console.error('Error updating activity:', error);
      showNotification('Failed to update activity.', 'error');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleArchiveActivity = async (activity) => {
    try {
      const activityRef = doc(db, 'activities', activity.id);
      await updateDoc(activityRef, {
        archived: true,
        archivedAt: new Date().toISOString()
      });
      
      await logAdminAction({
        action: 'Archived Activity',
        module: 'Day Tour Management',
        details: `Archived activity: ${activity.name} (${getPriceDisplayText(activity.priceType, activity.priceValue)})`
      });
      
      showNotification(`${activity.name} has been archived successfully!`);
      setConfirmArchiveActivityModal({ show: false, activity: null });
    } catch (error) {
      console.error('Error archiving activity:', error);
      showNotification('Failed to archive activity.', 'error');
    }
  };
  
  const handleEditActivity = (activity) => {
    const formData = {
      name: activity.name || '',
      priceType: activity.priceType || 'perHour',
      priceValue: activity.priceValue || '',
      description: activity.description || '',
      images: activity.images || []
    };
    setSelectedActivity(activity);
    setActivityFormData(formData);
    setOriginalActivityData(JSON.parse(JSON.stringify(formData)));
    setActivityModalType('edit');
    setShowActivityModal(true);
  };
  
  const resetActivityForm = () => {
    setActivityFormData({
      name: '',
      priceType: 'perHour',
      priceValue: '',
      description: '',
      images: []
    });
    setOriginalActivityData(null);
    setActivityFormErrors({});
  };
  
  const openAddActivityModal = () => {
    setActivityModalType('add');
    resetActivityForm();
    setSelectedActivity(null);
    setShowActivityModal(true);
  };
  
  const getAvailabilityStyle = (availability) => {
    const status = availabilityStatuses.find(s => s.value === availability);
    return status ? status.color : 'bg-gray-100 text-gray-700';
  };
  
  const getAvailabilityLabel = (availability) => {
    const status = availabilityStatuses.find(s => s.value === availability);
    return status ? status.label : availability;
  };
  
  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
<div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
  <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
    Day Tour & Activities Management
  </h1>
  <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
    Manage your day tour package and adventure activities
  </p>
</div>
      
      {/* Tabs */}
<div className="relative flex items-center mb-8 border-b border-[#4D8CF5]/20">
  <div className="relative flex w-full">

    {/* Sliding background */}
    <div
      className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
      style={{
        transform: `
          translateX(${activeTab === 'tours' ? '0%' : '100%'})
          scale(0.98)
        `,
      }}
    />

    {/* Left Tab */}
    <div className="flex-1 flex justify-center">
      <button
        onClick={() => setActiveTab('tours')}
        className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
          activeTab === 'tours'
            ? 'text-[#1E3A8A]'
            : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
        }`}
      >
        <i className="fas fa-sun"></i>
        Day Tour
      </button>
    </div>

    {/* Right Tab */}
    <div className="flex-1 flex justify-center">
      <button
        onClick={() => setActiveTab('activities')}
        className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
          activeTab === 'activities'
            ? 'text-[#1E3A8A]'
            : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
        }`}
      >
        <i className="fas fa-bicycle"></i>
        Activities
      </button>
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
      
      {/* Day Tour Tab Content */}
      {activeTab === 'tours' && (
        <div>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
            </div>
          ) : !dayTour ? (
            /* No Day Tour Created - Show Creation Card */
        <div className="max-w-3xl mx-auto">
  <div className="bg-white rounded-2xl shadow-lg border-2 border-[#4D8CF5]/15 overflow-hidden">
    
    {/* Header Section */}
    <div className="bg-gradient-to-r from-[#4D8CF5]/10 to-[#93C5FD]/20 px-6 py-10 text-center">
      <div className="w-20 h-20 mx-auto mb-4 bg-[#4D8CF5]/10 rounded-full flex items-center justify-center border border-[#4D8CF5]/20">
        <i className="fas fa-umbrella-beach text-4xl text-[#4D8CF5]"></i>
      </div>

      <h2 className="text-2xl font-bold text-[#1E3A8A] mb-2">
        No Day Tour Created Yet
      </h2>

      <p className="text-[#1E3A8A]/70">
        Get started by creating your first day tour package
      </p>
    </div>

    {/* Body Section */}
    <div className="p-8 text-center bg-white/5">
      <p className="text-[#1E3A8A]/70 mb-6">
        Create a day tour package that guests can book. You can only have one active day tour at a time.
      </p>

      <button
        onClick={openAddTourModal}
       className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <i className="fas fa-plus text-sm"></i>
        Create Day Tour
      </button>
    </div>
  </div>
</div>
          ) : (
            /* Day Tour Exists - Show Management Card */
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
{/* Tour Header with Status */}
<div className="flex justify-between items-start p-6 border-b border-[#4D8CF5]/20 bg-[#4D8CF5]/10">
  <div>
    <div className="flex items-center gap-3 mb-2">
      <h2 className="text-xl font-bold text-[#1E3A8A] font-playfair">
        Day Tour
      </h2>

      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAvailabilityStyle(dayTour.availability)}`}
      >
        {getAvailabilityLabel(dayTour.availability)}
      </span>
    </div>

    {dayTour.maxCapacity && (
      <p className="text-[#1E3A8A]/70 text-xs flex items-center gap-1">
        <i className="fas fa-users text-[#1E3A8A]/60 text-xs"></i>
        Maximum Capacity: {dayTour.maxCapacity} guests
      </p>
    )}
  </div>

  <div className="flex gap-2">
    <button
      onClick={() => {
        setSelectedTour(dayTour);
        setShowTourDetailsModal(true);
      }}
      className="p-1.5 rounded-lg bg-[#4D8CF5]/10 text-[#1E3A8A] border border-[#4D8CF5]/20 hover:bg-[#4D8CF5] hover:text-white transition-all duration-200"
      title="View Details"
    >
      <i className="fas fa-eye text-sm"></i>
    </button>

    <button
      onClick={() => handleEditTour(dayTour)}
      className="p-1.5 rounded-lg bg-[#93C5FD]/10 text-[#1E3A8A] border border-[#93C5FD]/15 hover:bg-[#4D8CF5] hover:text-white transition-all duration-200"
      title="Edit Tour"
    >
      <i className="fas fa-edit text-sm"></i>
    </button>

    <button
      onClick={() => setConfirmArchiveModal({ show: true, tour: dayTour })}
      className="p-1.5 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] border border-[#F59E0B]/20 hover:bg-[#F59E0B] hover:text-white transition-all duration-200"
      title="Archive Tour"
    >
      <i className="fas fa-archive text-sm"></i>
    </button>
  </div>
</div>
                
                {/* Tour Content */}
                <div className="p-5">
                  {/* Pricing Section */}
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-textPrimary mb-2 flex items-center gap-1">
                      <i className="fas fa-tag text-ocean-light text-sm"></i>
                      Pricing (per person)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-ocean-ice/30 rounded-lg p-2 text-center">
                        <p className="text-xs text-textSecondary mb-0.5">Adult (16+)</p>
                        <p className="text-lg font-bold text-ocean-mid">₱{dayTour.adultPrice?.toLocaleString()}</p>
                      </div>
                      <div className="bg-ocean-ice/30 rounded-lg p-2 text-center">
                        <p className="text-xs text-textSecondary mb-0.5">Kid (15-)</p>
                        <p className="text-lg font-bold text-ocean-mid">₱{dayTour.kidPrice?.toLocaleString()}</p>
                      </div>
                      <div className="bg-ocean-ice/30 rounded-lg p-2 text-center">
                        <p className="text-xs text-textSecondary mb-0.5">Senior</p>
                        <p className="text-lg font-bold text-ocean-mid">₱{dayTour.seniorPrice?.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Inclusions Section */}
                  {dayTour.inclusions && dayTour.inclusions.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-textPrimary mb-2 flex items-center gap-1">
                        <i className="fas fa-gift text-ocean-light text-sm"></i>
                        Inclusions
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {dayTour.inclusions.map((inclusion, idx) => (
                          <span key={idx} className="px-2 py-1 bg-ocean-ice text-ocean-mid rounded-full text-xs">
                            {inclusion}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Description Section */}
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-textPrimary mb-2 flex items-center gap-1">
                      <i className="fas fa-align-left text-ocean-light text-sm"></i>
                      Description
                    </h3>
                    <p className="text-textSecondary text-sm leading-relaxed whitespace-pre-wrap">
                      {dayTour.description}
                    </p>
                  </div>
                  
                  {/* Images Section */}
                  {dayTour.images && dayTour.images.length > 0 && (
                    <div>
                      <h3 className="text-base font-semibold text-textPrimary mb-2 flex items-center gap-1">
                        <i className="fas fa-image text-ocean-light text-sm"></i>
                        Tour Images ({dayTour.images.length})
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {dayTour.images.slice(0, 4).map((img, idx) => (
                          <div key={idx} className="relative aspect-video rounded-lg overflow-hidden border border-ocean-light/20">
                            <Image
                              src={img}
                              alt={`Tour image ${idx + 1}`}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ))}
                        {dayTour.images.length > 4 && (
                          <div className="relative aspect-video rounded-lg bg-ocean-ice flex items-center justify-center">
                            <span className="text-ocean-mid text-sm font-medium">+{dayTour.images.length - 4} more</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Activities Tab Content */}
      {activeTab === 'activities' && (
        <>
          {/* Add Activity Button */}
<div className="mb-6 flex justify-end">
  <button
    onClick={openAddActivityModal}
    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
  >
    <i className="fas fa-plus text-sm"></i>
    Add New Activity
  </button>
</div>
          
          {/* Activities Grid */}
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
            </div>
          ) : activities.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 p-12 text-center">
              <i className="fas fa-bicycle text-6xl text-ocean-light/30 mb-4 block"></i>
              <h3 className="text-xl font-semibold text-textPrimary mb-2">No Activities Yet</h3>
              <p className="text-textSecondary mb-4">Add activities like ATV, Banana Boat, Jet Ski, etc.</p>
              <button
                onClick={openAddActivityModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <i className="fas fa-plus text-sm"></i>
                Add First Activity
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {activities.map((activity) => (
                <div key={activity.id} className="bg-white rounded-2xl shadow-md border-2 border-[#4D8CF5]/40 overflow-hidden hover:shadow-lg transition-all duration-300">
                  {/* Activity Image */}
                  <div className="relative h-48 bg-gradient-to-br from-ocean-pale to-ocean-ice overflow-hidden">
                    {activity.images && activity.images[0] ? (
                      <Image
                        src={activity.images[0]}
                        alt={activity.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <i className="fas fa-bicycle text-5xl text-ocean-light/30"></i>
                      </div>
                    )}
                  </div>
                  
                  {/* Activity Details */}
<div className="p-5">
  <h3 className="text-lg font-bold text-[#1E3A8A] mb-2">
    {activity.name}
  </h3>

  <p className="text-2xl font-bold text-[#4D8CF5] mb-2">
    ₱{activity.priceValue?.toLocaleString()}
    <span className="text-sm font-normal text-[#1E3A8A]/70">
      {activity.priceType === 'perHour' && '/hour'}
      {activity.priceType === 'per30Mins' && '/30 minutes'}
      {activity.priceType === 'per2Hrs' && '/2 hours'}
      {activity.priceType === 'per1Hr30Mins' && '/1.5 hours'}
    </span>
  </p>

  <p className="text-sm text-[#1E3A8A]/70 line-clamp-2 mb-4">
    {activity.description}
  </p>

  <div className="flex gap-2">
    <button
      onClick={() => {
        setSelectedActivity(activity);
        setShowActivityDetailsModal(true);
      }}
      className="w-10 h-10 ml-auto rounded-lg bg-[#4D8CF5]/10 text-[#1E3A8A] border border-[#4D8CF5]/20 hover:bg-[#4D8CF5] hover:text-white transition-all duration-200 flex items-center justify-center"
    >
      <i className="fas fa-eye"></i>
    </button>

    <button
      onClick={() => handleEditActivity(activity)}
      className="px-3 py-2 rounded-lg bg-[#93C5FD]/10 text-[#1E3A8A] border border-[#93C5FD]/15 hover:bg-[#4D8CF5] hover:text-white transition-all duration-200"
    >
      <i className="fas fa-edit"></i>
    </button>

    <button
      onClick={() => setConfirmArchiveActivityModal({ show: true, activity })}
      className="px-3 py-2 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] border border-[#F59E0B]/20 hover:bg-[#F59E0B] hover:text-white transition-all duration-200"
    >
      <i className="fas fa-archive"></i>
    </button>
  </div>
</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      
      {/* Tour Details Modal */}
      {showTourDetailsModal && selectedTour && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowTourDetailsModal(false);
          setSelectedTour(null);
        }}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-2xl font-bold text-textPrimary font-playfair">
                Day Tour Details
              </h2>
              <button
                onClick={() => {
                  setShowTourDetailsModal(false);
                  setSelectedTour(null);
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            {selectedTour.images && selectedTour.images.length > 0 && (
              <div className="mb-6">
                <ImageSlider images={selectedTour.images} roomType="Day Tour" />
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Adult Price (16+)</label>
                <p className="text-2xl font-bold text-ocean-mid">₱{selectedTour.adultPrice?.toLocaleString()}<span className="text-sm font-normal text-textSecondary">/person</span></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Kid Price (15-)</label>
                <p className="text-2xl font-bold text-ocean-mid">₱{selectedTour.kidPrice?.toLocaleString()}<span className="text-sm font-normal text-textSecondary">/person</span></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Senior Price</label>
                <p className="text-2xl font-bold text-ocean-mid">₱{selectedTour.seniorPrice?.toLocaleString()}<span className="text-sm font-normal text-textSecondary">/person</span></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Max Capacity</label>
                <p className="text-textPrimary flex items-center gap-2">
                  <i className="fas fa-users text-ocean-light"></i>
                  {selectedTour.maxCapacity ? `${selectedTour.maxCapacity} Guests` : 'Unlimited'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Status</label>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getAvailabilityStyle(selectedTour.availability)}`}>
                  {getAvailabilityLabel(selectedTour.availability)}
                </span>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Inclusions</label>
                <div className="flex flex-wrap gap-2">
                  {selectedTour.inclusions && selectedTour.inclusions.length > 0 ? (
                    selectedTour.inclusions.map((inclusion, idx) => (
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
                  {selectedTour.description}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-ocean-light/10">
              <button
                onClick={() => {
                  setShowTourDetailsModal(false);
                  setSelectedTour(null);
                }}
                className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowTourDetailsModal(false);
                  handleEditTour(selectedTour);
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                <i className="fas fa-edit mr-2"></i>
                Edit Tour
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Activity Details Modal */}
      {showActivityDetailsModal && selectedActivity && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowActivityDetailsModal(false);
          setSelectedActivity(null);
        }}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-2xl font-bold text-textPrimary font-playfair">
                {selectedActivity.name}
              </h2>
              <button
                onClick={() => {
                  setShowActivityDetailsModal(false);
                  setSelectedActivity(null);
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            {selectedActivity.images && selectedActivity.images.length > 0 && (
              <div className="mb-6">
                <ImageSlider images={selectedActivity.images} roomType={selectedActivity.name} />
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Activity Name</label>
                <p className="text-lg font-semibold text-textPrimary">{selectedActivity.name}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Price</label>
                <p className="text-2xl font-bold text-ocean-mid">
                  ₱{selectedActivity.priceValue?.toLocaleString()}
                  <span className="text-sm font-normal text-textSecondary">
                    {selectedActivity.priceType === 'perHour' && '/hour'}
                    {selectedActivity.priceType === 'per30Mins' && '/30 minutes'}
                    {selectedActivity.priceType === 'per2Hrs' && '/2 hours'}
                    {selectedActivity.priceType === 'per1Hr30Mins' && '/1.5 hours'}
                  </span>
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-neutral uppercase tracking-wide mb-1">Description</label>
                <p className="text-textSecondary leading-relaxed whitespace-pre-wrap">
                  {selectedActivity.description}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-ocean-light/10">
              <button
                onClick={() => {
                  setShowActivityDetailsModal(false);
                  setSelectedActivity(null);
                }}
                className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowActivityDetailsModal(false);
                  handleEditActivity(selectedActivity);
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                <i className="fas fa-edit mr-2"></i>
                Edit Activity
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Add/Edit Tour Modal */}
      {showTourModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          if (!actionLoading) {
            setShowTourModal(false);
            setSelectedTour(null);
            setOriginalTourData(null);
          }
        }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                {tourModalType === 'add' ? 'Create Day Tour' : 'Edit Day Tour'}
              </h2>
              <button
                onClick={() => {
                  setShowTourModal(false);
                  setSelectedTour(null);
                  setOriginalTourData(null);
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <form onSubmit={tourModalType === 'add' ? handleAddTour : handleUpdateTour}>
              {/* Pricing Fields */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Adult Price (₱) - 16+ *</label>
                  <input
                    type="number"
                    name="adultPrice"
                    value={tourFormData.adultPrice}
                    onChange={handleTourInputChange}
                    placeholder="Adult price"
                    className={`w-full px-3 py-2.5 border ${tourFormErrors.adultPrice ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                    step="0.01"
                    min="0"
                  />
                  {tourFormErrors.adultPrice && <p className="text-red-500 text-xs mt-1">{tourFormErrors.adultPrice}</p>}
                </div>
                
                <div>
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Kid Price (₱) - 15- *</label>
                  <input
                    type="number"
                    name="kidPrice"
                    value={tourFormData.kidPrice}
                    onChange={handleTourInputChange}
                    placeholder="Kid price"
                    className={`w-full px-3 py-2.5 border ${tourFormErrors.kidPrice ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                    step="0.01"
                    min="0"
                  />
                  {tourFormErrors.kidPrice && <p className="text-red-500 text-xs mt-1">{tourFormErrors.kidPrice}</p>}
                </div>

                <div>
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Senior Price (₱) *</label>
                  <input
                    type="number"
                    name="seniorPrice"
                    value={tourFormData.seniorPrice}
                    onChange={handleTourInputChange}
                    placeholder="Senior price"
                    className={`w-full px-3 py-2.5 border ${tourFormErrors.seniorPrice ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                    step="0.01"
                    min="0"
                  />
                  {tourFormErrors.seniorPrice && <p className="text-red-500 text-xs mt-1">{tourFormErrors.seniorPrice}</p>}
                </div>
              </div>
              
              {/* Max Capacity */}
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">
                  Maximum Capacity <span className="text-xs text-neutral">(Optional - leave empty for unlimited)</span>
                </label>
                <input
                  type="number"
                  name="maxCapacity"
                  value={tourFormData.maxCapacity}
                  onChange={handleTourInputChange}
                  placeholder="Leave empty for unlimited"
                  className={`w-full px-3 py-2.5 border ${tourFormErrors.maxCapacity ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                  min="0"
                />
                {tourFormErrors.maxCapacity && <p className="text-red-500 text-xs mt-1">{tourFormErrors.maxCapacity}</p>}
              </div>
              
              {/* Availability */}
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">Availability *</label>
                <select
                  name="availability"
                  value={tourFormData.availability}
                  onChange={handleTourInputChange}
                  className="w-full px-3 py-2.5 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light bg-white"
                >
                  {availabilityStatuses.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Inclusions */}
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">Inclusions (e.g., Cottage, Lunch, etc.)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={inclusionInput}
                    onChange={(e) => setInclusionInput(e.target.value)}
                    placeholder="e.g., Cottage, Free Lunch, Snacks"
                    className="flex-1 px-3 py-2.5 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleInclusionAdd())}
                  />
                  <button
                    type="button"
                    onClick={handleInclusionAdd}
                    className="px-4 py-2.5 bg-ocean-light/10 text-ocean-light rounded-xl hover:bg-ocean-light hover:text-white transition-all"
                  >
                    <i className="fas fa-plus"></i>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tourFormData.inclusions.map((inclusion, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-ocean-ice text-ocean-mid rounded-full text-sm">
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
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">Description *</label>
                <textarea
                  name="description"
                  value={tourFormData.description}
                  onChange={handleTourInputChange}
                  rows="4"
                  placeholder="Describe the day tour experience, itinerary, highlights..."
                  className={`w-full px-3 py-2.5 border ${tourFormErrors.description ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                />
                {tourFormErrors.description && <p className="text-red-500 text-xs mt-1">{tourFormErrors.description}</p>}
              </div>
              
              {/* Images Upload - Optional */}
              <div className="mb-5">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">
                  Tour Images <span className="text-xs text-neutral">(Optional)</span>
                </label>
                <div className="border-2 border-dashed border-ocean-light/20 rounded-xl p-4 text-center hover:border-ocean-light transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleTourImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="tour-image-upload"
                  />
                  <label
                    htmlFor="tour-image-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-3xl text-ocean-light`}></i>
                    <span className="text-sm text-textSecondary">
                      {uploadingImage ? 'Uploading...' : 'Click to upload images'}
                    </span>
                    <span className="text-xs text-neutral">PNG, JPG up to 5MB (Optional)</span>
                  </label>
                </div>
                
                {tourFormData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {tourFormData.images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-ocean-light/20">
                        <Image
                          src={img}
                          alt={`Tour image ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleTourImageRemove(img)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <i className="fas fa-times text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Form Actions */}
              <div className="flex gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowTourModal(false);
                    setSelectedTour(null);
                    setOriginalTourData(null);
                  }}
                  className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || (tourModalType === 'edit' ? !hasTourChanges() : isTourFormIncomplete())}
                  className={`px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-300 ${
                    actionLoading || (tourModalType === 'edit' ? !hasTourChanges() : isTourFormIncomplete())
                      ? 'bg-neutral cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-ocean-mid to-ocean-light hover:shadow-lg hover:-translate-y-0.5'
                  }`}
                >
                  {actionLoading ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> {tourModalType === 'add' ? 'Creating...' : 'Saving...'}</span>
                  ) : (
                    tourModalType === 'add' ? 'Create Day Tour' : 'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Add/Edit Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          if (!actionLoading) {
            setShowActivityModal(false);
            setSelectedActivity(null);
            setOriginalActivityData(null);
          }
        }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                {activityModalType === 'add' ? 'Add New Activity' : 'Edit Activity'}
              </h2>
              <button
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedActivity(null);
                  setOriginalActivityData(null);
                }}
                className="w-8 h-8 rounded-full bg-ocean-ice hover:bg-ocean-light/20 text-neutral hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <form onSubmit={activityModalType === 'add' ? handleAddActivity : handleUpdateActivity}>
              {/* Activity Name */}
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">Activity Name *</label>
                <input
                  type="text"
                  name="name"
                  value={activityFormData.name}
                  onChange={handleActivityInputChange}
                  placeholder="e.g., ATV, Banana Boat, Jet Ski"
                  className={`w-full px-3 py-2.5 border ${activityFormErrors.name ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20`}
                />
                {activityFormErrors.name && <p className="text-red-500 text-xs mt-1">{activityFormErrors.name}</p>}
              </div>
              
              {/* Pricing Type and Value */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Pricing Type *</label>
                  <select
                    name="priceType"
                    value={activityFormData.priceType}
                    onChange={handleActivityInputChange}
                    className="w-full px-3 py-2.5 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light bg-white"
                  >
                    {pricingTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Price (₱) *</label>
                  <input
                    type="number"
                    name="priceValue"
                    value={activityFormData.priceValue}
                    onChange={handleActivityInputChange}
                    placeholder="Price"
                    className={`w-full px-3 py-2.5 border ${activityFormErrors.priceValue ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                    step="0.01"
                    min="0"
                  />
                  {activityFormErrors.priceValue && <p className="text-red-500 text-xs mt-1">{activityFormErrors.priceValue}</p>}
                </div>
              </div>
              
              {/* Description */}
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">Description *</label>
                <textarea
                  name="description"
                  value={activityFormData.description}
                  onChange={handleActivityInputChange}
                  rows="3"
                  placeholder="Describe the activity..."
                  className={`w-full px-3 py-2.5 border ${activityFormErrors.description ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light`}
                />
                {activityFormErrors.description && <p className="text-red-500 text-xs mt-1">{activityFormErrors.description}</p>}
              </div>
              
              {/* Multiple Images Upload - Optional */}
              <div className="mb-5">
                <label className="block mb-1.5 text-sm font-medium text-textPrimary">
                  Activity Images <span className="text-xs text-neutral">(Optional)</span>
                </label>
                <div className="border-2 border-dashed border-ocean-light/20 rounded-xl p-4 text-center hover:border-ocean-light transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleActivityImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="activity-image-upload"
                  />
                  <label
                    htmlFor="activity-image-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-3xl text-ocean-light`}></i>
                    <span className="text-sm text-textSecondary">
                      {uploadingImage ? 'Uploading...' : 'Click to upload images'}
                    </span>
                    <span className="text-xs text-neutral">PNG, JPG up to 5MB (Optional)</span>
                  </label>
                </div>
                
                {activityFormData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {activityFormData.images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-ocean-light/20">
                        <Image
                          src={img}
                          alt={`Activity image ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleActivityImageRemove(img)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <i className="fas fa-times text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Form Actions */}
              <div className="flex gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowActivityModal(false);
                    setSelectedActivity(null);
                    setOriginalActivityData(null);
                  }}
                  className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || (activityModalType === 'edit' ? !hasActivityChanges() : isActivityFormIncomplete())}
                  className={`px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-300 ${
                    actionLoading || (activityModalType === 'edit' ? !hasActivityChanges() : isActivityFormIncomplete())
                      ? 'bg-neutral cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-ocean-mid to-ocean-light hover:shadow-lg hover:-translate-y-0.5'
                  }`}
                >
                  {actionLoading ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> {activityModalType === 'add' ? 'Adding...' : 'Updating...'}</span>
                  ) : (
                    activityModalType === 'add' ? 'Add Activity' : 'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Archive Modals */}
      {confirmArchiveModal.show && confirmArchiveModal.tour && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="fas fa-archive text-amber-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Archive Day Tour</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to archive this day tour? This tour will be moved to the archive and won't appear in active listings. You can create a new one after archiving.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmArchiveModal({ show: false, tour: null })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchiveTour(confirmArchiveModal.tour)}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
      
      {confirmArchiveActivityModal.show && confirmArchiveActivityModal.activity && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="fas fa-archive text-amber-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">Archive Activity</h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to archive "{confirmArchiveActivityModal.activity.name}"? This activity will be moved to the archive and won't appear in active listings.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmArchiveActivityModal({ show: false, activity: null })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchiveActivity(confirmArchiveActivityModal.activity)}
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