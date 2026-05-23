export const clearStaffAdminSession = () => {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('userType');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userName');
  localStorage.removeItem('uid');
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('sessionExpiry');
  localStorage.removeItem('rememberMe');

  document.cookie = 'sessionToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sessionExpiry=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
};

export const isStaffAdminSessionValid = () => {
  if (typeof window === 'undefined') return false;

  const userType = localStorage.getItem('userType');
  const sessionToken = localStorage.getItem('sessionToken');
  const expiry = localStorage.getItem('sessionExpiry');

  if (!userType || !sessionToken || !expiry) return false;
  const expiryMs = parseInt(expiry, 10);
  if (Number.isNaN(expiryMs) || expiryMs < Date.now()) return false;

  return userType === 'admin' || userType === 'staff';
};
