'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PENDING_CHECKIN_TOKEN_KEY } from '@/lib/checkinNavigation';

/**
 * Opens the reservation details sidebar when a check-in QR token is present.
 */
export default function CheckinTokenHandler({ groupMultiRoomBookings, openSidebar, setActiveTab }) {
  const searchParams = useSearchParams();
  const checkinTokenFromUrl = searchParams.get('checkinToken');

  useEffect(() => {
    const openSidebarFromToken = async () => {
      const token =
        checkinTokenFromUrl ||
        (typeof window !== 'undefined' ? sessionStorage.getItem(PENDING_CHECKIN_TOKEN_KEY) : null);

      if (!token) return;

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(PENDING_CHECKIN_TOKEN_KEY);
      }

      try {
        const tokenRef = doc(db, 'checkinTokens', token);
        const tokenDoc = await getDoc(tokenRef);
        if (!tokenDoc.exists()) return;

        const bookingId = tokenDoc.data().bookingId;

        const dayTourQuery = query(collection(db, 'dayTourBookings'), where('bookingId', '==', bookingId));
        const dayTourSnapshot = await getDocs(dayTourQuery);
        if (!dayTourSnapshot.empty) {
          const tourDoc = dayTourSnapshot.docs[0];
          const tourData = tourDoc.data();
          setActiveTab('daytour');
          openSidebar({
            id: tourDoc.id,
            ...tourData,
            type: 'daytour',
            bookingId: tourData.bookingId,
            guestInfo: tourData.guestInfo,
            selectedDate: tourData.selectedDate,
            adults: tourData.adults,
            kids: tourData.kids,
            seniors: tourData.seniors || 0,
            totalPrice: tourData.totalPrice,
            status: tourData.status,
            paymentProof: tourData.paymentProof,
            validIdImage: tourData.validIdImage,
            validIdType: tourData.validIdType,
            specialRequest: tourData.specialRequest,
            createdAt: tourData.createdAt,
          });
          return;
        }

        const roomQuery1 = query(collection(db, 'bookings'), where('bookingId', '==', bookingId));
        const roomQuery2 = query(collection(db, 'bookings'), where('parentBookingId', '==', bookingId));
        const [snap1, snap2] = await Promise.all([getDocs(roomQuery1), getDocs(roomQuery2)]);
        const matchedDocs = [...snap1.docs, ...snap2.docs];
        if (matchedDocs.length === 0) {
          console.warn('No room booking found for token', bookingId);
          return;
        }

        const roomBookingsList = matchedDocs.map((bookingDoc) => ({
          id: bookingDoc.id,
          ...bookingDoc.data(),
        }));
        const groupedRooms = groupMultiRoomBookings(roomBookingsList);
        if (groupedRooms.length > 0) {
          setActiveTab('rooms');
          openSidebar(groupedRooms[0]);
        } else {
          console.warn('No room booking to display for token', bookingId);
        }
      } catch (error) {
        console.error('Error retrieving booking from token:', error);
      }
    };

    openSidebarFromToken();
  }, [checkinTokenFromUrl, groupMultiRoomBookings, openSidebar, setActiveTab]);

  return null;
}
