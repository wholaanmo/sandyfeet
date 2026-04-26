import { OpenAI } from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let quotaCircuitOpenUntil = 0;

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY is not set. Using local chatbot fallback.');
      return Response.json({ reply: localKnowledgeReply(trimmedMessage) }, { status: 200 });
    }

    if (Date.now() < quotaCircuitOpenUntil) {
      return Response.json(
        {
          reply: `${localKnowledgeReply(trimmedMessage)}\n\nHeads up: live AI responses are temporarily unavailable, so I'm using our local resort guide for now.`
        },
        { status: 200 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Build conversation history for OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    if (Array.isArray(history)) {
      for (const msg of history.slice(-10)) { // Keep last 10 messages for context
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'bot') {
          messages.push({ role: 'assistant', content: msg.content });
        }
      }
    }

    // Add the current user message
    messages.push({ role: 'user', content: trimmedMessage });

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 300,
      });

      const reply = completion.choices?.[0]?.message?.content;
      return Response.json(
        { reply: reply || localKnowledgeReply(trimmedMessage) },
        { status: 200 }
      );
    } catch (error) {
      if (isQuotaOrRateLimitError(error)) {
        quotaCircuitOpenUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn('Chatbot API quota/rate limit reached. Enabling local fallback mode.', {
          status: error?.status,
          code: error?.code,
          type: error?.type,
          requestID: error?.requestID,
          cooldownMs: QUOTA_COOLDOWN_MS,
        });

        return Response.json(
          {
            reply: `${localKnowledgeReply(trimmedMessage)}\n\nLive AI is temporarily unavailable, but I can still help with information from our resort guide. 🌊`
          },
          { status: 200 }
        );
      }

      throw error;
    }

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
