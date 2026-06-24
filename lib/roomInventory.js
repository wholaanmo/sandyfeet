// lib/roomInventory.js

import { db } from './firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore';

/**
 * Assign a room to a reservation
 * This ONLY updates room inventory - does NOT modify reservation status
 */
export async function assignRoomToReservation(roomId, reservationId, guestUid, guestName, checkInDate, checkOutDate, roomStatus = 'occupied') {
  try {
    const roomRef = doc(db, 'roomInventory', roomId);
    const roomSnap = await getDoc(roomRef);
    
    if (!roomSnap.exists()) {
      throw new Error('Room not found');
    }
    
    const roomData = roomSnap.data();
    
    // Only assign if room is available
    if (roomData.status !== 'available') {
      throw new Error('Room is not available');
    }
    
    // Update room inventory ONLY - do NOT touch reservation status
    await updateDoc(roomRef, {
      status: roomStatus,
      currentGuestName: guestName,
      currentGuestUid: guestUid || '',
      currentReservationId: reservationId,
      checkInDate: checkInDate || null,
      checkOutDate: checkOutDate || null,
      updatedAt: new Date().toISOString()
    });
    
    // Update the booking to link the room (but do NOT change status)
    const bookingRef = doc(db, 'bookings', reservationId);
    const bookingSnap = await getDoc(bookingRef);
    if (bookingSnap.exists()) {
      await updateDoc(bookingRef, {
        assignedRoomId: roomId,
        assignedRoomCode: roomData.roomCode,
        updatedAt: new Date().toISOString()
        // DO NOT update status - keep reservation status as-is
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error assigning room:', error);
    throw error;
  }
}

/**
 * Unassign a room from a reservation
 * This ONLY updates room inventory - does NOT modify reservation status
 */
export async function unassignRoom(roomId, reservationId, markAsCompleted = false) {
  try {
    const roomRef = doc(db, 'roomInventory', roomId);
    const roomSnap = await getDoc(roomRef);
    
    if (!roomSnap.exists()) {
      throw new Error('Room not found');
    }
    
    const roomData = roomSnap.data();
    
    // Store occupancy history
    const historyEntry = {
      guestName: roomData.currentGuestName || '',
      checkInDate: roomData.checkInDate,
      checkOutDate: new Date().toISOString(),
      reservationId: roomData.currentReservationId
    };
    
    const occupancyHistory = roomData.occupancyHistory || [];
    occupancyHistory.push(historyEntry);
    
    // Determine new status based on markAsCompleted flag
    // This only affects room status, NOT reservation status
    const newStatus = markAsCompleted ? 'available' : 'available';
    
    // Update room inventory ONLY - do NOT touch reservation status
    await updateDoc(roomRef, {
      status: newStatus,
      currentGuestName: '',
      currentGuestUid: '',
      currentReservationId: '',
      checkInDate: null,
      checkOutDate: null,
      occupancyHistory: occupancyHistory,
      updatedAt: new Date().toISOString()
    });
    
    // Update the booking to remove room link (but do NOT change status)
    if (reservationId) {
      const bookingRef = doc(db, 'bookings', reservationId);
      const bookingSnap = await getDoc(bookingRef);
      if (bookingSnap.exists()) {
        await updateDoc(bookingRef, {
          assignedRoomId: null,
          assignedRoomCode: null,
          updatedAt: new Date().toISOString()
          // DO NOT update status - keep reservation status as-is
        });
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error unassigning room:', error);
    throw error;
  }
}

/**
 * Check if a room is available for given dates
 */
export async function isRoomAvailableForDates(roomId, checkInDate, checkOutDate, excludeReservationId = null) {
  try {
    const roomRef = doc(db, 'roomInventory', roomId);
    const roomSnap = await getDoc(roomRef);
    
    if (!roomSnap.exists()) {
      return false;
    }
    
    const roomData = roomSnap.data();
    
    // If room is not available, it's not available for dates
    if (roomData.status !== 'available' && roomData.status !== 'reserved') {
      return false;
    }
    
    // If room has a current reservation and it's not the one we're excluding
    if (roomData.currentReservationId && roomData.currentReservationId !== excludeReservationId) {
      // Check if dates overlap
      const roomCheckIn = roomData.checkInDate ? new Date(roomData.checkInDate) : null;
      const roomCheckOut = roomData.checkOutDate ? new Date(roomData.checkOutDate) : null;
      
      if (roomCheckIn && roomCheckOut) {
        const newCheckIn = new Date(checkInDate);
        const newCheckOut = new Date(checkOutDate);
        
        // Check for overlap
        if (newCheckIn < roomCheckOut && newCheckOut > roomCheckIn) {
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking room availability:', error);
    return false;
  }
}

/**
 * Get available rooms for dates
 */
export async function getAvailableRoomsForDates(checkInDate, checkOutDate, roomTypeId = null) {
  try {
    const inventoryRef = collection(db, 'roomInventory');
    const q = query(
      inventoryRef,
      where('archived', '!=', true)
    );
    
    const snapshot = await getDocs(q);
    const availableRooms = [];
    
    for (const doc of snapshot.docs) {
      const roomData = doc.data();
      
      // Filter by room type if specified
      if (roomTypeId && roomData.roomTypeId !== roomTypeId) {
        continue;
      }
      
      // Check if room is available
      if (roomData.status !== 'available' && roomData.status !== 'reserved') {
        continue;
      }
      
      // Check date availability
      const isAvailable = await isRoomAvailableForDates(doc.id, checkInDate, checkOutDate);
      if (isAvailable) {
        availableRooms.push({
          id: doc.id,
          ...roomData
        });
      }
    }
    
    return availableRooms;
  } catch (error) {
    console.error('Error getting available rooms:', error);
    return [];
  }
}

/**
 * Get room statistics
 */
export async function getRoomStatistics() {
  try {
    const inventoryRef = collection(db, 'roomInventory');
    const q = query(inventoryRef, where('archived', '!=', true));
    const snapshot = await getDocs(q);
    
    const stats = {
      total: 0,
      available: 0,
      reserved: 0,
      occupied: 0,
      maintenance: 0
    };
    
    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;
      if (data.status === 'available') stats.available++;
      else if (data.status === 'reserved') stats.reserved++;
      else if (data.status === 'occupied') stats.occupied++;
      else if (data.status === 'maintenance') stats.maintenance++;
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting room statistics:', error);
    return { total: 0, available: 0, reserved: 0, occupied: 0, maintenance: 0 };
  }
}

const getRoomCodePrefix = (roomTypeName) => {
  const words = roomTypeName.trim().split(/\s+/);
  let codePrefix = words.map(word => word.charAt(0).toUpperCase()).join('');
  if (codePrefix.length < 2 && roomTypeName.length >= 2) {
    codePrefix = roomTypeName.substring(0, 2).toUpperCase();
  }
  return codePrefix;
};

const buildRoomCode = (roomTypeName, unitNumber) => {
  const codePrefix = getRoomCodePrefix(roomTypeName);
  const paddedNumber = String(unitNumber).padStart(3, '0');
  return `${codePrefix}-${paddedNumber}`;
};

export async function syncRoomInventory(roomTypesList) {
  try {
    const inventoryRef = collection(db, 'roomInventory');
    const snapshot = await getDocs(query(inventoryRef, where('archived', '!=', true)));
    const existingRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingCodes = new Set(existingRooms.map(room => room.roomCode));
    const roomsByType = new Map();

    existingRooms.forEach(room => {
      const roomTypeId = room.roomTypeId || '';
      const rooms = roomsByType.get(roomTypeId) || [];
      rooms.push(room);
      roomsByType.set(roomTypeId, rooms);
    });

    const statusRank = (status) => {
      switch (status) {
        case 'occupied': return 4;
        case 'reserved': return 3;
        case 'maintenance': return 2;
        case 'available': return 1;
        default: return 0;
      }
    };

    const batch = writeBatch(db);
    let needsUpdate = false;

    // Get the set of active room type IDs from the roomTypesList
    const activeRoomTypeIds = new Set(roomTypesList.map(rt => rt.id));

    // First, archive any rooms whose room type is no longer in the active list
    for (const [roomTypeId, rooms] of roomsByType) {
      if (!activeRoomTypeIds.has(roomTypeId)) {
        // This room type has been archived/deleted - archive all its rooms
        for (const room of rooms) {
          const roomRef = doc(db, 'roomInventory', room.id);
          batch.update(roomRef, { 
            archived: true, 
            updatedAt: new Date().toISOString() 
          });
          needsUpdate = true;
        }
        // Remove from roomsByType so we don't process it again
        roomsByType.delete(roomTypeId);
      }
    }

    for (const roomType of roomTypesList) {
      const totalRooms = Number(roomType.totalRooms) || 0;
      const existingRoomsOfType = roomsByType.get(roomType.id) || [];
      const roomsByNumber = new Map();
      const duplicatesToArchive = [];

      existingRoomsOfType.forEach(room => {
        let unitNumber = Number.isInteger(room.roomNumber) && room.roomNumber > 0 ? room.roomNumber : null;

        if (!unitNumber && room.roomCode) {
          const parsed = parseInt(room.roomCode.split('-').pop(), 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            unitNumber = parsed;
          }
        }

        if (unitNumber && unitNumber <= totalRooms) {
          if (!roomsByNumber.has(unitNumber)) {
            roomsByNumber.set(unitNumber, room);
          } else {
            const existingRoom = roomsByNumber.get(unitNumber);
            if (statusRank(room.status) > statusRank(existingRoom.status)) {
              duplicatesToArchive.push(existingRoom);
              roomsByNumber.set(unitNumber, room);
            } else {
              duplicatesToArchive.push(room);
            }
          }
        } else {
          duplicatesToArchive.push(room);
        }
      });

      const missingUnitNumbers = [];
      for (let i = 1; i <= totalRooms; i += 1) {
        if (!roomsByNumber.has(i)) {
          missingUnitNumbers.push(i);
        }
      }

      if (duplicatesToArchive.length > 0 || missingUnitNumbers.length > 0) {
        needsUpdate = true;
      }

      duplicatesToArchive.forEach(room => {
        const roomRef = doc(db, 'roomInventory', room.id);
        batch.update(roomRef, { archived: true, updatedAt: new Date().toISOString() });
      });

      missingUnitNumbers.forEach(unitNumber => {
        let roomCode = buildRoomCode(roomType.type, unitNumber);
        let counter = 0;
        while (existingCodes.has(roomCode)) {
          counter += 1;
          roomCode = `${buildRoomCode(roomType.type, unitNumber)}-${counter}`;
        }

        const newRoomRef = doc(inventoryRef);
        batch.set(newRoomRef, {
          roomCode,
          roomNumber: unitNumber,
          roomTypeId: roomType.id,
          roomTypeName: roomType.type,
          status: 'available',
          currentGuestName: '',
          currentGuestUid: '',
          currentReservationId: '',
          checkInDate: null,
          checkOutDate: null,
          occupancyHistory: [],
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        existingCodes.add(roomCode);
      });
    }

    if (needsUpdate) {
      await batch.commit();
      return { success: true };
    }

    return { success: true };
  } catch (error) {
    console.error('Error syncing room inventory:', error);
    throw error;
  }
}

/**
 * Create room inventory for a new room type
 */
export async function createRoomInventory(roomTypeId, roomTypeName, totalRooms) {
  try {
    const batch = writeBatch(db);
    const inventoryRef = collection(db, 'roomInventory');

    const snapshot = await getDocs(query(inventoryRef, where('archived', '!=', true)));
    const existingCodes = new Set(snapshot.docs.map(doc => doc.data().roomCode));

    for (let i = 1; i <= totalRooms; i += 1) {
      let roomCode = buildRoomCode(roomTypeName, i);
      let counter = 0;
      while (existingCodes.has(roomCode)) {
        counter += 1;
        roomCode = `${buildRoomCode(roomTypeName, i)}-${counter}`;
      }
      existingCodes.add(roomCode);

      const newRoomRef = doc(inventoryRef);
      batch.set(newRoomRef, {
        roomCode,
        roomNumber: i,
        roomTypeId,
        roomTypeName,
        status: 'available',
        currentGuestName: '',
        currentGuestUid: '',
        currentReservationId: '',
        checkInDate: null,
        checkOutDate: null,
        occupancyHistory: [],
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error creating room inventory:', error);
    throw error;
  }
}

/**
 * Update room inventory when room type changes
 */
export async function updateRoomInventory(roomTypeId, roomTypeName, newTotalRooms, oldTotalRooms) {
  try {
    await syncRoomInventory([{ id: roomTypeId, type: roomTypeName, totalRooms: newTotalRooms }]);
    return { success: true };
  } catch (error) {
    console.error('Error updating room inventory:', error);
    throw error;
  }
}