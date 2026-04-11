'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function AdminOverview() {
  const [stats, setStats] = useState({
    totalRooms: 0,
    totalReservations: 0,
    totalStaff: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  if (auth.currentUser) {
    console.log("UID:", auth.currentUser.uid);
  } else {
    console.log("No user logged in");
  }
}, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch rooms count
        const roomsRef = collection(db, 'rooms');
        const roomsSnapshot = await getDocs(roomsRef);
        
        // Fetch reservations count
        const reservationsRef = collection(db, 'reservations');
        const reservationsSnapshot = await getDocs(reservationsRef);
        
        // Fetch staff count (users with role staff or admin)
        const usersRef = collection(db, 'users');
        const staffQuery = query(usersRef, where('role', 'in', ['staff', 'admin']));
        const staffSnapshot = await getDocs(staffQuery);
        
        setStats({
          totalRooms: roomsSnapshot.size,
          totalReservations: reservationsSnapshot.size,
          totalStaff: staffSnapshot.size
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-textPrimary font-playfair mb-2">
          Admin Dashboard Overview
        </h1>
        <p className="text-accent text-lg">
          Welcome to SandyFeet Reservation Admin Dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Rooms Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral/20 hover:shadow-xl transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent/10 p-3 rounded-full">
              <i className="fas fa-bed text-2xl text-accent"></i>
            </div>
            <span className="text-4xl font-bold text-textPrimary">{stats.totalRooms}</span>
          </div>
          <h3 className="text-lg font-semibold text-textPrimary mb-1">Total Rooms</h3>
          <p className="text-neutral text-sm">Available and occupied rooms</p>
        </div>

        {/* Total Reservations Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral/20 hover:shadow-xl transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent/10 p-3 rounded-full">
              <i className="fas fa-calendar-check text-2xl text-accent"></i>
            </div>
            <span className="text-4xl font-bold text-textPrimary">{stats.totalReservations}</span>
          </div>
          <h3 className="text-lg font-semibold text-textPrimary mb-1">Reservations</h3>
          <p className="text-neutral text-sm">Total bookings made</p>
        </div>

        {/* Total Staff Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral/20 hover:shadow-xl transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent/10 p-3 rounded-full">
              <i className="fas fa-users text-2xl text-accent"></i>
            </div>
            <span className="text-4xl font-bold text-textPrimary">{stats.totalStaff}</span>
          </div>
          <h3 className="text-lg font-semibold text-textPrimary mb-1">Staff</h3>
          <p className="text-neutral text-sm">Active staff members</p>
        </div>
      </div>
    </div>
  );
}