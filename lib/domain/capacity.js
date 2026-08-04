// lib/domain/capacity.js
// Pure demand aggregation and transaction-size validation — no Firebase, no React.

/**
 * Maximum number of writes allowed in a single Firestore transaction.
 * Firestore limits transactions to 500 document writes.
 */
export const MAX_TRANSACTION_WRITES = 500;

/**
 * Overhead writes per reservation beyond date-specific ledgers:
 * parent booking, idempotency record, audit event, outbox entry.
 */
const OVERHEAD_WRITES = 4;

/**
 * Calculate room demand from a reservation command.
 * Returns a Map of roomId → number of units demanded.
 *
 * @param {object} command — reservation command
 * @param {Array<{roomId: string, quantity?: number}>} [command.rooms] — room selections
 * @returns {Map<string, number>} — roomId → units demanded
 */
export function calculateRoomDemand(command) {
  const demand = new Map();

  if (!command || !Array.isArray(command.rooms)) return demand;

  for (const room of command.rooms) {
    if (!room || !room.roomId) continue;
    const quantity = Math.max(1, Math.floor(Number(room.quantity) || 1));
    const current = demand.get(room.roomId) || 0;
    demand.set(room.roomId, current + quantity);
  }

  return demand;
}

/**
 * Calculate day-tour guest demand from a reservation command.
 *
 * @param {object} command — reservation command
 * @param {number} [command.adults] — number of adult guests
 * @param {number} [command.children] — number of child guests
 * @param {number} [command.seniors] — number of senior guests
 * @returns {{ adults: number, children: number, seniors: number, total: number }}
 */
export function calculateDayTourDemand(command) {
  if (!command) return { adults: 0, children: 0, seniors: 0, total: 0 };

  const adults = Math.max(0, Math.floor(Number(command.adults) || 0));
  const children = Math.max(0, Math.floor(Number(command.children) || 0));
  const seniors = Math.max(0, Math.floor(Number(command.seniors) || 0));

  return {
    adults,
    children,
    seniors,
    total: adults + children + seniors,
  };
}

/**
 * Determine if a reservation command represents an exclusive resort booking.
 *
 * @param {object} command — reservation command
 * @param {boolean} [command.isExclusiveResort] — explicit flag
 * @returns {boolean}
 */
export function isExclusiveResortReservation(command) {
  if (!command) return false;
  return command.isExclusiveResort === true;
}

/**
 * Validate that a reservation command's transaction size is within Firestore limits.
 *
 * A reservation write budget includes:
 * - 1 write per occupied date per room type (ledger updates)
 * - 1 child booking write per room in the group
 * - OVERHEAD_WRITES (parent, idempotency, audit, outbox)
 *
 * @param {object} command — reservation command
 * @param {string} [command.checkIn] — YYYY-MM-DD
 * @param {string} [command.checkOut] — YYYY-MM-DD
 * @param {Array<{roomId: string, quantity?: number}>} [command.rooms] — room selections
 * @param {boolean} [command.isDayTour] — day-tour flag
 * @returns {{ valid: boolean, error?: string, estimatedWrites?: number }}
 */
export function validateTransactionSize(command) {
  if (!command) return { valid: false, error: 'Command is required' };

  // Day tours occupy one date; transaction budget is minimal
  if (command.isDayTour) {
    // 1 ledger + overhead
    const writes = 1 + OVERHEAD_WRITES;
    return { valid: true, estimatedWrites: writes };
  }

  // Calculate number of nights
  if (!command.checkIn || !command.checkOut) {
    return { valid: false, error: 'Check-in and check-out dates are required' };
  }

  const nights = countNights(command.checkIn, command.checkOut);
  if (nights <= 0) {
    return { valid: false, error: 'Check-out must be after check-in' };
  }

  // Count distinct room types and total room units
  const roomDemand = calculateRoomDemand(command);
  const distinctRoomTypes = roomDemand.size;
  let totalRoomUnits = 0;
  for (const units of roomDemand.values()) {
    totalRoomUnits += units;
  }

  // Ledger writes: one per date per distinct room type
  const ledgerWrites = nights * distinctRoomTypes;
  // Child booking writes: one per room unit
  const childWrites = totalRoomUnits;
  // Total writes
  const estimatedWrites = ledgerWrites + childWrites + OVERHEAD_WRITES;

  if (estimatedWrites > MAX_TRANSACTION_WRITES) {
    return {
      valid: false,
      error: `Reservation exceeds transaction limit: ${estimatedWrites} writes estimated (max ${MAX_TRANSACTION_WRITES})`,
      estimatedWrites,
    };
  }

  return { valid: true, estimatedWrites };
}

/**
 * Count nights between two YYYY-MM-DD date strings.
 * @param {string} checkIn
 * @param {string} checkOut
 * @returns {number}
 */
function countNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  const diff = end - start;
  return diff > 0 ? Math.floor(diff / (24 * 60 * 60 * 1000)) : 0;
}
