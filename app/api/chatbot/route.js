import { readFileSync } from 'fs';
import { join } from 'path';

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let openAICircuitOpenUntil = 0;
let geminiCircuitOpenUntil = 0;
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

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
9. Format responses nicely — use line breaks for readability. Keep answers under 150 words unless the question requires detailed explanation.

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
          max_tokens: 300,
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
        console.warn('OpenAI quota/rate limit reached; opening OpenAI circuit.', {
          status: error?.status,
          code: error?.code,
          type: error?.type,
          cooldownMs: QUOTA_COOLDOWN_MS,
        });
        break;
      }

      if (!isRetryableModelError(error)) {
        console.error('OpenAI hard failure:', {
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
  const fallbackGeminiKey = process.env.FALLBACK_API_KEY;
  const candidateKeys = [primaryGeminiKey, fallbackGeminiKey].filter(Boolean);

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
              maxOutputTokens: 300,
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

function localKnowledgeReply(message) {
  const fallbackContact = "I'm not sure about that one! For more details, please email us at sandyfeetreservation@gmail.com or check our website.";

  if (!knowledgeBase || knowledgeBase.includes('currently unavailable')) {
    return fallbackContact;
  }

  const queryTokens = new Set(tokenize(message));
  const sections = knowledgeBase
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  let bestSection = '';
  let bestScore = 0;

  for (const section of sections) {
    const sectionTokens = new Set(tokenize(section));
    let score = 0;

    for (const token of queryTokens) {
      if (sectionTokens.has(token)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSection = section;
    }
  }

  if (!bestSection || bestScore === 0) {
    return fallbackContact;
  }

  const lines = bestSection
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (lines.length === 0) {
    return fallbackContact;
  }

  return `${lines.join('\n')}\n\nIf you want, I can help with rooms, day tours, facilities, or reservation tracking. 🏖️`;
}

export async function POST(request) {
  try {
    const { message, history } = await request.json();
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!trimmedMessage) {
      return Response.json({ reply: "It looks like you sent an empty message. How can I help you today? 😊" }, { status: 200 });
    }

    const messages = buildConversationMessages(history, trimmedMessage);

    const openAIReply = await tryOpenAI(messages);
    if (openAIReply) {
      return Response.json({ reply: openAIReply }, { status: 200 });
    }

    const geminiReply = await tryGemini(messages);
    if (geminiReply) {
      return Response.json({ reply: geminiReply }, { status: 200 });
    }

    return Response.json(
      {
        reply: `${localKnowledgeReply(trimmedMessage)}\n\nLive AI is temporarily unavailable right now, so I'm using our local resort guide for the moment.`
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
