'use client';

import { useState, useEffect } from 'react';
import AdminNavbar from '@/components/admin/AdminNavbar';
import AdminSidebar from '@/components/admin/Sidebar';

export default function AdminDashboardShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F9FF' }}>
      <AdminSidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} />
      <div className="flex flex-col min-h-screen transition-all duration-300 ease-in-out">
        <AdminNavbar toggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
        <main
          className="flex-1 p-8 overflow-x-hidden transition-all duration-300 ease-in-out"
          style={{
            marginLeft: sidebarOpen ? '260px' : '80px',
            marginTop: '60px',
            backgroundColor: '#F8FAFF',
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
