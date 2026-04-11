'use client';

import { useState, useEffect } from 'react';
import StaffNavbar from '@/components/staff/staffNavbar';
import StaffSidebar from '@/components/staff/staffSidebar';

export default function StaffDashboardShell({ children }) {
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
      <StaffSidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} />
      <div className="flex flex-col min-h-screen transition-all duration-300 ease-in-out">
        <StaffNavbar toggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
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
