// app/api/chatbot/route.js
// Hardened chatbot API — bounded input, rate-limited, normalized history.
// Primary provider: openai-oauth (uses ChatGPT subscription, no API credits needed)
// Fallbacks: OpenAI API key, Gemini API key, local knowledge base
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { withApiBoundary } from '@/lib/server/http/boundary.js';
import { boundedString } from '@/lib/server/http/schemas.js';
import { normalizeChatbotInput } from '@/lib/server/services/chatbot.js';

export const runtime = 'nodejs';

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let openAICircuitOpenUntil = 0;
let geminiCircuitOpenUntil = 0;
let oauthCircuitOpenUntil = 0;
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
// Models available via openai-oauth (ChatGPT subscription)
const OAUTH_MODELS = ['gpt-5.4-mini', 'gpt-5.5'];
const MAX_RESPONSE_TOKENS = 700;
const MAX_LOCAL_SECTIONS = 3;

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

// Load the knowledge base at module level (re-read on module re-evaluation)
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

// Body schema: bounded message + optional history (lenient to allow normalization service to handle variants)
const bodySchema = z.object({
  message: boundedString(1, 1000),
  history: z.array(
    z.object({
      role: z.string(),
      text: z.string().optional(),
      content: z.string().optional(),
    }).passthrough()
  ).max(10).optional(),
}).passthrough();

export const POST = withApiBoundary(
  {
    methods: ['POST'],
    auth: 'none',
    rateLimit: 'chatbot',
    bodySchema,
  },
  async ({ input, correlationId }) => {
    const { message, history } = input;

    // Normalize through the chatbot service for additional validation
    let normalized;
    try {
      normalized = normalizeChatbotInput(message, history);
    } catch (validationError) {
      // If normalization fails, use raw message with empty history
      normalized = { message: String(message || '').trim().slice(0, 1000), history: [] };
    }

    const trimmedMessage = normalized.message;

    if (!trimmedMessage) {
      return {
        data: { reply: "It looks like you sent an empty message. How can I help you today? 😊" },
        status: 200,
      };
    }

    const messages = buildConversationMessages(normalized.history, trimmedMessage);

    // 1st: Try openai-oauth (uses ChatGPT subscription — no API credits)
    const oauthReply = await tryOpenAIOAuth(messages);
    if (oauthReply) {
      return { data: { reply: oauthReply, source: 'openai-oauth' }, status: 200 };
    }

    // 2nd: Try OpenAI API key (paid credits)
    const openAIReply = await tryOpenAI(messages);
    if (openAIReply) {
      return { data: { reply: openAIReply, source: 'openai' }, status: 200 };
    }

    // 3rd: Try Gemini API
    const geminiReply = await tryGemini(messages);
    if (geminiReply) {
      return { data: { reply: geminiReply, source: 'gemini' }, status: 200 };
    }

    // 4th: Local knowledge fallback (always available — uses the FAQ/knowledge base)
    const localReply = localKnowledgeReply(trimmedMessage);

    return {
      data: { reply: localReply, source: 'local' },
      status: 200,
    };
  }
);

// ─── Internal helpers (preserved from original) ──────────────────────────────

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
      if (msg.role === 'user' && typeof msg.text === 'string') {
        messages.push({ role: 'user', content: msg.text });
      } else if (msg.role === 'assistant' && typeof msg.text === 'string') {
        messages.push({ role: 'assistant', content: msg.text });
      }
    }
  }

  messages.push({ role: 'user', content: trimmedMessage });
  return messages;
}

async function tryOpenAIOAuth(messages) {
  // openai-oauth uses your ChatGPT subscription credentials stored locally.
  // No API credits needed — uses the same auth as ChatGPT in the browser.
  if (Date.now() < oauthCircuitOpenUntil) {
    return null;
  }

  try {
    const { openaiCredentials } = await import('@openai-oauth/local');
    const { createOpenAIOAuth } = await import('@openai-oauth/ai-sdk');
    const { generateText } = await import('ai');

    const credentials = openaiCredentials();
    const openai = createOpenAIOAuth(credentials);

    for (const model of OAUTH_MODELS) {
      try {
        const result = await generateText({
          model: openai(model),
          messages: messages.map((m) => ({
            role: m.role === 'system' ? 'system' : m.role,
            content: m.content,
          })),
          maxTokens: MAX_RESPONSE_TOKENS,
          temperature: 0.7,
        });

        const reply = result?.text?.trim();
        if (reply) {
          return reply;
        }
      } catch (modelError) {
        // If it's a rate limit or quota error for this model, try next
        if (isRetryableModelError(modelError)) {
          continue;
        }
        throw modelError;
      }
    }
  } catch (error) {
    const errorMessage = (error?.message || '').toLowerCase();

    // If credentials are not found or not logged in, disable for cooldown
    if (
      errorMessage.includes('not logged in') ||
      errorMessage.includes('credential') ||
      errorMessage.includes('auth') ||
      errorMessage.includes('no session') ||
      errorMessage.includes('enoent')
    ) {
      // Credentials not set up — circuit open for longer
      oauthCircuitOpenUntil = Date.now() + QUOTA_COOLDOWN_MS * 4;
      return null;
    }

    if (isQuotaOrRateLimitError(error)) {
      oauthCircuitOpenUntil = Date.now() + QUOTA_COOLDOWN_MS;
      return null;
    }

    // Other error — short circuit
    oauthCircuitOpenUntil = Date.now() + 60_000;
  }

  return null;
}

async function tryOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (Date.now() < openAICircuitOpenUntil) {
    return null;
  }

  for (const model of OPENAI_MODELS) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        const err = new Error(payload?.error?.message || 'OpenAI request failed');
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
        openAICircuitOpenUntil = Date.now() + QUOTA_COOLDOWN_MS;
        break;
      }

      if (!isRetryableModelError(error)) {
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
          break;
        }

        if (!isRetryableModelError(error)) {
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
