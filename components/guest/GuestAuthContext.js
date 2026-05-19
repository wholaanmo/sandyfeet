'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const GuestAuthContext = createContext(null);

const isGoogleUser = (firebaseUser) => (
  firebaseUser?.providerData?.some((provider) => provider.providerId === 'google.com')
);

const isEmailUser = (firebaseUser) => (
  firebaseUser?.providerData?.some((provider) => provider.providerId === 'password')
);

const splitDisplayName = (displayName = '') => {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : ''
  };
};

function generateVerificationToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Helper function to check if a user is admin or staff
async function isAdminOrStaffUser(uid) {
  if (!uid) return false;
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const role = userDocSnap.data().role;
      return role === 'admin' || role === 'staff';
    }
    return false;
  } catch (err) {
    console.error('Error checking user role:', err);
    return false;
  }
}

// Clean up any accidental user document for a guest (unless admin/staff)
async function deleteUserDocumentIfNotAdminStaff(uid) {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const role = userDocSnap.data().role;
      if (role !== 'admin' && role !== 'staff') {
        await deleteDoc(userDocRef);
      }
    }
  } catch (err) {
    console.error('Error cleaning up users collection for guest:', err);
  }
}

async function upsertGuestProfile(firebaseUser, additionalData = {}) {
  if (!firebaseUser) return null;

  // CRITICAL FIX: Never create guest profile for admin/staff users
  const isAdminStaff = await isAdminOrStaffUser(firebaseUser.uid);
  if (isAdminStaff) {
    console.warn('Attempted to create guest profile for admin/staff user - blocked');
    return null;
  }

  const profileRef = doc(db, 'guestProfiles', firebaseUser.uid);
  const profileSnap = await getDoc(profileRef);

  let firstName = '';
  let lastName = '';
  let displayName = firebaseUser.displayName || '';

  if (additionalData.firstName !== undefined) {
    firstName = additionalData.firstName;
    lastName = additionalData.lastName || '';
    displayName = `${firstName} ${lastName}`.trim();
  } else {
    const split = splitDisplayName(displayName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const provider = isGoogleUser(firebaseUser) ? 'google' : 'email';

  const profileData = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName,
    firstName,
    lastName,
    photoURL: firebaseUser.photoURL || '',
    provider,
    emailVerified: firebaseUser.emailVerified || false,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (!profileSnap.exists()) {
    profileData.createdAt = serverTimestamp();
  }

  await setDoc(profileRef, profileData, { merge: true });

  // Ensure no leftover user document for this guest
  await deleteUserDocumentIfNotAdminStaff(firebaseUser.uid);

  return { id: firebaseUser.uid, ...profileSnap.data(), ...profileData };
}

async function syncEmailVerificationStatus(firebaseUser) {
  if (!firebaseUser || !isEmailUser(firebaseUser)) return;

  const profileRef = doc(db, 'guestProfiles', firebaseUser.uid);
  const profileSnap = await getDoc(profileRef);

  if (profileSnap.exists() && profileSnap.data().emailVerified !== firebaseUser.emailVerified) {
    await updateDoc(profileRef, {
      emailVerified: firebaseUser.emailVerified,
      updatedAt: serverTimestamp()
    });
  }
}

export function GuestAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setError('');

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // CRITICAL FIX: Check if this is an admin/staff user
      const isAdminStaff = await isAdminOrStaffUser(firebaseUser.uid);
      
      if (isAdminStaff) {
        // Admin/Staff users should NOT be managed by GuestAuthContext
        // They use separate session management via app/login
        console.log('Admin/Staff user detected - skipping guest profile handling');
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // Only proceed for guest users
      setUser(firebaseUser);

      try {
        await syncEmailVerificationStatus(firebaseUser);

        let guestProfile;
        if (isGoogleUser(firebaseUser)) {
          guestProfile = await upsertGuestProfile(firebaseUser);
        } else {
          const profileRef = doc(db, 'guestProfiles', firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            guestProfile = { id: firebaseUser.uid, ...profileSnap.data() };
          } else {
            guestProfile = await upsertGuestProfile(firebaseUser);
          }
        }
        setProfile(guestProfile);
      } catch (err) {
        console.error('Unable to sync guest profile:', err);
        setError('Your account connected, but the profile could not be loaded.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setActionLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      
      // Check if this is an admin/staff user before creating guest profile
      const isAdminStaff = await isAdminOrStaffUser(result.user.uid);
      if (isAdminStaff) {
        await signOut(auth);
        setError('Admin/Staff accounts cannot sign in as guests. Please use the staff login page.');
        throw new Error('Admin/Staff cannot use guest sign-in');
      }
      
      const guestProfile = await upsertGuestProfile(result.user);
      setUser(result.user);
      setProfile(guestProfile);
      return result.user;
    } catch (err) {
      console.error('Google guest sign-in failed:', err);
      const message = err?.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was closed before it finished.'
        : err.message || 'Google sign-in failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signUpWithEmail = useCallback(async (email, password, firstName, lastName) => {
    setActionLoading(true);
    setError('');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      const displayName = `${firstName} ${lastName}`.trim();
      await updateProfile(newUser, { displayName });

      const token = generateVerificationToken();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      await setDoc(doc(db, 'emailVerificationTokens', token), {
        uid: newUser.uid,
        email: newUser.email,
        expiresAt,
        createdAt: serverTimestamp(),
      });

      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const verificationLink = `${baseUrl}/api/verify-guest-email?token=${token}`;

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; color: #333333; line-height: 1.6; border: 1px solid #eeeeee;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #111111;">Verify Your Email</h1>
            <p style="margin: 5px 0 0; font-size: 14px; color: #3b82f6;">SandyFeet Guest Account</p>
          </div>
          <p>Dear <strong>${firstName} ${lastName}</strong>,</p>
          <p>Thank you for creating an account. Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" style="background-color: #111111; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold;">Verify Email</a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; font-size: 12px; color: #666;">${verificationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #999999; text-align: center;">
            <p>SandyFeet Resort • sandyfeetreservation@gmail.com</p>
          </div>
        </div>
      `;

      await fetch(`${baseUrl}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: newUser.email,
          subject: 'Verify your SandyFeet guest account',
          html: emailHtml,
        }),
      });

      await upsertGuestProfile(newUser, { firstName, lastName });

      await signOut(auth);
      setUser(null);
      setProfile(null);

      return { success: true, email: newUser.email };
    } catch (err) {
      console.error('Email sign-up failed:', err);
      let message = 'Sign up failed. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      }
      setError(message);
      throw new Error(message);
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setActionLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const signedInUser = userCredential.user;

      // CRITICAL FIX: Check if this is an admin/staff user before allowing guest sign-in
      const isAdminStaff = await isAdminOrStaffUser(signedInUser.uid);
      if (isAdminStaff) {
        await signOut(auth);
        setError('Admin/Staff accounts cannot sign in as guests. Please use the staff login page.');
        throw new Error('Admin/Staff cannot use guest sign-in');
      }

      const profileRef = doc(db, 'guestProfiles', signedInUser.uid);
      const profileSnap = await getDoc(profileRef);
      const profileData = profileSnap.exists() ? profileSnap.data() : null;

      const isVerified = profileData?.emailVerified === true || signedInUser.emailVerified === true;

      if (isEmailUser(signedInUser) && !isVerified) {
        await signOut(auth);
        setError('Please verify your email address before signing in. Check your inbox for the verification link.');
        throw new Error('Email not verified');
      }

      if (profileData?.emailVerified !== signedInUser.emailVerified) {
        await upsertGuestProfile(signedInUser);
      }

      const guestProfile = await upsertGuestProfile(signedInUser);
      setUser(signedInUser);
      setProfile(guestProfile);
      return signedInUser;
    } catch (err) {
      console.error('Email sign-in failed:', err);
      let message = 'Sign in failed. Please try again.';
      if (err.code === 'auth/user-not-found') {
        message = 'No account found with this email. Please sign up first.';
      } else if (err.code === 'auth/wrong-password') {
        message = 'Incorrect password. Please try again.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (err.message === 'Email not verified') {
        message = err.message;
      }
      setError(message);
      throw new Error(message);
    } finally {
      setActionLoading(false);
    }
  }, []);

  const updateGuestProfile = useCallback(async (updates) => {
    if (!user) {
      throw new Error('Guest must be signed in to update profile.');
    }

    const profileRef = doc(db, 'guestProfiles', user.uid);
    await setDoc(profileRef, {
      ...updates,
      updatedAt: serverTimestamp()
    }, { merge: true });

    setProfile((prev) => ({
      ...(prev || {}),
      ...updates,
      uid: user.uid,
      email: (prev?.email || user.email || ''),
      displayName: (prev?.displayName || user.displayName || '')
    }));
  }, [user]);

  const logout = useCallback(async () => {
    setActionLoading(true);
    setError('');

    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('Guest sign-out failed:', err);
      setError('Sign out failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    actionLoading,
    error,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    logout,
    updateGuestProfile
  }), [actionLoading, error, loading, logout, profile, signInWithGoogle, signUpWithEmail, signInWithEmail, updateGuestProfile, user]);

  return (
    <GuestAuthContext.Provider value={value}>
      {children}
    </GuestAuthContext.Provider>
  );
}

export function useGuestAuth() {
  const context = useContext(GuestAuthContext);

  if (!context) {
    throw new Error('useGuestAuth must be used inside GuestAuthProvider');
  }

  return context;
}