import { config } from 'dotenv';
import OpenAI from 'openai';

config({ path: '.env' });

async function testDeepSeek() {
  console.log('\\n--- Testing DeepSeek ---');
  try {
    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: 'Say hello' }],
      model: 'deepseek-chat',
      stream: false,
    });
    console.log('DeepSeek Success:', completion.choices[0].message.content);
  } catch (err) {
    console.log('DeepSeek Error:', err.status, err.error?.message || err.message);
  }
}

async function testOpenAI() {
  console.log('\\n--- Testing OpenAI ---');
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // First try standard chat completions just in case
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    console.log('OpenAI Success (chat completions):', completion.choices[0].message.content);
  } catch (err) {
    console.log('OpenAI Error (chat completions):', err.status, err.error?.message || err.message);
    try {
      console.log('Trying openai.responses.create (gpt-5.5)...');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.responses.create({
        model: "gpt-5.5",
        input: "Say hello",
      });
      console.log('OpenAI Success (responses):', response.output_text);
    } catch (err2) {
      console.log('OpenAI Error (responses):', err2.status, err2.error?.message || err2.message);
    }
  }
}

async function testGemini() {
  console.log('\\n--- Testing Gemini ---');
  try {
    const key = process.env.GEMINI_API_KEY;
    const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${key}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello' }] }] }),
    });
    const data = await response.json();
    if (response.ok) {
      console.log('Gemini Success:', data.candidates[0].content.parts[0].text);
    } else {
      console.log('Gemini Error:', response.status, data.error?.message || data);
    }
  } catch (err) {
    console.log('Gemini Request Failed:', err.message);
  }
}

async function run() {
  await testDeepSeek();
  await testOpenAI();
  await testGemini();
}

run();
