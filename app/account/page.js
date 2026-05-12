'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import GuestLayout from '@/app/guest/layout';
import GuestAuthModal from '@/components/guest/GuestAuthModal';
import { useGuestAuth } from '@/components/guest/GuestAuthContext';

const genderOptions = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];

function GuestAccountContent() {
  const { user, profile, loading, logout, updateGuestProfile } = useGuestAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    accessibilityNeeds: '',
    contactName: '',
    contactPhone: '',
    mobileNumber: '',
    contactEmail: '',
    address: ''
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
    if (!user) return;
    const nextProfileForm = {
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      dateOfBirth: profile?.dateOfBirth || '',
      gender: profile?.gender || '',
      accessibilityNeeds: profile?.accessibilityNeeds || '',
      contactName: profile?.contactName || '',
      contactPhone: profile?.contactPhone || '',
      mobileNumber: profile?.mobileNumber || '',
      contactEmail: profile?.contactEmail || user.email || '',
      address: profile?.address || ''
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
        contactName: profileForm.contactName || '',
        contactPhone: profileForm.contactPhone || '',
        mobileNumber: profileForm.mobileNumber || '',
        contactEmail: profileForm.contactEmail || '',
        address: profileForm.address || ''
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
      <div className="min-h-screen bg-slate-50 px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">


            {!user && (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                <i className="fas fa-user-circle"></i>
                Sign in or create an account
              </button>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    {user?.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt={displayName}
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-xl font-bold text-white">
                        {avatarLetter}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {user ? 'Google connected' : 'Not signed in'}
                      </p>
                      <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{user ? displayName : 'Guest Profile'}</h2>
                      {email && <p className="mt-1 truncate text-xs text-slate-500">{email}</p>}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {user ? (
                      <button
                        type="button"
                        onClick={logout}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <i className="fas fa-right-from-bracket"></i>
                        Sign Out
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAuthOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <i className="fas fa-right-to-bracket"></i>
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Shortcuts</h3>
                <div className="mt-4 space-y-2">
                  <Link
                    href="/my-bookings"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    My bookings
                    <i className="fas fa-chevron-right text-xs text-slate-400"></i>
                  </Link>
                  <Link
                    href="/reservation-tracker"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Track reservations
                    <i className="fas fa-chevron-right text-xs text-slate-400"></i>
                  </Link>
                  <Link
                    href="/feedback"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Feedback
                    <i className="fas fa-chevron-right text-xs text-slate-400"></i>
                  </Link>
                </div>
              </div>
            </aside>

            <section className="space-y-5">
              <div className="space-y-5">
                <div id="profile-details" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-5">
                    <h2 className="text-lg font-bold text-slate-900">Profile Details</h2>
                    <p className="text-sm text-slate-500">Update your personal and contact information.</p>
                  </div>

                  {user ? (
                    <div className="space-y-4 px-6 py-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-700">
                          First Name
                          <input
                            type="text"
                            value={profileForm.firstName}
                            onChange={(event) => handleProfileChange('firstName', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-700">
                          Last Name
                          <input
                            type="text"
                            value={profileForm.lastName}
                            onChange={(event) => handleProfileChange('lastName', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-700">
                          Date of Birth
                          <input
                            type="date"
                            value={profileForm.dateOfBirth}
                            onChange={(event) => handleProfileChange('dateOfBirth', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-700">
                          Gender
                          <select
                            value={profileForm.gender}
                            onChange={(event) => handleProfileChange('gender', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          >
                            <option value="">Select gender</option>
                            {genderOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="text-sm font-semibold text-slate-700">
                        Accessibility Needs
                        <textarea
                          rows="3"
                          value={profileForm.accessibilityNeeds}
                          onChange={(event) => handleProfileChange('accessibilityNeeds', event.target.value)}
                          placeholder="e.g., wheelchair access, hearing assistance"
                          className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-700">
                          Contact Person
                          <input
                            type="text"
                            value={profileForm.contactName}
                            onChange={(event) => handleProfileChange('contactName', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-700">
                          Contact Number
                          <input
                            type="tel"
                            value={profileForm.contactPhone}
                            onChange={(event) => handleProfileChange('contactPhone', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-700">
                          Mobile Number
                          <input
                            type="tel"
                            value={profileForm.mobileNumber}
                            onChange={(event) => handleProfileChange('mobileNumber', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-700">
                          Email Address
                          <input
                            type="email"
                            value={profileForm.contactEmail}
                            onChange={(event) => handleProfileChange('contactEmail', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                          />
                        </label>
                      </div>

                      <label className="text-sm font-semibold text-slate-700">
                        Address
                        <textarea
                          rows="3"
                          value={profileForm.address}
                          onChange={(event) => handleProfileChange('address', event.target.value)}
                          className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                        />
                      </label>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={profileSaving}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
                        >
                          {profileSaving ? 'Saving...' : 'Save Profile'}
                        </button>
                        {profileNotice && (
                          <span className="text-xs font-semibold text-slate-500">{profileNotice}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-sm text-slate-500">
                      Sign in to edit your profile details.
                    </div>
                  )}
                </div>

                <div id="account-settings" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-5">
                    <h2 className="text-lg font-bold text-slate-900">Account Settings</h2>
                    <p className="text-sm text-slate-500">Manage your contact details and security.</p>
                  </div>

                  {user ? (
                    <div className="space-y-4 px-6 py-5">
                      <label className="text-sm font-semibold text-slate-700">
                        Account Email
                        <input
                          type="email"
                          value={user.email || ''}
                          disabled
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-500"
                        />
                        <span className="mt-2 block text-xs text-slate-400">Google-managed account email.</span>
                      </label>

                      <label className="text-sm font-semibold text-slate-700">
                        Contact Email
                        <input
                          type="email"
                          value={settingsForm.contactEmail}
                          onChange={(event) => handleSettingsChange('contactEmail', event.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                        />
                      </label>

                      <label className="text-sm font-semibold text-slate-700">
                        Current Mobile Number
                        <input
                          type="tel"
                          value={settingsForm.mobileNumber}
                          disabled
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-500"
                        />
                      </label>

                      <label className="text-sm font-semibold text-slate-700">
                        Change Mobile Number
                        <input
                          type="tel"
                          value={settingsForm.newMobileNumber}
                          onChange={(event) => handleSettingsChange('newMobileNumber', event.target.value)}
                          placeholder="Enter new mobile number"
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                        />
                      </label>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSaveSettings}
                          disabled={settingsSaving}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
                        >
                          {settingsSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                        <a
                          href="https://myaccount.google.com/security"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300"
                        >
                          Change Password
                        </a>
                        {settingsNotice && (
                          <span className="text-xs font-semibold text-slate-500">{settingsNotice}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-sm text-slate-500">
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
