// app/dashboard/admin/layout.js
//
// SERVER LAYOUT GUARD INTEGRATION:
// The server-authoritative session check is performed by the server layout guard.
// Import and call it at the top of the layout to enforce admin access before
// rendering any admin content:
//
//   import { withProtectedLayout } from '@/lib/server/auth/layout-guard';
//
//   export default async function AdminServerLayout({ children }) {
//     const actor = await withProtectedLayout(['admin']);
//     // actor is guaranteed to be an authenticated admin at this point.
//     // Pass actor data to client components via props or a context provider.
//     return <AdminLayoutClient>{children}</AdminLayoutClient>;
//   }
//
// The client layout below retains existing navigation/sidebar behavior.
// The legacy SessionGuard is preserved during migration but is NOT
// authoritative — server layout guard handles real access control.

'use client';

import { useState, useEffect } from 'react';
import AdminNavbar from '@/components/admin/AdminNavbar';
import AdminSidebar from '@/components/admin/Sidebar';
import { SessionGuard } from '@/components/SessionGuard'; 

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (!desktop) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    setMounted(true);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const mainMarginLeft = isDesktop
    ? (sidebarOpen ? '260px' : '80px')
    : '0px';

  if (!mounted) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
      <AdminSidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} isDesktop={isDesktop} />
      <div className="flex flex-col min-h-screen transition-all duration-300 ease-in-out">
        <AdminNavbar toggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} isDesktop={isDesktop} />
        <main 
          className="flex-1 p-8 overflow-x-hidden transition-all duration-300 ease-in-out"
          style={{ 
            marginLeft: mainMarginLeft,
            marginTop: '60px',
            backgroundColor: '#fcfcfc',
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
                    <SessionGuard>   
            {children}
          </SessionGuard>
        </main>
      </div>
    </div>
  );
}