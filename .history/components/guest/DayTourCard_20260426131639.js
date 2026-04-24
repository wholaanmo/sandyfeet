// components/guest/DayTourCard.js
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function formatPeso(value) {
  if (value === null || value === undefined) {
    return 'TBA';
  }

  return `PHP ${Number(value).toLocaleString()}`;
}

export default function DayTourCard({ tour, compact = false }) {
  const router = useRouter();

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [detailImageFailed, setDetailImageFailed] = useState(false);

  const images = Array.isArray(tour.images) ? tour.images.filter(Boolean) : [];
  const hasImages = images.length > 0;
  const isAvailable = tour.availability === 'available';

  const pricingRows = useMemo(
    () => [
      { label: 'Adult (16+)', value: tour.adultPrice },
      { label: 'Kid (15-)', value: tour.kidPrice },
      { label: 'Senior', value: tour.seniorPrice }
    ],
    [tour.adultPrice, tour.kidPrice, tour.seniorPrice]
  );

  const openModal = () => {
    setActiveImageIndex(0);
    setDetailImageFailed(false);
    setIsAnimating(true);
    setShowDetailsModal(true);
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    
    const navContainer = document.getElementById('guest-navbar');
    if (navContainer) {
      const computedPadding = window.getComputedStyle(navContainer).paddingRight;
      navContainer.dataset.originalPadding = computedPadding;
      navContainer.style.paddingRight = `calc(${computedPadding} + ${scrollbarWidth}px)`;
    }

    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setShowDetailsModal(false);
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '';
      
      const navContainer = document.getElementById('guest-navbar');
      if (navContainer && navContainer.dataset.originalPadding) {
        navContainer.style.paddingRight = navContainer.dataset.originalPadding;
      } else if (navContainer) {
        navContainer.style.paddingRight = '';
      }
    }, 260);
  };

  const nextImage = () => {
    if (!hasImages || images.length < 2) return;
    setDetailImageFailed(false);
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  };

  const previousImage = () => {
    if (!hasImages || images.length < 2) return;
    setDetailImageFailed(false);
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '';
      const navContainer = document.getElementById('guest-navbar');
      if (navContainer) navContainer.style.paddingRight = '';
    };
  }, []);

  return (
    <>
      <article className={`group overflow-hidden border border-ocean-light/20 bg-white shadow-[0_16px_36px_rgb(0,0,0,0.1)] ${compact ? 'rounded-3xl' : 'rounded-[28px]'}`}>
        <div className={`relative overflow-hidden bg-gradient-to-br from-ocean-pale to-ocean-ice ${compact ? 'h-44' : 'h-56'}`}>
          {hasImages && !coverImageFailed ? (
            <Image
              src={images[0]}
              alt="Day tour preview"
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
              onError={() => setCoverImageFailed(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <i className="fas fa-umbrella-beach text-6xl text-ocean-light/35"></i>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ocean-mid">
            Day Tour
          </div>
          <div
            className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${
              isAvailable ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {isAvailable ? 'Available' : 'Unavailable'}
          </div>
        </div>

        <div className={`space-y-3 ${compact ? 'p-4' : 'p-5'}`}>
          <div>
            <h3 className={`font-playfair font-bold text-textPrimary ${compact ? 'text-xl' : 'text-2xl'}`}>Day Tour Experience</h3>
            <p className={`text-textSecondary ${compact ? 'text-xs' : 'text-sm'}`}>
              Built for guests who want a full-day beach plan with smooth booking.
            </p>
          </div>

          <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
            {pricingRows.map((row) => (
              <div key={row.label} className={`rounded-xl border border-ocean-light/20 bg-ocean-ice/70 text-center ${compact ? 'px-1.5 py-1.5' : 'px-2 py-2'}`}>
                <p className={`font-semibold uppercase tracking-wide text-textSecondary ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{row.label}</p>
                <p className={`mt-1 font-bold text-ocean-mid ${compact ? 'text-xs' : 'text-sm'}`}>{formatPeso(row.value)}</p>
              </div>
            ))}
          </div>

          {tour.maxCapacity && (
            <p className={`inline-flex items-center gap-2 rounded-full bg-ocean-ice px-3 py-1 font-semibold uppercase tracking-wider text-ocean-mid ${compact ? 'text-[11px]' : 'text-xs'}`}>
              <i className="fas fa-users"></i>
              Max {tour.maxCapacity} guests per day
            </p>
          )}

          {Array.isArray(tour.inclusions) && tour.inclusions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tour.inclusions.slice(0, compact ? 3 : 4).map((item, idx) => (
                <span
                  key={`${item}-${idx}`}
                  className={`rounded-full border border-ocean-light/20 bg-white font-medium text-ocean-mid ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
                >
                  {item}
                </span>
              ))}
            </div>
          )}

          <p className={`${compact ? 'line-clamp-2 text-xs' : 'line-clamp-3 text-sm'} leading-relaxed text-textSecondary`}>
            {tour.description || 'No day tour description has been added yet.'}
          </p>

          <div className={`flex flex-col gap-2 ${compact ? '' : 'sm:flex-row'}`}>
            <button
              type="button"
              onClick={openModal}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-ocean-mid/30 font-semibold text-ocean-mid transition-all duration-300 hover:border-ocean-mid hover:bg-ocean-mid hover:text-white ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
            >
              <i className="fas fa-circle-info"></i>
              Details
            </button>
            <button
              type="button"
              onClick={() => router.push('/day-tour/calendar')}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ocean-mid to-ocean-light font-semibold text-white shadow-[0_10px_24px_rgb(33,105,243,0.32)] transition-all duration-300 hover:-translate-y-0.5 ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
            >
              <i className="fas fa-calendar-check"></i>
              Book Now
            </button>
          </div>
        </div>
      </article>

      {showDetailsModal && (
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${
            isAnimating ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />

          <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center p-4 sm:p-6">
            <div
              className={`w-full overflow-hidden rounded-[30px] border border-ocean-light/20 bg-white shadow-[0_26px_54px_rgb(0,0,0,0.24)] transition-transform duration-300 ${
                isAnimating ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'
              }`}
            >
              <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
                <div className="relative min-h-[320px] bg-gradient-to-br from-ocean-pale/60 to-ocean-ice/70 sm:min-h-[360px]">
                  {hasImages && !detailImageFailed ? (
                    <Image
                      src={images[activeImageIndex]}
                      alt={`Day tour image ${activeImageIndex + 1}`}
                      fill
                      className="object-cover"
                      onError={() => setDetailImageFailed(true)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <i className="fas fa-umbrella-beach text-7xl text-ocean-light/35"></i>
                    </div>
                  )}

                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={previousImage}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3 py-2 text-white transition-colors duration-200 hover:bg-black/60"
                      >
                        <i className="fas fa-chevron-left text-sm"></i>
                      </button>
                      <button
                        type="button"
                        onClick={nextImage}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3 py-2 text-white transition-colors duration-200 hover:bg-black/60"
                      >
                        <i className="fas fa-chevron-right text-sm"></i>
                      </button>
                    </>
                  )}

                  {images.length > 1 && (
                    <div className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm z-10">
                      {activeImageIndex + 1} / {images.length}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={closeModal}
                    className="absolute right-4 top-4 z-20 flex lg:hidden h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-all duration-200 hover:bg-black/70 hover:scale-105"
                  >
                    <i className="fas fa-times text-lg"></i>
                  </button>
                </div>

                <div className="flex max-h-[80vh] flex-col relative">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="absolute right-4 top-4 z-20 hidden lg:flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-all duration-200 hover:bg-gray-200 hover:scale-105"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  <div className="flex items-center justify-between border-b border-ocean-light/15 px-5 py-4 sm:px-6 pr-14 lg:pr-16">
                    <h3 className="font-playfair text-2xl font-bold text-textPrimary">Day Tour Details</h3>
                  </div>

                  <div className="space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
                    <div className="rounded-2xl border border-ocean-light/20 bg-ocean-ice/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                        Package status
                      </p>
                      <p
                        className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                          isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isAvailable ? 'Available for booking' : 'Temporarily unavailable'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-ocean-light/20 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                        Rate table
                      </p>
                      <div className="mt-3 space-y-2 text-sm">
                        {pricingRows.map((row) => (
                          <div key={row.label} className="flex items-center justify-between border-b border-ocean-light/10 pb-2">
                            <span className="text-textSecondary">{row.label}</span>
                            <span className="font-semibold text-ocean-mid">{formatPeso(row.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-ocean-light/20 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                        Inclusions
                      </p>
                      {Array.isArray(tour.inclusions) && tour.inclusions.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {tour.inclusions.map((item, idx) => (
                            <span
                              key={`${item}-${idx}`}
                              className="rounded-full bg-ocean-ice px-2.5 py-1 text-xs font-medium text-ocean-mid"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-textSecondary">No inclusions listed.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-ocean-light/20 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                        Description
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-textSecondary">
                        {tour.description || 'No day tour description has been added yet.'}
                      </p>
                    </div>

                    {images.length > 1 && (
                      <div className="rounded-2xl border border-ocean-light/20 bg-white p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                          Gallery
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {images.map((image, idx) => (
                            <button
                              key={`${image}-${idx}`}
                              type="button"
                              onClick={() => {
                                setDetailImageFailed(false);
                                setActiveImageIndex(idx);
                              }}
                              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border transition-all duration-200 ${
                                activeImageIndex === idx
                                  ? 'border-ocean-mid ring-2 ring-ocean-mid/25'
                                  : 'border-ocean-light/20 opacity-75 hover:opacity-100'
                              }`}
                            >
                              <Image
                                src={image}
                                alt={`Day tour thumbnail ${idx + 1}`}
                                fill
                                className="object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 border-t border-ocean-light/15 px-5 py-4 sm:px-6">
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        setTimeout(() => router.push('/day-tour/calendar'), 260);
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ocean-mid to-ocean-light px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
                    >
                      <i className="fas fa-calendar-check"></i>
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}