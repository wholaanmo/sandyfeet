const LOCAL_BOOKING_DRAFT_KEYS = [
  'multi_room_booking_data',
  'multi_room_booking_step',
  'daytour_booking_data',
  'daytour_booking_step',
];

const SESSION_BOOKING_DRAFT_KEYS = [
  'multiRoomBooking',
  'multiRoomBookingDraft',
  'roomsCheckoutDraft',
  'roomsPageState',
  'roomDetailDraft',
  'resetRoomsPage',
  'dayTourCalendarState',
];

export function clearGuestBookingDrafts() {
  if (typeof window === 'undefined') return;

  LOCAL_BOOKING_DRAFT_KEYS.forEach((key) => localStorage.removeItem(key));
  SESSION_BOOKING_DRAFT_KEYS.forEach((key) => sessionStorage.removeItem(key));
}
