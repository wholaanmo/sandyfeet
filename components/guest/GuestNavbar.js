// components/guest/GuestNavbar.js
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import GuestAuthModal from './GuestAuthModal';
import { useGuestAuth } from './GuestAuthContext';

export default function GuestNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState('');
  const dropdownRef = useRef(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, loading, logout } = useGuestAuth();

  // Handle email verification redirect
  useEffect(() => {
    const verify = searchParams?.get('verify');
    const email = searchParams?.get('email');
    if (verify === 'success' && email) {
      setPrefillEmail(decodeURIComponent(email));
      setIsAuthOpen(true);
      // Clean URL after opening modal (optional)
      const url = new URL(window.location.href);
      url.searchParams.delete('verify');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  const navLinks = [
    { href: '/', label: 'HOME' },
    { href: '/rooms', label: 'ROOMS' },
    { href: '/day-tour', label: 'DAYTOUR' },
  ];

  const isActive = (path) => {
    if (!pathname) return false;
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMenuOpen(false);
      }
    };

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsAccountDropdownOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const openAuthModal = () => {
    setPrefillEmail(''); // clear any leftover prefill when manually opened
    setIsAuthOpen(true);
    setIsMenuOpen(false);
  };

  const displayName = profile?.displayName || user?.displayName || 'Guest';
  const avatarLetter = (displayName || user?.email || 'G').charAt(0).toUpperCase();

  return (
    <>
    <div id="guest-navbar" className="fixed top-0 left-0 right-0 z-50 mt-3 px-3 sm:mt-6 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl">
        <nav className="rounded-[2rem] border border-gray-100/50 bg-white/95 px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-md sm:rounded-[2.5rem] sm:px-6 sm:py-3.5 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" onClick={() => setIsMenuOpen(false)} className="flex min-w-0 items-center gap-3 group">
              <div className="relative h-11 w-11 flex-none sm:h-12 sm:w-12">
                <Image
                  src="/SandyFeet_logo2.png"
                  alt="SandyFeet Logo"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="min-w-0">
                <span className="block truncate font-playfair text-[20px] leading-none font-bold text-[#143B36] sm:text-[22px]">
                  Sandyfeet
                </span>
                <span className="block truncate text-[8px] font-medium tracking-[0.18em] text-gray-400 sm:text-[9px] sm:tracking-[0.2em]">
                  LIWLIWA CAMP
                </span>
              </div>
            </Link>

            <div className="hidden items-center gap-6 md:flex lg:gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`relative group text-[13px] font-bold tracking-wider transition-colors ${
                    isActive(link.href) ? 'text-[#3B82F6]' : 'text-gray-500 hover:text-[#3B82F6]'
                  }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <span className="absolute -bottom-3.5 left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[#F5A623]" />
                  )}
                </Link>
              ))}
            </div>

            <div className="hidden items-center gap-3 md:flex">
              {user ? (
                <div className="flex items-center gap-2">

                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white p-1 pr-4 text-[14px] font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus:outline-none"
                  >
                    {user.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt={displayName}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-xs font-bold text-white">
                        {avatarLetter}
                      </span>
                    )}
                    <span className="max-w-[100px] truncate">{displayName}</span>
                    <i className={`fas fa-chevron-down text-[10px] text-slate-400 transition-transform ${isAccountDropdownOpen ? 'rotate-180' : ''}`}></i>
                  </button>

                  {/* Expedia-style Dropdown */}
                  {isAccountDropdownOpen && (
                    <div className="absolute right-0 mt-3 w-64 origin-top-right overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="border-b border-slate-100 px-5 py-4">
                        <p className="truncate text-[15px] font-bold text-slate-900">{displayName}</p>
                        <p className="truncate text-[13px] text-slate-500">{user.email}</p>
                      </div>
                      <div className="p-2">
                        <Link
                          href="/account"
                          onClick={() => setIsAccountDropdownOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#3B82F6] transition-colors"
                        >
                          <i className="fas fa-user-circle w-5 text-center text-slate-400"></i>
                          Account
                        </Link>
                        <Link
                          href="/my-bookings"
                          onClick={() => setIsAccountDropdownOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#3B82F6] transition-colors"
                        >
                          <i className="fas fa-suitcase w-5 text-center text-slate-400"></i>
                          My Bookings
                        </Link>
                        <Link
                          href="/feedback"
                          onClick={() => setIsAccountDropdownOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#3B82F6] transition-colors"
                        >
                          <i className="fas fa-comment-dots w-5 text-center text-slate-400"></i>
                          Feedback
                        </Link>
                      </div>
                      <div className="border-t border-slate-100 p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAccountDropdownOpen(false);
                            logout();
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <i className="fas fa-right-from-bracket w-5 text-center text-slate-400"></i>
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openAuthModal}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[#2563EB] px-5 py-2.5 text-[14px] font-semibold text-white shadow-md transition-all hover:bg-blue-700 disabled:opacity-60"
                >
                  <i className="fas fa-user text-sm"></i>
                  Sign in
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-[#143B36] shadow-sm transition-colors hover:border-[#3B82F6] hover:text-[#3B82F6]"
              >
                <span className="material-icons text-[22px]">{isMenuOpen ? 'close' : 'menu'}</span>
              </button>
            </div>
          </div>
        </nav>

        {isMenuOpen && (
          <div className="mt-3 rounded-[1.75rem] border border-gray-100/70 bg-white/96 p-4 shadow-[0_18px_40px_rgb(0,0,0,0.12)] backdrop-blur-md md:hidden">
            <div className="flex flex-col gap-2">
              {user && (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                  {user.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt={displayName}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563EB] text-xs font-bold text-white">
                      {avatarLetter}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                    {user.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
                  </div>
                </div>
              )}
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold tracking-wide transition-colors ${
                    isActive(link.href)
                      ? 'bg-blue-50 text-[#2563EB]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-[#3B82F6]'
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
                {user ? (
                  <>
                    <Link
                      href="/account"
                      onClick={() => setIsMenuOpen(false)}
                      className="inline-flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#3B82F6]"
                    >
                      <i className="fas fa-user-circle w-5 text-center text-slate-400"></i>
                      Account
                    </Link>
                    <Link
                      href="/my-bookings"
                      onClick={() => setIsMenuOpen(false)}
                      className="inline-flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#3B82F6]"
                    >
                      <i className="fas fa-suitcase w-5 text-center text-slate-400"></i>
                      My Bookings
                    </Link>
                    <Link
                      href="/feedback"
                      onClick={() => setIsMenuOpen(false)}
                      className="inline-flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#3B82F6]"
                    >
                      <i className="fas fa-comment-dots w-5 text-center text-slate-400"></i>
                      Feedback
                    </Link>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        logout();
                      }}
                      className="inline-flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <i className="fas fa-right-from-bracket w-5 text-center text-red-400"></i>
                      Sign out
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={openAuthModal}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700"
                  >
                    <i className="fas fa-user text-sm"></i>
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
      <GuestAuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          setIsAuthOpen(false);
          setPrefillEmail('');
        }}
        prefillEmail={prefillEmail}
      />
    </>
  );
}
