'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import GuestAuthModal from './GuestAuthModal';
import { useGuestAuth } from './GuestAuthContext';

export default function GuestNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const pathname = usePathname();
  const { user, profile, loading, logout } = useGuestAuth();

  const navLinks = [
    { href: '/', label: 'HOME' },
    { href: '/rooms', label: 'ROOMS' },
    { href: '/day-tour', label: 'DAYTOUR' },
    { href: '/reservation-tracker', label: 'TRACK RESERVATION' },
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

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openAuthModal = () => {
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
                  src="/assets/sandyfeet.png"
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
              <Link
                href="/rooms"
                className={`rounded-full px-6 py-3 text-[15px] font-semibold transition-all shadow-md hover:shadow-lg lg:px-8 ${
                  isActive('/rooms')
                    ? 'bg-[#2563EB] text-white shadow-blue-500/30'
                    : 'bg-[#3B82F6] text-white shadow-blue-500/20 hover:bg-[#2563EB]'
                }`}
              >
                Book Now
              </Link>
              {user ? (
                <div className="flex items-center gap-2">
                  <Link
                    href="/account"
                    className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-2.5 text-[13px] font-semibold text-[#2563EB] shadow-sm transition-all hover:bg-white hover:shadow-md"
                  >
                    {user.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt={displayName}
                        width={30}
                        height={30}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-xs font-bold text-white">
                        {avatarLetter}
                      </span>
                    )}
                    <span className="max-w-[110px] truncate">{displayName}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900"
                    title="Sign out"
                  >
                    <i className="fas fa-right-from-bracket text-sm"></i>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openAuthModal}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-3 text-[14px] font-semibold text-[#2563EB] shadow-sm transition-all hover:border-blue-200 hover:bg-white hover:shadow-md disabled:opacity-60 lg:px-5"
                >
                  <i className="fas fa-user-circle text-base"></i>
                  Sign In
                </button>
              )}
            </div>

            <button
              type="button"
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-[#143B36] shadow-sm transition-colors hover:border-[#3B82F6] hover:text-[#3B82F6] md:hidden"
            >
              <span className="material-icons text-[22px]">{isMenuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </nav>

        {isMenuOpen && (
          <div className="mt-3 rounded-[1.75rem] border border-gray-100/70 bg-white/96 p-4 shadow-[0_18px_40px_rgb(0,0,0,0.12)] backdrop-blur-md md:hidden">
            <div className="flex flex-col gap-2">
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
              <Link
                href="/rooms"
                onClick={() => setIsMenuOpen(false)}
                className="mt-2 inline-flex items-center justify-center rounded-full bg-[#3B82F6] px-5 py-3 text-sm font-semibold text-white shadow-blue-500/20 transition-colors hover:bg-[#2563EB]"
              >
                Book Now
              </Link>
              <Link
                href="/account"
                onClick={() => setIsMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-semibold text-[#2563EB] transition-colors hover:bg-white"
              >
                <i className="fas fa-receipt"></i>
                My Bookings
              </Link>
              <button
                type="button"
                onClick={user ? logout : openAuthModal}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-[#3B82F6] hover:text-[#2563EB]"
              >
                <i className={`fas ${user ? 'fa-right-from-bracket' : 'fa-user-circle'}`}></i>
                {user ? 'Sign Out' : 'Guest Sign In'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    <GuestAuthModal
      isOpen={isAuthOpen}
      onClose={() => setIsAuthOpen(false)}
    />
    </>
  );
}
