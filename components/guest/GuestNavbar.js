// components/guest/GuestNavbar.js
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SandyFeetLogoMark from './SandyFeetLogoMark';

export default function GuestNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [underlineStyle, setUnderlineStyle] = useState({ width: 0, left: 0 });
  const [hoverStyle, setHoverStyle] = useState({ width: 0, left: 0, active: false });
  const [mounted, setMounted] = useState(false);
  const navRef = useRef(null);
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/rooms', label: 'Rooms' },
    { href: '/day-tour', label: 'Day tour' },
    { href: '/reservation-tracker', label: 'Reservation tracker' },
    { href: '/feedback', label: 'Feedback' },
  ];

  const isActive = (path) => pathname === path;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mounted]);

  const updateActiveUnderline = () => {
    if (!mounted || typeof window === 'undefined') return;
    const activeLink = document.querySelector('.guest-nav-link.active');
    if (activeLink && navRef.current) {
      const linkRect = activeLink.getBoundingClientRect();
      const navRect = navRef.current.getBoundingClientRect();
      setUnderlineStyle({
        width: linkRect.width,
        left: linkRect.left - navRect.left,
      });
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(updateActiveUnderline, 0);
    window.addEventListener('resize', updateActiveUnderline);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', updateActiveUnderline);
    };
  }, [pathname, mounted]);

  const handleMouseEnter = (e) => {
    if (!mounted) return;
    const link = e.currentTarget;
    const linkRect = link.getBoundingClientRect();
    const navRect = navRef.current.getBoundingClientRect();
    setHoverStyle({
      width: linkRect.width,
      left: linkRect.left - navRect.left,
      active: true,
    });
  };

  const handleMouseLeave = () => {
    setHoverStyle({ width: 0, left: 0, active: false });
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navBarClass = [
    'fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300',
    isScrolled
      ? 'border-slate-200/90 bg-white/95 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md'
      : 'border-slate-100/80 bg-white/95 backdrop-blur-sm',
  ].join(' ');

  const linkClass = (href) => {
    const active = isActive(href);
    return `guest-nav-link relative rounded-xl px-3 py-2 text-sm font-medium transition lg:px-3.5 lg:text-[0.9375rem] ${
      active ? 'active text-ocean-deep' : 'text-slate-600 hover:text-ocean-deep'
    }`;
  };

  const logoBlock = (
    <div className="flex items-center gap-3">
      <SandyFeetLogoMark priority sizes="48px" />
      <div className="hidden min-[380px]:flex flex-col leading-tight">
        <span className="font-playfair text-lg font-bold leading-tight text-slate-900 md:text-xl">
          Sandy Feet
        </span>
        <span className="text-[0.7rem] font-medium uppercase tracking-wider text-slate-500">
          Reservation
        </span>
      </div>
    </div>
  );

  if (!mounted) {
    return (
      <>
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-100/80 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 md:h-20">
            <div className="flex items-center gap-3">
              <SandyFeetLogoMark sizes="48px" />
              <div className="hidden min-[380px]:flex flex-col leading-tight">
                <span className="font-playfair text-lg font-bold text-slate-900 md:text-xl">Sandy Feet</span>
                <span className="text-[0.7rem] font-medium uppercase tracking-wider text-slate-500">
                  Reservation
                </span>
              </div>
            </div>
          </div>
        </nav>
        <div className="h-16 md:h-20" />
      </>
    );
  }

  return (
    <>
      <nav className={navBarClass}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 md:h-20">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-2 transition hover:opacity-95"
            onClick={closeMobileMenu}
          >
            {logoBlock}
          </Link>

          <div className="hidden md:flex md:flex-1 md:items-center md:justify-center md:px-2">
            <div className="relative max-w-full" ref={navRef}>
              <div className="flex flex-wrap items-center justify-center gap-0.5 lg:gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={linkClass(link.href)}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div
                className="absolute -bottom-1 h-0.5 rounded-full bg-ocean-mid transition-all duration-300 ease-out"
                style={{
                  width: `${hoverStyle.active ? hoverStyle.width : underlineStyle.width}px`,
                  left: `${hoverStyle.active ? hoverStyle.left : underlineStyle.left}px`,
                  opacity: hoverStyle.active || underlineStyle.width ? 1 : 0,
                }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/rooms"
              className="hidden rounded-full bg-ocean-mid px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(46,163,198,0.75)] transition hover:bg-ocean-deep hover:shadow-md sm:inline-flex"
            >
              Book now
            </Link>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((o) => !o)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm transition hover:border-ocean-mid/30 hover:bg-ocean-ice md:hidden"
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle menu"
            >
              <i className={`fas fa-${isMobileMenuOpen ? 'times' : 'bars'} text-lg`} aria-hidden />
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeMobileMenu}
        aria-hidden={!isMobileMenuOpen}
      />

      <div
        className={`guest-nav-mobile-scroll fixed bottom-0 right-0 top-0 z-50 w-[min(100%,300px)] overflow-y-auto border-l border-slate-100 bg-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <SandyFeetLogoMark className="h-9 w-9" sizes="36px" />
            <span className="font-playfair text-lg font-bold text-slate-900">Menu</span>
          </div>
          <button
            type="button"
            onClick={closeMobileMenu}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-ocean-ice"
            aria-label="Close menu"
          >
            <i className="fas fa-times" aria-hidden />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMobileMenu}
              className={`rounded-xl px-4 py-3 text-base font-medium transition ${
                isActive(link.href)
                  ? 'bg-ocean-ice text-ocean-deep'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/rooms"
            onClick={closeMobileMenu}
            className="mt-3 rounded-2xl bg-ocean-mid py-3.5 text-center text-sm font-semibold text-white shadow-md"
          >
            Book now
          </Link>
        </nav>
      </div>

      <div className="h-16 md:h-20" />

      <style jsx>{`
        .guest-nav-mobile-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--color-ocean-mid) var(--color-ocean-ice);
        }
        .guest-nav-mobile-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .guest-nav-mobile-scroll::-webkit-scrollbar-thumb {
          background: var(--color-ocean-mid);
          border-radius: 999px;
        }
      `}</style>
    </>
  );
}
