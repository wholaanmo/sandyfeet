// lib/server/integrations/chatbot-fallback.js
// Local chatbot fallback: provides resort-information responses when AI providers
// are unavailable. Enforces action boundaries by redirecting booking/payment/
// sensitive requests to approved application URLs.
import 'server-only';

/**
 * Approved action-boundary URLs for redirecting users to authorized workflows.
 */
const APPROVED_ACTIONS = Object.freeze({
  booking: '/rooms',
  dayTour: '/day-tour',
  payment: '/my-bookings',
  account: '/account',
  contact: null, // Will use text guidance instead of URL
});

/**
 * Action-boundary keywords that indicate a user wants to perform a business action.
 * These trigger redirection to approved application workflows.
 */
const ACTION_KEYWORDS = Object.freeze([
  { pattern: /\b(book|reserve|reservation|reserv)\b/i, action: 'booking' },
  { pattern: /\b(pay|payment|deposit|down\s*payment|balance|refund)\b/i, action: 'payment' },
  { pattern: /\b(day[\s-]?tour)\b/i, action: 'dayTour' },
  { pattern: /\b(cancel|cancellation)\b/i, action: 'payment' },
  { pattern: /\b(check[\s-]?in|checkin)\b/i, action: 'payment' },
  { pattern: /\b(password|login|sign[\s-]?in|account|profile)\b/i, action: 'account' },
  { pattern: /\b(sensitive|private|secret|credential|token)\b/i, action: 'restricted' },
]);

/**
 * Local resort knowledge base for fallback responses.
 */
const KNOWLEDGE_BASE = Object.freeze({
  greeting: 'Welcome to Sandy Feet Resort! I can answer basic questions about the resort. For bookings, payments, or account actions, please use the appropriate section of our website.',

  rooms: 'Sandy Feet Resort offers several room types. Please visit our Rooms page at /rooms to see availability, pricing, and photos for each room type.',

  location: 'Sandy Feet Resort is located in the Philippines. For directions and detailed location information, please contact the resort directly.',

  amenities: 'Our resort features beach access, comfortable accommodations, and day-tour activities. Visit our website sections for details about each service.',

  contact: 'For questions that require personal assistance, please contact the resort directly through the information on our website or visit /account for your booking-related inquiries.',

  hours: 'Check-in time is typically in the afternoon and check-out is in the morning. Specific times will be confirmed with your reservation.',

  dayTour: 'We offer day-tour packages for visitors who want to enjoy the resort for a day. Visit /day-tour for availability and booking.',

  policies: 'Our resort has specific policies regarding cancellations, refunds, and down payments. These are provided during the booking process. For questions about an existing booking, please visit /my-bookings.',

  fallback: 'I can help with general resort information. For bookings, payments, account changes, or specific reservation questions, please use the appropriate section of our website or contact the resort directly.',
});

/**
 * Simple keyword-based topic matching for the knowledge base.
 */
const TOPIC_PATTERNS = Object.freeze([
  { pattern: /\b(hello|hi|hey|good\s*(morning|afternoon|evening))\b/i, topic: 'greeting' },
  { pattern: /\b(rooms?|suite|accommodation|stay|bed)\b/i, topic: 'rooms' },
  { pattern: /\b(where|location|address|direction|map)\b/i, topic: 'location' },
  { pattern: /\b(amenity|amenities|pool|beach|facility|facilities)\b/i, topic: 'amenities' },
  { pattern: /\b(contact|phone|email|call|reach)\b/i, topic: 'contact' },
  { pattern: /\b(check[\s-]?in\s*time|check[\s-]?out\s*time|hour|time|when)\b/i, topic: 'hours' },
  { pattern: /\b(day[\s-]?tour|visit|day\s*trip)\b/i, topic: 'dayTour' },
  { pattern: /\b(policy|policies|cancel|refund|rule)\b/i, topic: 'policies' },
]);

/**
 * Check if a message contains action-boundary keywords that should redirect
 * the user to an approved application workflow.
 *
 * @param {string} message
 * @returns {{ isAction: boolean, action?: string, redirectUrl?: string | null, guidance?: string }}
 */
export function detectActionBoundary(message) {
  if (!message || typeof message !== 'string') {
    return { isAction: false };
  }

  for (const { pattern, action } of ACTION_KEYWORDS) {
    if (pattern.test(message)) {
      if (action === 'restricted') {
        return {
          isAction: true,
          action: 'restricted',
          redirectUrl: null,
          guidance: 'I cannot provide sensitive data or credentials. For account and security questions, please visit /account or contact the resort directly.',
        };
      }

      const redirectUrl = APPROVED_ACTIONS[action] || null;
      const guidance = redirectUrl
        ? `I can\'t perform that action directly. Please visit ${redirectUrl} to proceed.`
        : 'For that request, please contact the resort directly.';

      return { isAction: true, action, redirectUrl, guidance };
    }
  }

  return { isAction: false };
}

/**
 * Get a local chatbot fallback response when AI providers are unavailable.
 * Provides resort information from a local knowledge base.
 * If the message suggests a business action, redirects to approved URLs.
 *
 * @param {string} message - The user's message
 * @returns {{ text: string, isFallback: true, redirectUrl?: string | null }}
 */
export function getChatbotFallbackResponse(message) {
  if (!message || typeof message !== 'string') {
    return {
      text: KNOWLEDGE_BASE.fallback,
      isFallback: true,
    };
  }

  const trimmed = message.trim().toLowerCase();

  // Check action boundaries first
  const boundary = detectActionBoundary(trimmed);
  if (boundary.isAction) {
    return {
      text: boundary.guidance,
      isFallback: true,
      redirectUrl: boundary.redirectUrl,
    };
  }

  // Match against knowledge base topics
  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        text: KNOWLEDGE_BASE[topic],
        isFallback: true,
      };
    }
  }

  // Default fallback
  return {
    text: KNOWLEDGE_BASE.fallback,
    isFallback: true,
  };
}

/**
 * Check if a chatbot response requires a reset confirmation.
 * The UI should request confirmation if the conversation contains a user message.
 *
 * @param {Array<{ role: string, text: string }>} history
 * @returns {boolean}
 */
export function shouldConfirmReset(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return false;
  }
  return history.some((entry) => entry && entry.role === 'user');
}
