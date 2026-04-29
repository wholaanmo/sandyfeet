// app/dashboard/admin/manage/page.js
'use client';

import { useState } from 'react';
import AdminRooms from '../rooms/page';
import AdminDayTour from '../day-tour/page';

export default function CombinedManage() {
  const [activeTab, setActiveTab] = useState('rooms');

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header Section */}
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Manage
        </h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
          Manage rooms, day tours, and activities
        </p>
      </div>

      {/* Tab Navigation - Sliding Design */}
      <div className="relative flex items-center mb-6 border-b border-[#4D8CF5]/20">
        <div className="relative flex w-full">
          {/* Sliding background */}
          <div
            className="absolute top-1 bottom-1 w-1/3 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
            style={{
              transform: `
                translateX(${activeTab === 'rooms' ? '0%' : activeTab === 'daytour' ? '100%' : '200%'})
                scale(0.98)
              `,
            }}
          />

          {/* Rooms Tab */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setActiveTab('rooms')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeTab === 'rooms'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-bed"></i>
              Rooms
            </button>
          </div>

          {/* Day Tour Tab */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setActiveTab('daytour')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeTab === 'daytour'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-sun"></i>
              Day Tour
            </button>
          </div>

          {/* Activities Tab */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => setActiveTab('activities')}
              className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
                activeTab === 'activities'
                  ? 'text-[#1E3A8A]'
                  : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
            >
              <i className="fas fa-bicycle"></i>
              Activities
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content - Conditionally render */}
      <div className="tab-content">
        {activeTab === 'rooms' && <AdminRooms />}
        {activeTab === 'daytour' && <AdminDayTour defaultTab="tours" hideTabs={true} />}
        {activeTab === 'activities' && <AdminDayTour defaultTab="activities" hideTabs={true} />}
      </div>
    </div>
  );
}