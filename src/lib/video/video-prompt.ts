/**
 * SeeReal - Video prompt generator
 * Uses Gemini to turn article context into a prompt for a 10-second infographic/news-cartoon explainer.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const PROMPT = `You are writing a video prompt for an AI video generator (e.g. Veo). The video will be 8 seconds long and must work like an INFORMATIONAL INFOGRAPHIC or NEWS CARTOON with NARRATION: it should EXPLAIN what is going on in the article—the context, what is actually happening, and why it is happening—in both visuals and spoken words.

Your output will be used directly as the video model prompt. Output ONLY the prompt—no intro, no "the video shows", no meta-commentary.

Requirements for the prompt you write:
- Style: animated infographic, editorial cartoon, or news explainer. Think bold shapes, simplified figures, clear symbolism, possibly on-screen text or labels. Not photorealistic—more illustrated, graphic, or cartoon-like.
- Content: make it obvious WHAT the story is about—who, what, where, why. One clear idea or contrast (e.g. two sides, cause and effect, before/after). The viewer should understand the gist from both visuals and audio.
- VOCALS / NARRATION (required): Include a clear voiceover or narrator in the prompt. The narration must state: (1) the context of the news story, (2) what is actually happening, and (3) why it is happening. Write the exact words the narrator should say, in quotes, so the model can generate matching speech. Example: "A calm narrator says: 'Local officials announced the new policy today. The change comes after months of debate. Supporters say it will cut costs; critics argue it hurts families.'" Weave the real facts from the article into the spoken script.
- Describe a single 8-second scene: visuals (infographic/cartoon sequence) plus the narrator's lines. Combine scene description and quoted narration in one prompt.

Article title: {{TITLE}}

Context/summary: {{CONTEXT}}

Video prompt (one paragraph: visual description + quoted narration that explains context, what's happening, and why):`;

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
  console.error('[SeeReal] Video prompt generation error:', lastErr);
  // Fallback: infographic-style prompt with narration from title
  return `Animated infographic, editorial cartoon style, 8 seconds. A narrator explains the story: context, what is happening, and why. Visuals show key facts. Narration in a calm news-explainer tone: "This story is about ${title.replace(/"/g, '')}. Here is what is going on and why it matters."`;
}
