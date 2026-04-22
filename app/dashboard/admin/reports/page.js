// app/dashboard/admin/reports/page.js
'use client';

import { useState, useEffect } from 'react';
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
  ComposedChart,
  StackedBarChart,
  PieChart,
  Pie,
  Cell,
  Area
} from 'recharts';

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState('roomTypes');
  const [timeView, setTimeView] = useState('monthly'); // 'monthly' or 'yearly'
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
  
  const [yearlyRoomTypeData, setYearlyRoomTypeData] = useState([]);
  const [yearlyRevenueData, setYearlyRevenueData] = useState([]);
  const [yearlyTrendData, setYearlyTrendData] = useState([]);
  
  // Yearly monthly revenue data for Yearly View
  const [yearlyMonthlyRevenueData, setYearlyMonthlyRevenueData] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  
  // Colors
  const COLORS = ['#4D8CF5', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4'];
  const ROOM_TYPE_COLORS = {
    'Tent': '#10B981',
    'Ground Floor Room': '#4D8CF5',
    'Group Room': '#8B5CF6',
    'Couple Room': '#F59E0B'
  };
  const SPLIT_COLORS = ['#8B5CF6', '#4D8CF5', '#F59E0B'];
  
  // Fetch data on component mount
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
      
      // Process data
      processData(bookings, dayTours);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const processData = (bookings, dayTours) => {
    // Calculate totals
    let revenue = 0;
    let roomBookingCount = 0;
    let dayTourGuestCount = 0;
    
    // Process bookings for revenue and counts
    const processedBookings = [];
    const multiRoomGroups = new Map();
    
    bookings.forEach(booking => {
      if (booking.isMultiRoomBooking && booking.parentBookingId) {
        if (!multiRoomGroups.has(booking.parentBookingId)) {
          multiRoomGroups.set(booking.parentBookingId, {
            bookings: [],
            totalPrice: 0,
            createdAt: booking.createdAt
          });
        }
        const group = multiRoomGroups.get(booking.parentBookingId);
        group.bookings.push(booking);
        group.totalPrice += booking.totalPrice || 0;
      } else if (!booking.isMultiRoomBooking) {
        processedBookings.push(booking);
        revenue += booking.totalPrice || 0;
        roomBookingCount++;
      }
    });
    
    // Process multi-room groups
    multiRoomGroups.forEach((group, parentId) => {
      processedBookings.push({
        ...group.bookings[0],
        id: parentId,
        totalPrice: group.totalPrice,
        isGrouped: true,
        childBookings: group.bookings
      });
      revenue += group.totalPrice;
      roomBookingCount++;
    });
    
    // Calculate day tour guests
    dayTours.forEach(tour => {
      const seniors = tour.seniors || 0;
      const adults = tour.adults || 0;
      const kids = tour.kids || 0;
      dayTourGuestCount += seniors + adults + kids;
    });
    
    setTotalRevenue(revenue);
    setTotalRoomBookings(roomBookingCount);
    setTotalDayTourGuests(dayTourGuestCount);
    
    // Process room type data (monthly)
    const monthlyRoomData = {};
    const yearlyRoomData = {};
    
    processedBookings.forEach(booking => {
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const yearKey = String(year);
      
      // Get room types from booking
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
      
      // Count room types
      roomTypes.forEach(roomType => {
        // Monthly
        if (!monthlyRoomData[monthKey]) {
          monthlyRoomData[monthKey] = {
            Tent: 0,
            'Ground Floor Room': 0,
            'Group Room': 0,
            'Couple Room': 0,
            month: monthKey
          };
        }
        if (roomType === 'Tent') monthlyRoomData[monthKey].Tent++;
        else if (roomType === 'Ground Floor Rooms') monthlyRoomData[monthKey]['Ground Floor Room']++;
        else if (roomType === 'Group Room') monthlyRoomData[monthKey]['Group Room']++;
        else if (roomType === 'Couple Room') monthlyRoomData[monthKey]['Couple Room']++;
        
        // Yearly
        if (!yearlyRoomData[yearKey]) {
          yearlyRoomData[yearKey] = {
            Tent: 0,
            'Ground Floor Room': 0,
            'Group Room': 0,
            'Couple Room': 0,
            year: yearKey
          };
        }
        if (roomType === 'Tent') yearlyRoomData[yearKey].Tent++;
        else if (roomType === 'Ground Floor Rooms') yearlyRoomData[yearKey]['Ground Floor Room']++;
        else if (roomType === 'Group Room') yearlyRoomData[yearKey]['Group Room']++;
        else if (roomType === 'Couple Room') yearlyRoomData[yearKey]['Couple Room']++;
      });
    });
    
    setRoomTypeData(Object.values(monthlyRoomData).sort((a, b) => a.month.localeCompare(b.month)));
    setYearlyRoomTypeData(Object.values(yearlyRoomData).sort((a, b) => a.year.localeCompare(b.year)));
    
    // Process revenue data (monthly)
    const monthlyRevenue = {};
    const yearlyRevenue = {};
    const yearlyMonthlyRevenue = {};
    
    processedBookings.forEach(booking => {
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const yearKey = String(year);
      const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'short' });
      
      const totalPrice = booking.totalPrice || 0;
      
      // Monthly
      if (!monthlyRevenue[monthKey]) {
        monthlyRevenue[monthKey] = {
          month: monthKey,
          roomRevenue: 0,
          dayTourRevenue: 0,
          total: 0
        };
      }
      monthlyRevenue[monthKey].roomRevenue += totalPrice;
      monthlyRevenue[monthKey].total += totalPrice;
      
      // Yearly monthly breakdown
      if (!yearlyMonthlyRevenue[yearKey]) {
        yearlyMonthlyRevenue[yearKey] = {};
      }
      if (!yearlyMonthlyRevenue[yearKey][month]) {
        yearlyMonthlyRevenue[yearKey][month] = {
          month: monthName,
          roomRevenue: 0,
          dayTourRevenue: 0,
          total: 0,
          monthIndex: month
        };
      }
      yearlyMonthlyRevenue[yearKey][month].roomRevenue += totalPrice;
      yearlyMonthlyRevenue[yearKey][month].total += totalPrice;
      
      // Yearly
      if (!yearlyRevenue[yearKey]) {
        yearlyRevenue[yearKey] = {
          year: yearKey,
          roomRevenue: 0,
          dayTourRevenue: 0,
          total: 0
        };
      }
      yearlyRevenue[yearKey].roomRevenue += totalPrice;
      yearlyRevenue[yearKey].total += totalPrice;
    });
    
    // Add day tour revenue
    const dayTourYears = new Set();
    dayTours.forEach(tour => {
      const createdAt = tour.createdAt?.toDate ? tour.createdAt.toDate() : new Date(tour.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const yearKey = String(year);
      const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'short' });
      dayTourYears.add(yearKey);
      
      const totalPrice = tour.totalPrice || 0;
      
      if (!monthlyRevenue[monthKey]) {
        monthlyRevenue[monthKey] = {
          month: monthKey,
          roomRevenue: 0,
          dayTourRevenue: 0,
          total: 0
        };
      }
      monthlyRevenue[monthKey].dayTourRevenue += totalPrice;
      monthlyRevenue[monthKey].total += totalPrice;
      
      // Yearly monthly breakdown
      if (!yearlyMonthlyRevenue[yearKey]) {
        yearlyMonthlyRevenue[yearKey] = {};
      }
      if (!yearlyMonthlyRevenue[yearKey][month]) {
        yearlyMonthlyRevenue[yearKey][month] = {
          month: monthName,
          roomRevenue: 0,
          dayTourRevenue: 0,
          total: 0,
          monthIndex: month
        };
      }
      yearlyMonthlyRevenue[yearKey][month].dayTourRevenue += totalPrice;
      yearlyMonthlyRevenue[yearKey][month].total += totalPrice;
      
      if (!yearlyRevenue[yearKey]) {
        yearlyRevenue[yearKey] = {
          year: yearKey,
          roomRevenue: 0,
          dayTourRevenue: 0,
          total: 0
        };
      }
      yearlyRevenue[yearKey].dayTourRevenue += totalPrice;
      yearlyRevenue[yearKey].total += totalPrice;
    });
    
    setRevenueData(Object.values(monthlyRevenue).sort((a, b) => a.month.localeCompare(b.month)));
    setYearlyRevenueData(Object.values(yearlyRevenue).sort((a, b) => a.year.localeCompare(b.year)));
    
    // Convert yearly monthly data to array
    const yearlyMonthlyArray = {};
    for (const year in yearlyMonthlyRevenue) {
      yearlyMonthlyArray[year] = Object.values(yearlyMonthlyRevenue[year]).sort((a, b) => a.monthIndex - b.monthIndex);
    }
    setYearlyMonthlyRevenueData(yearlyMonthlyArray);
    
    // Set default selected year
    const availableYears = Object.keys(yearlyMonthlyArray).sort();
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
    
    // Process booking split data
    let entireResortCount = 0;
    let multiRoomCount = 0;
    let singleRoomCount = 0;
    
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
    
    // Process trend data (monthly)
    const monthlyTrend = {};
    const yearlyTrend = {};
    
    processedBookings.forEach(booking => {
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const yearKey = String(year);
      
      if (!monthlyTrend[monthKey]) {
        monthlyTrend[monthKey] = {
          month: monthKey,
          roomBookings: 0,
          dayTourGuests: 0
        };
      }
      monthlyTrend[monthKey].roomBookings++;
    });
    
    dayTours.forEach(tour => {
      const createdAt = tour.createdAt?.toDate ? tour.createdAt.toDate() : new Date(tour.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const yearKey = String(year);
      
      if (!monthlyTrend[monthKey]) {
        monthlyTrend[monthKey] = {
          month: monthKey,
          roomBookings: 0,
          dayTourGuests: 0
        };
      }
      const guests = (tour.seniors || 0) + (tour.adults || 0) + (tour.kids || 0);
      monthlyTrend[monthKey].dayTourGuests += guests;
      
      if (!yearlyTrend[yearKey]) {
        yearlyTrend[yearKey] = {
          year: yearKey,
          roomBookings: 0,
          dayTourGuests: 0
        };
      }
      yearlyTrend[yearKey].dayTourGuests += guests;
    });
    
    // Add yearly room bookings
    processedBookings.forEach(booking => {
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      const year = createdAt.getFullYear();
      const yearKey = String(year);
      
      if (!yearlyTrend[yearKey]) {
        yearlyTrend[yearKey] = {
          year: yearKey,
          roomBookings: 0,
          dayTourGuests: 0
        };
      }
      yearlyTrend[yearKey].roomBookings++;
    });
    
    setTrendData(Object.values(monthlyTrend).sort((a, b) => a.month.localeCompare(b.month)));
    setYearlyTrendData(Object.values(yearlyTrend).sort((a, b) => a.year.localeCompare(b.year)));
  };
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-800">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: ₱{entry.value.toLocaleString()}
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
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-5 py-4 shadow-sm">
        <h1 className="text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Reports & Analytics
        </h1>
        <p className="text-[#4D6FA8] text-sm leading-relaxed mt-1">
          View comprehensive reports and insights about your business performance
        </p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Revenue Card */}
        <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#4D8CF5]/15 overflow-hidden hover:shadow-xl hover:border-[#4D8CF5]/30 transition-all duration-300">
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
            <p className="text-xs text-[#1E3A8A]/50">Lifetime revenue from all bookings</p>
          </div>
        </div>
        
        {/* Total Room Bookings Card */}
        <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#10B981]/15 overflow-hidden hover:shadow-xl hover:border-[#10B981]/30 transition-all duration-300">
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
            <p className="text-xs text-[#1E3A8A]/50">Total number of room reservations</p>
          </div>
        </div>
        
        {/* Total Day Tour Guest Bookings Card */}
        <div className="group bg-gradient-to-br from-white to-[#F8FCFF] rounded-2xl shadow-lg border border-[#F59E0B]/15 overflow-hidden hover:shadow-xl hover:border-[#F59E0B]/30 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-users text-[#F59E0B] text-xl"></i>
              </div>
              <span className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">
                {totalDayTourGuests}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Total Day Tour Guest Bookings</h3>
            <p className="text-xs text-[#1E3A8A]/50">Total guests who joined day tours</p>
          </div>
        </div>
      </div>
      
      {/* Time View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1 inline-flex">
          <button
            onClick={() => setTimeView('monthly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              timeView === 'monthly'
                ? 'bg-[#4D8CF5] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Monthly View
          </button>
          <button
            onClick={() => setTimeView('yearly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              timeView === 'yearly'
                ? 'bg-[#4D8CF5] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Yearly View
          </button>
        </div>
      </div>
      
      {/* Tabs - Justified Layout */}
      <div className="mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => setActiveTab('roomTypes')}
              className={`py-3 rounded-lg font-medium transition-all duration-200 text-center ${
                activeTab === 'roomTypes'
                  ? 'bg-gradient-to-r from-[#4D8CF5] to-[#7AAAF8] text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <i className={`fas fa-chart-bar mr-2 ${activeTab === 'roomTypes' ? 'text-white' : 'text-[#4D8CF5]'}`}></i>
              Most Booked Room Types
            </button>
            <button
              onClick={() => setActiveTab('revenue')}
              className={`py-3 rounded-lg font-medium transition-all duration-200 text-center ${
                activeTab === 'revenue'
                  ? 'bg-gradient-to-r from-[#4D8CF5] to-[#7AAAF8] text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <i className={`fas fa-chart-line mr-2 ${activeTab === 'revenue' ? 'text-white' : 'text-[#4D8CF5]'}`}></i>
              Revenue Summary
            </button>
            <button
              onClick={() => setActiveTab('bookingSplit')}
              className={`py-3 rounded-lg font-medium transition-all duration-200 text-center ${
                activeTab === 'bookingSplit'
                  ? 'bg-gradient-to-r from-[#4D8CF5] to-[#7AAAF8] text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <i className={`fas fa-chart-pie mr-2 ${activeTab === 'bookingSplit' ? 'text-white' : 'text-[#4D8CF5]'}`}></i>
              Room Booking Type Split
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`py-3 rounded-lg font-medium transition-all duration-200 text-center ${
                activeTab === 'trends'
                  ? 'bg-gradient-to-r from-[#4D8CF5] to-[#7AAAF8] text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <i className={`fas fa-chart-line mr-2 ${activeTab === 'trends' ? 'text-white' : 'text-[#4D8CF5]'}`}></i>
              Monthly / Seasonal Trend
            </button>
          </div>
        </div>
      </div>
      
      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
        {/* Tab 1: Most Booked Room Types */}
        {activeTab === 'roomTypes' && (
          <div>
            <h2 className="text-xl font-bold text-[#1E3A8A] mb-4">Most Booked Room Types</h2>
            <p className="text-sm text-gray-500 mb-6">
              Showing {timeView === 'monthly' ? 'monthly' : 'yearly'} booking frequency by room type
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={timeView === 'monthly' ? roomTypeData : yearlyRoomTypeData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={timeView === 'monthly' ? 'month' : 'year'} />
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
        
        {/* Tab 2: Revenue Summary */}
        {activeTab === 'revenue' && (
          <div>
            <h2 className="text-xl font-bold text-[#1E3A8A] mb-4">Revenue Summary</h2>
            {timeView === 'monthly' ? (
              <>
                <p className="text-sm text-gray-500 mb-6">
                  Showing monthly revenue breakdown
                </p>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={revenueData}
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
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Showing yearly revenue breakdown by month
                </p>
                {/* Year Selector */}
                <div className="mb-6">
                  <label className="text-sm font-medium text-gray-700 mr-3">Select Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent"
                  >
                    {Object.keys(yearlyMonthlyRevenueData).sort().reverse().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                {selectedYear && yearlyMonthlyRevenueData[selectedYear] && (
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
                )}
              </>
            )}
          </div>
        )}
        
        {/* Tab 3: Room Booking Type Split */}
        {activeTab === 'bookingSplit' && (
          <div>
            <h2 className="text-xl font-bold text-[#1E3A8A] mb-4">Room Booking Type Split</h2>
            <p className="text-sm text-gray-500 mb-6">
              Distribution of booking types across all reservations
            </p>
            <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={bookingSplitData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={150}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {bookingSplitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {bookingSplitData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
                    <span className="text-sm font-medium text-gray-700">{item.name}</span>
                    <span className="text-sm font-bold text-gray-900">{item.value} bookings</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Tab 4: Monthly / Seasonal Trend - Side by Side Layout */}
        {activeTab === 'trends' && (
          <div>
            <h2 className="text-xl font-bold text-[#1E3A8A] mb-4">Monthly / Seasonal Trend</h2>
            <p className="text-sm text-gray-500 mb-6">
              Tracking {timeView === 'monthly' ? 'monthly' : 'yearly'} booking patterns
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Room Bookings */}
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-[#4D8CF5]/10 flex items-center justify-center">
                    <i className="fas fa-bed text-[#4D8CF5] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Room Bookings</h3>
                    <p className="text-xs text-gray-500">Number of room reservations over time</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={timeView === 'monthly' ? trendData : yearlyTrendData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={timeView === 'monthly' ? 'month' : 'year'} />
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
              </div>
              
              {/* Right: Day Tour Guests */}
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                    <i className="fas fa-users text-[#F59E0B] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Day Tour Guests</h3>
                    <p className="text-xs text-gray-500">Number of guests on day tours</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={timeView === 'monthly' ? trendData : yearlyTrendData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={timeView === 'monthly' ? 'month' : 'year'} />
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}