// app/dashboard/admin/reports/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState('roomTypes');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalRoomBookings, setTotalRoomBookings] = useState(0);
  const [totalDayTourGuests, setTotalDayTourGuests] = useState(0);
  
  // Chart data states
  const [yearlyMonthlyRoomData, setYearlyMonthlyRoomData] = useState({});
  const [yearlyMonthlyRevenueData, setYearlyMonthlyRevenueData] = useState({});
  const [yearlyMonthlyTrendData, setYearlyMonthlyTrendData] = useState({});
  const [bookingSplitData, setBookingSplitData] = useState([]);
  
  // New state for annual revenue total
  const [annualRevenueTotal, setAnnualRevenueTotal] = useState(0);
  
  // Filter states
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSplitFilter, setSelectedSplitFilter] = useState('year');
  const [selectedSplitYear, setSelectedSplitYear] = useState('');
  const [selectedSplitMonth, setSelectedSplitMonth] = useState('');
  
  // Available years
  const [availableYears, setAvailableYears] = useState([]);
  
  // Tab refs
  const tabsContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const buttonRefs = useRef({});
  
  // Colors
  const COLORS = ['#8B5CF6', '#4D8CF5', '#F59E0B'];
  const ROOM_TYPE_COLORS = {
    'Tent': '#10B981',
    'Ground Floor Room': '#4D8CF5',
    'Group Room': '#8B5CF6',
    'Couple Room': '#F59E0B'
  };
  
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const updateSlider = useCallback(() => {
    const activeButton = buttonRefs.current[activeTab];
    const container = tabsContainerRef.current;
    const slider = sliderRef.current;
    if (activeButton && container && slider) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;
      slider.style.transform = `translateX(${left}px)`;
      slider.style.width = `${width}px`;
    }
  }, [activeTab]);

  useEffect(() => {
    updateSlider();
    const resizeObserver = new ResizeObserver(() => updateSlider());
    if (tabsContainerRef.current) {
      resizeObserver.observe(tabsContainerRef.current);
    }
    window.addEventListener('resize', updateSlider);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSlider);
    };
  }, [updateSlider]);
  
  // Initialize slider after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSlider();
    }, 100);
    return () => clearTimeout(timer);
  }, [updateSlider]);
  
  useEffect(() => {
    fetchAllData();
  }, []);
  
  // Update annual revenue total when selectedYear or revenue data changes
  useEffect(() => {
    if (selectedYear && yearlyMonthlyRevenueData[selectedYear]) {
      const yearData = yearlyMonthlyRevenueData[selectedYear];
      const total = yearData.reduce((sum, month) => sum + (month.total || 0), 0);
      setAnnualRevenueTotal(total);
    } else {
      setAnnualRevenueTotal(0);
    }
  }, [selectedYear, yearlyMonthlyRevenueData]);
  
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const bookingsRef = collection(db, 'bookings');
      const bookingsSnapshot = await getDocs(bookingsRef);
      const bookings = [];
      bookingsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.type === 'room') {
          bookings.push({ id: doc.id, ...data });
        }
      });
      
      const dayTourRef = collection(db, 'dayTourBookings');
      const dayTourSnapshot = await getDocs(dayTourRef);
      const dayTours = [];
      dayTourSnapshot.forEach((doc) => {
        dayTours.push({ id: doc.id, ...doc.data() });
      });
      
      processData(bookings, dayTours);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const processData = (bookings, dayTours) => {
    let revenue = 0;
    let roomBookingCount = 0;
    let dayTourGuestCount = 0;
    
    const processedBookings = [];
    const multiRoomGroups = new Map();
    
    // Track completed room bookings for accurate room unit count
    let completedRoomUnits = 0;
    
    bookings.forEach(booking => {
      // Only count revenue from completed bookings
      if (booking.status === 'completed') {
        revenue += booking.totalPrice || 0;
      }
      
      // *** UPDATED: Count room UNITS (number of rooms) for completed bookings ***
      if (booking.status === 'completed') {
        if (!booking.isMultiRoomBooking) {
          // Single booking: count numberOfRooms or default to 1
          const roomUnits = booking.numberOfRooms || 1;
          completedRoomUnits += roomUnits;
          roomBookingCount++; // Keep this for backward compatibility in some calculations
        }
        
        if (booking.isMultiRoomBooking && booking.parentBookingId) {
          if (!multiRoomGroups.has(booking.parentBookingId)) {
            multiRoomGroups.set(booking.parentBookingId, {
              bookings: [],
              totalPrice: 0,
              createdAt: booking.createdAt,
              status: booking.status,
              roomUnitCount: 0
            });
          }
          const group = multiRoomGroups.get(booking.parentBookingId);
          group.bookings.push(booking);
          group.totalPrice += booking.totalPrice || 0;
          // Count room units for this child booking
          const roomUnits = booking.numberOfRooms || 1;
          group.roomUnitCount += roomUnits;
        } else if (!booking.isMultiRoomBooking) {
          processedBookings.push(booking);
        }
      }
    });
    
    multiRoomGroups.forEach((group, parentId) => {
      processedBookings.push({
        ...group.bookings[0],
        id: parentId,
        totalPrice: group.totalPrice,
        isGrouped: true,
        childBookings: group.bookings,
        roomUnitCount: group.roomUnitCount
      });
      // Add the room unit count from this group to the total
      completedRoomUnits += group.roomUnitCount;
    });
    
    // *** UPDATED: Set total room bookings to room unit count (not booking IDs) ***
    setTotalRoomBookings(completedRoomUnits);
    
    // *** UPDATED: Only count day tour guests from 'completed' status bookings ***
    dayTours.forEach(tour => {
      if (tour.status === 'completed') {
        const seniors = tour.seniors || 0;
        const adults = tour.adults || 0;
        const kids = tour.kids || 0;
        dayTourGuestCount += seniors + adults + kids;
        // Also add day tour revenue to total revenue (already counted above if we had day tour revenue)
        // Note: Day tour revenue is already counted from the dayTours loop below
      }
    });
    
    setTotalRevenue(revenue);
    setTotalDayTourGuests(dayTourGuestCount);
    
    // Process yearly data
    const yearlyMonthlyRoom = {};
    const yearlyMonthlyRevenue = {};
    const yearlyMonthlyTrend = {};
    const yearsSet = new Set();
    
    processedBookings.forEach(booking => {
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getMonth();
      yearsSet.add(year);
      
      if (!yearlyMonthlyRoom[year]) {
        yearlyMonthlyRoom[year] = {
          Tent: new Array(12).fill(0),
          'Ground Floor Room': new Array(12).fill(0),
          'Group Room': new Array(12).fill(0),
          'Couple Room': new Array(12).fill(0)
        };
      }
      if (!yearlyMonthlyRevenue[year]) {
        yearlyMonthlyRevenue[year] = {
          roomRevenue: new Array(12).fill(0),
          dayTourRevenue: new Array(12).fill(0),
          total: new Array(12).fill(0)
        };
      }
      if (!yearlyMonthlyTrend[year]) {
        yearlyMonthlyTrend[year] = {
          roomBookings: new Array(12).fill(0),
          dayTourGuests: new Array(12).fill(0)
        };
      }
      
      let roomTypes = [];
      if (booking.isGrouped && booking.childBookings) {
        roomTypes = booking.childBookings.map(cb => cb.roomType);
      } else if (booking.roomTypes && Array.isArray(booking.roomTypes)) {
        booking.roomTypes.forEach(rt => {
          for (let i = 0; i < (rt.quantity || 1); i++) {
            roomTypes.push(rt.type);
          }
        });
      } else if (booking.roomType) {
        for (let i = 0; i < (booking.numberOfRooms || 1); i++) {
          roomTypes.push(booking.roomType);
        }
      }
      
      roomTypes.forEach(roomType => {
        if (roomType === 'Tent') yearlyMonthlyRoom[year].Tent[month]++;
        else if (roomType === 'Ground Floor Rooms') yearlyMonthlyRoom[year]['Ground Floor Room'][month]++;
        else if (roomType === 'Group Room') yearlyMonthlyRoom[year]['Group Room'][month]++;
        else if (roomType === 'Couple Room') yearlyMonthlyRoom[year]['Couple Room'][month]++;
      });
      
      const totalPrice = booking.totalPrice || 0;
      yearlyMonthlyRevenue[year].roomRevenue[month] += totalPrice;
      yearlyMonthlyRevenue[year].total[month] += totalPrice;
      // *** UPDATED: Count room UNITS for trend data, not booking IDs ***
      const roomUnits = booking.numberOfRooms || (booking.isGrouped ? (booking.roomUnitCount || booking.childBookings?.length || 1) : 1);
      yearlyMonthlyTrend[year].roomBookings[month] += roomUnits;
    });
    
    dayTours.forEach(tour => {
      // Only include completed day tours in trends and revenue
      if (tour.status === 'completed') {
        const createdAt = tour.createdAt?.toDate ? tour.createdAt.toDate() : new Date(tour.createdAt);
        const year = createdAt.getFullYear();
        const month = createdAt.getMonth();
        yearsSet.add(year);
        
        if (!yearlyMonthlyRevenue[year]) {
          yearlyMonthlyRevenue[year] = {
            roomRevenue: new Array(12).fill(0),
            dayTourRevenue: new Array(12).fill(0),
            total: new Array(12).fill(0)
          };
        }
        if (!yearlyMonthlyTrend[year]) {
          yearlyMonthlyTrend[year] = {
            roomBookings: new Array(12).fill(0),
            dayTourGuests: new Array(12).fill(0)
          };
        }
        
        const totalPrice = tour.totalPrice || 0;
        yearlyMonthlyRevenue[year].dayTourRevenue[month] += totalPrice;
        yearlyMonthlyRevenue[year].total[month] += totalPrice;
        
        const guests = (tour.seniors || 0) + (tour.adults || 0) + (tour.kids || 0);
        yearlyMonthlyTrend[year].dayTourGuests[month] += guests;
      }
    });
    
    const roomTypeChartData = {};
    const revenueChartData = {};
    const trendChartData = {};
    
    for (const year of yearsSet) {
      roomTypeChartData[year] = MONTHS.map((month, idx) => ({
        month: month,
        Tent: yearlyMonthlyRoom[year]?.Tent[idx] || 0,
        'Ground Floor Room': yearlyMonthlyRoom[year]?.['Ground Floor Room'][idx] || 0,
        'Group Room': yearlyMonthlyRoom[year]?.['Group Room'][idx] || 0,
        'Couple Room': yearlyMonthlyRoom[year]?.['Couple Room'][idx] || 0
      }));
      revenueChartData[year] = MONTHS.map((month, idx) => ({
        month: month,
        roomRevenue: yearlyMonthlyRevenue[year]?.roomRevenue[idx] || 0,
        dayTourRevenue: yearlyMonthlyRevenue[year]?.dayTourRevenue[idx] || 0,
        total: (yearlyMonthlyRevenue[year]?.roomRevenue[idx] || 0) + (yearlyMonthlyRevenue[year]?.dayTourRevenue[idx] || 0)
      }));
      trendChartData[year] = MONTHS.map((month, idx) => ({
        month: month,
        roomBookings: yearlyMonthlyTrend[year]?.roomBookings[idx] || 0,
        dayTourGuests: yearlyMonthlyTrend[year]?.dayTourGuests[idx] || 0
      }));
    }
    
    setYearlyMonthlyRoomData(roomTypeChartData);
    setYearlyMonthlyRevenueData(revenueChartData);
    setYearlyMonthlyTrendData(trendChartData);
    
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    setAvailableYears(years);
    if (years.length > 0 && !selectedYear) setSelectedYear(years[0]);
    if (years.length > 0 && !selectedSplitYear) setSelectedSplitYear(years[0]);
    
    // Booking split data (only count completed bookings)
    let entireResortCount = 0, multiRoomCount = 0, singleRoomCount = 0;
    processedBookings.forEach(booking => {
      if (booking.isExclusiveResortBooking || (booking.isGrouped && booking.childBookings?.some(cb => cb.isExclusiveResortBooking))) {
        entireResortCount++;
      } else if (booking.isGrouped || (booking.roomTypes && booking.roomTypes.length > 1)) {
        multiRoomCount++;
      } else {
        singleRoomCount++;
      }
    });
    setBookingSplitData([
      { name: 'Entire Resort', value: entireResortCount, color: '#8B5CF6' },
      { name: 'Multi-Room Types', value: multiRoomCount, color: '#4D8CF5' },
      { name: 'Single Room Type', value: singleRoomCount, color: '#F59E0B' }
    ]);
  };
  
  // Custom tooltip that shows combined total revenue for the month
  const RevenueTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      // Calculate combined total for the month
      let roomRevenue = 0;
      let dayTourRevenue = 0;
      
      payload.forEach(entry => {
        if (entry.name === 'Room Booking Revenue') {
          roomRevenue = entry.value || 0;
        }
        if (entry.name === 'Day Tour Revenue') {
          dayTourRevenue = entry.value || 0;
        }
      });
      
      const combinedTotal = roomRevenue + dayTourRevenue;
      
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: ₱{entry.value.toLocaleString()}
            </p>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-sm font-bold text-gray-900">
              Combined Total: ₱{combinedTotal.toLocaleString()}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const isRevenue = payload[0]?.name === 'roomRevenue' || payload[0]?.name === 'dayTourRevenue' || payload[0]?.name === 'Room Booking Revenue';
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-800">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {isRevenue ? `₱${entry.value.toLocaleString()}` : entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };
  
  if (loading) {
    return (
      <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }
  
  return (
    <div className="px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header */}
      <div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-6 py-5 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Reports & Analytics
        </h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
          View comprehensive reports and insights about your business performance
        </p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="group bg-gradient-to-br from-white via-white to-blue-50/30 rounded-2xl shadow-md border border-[#4D8CF5]/20 overflow-hidden hover:shadow-xl hover:border-[#4D8CF5]/40 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4D8CF5]/20 to-[#4D8CF5]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-dollar-sign text-[#4D8CF5] text-xl"></i>
              </div>
              <span className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">
                ₱{totalRevenue.toLocaleString()}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Total Revenue</h3>
            <p className="text-xs text-[#1E3A8A]/50">Combined revenue from <strong>completed</strong> room and day tour bookings</p>
          </div>
        </div>
        
        <div className="group bg-gradient-to-br from-white via-white to-emerald-50/30 rounded-2xl shadow-md border border-[#10B981]/20 overflow-hidden hover:shadow-xl hover:border-[#10B981]/40 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10B981]/20 to-[#10B981]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-bed text-[#10B981] text-xl"></i>
              </div>
              <span className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">
                {totalRoomBookings}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Total Room Bookings</h3>
            <p className="text-xs text-[#1E3A8A]/50">Total room units booked (<strong>completed</strong> only)</p>
          </div>
        </div>
        
        <div className="group bg-gradient-to-br from-white via-white to-amber-50/30 rounded-2xl shadow-md border border-[#F59E0B]/20 overflow-hidden hover:shadow-xl hover:border-[#F59E0B]/40 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-users text-[#F59E0B] text-xl"></i>
              </div>
              <span className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">
                {totalDayTourGuests}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Total Day Tour Guests</h3>
            <p className="text-xs text-[#1E3A8A]/50">Guests from completed day tour bookings only</p>
          </div>
        </div>
      </div>
      
      {/* Tabs - Justified layout with active state visible on load */}
      <div className="relative flex w-full border-b border-[#4D8CF5]/20 mb-6" ref={tabsContainerRef}>
        {/* Sliding background */}
        <div
          ref={sliderRef}
          className="absolute bottom-0 h-0.5 bg-[#4D8CF5] transition-all duration-300 ease-in-out"
          style={{
            transform: 'translateX(0px)',
            width: '0px',
          }}
        />
        
        <button
          ref={(el) => (buttonRefs.current.roomTypes = el)}
          onClick={() => setActiveTab('roomTypes')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'roomTypes'
              ? 'text-[#1E3A8A] border-b-2 border-[#4D8CF5] -mb-px'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-bar"></i>
          Most Booked Room Types
        </button>
        
        <button
          ref={(el) => (buttonRefs.current.revenue = el)}
          onClick={() => setActiveTab('revenue')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'revenue'
              ? 'text-[#1E3A8A] border-b-2 border-[#4D8CF5] -mb-px'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-line"></i>
          Revenue Summary
        </button>
        
        <button
          ref={(el) => (buttonRefs.current.bookingSplit = el)}
          onClick={() => setActiveTab('bookingSplit')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'bookingSplit'
              ? 'text-[#1E3A8A] border-b-2 border-[#4D8CF5] -mb-px'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-pie"></i>
          Room Booking Type Split
        </button>
        
        <button
          ref={(el) => (buttonRefs.current.trends = el)}
          onClick={() => setActiveTab('trends')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'trends'
              ? 'text-[#1E3A8A] border-b-2 border-[#4D8CF5] -mb-px'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-line"></i>
          Monthly / Seasonal Trend
        </button>
      </div>
      
      {/* Tab Content - Enhanced with better styling */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 md:p-8">
        {/* Tab 1: Most Booked Room Types */}
        {activeTab === 'roomTypes' && (
          <div className="animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[#1E3A8A] font-playfair">Most Booked Room Types</h2>
                <p className="text-sm text-gray-500 mt-1">Track booking popularity across different room categories</p>
              </div>
              <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                <label className="text-sm font-medium text-gray-700">Select Year:</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                  {availableYears.map(year => (<option key={year} value={year}>{year}</option>))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-6">Monthly booking frequency by room type for <span className="font-semibold text-[#1E3A8A]">{selectedYear}</span></p>
            {selectedYear && yearlyMonthlyRoomData[selectedYear] && (
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={yearlyMonthlyRoomData[selectedYear]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} />
                    <Bar dataKey="Tent" stackId="a" fill={ROOM_TYPE_COLORS['Tent']} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Ground Floor Room" stackId="a" fill={ROOM_TYPE_COLORS['Ground Floor Room']} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Group Room" stackId="a" fill={ROOM_TYPE_COLORS['Group Room']} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Couple Room" stackId="a" fill={ROOM_TYPE_COLORS['Couple Room']} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        
        {/* Tab 2: Revenue Summary */}
        {activeTab === 'revenue' && (
          <div className="animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[#1E3A8A] font-playfair">Revenue Summary</h2>
                <p className="text-sm text-gray-500 mt-1">Track revenue trends from room bookings and day tours</p>
              </div>
              <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                <label className="text-sm font-medium text-gray-700">Select Year:</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                  {availableYears.map(year => (<option key={year} value={year}>{year}</option>))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-6">Monthly revenue breakdown for <span className="font-semibold text-[#1E3A8A]">{selectedYear}</span></p>
            
            {/* Annual Revenue Display - Below filter, above chart */}
            {selectedYear && annualRevenueTotal > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-r from-[#4D8CF5]/10 to-[#4D8CF5]/5 rounded-xl border border-[#4D8CF5]/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1E3A8A]/70">Total Revenue for {selectedYear}</p>
                    <p className="text-2xl font-bold text-[#1E3A8A]">₱{annualRevenueTotal.toLocaleString()}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-[#4D8CF5]/20 flex items-center justify-center">
                    <i className="fas fa-chart-line text-[#4D8CF5] text-xl"></i>
                  </div>
                </div>
              </div>
            )}
            
            {selectedYear && yearlyMonthlyRevenueData[selectedYear] && (
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={yearlyMonthlyRevenueData[selectedYear]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" tickFormatter={(value) => `₱${value.toLocaleString()}`} />
                    <Tooltip content={<RevenueTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} />
                    <Bar dataKey="roomRevenue" name="Room Booking Revenue" stackId="a" fill="#4D8CF5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="dayTourRevenue" name="Day Tour Revenue" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        
        {/* Tab 3: Room Booking Type Split */}
        {activeTab === 'bookingSplit' && (
          <div className="animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[#1E3A8A] font-playfair">Room Booking Type Split</h2>
                <p className="text-sm text-gray-500 mt-1">Distribution of booking types across your property</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                  <i className="fas fa-sliders-h text-[#4D8CF5] text-sm"></i>
                  <label className="text-sm font-medium text-gray-700">Filter by:</label>
                  <select value={selectedSplitFilter} onChange={(e) => setSelectedSplitFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                    <option value="year">Year</option><option value="month">Month</option>
                  </select>
                </div>
                {selectedSplitFilter === 'year' ? (
                  <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                    <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                    <label className="text-sm font-medium text-gray-700">Year:</label>
                    <select value={selectedSplitYear} onChange={(e) => setSelectedSplitYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                      {availableYears.map(year => (<option key={year} value={year}>{year}</option>))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                      <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                      <label className="text-sm font-medium text-gray-700">Year:</label>
                      <select value={selectedSplitYear} onChange={(e) => setSelectedSplitYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                        {availableYears.map(year => (<option key={year} value={year}>{year}</option>))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                      <i className="fas fa-calendar-week text-[#4D8CF5] text-sm"></i>
                      <label className="text-sm font-medium text-gray-700">Month:</label>
                      <select value={selectedSplitMonth} onChange={(e) => setSelectedSplitMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                        {MONTHS.map((month, idx) => (<option key={idx} value={idx}>{month}</option>))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Distribution of booking types for {selectedSplitFilter === 'year' ? `year ${selectedSplitYear}` : `${MONTHS[parseInt(selectedSplitMonth)]} ${selectedSplitYear}`}</p>
            <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm w-full hover:shadow-md transition-shadow duration-300">
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie data={bookingSplitData} cx="50%" cy="50%" labelLine={false} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} outerRadius={150} fill="#8884d8" dataKey="value">
                      {bookingSplitData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4 min-w-[240px]">
                {bookingSplitData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4 p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl hover:shadow-md transition-all duration-200 border border-gray-100">
                    <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div><span className="text-sm font-medium text-gray-700">{item.name}</span></div>
                    <span className="text-sm font-bold text-gray-900">{item.value} bookings</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Tab 4: Monthly / Seasonal Trend */}
        {activeTab === 'trends' && (
          <div className="animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[#1E3A8A] font-playfair">Monthly / Seasonal Trend</h2>
                <p className="text-sm text-gray-500 mt-1">Analyze booking patterns and seasonal fluctuations</p>
              </div>
              <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                <label className="text-sm font-medium text-gray-700">Select Year:</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white">
                  {availableYears.map(year => (<option key={year} value={year}>{year}</option>))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">Monthly booking patterns for <span className="font-semibold text-[#1E3A8A]">{selectedYear}</span></p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#4D8CF5]/20 to-[#4D8CF5]/5 flex items-center justify-center">
                    <i className="fas fa-bed text-[#4D8CF5] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Room Bookings</h3>
                    <p className="text-xs text-gray-500">Number of room units booked over time (completed only)</p>
                  </div>
                </div>
                {selectedYear && yearlyMonthlyTrendData[selectedYear] && (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={yearlyMonthlyTrendData[selectedYear]} margin={{ top: 30, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="roomBookings" name="Room Bookings" stroke="#4D8CF5" strokeWidth={3} dot={{ r: 5, fill: '#4D8CF5', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 flex items-center justify-center">
                    <i className="fas fa-users text-[#F59E0B] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Day Tour Guests</h3>
                    <p className="text-xs text-gray-500">Number of guests on day tours (completed only)</p>
                  </div>
                </div>
                {selectedYear && yearlyMonthlyTrendData[selectedYear] && (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={yearlyMonthlyTrendData[selectedYear]} margin={{ top: 30, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="dayTourGuests" name="Day Tour Guests" stroke="#F59E0B" strokeWidth={3} dot={{ r: 5, fill: '#F59E0B', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}