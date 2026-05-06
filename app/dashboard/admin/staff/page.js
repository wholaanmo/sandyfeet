// app/dashboard/admin/staff/page.js
'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '../../../../lib/firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { logAdminAction } from '../../../../lib/auditLogger';
import { sendStaffVerificationEmail } from '../../../../lib/staffEmailService';

const getBaseUrl = () => {
  // 1. Explicitly set environment variable – MUST be set in production
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  // 2. Fallback for Vercel deployments
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  // 3. Client-side fallback: use the current site origin (deployed domain)
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // 4. Local development only
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000';
  // 5. Production without a detectable base URL – fail loudly
  throw new Error('Unable to determine base URL for verification link. Set NEXT_PUBLIC_BASE_URL.');
};

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'staff',
    status: 'active', // not used in add flow, kept for consistency
    phone: '',
  });
  
  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formErrors, setFormErrors] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [originalFormData, setOriginalFormData] = useState({});
  
  // Resend verification modal
  const [resendModal, setResendModal] = useState({ show: false, email: '', staffId: '', name: '' });
  const [resendLoading, setResendLoading] = useState(false);
  
  // Confirmation modal states
  const [confirmationModal, setConfirmationModal] = useState({
    show: false,
    action: '',
    staffMember: null,
    title: '',
    message: ''
  });
  
  const router = useRouter();

  // Set up real-time listener for staff members
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', 'in', ['staff', 'admin']));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const staffList = [];
      querySnapshot.forEach((doc) => {
        staffList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setStaff(staffList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching staff:', error);
      showNotification('Failed to load staff members.', 'error');
      setLoading(false);
    });
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Auto-hide notification after 4 seconds
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: '', type: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  // Phone validation - exactly 11 digits
  const validatePhoneNumber = (phone) => {
    if (!phone) return true;
    const phoneRegex = /^\d{11}$/;
    return phoneRegex.test(phone);
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }
    
    if (formData.phone && !validatePhoneNumber(formData.phone)) {
      errors.phone = 'Phone number must be exactly 11 digits';
    }
    
    if (modalType === 'add') {
      if (!formData.password) {
        errors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }
      
      if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }
    
    return errors;
  };

  // Check if form has changes during editing
  const hasChanges = () => {
    if (!isEditing || modalType !== 'view') return true;
    return formData.name !== originalFormData.name || 
           formData.phone !== originalFormData.phone;
  };

  // Check if form is incomplete
  const isFormIncomplete = () => {
    if (modalType === 'add') {
      return !formData.name.trim() || !formData.email.trim() || !formData.password || !formData.confirmPassword;
    } else if (isEditing) {
      return !formData.name.trim();
    }
    return false;
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

 const handleAddStaff = async (e) => {
  e.preventDefault();
  const errors = validateForm();
  
  if (Object.keys(errors).length > 0) {
    setFormErrors(errors);
    return;
  }
  
  setActionLoading(true);
  
  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth, 
      formData.email, 
      formData.password
    );
    
    const uid = userCredential.user.uid;
    
    // Generate a unique verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
    const verificationExpiresAt = new Date();
    verificationExpiresAt.setMinutes(verificationExpiresAt.getMinutes() + 15);
    
    // Create user document in Firestore
    await setDoc(doc(db, 'users', uid), {
      uid: uid,
      name: formData.name,
      email: formData.email,
      role: formData.role,
      status: 'pending_verification',
      phone: formData.phone || '',
      emailVerified: false,
      verificationToken: verificationToken,
      verificationExpiresAt: verificationExpiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser?.uid || ''
    });
    
    // Send verification email using Nodemailer with role
    const verificationLink = `${getBaseUrl()}/verify-staff?token=${verificationToken}&email=${encodeURIComponent(formData.email)}`;
    const emailResult = await sendStaffVerificationEmail(formData.email, formData.name, verificationLink, formData.role);
    const emailSent = Boolean(emailResult?.success);
    
    // Add audit log
    await logAdminAction({
      action: 'Added member',
      module: 'User Management',
      details: `Added new member: ${formData.name} (${formData.email}) with role: ${formData.role}`
    });
    
    showNotification(
      emailSent
        ? 'Staff account created successfully! Verification email sent. Link expires in 15 minutes.'
        : 'Staff account created, but verification email failed to send. Please use Resend Verification Email.',
      emailSent ? 'success' : 'error'
    );
    resetForm();
    
    setTimeout(() => {
      setShowModal(false);
    }, 2000);
    
  } catch (error) {
    console.error('Error creating staff:', error);
    
    if (error.code === 'auth/email-already-in-use') {
      showNotification('Email is already in use.', 'error');
    } else {
      showNotification('Failed to create staff account. Please try again.', 'error');
    }
  } finally {
    setActionLoading(false);
  }
};

const handleResendVerification = async () => {
  setResendLoading(true);
  try {
    // Generate new verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
    const verificationExpiresAt = new Date();
    verificationExpiresAt.setMinutes(verificationExpiresAt.getMinutes() + 15);
    
    // Update user document with new token
    const userRef = doc(db, 'users', resendModal.staffId);
    await updateDoc(userRef, {
      verificationToken: verificationToken,
      verificationExpiresAt: verificationExpiresAt.toISOString()
    });
    
    // Send new verification email
    const verificationLink = `${getBaseUrl()}/verify-staff?token=${verificationToken}&email=${encodeURIComponent(resendModal.email)}`;
    const emailResult = await sendStaffVerificationEmail(resendModal.email, resendModal.name || 'Staff Member', verificationLink);
    if (!emailResult?.success) {
      throw new Error(emailResult?.error || 'Failed to send verification email');
    }
    
    // Add audit log
    await logAdminAction({
      action: 'Resent verification email',
      module: 'User Management',
      details: `Resent verification email to: ${resendModal.email}`
    });
    
    showNotification('New verification email sent! Link expires in 15 minutes.');
    setResendModal({ show: false, email: '', staffId: '', name: '' });
  } catch (error) {
    console.error('Error resending verification:', error);
    showNotification('Failed to send verification email. Please try again.', 'error');
  } finally {
    setResendLoading(false);
  }
};

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setFormErrors({ name: 'Name is required' });
      return;
    }
    
    if (formData.phone && !validatePhoneNumber(formData.phone)) {
      setFormErrors({ phone: 'Phone number must be exactly 11 digits' });
      return;
    }
    
    setActionLoading(true);
    
    try {
      const userRef = doc(db, 'users', selectedStaff.id);
      await updateDoc(userRef, {
        name: formData.name,
        phone: formData.phone || '',
      });
      
      // Add audit log
      await logAdminAction({
        action: 'Updated user information',
        module: 'User Management',
        details: `Updated user member: ${selectedStaff.name} (${selectedStaff.email}) - Name: ${formData.name}, Phone: ${formData.phone || 'Not provided'}`
      });
      
      showNotification('Staff information updated successfully!');
      
      setTimeout(() => {
        setShowModal(false);
        setSelectedStaff(null);
        setIsEditing(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error updating staff:', error);
      showNotification('Failed to update staff information.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatus = async (staffMember) => {
    // Prevent status change if email is not verified
    if (!staffMember.emailVerified) {
      showNotification('Cannot change status: email not verified yet.', 'error');
      return;
    }

    const newStatus = staffMember.status === 'active' ? 'inactive' : 'active';
    setConfirmationModal({
      show: true,
      action: 'toggleStatus',
      staffMember,
      title: `${newStatus === 'active' ? 'Activate' : 'Deactivate'} Staff Account`,
      message: `Are you sure you want to ${newStatus === 'active' ? 'activate' : 'deactivate'} ${staffMember.name}'s account?`
    });
  };

  const confirmToggleStatus = async () => {
    const { staffMember } = confirmationModal;
    const newStatus = staffMember.status === 'active' ? 'inactive' : 'active';
    
    try {
      const userRef = doc(db, 'users', staffMember.id);
      await updateDoc(userRef, {
        status: newStatus
      });
      
      // Add audit log
      await logAdminAction({
        action: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} staff account`,
        module: 'User Management',
        details: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} staff account: ${staffMember.name} (${staffMember.email})`
      });
      
      showNotification(`Staff account ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`);
      
    } catch (error) {
      console.error('Error toggling status:', error);
      showNotification('Failed to update staff status.', 'error');
    } finally {
      setConfirmationModal({ show: false, action: '', staffMember: null, title: '', message: '' });
    }
  };

  const handlePromoteToAdmin = async (staffMember) => {
    setConfirmationModal({
      show: true,
      action: 'promote',
      staffMember,
      title: 'Promote to Admin',
      message: `Are you sure you want to promote ${staffMember.name} to Admin?`
    });
  };

  const confirmPromoteToAdmin = async () => {
    const { staffMember } = confirmationModal;
    
    try {
      const userRef = doc(db, 'users', staffMember.id);
      await updateDoc(userRef, {
        role: 'admin'
      });
      
      // Add audit log
      await logAdminAction({
        action: 'Promoted staff to admin',
        module: 'User Management',
        details: `Promoted ${staffMember.name} (${staffMember.email}) from Staff to Admin`
      });
      
      showNotification(`${staffMember.name} has been promoted to Admin successfully!`);
      
    } catch (error) {
      console.error('Error promoting to admin:', error);
      showNotification('Failed to promote staff member.', 'error');
    } finally {
      setConfirmationModal({ show: false, action: '', staffMember: null, title: '', message: '' });
    }
  };

  const handleDemoteToStaff = async (staffMember) => {
    setConfirmationModal({
      show: true,
      action: 'demote',
      staffMember,
      title: 'Demote to Staff',
      message: `Are you sure you want to demote ${staffMember.name} to Staff?`
    });
  };

  const confirmDemoteToStaff = async () => {
    const { staffMember } = confirmationModal;
    
    try {
      const userRef = doc(db, 'users', staffMember.id);
      await updateDoc(userRef, {
        role: 'staff'
      });
      
      // Add audit log
      await logAdminAction({
        action: 'Demoted admin to staff',
        module: 'User Management',
        details: `Demoted ${staffMember.name} (${staffMember.email}) from Admin to Staff`
      });
      
      showNotification(`${staffMember.name} has been demoted to Staff successfully!`);
      
    } catch (error) {
      console.error('Error demoting to staff:', error);
      showNotification('Failed to demote staff member.', 'error');
    } finally {
      setConfirmationModal({ show: false, action: '', staffMember: null, title: '', message: '' });
    }
  };

  const handleViewStaff = (staffMember) => {
    setSelectedStaff(staffMember);
    const originalData = {
      name: staffMember.name || '',
      phone: staffMember.phone || '',
    };
    setOriginalFormData(originalData);
    setFormData({
      name: staffMember.name || '',
      email: staffMember.email || '',
      phone: staffMember.phone || '',
      role: staffMember.role || 'staff',
      status: staffMember.status || 'active',
    });
    setModalType('view');
    setIsEditing(false);
    setShowModal(true);
  };

  const handleEditToggle = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormData({
      name: selectedStaff.name || '',
      email: selectedStaff.email || '',
      phone: selectedStaff.phone || '',
      role: selectedStaff.role || 'staff',
      status: selectedStaff.status || 'active',
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'staff',
      status: 'active',
      phone: '',
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormErrors({});
  };

  const openAddModal = () => {
    setModalType('add');
    resetForm();
    setSelectedStaff(null);
    setShowModal(true);
  };

  // Sorting: Active users first (A-Z), then Inactive users last (A-Z)
  const sortedStaff = [...staff].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const filteredStaff = sortedStaff.filter(member => {
    const matchesSearch = member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.phone?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || member.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const getStatusDisplay = (status) => {
    if (status === 'pending_verification') return { label: 'Pending Verification', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    if (status === 'active') return { label: 'Active', color: 'bg-green-50 text-green-700 border-green-200' };
    if (status === 'inactive') return { label: 'Inactive', color: 'bg-red-50 text-red-700 border-red-200' };
    return { label: status || 'Unknown', color: 'bg-gray-50 text-gray-700 border-gray-200' };
  };

  return (
    <div className="px-4 sm:px-9 py-4 sm:py-6 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight mb-1">
            User Management
          </h1>
          <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed">
            Manage user accounts, roles, and status
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium border border-[#7AAAF8]/30 bg-white/70 backdrop-blur-md text-[#1E3A8A] shadow-sm hover:bg-[#7AAAF8] hover:text-white hover:border-[#7AAAF8] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
          <i className="fas fa-plus text-sm"></i>
          Add New User
        </button>
      </div>

      {/* Notification - Lower position to avoid navbar overlap */}
      {notification.show && (
        <div className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${
          notification.type === 'error' ? 'bg-red-50 border-l-4 border-red-500 text-red-700' : 'bg-green-50 border-l-4 border-green-500 text-green-700'
        }`}>
          <i className={`${notification.type === 'error' ? 'fas fa-exclamation-circle text-red-500' : 'fas fa-check-circle text-green-500'} text-base`}></i>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

  {/* Resend Verification Modal */}
{resendModal.show && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
      <div className="text-center mb-5">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
          <i className="fas fa-envelope text-blue-500 text-2xl"></i>
        </div>
        <h3 className="text-lg font-bold text-textPrimary mb-2">Resend Verification Email</h3>
        <p className="text-textSecondary text-sm">
          Send a new verification link to {resendModal.name} ({resendModal.email})? The link will expire in 15 minutes.
        </p>
      </div>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setResendModal({ show: false, email: '', staffId: '', name: '' })}
          className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
        >
          Cancel
        </button>
        <button
          onClick={handleResendVerification}
          disabled={resendLoading}
          className="px-5 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {resendLoading ? <i className="fas fa-spinner fa-spin"></i> : 'Send Email'}
        </button>
      </div>
    </div>
  </div>
)}

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="relative w-full group">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>
            
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
            />
          </div>
        </div>
        
        <div className="relative w-full md:w-48">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm text-textPrimary bg-white shadow-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 hover:border-[#4D8CF5]/70 transition-all duration-200 appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending_verification">Pending Verification</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Custom dropdown arrow */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
            ▼
          </div>
        </div>
      </div>

      {/* Staff Table */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Role</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-textPrimary">Actions</th>
               </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-neutral">
                    No staff members found
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => {
                  const statusDisplay = getStatusDisplay(member.status);
                  // Disable toggle if email not verified OR status is pending_verification
                  const isToggleDisabled = !member.emailVerified || member.status === 'pending_verification';
                  return (
                    <tr key={member.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-textPrimary">{member.name}</div>
                      </td>
                      <td className="px-4 py-3 text-textSecondary text-sm">{member.email}</td>
                      <td className="px-4 py-3 text-textSecondary text-sm">{member.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          member.role === 'admin' 
                            ? 'bg-ocean-lighter/10 text-ocean-light border border-ocean-lighter/30' 
                            : 'bg-ocean-ice text-textSecondary border border-ocean-light/20'
                        }`}>
                          {member.role === 'admin' ? 'Admin' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusDisplay.color}`}>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
{member.status === 'pending_verification' && (
  <button
    onClick={() => setResendModal({ show: true, email: member.email, staffId: member.id, name: member.name })}
    className="p-2 rounded-lg border border-ocean-light/20 bg-white text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-200"
    title="Resend Verification Email"
  >
    <i className="fas fa-paper-plane"></i>
  </button>
)}
                          <button
                            onClick={() => handleToggleStatus(member)}
                            className="p-2 rounded-lg bg-[#F59E0B]/10 text-[#C2410C] border border-[#F59E0B]/20 hover:bg-[#F59E0B] hover:text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#F59E0B]/10 disabled:hover:text-[#C2410C]"
                            title={member.status === 'active' ? 'Deactivate' : 'Activate'}
                            disabled={isToggleDisabled}
                          >
                            <i className={`fas ${member.status === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
                          </button>

                         {member.role === 'staff' && member.status !== 'pending_verification' ? (
  <button
    onClick={() => handlePromoteToAdmin(member)}
    className="p-2 rounded-lg bg-green-500/10 text-green-700 border border-green-500/15 hover:bg-green-500/60 hover:text-white transition-all duration-200"
    title="Promote to Admin"
  >
    <i className="fas fa-arrow-up"></i>
  </button>
) : member.role === 'admin' && (
  <button
    onClick={() => handleDemoteToStaff(member)}
    disabled={member.id === auth.currentUser?.uid}
    className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${
      member.id === auth.currentUser?.uid
        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
        : 'bg-green-500/10 text-green-700 border border-green-500/15 hover:bg-green-500/60 hover:text-white'
    }`}
    title={member.id === auth.currentUser?.uid ? "Cannot demote your own account" : "Demote to Staff"}
  >
    <i className="fas fa-arrow-down"></i>
  </button>
)}

                          <button
                            onClick={() => handleViewStaff(member)}
                            className="p-2 rounded-lg bg-[#7AAAF8]/10 text-[#1E3A8A] border border-[#7AAAF8]/20 hover:bg-[#7AAAF8] hover:text-white transition-all duration-200 flex items-center justify-center"
                            title="View/Edit User Information"
                          >
                            <i className="fas fa-eye"></i>
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

      {/* Add/View/Edit Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          if (!actionLoading) {
            setShowModal(false);
            setSelectedStaff(null);
            setIsEditing(false);
          }
        }}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair">
                {modalType === 'add' ? 'Add New Member' : 
                 modalType === 'view' && !isEditing ? 'User Information' : 'Edit User Information'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedStaff(null);
                  setIsEditing(false);
                }}
                className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {modalType === 'add' ? (
              <form onSubmit={handleAddStaff}>
                {/* Name */}
                <div className="mb-4">
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2.5 border ${formErrors.name ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
                  />
                  {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                </div>

 {/* Email */}
<div className="mb-4">
  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Email Address</label>
  <input
    type="email"
    name="email"
    value={formData.email}
    onChange={handleInputChange}
    autoComplete="new-email"
    className={`w-full px-3 py-2.5 border ${formErrors.email ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
  />
  {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
</div>

{/* Password */}
<div className="mb-4">
  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Password</label>
  <div className="relative">
    <input
      type={showPassword ? 'text' : 'password'}
      name="password"
      value={formData.password}
      onChange={handleInputChange}
      autoComplete="new-password"
      className={`w-full px-3 py-2.5 pr-10 border ${formErrors.password ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
    />
    <button
      type="button"
      onClick={togglePasswordVisibility}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral hover:text-ocean-light transition-colors"
    >
      <i className={`fas ${showPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
    </button>
  </div>
  {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
</div>

{/* Confirm Password */}
<div className="mb-4">
  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Confirm Password</label>
  <div className="relative">
    <input
      type={showConfirmPassword ? 'text' : 'password'}
      name="confirmPassword"
      value={formData.confirmPassword}
      onChange={handleInputChange}
      autoComplete="off"
      className={`w-full px-3 py-2.5 pr-10 border ${formErrors.confirmPassword ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
    />
    <button
      type="button"
      onClick={toggleConfirmPasswordVisibility}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral hover:text-ocean-light transition-colors"
    >
      <i className={`fas ${showConfirmPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
    </button>
  </div>
  {formErrors.confirmPassword && <p className="text-red-500 text-xs mt-1">{formErrors.confirmPassword}</p>}
</div>

                {/* Phone */}
                <div className="mb-4">
                  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="11 digits (e.g., 09123456789)"
                    className={`w-full px-3 py-2.5 border ${formErrors.phone ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
                  />
                  {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                </div>

                {/* Role only (Status removed) */}
<div className="mb-5 relative">
  <label className="block mb-1.5 text-sm font-medium text-textPrimary">Role</label>

  <select
    name="role"
    value={formData.role}
    onChange={handleInputChange}
    className="w-full px-3 py-2.5 pr-10 border border-ocean-light/20 rounded-xl text-sm focus:outline-none focus:border-ocean-light cursor-pointer bg-white appearance-none"
  >
    <option value="staff">Staff</option>
    <option value="admin">Admin</option>
  </select>

  {/* Custom dropdown arrow */}
  <div className="absolute right-3 top-[38px] pointer-events-none text-[#4D8CF5] text-xs">
    ▼
  </div>

  <p className="text-neutral text-xs mt-1">
    Account will be created with &quot;Pending Verification&quot; status. An email will be sent to verify the address.
  </p>
</div>

                {/* Form Actions - Button always visible */}
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || isFormIncomplete()}
                    className={`px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-300 ${
                      actionLoading || isFormIncomplete()
                        ? 'bg-gray-300 text-gray-700 cursor-not-allowed hover:shadow-none'
                        : 'bg-gradient-to-r from-ocean-mid to-ocean-light hover:shadow-lg hover:-translate-y-0.5'
                    }`}
                  >
                    {actionLoading ? (
                      <span><i className="fas fa-spinner fa-spin mr-2"></i> Creating...</span>
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                {!isEditing ? (
                  /* View Mode */
                  <div>
                    <div className="mb-4">
                      <label className="block mb-1 text-xs font-semibold text-neutral uppercase tracking-wide">Full Name</label>
                      <p className="px-3 py-2.5 bg-ocean-ice/50 rounded-xl text-textPrimary text-sm border border-ocean-light/10">{selectedStaff?.name}</p>
                    </div>

                    <div className="mb-4">
                      <label className="block mb-1 text-xs font-semibold text-neutral uppercase tracking-wide">Email Address</label>
                      <p className="px-3 py-2.5 bg-ocean-ice/50 rounded-xl text-textPrimary text-sm border border-ocean-light/10">{selectedStaff?.email}</p>
                    </div>

                    <div className="mb-4">
                      <label className="block mb-1 text-xs font-semibold text-neutral uppercase tracking-wide">Phone Number</label>
                      <p className="px-3 py-2.5 bg-ocean-ice/50 rounded-xl text-textPrimary text-sm border border-ocean-light/10">{selectedStaff?.phone || '—'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div>
                        <label className="block mb-1 text-xs font-semibold text-neutral uppercase tracking-wide">Role</label>
                        <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-medium ${
                          selectedStaff?.role === 'admin' 
                            ? 'bg-ocean-lighter/10 text-ocean-light border border-ocean-lighter/30' 
                            : 'bg-ocean-ice text-textSecondary border border-ocean-light/20'
                        }`}>
                          {selectedStaff?.role === 'admin' ? 'Admin' : 'Staff'}
                        </span>
                      </div>

                      <div>
                        <label className="block mb-1 text-xs font-semibold text-neutral uppercase tracking-wide">Status</label>
                        <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-medium ${
                          selectedStaff?.status === 'active' 
                            ? 'bg-green-50 text-green-700 border border-green-200' 
                            : selectedStaff?.status === 'pending_verification'
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {selectedStaff?.status === 'active' ? 'Active' : selectedStaff?.status === 'pending_verification' ? 'Pending Verification' : 'Inactive'}
                        </span>
                        {selectedStaff?.status === 'pending_verification' && (
                          <button
                            onClick={() => setResendModal({ show: true, email: selectedStaff.email, staffId: selectedStaff.id, name: selectedStaff.name })}
                            className="mt-2 text-xs text-ocean-light hover:text-ocean-mid underline"
                          >
                            Resend verification email
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3 justify-end mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          setShowModal(false);
                          setSelectedStaff(null);
                        }}
                        className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleEditToggle}
                        className="px-5 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                      >
                        <i className="fas fa-edit mr-2"></i>
                        Edit Information
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Edit Mode */
                  <form onSubmit={handleUpdateStaff}>
                    {/* Name */}
                    <div className="mb-4">
                      <label className="block mb-1.5 text-sm font-medium text-textPrimary">Full Name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className={`w-full px-3 py-2.5 border ${formErrors.name ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
                      />
                      {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                    </div>

                    {/* Email (read-only) */}
                    <div className="mb-4">
                      <label className="block mb-1.5 text-sm font-medium text-textPrimary">Email Address</label>
                      <input
                        type="email"
                        value={formData.email}
                        disabled
                        className="w-full px-3 py-2.5 border border-ocean-light/20 rounded-xl text-sm bg-ocean-ice text-neutral cursor-not-allowed"
                      />
                      <p className="text-neutral text-xs mt-1">Email cannot be changed</p>
                    </div>

                    {/* Phone */}
                    <div className="mb-4">
                      <label className="block mb-1.5 text-sm font-medium text-textPrimary">Phone Number</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="11 digits (e.g., 09123456789)"
                        className={`w-full px-3 py-2.5 border ${formErrors.phone ? 'border-red-500' : 'border-ocean-light/20'} rounded-xl text-sm focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300`}
                      />
                      {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                    </div>

                    {/* Form Actions - Button always visible */}
                    <div className="flex gap-3 justify-end mt-6">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading || isFormIncomplete() || !hasChanges()}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300
                          ${
                            actionLoading || isFormIncomplete() || !hasChanges()
                              ? 'bg-gray-300 text-gray-700 cursor-not-allowed hover:shadow-none'
                              : 'bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg hover:-translate-y-0.5'
                          }`}
                      >
                        {actionLoading ? (
                          <span>
                            <i className="fas fa-spinner fa-spin mr-2"></i> Updating...
                          </span>
                        ) : (
                          'Save Changes'
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
{confirmationModal.show && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
      <div className="text-center mb-5">
        <div
          className={`w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center ${
            confirmationModal.action === 'promote' || confirmationModal.action === 'demote'
              ? 'bg-green-100'
              : confirmationModal.action === 'toggleStatus'
                ? 'bg-amber-100'
                : ''
          }`}
        >
          <i
            className={`fas fa-exclamation-triangle text-2xl ${
              confirmationModal.action === 'promote' || confirmationModal.action === 'demote'
                ? 'text-green-500'
                : confirmationModal.action === 'toggleStatus'
                  ? 'text-amber-500'
                  : ''
            }`}
          />
        </div>

        <h3 className="text-lg font-bold text-textPrimary mb-2">
          {confirmationModal.title}
        </h3>

        <p className="text-textSecondary text-sm">
          {confirmationModal.message}
        </p>
      </div>

      <div className="flex gap-3 justify-center">
        <button
          onClick={() =>
            setConfirmationModal({
              show: false,
              action: '',
              staffMember: null,
              title: '',
              message: ''
            })
          }
          className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
        >
          Cancel
        </button>

        <button
          onClick={() => {
            if (confirmationModal.action === 'toggleStatus') confirmToggleStatus();
            else if (confirmationModal.action === 'promote') confirmPromoteToAdmin();
            else if (confirmationModal.action === 'demote') confirmDemoteToStaff();
          }}
          className={`px-5 py-2 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${
            confirmationModal.action === 'promote' || confirmationModal.action === 'demote'
              ? 'bg-gradient-to-r from-green-500 to-green-600'
              : confirmationModal.action === 'toggleStatus'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                : ''
          }`}
        >
          Confirm
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