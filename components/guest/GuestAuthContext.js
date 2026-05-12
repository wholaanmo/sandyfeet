'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const GuestAuthContext = createContext(null);

const isGoogleUser = (firebaseUser) => (
  firebaseUser?.providerData?.some((provider) => provider.providerId === 'google.com')
);

const splitDisplayName = (displayName = '') => {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : ''
  };
};

async function upsertGuestProfile(firebaseUser) {
  if (!firebaseUser || !isGoogleUser(firebaseUser)) return null;

  const profileRef = doc(db, 'guestProfiles', firebaseUser.uid);
  const profileSnap = await getDoc(profileRef);
  const { firstName, lastName } = splitDisplayName(firebaseUser.displayName || '');

  const profileData = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || '',
    firstName,
    lastName,
    photoURL: firebaseUser.photoURL || '',
    provider: 'google',
    emailVerified: Boolean(firebaseUser.emailVerified),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (!profileSnap.exists()) {
    profileData.createdAt = serverTimestamp();
  }

  await setDoc(profileRef, profileData, { merge: true });
  return { id: firebaseUser.uid, ...profileSnap.data(), ...profileData };
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

      if (!firebaseUser || !isGoogleUser(firebaseUser)) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const guestProfile = await upsertGuestProfile(firebaseUser);
        setProfile(guestProfile);
      } catch (err) {
        console.error('Unable to sync guest profile:', err);
        setError('Your Google account connected, but the guest profile could not be updated.');
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
      const guestProfile = await upsertGuestProfile(result.user);
      setUser(result.user);
      setProfile(guestProfile);
      return result.user;
    } catch (err) {
      console.error('Google guest sign-in failed:', err);
      const message = err?.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was closed before it finished.'
        : 'Google sign-in failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setActionLoading(false);
    }
  }, []);

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
    logout
  }), [actionLoading, error, loading, logout, profile, signInWithGoogle, user]);

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
