// lib/server/services/reservation.js
// Transactional reservation service with atomic create/edit/cancel operations.
// All mutations happen in a single Firestore transaction with capacity ledger
// deltas, idempotency, audit, and outbox hooks.
// NEVER trusts client-supplied prices, statuses, or actor fields.
import 'server-only';

import { firestore } from '../firebase-admin.js';
import { occupiedDateKeys } from '../../domain/occupancy.js';
import { calculateRoomDemand, validateTransactionSize } from '../../domain/capacity.js';
import {
  calculateNights,
  calculateRoomCount,
  calculateGuestCount,
  calculateAuthoritativePrice,
} from '../../domain/pricing.js';
import {
  computeLedgerKeys,
  computeLedgerDeltas,
  readLedgers,
  writeLedgerDeltas,
  verifyCapacity,
} from './ledger.js';
import {
  computeCommandHash,
  checkIdempotencyInTransaction,
  recordIdempotency,
} from './idempotency.js';

/**
 * Firestore collections used by the reservation service.
 */
const BOOKINGS_COLLECTION = 'bookings';
const DAY_TOUR_BOOKINGS_COLLECTION = 'dayTourBookings';
const AUDIT_COLLECTION = 'auditEvents';
const OUTBOX_COLLECTION = 'notificationOutbox';

/**
 * Maximum stay length in nights (bounded by transaction budget).
 */
const MAX_STAY_NIGHTS = 30;

/**
 * Maximum rooms in a single booking group.
 */
const MAX_GROUP_SIZE = 10;

/**
 * Maximum guests for a day tour.
 */
const MAX_DAY_TOUR_GUESTS = 100;

/**
 * Validate a reservation command's prerequisites before transacting.
 * Throws typed errors for invalid inputs.
 *
 * @param {object} actor - The authenticated actor
 * @param {object} command - The reservation command
 * @throws {Error} With appropriate codes for validation failures
 */
function validateCommand(actor, command) {
  if (!actor || !actor.uid) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  if (!command || typeof command !== 'object') {
    const err = new Error('Command is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // Validate account eligibility
  if (actor.status !== 'active') {
    const err = new Error('Account is not active');
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (command.isDayTour) {
    // Day tour validation
    if (!command.selectedDate || typeof command.selectedDate !== 'string') {
      const err = new Error('Selected date is required for day tours');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(command.selectedDate)) {
      const err = new Error('Invalid date format');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const guestCount = calculateGuestCount(command);
    if (guestCount.total <= 0) {
      const err = new Error('At least one guest is required');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (guestCount.total > MAX_DAY_TOUR_GUESTS) {
      const err = new Error(`Guest count exceeds maximum of ${MAX_DAY_TOUR_GUESTS}`);
      err.code = 'INVALID_INPUT';
      throw err;
    }
    return;
  }

  // Room stay validation
  if (!command.checkIn || !command.checkOut) {
    const err = new Error('Check-in and check-out dates are required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(command.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(command.checkOut)) {
    const err = new Error('Invalid date format');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const nights = calculateNights(command.checkIn, command.checkOut);
  if (nights <= 0) {
    const err = new Error('Check-out must be after check-in');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (nights > MAX_STAY_NIGHTS) {
    const err = new Error(`Stay exceeds maximum of ${MAX_STAY_NIGHTS} nights`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!Array.isArray(command.rooms) || command.rooms.length === 0) {
    const err = new Error('At least one room selection is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const roomCount = calculateRoomCount(command.rooms);
  if (roomCount > MAX_GROUP_SIZE) {
    const err = new Error(`Room count exceeds maximum group size of ${MAX_GROUP_SIZE}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // Validate each room has a roomId
  for (const room of command.rooms) {
    if (!room || !room.roomId || typeof room.roomId !== 'string') {
      const err = new Error('Each room selection must have a valid roomId');
      err.code = 'INVALID_INPUT';
      throw err;
    }
  }

  // Validate transaction size
  const txSize = validateTransactionSize(command);
  if (!txSize.valid) {
    const err = new Error(txSize.error || 'Transaction size exceeded');
    err.code = 'INVALID_INPUT';
    throw err;
  }
}

/**
 * Load authoritative inventory and pricing for the requested rooms.
 * Returns inventory data from the 'inventory' collection.
 *
 * @param {FirebaseFirestore.Transaction} transaction - Active transaction
 * @param {object} command - The reservation command
 * @returns {Promise<object>} - Inventory with rooms map and down payment percent
 */
async function loadInventory(transaction, command) {
  if (command.isDayTour) {
    // Day tour pricing is loaded from a dedicated document
    const dayTourRef = firestore.collection('inventory').doc('dayTour');
    const snap = await transaction.get(dayTourRef);
    if (!snap.exists) {
      const err = new Error('Day tour inventory not configured');
      err.code = 'NOT_FOUND';
      throw err;
    }
    return snap.data();
  }

  // Load room inventory for each unique room type
  const demand = calculateRoomDemand(command);
  const roomIds = [...demand.keys()];

  const rooms = {};
  for (const roomId of roomIds) {
    const ref = firestore.collection('inventory').doc(roomId);
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      const err = new Error(`Room type '${roomId}' not found in inventory`);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const data = snap.data();
    rooms[roomId] = {
      priceCentavos: data.priceCentavos || 0,
      capacity: data.capacity || 0,
      name: data.name || roomId,
    };
  }

  // Load global settings for down payment percentage
  const settingsRef = firestore.collection('settings').doc('pricing');
  const settingsSnap = await transaction.get(settingsRef);
  const downPaymentPercent = settingsSnap.exists
    ? (settingsSnap.data().downPaymentPercent || 50)
    : 50;

  return { rooms, downPaymentPercent };
}

/**
 * Generate a unique booking ID with a prefix.
 * @param {string} prefix - 'BK' for room bookings, 'DT' for day tours
 * @returns {string}
 */
function generateBookingId(prefix = 'BK') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create a reservation with full transactional integrity.
 *
 * In ONE Firestore transaction:
 * - Reads idempotency record and ledger docs
 * - Verifies remaining capacity
 * - Writes ledger deltas, parent booking, child bookings
 * - Writes audit event and outbox item
 * - Stores operation result for idempotency
 *
 * @param {object} actor - The authenticated actor { uid, role, status, ... }
 * @param {object} command - The reservation command
 * @param {string} idempotencyKey - Unique idempotency key for this operation
 * @returns {Promise<object>} - The created booking result
 * @throws {Error} With typed codes for failures
 */
export async function createReservation(actor, command, idempotencyKey) {
  // Pre-transaction validation
  validateCommand(actor, command);

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const err = new Error('Idempotency key is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const commandHash = computeCommandHash(command);
  const ledgerKeys = computeLedgerKeys(command);

  const result = await firestore.runTransaction(async (transaction) => {
    // 1. Check idempotency
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction, idempotencyKey, actor.uid, commandHash
    );
    if (idempotencyCheck.exists) {
      return { idempotent: true, ...idempotencyCheck.result };
    }

    // 2. Load authoritative inventory and pricing
    const inventory = await loadInventory(transaction, command);

    // 3. Read capacity ledgers
    const ledgerState = await readLedgers(transaction, ledgerKeys);

    // 4. Compute deltas and verify capacity
    const deltas = computeLedgerDeltas(command);
    const isExclusive = command.isExclusiveResort === true;
    verifyCapacity(ledgerState, deltas, { isExclusive });

    // 5. Derive authoritative pricing
    const nights = command.isDayTour ? 0 : calculateNights(command.checkIn, command.checkOut);
    const guestCounts = calculateGuestCount(command);
    const roomCount = command.isDayTour ? 0 : calculateRoomCount(command.rooms);

    let totals;
    if (command.isDayTour) {
      // Day tour pricing from inventory
      const adultRate = inventory.adultPriceCentavos || 0;
      const childRate = inventory.childPriceCentavos || 0;
      const seniorRate = inventory.seniorPriceCentavos || 0;
      const total = (guestCounts.adults * adultRate)
        + (guestCounts.children * childRate)
        + (guestCounts.seniors * seniorRate);
      const dpPercent = inventory.downPaymentPercent || 50;
      const downPayment = Math.floor((total * dpPercent) / 100);
      totals = { total, downPayment, balance: total - downPayment };
    } else {
      totals = calculateAuthoritativePrice(inventory, command);
    }

    const now = new Date().toISOString();
    const parentId = generateBookingId(command.isDayTour ? 'DT' : 'BK');
    const collection = command.isDayTour ? DAY_TOUR_BOOKINGS_COLLECTION : BOOKINGS_COLLECTION;

    // 6. Write parent booking
    const parentRef = firestore.collection(collection).doc(parentId);
    const parentData = {
      id: parentId,
      ownerUid: actor.uid,
      type: command.isDayTour ? 'day-tour' : 'room',
      status: 'pending_payment',
      checkIn: command.checkIn || null,
      checkOut: command.checkOut || null,
      selectedDate: command.selectedDate || null,
      nights,
      roomCount,
      guestCounts,
      totals,
      paymentMethod: command.paymentMethod || null,
      paymentStatus: 'unpaid',
      isExclusiveResort: command.isExclusiveResort || false,
      specialRequest: command.specialRequest || null,
      childIds: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };

    // 7. Write child bookings (one per room unit for room stays)
    const childIds = [];
    if (!command.isDayTour && Array.isArray(command.rooms)) {
      for (const room of command.rooms) {
        const quantity = Math.max(1, Math.floor(Number(room.quantity) || 1));
        for (let i = 0; i < quantity; i++) {
          const childId = generateBookingId('CH');
          childIds.push(childId);
          const childRef = firestore.collection(collection).doc(childId);
          const roomInfo = inventory.rooms[room.roomId] || {};
          transaction.set(childRef, {
            id: childId,
            parentBookingId: parentId,
            ownerUid: actor.uid,
            inventoryId: room.roomId,
            roomName: roomInfo.name || room.roomId,
            occupancyStatus: 'pending_payment',
            checkIn: command.checkIn,
            checkOut: command.checkOut,
            nights,
            pricingSnapshot: {
              priceCentavos: roomInfo.priceCentavos || 0,
              nights,
            },
            createdAt: now,
            updatedAt: now,
            schemaVersion: 1,
          });
        }
      }
      parentData.childIds = childIds;
    }

    transaction.set(parentRef, parentData);

    // 8. Write ledger deltas
    writeLedgerDeltas(transaction, deltas, {
      exclusiveLockGroupId: isExclusive ? parentId : undefined,
    });

    // 9. Write audit event
    const auditRef = firestore.collection(AUDIT_COLLECTION).doc();
    transaction.set(auditRef, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'reservation.create',
      targetType: command.isDayTour ? 'dayTourBooking' : 'booking',
      targetId: parentId,
      correlationId: idempotencyKey,
      idempotencyKey,
      occurredAt: now,
      before: null,
      after: { status: 'pending_payment', totals, childIds },
      schemaVersion: 1,
    });

    // 10. Write outbox notification
    const outboxRef = firestore.collection(OUTBOX_COLLECTION).doc();
    transaction.set(outboxRef, {
      type: 'reservation_created',
      bookingId: parentId,
      actorUid: actor.uid,
      status: 'pending',
      createdAt: now,
      schemaVersion: 1,
    });

    // 11. Record idempotency
    const operationResult = {
      bookingId: parentId,
      type: parentData.type,
      status: parentData.status,
      totals,
      nights,
      roomCount,
      guestCounts,
      childIds,
    };
    recordIdempotency(
      transaction,
      idempotencyKey,
      actor.uid,
      commandHash,
      operationResult,
      { scope: 'reservation', businessEntityIds: [parentId, ...childIds] }
    );

    return operationResult;
  });

  return result;
}

/**
 * Edit an existing reservation atomically.
 * Computes old and new ledger deltas, updates all records in one transaction.
 *
 * @param {object} actor - The authenticated actor
 * @param {string} bookingId - The parent booking ID to edit
 * @param {object} command - The new reservation command (updated fields)
 * @param {string} idempotencyKey - Unique idempotency key
 * @returns {Promise<object>} - The updated booking result
 */
export async function editReservation(actor, bookingId, command, idempotencyKey) {
  if (!actor || !actor.uid) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  if (!bookingId || typeof bookingId !== 'string') {
    const err = new Error('Booking ID is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const err = new Error('Idempotency key is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const commandHash = computeCommandHash({ bookingId, ...command });

  const result = await firestore.runTransaction(async (transaction) => {
    // Check idempotency
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction, idempotencyKey, actor.uid, commandHash
    );
    if (idempotencyCheck.exists) {
      return { idempotent: true, ...idempotencyCheck.result };
    }

    // Load existing booking
    const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(bookingId);
    const bookingSnap = await transaction.get(bookingRef);

    if (!bookingSnap.exists) {
      // Try day tour collection
      const dtRef = firestore.collection(DAY_TOUR_BOOKINGS_COLLECTION).doc(bookingId);
      const dtSnap = await transaction.get(dtRef);
      if (!dtSnap.exists) {
        const err = new Error('Booking not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      // Handle day tour edit with same pattern below
    }

    const existing = bookingSnap.exists ? bookingSnap.data() : null;
    if (!existing) {
      const err = new Error('Booking not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Verify ownership
    if (existing.ownerUid !== actor.uid && actor.role !== 'admin') {
      const err = new Error('Access denied');
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Verify the booking is in an editable state
    const editableStatuses = ['pending_payment', 'confirmed'];
    if (!editableStatuses.includes(existing.status)) {
      const err = new Error(`Booking in status '${existing.status}' cannot be edited`);
      err.code = 'CONFLICT';
      throw err;
    }

    // Construct old command from existing data for delta calculation
    const oldCommand = {
      checkIn: existing.checkIn,
      checkOut: existing.checkOut,
      rooms: existing.childIds ? undefined : command.rooms,
      isDayTour: existing.type === 'day-tour',
      selectedDate: existing.selectedDate,
    };

    // Compute old ledger deltas (to release)
    const oldDeltas = computeLedgerDeltas(oldCommand);
    // Compute new ledger deltas (to acquire)
    const newDeltas = computeLedgerDeltas(command);

    // Compute net deltas (release old, acquire new)
    const allKeys = new Set([...oldDeltas.keys(), ...newDeltas.keys()]);
    const netDeltas = new Map();
    for (const key of allKeys) {
      const oldVal = oldDeltas.get(key) || 0;
      const newVal = newDeltas.get(key) || 0;
      const net = newVal - oldVal;
      if (net !== 0) {
        netDeltas.set(key, net);
      }
    }

    // Read affected ledgers and verify capacity for increases
    const keysToRead = [...netDeltas.keys()].filter((k) => netDeltas.get(k) > 0);
    if (keysToRead.length > 0) {
      const ledgerState = await readLedgers(transaction, keysToRead);
      const increasesOnly = new Map();
      for (const k of keysToRead) {
        increasesOnly.set(k, netDeltas.get(k));
      }
      verifyCapacity(ledgerState, increasesOnly);
    }

    // Load inventory for new pricing
    const inventory = await loadInventory(transaction, command);
    const nights = command.isDayTour ? 0 : calculateNights(command.checkIn, command.checkOut);
    const guestCounts = calculateGuestCount(command);
    const roomCount = command.isDayTour ? 0 : calculateRoomCount(command.rooms || []);
    const totals = command.isDayTour
      ? { total: 0, downPayment: 0, balance: 0 }
      : calculateAuthoritativePrice(inventory, command);

    const now = new Date().toISOString();

    // Update parent booking
    const updateData = {
      checkIn: command.checkIn || existing.checkIn,
      checkOut: command.checkOut || existing.checkOut,
      selectedDate: command.selectedDate || existing.selectedDate,
      nights,
      roomCount,
      guestCounts,
      totals,
      specialRequest: command.specialRequest ?? existing.specialRequest,
      updatedAt: now,
    };
    transaction.update(bookingRef, updateData);

    // Write net ledger deltas
    if (netDeltas.size > 0) {
      writeLedgerDeltas(transaction, netDeltas);
    }

    // Write audit event
    const auditRef = firestore.collection(AUDIT_COLLECTION).doc();
    transaction.set(auditRef, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'reservation.edit',
      targetType: existing.type === 'day-tour' ? 'dayTourBooking' : 'booking',
      targetId: bookingId,
      correlationId: idempotencyKey,
      idempotencyKey,
      occurredAt: now,
      before: { checkIn: existing.checkIn, checkOut: existing.checkOut, totals: existing.totals },
      after: { checkIn: updateData.checkIn, checkOut: updateData.checkOut, totals },
      schemaVersion: 1,
    });

    // Record idempotency
    const operationResult = {
      bookingId,
      action: 'edit',
      totals,
      nights,
      roomCount,
      guestCounts,
    };
    recordIdempotency(
      transaction, idempotencyKey, actor.uid, commandHash,
      operationResult,
      { scope: 'reservation', businessEntityIds: [bookingId] }
    );

    return operationResult;
  });

  return result;
}

/**
 * Cancel a reservation atomically.
 * Reverses ledger deltas, updates all related records, in one transaction.
 *
 * @param {object} actor - The authenticated actor
 * @param {string} bookingId - The parent booking ID to cancel
 * @param {string} idempotencyKey - Unique idempotency key
 * @returns {Promise<object>} - The cancellation result
 */
export async function cancelReservation(actor, bookingId, idempotencyKey) {
  if (!actor || !actor.uid) {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  if (!bookingId || typeof bookingId !== 'string') {
    const err = new Error('Booking ID is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const err = new Error('Idempotency key is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const commandHash = computeCommandHash({ bookingId, action: 'cancel' });

  const result = await firestore.runTransaction(async (transaction) => {
    // Check idempotency
    const idempotencyCheck = await checkIdempotencyInTransaction(
      transaction, idempotencyKey, actor.uid, commandHash
    );
    if (idempotencyCheck.exists) {
      return { idempotent: true, ...idempotencyCheck.result };
    }

    // Load existing booking (try both collections)
    let bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(bookingId);
    let bookingSnap = await transaction.get(bookingRef);
    let collection = BOOKINGS_COLLECTION;

    if (!bookingSnap.exists) {
      bookingRef = firestore.collection(DAY_TOUR_BOOKINGS_COLLECTION).doc(bookingId);
      bookingSnap = await transaction.get(bookingRef);
      collection = DAY_TOUR_BOOKINGS_COLLECTION;
    }

    if (!bookingSnap.exists) {
      const err = new Error('Booking not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const existing = bookingSnap.data();

    // Verify ownership
    if (existing.ownerUid !== actor.uid && actor.role !== 'admin') {
      const err = new Error('Access denied');
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Verify the booking is in a cancellable state
    const cancellableStatuses = ['pending_payment', 'confirmed'];
    if (!cancellableStatuses.includes(existing.status)) {
      const err = new Error(`Booking in status '${existing.status}' cannot be cancelled`);
      err.code = 'CONFLICT';
      throw err;
    }

    const now = new Date().toISOString();

    // Reconstruct command from existing booking for delta reversal
    const existingCommand = {
      checkIn: existing.checkIn,
      checkOut: existing.checkOut,
      rooms: [],
      isDayTour: existing.type === 'day-tour',
      selectedDate: existing.selectedDate,
      adults: existing.guestCounts?.adults || 0,
      children: existing.guestCounts?.children || 0,
      seniors: existing.guestCounts?.seniors || 0,
    };

    // If room booking, load child records to reconstruct room demand
    if (!existingCommand.isDayTour && Array.isArray(existing.childIds) && existing.childIds.length > 0) {
      const childRooms = new Map();
      for (const childId of existing.childIds) {
        const childRef = firestore.collection(collection).doc(childId);
        const childSnap = await transaction.get(childRef);
        if (childSnap.exists) {
          const childData = childSnap.data();
          const roomId = childData.inventoryId;
          childRooms.set(roomId, (childRooms.get(roomId) || 0) + 1);
        }
      }
      existingCommand.rooms = [...childRooms.entries()].map(([roomId, quantity]) => ({
        roomId,
        quantity,
      }));
    }

    // Compute ledger deltas to reverse (negate the original deltas)
    const originalDeltas = computeLedgerDeltas(existingCommand);
    const reverseDeltas = new Map();
    for (const [key, val] of originalDeltas.entries()) {
      reverseDeltas.set(key, -val);
    }

    // Update parent booking status
    transaction.update(bookingRef, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: actor.uid,
      updatedAt: now,
    });

    // Update all child bookings
    if (Array.isArray(existing.childIds)) {
      for (const childId of existing.childIds) {
        const childRef = firestore.collection(collection).doc(childId);
        transaction.update(childRef, {
          occupancyStatus: 'cancelled',
          cancelledAt: now,
          updatedAt: now,
        });
      }
    }

    // Write reverse ledger deltas
    if (reverseDeltas.size > 0) {
      writeLedgerDeltas(transaction, reverseDeltas);
    }

    // Write audit event
    const auditRef = firestore.collection(AUDIT_COLLECTION).doc();
    transaction.set(auditRef, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'reservation.cancel',
      targetType: existing.type === 'day-tour' ? 'dayTourBooking' : 'booking',
      targetId: bookingId,
      correlationId: idempotencyKey,
      idempotencyKey,
      occurredAt: now,
      before: { status: existing.status },
      after: { status: 'cancelled' },
      schemaVersion: 1,
    });

    // Write outbox notification
    const outboxRef = firestore.collection(OUTBOX_COLLECTION).doc();
    transaction.set(outboxRef, {
      type: 'reservation_cancelled',
      bookingId,
      actorUid: actor.uid,
      status: 'pending',
      createdAt: now,
      schemaVersion: 1,
    });

    // Record idempotency
    const operationResult = {
      bookingId,
      action: 'cancel',
      previousStatus: existing.status,
      newStatus: 'cancelled',
    };
    recordIdempotency(
      transaction, idempotencyKey, actor.uid, commandHash,
      operationResult,
      { scope: 'reservation', businessEntityIds: [bookingId] }
    );

    return operationResult;
  });

  return result;
}
