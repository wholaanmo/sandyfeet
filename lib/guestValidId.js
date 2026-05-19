export const VALID_ID_OPTIONS = [
  'Passport',
  "Driver's License",
  'National ID',
  'School ID',
  'UMID',
  'PhilHealth ID',
  'Other',
];

export function getDisplayValidIdType(profile) {
  if (!profile?.validIdType) return '';
  if (profile.validIdType === 'Other' && profile.validIdOther?.trim()) {
    return `Other - ${profile.validIdOther.trim()}`;
  }
  return profile.validIdType;
}

export function hasAccountValidId(profile) {
  return Boolean(profile?.validIdUrl?.trim() && profile?.validIdType?.trim());
}

export function hasAccountMobileNumber(profile) {
  return Boolean(profile?.mobileNumber?.trim());
}
