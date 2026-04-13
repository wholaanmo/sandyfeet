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
    { path: '/dashboard/staff/room-status', icon: 'meeting_room', label: 'Room Status', materialIcon: 'meeting_room' },
    { path: '/dashboard/staff/front-desk', icon: 'desk', label: 'Front Desk', materialIcon: 'desk' },
    { path: '/dashboard/staff/audit', icon: 'history', label: 'Audit Logs', materialIcon: 'history' }
  ];

  const getSidebarClasses = () => {
    if (!isDesktop) {
      // Mobile: 40% width, slide from left, 3s transition
      return `fixed left-0 h-screen z-40 transition-all duration-[3000ms] ease-in-out flex flex-col shadow-xl overflow-x-visible ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`;
    }
    // Desktop: original behavior (0.3s transition)
    return `fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-in-out flex flex-col shadow-xl overflow-x-visible ${
      is_expanded ? 'w-sidebar-expanded' : 'w-sidebar-collapsed'
    } ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`;
  };

  const getSidebarStyle = () => {
    if (!isDesktop) {
      return {
        backgroundColor: '#2E6F7E',
        boxShadow: '2px 0 15px rgba(0, 0, 0, 0.08)',
        transition: 'transform 3s cubic-bezier(0.4, 0, 0.2, 1)',
        top: '60px',
        width: '40%',
        height: 'calc(100vh - 60px)'
      };
    }
    return {
      backgroundColor: '#2E6F7E',
      boxShadow: '2px 0 15px rgba(0, 0, 0, 0.08)',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  };

  return (
    <>
      {/* Mobile Overlay - covers the remaining 60% of the screen */}
      {isOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity duration-300"
          style={{ top: '60px' }}
          onClick={() => onToggle(false)}
        />
      )}
      {isOpen && isDesktop && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
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
          <div className={`pt-6 pb-4 ${is_expanded ? 'px-5' : 'px-3'} border-b border-white/20 flex-shrink-0`}>
            <div className={`flex items-center gap-2 ${is_expanded ? 'justify-start' : 'justify-center'}`}>
              <div className="w-10 h-10 relative flex-shrink-0">
                <Image 
                  src="/assets/sandyfeet.png" 
                  alt="SandyFeet Reservation" 
                  width={40}
                  height={40}
                  priority
                  className="rounded-full border-2 border-white/40 object-cover shadow-md"
                />
              </div>
              {is_expanded && (
                <div className="flex flex-col min-w-0">
                  <p className="font-bold text-base text-white leading-tight font-playfair m-0 truncate">
                    SandyFeet
                  </p>
                  <p className="font-bold text-[10px] text-white/70 leading-tight m-0 truncate">
                    Reservation System
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toggle Button - only on desktop */}
        {isDesktop && (
          <div className="relative h-4 flex items-center justify-end hidden lg:block">
            <button
              onClick={toggleExpandCollapse}
              className="absolute flex items-center justify-center w-7 h-7 rounded-full bg-white text-ocean-mid hover:bg-ocean-ice hover:text-ocean-deep transition-all duration-200 shadow-md z-10"
              style={{
                right: '-14px',
                transform: 'translateY(-50%)',
                top: '50%',
                border: '2px solid white'
              }}
            >
              <span className="material-icons text-sm">
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
                  className={`group relative flex items-center p-2.5 rounded-lg transition-all duration-200 w-full ${
                    (!isDesktop || is_expanded) ? 'justify-start' : 'justify-center'
                  } ${isActive(item.path) 
                    ? 'bg-white/25 shadow-md text-white' 
                    : 'text-white/80 hover:bg-white/15 hover:text-white'}`}
                >
                  <span className={`material-icons text-xl min-w-5 text-center transition-all duration-200 ${
                    isActive(item.path) 
                      ? 'text-white scale-105' 
                      : 'text-white/80 group-hover:text-white group-hover:scale-105'
                  }`}>
                    {item.materialIcon}
                  </span>
                  {(!isDesktop || is_expanded) && (
                    <span className={`ml-3 text-xs font-medium transition-colors duration-200 ${
                      isActive(item.path) ? 'text-white' : 'text-white/90'
                    }`}>
                      {item.label}
                    </span>
                  )}
                  {/* Tooltip only for desktop collapsed state */}
                  {isDesktop && !is_expanded && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-[#2E6F7E] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 shadow-md">
                      {item.label}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* Sign Out Button */}
          <div className="p-3 border-t border-white/20 flex-shrink-0">
            <button
              onClick={handleSignOut}
              className={`group relative flex items-center p-2.5 rounded-lg transition-all duration-200 w-full ${
                (!isDesktop || is_expanded) ? 'justify-start' : 'justify-center'
              } text-white/80 hover:bg-white/15 hover:text-white`}
            >
              <span className="material-icons text-xl min-w-5 text-center transition-transform duration-200 group-hover:scale-105 text-white/80 group-hover:text-white">
                logout
              </span>
              {(!isDesktop || is_expanded) && (
                <span className="ml-3 text-xs font-medium">
                  Sign Out
                </span>
              )}
              {isDesktop && !is_expanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-[#2E6F7E] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 shadow-md">
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
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-ocean-light/20 to-ocean-mid/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="material-icons text-3xl text-ocean-light">logout</span>
              </div>
              <h3 className="text-xl font-semibold text-ocean-deep font-playfair mb-1">
                Sign Out
              </h3>
              <p className="text-sm text-ocean-mid">Are you sure you want to sign out of your account?</p>
            </div>

            <div className="flex gap-2 justify-center">
              <button
                onClick={cancelSignOut}
                className="px-4 py-1.5 rounded-lg border-2 border-ocean-light text-ocean-light bg-transparent hover:bg-ocean-light hover:text-white transition-all duration-300 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-ocean-mid to-ocean-light text-white hover:shadow-lg transition-all duration-300 font-medium text-sm"
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