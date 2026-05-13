import { collection, getDocs, query, where, updateDoc, doc, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendCancellationEmail, sendDayTourCancellationEmail } from '@/lib/emailService';

// ─── Date Helpers ────────────────────────────────────────
export const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value && typeof value === 'object' && value.seconds) return new Date(value.seconds * 1000);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateOnly = (value) => {
  const date = toDateValue(value);
  if (!date) return 'Date pending';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDateTime = (value) => {
  const date = toDateValue(value);
  if (!date) return 'N/A';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const formatAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.street, address.barangay, address.city, address.province, address.postalCode]
    .map((p) => String(p || '').trim()).filter(Boolean).join(', ');
};

export const calcNights = (checkIn, checkOut) => {
  const s = toDateValue(checkIn), e = toDateValue(checkOut);
  if (!s || !e) return 0;
  const sd = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const ed = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.max(1, Math.round((ed - sd) / 864e5));
};

// ─── Status / Type Helpers ───────────────────────────────
export const getStatusBadge = (status, cancelledBy) => {
  if (status === 'cancelled') {
    return { label: cancelledBy === 'admin' ? 'Cancelled by Resort' : 'Not Confirmed', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
  }
  const map = {
    pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    'check-in': { label: 'Checked In', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    'check-out': { label: 'Checked Out', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
    'cancelled-by-guest': { label: 'Cancelled by Guest', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  };
  return map[status] || { label: status || 'Unknown', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
};

export const getTypeDisplay = (b) => {
  if (b.type === 'daytour') return { label: 'Day Tour', color: 'bg-emerald-100 text-emerald-700', icon: 'fa-sun' };
  if (b.isExclusiveResortBooking) return { label: 'Entire Resort', color: 'bg-amber-100 text-amber-700', icon: 'fa-crown' };
  if (b.isMultiRoom) return { label: 'Multi-Room', color: 'bg-violet-100 text-violet-700', icon: 'fa-layer-group' };
  return { label: 'Room', color: 'bg-blue-100 text-blue-700', icon: 'fa-bed' };
};

export const getBookingTitle = (b) => {
  if (b.type === 'daytour') return 'Day Tour Booking';
  if (b.isExclusiveResortBooking) return 'Entire Resort Booking';
  if (b.isMultiRoom) return 'Multi-Room Booking';
  return b.roomType || 'Room Booking';
};

export const getGuestTotal = (b) => {
  if (b.type === 'daytour') return (b.seniors || 0) + (b.adults || 0) + (b.kids || 0) || b.totalGuests || 0;
  if (b.isExclusiveResortBooking) return (b.exclusiveAdults || 0) + (b.exclusiveKids || 0);
  if (b.isMultiRoom) return b.totalGuests || b.guests || 0;
  return b.guests || 0;
};

export const getDownPayment = (b) => {
  if (typeof b.downPayment === 'number' && !Number.isNaN(b.downPayment) && b.downPayment > 0) return b.downPayment;
  return Number(b.totalPrice || 0) * 0.5;
};

export const getBalance = (b) => {
  if (['cancelled', 'cancelled-by-guest'].includes(b.status)) return 0;
  if (typeof b.remainingBalance === 'number' && b.remainingBalance >= 0) return b.remainingBalance;
  return Math.max(0, Number(b.totalPrice || 0) - getDownPayment(b));
};

export const getRoomTypes = (b) => {
  if (Array.isArray(b.roomTypesArray) && b.roomTypesArray.length > 0) return b.roomTypesArray;
  if (b.roomType) return [{ type: b.roomType, quantity: b.numberOfRooms || 1 }];
  return [];
};

export const canCancel = (b) => {
  if (['cancelled', 'cancelled-by-guest'].includes(b.status)) return false;
  if (b.isMultiRoom && b.children) {
    return b.children.some(c => c.status === 'pending' || c.status === 'confirmed');
  }
  return b.status === 'pending' || b.status === 'confirmed';
};

// ─── Booking Normalization ───────────────────────────────
export const normalizeBooking = (docSnap, type) => {
  const d = docSnap.data();
  return {
    key: `${type}-${docSnap.id}`, id: docSnap.id, type, bookingId: d.bookingId || docSnap.id,
    status: d.status || 'pending', createdAt: d.createdAt,
    totalPrice: Number(d.totalPrice || 0), downPayment: Number(d.downPayment || 0),
    remainingBalance: Number(d.remainingBalance || 0),
    guestInfo: d.guestInfo || {}, adminNote: d.adminNote || null,
    cancelledBy: d.cancelledBy || null, cancellationReason: d.cancellationReason || null,
    isExclusiveResortBooking: Boolean(d.isExclusiveResortBooking),
    isMultiRoomBooking: Boolean(d.isMultiRoomBooking),
    parentBookingId: d.parentBookingId || null, roomType: d.roomType || null,
    numberOfRooms: d.numberOfRooms || 1, checkIn: d.checkIn || null, checkOut: d.checkOut || null,
    nights: d.nights || null, selectedDate: d.selectedDate || null,
    adults: Number(d.adults || 0), kids: Number(d.kids || 0), seniors: Number(d.seniors || 0),
    guests: Number(d.guests || d.totalGuests || 0), totalGuests: Number(d.totalGuests || 0),
    exclusiveAdults: Number(d.exclusiveAdults || 0), exclusiveKids: Number(d.exclusiveKids || 0),
    tentCount: Number(d.tentCount || 0), paymentMethod: d.paymentMethod || null,
    roomTypesArray: Array.isArray(d.roomTypes) ? d.roomTypes : d.roomTypesArray || null,
    guestUid: d.guestUid || null,
  };
};

const deriveGroupStatus = (children) => {
  if (children.some(c => c.status === 'cancelled')) return 'cancelled';
  if (children.some(c => c.status === 'cancelled-by-guest')) return 'cancelled-by-guest';
  if (children.some(c => c.status === 'pending')) return 'pending';
  if (children.some(c => c.status === 'check-in')) return 'check-in';
  if (children.some(c => c.status === 'check-out')) return 'check-out';
  return 'confirmed';
};

export const buildMultiRoomGroup = (children, parentId) => {
  const base = children[0];
  const roomTypeCounts = children.reduce((acc, c) => {
    const t = c.roomType || 'Room';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const roomTypesArray = Object.entries(roomTypeCounts).map(([type, quantity]) => ({ type, quantity }));
  const totalPrice = children.reduce((s, c) => s + Number(c.totalPrice || 0), 0);
  const tentCount = children.reduce((s, c) => s + Number(c.tentCount || 0), 0);
  const downPayment = children.reduce((s, c) => {
    const dp = (typeof c.downPayment === 'number' && !Number.isNaN(c.downPayment)) ? c.downPayment : Number(c.totalPrice || 0) * 0.5;
    return s + dp;
  }, 0);
  const totalGuests = children.reduce((s, c) => s + Number(c.guests || 0), 0);
  return {
    ...base, key: `room-${parentId}`, id: parentId, bookingId: parentId,
    isMultiRoom: true, isMultiRoomBooking: true, status: deriveGroupStatus(children),
    children, roomTypesArray, totalRooms: children.length, totalPrice, downPayment,
    remainingBalance: Math.max(totalPrice - downPayment, 0), totalGuests, tentCount, roomType: null,
  };
};

// ─── Fetch All User Bookings ─────────────────────────────
export const fetchUserBookings = async (user) => {
  const normalizedEmail = user.email.toLowerCase().trim();
  const [roomEmail, dayEmail, roomUid, dayUid] = await Promise.all([
    getDocs(query(collection(db, 'bookings'), where('guestInfo.email', '==', normalizedEmail))),
    getDocs(query(collection(db, 'dayTourBookings'), where('guestInfo.email', '==', normalizedEmail))),
    getDocs(query(collection(db, 'bookings'), where('guestUid', '==', user.uid))),
    getDocs(query(collection(db, 'dayTourBookings'), where('guestUid', '==', user.uid))),
  ]);
  const map = new Map();
  [...roomEmail.docs.map(d => normalizeBooking(d, 'room')),
   ...roomUid.docs.map(d => normalizeBooking(d, 'room')),
   ...dayEmail.docs.map(d => normalizeBooking(d, 'daytour')),
   ...dayUid.docs.map(d => normalizeBooking(d, 'daytour')),
  ].forEach(b => map.set(`${b.type}-${b.id}`, b));

  const deduped = Array.from(map.values());
  const rooms = deduped.filter(b => b.type === 'room');
  const dayTours = deduped.filter(b => b.type === 'daytour');
  const grouped = [], groupMap = new Map();
  rooms.forEach(b => {
    if (b.parentBookingId) {
      if (!groupMap.has(b.parentBookingId)) groupMap.set(b.parentBookingId, []);
      groupMap.get(b.parentBookingId).push(b);
    } else grouped.push(b);
  });
  groupMap.forEach((children, pid) => grouped.push(buildMultiRoomGroup(children, pid)));
  return [...grouped, ...dayTours].sort((a, b) => {
    const bD = toDateValue(b.createdAt)?.getTime() || 0;
    const aD = toDateValue(a.createdAt)?.getTime() || 0;
    return bD - aD;
  });
};

// ─── Lookup by Reference ─────────────────────────────────
export const lookupByReference = async (email, refNumber) => {
  const normEmail = email.toLowerCase().trim();
  const bookingId = refNumber.trim().toUpperCase();

  // Check multi-room first
  const childSnap = await getDocs(query(
    collection(db, 'bookings'),
    where('parentBookingId', '==', bookingId),
    where('isMultiRoomBooking', '==', true)
  ));
  if (!childSnap.empty) {
    const first = childSnap.docs[0].data();
    if (first.guestInfo?.email?.toLowerCase() !== normEmail) return null;
    const children = childSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    children.sort((a, b) => (a.roomType || '').localeCompare(b.roomType || ''));
    let totalPrice = 0, totalRooms = 0, totalGuests = 0;
    const roomTypes = {};
    children.forEach(c => {
      totalPrice += c.totalPrice || 0;
      totalRooms += c.numberOfRooms || 1;
      totalGuests += c.guests || 1;
      if (!roomTypes[c.roomType]) roomTypes[c.roomType] = { quantity: 1, guestsPerRoom: c.guests || 1, price: c.price };
      else roomTypes[c.roomType].quantity++;
    });
    if (first.isExclusiveResortBooking) totalRooms += (first.tentCount || 0);
    let status = first.status, cancellationReason = null, cancelledBy = null;
    for (const c of children) {
      if (c.status === 'cancelled') { status = 'cancelled'; cancellationReason = c.cancellationReason; cancelledBy = c.cancelledBy; break; }
      if (c.status === 'cancelled-by-guest') { status = 'cancelled-by-guest'; cancellationReason = c.cancellationReason; cancelledBy = c.cancelledBy; }
    }
    return {
      key: `room-${bookingId}`, id: bookingId, bookingId, guestInfo: first.guestInfo,
      checkIn: first.checkIn, checkOut: first.checkOut, status, totalPrice, type: 'room',
      isMultiRoom: true, isMultiRoomBooking: true, totalRooms, totalGuests,
      roomTypes, roomTypesArray: Object.entries(roomTypes).map(([t, d]) => ({ type: t, quantity: d.quantity, guestsPerRoom: d.guestsPerRoom, price: d.price })),
      createdAt: first.createdAt, children, cancellationReason, cancelledBy,
      adminNote: first.adminNote || null, isExclusiveResortBooking: first.isExclusiveResortBooking || false,
      exclusivePackagePrice: first.exclusivePackagePrice || null, tentCount: first.tentCount || 0,
      exclusiveAdults: first.exclusiveAdults || 0, exclusiveKids: first.exclusiveKids || 0,
      adults: first.adults || 0, kids: first.kids || 0, seniors: first.seniors || 0,
      guests: first.guests || 0, totalGuests: totalGuests, downPayment: 0, remainingBalance: 0,
      paymentMethod: first.paymentMethod || null, roomType: null,
    };
  }

  // Single room
  const roomSnap = await getDocs(query(
    collection(db, 'bookings'),
    where('guestInfo.email', '==', normEmail),
    where('bookingId', '==', bookingId)
  ));
  if (!roomSnap.empty) {
    const d = roomSnap.docs[0];
    return { ...normalizeBooking(d, 'room'), _docId: d.id, _collection: 'bookings' };
  }

  // Day tour
  const dtSnap = await getDocs(query(
    collection(db, 'dayTourBookings'),
    where('guestInfo.email', '==', normEmail),
    where('bookingId', '==', bookingId)
  ));
  if (!dtSnap.empty) {
    const d = dtSnap.docs[0];
    return { ...normalizeBooking(d, 'daytour'), _docId: d.id, _collection: 'dayTourBookings' };
  }
  return null;
};

// ─── Cancellation ────────────────────────────────────────
export const cancelBooking = async (booking, reason) => {
  const now = new Date().toISOString();
  const cancelData = { status: 'cancelled-by-guest', cancelledAt: now, cancelledBy: 'guest', cancellationReason: reason, updatedAt: now };

  if (booking.isMultiRoom && booking.children) {
    for (const child of booking.children) {
      if (child.status !== 'cancelled' && child.status !== 'cancelled-by-guest') {
        await updateDoc(doc(db, 'bookings', child.id), cancelData);
      }
    }
  } else if (booking.type === 'daytour') {
    const colId = booking._collection || 'dayTourBookings';
    const docId = booking._docId || booking.id;
    await updateDoc(doc(db, colId, docId), cancelData);
  } else {
    const colId = booking._collection || 'bookings';
    const docId = booking._docId || booking.id;
    await updateDoc(doc(db, colId, docId), cancelData);
  }

  // Add cancellation notification
  try {
    const notif = {
      guestName: `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`,
      bookingId: booking.bookingId, cancelledAt: now, cancellationReason: reason,
      read: false, bookingType: booking.type || 'room',
    };
    if (booking.isMultiRoom) {
      notif.isMultiRoom = true;
      notif.parentBookingId = booking.id || booking.bookingId;
      notif.totalRooms = booking.totalRooms;
      notif.isExclusiveResortBooking = booking.isExclusiveResortBooking || false;
      notif.roomType = booking.isExclusiveResortBooking ? 'Entire Resort' :
        (booking.roomTypesArray?.length > 1 ? 'Multi-Room Types' : 'Single Room Type');
    } else if (booking.type === 'daytour') {
      notif.bookingTypeLabel = 'Day Tour';
      notif.tourDate = booking.selectedDate;
      notif.roomType = 'Day Tour';
    } else {
      notif.bookingTypeLabel = 'Room';
      notif.roomType = booking.isExclusiveResortBooking ? 'Entire Resort' : 'Single Room Type';
    }
    await addDoc(collection(db, 'guest_cancellations'), notif);
  } catch (err) { console.error('Error adding cancellation notification:', err); }

  // Send cancellation emails
  try {
    if (booking.isMultiRoom && booking.children) {
      const first = booking.children[0];
      let roomTypesDisplay = booking.isExclusiveResortBooking
        ? `Entire Resort Package${booking.tentCount > 0 ? ` + ${booking.tentCount} Tent(s)` : ''}`
        : (booking.roomTypesArray || []).map(r => `${r.quantity} x ${r.type}`).join(', ');
      await sendCancellationEmail({ ...first, totalPrice: booking.totalPrice, bookingId: booking.bookingId, isMultiRoomGroup: true, roomTypesDisplay }, reason, 'guest');
    } else if (booking.type === 'daytour') {
      await sendDayTourCancellationEmail(booking, reason, 'guest');
    } else {
      await sendCancellationEmail({ ...booking, roomTypesDisplay: `1 x ${booking.roomType}` }, reason, 'guest');
    }
  } catch (err) { console.error('Email send error:', err); }

  // Resort notification email
  try {
    const guestName = `${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}`;
    const dp = getDownPayment(booking);
    let html;
    if (booking.type === 'daytour') {
      html = `<div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;border-radius:8px"><h2 style="color:#dc2626">Reservation Cancelled by Guest</h2><p><strong>Guest:</strong> ${guestName}</p><p><strong>Booking ID:</strong> ${booking.bookingId}</p><p><strong>Tour Date:</strong> ${formatDateOnly(booking.selectedDate)}</p><p><strong>Total:</strong> PHP ${booking.totalPrice?.toLocaleString()}</p><p><strong>DP Paid:</strong> PHP ${dp.toLocaleString()}</p><hr/><p><strong>Reason:</strong> ${reason}</p></div>`;
    } else {
      const roomStr = booking.isExclusiveResortBooking ? 'Entire Resort' : booking.isMultiRoom
        ? (booking.roomTypesArray || []).map(r => `${r.quantity} x ${r.type}`).join(', ')
        : booking.roomType || 'Room';
      html = `<div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;border-radius:8px"><h2 style="color:#dc2626">Reservation Cancelled by Guest</h2><p><strong>Guest:</strong> ${guestName}</p><p><strong>Booking ID:</strong> ${booking.bookingId}</p><p><strong>Rooms:</strong> ${roomStr}</p><p><strong>Check-in:</strong> ${formatDateOnly(booking.checkIn)}</p><p><strong>Check-out:</strong> ${formatDateOnly(booking.checkOut)}</p><p><strong>Total:</strong> PHP ${booking.totalPrice?.toLocaleString()}</p><p><strong>DP Paid:</strong> PHP ${dp.toLocaleString()}</p><hr/><p><strong>Reason:</strong> ${reason}</p></div>`;
    }
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'sandyfeetreservation@gmail.com', subject: `Reservation Cancelled - ${booking.bookingId}`, html }),
    });
  } catch (err) { console.error('Resort email error:', err); }

  return { ...booking, status: 'cancelled-by-guest', cancelledAt: now, cancelledBy: 'guest', cancellationReason: reason };
};
