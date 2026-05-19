// app/account/page.js
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import GuestLayout from '@/app/guest/layout';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';
import SignOutConfirmationModal from '@/components/SignOutConfirmationModal';
import IdRequestNotifications from '@/components/guest/IdRequestNotifications';
import { uploadImage } from '@/lib/cloudinary';
import { compressImage } from '@/lib/imageUtils';
import { VALID_ID_OPTIONS, getDisplayValidIdType } from '@/lib/guestValidId';

function GuestAccountContent() {
  const { user, profile, loading, logout, updateGuestProfile } = useGuestAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
  const [originalProfile, setOriginalProfile] = useState({});
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');

  const [isEditingValidId, setIsEditingValidId] = useState(false);
  const [validIdForm, setValidIdForm] = useState({
    validIdType: 'Passport',
    validIdOther: '',
    validIdUrl: '',
  });
  const [validIdUploading, setValidIdUploading] = useState(false);
  const [validIdSaving, setValidIdSaving] = useState(false);

  const handleSignOutClick = () => setShowSignOutModal(true);
  const handleConfirmSignOut = () => {
    setShowSignOutModal(false);
    logout();
  };
  const handleCancelSignOut = () => setShowSignOutModal(false);

  useEffect(() => {
    if (!profileNotice) return;
    const timeoutId = setTimeout(() => setProfileNotice(''), 2800);
    return () => clearTimeout(timeoutId);
  }, [profileNotice]);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      mobileNumber: profile?.mobileNumber || '',
    });
    setValidIdForm({
      validIdType: profile?.validIdType || 'Passport',
      validIdOther: profile?.validIdOther || '',
      validIdUrl: profile?.validIdUrl || '',
    });
  }, [profile, user]);

  const displayName = profile?.displayName || user?.displayName || 'Guest';
  const email = user?.email || '';
  const avatarLetter = (displayName || email || 'G').charAt(0).toUpperCase();

  const handleProfileChange = (field, value) => {
    setProfileForm(prev => ({ ...prev, [field]: value }));
  };

  const handleEditClick = () => {
    setOriginalProfile({ ...profileForm });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setProfileForm(originalProfile);
    setIsEditing(false);
  };

  const handleValidIdFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setProfileNotice('File size exceeds 10MB. Please choose a smaller file.');
      return;
    }

    setValidIdUploading(true);
    try {
      const compressedFile = await compressImage(file, {
        maxSizeMB: 0.05,
        maxDimension: 900,
      });
      const imageUrl = await uploadImage(compressedFile);
      setValidIdForm((prev) => ({ ...prev, validIdUrl: imageUrl }));
    } catch (err) {
      console.error('Failed to upload valid ID:', err);
      setProfileNotice('Unable to upload valid ID right now.');
    } finally {
      setValidIdUploading(false);
    }
  };

  const handleStartValidIdUpload = () => {
    setIsEditingValidId(true);
  };

  const handleEditValidId = () => {
    setValidIdForm({
      validIdType: profile?.validIdType || 'Passport',
      validIdOther: profile?.validIdOther || '',
      validIdUrl: profile?.validIdUrl || '',
    });
    setIsEditingValidId(true);
  };

  const handleCancelValidIdEdit = () => {
    setValidIdForm({
      validIdType: profile?.validIdType || 'Passport',
      validIdOther: profile?.validIdOther || '',
      validIdUrl: profile?.validIdUrl || '',
    });
    setIsEditingValidId(false);
  };

  const handleSaveValidId = async () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    if (!validIdForm.validIdUrl) {
      setProfileNotice('Please upload a valid ID photo.');
      return;
    }
    if (!validIdForm.validIdType) {
      setProfileNotice('Please select a valid ID type.');
      return;
    }
    if (validIdForm.validIdType === 'Other' && !validIdForm.validIdOther.trim()) {
      setProfileNotice('Please specify your valid ID type.');
      return;
    }

    setValidIdSaving(true);
    setProfileNotice('');
    try {
      await updateGuestProfile({
        validIdUrl: validIdForm.validIdUrl,
        validIdType: validIdForm.validIdType,
        validIdOther: validIdForm.validIdType === 'Other' ? validIdForm.validIdOther.trim() : '',
      });
      setProfileNotice('Valid ID saved.');
      setIsEditingValidId(false);
    } catch (err) {
      console.error('Failed to save valid ID:', err);
      setProfileNotice('Unable to save valid ID right now.');
    } finally {
      setValidIdSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    setProfileSaving(true);
    setProfileNotice('');
    try {
      await updateGuestProfile({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        mobileNumber: profileForm.mobileNumber || '',
      });
      setProfileNotice('Profile updated.');
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setProfileNotice('Unable to update profile right now.');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#F8FCFF] px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        {profileNotice && (
          <div className="pointer-events-none fixed right-6 top-24 z-50 w-[calc(100%-1.5rem)] max-w-md sm:w-[360px]">
            <div className="flex items-center gap-3 rounded-xl border-l-4 border-[#4D8CF5] bg-white px-4 py-3 text-sm font-semibold text-[#1E3A8A] shadow-lg">
              <i className="fas fa-check-circle text-emerald-500"></i>
              {profileNotice}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            {/* Left Sidebar */}
            <aside className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-[#4D8CF5]/15 bg-white p-4 shadow-[0_8px_24px_rgba(77,140,245,0.08)] transition-all duration-300">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#4D8CF5]/5 blur-2xl"></div>
                <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-[#1E3A8A]/5 blur-3xl"></div>

                <div className="relative flex items-center gap-3">
                  {user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt={displayName}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4D8CF5] to-[#1E3A8A] text-lg font-bold text-white shadow-md">
                      {avatarLetter}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold tracking-tight text-[#1E3A8A]">
                      {user ? displayName : 'Guest Profile'}
                    </h2>
                    {email && (
                      <p className="truncate text-xs text-[#5C7AA6]">{email}</p>
                    )}
                  </div>
                </div>

                <div className="my-4 h-px bg-gradient-to-r from-transparent via-[#4D8CF5]/20 to-transparent"></div>

                <div className="relative flex items-center gap-2">
                  {user ? (
                    <button
                      type="button"
                      onClick={handleSignOutClick}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/15 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A8A] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4D8CF5]/10 hover:shadow-md"
                    >
                      <i className="fas fa-right-from-bracket text-[11px]"></i>
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAuthOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/15 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A8A] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4D8CF5]/10 hover:shadow-md"
                    >
                      <i className="fas fa-right-to-bracket text-[11px]"></i>
                      Sign In
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#4D8CF5]/15 bg-white p-3 shadow-[0_6px_18px_rgba(77,140,245,0.08)]">
                <div className="space-y-2">
                  <Link
                    href="/my-bookings"
                    className="group flex w-full items-center justify-between rounded-xl border border-transparent bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4D8CF5]/15 hover:bg-[#EEF5FF] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-calendar-check text-xs"></i>
                      </div>
                      <span>My Bookings</span>
                    </div>
                    <i className="fas fa-chevron-right text-[11px] text-[#4D8CF5] transition-transform duration-200 group-hover:translate-x-1"></i>
                  </Link>

                  <Link
                    href="/feedback"
                    className="group flex w-full items-center justify-between rounded-xl border border-transparent bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4D8CF5]/15 hover:bg-[#EEF5FF] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-comment-dots text-xs"></i>
                      </div>
                      <span>Feedback</span>
                    </div>
                    <i className="fas fa-chevron-right text-[11px] text-[#4D8CF5] transition-transform duration-200 group-hover:translate-x-1"></i>
                  </Link>
                </div>
              </div>

              <IdRequestNotifications />
            </aside>

            {/* Main Profile Details */}
            <section className="space-y-5">
              <div className="space-y-5">
                <div id="profile-details" className="overflow-hidden rounded-2xl border border-[#4D8CF5]/20 bg-white shadow-md transition-all duration-300">
                  <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
                          <i className="fas fa-user-circle text-base"></i>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-[#1E3A8A]">Profile Details</h2>
                          <p className="text-sm text-[#4D6FA8]">Update your personal and contact information</p>
                        </div>
                      </div>
                      {user && !isEditing && (
                        <button
                          type="button"
                          onClick={handleEditClick}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/30 bg-white px-4 py-2 text-sm font-semibold text-[#1E3A8A] shadow-sm transition-all hover:bg-[#4D8CF5]/5 hover:shadow-md"
                        >
                          <i className="fas fa-pen text-xs"></i>
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {user ? (
                    <div className="space-y-6 px-6 py-6">
                      <div className="grid gap-6 sm:grid-cols-2">
                        {/* First Name */}
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                            <i className="fas fa-user text-[#4D8CF5] text-xs"></i>
                            First Name
                          </label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={profileForm.firstName}
                              onChange={(e) => handleProfileChange('firstName', e.target.value)}
                              className="w-full rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all focus:border-[#4D8CF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                            />
                          ) : (
                            <div className="flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-[#F9FCFF] px-4 py-2.5 text-sm text-gray-700">
                              <i className="fas fa-user text-slate-400 text-xs"></i>
                              {profileForm.firstName || '—'}
                            </div>
                          )}
                        </div>

                        {/* Last Name */}
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                            <i className="fas fa-user-tag text-[#4D8CF5] text-xs"></i>
                            Last Name
                          </label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={profileForm.lastName}
                              onChange={(e) => handleProfileChange('lastName', e.target.value)}
                              className="w-full rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all focus:border-[#4D8CF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                            />
                          ) : (
                            <div className="flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-[#F9FCFF] px-4 py-2.5 text-sm text-gray-700">
                              <i className="fas fa-user-tag text-slate-400 text-xs"></i>
                              {profileForm.lastName || '—'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-6 sm:grid-cols-2">
                        {/* Mobile Number */}
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                            <i className="fas fa-phone-alt text-[#4D8CF5] text-xs"></i>
                            Mobile Number
                          </label>
                          {isEditing ? (
                            <input
                              type="tel"
                              value={profileForm.mobileNumber}
                              onChange={(e) => handleProfileChange('mobileNumber', e.target.value)}
                              className="w-full rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all focus:border-[#4D8CF5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                            />
                          ) : (
                            <div className="flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-[#F9FCFF] px-4 py-2.5 text-sm text-gray-700">
                              <i className="fas fa-phone-alt text-slate-400 text-xs"></i>
                              {profileForm.mobileNumber || '—'}
                            </div>
                          )}
                        </div>

                        {/* Email (read-only) */}
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                            <i className="fas fa-envelope text-[#4D8CF5] text-xs"></i>
                            Account Email
                          </label>
                          <div className="flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
                            <i className="fas fa-envelope text-slate-400 text-xs"></i>
                            {user.email || '—'}
                          </div>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="flex justify-end gap-3 pt-4 border-t border-[#4D8CF5]/10">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#1E3A8A] transition-all hover:bg-[#4D8CF5]/5 hover:shadow-sm"
                          >
                            <i className="fas fa-times text-xs"></i>
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveProfile}
                            disabled={profileSaving}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#3B78E7] hover:shadow-lg disabled:opacity-70"
                          >
                            {profileSaving ? (
                              <><i className="fas fa-spinner fa-spin"></i> Saving...</>
                            ) : (
                              <><i className="fas fa-save"></i> Save Changes</>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-lock text-2xl"></i>
                      </div>
                      <p className="text-sm text-[#4D6FA8]">Sign in to edit your profile details.</p>
                      <button
                        onClick={() => setIsAuthOpen(true)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#3B78E7]"
                      >
                        <i className="fas fa-sign-in-alt text-xs"></i>
                        Sign In
                      </button>
                    </div>
                  )}
                </div>

                <div id="photo-details" className="overflow-hidden rounded-2xl border border-[#4D8CF5]/20 bg-white shadow-md transition-all duration-300">
                  <div className="border-b border-[#4D8CF5]/10 bg-gradient-to-r from-[#4D8CF5]/5 to-white px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
                          <i className="fas fa-id-card text-base"></i>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-[#1E3A8A]">Photo Details</h2>
                          <p className="text-sm text-[#4D6FA8]">Manage your valid ID for reservations</p>
                        </div>
                      </div>
                      {user && !isEditingValidId && profile?.validIdUrl && (
                        <button
                          type="button"
                          onClick={handleEditValidId}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/30 bg-white px-4 py-2 text-sm font-semibold text-[#1E3A8A] shadow-sm transition-all hover:bg-[#4D8CF5]/5 hover:shadow-md"
                        >
                          <i className="fas fa-pen text-xs"></i>
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {user ? (
                    <div className="space-y-6 px-6 py-6">
                      {!isEditingValidId && profile?.validIdUrl ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 rounded-xl border border-[#4D8CF5]/20 bg-[#F9FCFF] px-4 py-2.5 text-sm text-gray-700">
                            <i className="fas fa-id-badge text-slate-400 text-xs"></i>
                            <span className="text-[#1E3A8A]/70">ID Type:</span>
                            <span className="font-semibold text-[#1E3A8A]">{getDisplayValidIdType(profile)}</span>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-[#4D8CF5]/20 bg-[#F9FCFF]">
                            <img src={profile.validIdUrl} alt="Valid ID" className="max-h-64 w-full object-contain bg-white" />
                          </div>
                        </div>
                      ) : !isEditingValidId ? (
                        <div className="flex flex-col items-start gap-4">
                          <p className="text-sm text-[#4D6FA8]">Upload a valid ID to use for room and day tour reservations.</p>
                          <button
                            type="button"
                            onClick={handleStartValidIdUpload}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#3B78E7] hover:shadow-lg"
                          >
                            <i className="fas fa-cloud-upload-alt"></i>
                            Upload Photo
                          </button>
                        </div>
                      ) : null}

                      {isEditingValidId && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-800">
                            <i className="fas fa-info-circle mr-2"></i>
                            The uploaded valid ID will automatically be used for future room or day tour reservations.
                          </div>
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                              <i className="fas fa-list text-[#4D8CF5] text-xs"></i>
                              Valid ID Type
                            </label>
                            <select
                              value={validIdForm.validIdType}
                              onChange={(e) => setValidIdForm((prev) => ({ ...prev, validIdType: e.target.value }))}
                              className="w-full rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-[#4D8CF5] focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                            >
                              {VALID_ID_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option === 'Other' ? 'Other valid IDs (specify)' : option}
                                </option>
                              ))}
                            </select>
                          </div>
                          {validIdForm.validIdType === 'Other' && (
                            <div className="space-y-1">
                              <label className="text-sm font-semibold text-[#1E3A8A]">Specify ID Type</label>
                              <input
                                type="text"
                                value={validIdForm.validIdOther}
                                onChange={(e) => setValidIdForm((prev) => ({ ...prev, validIdOther: e.target.value }))}
                                placeholder="Enter your valid ID type"
                                className="w-full rounded-xl border border-[#4D8CF5]/20 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-[#4D8CF5] focus:outline-none focus:ring-2 focus:ring-[#4D8CF5]/20"
                              />
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-[#1E3A8A]">Valid ID Photo</label>
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleValidIdFileChange}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                disabled={validIdUploading}
                              />
                              <div className={`flex min-h-[11rem] items-center justify-center rounded-xl border-2 border-dashed border-[#4D8CF5]/30 bg-[#F9FCFF] p-4 ${validIdUploading ? 'opacity-60' : ''}`}>
                                {validIdForm.validIdUrl ? (
                                  <img src={validIdForm.validIdUrl} alt="Valid ID preview" className="max-h-52 w-full object-contain" />
                                ) : (
                                  <div className="text-center text-sm text-[#4D6FA8]">
                                    <i className="fas fa-camera mb-2 block text-2xl text-[#4D8CF5]/50"></i>
                                    {validIdUploading ? ' Uploading...' : ' Click to select a photo'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3 border-t border-[#4D8CF5]/10 pt-4">
                            <button type="button" onClick={handleCancelValidIdEdit} className="inline-flex items-center gap-2 rounded-xl border border-[#4D8CF5]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#1E3A8A] hover:bg-[#4D8CF5]/5">
                              <i className="fas fa-times text-xs"></i> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveValidId}
                              disabled={validIdSaving || validIdUploading || !validIdForm.validIdUrl}
                              className="inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#3B78E7] disabled:opacity-70"
                            >
                              {validIdSaving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save Valid ID</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#4D8CF5]/10 text-[#4D8CF5]">
                        <i className="fas fa-lock text-2xl"></i>
                      </div>
                      <p className="text-sm text-[#4D6FA8]">Sign in to upload and manage your valid ID.</p>
                      <button onClick={() => setIsAuthOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#4D8CF5] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3B78E7]">
                        <i className="fas fa-sign-in-alt text-xs"></i> Sign In
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <SignOutConfirmationModal
        isOpen={showSignOutModal}
        onConfirm={handleConfirmSignOut}
        onCancel={handleCancelSignOut}
      />

      <GuestAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
}

export default function GuestAccountPage() {
  return (
    <GuestLayout>
      <GuestAccountContent />
    </GuestLayout>
  );
}