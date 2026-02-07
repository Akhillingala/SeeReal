/**
 * CReal - Video prompt generator
 * Uses Gemini to turn article context into a short, vivid prompt for a 6–8 second clip.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const PROMPT = `You are writing a single video scene prompt for an AI video generator (e.g. Veo). The video will be very short (under 15 seconds) and must visually summarize the news article in one clear, cinematic moment.

Given the article title and context below, output ONLY one short paragraph (2–4 sentences) that describes:
- The main subject (people, place, or event) and one key action or moment.
- Visual style: e.g. "cinematic", "documentary", "news broadcast style", "dramatic".
- Setting and mood that match the article (e.g. "tense", "hopeful", "busy city", "quiet room").
No meta-commentary. No "the video shows...". Write as a direct scene description for the video model.

Article title: {{TITLE}}

Context/summary: {{CONTEXT}}

Video prompt:`;

export async function generateVideoPrompt(
  apiKey: string,
  title: string,
  context: string
): Promise<string> {
  const truncatedContext = context.slice(0, 2000);
  const prompt = PROMPT.replace('{{TITLE}}', title).replace(
    '{{CONTEXT}}',
    truncatedContext
  );

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
  let lastErr: unknown;

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text()?.trim() ?? '';
      if (text.length > 0) return text;
    } catch (err) {
      lastErr = err;
      if ((err as Error)?.message?.includes('API key not valid')) break;
    }
  }
  console.error('[CReal] Video prompt generation error:', lastErr);
  // Fallback: simple prompt from title
  return `Cinematic, documentary-style short clip about: ${title}. Clear, neutral visual summary.`;
}
