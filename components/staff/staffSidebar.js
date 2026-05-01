// components/staff/staffSidebar.js
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';

export default function StaffSidebar({ isOpen, onToggle, isDesktop }) {
  const [is_expanded, setIsExpanded] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setIsExpanded(isOpen);
  }, [isOpen]);

  const handleSignOut = () => {
    setShowSignOutModal(true);
  };

  const confirmSignOut = async () => {
    try {
      await signOut(auth);

      localStorage.removeItem('userType');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('uid');
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('sessionExpiry');
      localStorage.removeItem('rememberMe');

      // Clear cookies for middleware
      document.cookie = 'sessionToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
      document.cookie = 'sessionExpiry=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';

      setShowSignOutModal(false);
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);

      localStorage.removeItem('userType');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('uid');
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('sessionExpiry');
      localStorage.removeItem('rememberMe');

      // Clear cookies for middleware even if Firebase signOut fails
      document.cookie = 'sessionToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
      document.cookie = 'sessionExpiry=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';

      setShowSignOutModal(false);
      router.push('/login');
    }
  };

  const cancelSignOut = () => {
    setShowSignOutModal(false);
  };

  const isActive = (path) => {
    return pathname === path;
  };

  const toggleExpandCollapse = () => {
    setIsExpanded(!is_expanded);
    onToggle(!is_expanded);
  };

  // Close sidebar on mobile after navigation
  const handleMobileMenuClick = () => {
    if (!isDesktop) {
      onToggle(false);
    }
  };

  const menuItems = [
    { path: '/dashboard/staff/overview', icon: 'dashboard', label: 'Overview', materialIcon: 'dashboard' },
    { path: '/dashboard/staff/availability', icon: 'event_available', label: 'Availability', materialIcon: 'event_available' },
    { path: '/dashboard/staff/reservations', icon: 'event', label: 'Reservations', materialIcon: 'event' },
    { path: '/dashboard/staff/calendars', icon: 'calendar_month', label: 'Calendar Management', materialIcon: 'calendar_month' },
    { path: '/dashboard/staff/payment', icon: 'payment', label: 'Payment', materialIcon: 'payment' },
    { path: '/dashboard/staff/audit', icon: 'history', label: 'Audit Logs', materialIcon: 'history' }
  ];

  const getSidebarClasses = () => {
    if (!isDesktop) {
      // Mobile: 280px width, slide from left, smooth 300ms transition
      return `fixed left-0 h-screen z-40 transform transition-transform duration-300 ease-in-out flex flex-col shadow-xl overflow-x-visible ${isOpen ? 'translate-x-0' : '-translate-x-full'
        }`;
    }
    // Desktop: original behavior (0.3s transition)
    return `fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-in-out flex flex-col shadow-xl overflow-x-visible ${is_expanded ? 'w-sidebar-expanded' : 'w-sidebar-collapsed'
      } ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`;
  };

  const getSidebarStyle = () => {
    if (!isDesktop) {
      return {
        backgroundColor: '#FFFFFF',
        boxShadow: '2px 0 20px rgba(0, 0, 0, 0.06)',
        top: '60px',
        width: '280px', // Standard mobile sidebar width
        maxWidth: '85%',
        height: 'calc(100vh - 60px)'
      };
    }
    return {
      backgroundColor: '#FFFFFF',
      boxShadow: '2px 0 20px rgba(0, 0, 0, 0.06)',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  };

  return (
    <>
      {/* Mobile Overlay - covers the remaining 60% of the screen */}
      {!isDesktop && (
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          style={{ top: '60px' }}
          onClick={() => onToggle(false)}
        />
      )}
      {/* Desktop Overlay */}
      {isDesktop && (
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          onClick={() => onToggle(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={getSidebarClasses()}
        style={getSidebarStyle()}
      >
        {/* Logo Section - hidden on mobile */}
        {isDesktop && (
          <div className={`pt-6 pb-4 ${is_expanded ? 'px-5' : 'px-3'} border-b border-gray-100 flex-shrink-0`}>
            <div className={`flex items-center gap-2 ${is_expanded ? 'justify-start' : 'justify-center'}`}>
              <div className="w-10 h-10 relative flex-shrink-0">
                <Image
                  src="/SandyFeet_logo2.png"
                  alt="SandyFeet Reservation"
                  width={40}
                  height={40}
                  priority
                  className="rounded-full border-2 border-ocean-mid/20 object-cover shadow-md"
                />
              </div>
              {is_expanded && (
                <div className="flex flex-col min-w-0">
                  <p className="font-bold text-base text-[#1E3A8A] leading-tight font-playfair m-0 truncate">
                    SandyFeet
                  </p>
                  <p className="font-bold text-[10px] text-gray-500 leading-tight m-0 truncate">
                    Reservation System
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toggle Button - only on desktop */}
        {isDesktop && (
          <div className="relative h-0.5 flex items-center justify-end hidden lg:block">
            <button
              onClick={toggleExpandCollapse}
              className="absolute flex items-center justify-center w-6 h-6 rounded-full bg-white text-[#2169F3] shadow-sm ring-1 ring-[#2169F3]/20 transition-all duration-300 z-10 hover:scale-110 hover:ring-[#2169F3]/40 hover:shadow-lg active:scale-95"
              style={{
                right: '-14px',
                transform: 'translateY(-50%)',
                top: '50%',
                border: '1px solid #2169F3'
              }}
            >
              <span className="material-icons text-sm transition-transform duration-200">
                {is_expanded ? 'chevron_left' : 'chevron_right'}
              </span>
            </button>
          </div>
        )}

        {/* Menu Items Container */}
        <div className="flex-1 flex flex-col overflow-hidden mt-2">
          <div className="p-3 flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <style jsx>{`
              div::-webkit-scrollbar {
                display: none;
              }
            `}</style>

            <div className="flex flex-col gap-1.5">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={handleMobileMenuClick}
                  className={`group relative flex items-center p-2.5 rounded-lg transition-all duration-300 w-full ${(!isDesktop || is_expanded) ? 'justify-start' : 'justify-center'
                    } ${isActive(item.path)
                      ? 'bg-[#2169F3]/15 text-[#174FCC] shadow-md shadow-[#2169F3]/10 scale-[1.02]'
                      : 'text-gray-700 hover:bg-[#2169F3]/5 hover:text-[#174FCC] hover:shadow-sm'
                    }`}
                >
                  <span className={`material-icons text-xl min-w-5 text-center transition-all duration-300 ${isActive(item.path)
                      ? 'text-[#174FCC] scale-110'
                      : 'text-gray-400 group-hover:text-[#174FCC] group-hover:scale-110'
                    }`}>
                    {item.materialIcon}
                  </span>
                  {(!isDesktop || is_expanded) && (
                    <span className={`ml-3 text-xs font-medium transition-all duration-300 ${isActive(item.path)
                        ? 'text-[#174FCC]'
                        : 'text-gray-700 group-hover:text-[#174FCC]'
                      }`}>
                      {item.label}
                    </span>
                  )}
                  {/* Tooltip only for desktop collapsed state */}
                  {isDesktop && !is_expanded && (
                    <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-[#2169F3] text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* Sign Out Button */}
          <div className="p-3 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={handleSignOut}
              className={`group relative flex items-center p-2.5 rounded-lg transition-all duration-300 w-full ${(!isDesktop || is_expanded) ? 'justify-start' : 'justify-center'
                } text-gray-600 hover:bg-[#2169F3]/5 hover:text-[#2169F3]`}
            >
              <span className="material-icons text-xl min-w-5 text-center transition-all duration-300 text-gray-400 group-hover:text-[#2169F3] group-hover:scale-110">
                logout
              </span>
              {(!isDesktop || is_expanded) && (
                <span className="ml-3 text-xs font-medium transition-all duration-300 text-gray-600 group-hover:text-[#2169F3] group-hover:translate-x-0.5">
                  Sign Out
                </span>
              )}
              {isDesktop && !is_expanded && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-[#2169F3] text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                  Sign Out
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Sign Out Modal */}
      {showSignOutModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-100 flex justify-center items-center p-4"
          onClick={cancelSignOut}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl transform transition-all duration-300 scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#2169F3]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-icons text-3xl text-[#2169F3]">logout</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Sign Out
              </h3>
              <p className="text-sm text-slate-500 px-4">
                Are you sure you want to end your session and sign out of your account?
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={cancelSignOut}
                className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-200 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#2169F3] text-white hover:bg-[#1a54c3] shadow-lg shadow-[#2169F3]/20 transition-all duration-200 font-semibold text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}