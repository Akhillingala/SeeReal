/**
 * SeeReal - API Manager
 * Coordinates AI analysis requests, persistent storage, and video generation
 */

import { BiasAnalyzer, type BiasResult } from '../lib/analyzers/bias-detector';
import { generateVideoPrompt } from '../lib/video/video-prompt';
import { generateVideo, type VeoGenerateResult } from '../lib/video/veo-client';
import { StorageService } from '../lib/storage/storage-service';
import type { ArticleRecord, DebateRecord } from '../lib/storage/types';


import { GoogleGenerativeAI } from '@google/generative-ai';

const biasAnalyzer = new BiasAnalyzer();
const storageService = new StorageService();

interface AnalysisResult {
  bias: BiasResult;
  cached: boolean;
  timestamp: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class ApiManager {

  async analyzeArticle(payload: { text: string; url?: string; title?: string; author?: string; source?: string }): Promise<AnalysisResult> {
    const { text, url = 'unknown', title = 'Untitled Article', author, source } = payload;

    // Check persistent storage first
    const stored = await storageService.getAnalysis(url);
    if (stored && Date.now() - stored.timestamp < CACHE_TTL_MS) {
      return {
        bias: stored.bias,
        cached: true,
        timestamp: stored.timestamp,
      };
    }

    // Run fresh analysis
    const bias = await biasAnalyzer.analyze(text);
    const timestamp = Date.now();
    const result: AnalysisResult = {
      bias,
      cached: false,
      timestamp,
    };

    // Save to persistent storage
    const record: ArticleRecord = {
      url,
      title,
      author,
      source,
      bias,
      timestamp,
      cached: false,
    };
    await storageService.saveAnalysis(record);

    // Auto-cleanup old analyses (non-blocking)
    storageService.clearOldAnalyses().catch((err) => {
      console.warn('[SeeReal] Failed to clear old analyses:', err);
    });

    return result;
  }

  async getCachedAnalysis(url: string): Promise<AnalysisResult | null> {
    const stored = await storageService.getAnalysis(url);
    if (!stored) return null;

    return {
      bias: stored.bias,
      cached: true,
      timestamp: stored.timestamp,
    };
  }

  async getArticleHistory(): Promise<ArticleRecord[]> {
    return storageService.getAllAnalyses();
  }

  async deleteArticle(url: string): Promise<void> {
    return storageService.deleteAnalysis(url);
  }

  async clearHistory(): Promise<void> {
    return storageService.clearAllAnalyses();
  }

  async getDebateHistory(): Promise<DebateRecord[]> {
    return storageService.getDebateHistory();
  }

  async deleteDebateRecord(id: string): Promise<void> {
    return storageService.deleteDebateRecord(id);
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

  /** Fetch author information including bio, articles, and professional details */
  async fetchAuthorInfo(payload: { authorName: string }): Promise<{ authorInfo: any }> {
    const { authorName } = payload;
    const apiKey = await biasAnalyzer.getApiKey();

    if (!apiKey) {
      throw new Error('No API key. Add your Gemini API key in the extension popup.');
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      // Try models in order of preference
      const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      let rawText = '';
      let lastError: unknown;

      const prompt = `Search for information about the journalist/author "${authorName}". Provide:
1. A brief biography (2-3 sentences)
2. Their occupation/role
3. Age (if publicly available)
4. List of 3-5 notable articles they've written (with titles and URLs if available)
5. Any social media or professional profile links (LinkedIn, Twitter, etc.)
6. A URL to a publicly available profile picture of the author (if found)

Format your response as a JSON object with this structure:
{
  "name": "${authorName}",
  "bio": "brief biography",
  "occupation": "their role/title",
  "age": "age if available, otherwise null",
  "articles": [
    {"title": "article title", "url": "article url", "source": "publication", "date": "publication date"}
  ],
  "socialLinks": [
    {"platform": "platform name", "url": "profile url"}
  ],
  "imageUrl": "url to author image or null"
}

If you cannot find specific information, use null for that field. Only include verified, publicly available information. Return only valid JSON.`;

      for (const modelName of modelNames) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: "application/json"
            }
          });

          const result = await model.generateContent(prompt);
          const response = result.response;
          rawText = response.text();

          if (rawText) break; // Success
        } catch (err) {
          lastError = err;
          console.warn(`[SeeReal] Failed to fetch author info with ${modelName}:`, err);
          // Continue to next model
        }
      }

      if (!rawText) {
        throw lastError || new Error('All models failed to respond');
      }

      // Extract JSON from the response (handle markdown code blocks if any remain)
      let jsonText = rawText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const authorInfo = JSON.parse(jsonText);
      return { authorInfo };

    } catch (error) {
      console.error('[SeeReal] Error fetching author info:', error);
      throw new Error('Failed to fetch author information. Please try again.');
    }
  }
  async fetchRelatedArticles(payload: { title: string; source?: string }): Promise<{ relatedArticles: any[] }> {
    const { title, source } = payload;
    const apiKey = await biasAnalyzer.getApiKey();

    if (!apiKey) {
      throw new Error('No API key. Add your Gemini API key in the extension popup.');
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Use a fast model for this query
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const prompt = `Find 3-5 real, recent news articles that cover the same topic as this article: "${title}"${source ? ` from ${source}` : ''}.
Try to find articles from different sources with varying political perspectives if possible.

Return a JSON object with this structure:
{
  "articles": [
    {
      "title": "Article Title",
      "url": "Article URL",
      "source": "News Source Name",
      "date": "Publication Date (approximate is fine)"
    }
  ]
}

Return ONLY valid JSON. If you cannot find specific articles, return an empty array.`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Clean up potential markdown wrapping
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const data = JSON.parse(jsonText);
      return { relatedArticles: data.articles || [] };

    } catch (error) {
      console.error('[SeeReal] Error fetching related articles:', error);
      // Return empty list instead of throwing to avoid breaking the UI
      return { relatedArticles: [] };
    }
  }

  async generateDebateCards(payload: { text: string; purpose: string; title: string; author?: string; source?: string; date?: string }): Promise<{ cards: any[] }> {
    const { text, purpose, title, author, source, date } = payload;
    const apiKey = await biasAnalyzer.getApiKey();

    if (!apiKey) {
      throw new Error('No API key. Add your Gemini API key in the extension popup.');
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      // Try models in order of preference
      const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      let rawText = '';
      let lastModelError: unknown;

      const prompt = `Act as a competitive policy debate researcher. Generate 2-4 "debate cards" from the following article text that support the following purpose: "${purpose}".

Format Requirements for each card:
1. **Tag**: A single sentence summarizing the argument made by the evidence. Must be punchy and strategic.
2. **Cite**: Use the author "${author || 'Unknown'}", the date "${date || 'n.d.'}", and source "${source || 'Unknown'}". Format as "Author, Date (Source)".
3. **Body**: This MUST be a continuous, EXACT, VERBATIM segment (at least one full paragraph) from the article. DO NOT change a single character, punctuation, or capitalization.
4. **Highlights**: Identify specific phrases or full clauses within the Body that should be emphasized. **CRITICAL**: In high-level debate, highlights must form a coherent, condensed version of the argument that can be spoken aloud. Highlight long, readable phrases and complete sentences rather than isolated single words. Reading ONLY the highlighted words should sound like a natural, persuasive speech.

**CRITICAL**: The "body" will be compared against the original article text for validation. If it is not exact, the card will be rejected.

Article Title: ${title}
Article Text: ${text.slice(0, 15000)}

Return a JSON object with this structure:
{
  "cards": [
    {
      "tag": "Short summary",
      "cite": "Author, Date (Source)",
      "body": "Exact text from article",
      "highlights": ["word1", "phrase two", "word3"]
    }
  ]
}

Only use text from the article. Ensure "body" is an exact match for a segment of the article. Return ONLY valid JSON.`;

      for (const modelName of modelNames) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: "application/json"
            }
          });

          const result = await model.generateContent(prompt);
          rawText = result.response.text();
          if (rawText) break;
        } catch (err) {
          lastModelError = err;
          console.warn(`[SeeReal] Debate card generation failed with ${modelName}:`, err);
        }
      }

      if (!rawText) {
        throw lastModelError || new Error('All models failed to respond');
      }

      // Clean up potential markdown wrapping
      let jsonText = rawText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const data = JSON.parse(jsonText);
      const cards = data.cards || [];

      // Save to history
      if (cards.length > 0) {
        const record: DebateRecord = {
          id: Math.random().toString(36).substring(2, 15),
          url: (payload as any).url || 'unknown', // Need to pass URL from content script
          articleTitle: title,
          purpose: purpose,
          cards: cards,
          timestamp: Date.now(),
        };
        storageService.saveDebateRecord(record).catch(err => {
          console.warn('[SeeReal] Failed to save debate record:', err);
        });
      }

      return { cards };
    } catch (error) {
      console.error('[SeeReal] Error generating debate cards:', error);
      throw new Error('Failed to generate debate cards. Please check your API key and try again.');
    }
  }
}

