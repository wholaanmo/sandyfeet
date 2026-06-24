// app/dashboard/staff/room-assign/page.js
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import {
  assignRoomToReservation,
  unassignRoom,
  getAvailableRoomsForDates,
  getRoomStatistics,
  syncRoomInventory
} from '@/lib/roomInventory';

export default function StaffRoomAssign() {
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [availableReservations, setAvailableReservations] = useState([]);
  const [selectedReservation, setSelectedReservation] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 0
  });
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [roomToUnassign, setRoomToUnassign] = useState(null);
  const [showRoomDetailsModal, setShowRoomDetailsModal] = useState(false);
  const [selectedRoomDetails, setSelectedRoomDetails] = useState(null);
  const [roomTypeStats, setRoomTypeStats] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Derive room type statuses based on underlying unit states (e.g., maintenance)
  const computedRoomTypes = useMemo(() => {
    if (!Array.isArray(roomTypes) || roomTypes.length === 0) return roomTypes;
    return roomTypes.map(rt => {
      const units = (rooms || []).filter(r => r.roomTypeId === rt.id);
      const allUnitsUnderMaintenance = units.length > 0 && units.every(u => u.status === 'maintenance');
      // If every unit is under maintenance, mark the type as maintenance for UI purposes
      return {
        ...rt,
        allUnitsUnderMaintenance,
        availability: allUnitsUnderMaintenance ? 'maintenance' : (rt.availability || 'available')
      };
    });
  }, [roomTypes, rooms]);

  // Track if initial sync has been done
  const initialSyncDone = useRef(false);
  // Track room type IDs to detect changes
  const roomTypeIdsRef = useRef(new Set());

  // Generate room code from room type name
  const generateRoomCode = (roomTypeName, unitNumber) => {
    const words = roomTypeName.trim().split(/\s+/);
    let code = words.map(word => word.charAt(0).toUpperCase()).join('');

    if (code.length < 2 && roomTypeName.length >= 2) {
      code = roomTypeName.substring(0, 2).toUpperCase();
    }

    const paddedNumber = String(unitNumber).padStart(3, '0');
    return `${code}-${paddedNumber}`;
  };

  // Fetch room types and generate room inventory with real-time sync
  useEffect(() => {
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where('archived', '!=', true));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const types = [];
      const allRoomTypes = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const roomType = { id: doc.id, ...data };
        allRoomTypes.push(roomType);
        if (String(data.availability || '').toLowerCase() === 'available') {
          types.push(roomType);
        }
      });

      // Check if room types have changed
      const newRoomTypeIds = new Set(allRoomTypes.map(rt => rt.id));
      const oldRoomTypeIds = roomTypeIdsRef.current;
      const hasChanged = 
        newRoomTypeIds.size !== oldRoomTypeIds.size || 
        ![...newRoomTypeIds].every(id => oldRoomTypeIds.has(id));

      // Update room types state — keep the full list so we can derive UI-only
      // availability (e.g., mark a type as maintenance when all its units are).
      setRoomTypes(allRoomTypes);

      // Always sync inventory when room types change
      // This ensures the inventory is always up to date
      if (allRoomTypes.length > 0) {
        // Update the ref with new IDs
        roomTypeIdsRef.current = newRoomTypeIds;
        
        try {
          await syncRoomInventory(allRoomTypes);
          initialSyncDone.current = true;
        } catch (error) {
          console.error('Error generating room inventory:', error);
        }
      } else if (!initialSyncDone.current) {
        // If no room types exist yet, still try to sync
        try {
          await syncRoomInventory([]);
          initialSyncDone.current = true;
        } catch (error) {
          console.error('Error generating room inventory:', error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch room inventory with real-time updates - THIS IS THE CRITICAL PART
  useEffect(() => {
    const inventoryRef = collection(db, 'roomInventory');
    const q = query(
      inventoryRef,
      where('archived', '!=', true),
      orderBy('roomCode', 'asc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const roomsList = [];
      const statsData = {
        total: 0,
        available: 0,
        reserved: 0,
        occupied: 0,
        maintenance: 0
      };

      snapshot.forEach(doc => {
        const data = doc.data();
        const room = { id: doc.id, ...data };
        roomsList.push(room);

        statsData.total++;
        if (data.status === 'available') statsData.available++;
        else if (data.status === 'reserved') statsData.reserved++;
        else if (data.status === 'occupied') statsData.occupied++;
        else if (data.status === 'maintenance') statsData.maintenance++;
      });

      setRooms(roomsList);
      setStats(statsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auto-hide notification
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification({ show: false, message: '', type: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

  // Filter rooms
  const filteredRooms = rooms.filter(room => {
    const matchesSearch =
      room.roomCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.roomTypeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.currentGuestName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || room.status === filterStatus;
    const matchesType = filterType === 'all' || room.roomTypeId === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusBadge = (status) => {
    const styles = {
      'available': 'bg-green-50 text-green-700 border-green-200',
      'reserved': 'bg-purple-50 text-purple-700 border-purple-200',
      'occupied': 'bg-blue-50 text-blue-700 border-blue-200',
      'maintenance': 'bg-orange-50 text-orange-700 border-orange-200',
      'checked-out': 'bg-gray-50 text-gray-700 border-gray-200',
      'archived': 'bg-gray-50 text-gray-700 border-gray-200'
    };
    return styles[status] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'available': 'Available',
      'reserved': 'Reserved',
      'occupied': 'Occupied',
      'maintenance': 'Maintenance',
      'checked-out': 'Checked Out',
      'archived': 'Archived'
    };
    return labels[status] || status;
  };

  // Handle update room status
  const handleUpdateStatus = async (room, newStatus) => {
    setActionLoading(true);
    try {
      if (newStatus === 'available') {
        if (room.currentReservationId) {
          await unassignRoom(room.id, room.currentReservationId, true);
        } else {
          const roomRef = doc(db, 'roomInventory', room.id);
          await updateDoc(roomRef, {
            status: 'available',
            currentGuestName: '',
            currentGuestUid: '',
            currentReservationId: '',
            checkInDate: null,
            checkOutDate: null,
            updatedAt: new Date().toISOString()
          });
        }
        showNotification(`Room ${room.roomCode} status updated to ${getStatusLabel(newStatus)}`);
      } else {
        const roomRef = doc(db, 'roomInventory', room.id);
        const updateData = {
          status: newStatus,
          updatedAt: new Date().toISOString()
        };

        if (newStatus === 'checked-out') {
          updateData.currentGuestName = '';
          updateData.currentGuestUid = '';
          updateData.currentReservationId = '';
          updateData.checkInDate = null;
          updateData.checkOutDate = null;
        }

        await updateDoc(roomRef, updateData);
        showNotification(`Room ${room.roomCode} status updated to ${getStatusLabel(newStatus)}`);
      }
    } catch (error) {
      console.error('Error updating room status:', error);
      showNotification('Failed to update room status.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Get all eligible reservations
  const getAllEligibleReservations = async () => {
    try {
      const bookingsRef = collection(db, 'bookings');

      const statuses = ['confirmed', 'check-in', 'check-out'];
      const allReservations = [];

      for (const status of statuses) {
        const q = query(
          bookingsRef,
          where('status', '==', status)
        );
        const snapshot = await getDocs(q);

        for (const doc of snapshot.docs) {
          const data = doc.data();

          if (data.isExclusiveResortBooking === true) {
            continue;
          }
          if (data.bookingIdDisplay === 'Entire Resort') {
            continue;
          }

          let displayInfo = '';
          let roomTypeDisplay = '';

          if (data.isMultiRoomBooking && data.parentBookingId) {
            const parentQuery = query(
              bookingsRef,
              where('parentBookingId', '==', data.parentBookingId)
            );
            const parentSnapshot = await getDocs(parentQuery);
            const roomTypes = [];
            let totalRooms = 0;
            let assignedCount = 0;

            for (const childDoc of parentSnapshot.docs) {
              const childData = childDoc.data();
              if (!childData.isExclusiveResortBooking) {
                roomTypes.push(childData.roomType);
                totalRooms++;
                if (childData.assignedRoomId) {
                  assignedCount++;
                }
              }
            }

            const uniqueRoomTypes = [...new Set(roomTypes)];
            const remainingRooms = totalRooms - assignedCount;

            roomTypeDisplay = uniqueRoomTypes.join(' + ');
            displayInfo = `${data.guestInfo?.firstName || 'Guest'} ${data.guestInfo?.lastName || ''} - ${roomTypeDisplay} (${remainingRooms} rooms remaining)`;
          } else {
            roomTypeDisplay = data.roomType || 'Room';
            const requiredCount = data.numberOfRooms || 1;
            const assignedCount = data.assignedRoomId ? 1 : 0;
            const remainingRooms = requiredCount - assignedCount;

            displayInfo = `${data.guestInfo?.firstName || 'Guest'} ${data.guestInfo?.lastName || ''} - ${roomTypeDisplay} (${remainingRooms} rooms remaining)`;
          }

          const remainingRooms = data.remainingQuantity !== undefined ? data.remainingQuantity :
            (data.isMultiRoomBooking ? 1 : (data.numberOfRooms || 1) - (data.assignedRoomId ? 1 : 0));

          allReservations.push({
            id: doc.id,
            ...data,
            displayInfo: displayInfo,
            roomTypeDisplay: roomTypeDisplay,
            status: data.status,
            remainingQuantity: remainingRooms,
            roomType: data.roomType || roomTypeDisplay
          });
        }
      }

      return allReservations;
    } catch (error) {
      console.error('Error fetching eligible reservations:', error);
      return [];
    }
  };

  // Handle assign click
  const handleAssignClick = async (room) => {
    if (room.status !== 'available') {
      showNotification('Assign is only allowed for rooms that are Available.', 'error');
      return;
    }

    setSelectedRoom(room);
    setSelectedReservation('');
    setSelectedStatus('');

    try {
      const allEligible = await getAllEligibleReservations();
      setAvailableReservations(allEligible);

      if (allEligible.length === 0) {
        showNotification(`No eligible reservations available.`, 'error');
      }

      setShowAssignModal(true);
    } catch (error) {
      console.error('Error fetching reservations:', error);
      showNotification('Failed to load reservations.', 'error');
    }
  };

  // Handle assign room
  const handleAssignRoom = async () => {
    if (!selectedReservation || !selectedRoom) {
      showNotification('Please select a guest.', 'error');
      return;
    }

    if (!selectedStatus) {
      showNotification('Please select a status.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const reservation = availableReservations.find(r => r.id === selectedReservation);
      if (!reservation) {
        throw new Error('Reservation not found');
      }

      const roomDoc = await getDoc(doc(db, 'roomInventory', selectedRoom.id));
      if (!roomDoc.exists()) {
        showNotification('This room is no longer available.', 'error');
        setShowAssignModal(false);
        setActionLoading(false);
        return;
      }

      const guestName = `${reservation.guestInfo?.firstName || ''} ${reservation.guestInfo?.lastName || ''}`.trim() || 'Guest';

      await assignRoomToReservation(
        selectedRoom.id,
        selectedReservation,
        reservation.guestUid || '',
        guestName,
        reservation.checkInDate || reservation.checkIn,
        reservation.checkOutDate || reservation.checkOut,
        selectedStatus
      );

      showNotification(`Room ${selectedRoom.roomCode} assigned to ${guestName} successfully!`);
      setShowAssignModal(false);
      setSelectedRoom(null);
      setSelectedReservation('');
    } catch (error) {
      console.error('Error assigning room:', error);
      showNotification('Failed to assign room. ' + error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle edit assignment
  const handleEditAssignment = async (room) => {
    setEditingRoom(room);
    setSelectedReservation('');

    try {
      const allEligible = await getAllEligibleReservations();
      const matchingReservations = allEligible.filter(res => res.id !== room.currentReservationId);
      setAvailableReservations(matchingReservations);

      if (matchingReservations.length === 0) {
        showNotification(`No other eligible reservations available.`, 'error');
        return;
      }

      setShowEditModal(true);
    } catch (error) {
      console.error('Error fetching reservations:', error);
      showNotification('Failed to load reservations.', 'error');
    }
  };

  const handleEditAssignmentConfirm = async () => {
    if (!selectedReservation || !editingRoom) {
      showNotification('Please select a guest.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const reservation = availableReservations.find(r => r.id === selectedReservation);
      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (editingRoom.currentReservationId) {
        await unassignRoom(editingRoom.id, editingRoom.currentReservationId, false);
      }

      const guestName = `${reservation.guestInfo?.firstName || ''} ${reservation.guestInfo?.lastName || ''}`.trim() || 'Guest';

      const statusToUse = editingRoom.status || 'occupied';
      await assignRoomToReservation(
        editingRoom.id,
        selectedReservation,
        reservation.guestUid || '',
        guestName,
        reservation.checkInDate || reservation.checkIn,
        reservation.checkOutDate || reservation.checkOut,
        statusToUse
      );

      showNotification(`Room ${editingRoom.roomCode} reassigned to ${guestName} successfully!`);
      setShowEditModal(false);
      setEditingRoom(null);
      setSelectedReservation('');
    } catch (error) {
      console.error('Error editing assignment:', error);
      showNotification('Failed to reassign room. ' + error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle view room details
  const handleViewDetails = (room) => {
    setSelectedRoomDetails(room);
    setShowRoomDetailsModal(true);
  };

  // Get status count for each room type
  const getRoomTypeStats = (roomTypeId) => {
    const roomsOfType = rooms.filter(r => r.roomTypeId === roomTypeId);
    const total = roomsOfType.length;
    const available = roomsOfType.filter(r => r.status === 'available').length;
    const reserved = roomsOfType.filter(r => r.status === 'reserved').length;
    const occupied = roomsOfType.filter(r => r.status === 'occupied').length;
    const maintenance = roomsOfType.filter(r => r.status === 'maintenance').length;
    return { total, available, reserved, occupied, maintenance };
  };

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
      {/* Notification */}
      {notification.show && (
        <div
          className={`fixed top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slideInRight ${notification.type === 'error'
            ? 'bg-red-50 border-l-4 border-red-500 text-red-700'
            : 'bg-green-50 border-l-4 border-green-500 text-green-700'
            }`}
        >
          <i
            className={`${notification.type === 'error'
              ? 'fas fa-exclamation-circle text-red-500'
              : 'fas fa-check-circle text-green-500'
              } text-base`}
          ></i>
          <span className="text-sm font-medium">
            {notification.message}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight flex items-center gap-3">
          <i className="fas fa-door-open text-[#4D8CF5]"></i>
          Room Assignment
        </h1>
        <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
          Manage room inventory, assign rooms to guests, and update room status
        </p>
      </div>

      {/* Stats Cards */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 min-w-0 bg-gradient-to-br from-white to-slate-50 rounded-[28px] border border-slate-200/70 p-4 shadow-[0_18px_30px_-24px_rgba(59,130,246,0.35)] hover:shadow-[0_22px_40px_-28px_rgba(59,130,246,0.28)] transition-all duration-200">
          <div className="flex items-center gap-3 h-full">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm">
              <i className="fas fa-hotel text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 mb-1">Total Rooms</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 bg-gradient-to-br from-white to-slate-50 rounded-[28px] border border-slate-200/70 p-4 shadow-[0_18px_30px_-24px_rgba(16,185,129,0.35)] hover:shadow-[0_22px_40px_-28px_rgba(16,185,129,0.28)] transition-all duration-200">
          <div className="flex items-center gap-3 h-full">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm">
              <i className="fas fa-check-circle text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 mb-1">Available</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-700">{stats.available}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 bg-gradient-to-br from-white to-slate-50 rounded-[28px] border border-slate-200/70 p-4 shadow-[0_18px_30px_-24px_rgba(139,92,246,0.35)] hover:shadow-[0_22px_40px_-28px_rgba(139,92,246,0.28)] transition-all duration-200">
          <div className="flex items-center gap-3 h-full">
            <div className="w-11 h-11 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 shadow-sm">
              <i className="fas fa-clock text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 mb-1">Reserved</p>
              <p className="text-2xl sm:text-3xl font-bold text-violet-700">{stats.reserved}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 bg-gradient-to-br from-white to-slate-50 rounded-[28px] border border-slate-200/70 p-4 shadow-[0_18px_30px_-24px_rgba(56,189,248,0.35)] hover:shadow-[0_22px_40px_-28px_rgba(56,189,248,0.28)] transition-all duration-200">
          <div className="flex items-center gap-3 h-full">
            <div className="w-11 h-11 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 shadow-sm">
              <i className="fas fa-user-check text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 mb-1">Occupied</p>
              <p className="text-2xl sm:text-3xl font-bold text-sky-700">{stats.occupied}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 bg-gradient-to-br from-white to-slate-50 rounded-[28px] border border-slate-200/70 p-4 shadow-[0_18px_30px_-24px_rgba(249,115,22,0.35)] hover:shadow-[0_22px_40px_-28px_rgba(249,115,22,0.28)] transition-all duration-200">
          <div className="flex items-center gap-3 h-full">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm">
              <i className="fas fa-tools text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 mb-1">Maintenance</p>
              <p className="text-2xl sm:text-3xl font-bold text-orange-700">{stats.maintenance}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Room Type Stats */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {computedRoomTypes.map(type => {
          const stat = getRoomTypeStats(type.id);
          return (
            <div key={type.id} className="bg-gradient-to-br from-white to-ocean-light/5 rounded-2xl shadow-md border border-ocean-light/10 p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold text-[#1E3A8A]/70 uppercase tracking-wider">{type.type}</p>
                {type.allUnitsUnderMaintenance && (
                  <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Maintenance</span>
                )}
              </div>
              <div className="flex gap-1.5 mt-1 text-xs flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">{stat.available} avail</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">{stat.reserved} resv</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">{stat.occupied} occ</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">{stat.maintenance} maint</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
        <div className="w-full sm:flex-1 min-w-[250px]">
          <div className="relative w-full group">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#4D8CF5] text-sm transition-all duration-300 group-focus-within:text-[#3B78E7]"></i>
            <input
              type="text"
              placeholder="Search by room code, type, or guest name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="relative w-full sm:w-auto">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm text-textPrimary bg-white shadow-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 hover:border-[#4D8CF5]/70 transition-all duration-200 appearance-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
              ▼
            </div>
          </div>

          {/* Type Filter */}
          <div className="relative w-full sm:w-auto">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm text-textPrimary bg-white shadow-sm focus:outline-none focus:border-[#4D8CF5] focus:ring-2 focus:ring-[#4D8CF5]/20 hover:border-[#4D8CF5]/70 transition-all duration-200 appearance-none cursor-pointer"
            >
              <option value="all">All Types</option>
              {computedRoomTypes.map(type => (
                <option key={type.id} value={type.id} disabled={type.allUnitsUnderMaintenance}>{type.type}{type.allUnitsUnderMaintenance ? ' (Maintenance)' : ''}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
              ▼
            </div>
          </div>
        </div>
      </div>

      {/* Room Inventory Table */}
      <div className="bg-white rounded-2xl shadow-md border border-ocean-light/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-ocean-pale/50 border-b border-ocean-light/20">
                <th className="px-6 py-4 text-left text-sm font-semibold text-textPrimary">Room Code</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-textPrimary">Room Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-textPrimary">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-textPrimary">Current Guest</th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-textPrimary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-neutral">
                    <i className="fas fa-door-open text-5xl mb-3 opacity-50 block"></i>
                    <p className="text-lg font-medium text-textPrimary">No rooms found</p>
                    <p className="text-sm text-textSecondary">Try adjusting your filters or create room types in the admin panel</p>
                  </td>
                </tr>
              ) : (
                filteredRooms.map((room) => (
                  <tr key={room.id} className="border-b border-ocean-light/10 hover:bg-ocean-ice/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-[#1E3A8A] text-sm">{room.roomCode}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-textPrimary font-medium">{room.roomTypeName}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(room.status)}`}>
                        {getStatusLabel(room.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {room.currentGuestName && room.currentGuestName.trim() !== '' ? (
                        <div className="text-textSecondary flex items-center gap-1.5">
                          <i className="fas fa-user text-xs text-[#4D8CF5]/60"></i>
                          <span className="font-medium text-textPrimary">{room.currentGuestName}</span>
                        </div>
                      ) : (
                        <span className="text-neutral/60 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <div className="relative w-full sm:w-auto">
                          <select
                            value={room.status}
                            onChange={(e) => handleUpdateStatus(room, e.target.value)}
                            disabled={actionLoading}
                            className="w-full sm:w-auto px-3 py-1.5 pr-8 border-2 border-[#4D8CF5]/20 rounded-xl text-xs font-semibold bg-white focus:outline-none focus:border-[#4D8CF5] cursor-pointer appearance-none disabled:opacity-50 transition-all duration-200"
                          >
                            <option value="available">Available</option>
                            <option value="reserved">Reserved</option>
                            <option value="occupied">Occupied</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-[9px]">
                            ▼
                          </div>
                        </div>

                        {room.currentGuestName && room.currentGuestName.trim() !== '' ? (
                          <button
                            onClick={() => handleEditAssignment(room)}
                            className="px-3 py-1.5 bg-[#EFF6FF] text-[#1E3A8A] border border-[#93C5FD]/30 rounded-xl text-xs font-semibold hover:bg-[#CFE2FF] hover:text-[#1E3A8A] transition-all duration-200 flex items-center gap-1.5 shadow-sm"
                          >
                            <i className="fas fa-edit"></i> Edit
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAssignClick(room)}
                            disabled={room.status !== 'available' || actionLoading}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 flex items-center gap-1.5 shadow-sm ${room.status !== 'available' || actionLoading
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-[#7AAAF8]/10 text-[#1E3A8A] border border-[#7AAAF8]/20 hover:bg-[#4D8CF5] hover:text-white hover:border-[#4D8CF5]'
                              }`}
                          >
                            <i className="fas fa-user-plus"></i> Assign
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Room Modal */}
      {showAssignModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                <i className="fas fa-door-open text-[#4D8CF5]"></i>
                Assign Room: {selectedRoom.roomCode}
              </h2>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedRoom(null);
                  setSelectedReservation('');
                  setSelectedStatus('');
                }}
                className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#4D8CF5]/5 border border-[#4D8CF5]/10 rounded-xl p-3.5">
                <div className="text-sm font-medium text-textPrimary mb-1">
                  Room Type: <span className="font-bold text-[#1E3A8A]">{selectedRoom.roomTypeName}</span>
                </div>
                <div className="text-xs text-textSecondary">
                  Status: <span className={`font-semibold ${selectedRoom.status === 'available' ? 'text-green-600' : 'text-red-600'}`}>
                    {getStatusLabel(selectedRoom.status)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest px-1">
                  Select Guest Name
                </label>
                <p className="text-[11px] text-textSecondary mb-2 px-1">Showing guest names with Confirmed, Checked In, or Checked Out reservations (excluding Entire Resort bookings).</p>
                {availableReservations.length === 0 ? (
                  <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 rounded-xl p-3.5 text-xs font-medium">
                    <i className="fas fa-info-circle mr-2"></i>
                    No eligible reservations available. Reservations must have Confirmed, Checked In, or Checked Out status.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedReservation}
                      onChange={(e) => setSelectedReservation(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] bg-white transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select a guest...</option>
                      {(() => {
                        const uniqueGuests = new Map();
                        availableReservations.forEach(reservation => {
                          const guestName = `${reservation.guestInfo?.firstName || 'Guest'} ${reservation.guestInfo?.lastName || ''}`.trim();
                          if (!uniqueGuests.has(guestName)) {
                            uniqueGuests.set(guestName, reservation.id);
                          }
                        });
                        return Array.from(uniqueGuests).map(([guestName, reservationId]) => (
                          <option key={reservationId} value={reservationId}>
                            {guestName}
                          </option>
                        ));
                      })()}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                      ▼
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest px-1">
                  Select Status
                </label>
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] bg-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select room status...</option>
                    <option value="reserved">Reserved</option>
                    <option value="occupied">Occupied</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                    ▼
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedRoom(null);
                    setSelectedReservation('');
                    setSelectedStatus('');
                  }}
                  className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignRoom}
                  disabled={!selectedReservation || actionLoading || availableReservations.length === 0}
                  className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm transition-all active:scale-95 ${!selectedReservation || actionLoading || availableReservations.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-[#4D8CF5] hover:bg-[#3B78E7] hover:shadow-md'
                    }`}
                >
                  {actionLoading ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> Assigning...</span>
                  ) : (
                    'Assign Room'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Assignment Modal */}
      {showEditModal && editingRoom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                <i className="fas fa-edit text-[#4D8CF5]"></i>
                Edit Assignment: {editingRoom.roomCode}
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingRoom(null);
                  setSelectedReservation('');
                }}
                className="w-7 h-7 rounded-md bg-ocean-ice text-neutral hover:bg-ocean-light/20 hover:text-textPrimary transition-all duration-200 flex items-center justify-center"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3.5">
                <div className="text-sm font-medium text-textPrimary mb-1">
                  Current Guest: <span className="font-bold text-[#1E3A8A]">{editingRoom.currentGuestName || 'None'}</span>
                </div>
                <div className="text-xs text-textSecondary">
                  Room Type: <span className="font-medium">{editingRoom.roomTypeName}</span>
                </div>
              </div>

              <div>
                <label className="block mb-1.5 text-xs font-bold text-[#1E3A8A]/60 uppercase tracking-widest px-1">
                  Select Guest Name to Reassign
                </label>
                <p className="text-[11px] text-textSecondary mb-2 px-1">Showing guest names with Confirmed, Checked In, or Checked Out reservations (excluding Entire Resort bookings).</p>
                {availableReservations.length === 0 ? (
                  <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 rounded-xl p-3.5 text-xs font-medium">
                    <i className="fas fa-info-circle mr-2"></i>
                    No other eligible reservations available.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedReservation}
                      onChange={(e) => setSelectedReservation(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border-2 border-[#4D8CF5]/20 rounded-xl text-sm focus:outline-none focus:border-[#4D8CF5] bg-white transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select a guest...</option>
                      {(() => {
                        const uniqueGuests = new Map();
                        availableReservations.forEach(reservation => {
                          const guestName = `${reservation.guestInfo?.firstName || 'Guest'} ${reservation.guestInfo?.lastName || ''}`.trim();
                          if (!uniqueGuests.has(guestName)) {
                            uniqueGuests.set(guestName, reservation.id);
                          }
                        });
                        return Array.from(uniqueGuests).map(([guestName, reservationId]) => (
                          <option key={reservationId} value={reservationId}>
                            {guestName}
                          </option>
                        ));
                      })()}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4D8CF5] text-xs">
                      ▼
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border-l-4 border-[#4D8CF5] text-blue-800 rounded-xl p-3.5 text-xs font-medium">
                <i className="fas fa-info-circle mr-1"></i>
                This will replace the current guest with the new guest selected.
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingRoom(null);
                    setSelectedReservation('');
                  }}
                  className="px-5 py-2.5 border border-ocean-light/20 rounded-xl text-textSecondary text-sm font-medium hover:bg-ocean-ice transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditAssignmentConfirm}
                  disabled={!selectedReservation || actionLoading || availableReservations.length === 0}
                  className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm transition-all active:scale-95 ${!selectedReservation || actionLoading || availableReservations.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-600 hover:shadow-md'
                    }`}
                >
                  {actionLoading ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i> Updating...</span>
                  ) : (
                    'Update Assignment'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
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