'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';

export default function AdminSidebar({ isOpen, onToggle }) {
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
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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

  const menuItems = [
    { path: '/dashboard/admin/overview', icon: 'dashboard', label: 'Overview', materialIcon: 'dashboard' },
    { path: '/dashboard/admin/reservations', icon: 'event', label: 'Reservations', materialIcon: 'event' },
    { path: '/dashboard/admin/rooms', icon: 'hotel', label: 'Rooms', materialIcon: 'hotel' },
    { path: '/dashboard/admin/day-tour', icon: 'wb_sunny', label: 'Day Tour', materialIcon: 'wb_sunny' },
    { path: '/dashboard/admin/calendar', icon: 'bed', label: 'Rooms Calendar', materialIcon: 'calendar_view_month' },
    { path: '/dashboard/admin/calendar-daytour', icon: 'event', label: 'Day Tour Calendar', materialIcon: 'event' },
    { path: '/dashboard/admin/payment', icon: 'payment', label: 'Payment', materialIcon: 'payment' },
    { path: '/dashboard/admin/feedback', icon: 'feedback', label: 'Feedback', materialIcon: 'feedback' },
    { path: '/dashboard/admin/audit', icon: 'history', label: 'Audit Logs', materialIcon: 'history' },
    { path: '/dashboard/admin/staff', icon: 'badge', label: 'Staff Management', materialIcon: 'badge' },
    { path: '/dashboard/admin/archive', icon: 'archive', label: 'Archive', materialIcon: 'archive' } 
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => onToggle(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen z-50 overflow-y-auto transition-all duration-300 ease-in-out flex flex-col shadow-2xl ${
          is_expanded ? 'w-sidebar-expanded' : 'w-sidebar-collapsed'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{
          background: 'linear-gradient(135deg, var(--color-ocean-deep) 0%, var(--color-ocean-mid) 50%, var(--color-ocean-light) 100%)',
          boxShadow: '5px 0 25px rgba(0, 0, 0, 0.1)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Hide scrollbar for Chrome, Safari and Opera */}
        <style jsx>{`
          aside::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        
        {/* Logo Section */}
        <div className={`pt-8 pb-6 ${is_expanded ? 'px-6' : 'px-4'} border-b border-white/20`}>
          <div className={`flex items-center gap-3 ${is_expanded ? 'justify-start' : 'justify-center'}`}>
            <div className="w-12 h-12 relative">
              <Image 
                src="/assets/Sea&RiverView.png" 
                alt="SandyFeet Reservation" 
                width={48}
                height={48}
                priority
                className="rounded-full border-2 border-white/40 object-cover shadow-lg"
              />
            </div>
            {is_expanded && (
              <div className="flex flex-col">
                <p className="font-bold text-lg text-white leading-tight font-playfair m-0">
                  SandyFeet
                </p>
                <p className="font-bold text-xs text-white/70 leading-tight m-0">
                  Reservation System
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 flex-1">
          {/* Menu Items */}
          <div className="flex flex-col gap-2">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`group relative flex items-center p-3 rounded-xl transition-all duration-200 w-full ${
                  is_expanded ? 'justify-start' : 'justify-center'
                } ${isActive(item.path) 
                  ? 'bg-white/20 shadow-lg text-white' 
                  : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
              >
                <span className={`material-icons text-2xl min-w-6 text-center transition-all duration-200 ${
                  isActive(item.path) 
                    ? 'text-white scale-110' 
                    : 'text-white/80 group-hover:text-white group-hover:scale-110'
                }`}>
                  {item.materialIcon}
                </span>
                {is_expanded && (
                  <span className={`ml-4 text-sm font-medium transition-colors duration-200 ${
                    isActive(item.path) ? 'text-white' : 'text-white/90'
                  }`}>
                    {item.label}
                  </span>
                )}
                {/* Tooltip for collapsed state */}
                {!is_expanded && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-ocean-deep text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 shadow-lg">
                    {item.label}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="p-4 border-t border-white/20 relative">
          <button
            onClick={handleSignOut}
            className={`group relative flex items-center p-3 rounded-xl transition-all duration-200 w-full ${
              is_expanded ? 'justify-start' : 'justify-center'
            } text-white/80 hover:bg-white/10 hover:text-white`}
          >
            <span className="material-icons text-2xl min-w-6 text-center transition-transform duration-200 group-hover:scale-110 text-white/80 group-hover:text-white">
              logout
            </span>
            {is_expanded && (
              <span className="ml-4 text-sm font-medium">
                Sign Out
              </span>
            )}
            {!is_expanded && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-ocean-deep text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 shadow-lg">
                Sign Out
              </div>
            )}
          </button>
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