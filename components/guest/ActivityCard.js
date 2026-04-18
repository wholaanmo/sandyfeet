// components/guest/ActivityCard.js
'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

export default function ActivityCard({ activity }) {
  const [imageError, setImageError] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Helper function to get price display text
  const getPriceDisplay = () => {
    const price = activity.priceValue?.toLocaleString();
    switch (activity.priceType) {
      case 'perHour':
        return { label: `/hour`, full: `per hour` };
      case 'per30Mins':
        return { label: `/30 min`, full: `per 30 minutes` };
      case 'per2Hrs':
        return { label: `/2 hrs`, full: `per 2 hours` };
      case 'per1Hr30Mins':
        return { label: `/1.5 hrs`, full: `per 1.5 hours` };
      default:
        return { label: ``, full: `` };
    }
  };

  const priceDisplay = getPriceDisplay();

  const nextImage = () => {
    if (activity.images && activity.images.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % activity.images.length);
    }
  };

  const prevImage = () => {
    if (activity.images && activity.images.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + activity.images.length) % activity.images.length);
    }
  };

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
      <div className="group overflow-hidden rounded-2xl border border-ocean-light/15 bg-white shadow-[0_10px_24px_rgb(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgb(0,0,0,0.1)] flex flex-col sm:flex-row">
        {/* Activity Image - Left side (30-35% width) */}
        <div 
          className="relative sm:w-[35%] md:w-[30%] h-48 sm:h-auto min-h-[180px] bg-gradient-to-br from-ocean-pale to-ocean-ice overflow-hidden cursor-pointer"
          onClick={openSidebar}
        >
          {activity.images && activity.images[0] && !imageError ? (
            <Image
              src={activity.images[0]}
              alt={activity.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <i className="fas fa-bicycle text-5xl text-ocean-light/30"></i>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
          <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ocean-mid backdrop-blur-sm">
            Activity
          </div>
        </div>
        
        {/* Activity Details - Right side (65-70% width) */}
        <div className="flex-1 p-5 flex flex-col">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-playfair text-xl font-bold text-textPrimary line-clamp-1">{activity.name}</h3>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-textSecondary">Outdoor experience</p>
            </div>
          </div>
          
          <div className="mb-3 rounded-xl border border-ocean-light/10 bg-ocean-ice/45 px-3 py-2">
            <p className="text-2xl font-bold text-ocean-mid">
              ₱{activity.priceValue?.toLocaleString()}
              <span className="text-sm font-normal text-textSecondary ml-1">{priceDisplay.label}</span>
            </p>
          </div>
          
          <p className="text-sm leading-relaxed text-textSecondary line-clamp-2 mb-4 flex-1">
            {activity.description}
          </p>
          
          <button
            onClick={openSidebar}
            className="w-full sm:w-auto rounded-lg border border-ocean-mid/35 px-4 py-2 text-sm font-semibold text-ocean-mid transition-all duration-300 hover:border-ocean-mid hover:bg-ocean-mid hover:text-white text-center"
          >
            View Details
          </button>
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
          
          {/* Sidebar Modal - Slides from right */}
          <div 
            className={`fixed top-0 right-0 h-full w-full max-w-md bg-white/95 backdrop-blur-md shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
              isAnimating ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex flex-col h-full overflow-hidden">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-5 py-4 flex justify-between items-center z-10 flex-shrink-0">
                <h2 className="text-lg font-bold text-textPrimary font-playfair truncate flex-1">
                  {activity.name}
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
                {/* Image Gallery */}
                {activity.images && activity.images.length > 0 && (
                  <div className="mb-5">
                    <div className="relative">
                      <div 
                        className={`relative overflow-hidden rounded-xl bg-ocean-pale/30 ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                        style={{ height: '250px' }}
                        onClick={() => setIsZoomed(!isZoomed)}
                      >
                        <div
                          className={`w-full h-full transition-transform duration-300 ${
                            isZoomed ? 'scale-150' : 'scale-100'
                          }`}
                        >
                          <Image
                            src={activity.images[currentImageIndex]}
                            alt={`${activity.name} - Image ${currentImageIndex + 1}`}
                            fill
                            className="object-contain"
                          />
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsZoomed(!isZoomed);
                          }}
                          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10"
                        >
                          <i className={`fas fa-${isZoomed ? 'search-minus' : 'search-plus'} text-xs`}></i>
                        </button>
                      </div>

                      {activity.images.length > 1 && (
                        <>
                          <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10"
                          >
                            <i className="fas fa-chevron-left text-xs"></i>
                          </button>
                          <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10"
                          >
                            <i className="fas fa-chevron-right text-xs"></i>
                          </button>
                        </>
                      )}

                      <div className="absolute bottom-2 right-2 bg-black/50 text-white px-2 py-0.5 rounded-full text-xs backdrop-blur-sm z-10">
                        {currentImageIndex + 1} / {activity.images.length}
                      </div>
                    </div>
                    
                    {activity.images.length > 1 && (
                      <div className="flex gap-2 mt-3 overflow-x-auto pb-2 justify-center">
                        {activity.images.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setCurrentImageIndex(idx);
                              setIsZoomed(false);
                            }}
                            className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all duration-200 ${
                              currentImageIndex === idx
                                ? 'ring-2 ring-ocean-mid ring-offset-2'
                                : 'opacity-60 hover:opacity-100'
                            }`}
                          >
                            <Image
                              src={img}
                              alt={`Thumbnail ${idx + 1}`}
                              fill
                              className="object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Activity Details Sections */}
                <div className="space-y-4">
                  {/* Key Information Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-gray-50 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-info-circle"></i>
                      Activity Information
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Activity Name</label>
                        <p className="text-sm font-semibold text-textPrimary">{activity.name}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                        <p className="text-xl font-bold text-ocean-mid">
                          ₱{activity.priceValue?.toLocaleString()}
                          <span className="text-sm font-normal text-textSecondary ml-1">{priceDisplay.full}</span>
                        </p>
                      </div>
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
                        {activity.description}
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
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
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