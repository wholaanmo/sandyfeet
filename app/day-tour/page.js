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

  const sectionCardClass =
    'rounded-2xl border border-ocean-light/15 bg-white p-5 shadow-[0_10px_24px_rgb(0,0,0,0.06)]';

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
        <div className="min-h-screen bg-gradient-to-b from-ocean-ice/70 via-white to-ocean-ice/30 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <div className="rounded-3xl border border-ocean-light/15 bg-white/90 p-6 shadow-[0_12px_32px_rgb(0,0,0,0.06)] backdrop-blur-sm sm:p-8">
              <div className="text-center sm:text-left">
                <p className="inline-flex items-center gap-2 rounded-full bg-ocean-ice px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ocean-mid">
                  <i className="fas fa-compass"></i>
                  Resort Experiences
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-textPrimary font-playfair sm:text-4xl md:text-5xl">
                  Activities and Day Tour
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-textSecondary sm:text-base">
                  Plan your perfect beach day with high-energy activities and our all-in day tour package in one place.
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-8 pb-16 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-5">
                <div className={sectionCardClass}>
                  <h2 className="text-2xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                    <i className="fas fa-bicycle text-ocean-light"></i>
                    Adventure Activities
                  </h2>
                  <p className="mt-1 text-sm text-textSecondary">Choose from our exciting range of activities.</p>
                </div>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="overflow-hidden rounded-2xl border border-ocean-light/10 bg-white shadow-[0_10px_24px_rgb(0,0,0,0.06)] animate-pulse">
                      <div className="flex flex-col sm:flex-row">
                        <div className="h-44 sm:h-auto sm:w-[33%] bg-gray-200"></div>
                        <div className="flex-1 p-5">
                          <div className="h-5 bg-gray-200 rounded mb-3 w-3/4"></div>
                          <div className="h-4 bg-gray-200 rounded mb-3 w-1/2"></div>
                          <div className="h-3 bg-gray-200 rounded mb-3 w-5/6"></div>
                          <div className="h-3 bg-gray-200 rounded mb-4 w-2/3"></div>
                          <div className="h-10 bg-gray-200 rounded-lg w-36"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className={sectionCardClass}>
                  <h2 className="text-2xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                    <i className="fas fa-sun text-ocean-light"></i>
                    Day Tour Package
                  </h2>
                  <p className="mt-1 text-sm text-textSecondary">All-in-one day tour experience.</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-ocean-light/10 bg-white shadow-[0_10px_24px_rgb(0,0,0,0.06)] animate-pulse">
                  <div className="h-64 bg-gray-200"></div>
                  <div className="p-6">
                    <div className="h-6 bg-gray-200 rounded mb-3 w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-3 w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded mb-3 w-2/3"></div>
                    <div className="h-20 bg-gray-200 rounded mb-4"></div>
                    <div className="h-10 bg-gray-200 rounded-lg"></div>
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
      <div className="min-h-screen bg-gradient-to-b from-ocean-ice/70 via-white to-ocean-ice/30 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="rounded-3xl border border-ocean-light/15 bg-white/90 p-6 shadow-[0_12px_32px_rgb(0,0,0,0.06)] backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-ocean-ice px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ocean-mid">
                  <i className="fas fa-compass"></i>
                  Resort Experiences
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-textPrimary font-playfair sm:text-4xl md:text-5xl">
                  Activities and Day Tour
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-textSecondary sm:text-base">
                  Discover exciting activities and a complete day tour package for a smooth, unforgettable getaway.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:max-w-sm lg:w-auto">
                <div className="rounded-xl border border-ocean-light/20 bg-ocean-ice/70 px-4 py-3 text-center">
                  <p className="text-xl font-bold text-ocean-mid">{activities.length}</p>
                  <p className="text-xs uppercase tracking-wider text-textSecondary">Activities</p>
                </div>
                <div className="rounded-xl border border-ocean-light/20 bg-ocean-ice/70 px-4 py-3 text-center">
                  <p className="text-xl font-bold text-ocean-mid">{dayTours.length}</p>
                  <p className="text-xs uppercase tracking-wider text-textSecondary">Packages</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 pb-16 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-5">
              <div className={sectionCardClass}>
                <h2 className="text-2xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                  <i className="fas fa-bicycle text-ocean-light"></i>
                  Adventure Activities
                </h2>
                <p className="mt-1 text-sm text-textSecondary">Choose from our exciting range of activities.</p>
              </div>

              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="overflow-hidden rounded-2xl border border-ocean-light/10 bg-white shadow-[0_10px_24px_rgb(0,0,0,0.06)] animate-pulse">
                      <div className="flex flex-col sm:flex-row">
                        <div className="h-44 sm:h-auto sm:w-[33%] bg-gray-200"></div>
                        <div className="flex-1 p-5">
                          <div className="h-5 bg-gray-200 rounded mb-3 w-3/4"></div>
                          <div className="h-4 bg-gray-200 rounded mb-3 w-1/2"></div>
                          <div className="h-3 bg-gray-200 rounded mb-3 w-5/6"></div>
                          <div className="h-3 bg-gray-200 rounded mb-4 w-2/3"></div>
                          <div className="h-10 bg-gray-200 rounded-lg w-36"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <div className="rounded-2xl border border-ocean-light/15 bg-white py-16 text-center shadow-[0_10px_24px_rgb(0,0,0,0.06)]">
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

            <div className="space-y-5">
              <div className={sectionCardClass}>
                <h2 className="text-2xl font-bold text-textPrimary font-playfair flex items-center gap-2">
                  <i className="fas fa-sun text-ocean-light"></i>
                  Day Tour Package
                </h2>
                <p className="mt-1 text-sm text-textSecondary">All-in-one day tour experience.</p>
              </div>

              {loading ? (
                <div className="overflow-hidden rounded-2xl border border-ocean-light/10 bg-white shadow-[0_10px_24px_rgb(0,0,0,0.06)] animate-pulse">
                  <div className="h-64 bg-gray-200"></div>
                  <div className="p-6">
                    <div className="h-6 bg-gray-200 rounded mb-3 w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-3 w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded mb-3 w-2/3"></div>
                    <div className="h-20 bg-gray-200 rounded mb-4"></div>
                    <div className="h-10 bg-gray-200 rounded-lg"></div>
                  </div>
                </div>
              ) : dayTours.length === 0 ? (
                <div className="rounded-2xl border border-ocean-light/15 bg-white py-16 text-center shadow-[0_10px_24px_rgb(0,0,0,0.06)]">
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