// components/AIRoomRecommendationModal.js
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { XMarkIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';

// Helper to generate room slug from room type
const toRoomSlug = (value) => {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const guestOptions = [
  { id: 'solo', label: 'Solo', min: 1, max: 1 },
  { id: 'couple', label: 'Couple', min: 1, max: 2 },
  { id: 'smallGroup', label: 'Small Group (3–6)', min: 3, max: 6 },
  { id: 'bigGroup', label: 'Big Group (7–14)', min: 7, max: 14 },
  { id: 'exclusive', label: 'Exclusive Stay', min: 15, max: 99 },
];

const experienceOptions = [
  { id: 'nature', label: '🌿 Nature / Camping' },
  { id: 'relaxing', label: '🧘 Relaxing Stay' },
  { id: 'barkada', label: '👥 Barkada Bonding' },
  { id: 'romantic', label: '❤️ Romantic Getaway' },
  { id: 'privateExclusive', label: '✨ Private Exclusive Vacation' },
];

const priorityOptions = [
  { id: 'budget', label: '💰 Budget‑Friendly' },
  { id: 'comfort', label: '🛋️ Comfort' },
  { id: 'spacious', label: '📏 Spacious Area' },
  { id: 'privacy', label: '🔒 Privacy' },
  { id: 'unique', label: '🌟 Unique Experience' },
];

export default function AIRoomRecommendationModal({ isOpen, onClose }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({
    guest: null,
    experience: null,
    priority: null,
  });
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);

  // Fetch active rooms when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    } else {
      // Reset state when modal closes
      setStep(1);
      setAnswers({ guest: null, experience: null, priority: null });
      setRecommendations([]);
    }
  }, [isOpen]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const roomsRef = collection(db, 'rooms');
      const q = query(
        roomsRef,
        where('archived', '!=', true),
        where('availability', '==', 'available')
      );
      const snapshot = await getDocs(q);
      const roomsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRooms(roomsList);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (question, value) => {
    setAnswers(prev => ({ ...prev, [question]: value }));
  };

  const handleAnswerClick = (question, value) => {
    // Save answer
    const newAnswers = { ...answers, [question]: value };
    setAnswers(newAnswers);

    // Auto advance behavior
    if (step < 3) {
      setStep(step + 1);
    } else {
      computeRecommendations(newAnswers);
    }
  };

  const computeRecommendations = (finalAnswers) => {
    if (!rooms.length && finalAnswers.guest !== 'exclusive') return;

    // 🔹 EXCLUSIVE STAY HANDLING
    if (finalAnswers.guest === 'exclusive') {
      const exclusiveReason = 'Perfect for guests who want the entire resort experience with maximum privacy and exclusivity.';
      setRecommendations([
        {
          exclusive: true,
          score: 100,
          reasons: [exclusiveReason],
        },
      ]);
      setStep(3);
      return;
    }

    // Normal room scoring for other guest types
    const guestData = guestOptions.find(g => g.id === finalAnswers.guest);
    const guestMin = guestData?.min || 1;
    const guestMax = guestData?.max || 1;
    const experience = finalAnswers.experience;
    const priority = finalAnswers.priority;

    const scored = rooms.map(room => {
      let score = 0;
      const reasons = [];

      // Capacity match
      const capacityMin = room.capacityMin || 1;
      const capacityMax = room.capacityMax || capacityMin;
      if (capacityMax >= guestMin && capacityMin <= guestMax) {
        score += 30;
        reasons.push('fits your group size');
      } else if (capacityMax >= guestMin) {
        score += 10;
        reasons.push('can accommodate your group');
      } else {
        score -= 20;
      }

      // Experience preferences
      const roomType = (room.type || '').toLowerCase();
      const inclusions = (room.inclusions || []).map(i => i.toLowerCase());

      if (experience === 'nature' && roomType.includes('tent')) {
        score += 35;
        reasons.push('perfect for a camping vibe');
      }
      if (experience === 'romantic' && roomType.includes('couple')) {
        score += 35;
        reasons.push('ideal for a romantic escape');
      }
      if (experience === 'barkada' && roomType.includes('group')) {
        score += 35;
        reasons.push('great for barkada bonding');
      }
      if (experience === 'relaxing') {
        if (roomType.includes('ground')) score += 20;
        if (inclusions.some(i => i.includes('air-conditioned'))) score += 15;
        if (score > 0) reasons.push('designed for relaxation');
      }
      if (experience === 'privateExclusive') {
        if (roomType.includes('group')) score += 30;
        else if (capacityMax >= 10) score += 20;
        reasons.push('exclusive feel');
      }

      // Priority preferences
      if (priority === 'budget') {
        const maxPrice = Math.max(...rooms.map(r => r.price), 1);
        const priceScore = (1 - room.price / maxPrice) * 20;
        score += priceScore;
        reasons.push('budget‑friendly option');
      }
      if (priority === 'comfort') {
        if (inclusions.some(i => i.includes('air-conditioned') || i.includes('fan'))) score += 20;
        if (inclusions.length > 3) score += 10;
        if (score > 0) reasons.push('comfortable stay');
      }
      if (priority === 'spacious') {
        const maxCap = Math.max(...rooms.map(r => r.capacityMax || 1));
        const spaceScore = ((capacityMax - 1) / (maxCap - 1)) * 20;
        score += spaceScore;
        if (spaceScore > 10) reasons.push('spacious and roomy');
      }
      if (priority === 'privacy') {
        if (roomType.includes('couple') || capacityMax <= 2) score += 25;
        else if (capacityMax <= 4) score += 10;
        reasons.push('good privacy');
      }
      if (priority === 'unique') {
        if (roomType.includes('tent')) score += 25;
        else if (roomType.includes('couple')) score += 10;
        reasons.push('unique experience');
      }

      // Combined rule
      if (finalAnswers.guest === 'smallGroup' && priority === 'budget') {
        if (roomType.includes('tent') || roomType.includes('ground')) {
          score += 20;
          reasons.push('great value for small groups');
        }
      }

      return { room, score, reasons: [...new Set(reasons)] };
    });

    const sorted = scored.sort((a, b) => b.score - a.score);
    setRecommendations(sorted);
    setStep(3);
  };

  const resetModal = () => {
    setStep(1);
    setAnswers({ guest: null, experience: null, priority: null });
    setRecommendations([]);
  };

  // Clamp match percentage between 0 and 100
  const getMatchPercent = (score) => {
    let percent = Math.floor(score / 1.5);
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    return percent;
  };

  // Step Navigation Handlers
  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleNext = () => {
    if (step === 1 && answers.guest) {
      setStep(2);
    } else if (step === 2 && answers.experience) {
      setStep(3);
    } else if (step === 3 && answers.priority) {
      computeRecommendations(answers);
    }
  };

  const isNextDisabled = () => {
    if (step === 1) return !answers.guest;
    if (step === 2) return !answers.experience;
    if (step === 3) return !answers.priority;
    return true;
  };

  if (!isOpen) return null;

  const progressPercent = ((step - 1) / 2) * 100;

  const renderQuestion = () => {
    if (step === 1) {
      return (
        <div className="animate-fadeIn bg-slate-50/75 border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1.5">How many guests are staying?</h3>
          <p className="text-gray-500 text-xs mb-5">Select the option that matches your group size.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {guestOptions.map(opt => {
              const isSelected = answers.guest === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleAnswerClick('guest', opt.id)}
                  className={`group relative p-4 rounded-xl border text-left transition-all duration-300 focus:outline-none ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50/30 shadow-sm ring-1 ring-blue-500/20' 
                      : 'border-slate-200/80 bg-white hover:shadow-sm hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`font-bold text-sm sm:text-base ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>{opt.label}</div>
                      <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">Select Option</div>
                    </div>
                    {isSelected ? (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                        <i className="fas fa-check text-[10px]"></i>
                      </div>
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-all duration-300">
                        <i className="fas fa-chevron-right text-[10px]"></i>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between border-t border-slate-200/60 pt-4">
            <button
              disabled={true}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all duration-200"
              aria-label="Previous"
            >
              <i className="fas fa-arrow-left text-xs"></i>
            </button>
            <button
              onClick={handleNext}
              disabled={isNextDisabled()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-500 hover:shadow-xs disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all duration-200"
              aria-label="Next"
            >
              <i className="fas fa-arrow-right text-xs"></i>
            </button>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="animate-fadeIn bg-slate-50/75 border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1.5">What kind of experience are you looking for?</h3>
          <p className="text-gray-500 text-xs mb-5">Tell us your perfect resort vibe.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {experienceOptions.map(opt => {
              const isSelected = answers.experience === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleAnswerClick('experience', opt.id)}
                  className={`group relative p-4 rounded-xl border text-left transition-all duration-300 focus:outline-none ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50/30 shadow-sm ring-1 ring-blue-500/20' 
                      : 'border-slate-200/80 bg-white hover:shadow-sm hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`font-bold text-sm sm:text-base ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>{opt.label}</div>
                      <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">Choose Vibe</div>
                    </div>
                    {isSelected ? (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                        <i className="fas fa-check text-[10px]"></i>
                      </div>
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-all duration-300">
                        <i className="fas fa-chevron-right text-[10px]"></i>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between border-t border-slate-200/60 pt-4">
            <button
              onClick={handlePrev}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-500 hover:shadow-xs shadow-xs transition-all duration-200"
              aria-label="Previous"
            >
              <i className="fas fa-arrow-left text-xs"></i>
            </button>
            <button
              onClick={handleNext}
              disabled={isNextDisabled()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-500 hover:shadow-xs disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all duration-200"
              aria-label="Next"
            >
              <i className="fas fa-arrow-right text-xs"></i>
            </button>
          </div>
        </div>
      );
    }

    if (step === 3 && recommendations.length === 0) {
      return (
        <div className="animate-fadeIn bg-slate-50/75 border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1.5">What matters most to you?</h3>
          <p className="text-gray-500 text-xs mb-5">Choose your absolute top priority.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {priorityOptions.map(opt => {
              const isSelected = answers.priority === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleAnswerClick('priority', opt.id)}
                  className={`group relative p-4 rounded-xl border text-left transition-all duration-300 focus:outline-none ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50/30 shadow-sm ring-1 ring-blue-500/20' 
                      : 'border-slate-200/80 bg-white hover:shadow-sm hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`font-bold text-sm sm:text-base ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>{opt.label}</div>
                      <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">Select Priority</div>
                    </div>
                    {isSelected ? (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                        <i className="fas fa-check text-[10px]"></i>
                      </div>
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-all duration-300">
                        <i className="fas fa-chevron-right text-[10px]"></i>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between border-t border-slate-200/60 pt-4">
            <button
              onClick={handlePrev}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-500 hover:shadow-xs shadow-xs transition-all duration-200"
              aria-label="Previous"
            >
              <i className="fas fa-arrow-left text-xs"></i>
            </button>
            <button
              onClick={handleNext}
              disabled={isNextDisabled()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-500 hover:shadow-xs disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all duration-200"
              aria-label="Next"
            >
              <i className="fas fa-arrow-right text-xs"></i>
            </button>
          </div>
        </div>
      );
    }

    // Results step (step === 3 and recommendations exist)
    if (step === 3 && recommendations.length > 0) {
      return (
        <div className="animate-fadeIn space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200/60 pb-3">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Your Recommended Stays</h3>
              <p className="text-xs text-gray-500">Curated automatically based on your preferences</p>
            </div>
            <button
              onClick={resetModal}
              className="text-xs font-semibold text-blue-650 hover:text-blue-700 flex items-center gap-1 bg-blue-50 border border-blue-200/30 px-3 py-1.5 rounded-xl shadow-xs transition-all"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" /> Start Over
            </button>
          </div>

          {/* Check for Exclusive Stay recommendation */}
          {recommendations[0]?.exclusive ? (
            <ExclusiveStayCard reason={recommendations[0].reasons.join(', ')} />
          ) : (
            <>
              {/* Top recommendation */}
              {recommendations[0] && (
                <RoomCard
                  room={recommendations[0].room}
                  reason={recommendations[0].reasons.join(', ')}
                  matchPercent={getMatchPercent(recommendations[0].score)}
                />
              )}

              {/* Alternative recommendations */}
              {recommendations.length > 1 && (
                <div className="pt-2">
                  <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1">
                    <i className="fas fa-list text-blue-500 text-xs"></i> Other Great Options
                  </h4>
                  <div className="grid gap-3">
                    {recommendations.slice(1, 4).map((item) => (
                      <RoomCard
                        key={item.room.id}
                        room={item.room}
                        reason={item.reasons.join(', ')}
                        matchPercent={getMatchPercent(item.score)}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {recommendations.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-500">
              No rooms match your preferences right now. Please adjust your choices or check back later.
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // Exclusive Stay Card Component
  const ExclusiveStayCard = ({ reason }) => {
    const matchPercent = 98; // High match for exclusive intent
    return (
      <div className="rounded-3xl border border-amber-250 bg-[#fffbeb] shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
        <div className="relative h-56 w-full">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-900/60 to-blue-900/40 z-0" />
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <i className="fas fa-crown text-7xl text-amber-300 drop-shadow-lg animate-pulse"></i>
          </div>
          <div className="absolute inset-0 bg-[url('/SandyFeet_logo2.png')] bg-cover bg-center opacity-30 mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="absolute top-4 right-4 bg-amber-600 text-white rounded-full px-3 py-1.5 text-xs font-bold shadow-md">
            🎯 {matchPercent}% Match
          </div>
          <div className="absolute bottom-4 left-4 text-white">
            <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-600/90 backdrop-blur-xs px-2 py-0.5 rounded-md">Exclusive Recommendation</span>
          </div>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h3 className="text-xl font-bold text-gray-900">✨ Exclusive Resort Stay</h3>
            <span className="text-lg font-bold text-amber-700 sm:text-right shrink-0">
              Custom Quote
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
            <i className="fas fa-building text-amber-500 text-[10px]"></i> Entire resort (excluding tents) reserved just for you
          </p>
          <p className="text-gray-600 text-sm leading-relaxed mb-4">
            Enjoy complete privacy, all resort amenities, and personalized service. Perfect for large groups, weddings, or corporate retreats.
          </p>
          {reason && (
            <div className="p-3 bg-white/80 rounded-xl border border-amber-200/60 mb-5 flex items-start gap-2">
              <span className="text-amber-600 mt-0.5">✨</span>
              <p className="text-xs text-amber-900 leading-relaxed font-semibold">
                Why we recommend this: <span className="font-medium text-amber-850">{reason}</span>
              </p>
            </div>
          )}
          <div>
            <button
              onClick={() => {
                onClose(); // Close modal
                router.push('/rooms');
              }}
              className="inline-flex items-center justify-center w-full rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 hover:shadow-md transition-all duration-300"
            >
              Book & View Details <i className="fas fa-arrow-right ml-2 text-xs"></i>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const RoomCard = ({ room, reason, matchPercent, compact = false }) => {
    const imageUrl = room.images?.[0] || '/assets/placeholder-room.jpg';
    const slug = toRoomSlug(room.type);
    const capacityText = `${room.capacityMin}–${room.capacityMax} guests`;

    if (compact) {
      return (
        <div className="flex gap-4 p-4 rounded-2xl border border-slate-200/70 bg-[#f8fbff]/90 shadow-xs hover:shadow-sm hover:border-blue-300 hover:bg-[#f0f6ff] transition-all duration-300">
          <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200/50">
            <Image src={imageUrl} alt={room.type} fill className="object-cover" />
          </div>
          <div className="flex-grow min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate">{room.type}</h4>
                <p className="text-xs text-gray-500 mt-0.5">👥 {capacityText}</p>
              </div>
              <span className="text-xs sm:text-sm font-bold text-blue-600 text-right shrink-0">
                ₱{room.price.toLocaleString()}<span className="text-[10px] text-gray-400 font-normal">/n</span>
              </span>
            </div>
            {reason && (
              <p className="text-[11px] text-blue-900 mt-2 line-clamp-1 bg-white/80 px-2 py-0.5 rounded border border-blue-100/30">
                ✨ {reason}
              </p>
            )}
            <div className="mt-2.5 flex items-center justify-between">
              <Link
                href={`/rooms/${encodeURIComponent(slug)}`}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View details <i className="fas fa-arrow-right text-[8px]"></i>
              </Link>
              {matchPercent !== undefined && (
                <span className="text-[10px] font-bold text-indigo-650 bg-indigo-50/80 px-1.5 py-0.5 rounded-lg border border-indigo-100/30">
                  {matchPercent}% match
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-slate-250 bg-[#f8fbff]/90 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-slate-300">
        <div className="relative h-56 w-full">
          <Image src={imageUrl} alt={room.type} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          {matchPercent !== undefined && (
            <div className="absolute top-4 right-4 bg-blue-600 text-white rounded-full px-3 py-1.5 text-xs font-bold shadow-md">
              🎯 {matchPercent}% Match
            </div>
          )}
          <div className="absolute bottom-4 left-4 text-white">
            <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-600/90 backdrop-blur-xs px-2 py-0.5 rounded-md">Best Recommendation</span>
          </div>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h3 className="text-xl font-bold text-gray-900">{room.type}</h3>
            <span className="text-lg font-bold text-blue-600 sm:text-right shrink-0">
              ₱{room.price.toLocaleString()} <span className="text-xs text-gray-500 font-normal">/ night</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
            <i className="fas fa-users text-blue-500 text-[10px]"></i> Max capacity: {capacityText}
          </p>
          <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-2">{room.description}</p>
          {reason && (
            <div className="p-3 bg-white/80 rounded-2xl border border-blue-100/60 mb-5 flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">✨</span>
              <p className="text-xs text-blue-900 leading-relaxed font-semibold">
                Why we recommend this: <span className="font-medium text-blue-800">{reason}</span>
              </p>
            </div>
          )}
          <div>
            <Link
              href={`/rooms/${encodeURIComponent(slug)}`}
              className="inline-flex items-center justify-center w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 hover:shadow-md transition-all duration-300"
            >
              Book & View Details <i className="fas fa-arrow-right ml-2 text-xs"></i>
            </Link>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex justify-between items-center z-10">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <h2 className="text-lg font-bold text-gray-900">AI Room Assistant</h2>
            </div>
            {step !== 3 && (
              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-wider">Step {step} of 3</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-50 transition-colors ml-4 shrink-0">
            <XMarkIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-white">
          {loading && step !== 3 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 border-3 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
              <p className="mt-4 text-xs font-medium text-gray-500">Loading available resort rooms...</p>
            </div>
          ) : (
            renderQuestion()
          )}
        </div>
      </div>
    </div>
  );
}