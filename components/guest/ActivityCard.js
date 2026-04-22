// components/guest/ActivityCard.js
'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

const PRICE_TYPE_META = {
  perHour: { short: '/hr', full: 'per hour' },
  per30Mins: { short: '/30m', full: 'per 30 minutes' },
  per2Hrs: { short: '/2h', full: 'per 2 hours' },
  per1Hr30Mins: { short: '/1.5h', full: 'per 1.5 hours' }
};

function formatPeso(value) {
  if (value === null || value === undefined) {
    return 'TBA';
  }

  return `PHP ${Number(value).toLocaleString()}`;
}

function getPriceMeta(priceType) {
  return PRICE_TYPE_META[priceType] || { short: '', full: '' };
}

export default function ActivityCard({ activity }) {
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [detailImageFailed, setDetailImageFailed] = useState(false);

  const images = Array.isArray(activity.images) ? activity.images.filter(Boolean) : [];
  const hasImages = images.length > 0;
  const priceMeta = useMemo(() => getPriceMeta(activity.priceType), [activity.priceType]);

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
      const navContainer = document.querySelector('div.fixed.top-0.left-0.right-0');
      if (navContainer) navContainer.style.paddingRight = '';
    };
  }, []);

  return (
    <>
      <article className="group relative overflow-hidden rounded-[28px] border border-ocean-light/20 bg-white shadow-[0_14px_30px_rgb(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgb(0,0,0,0.12)]">
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-ocean-mid via-ocean-light to-ocean-lighter" />

        <div className="grid md:grid-cols-[0.42fr_0.58fr]">
          <button
            type="button"
            onClick={openModal}
            className="relative min-h-[230px] overflow-hidden bg-gradient-to-br from-ocean-pale to-ocean-ice text-left"
          >
            {hasImages && !coverImageFailed ? (
              <Image
                src={images[0]}
                alt={activity.name || 'Activity image'}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                onError={() => setCoverImageFailed(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <i className="fas fa-bicycle text-6xl text-ocean-light/35"></i>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
            <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ocean-mid">
              Activity Story
            </div>
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {images.length} photos
              </div>
            )}
          </button>

          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="line-clamp-2 font-playfair text-2xl font-bold leading-tight text-textPrimary">
                {activity.name || 'Untitled Activity'}
              </h3>
              <span className="rounded-full bg-ocean-ice px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ocean-mid">
                Explore
              </span>
            </div>

            <div className="mt-4 inline-flex items-end gap-2 rounded-2xl border border-ocean-light/20 bg-ocean-ice/65 px-3 py-2">
              <p className="text-2xl font-bold text-ocean-mid">{formatPeso(activity.priceValue)}</p>
              <span className="pb-1 text-xs font-semibold uppercase tracking-wider text-textSecondary">
                {priceMeta.short}
              </span>
            </div>

            <p className="line-clamp-3 mt-4 text-sm leading-relaxed text-textSecondary">
              {activity.description || 'No activity description is available yet.'}
            </p>

            <button
              type="button"
              onClick={openModal}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-ocean-mid/30 px-4 py-2.5 text-sm font-semibold text-ocean-mid transition-all duration-300 hover:border-ocean-mid hover:bg-ocean-mid hover:text-white"
            >
              <i className="fas fa-compass"></i>
              Open Details
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
          <div className="absolute inset-0 bg-black/55" onClick={closeModal} />

          <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center p-4 sm:p-6">
            <div
              className={`w-full overflow-hidden rounded-[30px] border border-ocean-light/20 bg-white shadow-[0_26px_54px_rgb(0,0,0,0.22)] transition-transform duration-300 ${
                isAnimating ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'
              }`}
            >
              <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
                <div className="relative min-h-[320px] bg-gradient-to-br from-ocean-pale/60 to-ocean-ice/70 sm:min-h-[360px]">
                  {hasImages && !detailImageFailed ? (
                    <Image
                      src={images[activeImageIndex]}
                      alt={`${activity.name || 'Activity'} preview ${activeImageIndex + 1}`}
                      fill
                      className="object-cover"
                      onError={() => setDetailImageFailed(true)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <i className="fas fa-bicycle text-7xl text-ocean-light/35"></i>
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
                    <h3 className="line-clamp-2 font-playfair text-2xl font-bold text-textPrimary">
                      {activity.name || 'Activity details'}
                    </h3>
                  </div>

                  <div className="space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
                    <div className="rounded-2xl border border-ocean-light/20 bg-ocean-ice/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                        Activity Rate
                      </p>
                      <p className="mt-2 text-3xl font-bold text-ocean-mid">{formatPeso(activity.priceValue)}</p>
                      <p className="text-sm text-textSecondary">{priceMeta.full || 'flat rate'}</p>
                    </div>

                    <div className="rounded-2xl border border-ocean-light/20 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-textSecondary">
                        Description
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-textSecondary">
                        {activity.description || 'No activity description is available yet.'}
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
                                alt={`Activity thumbnail ${idx + 1}`}
                                fill
                                className="object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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