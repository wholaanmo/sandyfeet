'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import GuestLayout from '@/app/guest/layout';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';

const genderOptions = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];

// Address fields removed per request

function GuestAccountContent() {
  const { user, profile, loading, logout, updateGuestProfile } = useGuestAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    accessibilityNeeds: '',
    mobileNumber: '',
    contactEmail: '',
    // address fields removed
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [settingsForm, setSettingsForm] = useState({
    contactEmail: '',
    mobileNumber: '',
    newMobileNumber: ''
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');

  useEffect(() => {
    if (!profileNotice) return undefined;

    const timeoutId = window.setTimeout(() => {
      setProfileNotice('');
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [profileNotice]);

  useEffect(() => {
    if (!settingsNotice) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSettingsNotice('');
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [settingsNotice]);

  useEffect(() => {
    if (!user) return;
    const nextProfileForm = {
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      dateOfBirth: profile?.dateOfBirth || '',
      gender: profile?.gender || '',
      accessibilityNeeds: profile?.accessibilityNeeds || '',
      mobileNumber: profile?.mobileNumber || '',
      contactEmail: profile?.contactEmail || user.email || ''
    };

    setProfileForm(nextProfileForm);
    setSettingsForm({
      contactEmail: nextProfileForm.contactEmail,
      mobileNumber: nextProfileForm.mobileNumber,
      newMobileNumber: ''
    });
  }, [profile, user]);


  const displayName = profile?.displayName || user?.displayName || 'Guest';
  const email = user?.email || '';
  const avatarLetter = (displayName || email || 'G').charAt(0).toUpperCase();

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSettingsChange = (field, value) => {
    setSettingsForm((prev) => ({ ...prev, [field]: value }));
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
        dateOfBirth: profileForm.dateOfBirth || '',
        gender: profileForm.gender || '',
        accessibilityNeeds: profileForm.accessibilityNeeds || '',
        mobileNumber: profileForm.mobileNumber || '',
        contactEmail: profileForm.contactEmail || ''
      });
      setSettingsForm((prev) => ({
        ...prev,
        mobileNumber: profileForm.mobileNumber || '',
        contactEmail: profileForm.contactEmail || ''
      }));
      setProfileNotice('Profile updated.');
    } catch (err) {
      console.error('Failed to update profile:', err);
      setProfileNotice('Unable to update profile right now.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setSettingsSaving(true);
    setSettingsNotice('');

    const nextMobile = settingsForm.newMobileNumber.trim() || settingsForm.mobileNumber || '';
    const nextContactEmail = settingsForm.contactEmail || '';

    try {
      await updateGuestProfile({
        mobileNumber: nextMobile,
        contactEmail: nextContactEmail
      });
      setSettingsForm((prev) => ({
        ...prev,
        mobileNumber: nextMobile,
        newMobileNumber: ''
      }));
      setProfileForm((prev) => ({
        ...prev,
        mobileNumber: nextMobile,
        contactEmail: nextContactEmail
      }));
      setSettingsNotice('Settings updated.');
    } catch (err) {
      console.error('Failed to update settings:', err);
      setSettingsNotice('Unable to update settings right now.');
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        {(profileNotice || settingsNotice) && (
          <div className="pointer-events-none fixed right-6 top-24 z-50 w-[calc(100%-1.5rem)] max-w-md sm:w-[360px]">
            <div className="space-y-2">
              {profileNotice && (
                <div className="toast-animate rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg">
                  {profileNotice}
                </div>
              )}
              {settingsNotice && (
                <div className="toast-animate rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg">
                  {settingsNotice}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  {user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt={displayName}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-xl object-cover ring-2 ring-gray-200"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 text-lg font-bold text-white">
                      {avatarLetter}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-gray-900">{user ? displayName : 'Guest Profile'}</h2>
                    {email && <p className="truncate text-xs text-gray-500">{email}</p>}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {user ? (
                    <button
                      type="button"
                      onClick={logout}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-100"
                    >
                      <i className="fas fa-right-from-bracket text-xs"></i>
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAuthOpen(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-100"
                    >
                      <i className="fas fa-right-to-bracket text-xs"></i>
                      Sign In
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="space-y-1">
                  <Link
                    href="/my-bookings"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
                  >
                    My Bookings
                    <i className="fas fa-chevron-right text-xs text-gray-400"></i>
                  </Link>
                  <Link
                    href="/feedback"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
                  >
                    Feedback
                    <i className="fas fa-chevron-right text-xs text-gray-400"></i>
                  </Link>
                </div>
              </div>
            </aside>

            <section className="space-y-5">
              <div className="space-y-5">
                <div id="profile-details" className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-gray-200 px-6 py-5">
                    <h2 className="text-lg font-bold text-gray-900">Profile Details</h2>
                    <p className="text-sm text-gray-500">Update your personal and contact information.</p>
                  </div>

                  {user ? (
                    <div className="space-y-4 px-6 py-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-gray-900">
                          First Name
                          <input
                            type="text"
                            value={profileForm.firstName}
                            onChange={(event) => handleProfileChange('firstName', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                          />
                        </label>
                        <label className="text-sm font-semibold text-gray-900">
                          Last Name
                          <input
                            type="text"
                            value={profileForm.lastName}
                            onChange={(event) => handleProfileChange('lastName', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-gray-900">
                          Date of Birth
                          <input
                            type="date"
                            value={profileForm.dateOfBirth}
                            onChange={(event) => handleProfileChange('dateOfBirth', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                          />
                        </label>
                        <label className="text-sm font-semibold text-gray-900">
                          Gender
                          <select
                            value={profileForm.gender}
                            onChange={(event) => handleProfileChange('gender', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                          >
                            <option value="">Select gender</option>
                            {genderOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="text-sm font-semibold text-gray-900">
                        Accessibility Needs
                        <textarea
                          rows="3"
                          value={profileForm.accessibilityNeeds}
                          onChange={(event) => handleProfileChange('accessibilityNeeds', event.target.value)}
                          placeholder="e.g., wheelchair access, hearing assistance"
                          className="mt-2 w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-gray-900">
                          Mobile Number
                          <input
                            type="tel"
                            value={profileForm.mobileNumber}
                            onChange={(event) => handleProfileChange('mobileNumber', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                          />
                        </label>
                        <label className="text-sm font-semibold text-gray-900">
                          Email Address
                          <input
                            type="email"
                            value={profileForm.contactEmail}
                            onChange={(event) => handleProfileChange('contactEmail', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                          />
                        </label>
                      </div>

                      {/* address fields removed */}

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={profileSaving}
                          className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-70"
                        >
                          {profileSaving ? 'Saving...' : 'Save Profile'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-sm text-gray-500">
                      Sign in to edit your profile details.
                    </div>
                  )}
                </div>

                <div id="account-settings" className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-gray-200 px-6 py-5">
                    <h2 className="text-lg font-bold text-gray-900">Account Settings</h2>
                    <p className="text-sm text-gray-500">Manage your contact details and security.</p>
                  </div>

                  {user ? (
                    <div className="space-y-4 px-6 py-5">
                      <label className="text-sm font-semibold text-gray-900">
                        Account Email
                        <input
                          type="email"
                          value={user.email || ''}
                          disabled
                          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
                        />
                        <span className="mt-2 block text-xs text-gray-500">Google-managed account email.</span>
                      </label>

                      <label className="text-sm font-semibold text-gray-900">
                        Contact Email
                        <input
                          type="email"
                          value={settingsForm.contactEmail}
                          onChange={(event) => handleSettingsChange('contactEmail', event.target.value)}
                          className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                      </label>

                      <label className="text-sm font-semibold text-gray-900">
                        Current Mobile Number
                        <input
                          type="tel"
                          value={settingsForm.mobileNumber}
                          disabled
                          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
                        />
                      </label>

                      <label className="text-sm font-semibold text-gray-900">
                        Change Mobile Number
                        <input
                          type="tel"
                          value={settingsForm.newMobileNumber}
                          onChange={(event) => handleSettingsChange('newMobileNumber', event.target.value)}
                          placeholder="Enter new mobile number"
                          className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                      </label>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSaveSettings}
                          disabled={settingsSaving}
                          className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-70"
                        >
                          {settingsSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-sm text-gray-500">
                      Sign in to manage account settings.
                    </div>
                  )}
                </div>
              </div>

            </section>
          </div>
        </div>
      </div>

      <GuestAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
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
