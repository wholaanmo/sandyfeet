export const GUEST_ADDRESS_FIELD_KEYS = [
  'houseNumber',
  'street',
  'barangay',
  'city',
  'province',
];

export const EMPTY_GUEST_ADDRESS = {
  houseNumber: '',
  street: '',
  barangay: '',
  city: '',
  province: '',
};

export const ADDRESS_VERIFICATION_NOTE =
  'This address information will be used for comparison and verification against the identification documents you submit for additional security and scam prevention purposes.';

export const getGuestAddressFromProfile = (profile) => {
  const stored = profile?.address;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    return {
      houseNumber: String(stored.houseNumber || '').trim(),
      street: String(stored.street || '').trim(),
      barangay: String(stored.barangay || '').trim(),
      city: String(stored.city || stored.cityMunicipality || '').trim(),
      province: String(stored.province || '').trim(),
    };
  }
  return { ...EMPTY_GUEST_ADDRESS };
};

export const isGuestAddressComplete = (address) =>
  GUEST_ADDRESS_FIELD_KEYS.every((key) => String(address?.[key] || '').trim().length > 0);

export const isProfileAddressComplete = (profile) =>
  isGuestAddressComplete(getGuestAddressFromProfile(profile));

export const formatGuestAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  if (address.formatted) return String(address.formatted).trim();
  const parts = [
    address.houseNumber,
    address.street,
    address.barangay,
    address.city || address.cityMunicipality,
    address.province,
    address.postalCode,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(', ');
};

export const buildGuestAddressSnapshot = (profile) => {
  const structured = getGuestAddressFromProfile(profile);
  return {
    ...structured,
    formatted: formatGuestAddress(structured),
  };
};

export const buildGuestInfoWithAddress = (profile, baseGuestInfo) => ({
  ...baseGuestInfo,
  guestAddress: buildGuestAddressSnapshot(profile),
  address: buildGuestAddressSnapshot(profile),
});

export const sanitizeNumericMobileInput = (value) => String(value || '').replace(/\D/g, '');

export const getAddressBlockerMessage = () =>
  'Complete your home address in Account → Profile Details before confirming your booking.';
