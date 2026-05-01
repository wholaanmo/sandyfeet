import { readFileSync } from 'fs';
import { join } from 'path';

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let deepSeekCircuitOpenUntil = 0;
let geminiCircuitOpenUntil = 0;
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash', 'gemini-2.5-flash'];
const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
const MAX_RESPONSE_TOKENS = 700;
const MAX_LOCAL_SECTIONS = 3;
const SHOW_AI_UNAVAILABLE_NOTICE = process.env.CHATBOT_SHOW_AI_STATUS === 'true';

const QUERY_TOKEN_ALIASES = {
  tagalo: ['tagalog', 'filipino'],
  tagalog: ['filipino'],
  filipino: ['tagalog'],
  pilipino: ['tagalog', 'filipino'],
  reserbasyon: ['reservation', 'booking'],
  reservation: ['booking'],
  booking: ['reservation'],
  kuwarto: ['room', 'rooms'],
  kwarto: ['room', 'rooms'],
  silid: ['room', 'rooms'],
  presyo: ['pricing', 'rates'],
  bayad: ['payment'],
  pasilidad: ['facilities', 'amenities'],
  gamit: ['facilities', 'amenities'],
  lokasyon: ['location', 'address'],
  saan: ['location', 'address'],
  pasok: ['check', 'times'],
  labas: ['checkout', 'times'],
};

// Load the knowledge base once at module level
let knowledgeBase = '';
try {
  const knowledgePath = join(process.cwd(), 'public', 'chatbot-knowledge.md');
  knowledgeBase = readFileSync(knowledgePath, 'utf-8');
} catch (error) {
  console.error('Failed to load chatbot knowledge base:', error);
  knowledgeBase = 'Knowledge base is currently unavailable.';
}

const SYSTEM_PROMPT = `You are "Sandy", the friendly virtual assistant for Sandyfeet Liwliwa Camp — a beachfront resort in Zambales, Philippines.

YOUR RULES (STRICTLY FOLLOW):
1. You may ONLY answer questions using the knowledge base provided below. Do NOT make up information, prices, room details, or policies that are not explicitly stated in the knowledge base.
2. If a guest asks about something NOT covered in the knowledge base, respond politely: "I'm not sure about that one! For more details, please email us at sandyfeetreservation@gmail.com or check our website."
3. Keep your responses concise, warm, and helpful. Use a friendly, casual-professional tone that matches a beach resort vibe.
4. When relevant, guide guests to the correct page on the website (e.g., "You can book a room on our Rooms page" or "Track your reservation on the Track Reservation page").
5. Use emojis sparingly (1-2 max per response) to keep it friendly but professional.
6. Never discuss topics unrelated to Sandyfeet Resort (politics, other businesses, personal advice, coding, etc.). Politely redirect: "I'm here to help with Sandyfeet Resort inquiries! 🏖️"
7. If asked about exact pricing and you don't have specific numbers, say: "Pricing may vary — please check our Rooms or Day Tour page for the latest rates!"
8. Do NOT pretend to make bookings or process payments. Always direct guests to use the website.
9. Keep answers concise but complete. If a question has multiple parts, cover each part clearly. Use line breaks and short sections for readability. Do not cut off mid-thought.
10. Support both English and Filipino/Tagalog. Reply in the same language as the guest whenever possible. If asked whether you understand Tagalog, confirm that you do.

KNOWLEDGE BASE:
---
${knowledgeBase}
---

Remember: You are Sandy, the Sandyfeet Resort assistant. Stay in scope, be helpful, and keep it beachy! 🌊`;

function isQuotaOrRateLimitError(error) {
  const errorMessage = (error?.message || '').toLowerCase();
  const errorCode = (error?.code || '').toLowerCase();
  const errorType = (error?.type || '').toLowerCase();

  return (
    error?.status === 429 ||
    errorCode === 'insufficient_quota' ||
    errorCode === 'rate_limit_exceeded' ||
    errorType === 'insufficient_quota' ||
    errorType === 'rate_limit_exceeded' ||
    errorMessage.includes('429') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('rate limit')
  );
}

function isRetryableModelError(error) {
  const errorMessage = (error?.message || '').toLowerCase();
  const status = error?.status;

  return (
    status === 404 ||
    status === 429 ||
    status >= 500 ||
    errorMessage.includes('model') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('unsupported') ||
    errorMessage.includes('overloaded')
  );
}

function splitKnowledgeSections(raw) {
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const sections = [];
  let current = { title: '', lines: [] };

  const pushCurrent = () => {
    const text = current.lines.join('\n').trim();
    if (current.title || text) {
      sections.push({ title: current.title, text });
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      pushCurrent();
      current = { title: headingMatch[1].trim(), lines: [] };
      continue;
    }
    current.lines.push(line);
  }

  pushCurrent();

  if (sections.length > 0) {
    return sections;
  }

  return raw
    .split(/\n\s*\n/)
    .map((section) => ({ title: '', text: section.trim() }))
    .filter((section) => section.text);
}

function buildConversationMessages(history, trimmedMessage) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  if (Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'bot' && typeof msg.content === 'string') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  messages.push({ role: 'user', content: trimmedMessage });
  return messages;
}

async function tryDeepSeek(messages) {
  const apiKey = process.env.FALLBACK_API_KEY_2;
  if (!apiKey) {
    return null;
  }

  if (Date.now() < deepSeekCircuitOpenUntil) {
    return null;
  }

  for (const model of DEEPSEEK_MODELS) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: MAX_RESPONSE_TOKENS,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(payload?.error?.message || 'DeepSeek request failed');
        err.status = response.status;
        err.code = payload?.error?.code;
        err.type = payload?.error?.type;
        throw err;
      }

      const reply = payload?.choices?.[0]?.message?.content?.trim();
      if (reply) {
        return reply;
      }
    } catch (error) {
      if (isQuotaOrRateLimitError(error)) {
        deepSeekCircuitOpenUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn('DeepSeek quota/rate limit reached; opening DeepSeek circuit.', {
          status: error?.status,
          code: error?.code,
          type: error?.type,
          cooldownMs: QUOTA_COOLDOWN_MS,
        });
        break;
      }

      if (!isRetryableModelError(error)) {
        console.error('DeepSeek hard failure:', {
          message: error?.message,
          status: error?.status,
          code: error?.code,
          type: error?.type,
        });
        break;
      }
    }
  }

  return null;
}

async function tryGemini(messages) {
  const primaryGeminiKey = process.env.GEMINI_API_KEY;
  const secondaryGeminiKey = process.env.FALLBACK_GEMINI_API_KEY;
  const legacyFallbackGeminiKey = process.env.FALLBACK_API_KEY;
  const candidateKeys = [...new Set([
    primaryGeminiKey,
    secondaryGeminiKey,
    legacyFallbackGeminiKey,
  ].filter(Boolean))];

  if (candidateKeys.length === 0) {
    return null;
  }

  if (Date.now() < geminiCircuitOpenUntil) {
    return null;
  }

  const geminiText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  for (const key of candidateKeys) {
    for (const model of GEMINI_MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: geminiText }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: MAX_RESPONSE_TOKENS,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const err = new Error(payload?.error?.message || 'Gemini request failed');
          err.status = response.status;
          err.code = payload?.error?.status;
          err.type = payload?.error?.details?.[0]?.reason;
          throw err;
        }

        const reply = payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply) {
          return reply;
        }
      } catch (error) {
        if (isQuotaOrRateLimitError(error)) {
          geminiCircuitOpenUntil = Date.now() + QUOTA_COOLDOWN_MS;
          console.warn('Gemini quota/rate limit reached; opening Gemini circuit.', {
            status: error?.status,
            code: error?.code,
            type: error?.type,
            cooldownMs: QUOTA_COOLDOWN_MS,
          });
          break;
        }

        if (!isRetryableModelError(error)) {
          console.error('Gemini hard failure:', {
            message: error?.message,
            status: error?.status,
            code: error?.code,
            type: error?.type,
          });
          break;
        }
      }
    }
  }

  return null;
}

function tokenize(input) {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function expandQueryTokens(queryTokens) {
  const expanded = new Set(queryTokens);

  for (const token of [...expanded]) {
    const aliases = QUERY_TOKEN_ALIASES[token];
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        expanded.add(alias);
      }
    }
  }

  return expanded;
}

function maybeLanguageCapabilityReply(message) {
  const normalized = (message || '').toLowerCase();
  const hasTagalogTerm = /\b(tagalog|tagalo|filipino|pilipino)\b/.test(normalized);
  const hasLanguageIntent = /\b(understand|speak|read|write|naiintindihan|nakakaintindi|marunong|pwede|kaya)\b/.test(normalized);

  if (!hasTagalogTerm) {
    return null;
  }

  if (hasLanguageIntent || normalized.trim().endsWith('?') || normalized.trim().length <= 50) {
    return [
      'Oo, nakakaintindi ako ng Tagalog at English.',
      'Pwede ka magtanong in either language tungkol sa rooms, day tours, booking, facilities, payment, at reservation tracking sa Sandyfeet.',
      'Kung may detalye na wala sa guide, email us at sandyfeetreservation@gmail.com.',
    ].join('\n');
  }

  return null;
}

function localKnowledgeReply(message) {
  const fallbackContact = "I'm not sure about that one! For more details, please email us at sandyfeetreservation@gmail.com or check our website.";

  if (!knowledgeBase || knowledgeBase.includes('currently unavailable')) {
    return fallbackContact;
  }

  const languageCapabilityReply = maybeLanguageCapabilityReply(message);
  if (languageCapabilityReply) {
    return languageCapabilityReply;
  }

  const queryTokens = expandQueryTokens(new Set(tokenize(message)));
  const sections = splitKnowledgeSections(knowledgeBase);
  const scoredSections = sections
    .map((section) => {
      const titleTokens = new Set(tokenize(section.title));
      const bodyTokens = new Set(tokenize(section.text));
      let score = 0;

      for (const token of queryTokens) {
        if (titleTokens.has(token)) {
          score += 3;
        }
        if (bodyTokens.has(token)) {
          score += 1;
        }
      }

      return { ...section, score };
    })
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LOCAL_SECTIONS);

  if (scoredSections.length === 0) {
    return fallbackContact;
  }

  const replyParts = [];

  for (const section of scoredSections) {
    const lines = section.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (section.title) {
      replyParts.push(`**${section.title}**`);
    }

    replyParts.push(...lines);
    replyParts.push('');
  }

  const reply = replyParts.join('\n').trim();
  return reply || fallbackContact;
}

export async function POST(request) {
  try {
    const { message, history } = await request.json();
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!trimmedMessage) {
      return Response.json({ reply: "It looks like you sent an empty message. How can I help you today? 😊" }, { status: 200 });
    }

    const messages = buildConversationMessages(history, trimmedMessage);

    const deepSeekReply = await tryDeepSeek(messages);
    if (deepSeekReply) {
      return Response.json({ reply: deepSeekReply, source: 'deepseek' }, { status: 200 });
    }

    const geminiReply = await tryGemini(messages);
    if (geminiReply) {
      return Response.json({ reply: geminiReply, source: 'gemini' }, { status: 200 });
    }

    const localReply = localKnowledgeReply(trimmedMessage);
    const aiUnavailableNotice = SHOW_AI_UNAVAILABLE_NOTICE
      ? '\n\nI am currently using the local resort guide for this reply.'
      : '';

    return Response.json(
      {
        reply: `${localReply}${aiUnavailableNotice}`,
        source: 'local',
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Chatbot API unexpected error:', {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      requestID: error?.requestID,
    });

    return Response.json(
      { reply: "Oops! Something went wrong on my end. Please try again in a moment. If the issue persists, feel free to email us at sandyfeetreservation@gmail.com 📧" },
      { status: 200 }
    );
  }
}
