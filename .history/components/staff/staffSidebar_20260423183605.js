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
      
      // Clear localStorage
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
      
      // Still clear local data even if Firebase signOut fails
      localStorage.removeItem('userType');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('uid');
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('sessionExpiry');
      localStorage.removeItem('rememberMe');
      
      // Clear cookies as well
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
    { path: '/dashboard/staff/room-status', icon: 'meeting_room', label: 'Room Status', materialIcon: 'meeting_room' },
    { path: '/dashboard/staff/front-desk', icon: 'desk', label: 'Front Desk', materialIcon: 'desk' },
    { path: '/dashboard/staff/audit', icon: 'history', label: 'Audit Logs', materialIcon: 'history' }
  ];

  const getSidebarClasses = () => {
    if (!isDesktop) {
      return `fixed left-0 h-screen z-40 transition-all duration-300 ease-in-out flex flex-col shadow-xl overflow-x-visible ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`;
    }
    return `fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-in-out flex flex-col shadow-xl overflow-x-visible ${
      is_expanded ? 'w-sidebar-expanded' : 'w-sidebar-collapsed'
    } ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`;
  };

  const getSidebarStyle = () => {
    if (!isDesktop) {
      return {
        backgroundColor: '#FFFFFF',
        boxShadow: '2px 0 20px rgba(0, 0, 0, 0.06)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        top: '64px',
        width: '280px',
        height: 'calc(100vh - 64px)'
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
      {/* Mobile Overlay */}
      {isOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity duration-300"
          style={{ top: '64px' }}
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
          <div className={`pt-6 pb-4 ${is_expanded ? 'px-5' : 'px-3'} border-b border-gray-100 flex-shrink-0`}>
            <div className={`flex items-center gap-2 ${is_expanded ? 'justify-start' : 'justify-center'}`}>
              <div className="w-10 h-10 relative flex-shrink-0">
                <Image 
                  src="/assets/sandyfeet.png" 
                  alt="SandyFeet Reservation" 
                  width={40}
                  height={40}
                  priority
                  className="rounded-full border-2 border-emerald-500/20 object-cover shadow-md"
                />
              </div>
              {is_expanded && (
                <div className="flex flex-col min-w-0">
                  <p className="font-bold text-base text-gray-800 leading-tight font-playfair m-0 truncate">
                    SandyFeet
                  </p>
                  <p className="font-bold text-[10px] text-gray-500 leading-tight m-0 truncate">
                    Staff Portal
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
              className="absolute flex items-center justify-center w-6 h-6 rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200 transition-all duration-300 z-10 hover:scale-110 hover:ring-emerald-400 hover:shadow-lg active:scale-95"
              style={{
                right: '-12px',
                transform: 'translateY(-50%)',
                top: '50%',
                border: '1px solid #10B981'
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
                  className={`group relative flex items-center p-2.5 rounded-lg transition-all duration-300 w-full ${
                    (!isDesktop || is_expanded) ? 'justify-start' : 'justify-center'
                  } ${
                    isActive(item.path) 
                      ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-emerald-600'
                  }`}
                >
                  <span className={`material-icons text-xl min-w-5 text-center transition-all duration-300 ${
                    isActive(item.path) 
                      ? 'text-emerald-600' 
                      : 'text-gray-400 group-hover:text-emerald-500'
                  }`}>
                    {item.materialIcon}
                  </span>
                  {(!isDesktop || is_expanded) && (
                    <span className={`ml-3 text-sm font-medium transition-all duration-300 ${
                      isActive(item.path) 
                        ? 'text-emerald-700' 
                        : 'text-gray-700 group-hover:text-emerald-600'
                    }`}>
                      {item.label}
                    </span>
                  )}
                  {/* Tooltip only for desktop collapsed state */}
                  {isDesktop && !is_expanded && (
                    <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
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
              className={`group relative flex items-center p-2.5 rounded-lg transition-all duration-300 w-full ${
                (!isDesktop || is_expanded) ? 'justify-start' : 'justify-center'
              } text-gray-500 hover:bg-red-50 hover:text-red-600`}
            >
              <span className="material-icons text-xl min-w-5 text-center transition-all duration-300 text-gray-400 group-hover:text-red-500 group-hover:scale-105">
                logout
              </span>
              {(!isDesktop || is_expanded) && (
                <span className="ml-3 text-sm font-medium transition-all duration-300 text-gray-600 group-hover:text-red-600">
                  Sign Out
                </span>
              )}
              {isDesktop && !is_expanded && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                  Sign Out
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Sign Out Modal - Minimalist */}
      {showSignOutModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex justify-center items-center p-4 animate-fadeIn"
          onClick={cancelSignOut}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl transform transition-all duration-300 scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Sign Out
              </h3>
              <p className="text-sm text-gray-500">
                Are you sure you want to sign out of your account?
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={cancelSignOut}
                className="px-5 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="px-5 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 hover:shadow-md transition-all duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            backdrop-filter: blur(0px);
          }
          to {
            opacity: 1;
            backdrop-filter: blur(4px);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}