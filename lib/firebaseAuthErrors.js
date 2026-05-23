export const mapFirebaseAuthError = (err, context = 'signin') => {
  const code = err?.code || '';
  const message = String(err?.message || '');

  if (message === 'Email not verified' || code === 'auth/email-not-verified') {
    return 'Email not verified. Please check your inbox for the verification link before signing in.';
  }

  if (code === 'auth/user-not-found') {
    return 'Account does not exist. Please sign up first.';
  }

  if (code === 'auth/wrong-password') {
    return 'Incorrect password. Please try again.';
  }

  if (code === 'auth/invalid-credential') {
    return 'Invalid email or password combination. Please check your credentials and try again.';
  }

  if (code === 'auth/invalid-email') {
    return 'Invalid email. Please enter a valid email address.';
  }

  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Please sign in instead.';
  }

  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.';
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in was closed before it finished.';
  }

  if (message.includes('Admin/Staff cannot')) {
    return 'Admin/Staff accounts cannot sign in as guests. Please use the staff login page.';
  }

  if (message.includes('deactivated')) {
    return message;
  }

  if (context === 'signup') {
    return 'Sign up failed. Please check your details and try again.';
  }

  return 'Sign in failed. Please check your email and password.';
};
