/**
 * CReal - API Manager
 * Coordinates AI analysis requests, caching, and video generation
 */

import { BiasAnalyzer, type BiasResult } from '../lib/analyzers/bias-detector';
import { generateVideoPrompt } from '../lib/video/video-prompt';
import { generateVideo, type VeoGenerateResult } from '../lib/video/veo-client';

const biasAnalyzer = new BiasAnalyzer();

interface AnalysisResult {
  bias: BiasResult;
  cached: boolean;
  timestamp: number;
}

const cache = new Map<string, AnalysisResult>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(url: string, textHash: string): string {
  return `${url}:${textHash}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export class ApiManager {
  async analyzeArticle(payload: { text: string; url?: string }): Promise<AnalysisResult> {
    const { text, url = 'unknown' } = payload;
    const textHash = simpleHash(text.slice(0, 2000));
    const cacheKey = getCacheKey(url, textHash);

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached, cached: true };
    }

    const bias = await biasAnalyzer.analyze(text);
    const result: AnalysisResult = {
      bias,
      cached: false,
      timestamp: Date.now(),
    };

    cache.set(cacheKey, result);
    return result;
  }

  getCachedAnalysis(url: string): AnalysisResult | null {
    for (const [key, value] of cache.entries()) {
      if (key.startsWith(`${url}:`)) {
        return value;
      }
    }
    return null;
  }

  /** Generate a short (<15s) video clip summarizing the article. Uses same Gemini API key. */
  async generateArticleVideo(payload: {
    title: string;
    excerpt: string;
    reasoning: string;
  }): Promise<VeoGenerateResult> {
    const apiKey = await biasAnalyzer.getApiKey();
    if (!apiKey) {
      throw new Error('No API key. Add your Gemini API key in the extension popup.');
    }
    const context = [payload.excerpt, payload.reasoning].filter(Boolean).join('\n\n');
    const prompt = await generateVideoPrompt(apiKey, payload.title, context);
    return generateVideo(apiKey, prompt);
  }
}
