// components/guest/GuestAuthModal.js
'use client';

import { useEffect, useState } from 'react';
import { useGuestAuth } from './GuestAuthContext';

function GoogleMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
    </svg>
  );
}

// Enhanced password strength checker
function getPasswordStrength(password) {
  if (!password) return { level: 'too-weak', message: 'Too Weak', color: 'text-red-500' };
  
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const length = password.length;
  
  const typesCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  
  // Too Weak: very short or missing multiple character types
  if (length < 6 || typesCount <= 2) {
    return { level: 'too-weak', message: 'Too Weak', color: 'text-red-500' };
  }
  
  // Weak Password: length >=6 but missing at least one required type
  if (typesCount < 4) {
    return { level: 'weak', message: 'Weak Password', color: 'text-orange-500' };
  }
  
  // All four types present – evaluate length
  if (length >= 12) {
    return { level: 'very-strong', message: 'Very Strong Password', color: 'text-emerald-600' };
  }
  if (length >= 10) {
    return { level: 'strong', message: 'Strong Password', color: 'text-blue-600' };
  }
  if (length >= 8) {
    return { level: 'good', message: 'Good Password', color: 'text-teal-600' };
  }
  
  // Fallback (length 6-7 with all types)
  return { level: 'good', message: 'Good Password', color: 'text-teal-600' };
}

export default function GuestAuthModal({ isOpen, onClose, prefillEmail = '' }) {
  const { actionLoading, error, signInWithGoogle, signUpWithEmail, signInWithEmail } = useGuestAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ level: 'too-weak', message: '', color: '' });

  // Prefill email when modal opens and mode is signin
  useEffect(() => {
    if (isOpen && prefillEmail && mode === 'signin') {
      setEmail(prefillEmail);
    }
  }, [isOpen, prefillEmail, mode]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Evaluate password strength when password changes
  useEffect(() => {
    setPasswordStrength(getPasswordStrength(password));
  }, [password]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFirstName('');
    setLastName('');
    setNotice('');
    setMode('signin');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  if (!isOpen) return null;

  const handleGoogleContinue = async () => {
    setNotice('');
    try {
      await signInWithGoogle();
      onClose();
    } catch {
      // error handled by context
    }
  };

  const handleSignUp = async (event) => {
    event.preventDefault();
    setNotice('');

    if (password !== confirmPassword) {
      setNotice('Passwords do not match.');
      return;
    }

    // Reject weak passwords (too-weak or weak)
    if (passwordStrength.level === 'too-weak' || passwordStrength.level === 'weak') {
      setNotice(`Please choose a stronger password. Current: ${passwordStrength.message}`);
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setNotice('Please enter your first and last name.');
      return;
    }

    try {
      await signUpWithEmail(email, password, firstName.trim(), lastName.trim());
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
      setNotice('Verification email sent! Please check your inbox and verify your email before signing in.');
    } catch (err) {
      // error already in context
    }
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    setNotice('');

    if (!email || !password) {
      setNotice('Please enter both email and password.');
      return;
    }

    try {
      await signInWithEmail(email, password);
      onClose();
    } catch (err) {
      // error handled by context
    }
  };

  // Render the rest of the JSX exactly as before, but use passwordStrength.color and message
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-auth-title"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-[1.75rem] border border-white/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="guest-auth-title" className="text-2xl font-bold text-slate-950">
              {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guest account dialog"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <i className="fas fa-xmark text-sm"></i>
          </button>
        </div>

        <div className="px-6 py-6">
          <button
            type="button"
            onClick={handleGoogleContinue}
            disabled={actionLoading}
            className="flex h-14 w-full items-center justify-center gap-5 rounded-2xl bg-[#111111] px-5 text-[17px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all hover:bg-black hover:shadow-[0_14px_28px_rgba(0,0,0,0.22)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {actionLoading ? (
              <>
                <i className="fas fa-spinner fa-spin text-lg"></i>
                Connecting...
              </>
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setNotice('');
                  }}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setNotice('');
                    }}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="h-11 w-full rounded-full bg-[#2563EB] px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-70"
              >
                {actionLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Sign In
              </button>
              <p className="text-center text-sm text-slate-600">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setNotice('');
                  }}
                  className="font-semibold text-[#2563EB] hover:underline"
                >
                  Sign Up
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => {
                      setFirstName(event.target.value);
                      setNotice('');
                    }}
                    placeholder="John"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => {
                      setLastName(event.target.value);
                      setNotice('');
                    }}
                    placeholder="Doe"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setNotice('');
                  }}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setNotice('');
                    }}
                    placeholder="Must have uppercase, lowercase, number & special character"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                  </button>
                </div>
                {password && (
                  <div className="mt-1.5 text-xs">
                    <span className={`font-medium ${passwordStrength.color}`}>
                      {passwordStrength.message}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setNotice('');
                    }}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="h-11 w-full rounded-full bg-[#2563EB] px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-70"
              >
                {actionLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Sign Up
              </button>
              <p className="text-center text-sm text-slate-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setNotice('');
                  }}
                  className="font-semibold text-[#2563EB] hover:underline"
                >
                  Sign In
                </button>
              </p>
            </form>
          )}

          {(notice || error) && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${
              notice?.includes('Verification email') 
                ? 'border-green-200 bg-green-50 text-green-800' 
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <i className={`${
                notice?.includes('Verification email') ? 'fas fa-envelope' : 'fas fa-circle-info'
              } mr-2`}></i>
              {error || notice}
            </div>
          )}

          <p className="mt-5 text-xs leading-5 text-slate-500">
            By continuing, you agree to Sandyfeet using this account to identify your bookings and reservation updates.
          </p>
        </div>
      </div>
    </div>
  );
}