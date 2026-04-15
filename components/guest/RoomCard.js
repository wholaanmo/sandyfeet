// components/guest/RoomCard.js
'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import ImageSlider from './ImageSlider';
import { useRouter } from 'next/navigation';

export default function RoomCard({ room }) {
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const router = useRouter();

  const handleBookNow = () => {
    // Make sure room.capacity contains the max capacity value
    // If room.capacity doesn't exist, use room.capacityMax
    const maxCap = room.capacity || room.capacityMax;
    router.push(`/rooms/calendar?roomId=${room.id}&roomType=${encodeURIComponent(room.type)}&price=${room.price}&capacity=${maxCap}&totalRooms=${room.totalRooms}`);
  };

  const nextImage = (e) => {
    e.stopPropagation();
    if (room.images && room.images.length > 0) {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % room.images.length);
    }
  };

  const prevImage = (e) => {
    e.stopPropagation();
    if (room.images && room.images.length > 0) {
      setCurrentImageIndex((prevIndex) => (prevIndex - 1 + room.images.length) % room.images.length);
    }
  };

  const openSidebar = () => {
    setIsAnimating(true);
    setShowDetailsModal(true);
    // Prevent body scroll when sidebar is open
    document.body.style.overflow = 'hidden';
  };

  const closeSidebar = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setShowDetailsModal(false);
      // Restore body scroll
      document.body.style.overflow = 'unset';
    }, 300);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <>
      <div className="group overflow-hidden rounded-2xl border border-ocean-light/15 bg-white shadow-[0_10px_24px_rgb(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgb(0,0,0,0.1)]">
        {/* Room Image with Carousel */}
        <div className="relative h-52 overflow-hidden bg-gradient-to-br from-ocean-pale to-ocean-ice">
          {room.images && room.images.length > 0 ? (
            <>
              <Image
                src={room.images[currentImageIndex]}
                alt={room.type}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (room.images.length > 1) {
                    setCurrentImageIndex((prev) => (prev + 1) % room.images.length);
                  } else {
                    e.target.parentElement.innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-hotel text-6xl text-ocean-light/30"></i></div>';
                  }
                }}
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
              <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ocean-mid backdrop-blur-sm">
                {room.type}
              </div>
              <div className="absolute right-3 top-3 rounded-full bg-ocean-mid/95 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                ₱{room.price.toLocaleString()}/night
              </div>
              
              {/* Navigation Arrows - Always visible */}
              {room.images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all duration-200 z-10 backdrop-blur-sm"
                    aria-label="Previous image"
                  >
                    <i className="fas fa-chevron-left text-xs"></i>
                  </button>
                  
                  {/* Navigation Arrows - Always visible */}
                  <button
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all duration-200 z-10 backdrop-blur-sm"
                    aria-label="Next image"
                  >
                    <i className="fas fa-chevron-right text-xs"></i>
                  </button>
                  
                  {/* Image Counter/Dots */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {room.images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex(idx);
                        }}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                          idx === currentImageIndex
                            ? 'bg-white w-3'
                            : 'bg-white/50 hover:bg-white/80'
                        }`}
                        aria-label={`Go to image ${idx + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <i className="fas fa-hotel text-6xl text-ocean-light/30"></i>
            </div>
          )}
        </div>
        
        {/* Room Details */}
        <div className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-playfair text-xl font-bold text-textPrimary">{room.type}</h3>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-textSecondary">Resort accommodation</p>
            </div>
            <p className="text-right text-lg font-bold text-ocean-mid">
              ₱{room.price.toLocaleString()}
              <span className="block text-[11px] font-normal uppercase tracking-wider text-textSecondary">per night</span>
            </p>
          </div>
          
          {/* Room Features - Removed totalRooms display */}
          <div className="mt-2 flex items-center gap-2 border-y border-ocean-light/10 py-3 text-sm text-textSecondary">
            <span className="inline-flex items-center gap-1 rounded-full bg-ocean-ice px-2.5 py-1 text-xs font-medium text-ocean-mid">
              <i className="fas fa-users text-[11px]"></i>
              {room.capacityMin && room.capacityMax 
                ? `${room.capacityMin}–${room.capacityMax} Guests` 
                : room.capacity || `${room.capacityMin || room.capacityMax} Guests`}
            </span>
            {(room.totalRooms || 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ocean-ice px-2.5 py-1 text-xs font-medium text-ocean-mid">
                <i className="fas fa-door-open text-[11px]"></i>
                {room.totalRooms} unit{room.totalRooms > 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          {/* Inclusions Preview */}
          {room.inclusions && room.inclusions.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-1.5">
                {room.inclusions.slice(0, 3).map((inclusion, idx) => (
                  <span key={idx} className="rounded-full bg-ocean-ice px-2.5 py-1 text-[11px] font-medium text-ocean-mid">
                    {inclusion}
                  </span>
                ))}
                {room.inclusions.length > 3 && (
                  <span className="rounded-full bg-ocean-ice px-2.5 py-1 text-[11px] font-medium text-ocean-mid">
                    +{room.inclusions.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Description Preview */}
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-textSecondary">
            {room.description}
          </p>
          
          {/* Buttons - Medium size design */}
          <div className="mt-5 flex gap-2">
            <button
              onClick={openSidebar}
              className="flex-1 rounded-lg border border-ocean-mid/35 px-3 py-2 text-sm font-semibold text-ocean-mid transition-all duration-300 hover:border-ocean-mid hover:bg-ocean-mid hover:text-white"
            >
              Details
            </button>
            <button 
              onClick={handleBookNow}
              className="flex-1 rounded-lg bg-gradient-to-r from-ocean-mid to-ocean-light px-3 py-2 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
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
          
          {/* Sidebar Modal - Slides from right */}
          <div 
            className={`fixed top-0 right-0 h-full w-full max-w-md bg-white/95 backdrop-blur-md shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
              isAnimating ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Modal Content Container with improved structure */}
            <div className="flex flex-col h-full overflow-hidden">
              {/* Modal Header - Clean & Minimal with sticky positioning */}
              <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-5 py-4 flex justify-between items-center z-10 flex-shrink-0">
                <h2 className="text-lg font-bold text-textPrimary font-playfair truncate flex-1">
                  {room.type}
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
                {/* Image Gallery with Slider - Improved Layout */}
                {room.images && room.images.length > 0 && (
                  <div className="mb-5">
                    <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                      <ImageSlider images={room.images} roomType={room.type} />
                    </div>
                  </div>
                )}
                
                {/* Room Details Grid - Organized sections with improved spacing */}
                <div className="space-y-4">
                  {/* Key Information Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-gray-50 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-info-circle"></i>
                      Key Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Room Type</label>
                        <p className="text-sm font-semibold text-textPrimary">{room.type}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Capacity</label>
                        <p className="text-sm text-textPrimary flex items-center gap-1.5">
                          <i className="fas fa-users text-ocean-light text-xs"></i>
                          {room.capacityMin && room.capacityMax 
                            ? `${room.capacityMin}–${room.capacityMax} Guests` 
                            : room.capacity || `${room.capacityMin || room.capacityMax} Guests`}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Pricing Section - Highlighted */}
                  <div className="bg-gradient-to-r from-ocean-pale/30 to-ocean-ice/30 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-ocean-mid uppercase tracking-wide mb-2 flex items-center gap-2">
                      <i className="fas fa-tag"></i>
                      Pricing
                    </h3>
                    <p className="text-2xl font-bold text-ocean-mid">
                      ₱{room.price.toLocaleString()}
                      <span className="text-sm font-normal text-textSecondary ml-1">/night</span>
                    </p>
                  </div>
                  
                  {/* Inclusions Section */}
                  <div className="bg-white rounded-xl p-4 border border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <i className="fas fa-gift text-ocean-light"></i>
                      Inclusions
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {room.inclusions && room.inclusions.length > 0 ? (
                        room.inclusions.map((inclusion, idx) => (
                          <span key={idx} className="px-3 py-1.5 bg-ocean-ice text-ocean-mid rounded-lg text-xs font-medium flex items-center gap-1.5">
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
                        {room.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Modal Footer - Sticky actions */}
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
                    setTimeout(() => handleBookNow(), 300);
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