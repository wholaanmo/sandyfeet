// app/dashboard/admin/reports/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
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
  const [roomTypeData, setRoomTypeData] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [bookingSplitData, setBookingSplitData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  
  // Yearly monthly data for year-based filtering
  const [yearlyMonthlyRoomData, setYearlyMonthlyRoomData] = useState({});
  const [yearlyMonthlyRevenueData, setYearlyMonthlyRevenueData] = useState({});
  const [yearlyMonthlyTrendData, setYearlyMonthlyTrendData] = useState({});
  
  // Filter states
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSplitFilter, setSelectedSplitFilter] = useState('year');
  const [selectedSplitYear, setSelectedSplitYear] = useState('');
  const [selectedSplitMonth, setSelectedSplitMonth] = useState('');
  
  // Available years
  const [availableYears, setAvailableYears] = useState([]);
  
  // Tab refs for sliding underline
  const tabsContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const buttonRefs = useRef({});
  
  // Colors
  const COLORS = ['#4D8CF5', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4'];
  const ROOM_TYPE_COLORS = {
    'Tent': '#10B981',
    'Ground Floor Room': '#4D8CF5',
    'Group Room': '#8B5CF6',
    'Couple Room': '#F59E0B'
  };
  const SPLIT_COLORS = ['#8B5CF6', '#4D8CF5', '#F59E0B'];
  
  // Month names
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Update slider position for justified tabs
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
  
  useEffect(() => {
    fetchAllData();
  }, []);
  
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch room bookings
      const bookingsRef = collection(db, 'bookings');
      const bookingsSnapshot = await getDocs(bookingsRef);
      const bookings = [];
      bookingsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.type === 'room') {
          bookings.push({ id: doc.id, ...data });
        }
      });
      
      // Fetch day tour bookings
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
    // --- Total Revenue: only COMPLETED transactions ---
    let revenue = 0;
    let roomBookingCount = 0;
    let dayTourGuestCount = 0;
    
    const processedBookings = [];
    const multiRoomGroups = new Map();
    
    // First pass: collect all bookings and sum revenue for completed ones
    bookings.forEach(booking => {
      // Sum revenue only if status is 'completed'
      if (booking.status === 'completed') {
        revenue += booking.totalPrice || 0;
      }
      
      // Count room bookings regardless of status (for total card)
      if (!booking.isMultiRoomBooking) {
        roomBookingCount++;
      }
      
      // Grouping for charts (still include all bookings for chart data)
      if (booking.isMultiRoomBooking && booking.parentBookingId) {
        if (!multiRoomGroups.has(booking.parentBookingId)) {
          multiRoomGroups.set(booking.parentBookingId, {
            bookings: [],
            totalPrice: 0,
            createdAt: booking.createdAt,
            status: booking.status
          });
        }
        const group = multiRoomGroups.get(booking.parentBookingId);
        group.bookings.push(booking);
        group.totalPrice += booking.totalPrice || 0;
        // If any child is not completed, group status is not completed? But for revenue we already summed individually.
      } else if (!booking.isMultiRoomBooking) {
        processedBookings.push(booking);
      }
    });
    
    // Process multi-room groups for chart data (still include all)
    multiRoomGroups.forEach((group, parentId) => {
      processedBookings.push({
        ...group.bookings[0],
        id: parentId,
        totalPrice: group.totalPrice,
        isGrouped: true,
        childBookings: group.bookings
      });
      // Count as one booking for total count
      roomBookingCount++;
    });
    
    // Day tour guests: total guests (all statuses, unchanged)
    dayTours.forEach(tour => {
      const seniors = tour.seniors || 0;
      const adults = tour.adults || 0;
      const kids = tour.kids || 0;
      dayTourGuestCount += seniors + adults + kids;
    });
    
    setTotalRevenue(revenue);
    setTotalRoomBookings(roomBookingCount);
    setTotalDayTourGuests(dayTourGuestCount);
    
    // Process yearly monthly data for room types (all bookings, regardless of status)
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
      
      // Room types
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
      
      // Revenue for charts (all bookings, not filtered by status)
      const totalPrice = booking.totalPrice || 0;
      yearlyMonthlyRevenue[year].roomRevenue[month] += totalPrice;
      yearlyMonthlyRevenue[year].total[month] += totalPrice;
      
      yearlyMonthlyTrend[year].roomBookings[month]++;
    });
    
    // Day tour data for charts (all statuses)
    dayTours.forEach(tour => {
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
    
    // Booking split data (all bookings, all statuses)
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
  
  const getFilteredSplitData = () => bookingSplitData;
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const isRevenue = payload[0]?.name === 'roomRevenue' || payload[0]?.name === 'dayTourRevenue';
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
  
  const splitFilteredData = getFilteredSplitData();
  
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
      
      {/* Summary Cards - Enhanced UI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Total Revenue Card */}
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
            <p className="text-xs text-[#1E3A8A]/50">Lifetime revenue from <strong>completed</strong> bookings</p>
            <div className="mt-4 h-1 w-full bg-[#4D8CF5]/10 rounded-full overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-[#4D8CF5] to-[#7AAAF8] rounded-full transform origin-left transition-transform duration-500" style={{ transform: `scaleX(${Math.min(totalRevenue / 1000000, 1)})` }}></div>
            </div>
          </div>
        </div>
        
        {/* Total Room Bookings Card */}
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
            <p className="text-xs text-[#1E3A8A]/50">All room reservations (all statuses)</p>
            <div className="mt-4 h-1 w-full bg-[#10B981]/10 rounded-full overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-[#10B981] to-[#34D399] rounded-full transform origin-left transition-transform duration-500" style={{ transform: `scaleX(${Math.min(totalRoomBookings / 500, 1)})` }}></div>
            </div>
          </div>
        </div>
        
        {/* Total Day Tour Guest Bookings Card */}
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
            <p className="text-xs text-[#1E3A8A]/50">All guests who joined day tours (all statuses)</p>
            <div className="mt-4 h-1 w-full bg-[#F59E0B]/10 rounded-full overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] rounded-full transform origin-left transition-transform duration-500" style={{ transform: `scaleX(${Math.min(totalDayTourGuests / 1000, 1)})` }}></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Tabs - Justified layout */}
      <div
        className="relative flex w-full mb-8 border-b border-[#4D8CF5]/20"
        ref={tabsContainerRef}
      >
        {/* Sliding background */}
        <div
          ref={sliderRef}
          className="absolute top-1 bottom-1 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
          style={{ transform: 'translateX(0px)', width: '0px' }}
        />
        
        {/* Room Types Tab */}
        <button
          ref={(el) => (buttonRefs.current.roomTypes = el)}
          onClick={() => setActiveTab('roomTypes')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'roomTypes'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-bar"></i>
          <span>Most Booked Room Types</span>
        </button>
        
        {/* Revenue Summary Tab */}
        <button
          ref={(el) => (buttonRefs.current.revenue = el)}
          onClick={() => setActiveTab('revenue')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'revenue'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-line"></i>
          <span>Revenue Summary</span>
        </button>
        
        {/* Room Booking Type Split Tab */}
        <button
          ref={(el) => (buttonRefs.current.bookingSplit = el)}
          onClick={() => setActiveTab('bookingSplit')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'bookingSplit'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-pie"></i>
          <span>Room Booking Type Split</span>
        </button>
        
        {/* Monthly / Seasonal Trend Tab */}
        <button
          ref={(el) => (buttonRefs.current.trends = el)}
          onClick={() => setActiveTab('trends')}
          className={`relative z-10 flex-1 px-4 py-3 font-medium transition-all duration-200 text-center flex items-center justify-center gap-2 ${
            activeTab === 'trends'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
          }`}
        >
          <i className="fas fa-chart-line"></i>
          <span>Monthly / Seasonal Trend</span>
        </button>
      </div>
      
      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 md:p-8">
        {/* Tab 1: Most Booked Room Types */}
        {activeTab === 'roomTypes' && (
          <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-xl font-bold text-[#1E3A8A]">Most Booked Room Types</h2>
              <div>
                <label className="text-sm font-medium text-gray-700 mr-3">Select Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Monthly booking frequency by room type for <span className="font-semibold">{selectedYear}</span>
            </p>
            {selectedYear && yearlyMonthlyRoomData[selectedYear] && (
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={yearlyMonthlyRoomData[selectedYear]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Tent" stackId="a" fill={ROOM_TYPE_COLORS['Tent']} />
                    <Bar dataKey="Ground Floor Room" stackId="a" fill={ROOM_TYPE_COLORS['Ground Floor Room']} />
                    <Bar dataKey="Group Room" stackId="a" fill={ROOM_TYPE_COLORS['Group Room']} />
                    <Bar dataKey="Couple Room" stackId="a" fill={ROOM_TYPE_COLORS['Couple Room']} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        
        {/* Tab 2: Revenue Summary */}
        {activeTab === 'revenue' && (
          <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-xl font-bold text-[#1E3A8A]">Revenue Summary</h2>
              <div>
                <label className="text-sm font-medium text-gray-700 mr-3">Select Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Monthly revenue breakdown for <span className="font-semibold">{selectedYear}</span>
            </p>
            {selectedYear && yearlyMonthlyRevenueData[selectedYear] && (
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={yearlyMonthlyRevenueData[selectedYear]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="roomRevenue" name="Room Booking Revenue" stackId="a" fill="#4D8CF5" />
                    <Bar dataKey="dayTourRevenue" name="Day Tour Revenue" stackId="a" fill="#F59E0B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        
        {/* Tab 3: Room Booking Type Split */}
        {activeTab === 'bookingSplit' && (
          <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-xl font-bold text-[#1E3A8A]">Room Booking Type Split</h2>
              <div className="flex gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mr-3">Filter by:</label>
                  <select
                    value={selectedSplitFilter}
                    onChange={(e) => setSelectedSplitFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                  >
                    <option value="year">Year</option>
                    <option value="month">Month</option>
                  </select>
                </div>
                {selectedSplitFilter === 'year' ? (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mr-3">Year:</label>
                    <select
                      value={selectedSplitYear}
                      onChange={(e) => setSelectedSplitYear(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                    >
                      {availableYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mr-3">Year:</label>
                      <select
                        value={selectedSplitYear}
                        onChange={(e) => setSelectedSplitYear(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                      >
                        {availableYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mr-3">Month:</label>
                      <select
                        value={selectedSplitMonth}
                        onChange={(e) => setSelectedSplitMonth(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                      >
                        {MONTHS.map((month, idx) => (
                          <option key={idx} value={idx}>{month}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">
              Distribution of booking types for {selectedSplitFilter === 'year' ? `year ${selectedSplitYear}` : `${MONTHS[parseInt(selectedSplitMonth)]} ${selectedSplitYear}`}
            </p>
            <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100 shadow-sm w-full">
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={splitFilteredData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={150}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {splitFilteredData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 min-w-[180px]">
                {splitFilteredData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-sm font-medium text-gray-700">{item.name}</span>
                    <span className="text-sm font-bold text-gray-900 ml-auto">{item.value} bookings</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Tab 4: Monthly / Seasonal Trend */}
        {activeTab === 'trends' && (
          <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
              <h2 className="text-xl font-bold text-[#1E3A8A]">Monthly / Seasonal Trend</h2>
              <div>
                <label className="text-sm font-medium text-gray-700 mr-3">Select Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-8">
              Monthly booking patterns for <span className="font-semibold">{selectedYear}</span>
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Room Bookings Trend */}
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-[#4D8CF5]/10 flex items-center justify-center">
                    <i className="fas fa-bed text-[#4D8CF5] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Room Bookings</h3>
                    <p className="text-xs text-gray-500">Number of room reservations over time</p>
                  </div>
                </div>
                {selectedYear && yearlyMonthlyTrendData[selectedYear] && (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={yearlyMonthlyTrendData[selectedYear]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="roomBookings"
                        name="Room Bookings"
                        stroke="#4D8CF5"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#4D8CF5' }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              
              {/* Day Tour Guests Trend */}
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                    <i className="fas fa-users text-[#F59E0B] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Day Tour Guests</h3>
                    <p className="text-xs text-gray-500">Number of guests on day tours</p>
                  </div>
                </div>
                {selectedYear && yearlyMonthlyTrendData[selectedYear] && (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={yearlyMonthlyTrendData[selectedYear]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="dayTourGuests"
                        name="Day Tour Guests"
                        stroke="#F59E0B"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#F59E0B' }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}