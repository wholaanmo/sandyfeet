// components/guest/ImageSlider.js
'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function ImageSlider({ images, roomType }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    setIsZoomed(false);
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length);
    setIsZoomed(false);
  };

  const toggleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  const handleMouseMove = (e) => {
    if (!isZoomed) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100) });
  };

  return (
    <div className="relative">
      {/* Main Image Container - Reduced height for compact modal */}
      <div 
        className={`relative overflow-hidden rounded-lg bg-ocean-pale/30 ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        style={{ height: '280px' }}
        onClick={toggleZoom}
        onMouseMove={handleMouseMove}
      >
        {images.length > 0 && (
          <div
            className={`w-full h-full transition-transform duration-300 ${
              isZoomed ? 'scale-150' : 'scale-100'
            }`}
            style={
              isZoomed
                ? {
                    transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                  }
                : {}
            }
          >
            <Image
              src={images[currentIndex]}
              alt={`${roomType} - Image ${currentIndex + 1}`}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 600px"
              priority
            />
          </div>
        )}
        
        {/* Zoom Indicator - Smaller and cleaner */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleZoom();
          }}
          className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10"
          title={isZoomed ? 'Zoom Out' : 'Zoom In'}
        >
          <i className={`fas fa-${isZoomed ? 'search-minus' : 'search-plus'} text-sm`}></i>
        </button>
      </div>

      {/* Navigation Controls - Repositioned and cleaner */}
      {images.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10"
            title="Previous Image"
          >
            <i className="fas fa-chevron-left text-sm"></i>
          </button>
          
          <button
            onClick={nextSlide}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition-all duration-200 backdrop-blur-sm z-10"
            title="Next Image"
          >
            <i className="fas fa-chevron-right text-sm"></i>
          </button>
        </>
      )}

      {/* Thumbnail Navigation - More compact */}
      {images.length > 1 && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 justify-center">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentIndex(index);
                setIsZoomed(false);
              }}
              className={`relative flex-shrink-0 w-12 h-12 rounded-md overflow-hidden transition-all duration-200 ${
                currentIndex === index
                  ? 'ring-2 ring-ocean-mid ring-offset-1'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <Image
                src={image}
                alt={`Thumbnail ${index + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Image Counter - Compact */}
      <div className="absolute bottom-3 right-3 bg-black/50 text-white px-2 py-0.5 rounded-full text-xs backdrop-blur-sm z-10">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}