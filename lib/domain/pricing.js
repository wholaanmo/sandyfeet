// lib/domain/pricing.js
// Pure authoritative pricing calculations — integer centavo arithmetic only.
// No Firebase, no React, no floating-point currency math.

/**
 * Calculate the number of nights between check-in and check-out.
 *
 * @param {string} checkIn — YYYY-MM-DD
 * @param {string} checkOut — YYYY-MM-DD
 * @returns {number} — number of nights (0 if invalid)
 */
export function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  if (typeof checkIn !== 'string' || typeof checkOut !== 'string') return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return 0;

  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  const diff = end - start;
  return diff > 0 ? Math.floor(diff / (24 * 60 * 60 * 1000)) : 0;
}

/**
 * Calculate the total number of rooms from a rooms array.
 *
 * @param {Array<{quantity?: number}>} rooms — room selections
 * @returns {number} — total room count
 */
export function calculateRoomCount(rooms) {
  if (!Array.isArray(rooms)) return 0;
  let total = 0;
  for (const room of rooms) {
    if (!room) continue;
    total += Math.max(1, Math.floor(Number(room.quantity) || 1));
  }
  return total;
}

/**
 * Calculate guest counts from a reservation command.
 *
 * @param {object} command
 * @param {number} [command.adults] — number of adults
 * @param {number} [command.children] — number of children
 * @param {number} [command.seniors] — number of seniors
 * @returns {{ adults: number, children: number, seniors: number, total: number }}
 */
export function calculateGuestCount(command) {
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
 * Calculate the authoritative price for a reservation using integer centavo arithmetic.
 * All monetary values are in PHP minor units (centavos, 1 PHP = 100 centavos).
 *
 * Pricing rules:
 * - Room price is per room per night in centavos
 * - Total = sum of (room rate × quantity × nights) for each room selection
 * - Down payment is a percentage of total (default 50%)
 * - Balance = total - downPayment
 *
 * @param {object} inventory — available inventory with pricing
 * @param {Map<string, {priceCentavos: number}>|object} inventory.rooms — roomId → { priceCentavos }
 * @param {number} [inventory.downPaymentPercent] — down payment percentage (0-100, default 50)
 * @param {object} command — reservation command
 * @param {string} command.checkIn — YYYY-MM-DD
 * @param {string} command.checkOut — YYYY-MM-DD
 * @param {Array<{roomId: string, quantity?: number}>} command.rooms — room selections
 * @returns {{ total: number, downPayment: number, balance: number }}
 */
export function calculateAuthoritativePrice(inventory, command) {
  if (!inventory || !command) {
    return { total: 0, downPayment: 0, balance: 0 };
  }

  const nights = calculateNights(command.checkIn, command.checkOut);
  if (nights <= 0) {
    return { total: 0, downPayment: 0, balance: 0 };
  }

  const rooms = command.rooms;
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return { total: 0, downPayment: 0, balance: 0 };
  }

  // Resolve room prices from inventory
  const roomPrices = inventory.rooms instanceof Map
    ? inventory.rooms
    : new Map(Object.entries(inventory.rooms || {}));

  let total = 0;

  for (const selection of rooms) {
    if (!selection || !selection.roomId) continue;

    const roomInfo = roomPrices.get(selection.roomId);
    if (!roomInfo || typeof roomInfo.priceCentavos !== 'number') continue;

    const priceCentavos = Math.floor(roomInfo.priceCentavos);
    if (priceCentavos < 0) continue;

    const quantity = Math.max(1, Math.floor(Number(selection.quantity) || 1));

    // Integer multiplication: price × quantity × nights
    total += priceCentavos * quantity * nights;
  }

  // Down payment calculation (integer arithmetic, truncate fractional centavos)
  const downPaymentPercent = typeof inventory.downPaymentPercent === 'number'
    ? Math.max(0, Math.min(100, Math.floor(inventory.downPaymentPercent)))
    : 50;

  const downPayment = Math.floor((total * downPaymentPercent) / 100);
  const balance = total - downPayment;

  return { total, downPayment, balance };
}
