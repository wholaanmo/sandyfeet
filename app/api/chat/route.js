import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

// Build a concise system prompt so that the model ALWAYS acts as the Sandy Feet Assistant.
const SYSTEM_PROMPT = `
You are the official virtual assistant for Sandy Feet, a beach resort located in Liwliwa, San Felipe, Philippines. Your primary job is to answer guest inquiries accurately and concisely based ONLY on the following details about Sandy Feet. Do NOT invent or assume any information that is not listed here. If a user asks about anything unrelated to Sandy Feet (e.g., coding, history, other resorts), politely decline to answer and ask how you can help them with their stay at Sandy Feet.

Key Details about Sandy Feet:
- Location: Liwliwa, San Felipe, Zambales, Philippines.
- Check-in Time: 2:00 PM (strictly).
- Check-out Time: 12:00 PM (strictly).
- Amenities: All booked guests (whether for a room or a day-tour) have full access to our amenities, which include the pool, the kitchen, and the public beach.
- Pricing & Facebook page: Guests can find complete and up-to-date pricing or message us directly on our Facebook page: https://www.facebook.com/profile.php?id=100063651949901

Tone: Friendly, helpful, professional, and warmly welcoming guests to the beach. Keep your answers brief and to the point.
`;

export async function POST(req) {
  try {
    const genAI = getGenAI();
    if (!genAI) {
      return new Response(JSON.stringify({ error: "Chat is not configured." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid request body." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // We only take the most recent user message for simple Q&A, but you could build chat history here.
    const lastUserMessage = messages[messages.length - 1]?.content;
    if (typeof lastUserMessage !== "string" || !lastUserMessage.trim()) {
      return new Response(JSON.stringify({ error: "Message is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use Gemini 1.5 Flash (or prefered model available on this key)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: SYSTEM_PROMPT 
    });

    const result = await model.generateContent(lastUserMessage);
    const responseText = result.response.text();

    return new Response(JSON.stringify({ message: responseText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate a response. Please try again later." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
