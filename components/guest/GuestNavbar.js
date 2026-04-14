// components/guest/GuestNavbar.js
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export default function GuestNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const navLinks = [
    { href: '/', label: 'Home', icon: 'fas fa-home' },
    { href: '/rooms', label: 'Rooms', icon: 'fas fa-bed' },
    { href: '/day-tour', label: 'Day Tour', icon: 'fas fa-umbrella-beach' },
    { href: '/reservation-tracker', label: 'Reservation Tracker', icon: 'fas fa-calendar-check' },
    { href: '/feedback', label: 'Feedback', icon: 'fas fa-star' },
  ];

  const isActive = (path) => {
    return pathname === path;
  };

  // Handle mount state to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle scroll effect for navbar transparency
  useEffect(() => {
    if (!mounted) return;
    
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mounted]);

  // Don't render interactive elements until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <>
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/50 backdrop-blur-md shadow-lg transition-all duration-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="flex justify-between items-center h-14 md:h-16">
              <div className="flex items-center gap-2">
                <div className="relative w-8 h-8 md:w-10 md:h-10">
                  <div className="relative w-full h-full rounded-full bg-gradient-to-r from-[#1E3A8A] to-[#2169F3]"></div>
                </div>
                <div className="flex flex-col">
                  <span className="font-playfair font-bold text-[#1E3A8A] text-base md:text-lg leading-tight tracking-wide">
                    SandyFeet
                  </span>
                  <span className="text-gray-500 text-[10px] md:text-xs leading-tight">
                    Reservation
                  </span>
                </div>
              </div>
            </div>
          </div>
        </nav>
        <div className="h-14 md:h-16" />
      </>
    );
  }

  return (
    <>
      {/* Modern Navbar - No divider line */}
      <nav 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled
            ? 'bg-white/60 backdrop-blur-xl shadow-xl'
            : 'bg-white/50 backdrop-blur-md shadow-md'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex justify-between items-center h-14 md:h-16">
            {/* Logo and Site Name - Reduced size */}
            <Link 
              href="/" 
              className="flex items-center gap-2 group transition-all duration-300 hover:scale-105 relative" 
              onClick={closeMobileMenu}
            >
              <div className="relative w-8 h-8 md:w-10 md:h-10">
                <Image
                  src="/assets/sandyfeet.png"
                  alt="SandyFeet Reservation"
                  width={40}
                  height={40}
                  className="relative rounded-full border-2 border-[#2169F3]/30 object-cover shadow-md transition-all duration-300 group-hover:border-[#2169F3]/60 group-hover:shadow-lg"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-playfair font-bold text-[#1E3A8A] text-base md:text-lg leading-tight tracking-wide transition-all duration-300 group-hover:text-[#2169F3]">
                  SandyFeet
                </span>
                <span className="text-gray-500 text-[10px] md:text-xs leading-tight transition-all duration-300 group-hover:text-gray-600">
                  Reservation
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links - Sidebar style active/hover states */}
            <div className="hidden md:block">
              <div className="flex items-center gap-4 lg:gap-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      isActive(link.href)
                        ? 'bg-[#2169F3]/15 text-[#174FCC] shadow-md shadow-[#2169F3]/10 scale-[1.02]'
                        : 'text-gray-700 hover:bg-[#2169F3]/5 hover:text-[#174FCC] hover:shadow-sm'
                    }`}
                  >
                    <i className={`${link.icon} text-sm transition-all duration-300 ${
                      isActive(link.href) 
                        ? 'text-[#174FCC] scale-110' 
                        : 'text-gray-400 group-hover:text-[#174FCC] group-hover:scale-110'
                    }`}></i>
                    <span className="relative inline-block">
                      {link.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Mobile Menu Button - Reduced size */}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#2169F3]/10 active:scale-95 transition-all duration-300 focus:outline-none z-50 group"
              aria-label="Toggle menu"
            >
              <div className="relative w-5 h-4">
                <span
                  className={`absolute left-0 w-full h-0.5 bg-[#1E3A8A] rounded-full transition-all duration-400 ease-out ${
                    isMobileMenuOpen
                      ? 'top-1/2 rotate-45 -translate-y-1/2'
                      : 'top-0 group-hover:top-0.5'
                  }`}
                />
                <span
                  className={`absolute left-0 w-full h-0.5 bg-[#1E3A8A] rounded-full transition-all duration-400 ease-out top-1/2 -translate-y-1/2 ${
                    isMobileMenuOpen ? 'opacity-0 scale-0' : 'opacity-100 scale-100 group-hover:scale-110'
                  }`}
                />
                <span
                  className={`absolute left-0 w-full h-0.5 bg-[#1E3A8A] rounded-full transition-all duration-400 ease-out ${
                    isMobileMenuOpen
                      ? 'top-1/2 -rotate-45 -translate-y-1/2'
                      : 'bottom-0 group-hover:bottom-0.5'
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Overlay for mobile menu */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-all duration-500 ${
          isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        onClick={closeMobileMenu}
      />

      {/* Mobile Menu - Compact design */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-[260px] bg-white shadow-2xl z-50 transform transition-all duration-500 ease-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Menu Header with Logo - Compact */}
        <div className="flex flex-col items-center pt-6 pb-4 border-b border-gray-100">
          <div className="relative w-16 h-16 mb-2">
            <Image
              src="/assets/sandyfeet.png"
              alt="SandyFeet Reservation"
              width={64}
              height={64}
              className="relative rounded-full border-2 border-[#2169F3]/20 object-cover shadow-lg"
            />
          </div>
          <h2 className="font-playfair font-bold text-[#1E3A8A] text-lg tracking-wide">
            SandyFeet
          </h2>
          <p className="text-gray-500 text-xs">Reservation System</p>
        </div>

        {/* Mobile Menu Links - Sidebar style active/hover states */}
        <div className="px-4 py-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          {navLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMobileMenu}
              className={`flex items-center gap-3 px-3 py-2.5 mb-1.5 rounded-lg text-sm font-medium transition-all duration-300 transform ${
                isMobileMenuOpen 
                  ? 'translate-x-0 opacity-100' 
                  : '-translate-x-4 opacity-0'
              } ${
                isActive(link.href)
                  ? 'bg-[#2169F3]/15 text-[#174FCC] shadow-md shadow-[#2169F3]/10 scale-[1.02]'
                  : 'text-gray-700 hover:bg-[#2169F3]/5 hover:text-[#174FCC] hover:translate-x-1'
              }`}
              style={{
                transitionDelay: isMobileMenuOpen ? `${index * 40}ms` : '0ms'
              }}
            >
              <i className={`${link.icon} text-base w-5 ${
                isActive(link.href) ? 'text-[#174FCC]' : 'text-gray-400'
              }`}></i>
              <span className="flex-1">{link.label}</span>
            </Link>
          ))}
        </div>

        {/* Menu Footer - Compact */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100 bg-gradient-to-t from-gray-50 to-transparent">
          <p className="text-gray-400 text-[10px] text-center">
            <i className="fas fa-umbrella-beach mr-1"></i>
            © 2026 SandyFeet Reservation
          </p>
        </div>
      </div>

      {/* Spacer to prevent content from hiding under fixed navbar - Reduced height */}
      <div className="h-14 md:h-16" />

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: scaleY(0);
            opacity: 0;
          }
          to {
            transform: scaleY(1);
            opacity: 1;
          }
        }
        .animate-slideIn {
          animation: slideIn 0.2s ease-out forwards;
        }
        
        /* Custom scrollbar for mobile menu */
        .fixed.top-0.left-0.bottom-0.w-260::-webkit-scrollbar {
          width: 3px;
        }
        
        .fixed.top-0.left-0.bottom-0.w-260::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        
        .fixed.top-0.left-0.bottom-0.w-260::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #1E3A8A, #2169F3);
          border-radius: 10px;
        }
        
        .fixed.top-0.left-0.bottom-0.w-260 {
          scrollbar-width: thin;
          scrollbar-color: #2169F3 #f1f1f1;
        }
        
        /* Smooth transition for navbar on scroll */
        nav {
          backdrop-filter: blur(12px);
        }
        
        /* Subtle hover effect for nav links */
        .nav-link:hover i {
          transform: scale(1.1);
        }
      `}</style>
    </>
  );
}