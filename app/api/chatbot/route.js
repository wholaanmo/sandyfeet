import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Load & parse the knowledge base at module level ───
let knowledgeSections = [];

try {
  const knowledgePath = join(process.cwd(), 'public', 'chatbot-knowledge.md');
  const raw = readFileSync(knowledgePath, 'utf-8');
  knowledgeSections = parseKnowledgeBase(raw);
} catch (error) {
  console.error('Failed to load chatbot knowledge base:', error);
}

/**
 * Parses the markdown knowledge base into structured sections.
 * Each section has a title, keywords (extracted from heading + content), and body text.
 */
function parseKnowledgeBase(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  let currentSection = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentSection && currentSection.body.trim()) {
        sections.push(finalizeSection(currentSection));
      }
      currentSection = {
        title: headingMatch[1].trim(),
        body: '',
      };
    } else if (currentSection) {
      currentSection.body += line + '\n';
    }
  }

  if (currentSection && currentSection.body.trim()) {
    sections.push(finalizeSection(currentSection));
  }

  return sections;
}

function finalizeSection(section) {
  // Clean up body: remove markdown formatting for matching
  const cleanBody = section.body
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/#{1,3}\s+/g, '')
    .trim();

  // Extract keywords from title + body
  const allText = `${section.title} ${cleanBody}`.toLowerCase();
  const words = allText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return {
    title: section.title,
    body: cleanBody,
    keywords: [...new Set(words)],
  };
}

// ─── Predefined conversational intents ───
const GREETINGS = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup', 'whats up', "what's up", 'howdy', 'hola', 'kumusta', 'musta'];
const FAREWELLS = ['bye', 'goodbye', 'see you', 'thanks', 'thank you', 'salamat', 'thank', 'ok thanks', 'ok thank you', 'alright thanks'];
const BOT_IDENTITY = ['who are you', 'what are you', 'your name', 'are you a bot', 'are you real', 'are you human', 'are you ai'];

// ─── Keyword groups to boost specific sections ───
const KEYWORD_BOOSTS = {
  'room': ['room', 'rooms', 'stay', 'accommodation', 'sleep', 'bed', 'ground floor', 'group', 'barkada', 'couple', 'tent', 'camping'],
  'booking': ['book', 'booking', 'reserve', 'reservation', 'how to book', 'process', 'steps'],
  'day tour': ['day tour', 'daytour', 'day trip', 'visit', 'tour', 'day use'],
  'check-in': ['check in', 'checkin', 'check-in', 'check out', 'checkout', 'check-out', 'time', 'what time', 'arrival'],
  'facilities': ['facilities', 'facility', 'amenities', 'amenity', 'pool', 'swimming', 'atv', 'bonfire', 'kitchen', 'parking', 'dragon boat', 'grill'],
  'activities': ['activities', 'activity', 'things to do', 'what to do', 'fun', 'adventure', 'swimming', 'ride'],
  'payment': ['payment', 'pay', 'paid', 'gcash', 'bank', 'transfer', 'proof', 'receipt', 'money', 'price', 'cost', 'rate', 'how much', 'pricing', 'fee'],
  'tracking': ['track', 'tracking', 'status', 'reference', 'reference number', 'where is my booking', 'check booking', 'check status'],
  'location': ['location', 'where', 'address', 'directions', 'map', 'liwliwa', 'zambales', 'san felipe', 'how to get there'],
  'contact': ['contact', 'email', 'phone', 'call', 'reach', 'message', 'number'],
  'cancellation': ['cancel', 'cancellation', 'refund', 'policy', 'reschedule', 'change date'],
  'faq': ['faq', 'question', 'pet', 'pets', 'dog', 'wifi', 'internet', 'bring', 'pack', 'packing', 'maximum', 'max guests', 'capacity', 'how many'],
  'feedback': ['feedback', 'review', 'rate', 'rating', 'comment', 'experience', 'testimonial'],
  'about': ['about', 'what is sandyfeet', 'tell me about', 'sandyfeet', 'resort', 'camp', 'overview'],
};

/**
 * Scores how relevant a knowledge section is to the user's query.
 */
function scoreSection(section, queryWords, queryLower) {
  let score = 0;

  // Direct keyword matches with section keywords
  for (const word of queryWords) {
    if (section.keywords.includes(word)) {
      score += 2;
    }
  }

  // Phrase matching against the body (higher value)
  const bodyLower = section.body.toLowerCase();
  const titleLower = section.title.toLowerCase();

  // Exact phrase from query found in body
  if (bodyLower.includes(queryLower)) {
    score += 10;
  }

  // Title relevance
  for (const word of queryWords) {
    if (titleLower.includes(word)) {
      score += 5;
    }
  }

  // Boost based on keyword groups
  for (const [, groupKeywords] of Object.entries(KEYWORD_BOOSTS)) {
    const queryMatchesGroup = groupKeywords.some(
      (kw) => queryLower.includes(kw)
    );
    if (queryMatchesGroup) {
      const sectionMatchesGroup = groupKeywords.some(
        (kw) => titleLower.includes(kw) || bodyLower.includes(kw)
      );
      if (sectionMatchesGroup) {
        score += 8;
      }
    }
  }

  return score;
}

/**
 * Formats a section body into a clean chat response.
 * Keeps it concise and conversational.
 */
function formatResponse(sections, queryLower) {
  if (sections.length === 0) {
    return "I'm not sure about that one! For more details, please email us at sandyfeetreservation@gmail.com or visit our website for the latest info. 😊";
  }

  let response = '';

  for (let i = 0; i < Math.min(sections.length, 2); i++) {
    const section = sections[i];
    let body = section.body;

    // Trim overly long responses
    const lines = body.split('\n').filter((l) => l.trim());
    if (lines.length > 12) {
      body = lines.slice(0, 12).join('\n') + '\n\n...and more! Check our website for full details.';
    }

    if (sections.length > 1 && i === 0) {
      response += body + '\n\n';
    } else {
      response += body;
    }
  }

  return response.trim();
}

/**
 * Main handler: finds the best matching knowledge section for the user's query.
 */
function getSmartResponse(message) {
  const queryLower = message.toLowerCase().trim();
  const queryWords = queryLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  // 1. Check conversational intents — but ONLY for short messages
  //    that are primarily greetings (not questions with substance)
  const isShortMessage = queryWords.length <= 4;
  const hasQuestionWords = ['what', 'how', 'where', 'when', 'which', 'can', 'do', 'does', 'is', 'are', 'tell'].some(
    (qw) => queryLower.includes(qw)
  );

  if (isShortMessage && !hasQuestionWords && GREETINGS.some((g) => queryLower.includes(g))) {
    return "Hey there! Welcome to Sandyfeet Liwliwa Camp! 🏖️ I'm Sandy, your resort assistant. Ask me about rooms, day tours, facilities, or booking — I'm here to help!";
  }

  if (isShortMessage && FAREWELLS.some((f) => queryLower.includes(f))) {
    return "You're welcome! If you need anything else, just ask. We hope to see you at Sandyfeet soon! 🌊☀️";
  }

  if (BOT_IDENTITY.some((b) => queryLower.includes(b))) {
    return "I'm Sandy, the virtual assistant for Sandyfeet Liwliwa Camp! 🤖🏖️ I can help you with info about our rooms, day tours, facilities, booking process, and more. Just ask away!";
  }

  // 2. Score all sections against the query
  const scored = knowledgeSections
    .map((section) => ({
      ...section,
      score: scoreSection(section, queryWords, queryLower),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // 3. Pick top results
  if (scored.length === 0) {
    // Check if it's a pricing question
    if (queryLower.includes('price') || queryLower.includes('cost') || queryLower.includes('rate') || queryLower.includes('how much') || queryLower.includes('fee')) {
      return "Pricing may vary depending on the room type and season. 💰 Please check our Rooms page or Day Tour page for the latest rates! You can also email us at sandyfeetreservation@gmail.com for specific inquiries.";
    }

    return "I'm not sure about that one! 🤔 I can help with info about our rooms, day tours, facilities, booking process, and more. For other questions, email us at sandyfeetreservation@gmail.com";
  }

  const topScore = scored[0].score;
  // Include second result only if it's close in relevance
  const topSections = scored.filter((s) => s.score >= topScore * 0.6).slice(0, 2);

  let response = formatResponse(topSections, queryLower);

  // Add contextual CTAs
  if (queryLower.includes('room') || queryLower.includes('stay') || queryLower.includes('accommodation')) {
    response += '\n\nReady to book? Head over to our Rooms page to see availability! 🏠';
  } else if (queryLower.includes('day tour') || queryLower.includes('daytour') || queryLower.includes('tour')) {
    response += '\n\nInterested? Visit our Day Tour page to pick a date and reserve your spot! ☀️';
  } else if (queryLower.includes('track') || queryLower.includes('status') || queryLower.includes('reference')) {
    response += '\n\nYou can check your booking anytime on the Track Reservation page! 📋';
  }

  return response;
}

// ─── API Handler ───
export async function POST(request) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return Response.json(
        { reply: "It looks like you sent an empty message. How can I help you today? 😊" },
        { status: 200 }
      );
    }

    const reply = getSmartResponse(message);

    return Response.json({ reply }, { status: 200 });

  } catch (error) {
    console.error('Chatbot API error:', error);
    return Response.json(
      { reply: "Oops! Something went wrong. Please try again! If the issue persists, email us at sandyfeetreservation@gmail.com 📧" },
      { status: 200 }
    );
  }
}
