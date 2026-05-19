// components/AIRoomRecommendationModal.js
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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

  const handleAnswer = (question, value) => {
    setAnswers(prev => ({ ...prev, [question]: value }));
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Last question answered → compute recommendations
      computeRecommendations({ ...answers, [question]: value });
    }
  };

  const computeRecommendations = (finalAnswers) => {
    if (!rooms.length) return;

    const guestData = guestOptions.find(g => g.id === finalAnswers.guest);
    const guestMin = guestData?.min || 1;
    const guestMax = guestData?.max || 1;
    const experience = finalAnswers.experience;
    const priority = finalAnswers.priority;

    const scored = rooms.map(room => {
      let score = 0;
      const reasons = [];

      // ----- Capacity match -----
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

      // ----- Experience preferences -----
      const roomType = (room.type || '').toLowerCase();
      const inclusions = (room.inclusions || []).map(i => i.toLowerCase());

      // Nature / Camping → prefer Tent
      if (experience === 'nature' && roomType.includes('tent')) {
        score += 35;
        reasons.push('perfect for a camping vibe');
      }
      // Romantic Getaway → prefer Couple Room
      if (experience === 'romantic' && roomType.includes('couple')) {
        score += 35;
        reasons.push('ideal for a romantic escape');
      }
      // Barkada Bonding → prefer Group Room
      if (experience === 'barkada' && roomType.includes('group')) {
        score += 35;
        reasons.push('great for barkada bonding');
      }
      // Relaxing Stay → prefer Ground Floor or AC
      if (experience === 'relaxing') {
        if (roomType.includes('ground')) score += 20;
        if (inclusions.some(i => i.includes('air-conditioned'))) score += 15;
        if (score > 0) reasons.push('designed for relaxation');
      }
      // Private Exclusive Vacation → prefer Group Room or highest capacity
      if (experience === 'privateExclusive') {
        if (roomType.includes('group')) score += 30;
        else if (capacityMax >= 10) score += 20;
        reasons.push('exclusive feel');
      }

      // ----- Priority preferences -----
      // Budget‑Friendly: lower price → higher score
      if (priority === 'budget') {
        const maxPrice = Math.max(...rooms.map(r => r.price), 1);
        const priceScore = (1 - room.price / maxPrice) * 20;
        score += priceScore;
        reasons.push('budget‑friendly option');
      }
      // Comfort: AC or fan + good amenities
      if (priority === 'comfort') {
        if (inclusions.some(i => i.includes('air-conditioned') || i.includes('fan'))) score += 20;
        if (inclusions.length > 3) score += 10;
        if (score > 0) reasons.push('comfortable stay');
      }
      // Spacious Area: higher capacity
      if (priority === 'spacious') {
        const maxCap = Math.max(...rooms.map(r => r.capacityMax || 1));
        const spaceScore = ((capacityMax - 1) / (maxCap - 1)) * 20;
        score += spaceScore;
        if (spaceScore > 10) reasons.push('spacious and roomy');
      }
      // Privacy: Couple Room or small capacity
      if (priority === 'privacy') {
        if (roomType.includes('couple') || capacityMax <= 2) score += 25;
        else if (capacityMax <= 4) score += 10;
        reasons.push('good privacy');
      }
      // Unique Experience: Tent or special room type
      if (priority === 'unique') {
        if (roomType.includes('tent')) score += 25;
        else if (roomType.includes('couple')) score += 10;
        reasons.push('unique experience');
      }

      // ----- Combined rule: Small Group + Budget‑Friendly -----
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

  if (!isOpen) return null;

  // Progress indicator
  const progressPercent = ((step - 1) / 2) * 100;

  // Render question step
  const renderQuestion = () => {
    if (step === 1) {
      return (
        <>
          <h3 className="text-2xl font-playfair text-[#0f2824] mb-2">How many guests are staying?</h3>
          <p className="text-gray-500 text-sm mb-6">Select the option that matches your group size.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {guestOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleAnswer('guest', opt.id)}
                className="group p-4 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm text-left transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <div className="font-semibold text-gray-800">{opt.label}</div>
                <div className="text-xs text-gray-400 mt-1">Select</div>
              </button>
            ))}
          </div>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <h3 className="text-2xl font-playfair text-[#0f2824] mb-2">What kind of experience are you looking for?</h3>
          <p className="text-gray-500 text-sm mb-6">Tell us your vibe.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {experienceOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleAnswer('experience', opt.id)}
                className="group p-4 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm text-left transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-200"
              >
                <div className="font-semibold text-gray-800">{opt.label}</div>
              </button>
            ))}
          </div>
        </>
      );
    }

    if (step === 3 && recommendations.length === 0) {
      return (
        <>
          <h3 className="text-2xl font-playfair text-[#0f2824] mb-2">What matters most to you?</h3>
          <p className="text-gray-500 text-sm mb-6">Choose your top priority.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {priorityOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleAnswer('priority', opt.id)}
                className="group p-4 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm text-left transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-200"
              >
                <div className="font-semibold text-gray-800">{opt.label}</div>
              </button>
            ))}
          </div>
        </>
      );
    }

    // Results step (step === 3 and recommendations exist)
    if (step === 3 && recommendations.length > 0) {
      return (
        <div className="animate-fadeIn">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-playfair text-[#0f2824]">Your perfect stay</h3>
            <button
              onClick={resetModal}
              className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1"
            >
              <ChevronLeftIcon className="w-4 h-4" /> Start over
            </button>
          </div>

          {/* Top recommendation */}
          {recommendations[0] && (
            <div className="mb-10">
              <div className="text-xs font-semibold text-blue-500 mb-2">✨ TOP PICK</div>
              <RoomCard
                room={recommendations[0].room}
                reason={recommendations[0].reasons.join(', ')}
                matchPercent={Math.min(95, Math.floor(recommendations[0].score / 1.5))}
              />
            </div>
          )}

          {/* Alternative recommendations */}
          {recommendations.length > 1 && (
            <>
              <h4 className="text-lg font-semibold text-gray-700 mb-4">Other great options</h4>
              <div className="space-y-4">
                {recommendations.slice(1, 4).map((item, idx) => (
                  <RoomCard
                    key={item.room.id}
                    room={item.room}
                    reason={item.reasons.join(', ')}
                    matchPercent={Math.min(85, Math.floor(item.score / 1.5))}
                    compact
                  />
                ))}
              </div>
            </>
          )}

          {recommendations.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No rooms match your preferences right now. Please adjust your choices or check back later.
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const RoomCard = ({ room, reason, matchPercent, compact = false }) => {
    const imageUrl = room.images?.[0] || '/assets/placeholder-room.jpg';
    const slug = toRoomSlug(room.type);
    const capacityText = `👥 ${room.capacityMin}–${room.capacityMax} guests`;

    if (compact) {
      return (
        <div className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
            <Image src={imageUrl} alt={room.type} fill className="object-cover" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-gray-800">{room.type}</h4>
                <p className="text-xs text-gray-500 mt-1">{capacityText}</p>
              </div>
              <span className="text-sm font-bold text-blue-600">₱{room.price.toLocaleString()}<span className="text-xs font-normal">/night</span></span>
            </div>
            {reason && <p className="text-xs text-gray-600 mt-2 italic">✨ {reason}</p>}
            <Link
              href={`/rooms/${encodeURIComponent(slug)}`}
              className="inline-block mt-2 text-xs font-medium text-blue-500 hover:text-blue-700"
            >
              View details →
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-gray-100 bg-white shadow-lg overflow-hidden transition-all hover:shadow-xl">
        <div className="relative h-56 w-full">
          <Image src={imageUrl} alt={room.type} fill className="object-cover" />
          {matchPercent && (
            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 text-xs font-bold text-blue-600 shadow">
              {matchPercent}% match
            </div>
          )}
        </div>
        <div className="p-5">
          <h3 className="text-xl font-playfair font-bold text-[#0f2824]">{room.type}</h3>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm text-gray-500">{capacityText}</span>
            <span className="text-xl font-bold text-blue-600">₱{room.price.toLocaleString()}<span className="text-sm font-normal">/night</span></span>
          </div>
          <p className="text-gray-600 text-sm mt-3 line-clamp-2">{room.description}</p>
          {reason && <p className="text-sm text-gray-700 mt-2 bg-blue-50 p-2 rounded-lg">✨ {reason}</p>}
          <div className="mt-5">
            <Link
              href={`/rooms/${encodeURIComponent(slug)}`}
              className="inline-flex items-center justify-center w-full rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
            >
              View Details
            </Link>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-white to-gray-50 rounded-3xl shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-playfair font-bold text-[#0f2824]">AI Room Assistant</h2>
            {step !== 3 && (
              <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            )}
            {step !== 3 && <p className="text-xs text-gray-400 mt-1">Step {step} of 3</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {loading && step !== 3 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="mt-4 text-gray-500">Loading available rooms...</p>
            </div>
          ) : (
            renderQuestion()
          )}
        </div>
      </div>
    </div>
  );
}