// app/dashboard/staff/calendars/page.js
'use client';

import { useState } from 'react';
import AdminRoomCalendar from '../calendar/page';
import AdminDayTourCalendar from '../calendar-daytour/page';

export default function CombinedCalendars() {
  const [activeTab, setActiveTab] = useState('room');

  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header Section */}
<div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
  <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
    Calendar Management
  </h1>
  <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
    Manage availability for both day tours and rooms
  </p>
</div>

      {/* Tab Navigation - Sliding Design */}
<div className="relative flex items-center mb-6 border-b border-[#4D8CF5]/20">
  <div className="relative flex w-full">

    {/* Sliding background */}
    <div
      className="absolute top-1 bottom-1 w-1/2 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
      style={{
        transform: `
          translateX(${activeTab === 'room' ? '0%' : '100%'})
          scale(0.98)
        `,
      }}
    />

    {/* Room Calendar Tab */}
    <div className="flex-1 flex justify-center">
      <button
        onClick={() => setActiveTab('room')}
        className={`relative z-10 w-full px-6 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
          activeTab === 'room'
            ? 'text-[#1E3A8A]'
            : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
        }`}
      >
        <i className="fas fa-bed"></i>
        Room Calendar
      </button>
    </div>

    {/* Day Tour Calendar Tab */}
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
        Day Tour Calendar
      </button>
    </div>

  </div>
</div>

      {/* Tab Content - Conditionally render full original components */}
      <div className="tab-content">
        {activeTab === 'room' && <AdminRoomCalendar />}
        {activeTab === 'daytour' && <AdminDayTourCalendar />}
      </div>
    </div>
  );
}