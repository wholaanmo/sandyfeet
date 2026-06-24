// app/dashboard/staff/book-process/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import StaffBooking from '../booking/page';
import StaffDayTourBook from '../daytour-book/page';
import StaffBookingProcess from '../booking-process/page';

export default function StaffBookProcess() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Determine which tab is active
  const getInitialTab = () => {
    const tab = searchParams.get('tab');
    if (tab === 'daytour') return 'daytour';
    return 'room';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [showProcess, setShowProcess] = useState(false);

  useEffect(() => {
    const process = searchParams.get('process');
    setShowProcess(process === 'true');
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowProcess(false);
    router.push(`/dashboard/staff/book-process?tab=${tab}`);
  };

  // Common header and tabs component
  const renderHeaderAndTabs = () => (
    <>
      {/* Header Section */}
      <div className="mb-6 sm:mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-6 py-4 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight mb-1">
          {showProcess ? 'Complete Booking' : 'Booking Management'}
        </h1>
        <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
          {showProcess 
            ? 'Complete the booking process' 
            : 'Select the type of reservation you want to create.'}
        </p>
      </div>

      {/* Tab Navigation - Sliding Design */}
      <div className="relative flex items-center mb-6 border-b border-[#4D8CF5]/20">
        <div className="relative flex w-full">
          <div
            className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
            style={{
              transform: `
                translateX(${activeTab === 'room' ? '0%' : '100%'})
                scale(0.98)
              `,
            }}
          />

          {/* Room Booking Tab */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => handleTabChange('room')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeTab === 'room'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-door-open"></i>
              Room Booking
            </button>
          </div>

          {/* Day Tour Booking Tab */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => handleTabChange('daytour')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeTab === 'daytour'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-umbrella-beach"></i>
              Day Tour Booking
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // If we're showing the booking process
  if (showProcess) {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        {renderHeaderAndTabs()}
        <StaffBookingProcess />
      </div>
    );
  }

  // Default view - show booking selection
  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {renderHeaderAndTabs()}
      
      {/* Tab Content - Render the actual booking components */}
      <div className="tab-content">
        {activeTab === 'room' && <StaffBooking />}
        {activeTab === 'daytour' && <StaffDayTourBook />}
      </div>
    </div>
  );
}