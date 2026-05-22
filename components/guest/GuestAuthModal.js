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
  
  // Terms & Conditions state
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  
  // Forgot Password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

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
      setShowForgotModal(false);
      setForgotEmail('');
      setForgotMessage('');
      setForgotError('');
    }
  }, [isOpen]);

  // Reset terms when switching to signin mode
  useEffect(() => {
    if (mode === 'signin') {
      setTermsAccepted(false);
    }
  }, [mode]);

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
    setTermsAccepted(false);
  };

  if (!isOpen) return null;

  const handleGoogleContinue = async () => {
    setNotice('');
    
    // Enforce Terms & Conditions when in signup mode
    if (mode === 'signup' && !termsAccepted) {
      setNotice('You must agree to the Terms and Conditions to create an account.');
      return;
    }
    
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
    
    // Terms & Conditions validation
    if (!termsAccepted) {
      setNotice('You must agree to the Terms and Conditions to create an account.');
      return;
    }

    try {
      await signUpWithEmail(email, password, firstName.trim(), lastName.trim());
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
      setNotice('Verification email sent! Please check your inbox and verify your email before signing in.');
      setTermsAccepted(false); // reset after successful signup
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

  // Forgot Password handlers
  const handleForgotPasswordOpen = () => {
    setForgotEmail(email); // prefill with current email if any
    setForgotMessage('');
    setForgotError('');
    setShowForgotModal(true);
  };

  const handleForgotPasswordClose = () => {
    setShowForgotModal(false);
    setForgotEmail('');
    setForgotMessage('');
    setForgotError('');
  };

  const handleSendResetEmail = async (e) => {
    e.preventDefault();
    if (!forgotEmail) {
      setForgotError('Please enter your email address.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(forgotEmail)) {
      setForgotError('Please enter a valid email address.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    try {
      const response = await fetch('/api/auth/guest-forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset email.');
      }
      setForgotMessage('Password reset email sent! Please check your inbox.');
      setTimeout(() => {
        handleForgotPasswordClose();
      }, 3000);
    } catch (err) {
      setForgotError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Accept button handler for T&C modal
  const handleAcceptTerms = () => {
    setTermsAccepted(true);
    setShowTermsModal(false);
  };

  return (
    <>
      {/* Main Auth Modal */}
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[5px] transition-all duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-auth-title"
        onMouseDown={onClose}
      >
        <div
          className="w-full max-w-[430px] max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-slate-100/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] transition-all duration-300"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {/* Header Section */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white/0 px-6 py-4.5 flex-none">
            <div>
              <h2 id="guest-auth-title" className="text-xl font-bold tracking-tight text-slate-900">
                {mode === 'signin' ? 'Sign in to account' : 'Create an account'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 font-medium">
                {mode === 'signin' ? 'Welcome back to Sandyfeet!' : 'Join the Sandyfeet family'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close guest account dialog"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-all hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50 active:scale-95 shadow-sm"
            >
              <i className="fas fa-xmark text-sm"></i>
            </button>
          </div>

          {/* Body Section */}
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin scrollbar-thumb-slate-200">
            <button
              type="button"
              onClick={handleGoogleContinue}
              disabled={actionLoading}
              className="group relative flex h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#111111] via-[#1a1a1a] to-[#0d0d0d] px-4 text-[14px] font-semibold text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-[2px] hover:border-white/20 hover:shadow-[0_10px_30px_rgba(0,0,0,0.45)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="relative flex items-center gap-3">
                {actionLoading ? (
                  <>
                    <i className="fas fa-spinner fa-spin text-sm text-gray-300"></i>
                    <span className="tracking-wide">Connecting...</span>
                  </>
                ) : (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
                      <GoogleMark />
                    </div>
                    <span className="tracking-wide">Continue with Google</span>
                  </>
                )}
              </div>
            </button>

            <div className="my-4.5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">or use email</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                      <i className="fas fa-envelope text-xs"></i>
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setNotice('');
                      }}
                      placeholder="you@example.com"
                      className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                      <i className="fas fa-lock text-xs"></i>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setNotice('');
                      }}
                      placeholder="••••••••"
                      className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPasswordOpen}
                    className="text-xs font-semibold text-[#2563EB] hover:text-blue-700 hover:underline transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-11 w-full rounded-xl bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 active:scale-[0.99] transition-all hover:shadow-[0_4px_12px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Sign In
                </button>
                <p className="text-center text-sm text-slate-500">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setNotice('');
                      setTermsAccepted(false);
                    }}
                    className="font-semibold text-[#2563EB] hover:text-blue-700 hover:underline focus:outline-none"
                  >
                    Sign Up
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      First name
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                        <i className="fas fa-user text-xs"></i>
                      </span>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(event) => {
                          setFirstName(event.target.value);
                          setNotice('');
                        }}
                        placeholder="John"
                        className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Last name
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                        <i className="fas fa-user text-xs"></i>
                      </span>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(event) => {
                          setLastName(event.target.value);
                          setNotice('');
                        }}
                        placeholder="Doe"
                        className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                      <i className="fas fa-envelope text-xs"></i>
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setNotice('');
                      }}
                      placeholder="you@example.com"
                      className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                      <i className="fas fa-lock text-xs"></i>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setNotice('');
                      }}
                      placeholder="Must have A-Z, a-z, 0-9, special"
                      className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                    </button>
                  </div>
                  {password && (
                    <div className="mt-1 flex justify-between items-center text-[10.5px] font-bold uppercase tracking-wider select-none">
                      <span className="text-slate-400">Password Strength</span>
                      <span className={`${passwordStrength.color} transition-colors duration-200`}>{passwordStrength.message}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Confirm password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                      <i className="fas fa-lock text-xs"></i>
                    </span>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setNotice('');
                      }}
                      placeholder="••••••••"
                      className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                    </button>
                  </div>
                </div>
                
                {/* Terms & Conditions Checkbox */}
                <div className="flex items-start gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="termsCheckbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      setNotice('');
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-2 focus:ring-blue-100 transition-colors cursor-pointer"
                  />
                  <label htmlFor="termsCheckbox" className="text-xs text-slate-500 leading-normal select-none cursor-pointer">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="font-semibold text-[#2563EB] hover:text-blue-700 hover:underline focus:outline-none"
                    >
                      Terms and Conditions
                    </button>
                  </label>
                </div>
                
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-11 w-full rounded-xl bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 active:scale-[0.99] transition-all hover:shadow-[0_4px_12px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Sign Up
                </button>
                <p className="text-center text-sm text-slate-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setNotice('');
                      setTermsAccepted(false);
                    }}
                    className="font-semibold text-[#2563EB] hover:text-blue-700 hover:underline focus:outline-none"
                  >
                    Sign In
                  </button>
                </p>
              </form>
            )}

            {(notice || error) && (
              <div className={`mt-3.5 rounded-xl border px-4 py-3 text-xs leading-5 transition-all ${
                notice?.includes('Verification email') 
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800' 
                  : 'border-amber-100 bg-amber-50 text-amber-800'
              }`}>
                <i className={`${
                  notice?.includes('Verification email') ? 'fas fa-envelope-open-text' : 'fas fa-circle-exclamation'
                } mr-2 text-sm`}></i>
                {error || notice}
              </div>
            )}

            <p className="mt-4.5 text-center text-[10.5px] leading-relaxed text-slate-400">
              By continuing, you agree to Sandyfeet using this account to identify your bookings and reservation updates.
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[5px] transition-all duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-password-title"
          onMouseDown={handleForgotPasswordClose}
        >
          <div
            className="w-full max-w-[430px] max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-slate-100/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] transition-all duration-300"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white/0 px-6 py-4.5 flex-none">
              <div>
                <h2 id="forgot-password-title" className="text-xl font-bold tracking-tight text-slate-900">
                  Reset Password
                </h2>
                <p className="mt-0.5 text-xs text-slate-400 font-medium">
                  We'll send you a link to reset your password
                </p>
              </div>
              <button
                type="button"
                onClick={handleForgotPasswordClose}
                aria-label="Close forgot password dialog"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-all hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50 active:scale-95 shadow-sm"
              >
                <i className="fas fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin scrollbar-thumb-slate-200">
              <form onSubmit={handleSendResetEmail} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400/85">
                      <i className="fas fa-envelope text-xs"></i>
                    </span>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-10.5 w-full rounded-xl border border-slate-200/80 bg-slate-50/40 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-50/60 focus:bg-white focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100/50"
                      required
                    />
                  </div>
                </div>

                {forgotError && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <i className="fas fa-circle-exclamation mr-2 text-sm"></i>
                    {forgotError}
                  </div>
                )}
                {forgotMessage && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                    <i className="fas fa-envelope-open-text mr-2 text-sm"></i>
                    {forgotMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="h-11 w-full rounded-xl bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 active:scale-[0.99] transition-all hover:shadow-[0_4px_12px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forgotLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Send Reset Email
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[5px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-modal-title"
          onMouseDown={() => setShowTermsModal(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Pinned Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex-none">
              <div>
                <h3 id="terms-modal-title" className="text-lg font-bold tracking-tight text-slate-900">
                  Terms and Conditions
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">Last updated: May 2026</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm active:scale-95"
                aria-label="Close"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm text-slate-600 leading-relaxed scrollbar-thin scrollbar-thumb-slate-200">
              <p className="font-semibold text-slate-800">
                By creating an account on this resort reservation system, you agree to the following Terms and Conditions. Please read them carefully before signing up.
              </p>
              
              <div className="space-y-3.5">
                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">1</span>
                    Account Registration
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Guests must provide accurate, complete, and updated personal information during registration.</li>
                    <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">2</span>
                    Valid Identification
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Guests are required to upload or present a valid government-issued ID for identity verification and reservation confirmation.</li>
                    <li>Providing fake or misleading information may result in suspension or cancellation of reservations.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">3</span>
                    Reservation Responsibilities
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>All reservations made through your account are considered authorized by you.</li>
                    <li>Guests are responsible for reviewing reservation details before confirming bookings.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">4</span>
                    Payments and Fees
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Certain reservations require a down payment before confirmation.</li>
                    <li>Additional charges for damages, extra guests, or policy violations may apply.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">5</span>
                    Cancellation and Modification
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Down payments are non-refundable once a reservation is cancelled. However, the reservation may still be eligible for rescheduling, subject to resort approval and availability.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">6</span>
                    Guest Conduct
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Guests must behave respectfully toward resort staff, other guests, and resort property.</li>
                    <li>Illegal activities, vandalism, harassment, excessive noise, and disruptive behavior are strictly prohibited.</li>
                    <li>The resort may remove or ban guests who violate resort rules without refund.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">7</span>
                    Privacy and Data Protection
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Personal information collected during registration and booking will only be used for reservation processing, communication, verification, and system security.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">8</span>
                    System Usage
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>Users must not attempt to misuse, hack, disrupt, or gain unauthorized access to the system.</li>
                    <li>Automated bookings, fake reservations, and fraudulent transactions are prohibited.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">9</span>
                    Limitation of Liability
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>The resort is not responsible for losses caused by incorrect information submitted by guests, internet interruptions, or unforeseen events beyond reasonable control.</li>
                    <li>Guests are responsible for their personal belongings during their stay.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">10</span>
                    Account Suspension or Termination
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>The resort reserves the right to suspend or permanently terminate accounts that violate these Terms and Conditions or engage in fraudulent activities.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">11</span>
                    Changes to Terms and Conditions
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                    <li>The resort may update these Terms and Conditions at any time without prior notice.</li>
                    <li>Continued use of the system after updates means you accept the revised Terms and Conditions.</li>
                  </ul>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-1.5 text-sm flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">12</span>
                    Agreement
                  </h4>
                  <p className="text-slate-600 text-xs sm:text-sm pl-2">
                    By creating an account, you confirm that you have read, understood, and agreed to follow these Terms and Conditions.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Pinned Action Footer */}
            <div className="border-t border-slate-100 px-6 py-3.5 bg-slate-50/50 flex justify-end flex-none">
              <button
                type="button"
                onClick={handleAcceptTerms}
                className="rounded-xl bg-[#2563EB] px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-all hover:shadow-[0_4px_12px_rgba(37,99,235,0.2)] active:scale-[0.98]"
              >
                Accept & Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}