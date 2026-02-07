/**
 * SeeReal - Bias Detector
 * Uses Gemini Flash for political bias analysis
 * API key: from popup (chrome.storage.local) or .env.local at build time
 */

declare const __GEMINI_API_KEY_FROM_ENV__: string | undefined;

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface BiasResult {
  left_right: number;
  auth_lib: number;
  nat_glob: number;
  objectivity: number;
  sensationalism: number;
  clarity: number;
  tone_calm_urgent: number;
  confidence: number;
  reasoning: string;
}

const PROMPT = `Analyze this article and return metrics people care about. Return ONLY valid JSON with these exact keys (no markdown, no code blocks):
{
  "left_right": number (-100 = far left, 0 = center, 100 = far right),
  "auth_lib": number (-100 = authoritarian, 0 = balanced, 100 = libertarian),
  "nat_glob": number (-100 = nationalist, 0 = balanced, 100 = globalist),
  "objectivity": number (0 = very opinionated, 100 = very factual and neutral),
  "sensationalism": number (0 = dry/restrained, 100 = highly sensational/clickbait),
  "clarity": number (0 = confusing or opaque, 100 = very clear and well-structured),
  "tone_calm_urgent": number (-100 = very calm/measured, 100 = very urgent/alarming),
  "confidence": number (0-100, how confident you are in this analysis),
  "reasoning": string (concise, punchy summary; max 2 sentences)
}

Article text:
`;

export class BiasAnalyzer {
  private genAI: GoogleGenerativeAI | null = null;

  /** Used by ApiManager for video generation; same key as bias analysis. */
  async getApiKey(): Promise<string | null> {
    try {
      const stored = await chrome.storage.local.get('geminiApiKey');
      const fromStorage = stored.geminiApiKey;
      if (fromStorage && typeof fromStorage === 'string') return fromStorage;
      // Fallback: key from .env.local at build time (run: GEMINI_API_KEY=xxx npm run build)
      const fromEnv = typeof __GEMINI_API_KEY_FROM_ENV__ !== 'undefined' ? __GEMINI_API_KEY_FROM_ENV__ : '';
      return fromEnv?.trim() || null;
    } catch {
      return null;
    }
  }

  async analyze(text: string): Promise<BiasResult> {
    const truncated = text.slice(0, 15000);
    const prompt = PROMPT + truncated;

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return this.getFallbackResult();
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Try current models (1.5-flash is deprecated)
    const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let lastErr: unknown;
    for (const modelName of modelNames) {
      try {
        const model = this.genAI!.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const rawText = response.text();

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : rawText;
        const parsed = JSON.parse(jsonStr) as BiasResult;

        return {
          left_right: this.clamp(parsed.left_right ?? 0, -100, 100),
          auth_lib: this.clamp(parsed.auth_lib ?? 0, -100, 100),
          nat_glob: this.clamp(parsed.nat_glob ?? 0, -100, 100),
          objectivity: this.clamp(parsed.objectivity ?? 50, 0, 100),
          sensationalism: this.clamp(parsed.sensationalism ?? 50, 0, 100),
          clarity: this.clamp(parsed.clarity ?? 50, 0, 100),
          tone_calm_urgent: this.clamp(parsed.tone_calm_urgent ?? 0, -100, 100),
          confidence: this.clamp(parsed.confidence ?? 50, 0, 100),
          reasoning: String(parsed.reasoning ?? 'Analysis unavailable'),
        };
      } catch (err) {
        lastErr = err;
        if ((err as Error)?.message?.includes('API key not valid')) break; // Don't retry with bad key
      }
    }
    console.error('[SeeReal] Bias analysis error:', lastErr);
    return this.getFallbackResult();
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number(n) || 0));
  }

  private getFallbackResult(): BiasResult {
    return {
      left_right: 0,
      auth_lib: 0,
      nat_glob: 0,
      objectivity: 50,
      sensationalism: 50,
      clarity: 50,
      tone_calm_urgent: 0,
      confidence: 0,
      reasoning: 'AI analysis unavailable. Add GEMINI_API_KEY to enable.',
    };
  }
}
