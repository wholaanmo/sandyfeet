// app/login/page.js
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isClient, setIsClient] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [showResendOption, setShowResendOption] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');
    
    // Forgot password modal states
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState('');
    const [resetError, setResetError] = useState('');
    
    const router = useRouter();

    // Check for existing session on mount
useEffect(() => {
    setIsClient(true);

    // 1. Check existing session
    const checkAuth = async () => {
        const userType = localStorage.getItem('userType');
        const sessionToken = localStorage.getItem('sessionToken');
        const sessionExpiry = localStorage.getItem('sessionExpiry');

        if (userType && sessionToken && sessionExpiry) {
            const now = Date.now();
            if (now < parseInt(sessionExpiry)) {
                router.push(userType === 'admin' ? '/dashboard/admin/overview' : '/dashboard/staff/overview');
            } else {
                // Clear expired data
                localStorage.removeItem('userType');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('uid');
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('sessionExpiry');
                localStorage.removeItem('rememberMe');
                document.cookie = 'sessionToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
                document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
                document.cookie = 'sessionExpiry=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
            }
        }
    };
    checkAuth();

    // 2. Animation for login box
    const loginBox = document.querySelector('.login-box');
    if (loginBox) {
        loginBox.style.transform = 'translateY(20px)';
        loginBox.style.opacity = '0';
        setTimeout(() => {
            loginBox.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
            loginBox.style.transform = 'translateY(0)';
            loginBox.style.opacity = '1';
        }, 100);
    }
}, [router]);

    const togglePassword = () => {
        setShowPassword(!showPassword);
    };

    const generateSessionToken = () => {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15) + 
               Date.now().toString(36);
    };

    const handleResendVerification = async () => {
        setResendLoading(true);
        try {
            // Sign in temporarily to get user object
            const userCredential = await signInWithEmailAndPassword(auth, pendingEmail, password);
            const user = userCredential.user;
            
            // Check if already verified
            await user.reload();
            if (user.emailVerified) {
                // If verified, update Firestore and proceed with login
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    emailVerified: true,
                    status: 'active'
                });
                
                // Proceed with login
                await completeLogin(user.uid);
                return;
            }
            
            // Send new verification email
            await sendEmailVerification(user);
            
            // Update expiration in Firestore
            const newExpiration = new Date();
            newExpiration.setMinutes(newExpiration.getMinutes() + 15);
            
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                verificationExpiresAt: newExpiration.toISOString()
            });
            
            setError('New verification email sent! Please check your inbox. Link expires in 15 minutes.');
            setShowResendOption(false);
            
            // Sign out after resending
            await auth.signOut();
            
        } catch (error) {
            console.error('Error resending verification:', error);
            setError('Unable to resend verification. Please try again later.');
        } finally {
            setResendLoading(false);
        }
    };
    
const completeLogin = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = userDoc.data();
    const role = userData.role;
    const status = userData.status;
    
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date().getTime() + (24 * 60 * 60 * 1000); // 24 hours
    
    // Store in localStorage (for client-side checks)
    localStorage.setItem('userType', role);
    localStorage.setItem('userEmail', userData.email);
    localStorage.setItem('uid', uid);
    localStorage.setItem('sessionToken', sessionToken);
    localStorage.setItem('sessionExpiry', sessionExpiry.toString());
    
    if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
    }
    
    // Also set cookies for middleware (httponly-equivalent via document.cookie)
    // These will be sent with every request
    document.cookie = `sessionToken=${sessionToken}; path=/; max-age=86400; SameSite=Lax`;
    document.cookie = `userType=${role}; path=/; max-age=86400; SameSite=Lax`;
    document.cookie = `sessionExpiry=${sessionExpiry}; path=/; max-age=86400; SameSite=Lax`;
    
    if (role === 'admin') {
        router.push('/dashboard/admin/overview');
    } else if (role === 'staff') {
        router.push('/dashboard/staff/overview');
    }
};

const loginUser = async (e) => {
    e.preventDefault();
    setError('');
    setShowResendOption(false);
    
    if (!email || !password) {
        setError('Email and password are required.');
        return;
    }

    setLoading(true);

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const uid = user.uid;

        const userDoc = await getDoc(doc(db, "users", uid));

        if (!userDoc.exists()) {
            setError('Your account is not approved. Contact the system administrator.');
            await auth.signOut();
            setLoading(false);
            return;
        }

        const userData = userDoc.data();
        const role = userData.role;
        const status = userData.status;
        
        // Check if email is verified in Firebase Auth
        await user.reload();
        const isEmailVerified = user.emailVerified;
        
        // Update Firestore if verification status changed
        if (isEmailVerified && !userData.emailVerified) {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                emailVerified: true,
                status: 'active'
            });
            userData.emailVerified = true;
            userData.status = 'active';
        }
        
        // For ALL users (admin and staff), require email verification
        if (!userData.emailVerified) {
            // Check if verification link expired
            const expirationTime = userData.verificationExpiresAt ? new Date(userData.verificationExpiresAt) : null;
            const now = new Date();
            const isExpired = expirationTime && now > expirationTime;
            
            setPendingEmail(email);
            
            if (isExpired) {
                setError('Your verification link has expired. Please request a new verification email.');
                setShowResendOption(true);
            } else {
                setError('Please verify your email address before logging in. Check your inbox for the verification link.');
                setShowResendOption(true);
            }
            await auth.signOut();
            setLoading(false);
            return;
        }

        if (status === 'inactive') {
            setError('This account has been deactivated by the admin.');
            await auth.signOut();
            setLoading(false);
            return;
        }
        
        await completeLogin(uid);
        
    } catch (err) {
        console.error("Login Error:", err);
        
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            setError('Invalid email or password. Please try again.');
        } else if (err.code === 'auth/invalid-email') {
            setError('Invalid email format.');
        } else if (err.code === 'auth/too-many-requests') {
            setError('Too many failed attempts. Try again later.');
        } else if (err.code === 'auth/network-request-failed') {
            setError('Network error. Please check your connection.');
        } else {
            setError('Invalid email or password. Please try again.');
        }
    } finally {
        setLoading(false);
    }
};
    
    const handleForgotPassword = (e) => {
        e.preventDefault();
        setShowForgotModal(true);
        setResetEmail(email);
        setResetMessage('');
        setResetError('');
    };
    
 const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!resetEmail) {
        setResetError('Please enter your email address.');
        return;
    }
    
    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    
    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail })
        });
        const data = await response.json();
        
        if (response.ok) {
            setResetMessage(data.message || 'Password reset email sent! Check your inbox.');
            setTimeout(() => {
                setShowForgotModal(false);
                setResetMessage('');
                setResetEmail('');
            }, 3000);
        } else {
            setResetError(data.error || 'Failed to send reset email. Please try again.');
        }
    } catch (error) {
        console.error('Reset password error:', error);
        setResetError('An error occurred. Please try again.');
    } finally {
        setResetLoading(false);
    }
};

    if (!isClient) {
        return null;
    }

    return (
        <>
            <div className="min-h-screen w-full bg-[#f6f8fc] px-6 py-12 flex items-center justify-center">
                <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white px-8 py-10 shadow-[0_20px_60px_rgba(15,35,70,0.12)]">
                    <div className="login-box">
                        <div className="mb-8 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-ocean-ice/70 ring-1 ring-ocean-light/20">
                                <Image
                                    src="/SandyFeet_logo2.png"
                                    alt="SandyFeet"
                                    width={56}
                                    height={56}
                                    className="h-12 w-12 object-contain"
                                    priority
                                />
                            </div>
                            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-ocean-light/70">SandyFeet</p>
                            <h1 className="mt-2 font-playfair text-3xl text-ocean-deep">Sign in</h1>
                            <p className="mt-2 text-sm text-ocean-mid/70">Access your dashboard</p>
                        </div>

                        {error && (
                            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50/80 p-3 text-xs text-red-600 shadow-sm">
                                <div className="flex items-start gap-2">
                                    <i className="fas fa-exclamation-circle text-red-500 text-sm mt-0.5"></i>
                                    <div className="flex-1">
                                        <p className="text-xs font-poppins">{error}</p>
                                        {showResendOption && (
                                            <button
                                                onClick={handleResendVerification}
                                                disabled={resendLoading}
                                                className="mt-2 text-xs text-ocean-deep underline hover:text-ocean-mid"
                                            >
                                                {resendLoading ? 'Sending...' : 'Resend verification email'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={loginUser}>
                            <div className="mb-4">
                                <label className="text-xs font-medium text-ocean-mid/70">Email address</label>
                                <div className="relative mt-2">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ocean-light/50">
                                        <i className="fas fa-envelope text-sm"></i>
                                    </div>
                                    <input
                                        type="email"
                                        placeholder="name@company.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={loading}
                                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-ocean-deep placeholder:text-ocean-light/50 shadow-sm focus:border-ocean-light focus:outline-none focus:ring-2 focus:ring-ocean-light/20"
                                    />
                                </div>
                            </div>

                            <div className="mb-5">
                                <label className="text-xs font-medium text-ocean-mid/70">Password</label>
                                <div className="relative mt-2">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ocean-light/50">
                                        <i className="fas fa-lock text-sm"></i>
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={loading}
                                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-sm text-ocean-deep placeholder:text-ocean-light/50 shadow-sm focus:border-ocean-light focus:outline-none focus:ring-2 focus:ring-ocean-light/20"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-ocean-light/60 hover:text-ocean-deep"
                                        onClick={togglePassword}
                                    >
                                        <i className={`fas ${showPassword ? 'fa-eye' : 'fa-eye-slash'} text-sm`}></i>
                                    </button>
                                </div>
                            </div>

                            <div className="mb-6 flex items-center justify-between">
                                <label className="flex items-center gap-2 text-xs text-ocean-mid/70">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="h-3.5 w-3.5 accent-ocean-mid"
                                    />
                                    Remember me
                                </label>
                                <button
                                    type="button"
                                    className="text-xs font-medium text-ocean-deep hover:text-ocean-mid"
                                    onClick={handleForgotPassword}
                                >
                                    Forgot password?
                                </button>
                            </div>

                            <button
                                type="submit"
                                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ocean-mid py-3 text-sm font-semibold text-white shadow-md transition hover:bg-ocean-light disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i> Signing in...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-arrow-right-to-bracket text-sm"></i> Sign in
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-6 text-center text-xs text-ocean-mid/60">
                            © 2026 SandyFeet
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Forgot Password Modal */}
            {showForgotModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn" onClick={() => setShowForgotModal(false)}>
                    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-slideUp" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-[linear-gradient(135deg,#174FCC_0%,#2169F3_50%,#7AAAF8_100%)] p-5 text-white">
                            <div className="flex items-center justify-between">
                                <h3 className="font-playfair text-xl font-semibold">
                                    <i className="fas fa-key mr-2"></i> Reset Password
                                </h3>
                                <button
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                                    onClick={() => setShowForgotModal(false)}
                                >
                                    <i className="fas fa-times text-sm"></i>
                                </button>
                            </div>
                            <p className="mt-2 text-xs text-white/80">
                                We will send a reset link to your email address.
                            </p>
                        </div>

                        <div className="p-6">
                            {resetMessage && (
                                <div className="mb-4 rounded-2xl border border-green-100 bg-green-50/80 p-3 text-xs text-green-700">
                                    <i className="fas fa-check-circle mr-2 text-green-500"></i>
                                    {resetMessage}
                                </div>
                            )}

                            {resetError && (
                                <div className="mb-4 rounded-2xl border border-red-100 bg-red-50/80 p-3 text-xs text-red-600">
                                    <i className="fas fa-exclamation-circle mr-2 text-red-500"></i>
                                    {resetError}
                                </div>
                            )}

                            <form onSubmit={handleResetPassword}>
                                <label className="text-xs font-medium text-ocean-mid/70">Email address</label>
                                <div className="relative mt-2 mb-6">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ocean-light/50">
                                        <i className="fas fa-envelope text-sm"></i>
                                    </div>
                                    <input
                                        type="email"
                                        placeholder="name@company.com"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        disabled={resetLoading || resetMessage}
                                        className="w-full rounded-2xl border border-ocean-light/20 bg-white/90 py-3 pl-11 pr-4 text-sm text-ocean-deep placeholder:text-ocean-light/50 shadow-sm focus:border-ocean-light focus:outline-none focus:ring-2 focus:ring-ocean-light/20"
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        className="flex-1 rounded-2xl border border-ocean-light/30 py-2 text-sm font-medium text-ocean-mid transition hover:border-ocean-light/60 hover:bg-ocean-ice/60"
                                        onClick={() => setShowForgotModal(false)}
                                        disabled={resetLoading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 rounded-2xl bg-ocean-mid py-2 text-sm font-semibold text-white shadow-md transition hover:bg-ocean-light disabled:opacity-60"
                                        disabled={resetLoading || resetMessage}
                                    >
                                        {resetLoading ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin mr-2"></i> Sending...
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-paper-plane mr-2"></i> Send Reset Link
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease forwards;
                }
                @keyframes slideUp {
                    from { transform: translateY(24px) scale(0.98); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                }
                .animate-slideUp {
                    animation: slideUp 0.3s ease;
                }
                @media (prefers-reduced-motion: reduce) {
                    .animate-fadeIn,
                    .animate-slideUp {
                        animation: none;
                    }
                }
            `}</style>
        </>
    );
}