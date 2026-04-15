'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export default function GuestNavbar() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'HOME' },
    { href: '/rooms', label: 'ROOMS' },
    { href: '/day-tour', label: 'DAYTOUR' },
    { href: '/reservation-tracker', label: 'TRACK RESERVATION' },
  ];

  const isActive = (path) => pathname === path;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 mt-6">
      <nav className="max-w-6xl mx-auto bg-white/95 backdrop-blur-md rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.08)] px-8 py-3.5 border border-gray-100/50">
        <div className="flex items-center justify-between h-12">
          
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-3 group translate-y-0.5">
            <div className="relative w-12 h-12">
              <Image
                src="/assets/sandyfeet.png"
                alt="SandyFeet Logo"
                fill
                className="object-contain"
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-playfair font-bold text-[#143B36] text-[22px] leading-none mb-1">
                Sandyfeet
              </span>
              <span className="text-gray-400 text-[9px] tracking-[0.2em] font-medium">
                LIWLIWA CAMP
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 -translate-x-4">
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
                  <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-[#F5A623] rounded-full" />
                )}
              </Link>
            ))}
          </div>

          {/* Book Now Button */}
          <div className="hidden md:block">
            <Link
              href="/rooms"
              className="bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-3 rounded-full text-[15px] font-semibold transition-all shadow-md hover:shadow-lg shadow-blue-500/20"
            >
              Book Now
            </Link>
          </div>

        </div>
      </nav>
    </div>
  );
}
