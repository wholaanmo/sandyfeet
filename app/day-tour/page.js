// app/day-tour/page.js
'use client';

import { useState, useEffect } from 'react';
import GuestLayout from '../guest/layout';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import DayTourCard from '@/components/guest/DayTourCard';
import ActivityCard from '@/components/guest/ActivityCard';

export default function DayTourPage() {
  const [dayTours, setDayTours] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Handle mounted state for hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Real-time listener for available day tours
  useEffect(() => {
    if (!mounted) return;
    
    const toursRef = collection(db, 'dayTours');
    const toursQuery = query(toursRef, where('archived', '!=', true), orderBy('createdAt', 'desc'));
    
    const unsubscribeTours = onSnapshot(toursQuery, (querySnapshot) => {
      const toursList = [];
      
      querySnapshot.forEach((doc) => {
        const tourData = doc.data();
        if (tourData.availability === 'available') {
          toursList.push({
            id: doc.id,
            ...tourData
          });
        }
      });
      setDayTours(toursList);
    }, (error) => {
      console.error('Error fetching day tours:', error);
    });
    
    return () => unsubscribeTours();
  }, [mounted]);

  // Real-time listener for activities (only non-archived)
  useEffect(() => {
    if (!mounted) return;
    
    const activitiesRef = collection(db, 'activities');
    const activitiesQuery = query(activitiesRef, where('archived', '!=', true), orderBy('createdAt', 'desc'));
    
    const unsubscribeActivities = onSnapshot(activitiesQuery, (querySnapshot) => {
      const activitiesList = [];
      querySnapshot.forEach((doc) => {
        activitiesList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setActivities(activitiesList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching activities:', error);
      setLoading(false);
    });
    
    return () => unsubscribeActivities();
  }, [mounted]);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <GuestLayout>
        <div className="min-h-screen bg-gradient-to-br from-ocean-ice to-blue-white">
          <div className="pt-12 pb-8">
            <div className="mx-auto" style={{ marginLeft: '5%', marginRight: '5%' }}>
              <div className="text-center">
                <h1 className="text-4xl md:text-5xl font-bold text-textPrimary font-playfair mb-3 tracking-tight">
                  Activities & Day Tour
                </h1>
                <p className="text-textSecondary text-lg max-w-2xl mx-auto leading-relaxed">
                  Discover exciting adventure activities and our day tour package. Perfect for making unforgettable memories.
                </p>
              </div>
            </div>
          </div>
          <div className="mx-auto pb-16" style={{ marginLeft: '5%', marginRight: '5%' }}>
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-[60%] space-y-5">
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white rounded-2xl shadow-md overflow-hidden animate-pulse flex">
                      <div className="w-1/3 h-32 bg-gray-200"></div>
                      <div className="flex-1 p-4">
                        <div className="h-5 bg-gray-200 rounded mb-2 w-3/4"></div>
                        <div className="h-4 bg-gray-200 rounded mb-2 w-1/2"></div>
                        <div className="h-3 bg-gray-200 rounded w-full"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:w-[40%]">
                <div className="bg-white rounded-2xl shadow-md overflow-hidden animate-pulse">
                  <div className="h-64 bg-gray-200"></div>
                  <div className="p-6">
                    <div className="h-6 bg-gray-200 rounded mb-2 w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-3 w-1/2"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GuestLayout>
    );
  }

  return (
    <GuestLayout>
       <div className="p-5 min-h-screen" style={{ backgroundColor: 'var(--color-blue-white)' }}>
        {/* Modern Minimal Header */}
        <div className="pt-12 pb-8">
          <div className="mx-auto" style={{ marginLeft: '5%', marginRight: '5%' }}>
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-textPrimary font-playfair mb-3 tracking-tight">
                Activities & Day Tour
              </h1>
              <p className="text-textSecondary text-lg max-w-2xl mx-auto leading-relaxed">
                Discover exciting adventure activities and our day tour package. Perfect for making unforgettable memories.
              </p>
            </div>
          </div>
        </div>
        
        {/* Main Content Area with 60-40 Split Layout and proper spacing */}
        <div className="mx-auto pb-16" style={{ marginLeft: '5%', marginRight: '5%' }}>
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Side - Activities Section (60% width) - 1 card per row */}
            <div className="lg:w-[60%]">
              <div className="mb-5">
                <h2 className="text-2xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                  <i className="fas fa-bicycle text-ocean-light"></i>
                  Adventure Activities
                </h2>
                <p className="text-textSecondary text-sm mt-1">Choose from our exciting range of activities</p>
              </div>
              
              {loading ? (
                <div className="flex justify-center items-center py-16">
                  <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl shadow-sm">
                  <i className="fas fa-bicycle text-6xl text-ocean-light/30 mb-4"></i>
                  <h2 className="text-2xl font-semibold text-textPrimary mb-2">No Activities Available</h2>
                  <p className="text-textSecondary">Check back soon for exciting adventure activities.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <ActivityCard key={activity.id} activity={activity} />
                  ))}
                </div>
              )}
            </div>

            {/* Right Side - Day Tour Section (40% width) */}
            <div className="lg:w-[40%]">
              <div className="mb-5">
                <h2 className="text-2xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                  <i className="fas fa-sun text-ocean-light"></i>
                  Day Tour Package
                </h2>
                <p className="text-textSecondary text-sm mt-1">All-in-one day tour experience</p>
              </div>
              
              {loading ? (
                <div className="flex justify-center items-center py-16">
                  <i className="fas fa-spinner fa-spin text-3xl text-ocean-light"></i>
                </div>
              ) : dayTours.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl shadow-sm">
                  <i className="fas fa-umbrella-beach text-6xl text-ocean-light/30 mb-4"></i>
                  <h2 className="text-2xl font-semibold text-textPrimary mb-2">No Day Tour Available</h2>
                  <p className="text-textSecondary">Check back soon for our day tour package.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {dayTours.map((tour) => (
                    <DayTourCard key={tour.id} tour={tour} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </GuestLayout>
  );
}