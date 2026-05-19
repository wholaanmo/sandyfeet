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
import * as XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import fontBase64 from '../../../../src/fonts/DejaVuSans.js';

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState('roomTypes');
  const [loading, setLoading] = useState(true);

  // Data states (unchanged)
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalRoomBookings, setTotalRoomBookings] = useState(0);
  const [totalDayTourGuests, setTotalDayTourGuests] = useState(0);

  // Chart data states (unchanged)
  const [yearlyMonthlyRoomData, setYearlyMonthlyRoomData] = useState({});
  const [yearlyMonthlyRevenueData, setYearlyMonthlyRevenueData] = useState({});
  const [yearlyMonthlyTrendData, setYearlyMonthlyTrendData] = useState({});
  const [bookingSplitData, setBookingSplitData] = useState([]);

  // Store monthly booking split data for accurate PDF/Excel export
  const [monthlyBookingSplitData, setMonthlyBookingSplitData] = useState({});

  // Annual revenue summary states (unchanged)
  const [annualRoomRevenue, setAnnualRoomRevenue] = useState(0);
  const [annualDayTourRevenue, setAnnualDayTourRevenue] = useState(0);
  const [annualTotalRevenue, setAnnualTotalRevenue] = useState(0);

  // Annual room type totals (unchanged)
  const [annualRoomTypeTotals, setAnnualRoomTypeTotals] = useState({
    Tent: 0,
    'Ground Floor Room': 0,
    'Group Room': 0,
    'Couple Room': 0
  });

  // Annual trend totals (unchanged)
  const [annualTrendTotals, setAnnualTrendTotals] = useState({
    roomBookings: 0,
    dayTourGuests: 0
  });

  // Filter states (unchanged)
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSplitFilter, setSelectedSplitFilter] = useState('year');
  const [selectedSplitYear, setSelectedSplitYear] = useState('');
  const [selectedSplitMonth, setSelectedSplitMonth] = useState('');

  // Available years (unchanged)
  const [availableYears, setAvailableYears] = useState([]);

  // Refs for capturing charts (unchanged)
  const roomTypesChartRef = useRef(null);
  const revenueChartRef = useRef(null);
  const bookingSplitChartRef = useRef(null);
  const roomBookingsTrendRef = useRef(null);
  const dayTourTrendRef = useRef(null);

  // Tab refs (unchanged)
  const tabsContainerRef = useRef(null);
  const sliderRef = useRef(null);
  const buttonRefs = useRef({});

  // Colors (unchanged)
  const COLORS = ['#8B5CF6', '#4D8CF5', '#F59E0B'];
  const ROOM_TYPE_COLORS = {
    'Tent': '#10B981',
    'Ground Floor Room': '#4D8CF5',
    'Group Room': '#8B5CF6',
    'Couple Room': '#F59E0B'
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // --- State for export confirmation modal ---
  const [confirmExport, setConfirmExport] = useState({
    show: false,
    type: '',        // 'pdf' or 'excel'
    section: '',
    chartRefs: [],
    tableData: [],
    tableHeaders: [],
    includeChart: false
  });

  // Helper function to open confirmation modal directly (no visualization modal)
  const openExportConfirm = (type, section, chartRefs, tableData, tableHeaders) => {
    setConfirmExport({
      show: true,
      type,
      section,
      chartRefs,
      tableData,
      tableHeaders,
      includeChart: false  // Always false - no charts in PDF
    });
  };

  // Helper function to execute export after confirmation
  const executeExport = () => {
    const { type, section, chartRefs, tableData, tableHeaders, includeChart } = confirmExport;
    if (type === 'pdf') {
      if (section === 'Most Booked Room Types') {
        downloadRoomTypesPDF();
      } else if (section === 'Revenue Summary') {
        downloadRevenuePDF();
      } else if (section === 'Room Booking Type Split') {
        downloadBookingSplitPDF();
      } else if (section === 'Monthly Seasonal Trend') {
        downloadTrendPDF();
      }
    } else if (type === 'excel') {
      if (section === 'Most Booked Room Types') {
        downloadRoomTypesExcel();
      } else if (section === 'Revenue Summary') {
        downloadRevenueExcel();
      } else if (section === 'Room Booking Type Split') {
        downloadBookingSplitExcel();
      } else if (section === 'Monthly Seasonal Trend') {
        downloadTrendExcel();
      }
    }
    setConfirmExport({ show: false, type: '', section: '', chartRefs: [], tableData: [], tableHeaders: [], includeChart: false });
  };

  // Helper function to format date (date only, no time)
  const getFormattedDate = () => {
    const date = new Date();
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Helper function to format currency for Excel (adds ₱ prefix for non-zero values)
  const formatCurrencyForExcel = (value) => {
    if (value === 0 || value === '0') return '0';
    return `₱${value.toLocaleString()}`;
  };

  // ==================== UPDATED PDF HEADER LAYOUT (CENTERED, NO LOGO) ====================
  const drawImprovedHeader = async (pdf, reportTitle, margin, pageWidth) => {
    let yOffset = 25;

    // "Sandyfeet Reservation" (Centered)
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 58, 138); // #1E3A8A Dark Blue
    pdf.text('Sandyfeet Reservation', pageWidth / 2, yOffset, { align: 'center' });

    // Report title (Centered, directly below)
    yOffset += 10;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(51, 65, 85); // Slate 700
    pdf.text(reportTitle, pageWidth / 2, yOffset, { align: 'center' });

    // Date Generated (Centered, directly below)
    yOffset += 7;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 116, 139); // Slate 500
    const dateText = `Generated: ${getFormattedDate()}`;
    pdf.text(dateText, pageWidth / 2, yOffset, { align: 'center' });

    yOffset += 10;

    // Add clean separator line
    pdf.setDrawColor(203, 213, 225); // Slate 300
    pdf.setLineWidth(0.5);
    pdf.line(margin, yOffset, pageWidth - margin, yOffset);
    yOffset += 12;

    return yOffset;
  };

  // Helper function to format currency for PDF (adds ₱ prefix for non-zero values, no parentheses)
  const formatCurrencyForPDF = (value) => {
    if (value === 0 || value === '0') return '0';
    return `₱${value.toLocaleString()}`;
  };

  // --- PDF generator for Most Booked Room Types (NO CHARTS) ---
  const downloadRoomTypesPDF = async () => {
    const pdf = new jsPDF('portrait');
    let yOffset = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;

    // Draw improved header
    yOffset = await drawImprovedHeader(pdf, 'Most Booked Room Types Report', margin, pageWidth);
    pdf.setTextColor(0, 0, 0);

    // Table data
    const rawTableData = getRoomTypesTableData();
    const headers = ['Month', 'Tent', 'Ground Floor', 'Couple Room', 'Group Room', 'Total'];
    const rows = rawTableData.map(row => [
      row.month, row.tent, row.groundFloorRoom, row.coupleRoom, row.groupRoom, row.total,
    ]);

    const totalTent = rows.reduce((sum, r) => sum + r[1], 0);
    const totalGround = rows.reduce((sum, r) => sum + r[2], 0);
    const totalCouple = rows.reduce((sum, r) => sum + r[3], 0);
    const totalGroup = rows.reduce((sum, r) => sum + r[4], 0);
    const totalAll = rows.reduce((sum, r) => sum + r[5], 0);
    rows.push(['Total', totalTent, totalGround, totalCouple, totalGroup, totalAll]);

    const { default: autoTable } = await import('jspdf-autotable');
    autoTable(pdf, {
      head: [headers],
      body: rows,
      startY: yOffset,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
      headStyles: { fillColor: [77, 140, 245], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      footStyles: { fillColor: [245, 245, 245], textColor: [50, 50, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });

    pdf.save('most_booked_room_types_report.pdf');
  };

  // --- UPDATED PDF generator for Revenue Summary (with ₱ prefix and no parentheses) ---
  const downloadRevenuePDF = async () => {
    const pdf = new jsPDF('portrait');

    pdf.addFileToVFS("DejaVuSans.ttf", fontBase64);
    pdf.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
    pdf.setFont("DejaVuSans");

    let yOffset = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;

    // Draw improved header
    yOffset = await drawImprovedHeader(pdf, 'Revenue Summary Report', margin, pageWidth);
    pdf.setTextColor(0, 0, 0);

    // Table data with proper currency formatting (no parentheses, ₱ prefix for non-zero)
    const rawTableData = getRevenueTableData();
    const headers = ['Month', 'Room Revenue', 'Day Tour Revenue', 'Total Revenue'];
    const rows = rawTableData.map(row => [
      row.month,
      formatCurrencyForPDF(row.roomRevenue),
      formatCurrencyForPDF(row.dayTourRevenue),
      formatCurrencyForPDF(row.totalRevenue),
    ]);

    const totalRoomRev = rawTableData.reduce((sum, r) => sum + r.roomRevenue, 0);
    const totalDayRev = rawTableData.reduce((sum, r) => sum + r.dayTourRevenue, 0);
    const totalAll = rawTableData.reduce((sum, r) => sum + r.totalRevenue, 0);
    rows.push(['Total', formatCurrencyForPDF(totalRoomRev), formatCurrencyForPDF(totalDayRev), formatCurrencyForPDF(totalAll)]);

    const { default: autoTable } = await import('jspdf-autotable');
    autoTable(pdf, {
      head: [headers],
      body: rows,
      startY: yOffset,
      margin: { left: margin, right: margin },

      styles: {
        font: "DejaVuSans",   // 👈 IMPORTANT FIX
        fontSize: 9,
        cellPadding: 3,
        textColor: [50, 50, 50],
      },

      headStyles: {
        font: "DejaVuSans",   // 👈 also here
        fillColor: [77, 140, 245],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      }
    });

    pdf.save('revenue_summary_report.pdf');
  };

  // --- UPDATED PDF generator for Room Booking Type Split (with accurate monthly data) ---
  const downloadBookingSplitPDF = async () => {
    const pdf = new jsPDF('portrait');
    let yOffset = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;

    // Draw improved header
    yOffset = await drawImprovedHeader(pdf, 'Room Booking Type Split Report', margin, pageWidth);
    pdf.setTextColor(0, 0, 0);

    // Get accurate monthly booking split data from stored state
    const monthlySplitData = getAccurateMonthlyBookingSplitData();

    // Define the columns based on requirements
    const headers = ['Month', 'Entire Resort', 'Multi-Room Types', 'Single Room Type', 'Total'];

    // Build rows for all 12 months
    const rows = [];
    let totalEntireResort = 0;
    let totalMultiRoom = 0;
    let totalSingleRoom = 0;
    let totalOverall = 0;

    for (let i = 0; i < MONTHS.length; i++) {
      const monthName = MONTHS[i];
      const data = monthlySplitData[i] || { entireResort: 0, multiRoom: 0, singleRoom: 0 };
      const monthTotal = data.entireResort + data.multiRoom + data.singleRoom;

      rows.push([
        monthName,
        data.entireResort,
        data.multiRoom,
        data.singleRoom,
        monthTotal
      ]);

      totalEntireResort += data.entireResort;
      totalMultiRoom += data.multiRoom;
      totalSingleRoom += data.singleRoom;
      totalOverall += monthTotal;
    }

    // Add total row
    rows.push(['Total', totalEntireResort, totalMultiRoom, totalSingleRoom, totalOverall]);

    const { default: autoTable } = await import('jspdf-autotable');
    autoTable(pdf, {
      head: [headers],
      body: rows,
      startY: yOffset,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
      headStyles: { fillColor: [77, 140, 245], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      footStyles: { fillColor: [245, 245, 245], textColor: [50, 50, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });

    pdf.save('room_booking_type_split_report.pdf');
  };

  // Helper function to get accurate monthly booking split data from stored state
  const getAccurateMonthlyBookingSplitData = () => {
    if (!selectedSplitYear || !monthlyBookingSplitData[selectedSplitYear]) {
      return Array(12).fill().map(() => ({
        entireResort: 0,
        multiRoom: 0,
        singleRoom: 0
      }));
    }
    return monthlyBookingSplitData[selectedSplitYear];
  };

  // Helper function to get monthly booking split data for the selected year (legacy, replaced by above)
  const getMonthlyBookingSplitData = () => {
    return getAccurateMonthlyBookingSplitData();
  };

  // --- PDF generator for Monthly/Seasonal Trend (NO CHARTS) ---
  const downloadTrendPDF = async () => {
    const pdf = new jsPDF('portrait');
    let yOffset = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;

    // Draw improved header
    yOffset = await drawImprovedHeader(pdf, 'Monthly/Seasonal Trend Report', margin, pageWidth);
    pdf.setTextColor(0, 0, 0);

    // Table data
    const rawTableData = getTrendTableData();
    const headers = ['Month', 'Room Bookings', 'Day Tour Guests', 'Total'];
    const rows = rawTableData.map(row => [
      row.month,
      row.roomBookings,
      row.dayTourGuests,
      row.roomBookings + row.dayTourGuests,
    ]);

    const totalRoomBookings = rawTableData.reduce((sum, r) => sum + r.roomBookings, 0);
    const totalDayGuests = rawTableData.reduce((sum, r) => sum + r.dayTourGuests, 0);
    const totalAll = totalRoomBookings + totalDayGuests;
    rows.push(['Total', totalRoomBookings, totalDayGuests, totalAll]);

    const { default: autoTable } = await import('jspdf-autotable');
    autoTable(pdf, {
      head: [headers],
      body: rows,
      startY: yOffset,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
      headStyles: { fillColor: [77, 140, 245], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      footStyles: { fillColor: [245, 245, 245], textColor: [50, 50, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });

    pdf.save('monthly_seasonal_trend_report.pdf');
  };

  // ==================== EXCEL EXPORT FUNCTIONS ====================

  // --- UPDATED Excel generator for Most Booked Room Types (left-aligned) ---
  const downloadRoomTypesExcel = () => {
    const tableData = getRoomTypesTableData();
    if (!tableData || tableData.length === 0) {
      alert('No data available to export.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Prepare data rows with proper values
    const excelRows = [];

    // Add title rows
    excelRows.push(['Sandyfeet Reservation']);
    excelRows.push(['Most Booked Room Types Report']);
    excelRows.push([`Generated: ${getFormattedDate()}`]);
    excelRows.push([]);

    // Add headers
    excelRows.push(['Month', 'Tent', 'Ground Floor Room', 'Couple Room', 'Group Room', 'Total']);

    // Add monthly data
    let totalTent = 0;
    let totalGroundFloor = 0;
    let totalCouple = 0;
    let totalGroup = 0;
    let totalOverall = 0;

    for (const row of tableData) {
      const monthTotal = row.tent + row.groundFloorRoom + row.coupleRoom + row.groupRoom;
      excelRows.push([row.month, row.tent, row.groundFloorRoom, row.coupleRoom, row.groupRoom, monthTotal]);

      totalTent += row.tent;
      totalGroundFloor += row.groundFloorRoom;
      totalCouple += row.coupleRoom;
      totalGroup += row.groupRoom;
      totalOverall += monthTotal;
    }

    // Add total row
    excelRows.push(['Total', totalTent, totalGroundFloor, totalCouple, totalGroup, totalOverall]);

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Set column widths and alignment (left-aligned by default)
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];

    // Apply left alignment to all cells
    for (let i = 0; i < excelRows.length; i++) {
      for (let j = 0; j < excelRows[i].length; j++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: j });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = { alignment: { horizontal: 'left' } };
      }
    }

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Most Booked Room Types');
    XLSX.writeFile(wb, 'most_booked_room_types_report.xlsx');
  };

  // --- UPDATED Excel generator for Revenue Summary (left-aligned with ₱ prefix) ---
  const downloadRevenueExcel = () => {
    const tableData = getRevenueTableData();
    if (!tableData || tableData.length === 0) {
      alert('No data available to export.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Prepare data rows with proper values
    const excelRows = [];

    // Add title rows
    excelRows.push(['Sandyfeet Reservation']);
    excelRows.push(['Revenue Summary Report']);
    excelRows.push([`Generated: ${getFormattedDate()}`]);
    excelRows.push([]);

    // Add headers
    excelRows.push(['Month', 'Room Revenue', 'Day Tour Revenue', 'Total Revenue']);

    // Add monthly data with currency formatting (₱ prefix for non-zero values)
    let totalRoomRevenue = 0;
    let totalDayTourRevenue = 0;
    let totalRevenue = 0;

    for (const row of tableData) {
      excelRows.push([
        row.month,
        formatCurrencyForExcel(row.roomRevenue),
        formatCurrencyForExcel(row.dayTourRevenue),
        formatCurrencyForExcel(row.totalRevenue)
      ]);
      totalRoomRevenue += row.roomRevenue;
      totalDayTourRevenue += row.dayTourRevenue;
      totalRevenue += row.totalRevenue;
    }

    // Add total row with currency formatting
    excelRows.push(['Total', formatCurrencyForExcel(totalRoomRevenue), formatCurrencyForExcel(totalDayTourRevenue), formatCurrencyForExcel(totalRevenue)]);

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Set column widths
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 20 }];

    // Apply left alignment to all cells
    for (let i = 0; i < excelRows.length; i++) {
      for (let j = 0; j < excelRows[i].length; j++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: j });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = { alignment: { horizontal: 'left' } };
      }
    }

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Summary');
    XLSX.writeFile(wb, 'revenue_summary_report.xlsx');
  };

  // --- UPDATED Excel generator for Room Booking Type Split (left-aligned, 12-month format) ---
  const downloadBookingSplitExcel = () => {
    const monthlySplitData = getAccurateMonthlyBookingSplitData();

    const wb = XLSX.utils.book_new();

    // Prepare data rows with proper values
    const excelRows = [];

    // Add title rows
    excelRows.push(['Sandyfeet Reservation']);
    excelRows.push(['Room Booking Type Split Report']);
    excelRows.push([`Generated: ${getFormattedDate()}`]);
    excelRows.push([]);

    // Add headers
    excelRows.push(['Month', 'Entire Resort', 'Multi-Room Types', 'Single Room Type', 'Total']);

    // Add monthly data for all 12 months
    let totalEntireResort = 0;
    let totalMultiRoom = 0;
    let totalSingleRoom = 0;
    let totalOverall = 0;

    for (let i = 0; i < MONTHS.length; i++) {
      const monthData = monthlySplitData[i] || { entireResort: 0, multiRoom: 0, singleRoom: 0 };
      const monthTotal = monthData.entireResort + monthData.multiRoom + monthData.singleRoom;

      excelRows.push([MONTHS[i], monthData.entireResort, monthData.multiRoom, monthData.singleRoom, monthTotal]);

      totalEntireResort += monthData.entireResort;
      totalMultiRoom += monthData.multiRoom;
      totalSingleRoom += monthData.singleRoom;
      totalOverall += monthTotal;
    }

    // Add total row
    excelRows.push(['Total', totalEntireResort, totalMultiRoom, totalSingleRoom, totalOverall]);

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Set column widths
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];

    // Apply left alignment to all cells
    for (let i = 0; i < excelRows.length; i++) {
      for (let j = 0; j < excelRows[i].length; j++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: j });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = { alignment: { horizontal: 'left' } };
      }
    }

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Room Booking Type Split');
    XLSX.writeFile(wb, 'room_booking_type_split_report.xlsx');
  };

  // --- UPDATED Excel generator for Monthly/Seasonal Trend (left-aligned with Total column) ---
  const downloadTrendExcel = () => {
    const tableData = getTrendTableData();
    if (!tableData || tableData.length === 0) {
      alert('No data available to export.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Prepare data rows with proper values
    const excelRows = [];

    // Add title rows
    excelRows.push(['Sandyfeet Reservation']);
    excelRows.push(['Monthly/Seasonal Trend Report']);
    excelRows.push([`Generated: ${getFormattedDate()}`]);
    excelRows.push([]);

    // Add headers (includes Total column)
    excelRows.push(['Month', 'Room Bookings', 'Day Tour Guests', 'Total']);

    // Add monthly data
    let totalRoomBookings = 0;
    let totalDayGuests = 0;
    let totalOverall = 0;

    for (const row of tableData) {
      const monthTotal = row.roomBookings + row.dayTourGuests;
      excelRows.push([row.month, row.roomBookings, row.dayTourGuests, monthTotal]);

      totalRoomBookings += row.roomBookings;
      totalDayGuests += row.dayTourGuests;
      totalOverall += monthTotal;
    }

    // Add total row
    excelRows.push(['Total', totalRoomBookings, totalDayGuests, totalOverall]);

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Set column widths
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];

    // Apply left alignment to all cells
    for (let i = 0; i < excelRows.length; i++) {
      for (let j = 0; j < excelRows[i].length; j++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: j });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = { alignment: { horizontal: 'left' } };
      }
    }

    // Merge title cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Seasonal Trend');
    XLSX.writeFile(wb, 'monthly_seasonal_trend_report.xlsx');
  };

  // Prepare table data functions (unchanged)
  const getRoomTypesTableData = () => {
    if (!selectedYear || !yearlyMonthlyRoomData[selectedYear]) return [];
    return yearlyMonthlyRoomData[selectedYear].map(monthData => ({
      month: monthData.month,
      tent: monthData.Tent || 0,
      groundFloorRoom: monthData['Ground Floor Room'] || 0,
      groupRoom: monthData['Group Room'] || 0,
      coupleRoom: monthData['Couple Room'] || 0,
      total: (monthData.Tent || 0) + (monthData['Ground Floor Room'] || 0) + (monthData['Group Room'] || 0) + (monthData['Couple Room'] || 0)
    }));
  };

  const getRevenueTableData = () => {
    if (!selectedYear || !yearlyMonthlyRevenueData[selectedYear]) return [];
    return yearlyMonthlyRevenueData[selectedYear].map(monthData => ({
      month: monthData.month,
      roomRevenue: monthData.roomRevenue || 0,
      dayTourRevenue: monthData.dayTourRevenue || 0,
      totalRevenue: (monthData.roomRevenue || 0) + (monthData.dayTourRevenue || 0)
    }));
  };

  const getBookingSplitTableData = () => {
    return bookingSplitData.map(item => ({
      bookingType: item.name,
      count: item.value
    }));
  };

  const getTrendTableData = () => {
    if (!selectedYear || !yearlyMonthlyTrendData[selectedYear]) return [];
    return yearlyMonthlyTrendData[selectedYear].map(monthData => ({
      month: monthData.month,
      roomBookings: monthData.roomBookings || 0,
      dayTourGuests: monthData.dayTourGuests || 0
    }));
  };

  // Slider and lifecycle hooks (unchanged)
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
    const timer = setTimeout(() => {
      updateSlider();
    }, 100);
    return () => clearTimeout(timer);
  }, [updateSlider]);

  // FIX: Ensure slider appears after loading completes (tabs become visible)
  useEffect(() => {
    if (!loading) {
      // Wait a tiny bit for DOM to settle then update slider position
      const timer = setTimeout(() => {
        updateSlider();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, updateSlider]);

  useEffect(() => {
    fetchAllData();
  }, []);

  // Annual summary effects (unchanged)
  useEffect(() => {
    if (selectedYear && yearlyMonthlyRevenueData[selectedYear]) {
      let roomRev = 0;
      let dayTourRev = 0;
      yearlyMonthlyRevenueData[selectedYear].forEach(month => {
        roomRev += month.roomRevenue || 0;
        dayTourRev += month.dayTourRevenue || 0;
      });
      setAnnualRoomRevenue(roomRev);
      setAnnualDayTourRevenue(dayTourRev);
      setAnnualTotalRevenue(roomRev + dayTourRev);
    }
  }, [selectedYear, yearlyMonthlyRevenueData]);

  useEffect(() => {
    if (selectedYear && yearlyMonthlyRoomData[selectedYear]) {
      let totals = {
        Tent: 0,
        'Ground Floor Room': 0,
        'Group Room': 0,
        'Couple Room': 0
      };
      yearlyMonthlyRoomData[selectedYear].forEach(month => {
        totals.Tent += month.Tent || 0;
        totals['Ground Floor Room'] += month['Ground Floor Room'] || 0;
        totals['Group Room'] += month['Group Room'] || 0;
        totals['Couple Room'] += month['Couple Room'] || 0;
      });
      setAnnualRoomTypeTotals(totals);
    }
  }, [selectedYear, yearlyMonthlyRoomData]);

  useEffect(() => {
    if (selectedYear && yearlyMonthlyTrendData[selectedYear]) {
      let totals = {
        roomBookings: 0,
        dayTourGuests: 0
      };
      yearlyMonthlyTrendData[selectedYear].forEach(month => {
        totals.roomBookings += month.roomBookings || 0;
        totals.dayTourGuests += month.dayTourGuests || 0;
      });
      setAnnualTrendTotals(totals);
    }
  }, [selectedYear, yearlyMonthlyTrendData]);

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

  // Helper functions (unchanged)
  const calculateBookingTotalPrice = (booking) => {
    let total = 0;
    if (booking.isGrouped && booking.childBookings) {
      booking.childBookings.forEach(child => {
        total += child.totalPrice || 0;
      });
    } else {
      total = booking.totalPrice || 0;
    }
    return total;
  };

  const normalizeRoomType = (roomType) => {
    if (!roomType) return null;
    if (roomType.toLowerCase().includes('tent')) return 'Tent';
    if (roomType === 'Ground Floor Rooms') return 'Ground Floor Room';
    return roomType;
  };

  const extractRoomTypesFromBooking = (booking) => {
    const roomTypes = [];
    const isExclusive = Boolean(
      booking.isExclusiveResortBooking ||
      (booking.isGrouped && booking.childBookings?.some(cb => cb.isExclusiveResortBooking))
    );

    if (booking.isGrouped && booking.childBookings) {
      if (isExclusive) {
        const tentCount = booking.tentCount ||
          Math.max(0, ...booking.childBookings.map(cb => cb.tentCount || 0));
        for (let i = 0; i < tentCount; i++) roomTypes.push('Tent');
        booking.childBookings.forEach(cb => {
          if (cb.roomType && !cb.roomType.toLowerCase().includes('tent')) {
            for (let i = 0; i < (cb.numberOfRooms || 1); i++) {
              roomTypes.push(cb.roomType);
            }
          }
        });
      } else {
        booking.childBookings.forEach(cb => {
          for (let i = 0; i < (cb.numberOfRooms || 1); i++) {
            roomTypes.push(cb.roomType);
          }
        });
      }
    } else if (booking.roomTypes && Array.isArray(booking.roomTypes) && booking.roomTypes.length > 0) {
      booking.roomTypes.forEach(rt => {
        for (let i = 0; i < (rt.quantity || 1); i++) {
          roomTypes.push(rt.type);
        }
      });
    } else if (booking.roomType) {
      if (isExclusive && (booking.tentCount || 0) > 0) {
        for (let i = 0; i < booking.tentCount; i++) roomTypes.push('Tent');
        if (!booking.roomType.toLowerCase().includes('tent')) {
          for (let i = 0; i < (booking.numberOfRooms || 1); i++) {
            roomTypes.push(booking.roomType);
          }
        }
      } else {
        for (let i = 0; i < (booking.numberOfRooms || 1); i++) {
          roomTypes.push(booking.roomType);
        }
      }
    } else if (isExclusive && (booking.tentCount || 0) > 0) {
      for (let i = 0; i < booking.tentCount; i++) roomTypes.push('Tent');
    }

    return roomTypes.map(normalizeRoomType).filter(Boolean);
  };

  const countRoomUnitsFromBooking = (booking) => {
    const types = extractRoomTypesFromBooking(booking);
    return types.length > 0 ? types.length : 1;
  };

  const getGroupRevenue = (group) => {
    const children = group.bookings;
    const withManual = children.find(
      (b) => b.manualTotalPrice !== undefined && b.manualTotalPrice !== null
    );
    if (withManual) {
      return Number(withManual.manualTotalPrice);
    }
    if (group.isExclusiveResortBooking) {
      const child = children[0];
      if (child.exclusivePackagePrice) {
        return Number(child.exclusivePackagePrice);
      }
      return child.totalPrice || 0;
    }
    return children.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
  };

  // ==================== FIXED REVENUE COMPUTATION ====================
const processData = (bookings, dayTours) => {
  // Helper to get the effective total amount (manual edit > exclusive package > totalPrice)
  const getEffectiveTotal = (booking) => {
    if (booking.manualTotalPrice !== undefined && booking.manualTotalPrice !== null) {
      return booking.manualTotalPrice;
    }
    if (booking.isExclusiveResortBooking && booking.exclusivePackagePrice) {
      return booking.exclusivePackagePrice;
    }
    return booking.totalPrice || 0;
  };

  let totalRoomRevenue = 0;
  let totalRoomUnits = 0;
  let dayTourGuestCount = 0;
  let dayTourRevenueTotal = 0;

  const processedBookings = [];
  const multiRoomGroups = new Map();

  // First pass: group multi-room bookings and collect non-grouped completed bookings
  bookings.forEach(booking => {
    if (booking.status === 'completed') {
      if (booking.isMultiRoomBooking && booking.parentBookingId) {
        if (!multiRoomGroups.has(booking.parentBookingId)) {
          multiRoomGroups.set(booking.parentBookingId, {
            bookings: [],
            totalPrice: 0,
            createdAt: booking.createdAt,
            status: booking.status,
            numberOfRooms: 0,
            isExclusiveResortBooking: booking.isExclusiveResortBooking || false,
            manualTotalPrice: booking.manualTotalPrice,
            exclusivePackagePrice: booking.exclusivePackagePrice,
            tentCount: booking.tentCount || 0,          // preserve tent count
            roomType: booking.roomType
          });
        }
        const group = multiRoomGroups.get(booking.parentBookingId);
        group.bookings.push(booking);
        // Each child booking contributes its numberOfRooms (normally 1 per room)
        group.numberOfRooms += (booking.numberOfRooms || 1);

        if (booking.tentCount > 0 && group.tentCount === 0) {
          group.tentCount = booking.tentCount;
        }
        if (booking.manualTotalPrice != null && group.manualTotalPrice == null) {
          group.manualTotalPrice = booking.manualTotalPrice;
        }
      } else if (!booking.isMultiRoomBooking) {
        // Single room booking
        const effectiveTotal = getEffectiveTotal(booking);
        totalRoomRevenue += effectiveTotal;
        totalRoomUnits += countRoomUnitsFromBooking(booking);
        processedBookings.push(booking);
      }
    }
  });

  // Second pass: add grouped bookings
  multiRoomGroups.forEach((group, parentId) => {
    const groupRevenue = getGroupRevenue(group);
    const groupedBooking = {
      ...group.bookings[0],
      id: parentId,
      totalPrice: groupRevenue,
      manualTotalPrice: group.manualTotalPrice,
      exclusivePackagePrice: group.exclusivePackagePrice,
      isGrouped: true,
      childBookings: group.bookings,
      isExclusiveResortBooking: group.isExclusiveResortBooking,
      tentCount: group.tentCount,
      roomType: group.roomType
    };
    const roomUnits = countRoomUnitsFromBooking(groupedBooking);
    totalRoomUnits += roomUnits;
    totalRoomRevenue += groupRevenue;
    processedBookings.push({
      ...groupedBooking,
      numberOfRooms: roomUnits
    });
  });

  // Day tours (unchanged)
  dayTours.forEach(tour => {
    if (tour.status === 'completed') {
      const seniors = tour.seniors || 0;
      const adults = tour.adults || 0;
      const kids = tour.kids || 0;
      dayTourGuestCount += seniors + adults + kids;

      const effectiveTotal = (tour.manualTotalPrice !== undefined && tour.manualTotalPrice !== null)
        ? tour.manualTotalPrice
        : (tour.totalPrice || 0);
      dayTourRevenueTotal += effectiveTotal;
    }
  });

  const totalRevenueCombined = totalRoomRevenue + dayTourRevenueTotal;
  setTotalRevenue(totalRevenueCombined);
  setTotalRoomBookings(totalRoomUnits);           // ✅ overall room units (including tents)
  setTotalDayTourGuests(dayTourGuestCount);

  // Monthly data structures
  const yearlyMonthlyRoom = {};
  const yearlyMonthlyRevenue = {};
  const yearlyMonthlyTrend = {};
  const yearsSet = new Set();
  const monthlySplitData = {};

  // Process each completed booking for monthly breakdown
  processedBookings.forEach(booking => {
    let createdAt;
    if (booking.isGrouped && booking.childBookings && booking.childBookings.length > 0) {
      const firstChild = booking.childBookings[0];
      createdAt = firstChild.createdAt?.toDate ? firstChild.createdAt.toDate() : new Date(firstChild.createdAt);
    } else {
      createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
    }

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
    if (!monthlySplitData[year]) {
      monthlySplitData[year] = Array(12).fill().map(() => ({
        entireResort: 0,
        multiRoom: 0,
        singleRoom: 0
      }));
    }

    // Booking type split (unchanged)
    let bookingType = 'singleRoom';
    if (booking.isExclusiveResortBooking || (booking.isGrouped && booking.childBookings && booking.childBookings.some(cb => cb.isExclusiveResortBooking))) {
      bookingType = 'entireResort';
    } else if (booking.isGrouped || (booking.roomTypes && booking.roomTypes.length > 1)) {
      bookingType = 'multiRoom';
    }
    monthlySplitData[year][month][bookingType]++;

    const roomTypes = extractRoomTypesFromBooking(booking);

    roomTypes.forEach(roomType => {
      if (roomType === 'Tent') yearlyMonthlyRoom[year].Tent[month]++;
      else if (roomType === 'Ground Floor Room') yearlyMonthlyRoom[year]['Ground Floor Room'][month]++;
      else if (roomType === 'Group Room') yearlyMonthlyRoom[year]['Group Room'][month]++;
      else if (roomType === 'Couple Room') yearlyMonthlyRoom[year]['Couple Room'][month]++;
    });

    const effectiveTotal = getEffectiveTotal(booking);
    yearlyMonthlyRevenue[year].roomRevenue[month] += effectiveTotal;
    yearlyMonthlyRevenue[year].total[month] += effectiveTotal;

    const roomUnitCount = countRoomUnitsFromBooking(booking);
    yearlyMonthlyTrend[year].roomBookings[month] += roomUnitCount;
  });

  // Day tours monthly breakdown (unchanged)
  dayTours.forEach(tour => {
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

      const effectiveTotal = (tour.manualTotalPrice !== undefined && tour.manualTotalPrice !== null)
        ? tour.manualTotalPrice
        : (tour.totalPrice || 0);
      yearlyMonthlyRevenue[year].dayTourRevenue[month] += effectiveTotal;
      yearlyMonthlyRevenue[year].total[month] += effectiveTotal;

      const guests = (tour.seniors || 0) + (tour.adults || 0) + (tour.kids || 0);
      yearlyMonthlyTrend[year].dayTourGuests[month] += guests;
    }
  });

  // Prepare chart data (unchanged)
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
  setMonthlyBookingSplitData(monthlySplitData);

  const years = Array.from(yearsSet).sort((a, b) => b - a);
  setAvailableYears(years);
  if (years.length > 0 && !selectedYear) setSelectedYear(years[0]);
  if (years.length > 0 && !selectedSplitYear) setSelectedSplitYear(years[0]);

  // Booking split data (unchanged)
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

  // Tooltip components (unchanged)
  const RevenueTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const roomRevenue = payload.find(p => p.dataKey === 'roomRevenue')?.value || 0;
      const dayTourRevenue = payload.find(p => p.dataKey === 'dayTourRevenue')?.value || 0;
      const totalRevenue = roomRevenue + dayTourRevenue;

      return (
        <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200 min-w-[220px]">
          <p className="font-semibold text-gray-800 border-b pb-2 mb-2">{label}</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4D8CF5' }}></div>
                Room Revenue:
              </span>
              <span className="text-sm font-semibold text-gray-900">₱{roomRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#F59E0B' }}></div>
                Day Tour Revenue:
              </span>
              <span className="text-sm font-semibold text-gray-900">₱{dayTourRevenue.toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 mt-1">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm font-bold text-gray-700">Total Revenue:</span>
                <span className="text-sm font-bold text-[#1E3A8A]">₱{totalRevenue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

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

  const getFilteredBookingSplitData = () => {
    if (selectedSplitFilter === 'year') {
      return bookingSplitData;
    } else {
      if (selectedSplitYear && selectedSplitMonth !== '' && monthlyBookingSplitData[selectedSplitYear]) {
        const monthSplitData = monthlyBookingSplitData[selectedSplitYear][parseInt(selectedSplitMonth)];
        const hasBookings = monthSplitData && (monthSplitData.entireResort > 0 || monthSplitData.multiRoom > 0 || monthSplitData.singleRoom > 0);

        if (!hasBookings) {
          return null;
        }

        // Return filtered data for the selected month
        return [
          { name: 'Entire Resort', value: monthSplitData.entireResort, color: '#8B5CF6' },
          { name: 'Multi-Room Types', value: monthSplitData.multiRoom, color: '#4D8CF5' },
          { name: 'Single Room Type', value: monthSplitData.singleRoom, color: '#F59E0B' }
        ];
      }
      return bookingSplitData;
    }
  };

  const filteredSplitData = getFilteredBookingSplitData();
  const hasNoBookings = filteredSplitData === null ||
    (filteredSplitData && filteredSplitData.length > 0 && filteredSplitData.every(item => item.value === 0));

  if (loading) {
    return (
      <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
        <div className="flex justify-center items-center h-64">
          <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      {/* Header (unchanged) */}
      <div className="mb-8 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-6 py-4 sm:py-5 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
          Reports & Analytics
        </h1>
        <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
          Track your resort performance with clear reports and insights.
        </p>
      </div>

      {/* Summary Cards (unchanged) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
        <div className="group bg-gradient-to-br from-white via-white to-emerald-50/30 rounded-2xl shadow-md border border-[#10B981]/20 overflow-hidden hover:shadow-xl hover:border-[#10B981]/40 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10B981]/20 to-[#10B981]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-dollar-sign text-[#10B981] text-xl"></i>
              </div>
              <span className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">
                ₱{totalRevenue.toLocaleString()}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Total Revenue</h3>
            <p className="text-xs text-[#1E3A8A]/50">Lifetime revenue from <strong>completed</strong> bookings</p>
          </div>
        </div>

        <div className="group bg-gradient-to-br from-white via-white to-blue-50/30 rounded-2xl shadow-md border border-[#4D8CF5]/20 overflow-hidden hover:shadow-xl hover:border-[#4D8CF5]/40 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4D8CF5]/20 to-[#4D8CF5]/5 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <i className="fas fa-bed text-[#4D8CF5] text-xl"></i>
              </div>
              <span className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight">
                {totalRoomBookings}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#1E3A8A] mb-1">Total Room Bookings</h3>
            <p className="text-xs text-[#1E3A8A]/50">Room units from <strong>completed</strong> reservations</p>
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
            <p className="text-xs text-[#1E3A8A]/50">Guests from <strong>completed</strong> day tour bookings only</p>
          </div>
        </div>
      </div>

      {/* Tabs (unchanged) */}
      <div className="relative mb-6 border-b border-[#4D8CF5]/20 overflow-x-auto no-scrollbar" ref={tabsContainerRef}>
        <div
          ref={sliderRef}
          className="absolute top-1 bottom-1 rounded-lg bg-[#4D8CF5]/10 transition-all duration-300 ease-in-out shadow-sm"
          style={{
            transform: 'translateX(0px)',
            width: '0px',
          }}
        />

        <div className="flex min-w-max md:w-full">
          <button
            ref={(el) => (buttonRefs.current.roomTypes = el)}
            onClick={() => setActiveTab('roomTypes')}
            className={`flex-1 relative z-10 px-4 py-3 text-sm sm:text-base font-medium transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'roomTypes'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
          >
            <i className="fas fa-chart-bar"></i>
            Most Booked Room Types
          </button>

          <button
            ref={(el) => (buttonRefs.current.revenue = el)}
            onClick={() => setActiveTab('revenue')}
            className={`flex-1 relative z-10 px-4 py-3 text-sm sm:text-base font-medium transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'revenue'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
          >
            <i className="fas fa-chart-line"></i>
            Revenue Summary
          </button>

          <button
            ref={(el) => (buttonRefs.current.bookingSplit = el)}
            onClick={() => setActiveTab('bookingSplit')}
            className={`flex-1 relative z-10 px-4 py-3 text-sm sm:text-base font-medium transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'bookingSplit'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
          >
            <i className="fas fa-chart-pie"></i>
            Room Booking Type Split
          </button>

          <button
            ref={(el) => (buttonRefs.current.trends = el)}
            onClick={() => setActiveTab('trends')}
            className={`flex-1 relative z-10 px-4 py-3 text-sm sm:text-base font-medium transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'trends'
              ? 'text-[#1E3A8A]'
              : 'text-[#1E3A8A]/60 hover:text-[#4D8CF5]'
              }`}
          >
            <i className="fas fa-chart-line"></i>
            Monthly / Seasonal Trend
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 sm:p-6 md:p-8">
        {/* Tab 1: Most Booked Room Types */}
        {activeTab === 'roomTypes' && (
          <div className="animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#1E3A8A] font-playfair">Most Booked Room Types</h2>
                <p className="text-xs sm:text-sm text-gray-500">Most Booked Room Types Report</p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Year:</label>
                </div>
                <div className="relative inline-block w-full sm:w-auto flex-1">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white appearance-none cursor-pointer transition-all duration-200 w-full"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  {/* Custom dropdown arrow */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                    ▼
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mb-6">
              <button
                onClick={() => openExportConfirm('pdf', 'Most Booked Room Types', [], getRoomTypesTableData(), ['Month', 'Tent', 'Ground Floor Room', 'Group Room', 'Couple Room', 'Total'])}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-pdf"></i> PDF
              </button>
              <button
                onClick={() => openExportConfirm('excel', 'Most Booked Room Types', [], getRoomTypesTableData(), ['Month', 'Tent', 'Ground Floor Room', 'Group Room', 'Couple Room', 'Total'])}
                className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-excel"></i> Excel
              </button>
            </div>

            {/* Annual Room Type Totals Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <i className="fas fa-bed text-amber-600 text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Couple Room</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">{annualRoomTypeTotals['Couple Room'].toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <i className="fas fa-building text-blue-600 text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Ground Floor Room</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">{annualRoomTypeTotals['Ground Floor Room'].toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl p-4 border border-purple-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <i className="fas fa-users text-purple-600 text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Group Room</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">{annualRoomTypeTotals['Group Room'].toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 border border-emerald-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <i className="fas fa-campground text-emerald-600 text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Tents</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">{annualRoomTypeTotals.Tent.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-6">Monthly booking frequency by room type for <span className="font-semibold text-[#1E3A8A]">{selectedYear}</span></p>
            {selectedYear && yearlyMonthlyRoomData[selectedYear] && (
              <div ref={roomTypesChartRef} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#1E3A8A] font-playfair">Revenue Summary</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Track revenue trends from room bookings and day tours</p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Year:</label>
                </div>
                <div className="relative inline-block w-full sm:w-auto flex-1">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white appearance-none cursor-pointer transition-all duration-200 w-full"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  {/* Custom dropdown arrow */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                    ▼
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mb-6">
              <button
                onClick={() => openExportConfirm('pdf', 'Revenue Summary', [], getRevenueTableData(), ['Month', 'Room Revenue', 'Day Tour Revenue', 'Total Revenue'])}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-pdf"></i> PDF
              </button>
              <button
                onClick={() => openExportConfirm('excel', 'Revenue Summary', [], getRevenueTableData(), ['Month', 'Room Revenue', 'Day Tour Revenue', 'Total Revenue'])}
                className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-excel"></i> Excel
              </button>
            </div>

            {/* Annual Revenue Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#4D8CF5]/10 flex items-center justify-center">
                    <i className="fas fa-bed text-[#4D8CF5] text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room Revenue</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">₱{annualRoomRevenue.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                    <i className="fas fa-sun text-[#F59E0B] text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Day Tour Revenue</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">₱{annualDayTourRevenue.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 border border-emerald-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <i className="fas fa-chart-line text-emerald-600 text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overall Total</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">₱{annualTotalRevenue.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Combined revenue for {selectedYear}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-6">Monthly revenue breakdown for <span className="font-semibold text-[#1E3A8A]">{selectedYear}</span></p>
            {selectedYear && yearlyMonthlyRevenueData[selectedYear] && (
              <div ref={revenueChartRef} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#1E3A8A] font-playfair">Room Booking Type Split</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Distribution of booking types across your property</p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4 w-full sm:w-auto">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-sliders-h text-[#4D8CF5] text-sm"></i>
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by:</label>
                  </div>
                  <div className="relative inline-block w-full sm:w-auto flex-1">
                    <select
                      value={selectedSplitFilter}
                      onChange={(e) => setSelectedSplitFilter(e.target.value)}
                      className="px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white appearance-none cursor-pointer transition-all duration-200 w-full"
                    >
                      <option value="year">Year</option>
                      <option value="month">Month</option>
                    </select>

                    {/* Custom dropdown arrow */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                      ▼
                    </div>
                  </div>
                </div>
                {selectedSplitFilter === 'year' ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                      <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Year:</label>
                    </div>
                    <div className="relative inline-block w-full sm:w-auto flex-1">
                      <select
                        value={selectedSplitYear}
                        onChange={(e) => setSelectedSplitYear(e.target.value)}
                        className="px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white appearance-none cursor-pointer transition-all duration-200 w-full"
                      >
                        {availableYears.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>

                      {/* Custom dropdown arrow */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                        ▼
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Year:</label>
                      </div>
                      <select value={selectedSplitYear} onChange={(e) => setSelectedSplitYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white w-full sm:w-auto flex-1">
                        {availableYears.map(year => (<option key={year} value={year}>{year}</option>))}
                      </select>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-calendar-week text-[#4D8CF5] text-sm"></i>
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Month:</label>
                      </div>
                      <select value={selectedSplitMonth} onChange={(e) => setSelectedSplitMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white w-full sm:w-auto flex-1">
                        {MONTHS.map((month, idx) => (<option key={idx} value={idx}>{month}</option>))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mb-6">
              <button
                onClick={() => openExportConfirm('pdf', 'Room Booking Type Split', [], getBookingSplitTableData(), ['Booking Type', 'Count'])}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-pdf"></i> PDF
              </button>
              <button
                onClick={() => openExportConfirm('excel', 'Room Booking Type Split', [], getBookingSplitTableData(), ['Booking Type', 'Count'])}
                className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-excel"></i> Excel
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-8">Distribution of booking types for {selectedSplitFilter === 'year' ? `year ${selectedSplitYear}` : `${MONTHS[parseInt(selectedSplitMonth)]} ${selectedSplitYear}`}</p>

            {hasNoBookings ? (
              <div className="flex flex-col items-center justify-center py-16 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100">
                <i className="fas fa-calendar-times text-5xl text-gray-300 mb-4"></i>
                <p className="text-lg font-medium text-gray-500">No bookings for this month.</p>
                <p className="text-sm text-gray-400 mt-1">Try selecting a different month or year.</p>
              </div>
            ) : (
              <div ref={bookingSplitChartRef} className="flex flex-col lg:flex-row items-center justify-center gap-8">
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm w-full hover:shadow-md transition-shadow duration-300">
                  <ResponsiveContainer width="100%" height={400}>
                    <PieChart>
                      <Pie data={filteredSplitData} cx="50%" cy="50%" labelLine={false} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} outerRadius={150} fill="#8884d8" dataKey="value">
                        {filteredSplitData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4 min-w-[240px]">
                  {filteredSplitData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-4 p-3 bg-gradient-to-r from-gray-50 to-white rounded-xl hover:shadow-md transition-all duration-200 border border-gray-100">
                      <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div><span className="text-sm font-medium text-gray-700">{item.name}</span></div>
                      <span className="text-sm font-bold text-gray-900">{item.value} bookings</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Monthly / Seasonal Trend */}
        {activeTab === 'trends' && (
          <div className="animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#1E3A8A] font-playfair">Monthly / Seasonal Trend</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Analyze booking patterns and seasonal fluctuations</p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <i className="fas fa-calendar-alt text-[#4D8CF5] text-sm"></i>
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Year:</label>
                </div>
                <div className="relative inline-block w-full sm:w-auto flex-1">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8CF5] focus:border-transparent bg-white appearance-none cursor-pointer transition-all duration-200 w-full"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  {/* Custom dropdown arrow */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                    ▼
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mb-6">
              <button
                onClick={() => openExportConfirm('pdf', 'Monthly Seasonal Trend', [], getTrendTableData(), ['Month', 'Room Bookings', 'Day Tour Guests'])}
                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-pdf"></i> PDF
              </button>
              <button
                onClick={() => openExportConfirm('excel', 'Monthly Seasonal Trend', [], getTrendTableData(), ['Month', 'Room Bookings', 'Day Tour Guests'])}
                className="px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-600/80 hover:text-white transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-excel"></i> Excel
              </button>
            </div>

            {/* Annual Trend Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#4D8CF5]/10 flex items-center justify-center">
                    <i className="fas fa-bed text-[#4D8CF5] text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Room Bookings</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">{annualTrendTotals.roomBookings.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                    <i className="fas fa-users text-[#F59E0B] text-sm"></i>
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Day Tour Guests</span>
                </div>
                <p className="text-2xl font-bold text-[#1E3A8A]">{annualTrendTotals.dayTourGuests.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">For year {selectedYear}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-8">Monthly booking patterns for <span className="font-semibold text-[#1E3A8A]">{selectedYear}</span></p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div ref={roomBookingsTrendRef} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#4D8CF5]/20 to-[#4D8CF5]/5 flex items-center justify-center">
                    <i className="fas fa-bed text-[#4D8CF5] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Room Bookings</h3>
                    <p className="text-xs text-gray-500">Room units from completed reservations</p>
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
              <div ref={dayTourTrendRef} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 flex items-center justify-center">
                    <i className="fas fa-users text-[#F59E0B] text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Day Tour Guests</h3>
                    <p className="text-xs text-gray-500">Number of guests on day tours</p>
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

      {/* --- Confirm Export Modal (only) --- */}
      {confirmExport.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-blue-100 flex items-center justify-center">
                <i className={`fas ${confirmExport.type === 'pdf' ? 'fa-file-pdf text-red-500' : 'fa-file-excel text-green-500'} text-2xl`}></i>
              </div>
              <h3 className="text-lg font-bold text-textPrimary mb-2">
                Confirm Export
              </h3>
              <p className="text-textSecondary text-sm">
                Are you sure you want to export the <strong>{confirmExport.section}</strong> report as {confirmExport.type.toUpperCase()}?
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmExport({ show: false, type: '', section: '', chartRefs: [], tableData: [], tableHeaders: [], includeChart: false })}
                className="px-5 py-2 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={executeExport}
                className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
              >
                <i className="fas fa-download"></i> Confirm Export
              </button>
            </div>
          </div>
        </div>
      )}

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
        @keyframes scaleIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}