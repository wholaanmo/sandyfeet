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
        
        // Check if user is already logged in
        const checkAuth = async () => {
            const userType = localStorage.getItem('userType');
            const sessionToken = localStorage.getItem('sessionToken');
            const sessionExpiry = localStorage.getItem('sessionExpiry');
            
            if (userType && sessionToken && sessionExpiry) {
                const now = new Date().getTime();
                if (now < parseInt(sessionExpiry)) {
                    if (userType === 'admin') {
                        router.push('/dashboard/admin/overview');
                    } else {
                        router.push('/dashboard/staff/front-desk');
                    }
                } else {
                    localStorage.removeItem('userType');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('uid');
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('sessionExpiry');
                    localStorage.removeItem('rememberMe');
                }
            }
        };
        
        checkAuth();
        
        // Animation for login box
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
            <div className="min-h-screen w-full relative bg-gradient-to-br from-[var(--color-blue-white)] to-white flex items-center justify-center overflow-hidden">
                {/* Animated gradient orbs */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-ocean-light/20 blur-[100px] animate-floatOrb"></div>
                    <div className="absolute bottom-[-15%] left-[-10%] w-[550px] h-[550px] rounded-full bg-ocean-deep/15 blur-[100px] animate-floatOrb delay-2000"></div>
                    <div className="absolute top-1/3 right-1/4 w-[450px] h-[450px] rounded-full bg-ocean-lighter/15 blur-[90px] animate-floatOrb delay-4000"></div>
                    <div className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] rounded-full bg-neutral/10 blur-[80px] animate-floatOrb delay-6000"></div>
                </div>
                
                {/* Pattern overlay */}
                <div className="absolute inset-0 z-0 opacity-10" style={{
                    backgroundImage: `repeating-linear-gradient(45deg, rgba(43, 108, 108, 0.05) 0px, rgba(43, 108, 108, 0.05) 2px, transparent 2px, transparent 10px)`,
                    backgroundSize: '20px 20px'
                }}></div>

                {/* Main Container */}
                <div className="w-[840px] max-w-[90%] h-[540px] bg-white/95 backdrop-blur-sm rounded-[48px] flex overflow-hidden shadow-2xl border border-white/40 z-10">
                    
                    {/* Left Panel - Ocean Gradient */}
                    <div className="w-[45%] bg-gradient-to-br from-ocean-deep via-ocean-mid to-ocean-light p-6 flex items-center justify-center relative overflow-hidden rounded-r-[40px]">
                        <div className="absolute inset-0 bg-gradient-to-tr from-ocean-lighter/30 via-transparent to-ocean-pale/20 animate-gradientShift"></div>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 animate-shimmer"></div>
                        
                        <div className="text-center max-w-[260px] relative z-10">
                            {/* Logo Container */}
                            <div className="mb-4 flex justify-center relative">
                                <div className="w-[110px] h-[110px] rounded-full bg-gradient-to-br from-ocean-lighter via-ocean-light to-ocean-mid p-[3px] relative z-10 shadow-2xl ring-4 ring-white/30">
                                    <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-ocean-deep to-ocean-mid shadow-inner">
                                        <Image 
                                            src="/assets/Sea&RiverView.png" 
                                            alt="SandyFeet Reservation" 
                                            width={104}
                                            height={104}
                                            className="object-cover w-full h-full"
                                            priority
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Title */}
                            <div className="mb-2">
                                <h2 className="font-playfair text-2xl font-bold tracking-wide">
                                    <span className="bg-gradient-to-r from-white via-ocean-pale to-white bg-clip-text text-transparent drop-shadow-lg">
                                        SandyFeet
                                    </span>
                                    <br />
                                    <span className="text-white/90 text-lg font-medium tracking-wider">
                                        Reservation
                                    </span>
                                </h2>
                            </div>
                            
                            {/* Tagline */}
                            <p className="text-white/90 font-poppins text-xs mb-8 max-w-[240px] mx-auto italic">
                                Plan Your SandyFeet Escape with Ease
                            </p>
                            
                            {/* Features */}
                            <div className="flex justify-center gap-6">
                                {[
                                    { icon: 'fa-umbrella-beach', label: 'Rooms & Camping' },
                                    { icon: 'fa-sun', label: 'Day Tour' },
                                    { icon: 'fa-water', label: 'Beach Access' }
                                ].map((feature, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-1.5">
                                        <div className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-white/25 to-white/10 backdrop-blur-sm flex items-center justify-center border border-white/40 shadow-md">
                                            <i className={`fas ${feature.icon} text-white text-base drop-shadow`}></i>
                                        </div>
                                        <span className="text-white/80 text-[11px] font-medium">{feature.label}</span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Decorative Waves */}
                            <div className="absolute bottom-0 left-0 w-full h-[50px] overflow-hidden pointer-events-none">
                                <div className="absolute bottom-0 left-0 w-[200%] h-full bg-gradient-to-t from-white/20 via-white/10 to-transparent rounded-t-full animate-wave"></div>
                                <div className="absolute -bottom-2 left-0 w-[200%] h-full bg-gradient-to-t from-white/10 via-transparent to-transparent rounded-t-full animate-wave-reverse"></div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Right Panel */}
                    <div className="w-[55%] p-8 flex items-center justify-center bg-gradient-to-br from-white via-white to-blue-white overflow-y-auto no-scrollbar">
                        <div className="w-full max-w-[300px] login-box">
                            {/* Header */}
                            <div className="text-center mb-6">
                                <h1 className="font-playfair text-2xl font-bold bg-gradient-to-r from-ocean-deep to-ocean-light bg-clip-text text-transparent mb-1">Welcome Back</h1>
                                <p className="font-poppins text-xs text-ocean-mid/80">Sign in to your account</p>
                            </div>
                            
                            {/* Error Message */}
                            {error && (
                                <div className="bg-gradient-to-r from-red-50 to-red-100/50 rounded-xl p-3 mb-4 flex items-start gap-2 shadow-sm border-l-4 border-red-500">
                                    <i className="fas fa-exclamation-circle text-red-500 text-sm mt-0.5"></i>
                                    <div className="flex-1">
                                        <span className="text-red-600 text-xs font-poppins">{error}</span>
                                        {showResendOption && (
                                            <button
                                                onClick={handleResendVerification}
                                                disabled={resendLoading}
                                                className="block mt-2 text-xs text-ocean-light font-medium hover:text-ocean-mid underline"
                                            >
                                                {resendLoading ? 'Sending...' : 'Resend verification email'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            {/* Login Form */}
                            <form onSubmit={loginUser}>
                                {/* Email Field */}
                                <div className="mb-3">
                                    <div className="relative group">
                                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ocean-light/50 group-focus-within:text-ocean-light transition-colors duration-300">
                                            <i className="fas fa-envelope text-sm"></i>
                                        </div>
                                        <input 
                                            type="email" 
                                            placeholder="Email address" 
                                            required 
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            disabled={loading}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gradient-to-r from-ocean-ice/50 to-white border border-ocean-light/20 rounded-xl text-ocean-deep font-poppins text-sm placeholder:text-ocean-light/40 focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/30 transition-all duration-300 shadow-sm"
                                        />
                                    </div>
                                </div>
                                
                                {/* Password Field */}
                                <div className="mb-4">
                                    <div className="relative group">
                                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ocean-light/50 group-focus-within:text-ocean-light transition-colors duration-300">
                                            <i className="fas fa-lock text-sm"></i>
                                        </div>
                                        <input 
                                            type={showPassword ? 'text' : 'password'} 
                                            placeholder="Password" 
                                            required 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            disabled={loading}
                                            className="w-full pl-9 pr-10 py-2.5 bg-gradient-to-r from-ocean-ice/50 to-white border border-ocean-light/20 rounded-xl text-ocean-deep font-poppins text-sm placeholder:text-ocean-light/40 focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/30 transition-all duration-300 shadow-sm"
                                        />
                                        <button 
                                            type="button"
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-ocean-light/50 hover:text-ocean-light transition-colors"
                                            onClick={togglePassword}
                                        >
                                            <i className={`fas ${showPassword ? 'fa-eye' : 'fa-eye-slash'} text-sm`}></i>
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Remember Me and Forgot Password */}
                                <div className="flex items-center justify-between mb-5">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="w-3.5 h-3.5 accent-ocean-light rounded cursor-pointer"
                                        />
                                        <span className="text-xs text-ocean-mid/70 group-hover:text-ocean-light transition-colors">Remember me</span>
                                    </label>
                                    <a 
                                        href="#" 
                                        className="text-xs text-ocean-light font-medium hover:text-ocean-deep transition-all duration-300 hover:underline underline-offset-2"
                                        onClick={handleForgotPassword}
                                    >
                                        Forgot password?
                                    </a>
                                </div>
                                
                                {/* Sign In Button */}
                                <button 
                                    type="submit" 
                                    className="w-full py-2.5 bg-gradient-to-r from-ocean-mid via-ocean-light to-ocean-lighter bg-[length:200%_auto] text-white font-poppins font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group relative overflow-hidden"
                                    disabled={loading}
                                >
                                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
                                    {loading ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin"></i> Signing in...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-arrow-right-to-bracket text-sm"></i> Sign In
                                        </>
                                    )}
                                </button>
                            </form>
                            
                            {/* Footer */}
                            <div className="text-center mt-6 pt-4 border-t border-ocean-light/10">
                                <p className="text-xs text-ocean-light/50 flex items-center justify-center gap-1">
                                    <i className="fas fa-umbrella-beach text-[10px]"></i> © 2026 SandyFeet Reservation
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Forgot Password Modal */}
            {showForgotModal && (
                <div className="fixed inset-0 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fadeIn" onClick={() => setShowForgotModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-slideUp border border-white/20" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-ocean-deep via-ocean-mid to-ocean-light p-5 rounded-t-2xl flex items-center justify-between relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent"></div>
                            <h3 className="font-playfair text-xl font-semibold text-white relative z-10">
                                <i className="fas fa-key mr-2"></i> Reset Password
                            </h3>
                            <button 
                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all duration-300 flex items-center justify-center backdrop-blur-sm"
                                onClick={() => setShowForgotModal(false)}
                            >
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <p className="text-ocean-mid text-sm mb-5 flex items-start gap-2">
                                <i className="fas fa-envelope-open-text text-ocean-lighter mt-0.5"></i>
                                Enter your email address and we'll send you a link to reset your password.
                            </p>
                            
                            {resetMessage && (
                                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-400 rounded-lg p-3 mb-4 flex items-center gap-2">
                                    <i className="fas fa-check-circle text-green-500 text-sm"></i>
                                    <span className="text-green-700 text-xs">{resetMessage}</span>
                                </div>
                            )}
                            
                            {resetError && (
                                <div className="bg-gradient-to-r from-red-50 to-rose-50 border-l-4 border-red-400 rounded-lg p-3 mb-4 flex items-center gap-2">
                                    <i className="fas fa-exclamation-circle text-red-500 text-sm"></i>
                                    <span className="text-red-600 text-xs">{resetError}</span>
                                </div>
                            )}
                            
                            <form onSubmit={handleResetPassword}>
                                <div className="relative mb-5 group">
                                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ocean-light/50 group-focus-within:text-ocean-light transition-colors">
                                        <i className="fas fa-envelope text-sm"></i>
                                    </div>
                                    <input
                                        type="email"
                                        placeholder="Your email address"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        disabled={resetLoading || resetMessage}
                                        className="w-full pl-9 pr-3 py-3 bg-gradient-to-r from-ocean-ice/50 to-white border border-ocean-light/20 rounded-xl text-ocean-deep font-poppins text-sm placeholder:text-ocean-light/40 focus:outline-none focus:border-ocean-light focus:ring-2 focus:ring-ocean-light/20 transition-all duration-300"
                                    />
                                </div>
                                
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        className="flex-1 py-2 rounded-xl border-2 border-ocean-light/30 text-ocean-mid font-poppins text-sm hover:bg-ocean-light/10 hover:border-ocean-light/50 transition-all duration-300"
                                        onClick={() => setShowForgotModal(false)}
                                        disabled={resetLoading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-ocean-mid to-ocean-light text-white font-poppins text-sm font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
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
                @keyframes pulse-glow {
                    0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
                    50% { opacity: 0.9; transform: translate(-50%, -50%) scale(1.12); }
                }
                .animate-pulse-glow {
                    animation: pulse-glow 4s infinite ease-in-out;
                }
                @keyframes gradientShift {
                    0%, 100% { opacity: 0.4; background-position: 0% 50%; }
                    50% { opacity: 0.7; background-position: 100% 50%; }
                }
                .animate-gradientShift {
                    animation: gradientShift 3s ease infinite;
                    background-size: 200% auto;
                }
                @keyframes wave {
                    0% { transform: translateX(-30%) scaleX(1.2); }
                    100% { transform: translateX(10%) scaleX(1.2); }
                }
                .animate-wave {
                    animation: wave 18s infinite linear;
                }
                .animate-wave-reverse {
                    animation: wave 22s infinite linear reverse;
                }
                @keyframes fadeIn {
                    from { opacity: 0; backdrop-filter: blur(0px); }
                    to { opacity: 1; backdrop-filter: blur(4px); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease forwards;
                }
                @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; filter: blur(2px); }
                    to { transform: translateY(0); opacity: 1; filter: blur(0); }
                }
                .animate-slideUp {
                    animation: slideUp 0.3s ease;
                }
                @keyframes floatOrb {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    50% { transform: translate(30px, -20px) scale(1.05); }
                }
                .animate-floatOrb {
                    animation: floatOrb 12s infinite ease-in-out;
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%) skewX(-12deg); }
                    100% { transform: translateX(200%) skewX(-12deg); }
                }
                .animate-shimmer {
                    animation: shimmer 8s infinite;
                }
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                .delay-2000 {
                    animation-delay: 2s;
                }
                .delay-4000 {
                    animation-delay: 4s;
                }
                .delay-6000 {
                    animation-delay: 6s;
                }
            `}</style>
        </>
    );
}