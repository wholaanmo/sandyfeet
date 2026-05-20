export const GUEST_SESSION_VERSION_KEY = 'guestSessionVersion';

export const isGuestAccountDeactivated = (profile) =>
  profile?.accountStatus === 'deactivated';

export const getGuestDeactivationReason = (profile) =>
  String(profile?.deactivationReason || '').trim();

export const getGuestSessionVersion = (profile) => {
  const version = Number(profile?.sessionVersion);
  return Number.isFinite(version) && version > 0 ? version : 1;
};

export const persistGuestSessionVersion = (profile) => {
  if (typeof window === 'undefined') return;
  const version = getGuestSessionVersion(profile);
  localStorage.setItem(GUEST_SESSION_VERSION_KEY, String(version));
};

export const clearGuestSessionVersion = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GUEST_SESSION_VERSION_KEY);
};

export const isGuestSessionInvalidated = (profile) => {
  if (typeof window === 'undefined' || !profile) return false;
  const storedVersion = Number(localStorage.getItem(GUEST_SESSION_VERSION_KEY));
  if (!Number.isFinite(storedVersion) || storedVersion <= 0) return false;
  return getGuestSessionVersion(profile) > storedVersion;
};

export const buildGuestDeactivationMessage = (profile) => {
  const reason = getGuestDeactivationReason(profile);
  const base = 'This account has been deactivated by the resort. You cannot log in.';
  return reason ? `${base} Reason: ${reason}` : base;
};
