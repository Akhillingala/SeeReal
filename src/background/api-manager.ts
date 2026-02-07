/**
 * CReal - API Manager
 * Coordinates AI analysis requests and caching
 */

import { BiasAnalyzer, type BiasResult } from '../lib/analyzers/bias-detector';

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
}
