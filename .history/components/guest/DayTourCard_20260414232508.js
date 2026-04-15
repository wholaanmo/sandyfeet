'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import ImageSlider from './ImageSlider';
import { useRouter } from 'next/navigation';

export default function DayTourCard({ tour }) {
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const router = useRouter();

  const openSidebar = () => {
    setIsAnimating(true);
    setShowDetailsModal(true);
    document.body.style.overflow = 'hidden';
  };

  const closeSidebar = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setShowDetailsModal(false);
      document.body.style.overflow = 'unset';
    }, 300);
  };

  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <>
      <div className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 group">
        {/* Tour Image */}
        <div className="relative h-64 bg-gradient-to-br from-ocean-pale to-ocean-ice overflow-hidden">
          {tour.images && tour.images.length > 0 ? (
            <Image
              src={tour.images[0]}
              alt="Day Tour"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-umbrella-beach text-6xl text-ocean-light/30"></i></div>';
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <i className="fas fa-umbrella-beach text-6xl text-ocean-light/30"></i>
            </div>
          )}
          
          {/* Availability Badge */}
          <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold ${
            tour.availability === 'available' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}>
            {tour.availability === 'available' ? 'Available' : 'Not Available'}
          </div>
        </div>
        
        {/* Tour Details */}
        <div className="p-6">
          {/* Pricing Information */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-textSecondary">Adult (16+)</span>
              <span className="text-xl font-bold text-ocean-mid">₱{tour.adultPrice?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-textSecondary">Kid (15-)</span>
              <span className="text-xl font-bold text-ocean-mid">₱{tour.kidPrice?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-textSecondary">Senior</span>
              <span className="text-xl font-bold text-ocean-mid">₱{tour.seniorPrice?.toLocaleString()}</span>
            </div>
            <p className="text-xs text-neutral mt-2 text-right">per person</p>
          </div>
          
          {/* Capacity */}
          {tour.maxCapacity && (
            <div className="flex items-center gap-2 text-sm text-textSecondary mb-3">
              <i className="fas fa-users text-ocean-light"></i>
              <span>Max {tour.maxCapacity} guests</span>
            </div>
          )}
          
          {/* Inclusions Preview */}
          {tour.inclusions && tour.inclusions.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-1">
                {tour.inclusions.slice(0, 3).map((inclusion, idx) => (
                  <span key={idx} className="text-xs px-2 py-0.5 bg-ocean-ice text-ocean-mid rounded-full">
                    {inclusion}
                  </span>
                ))}
                {tour.inclusions.length > 3 && (
                  <span className="text-xs px-2 py-0.5 bg-ocean-ice text-ocean-mid rounded-full">
                    +{tour.inclusions.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Description Preview */}
          <p className="text-sm text-textSecondary mb-4 line-clamp-2">
            {tour.description}
          </p>
          
          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={openSidebar}
              className="flex-1 px-4 py-2.5 border border-ocean-light/30 text-ocean-mid rounded-xl font-medium hover:bg-ocean-mid hover:text-white hover:border-ocean-mid transition-all duration-300"
            >
              Details
            </button>
            <button 
              onClick={() => router.push('/day-tour/calendar')}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-ocean-mid to-ocean-light text-white rounded-xl font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              Book Now
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar Modal with 50% Transparent Background */}
      {showDetailsModal && (
        <>
          {/* Overlay with 50% transparency */}
          <div 
            className={`fixed inset-0 bg-black/50 transition-opacity duration-300 z-40 ${
              isAnimating ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeSidebar}
          />
          
          {/* Sidebar Modal - 50% transparent with backdrop blur */}
          <div 
            className={`fixed top-0 right-0 h-full w-full max-w-md bg-black/50 backdrop-blur-lg shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
              isAnimating ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Content Container with solid background for readability */}
            <div className="flex flex-col h-full overflow-hidden bg-white/95">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-5 py-4 flex justify-between items-center z-10 flex-shrink-0">
                <h2 className="text-lg font-bold text-textPrimary font-playfair truncate flex-1">
                  Day Tour Details
                </h2>
                <button
                  onClick={closeSidebar}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-all duration-200 flex items-center justify-center ml-3 flex-shrink-0"
                >
                  <i className="fas fa-times text-sm"></i>
                </button>
              </div>
              
              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {/* Image Gallery with Slider */}
                {tour.images && tour.images.length > 0 && (
                  <div className="mb-5">
                    <ImageSlider images={tour.images} roomType="Day Tour" />
                  </div>
                )}
                
                {/* Tour Details Sections */}
                <div className="space-y-4">
                  {/* Pricing Section */}
                  <div className="bg-gradient-to-r from-ocean-pale/30 to-ocean-ice/30 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-tag"></i>
                      Pricing (per person)
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-textSecondary">Adult (16+)</span>
                        <span className="text-lg font-bold text-ocean-mid">₱{tour.adultPrice?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-textSecondary">Kid (15-)</span>
                        <span className="text-lg font-bold text-ocean-mid">₱{tour.kidPrice?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-textSecondary">Senior</span>
                        <span className="text-lg font-bold text-ocean-mid">₱{tour.seniorPrice?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Key Information Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-gray-50 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-info-circle"></i>
                      Key Information
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Max Capacity</label>
                        <p className="text-sm text-textPrimary flex items-center gap-2">
                          <i className="fas fa-users text-ocean-light text-xs"></i>
                          {tour.maxCapacity ? `${tour.maxCapacity} Guests` : 'Unlimited'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          tour.availability === 'available' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {tour.availability === 'available' ? 'Available' : 'Not Available'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Inclusions Section */}
                  <div className="bg-white rounded-xl p-4 border border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-gift text-ocean-light"></i>
                      Inclusions
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {tour.inclusions && tour.inclusions.length > 0 ? (
                        tour.inclusions.map((inclusion, idx) => (
                          <span key={idx} className="px-2.5 py-1.5 bg-ocean-ice text-ocean-mid rounded-lg text-xs font-medium flex items-center gap-1.5">
                            <i className="fas fa-check-circle text-xs"></i>
                            {inclusion}
                          </span>
                        ))
                      ) : (
                        <p className="text-textSecondary text-sm">No inclusions listed</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Description Section */}
                  <div className="bg-white rounded-xl p-4 border border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-align-left"></i>
                      Description
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-textSecondary leading-relaxed whitespace-pre-wrap text-sm">
                        {tour.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-5 py-4 flex gap-3 justify-end flex-shrink-0">
                <button
                  onClick={closeSidebar}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all duration-200"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    closeSidebar();
                    setTimeout(() => router.push('/day-tour/calendar'), 300);
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-ocean-mid to-ocean-light rounded-lg text-white text-sm font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  Book Now
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}