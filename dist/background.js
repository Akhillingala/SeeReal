/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/background/api-manager.ts"
/*!***************************************!*\
  !*** ./src/background/api-manager.ts ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ApiManager: () => (/* binding */ ApiManager)
/* harmony export */ });
/* harmony import */ var _lib_analyzers_bias_detector__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../lib/analyzers/bias-detector */ "./src/lib/analyzers/bias-detector.ts");
/* harmony import */ var _lib_video_video_prompt__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../lib/video/video-prompt */ "./src/lib/video/video-prompt.ts");
/* harmony import */ var _lib_video_veo_client__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../lib/video/veo-client */ "./src/lib/video/veo-client.ts");
/* harmony import */ var _lib_storage_storage_service__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../lib/storage/storage-service */ "./src/lib/storage/storage-service.ts");
/* harmony import */ var _google_generative_ai__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @google/generative-ai */ "./node_modules/@google/generative-ai/dist/index.mjs");
/**
 * SeeReal - API Manager
 * Coordinates AI analysis requests, persistent storage, and video generation
 */





const biasAnalyzer = new _lib_analyzers_bias_detector__WEBPACK_IMPORTED_MODULE_0__.BiasAnalyzer();
const storageService = new _lib_storage_storage_service__WEBPACK_IMPORTED_MODULE_3__.StorageService();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
class ApiManager {
    async analyzeArticle(payload) {
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
        const result = {
            bias,
            cached: false,
            timestamp,
        };
        // Save to persistent storage
        const record = {
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
    async getCachedAnalysis(url) {
        const stored = await storageService.getAnalysis(url);
        if (!stored)
            return null;
        return {
            bias: stored.bias,
            cached: true,
            timestamp: stored.timestamp,
        };
    }
    async getArticleHistory() {
        return storageService.getAllAnalyses();
    }
    async deleteArticle(url) {
        return storageService.deleteAnalysis(url);
    }
    async clearHistory() {
        return storageService.clearAllAnalyses();
    }
    async getDebateHistory() {
        return storageService.getDebateHistory();
    }
    async deleteDebateRecord(id) {
        return storageService.deleteDebateRecord(id);
    }
    /** Generate a short (<15s) video clip summarizing the article. Uses same Gemini API key. */
    async generateArticleVideo(payload) {
        const apiKey = await biasAnalyzer.getApiKey();
        if (!apiKey) {
            throw new Error('No API key. Add your Gemini API key in the extension popup.');
        }
        const context = [payload.excerpt, payload.reasoning].filter(Boolean).join('\n\n');
        const prompt = await (0,_lib_video_video_prompt__WEBPACK_IMPORTED_MODULE_1__.generateVideoPrompt)(apiKey, payload.title, context);
        return (0,_lib_video_veo_client__WEBPACK_IMPORTED_MODULE_2__.generateVideo)(apiKey, prompt);
    }
    /** Fetch author information including bio, articles, and professional details */
    async fetchAuthorInfo(payload) {
        const { authorName } = payload;
        const apiKey = await biasAnalyzer.getApiKey();
        if (!apiKey) {
            throw new Error('No API key. Add your Gemini API key in the extension popup.');
        }
        try {
            const genAI = new _google_generative_ai__WEBPACK_IMPORTED_MODULE_4__.GoogleGenerativeAI(apiKey);
            // Try models in order of preference
            const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash'];
            let rawText = '';
            let lastError;
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
                    if (rawText)
                        break; // Success
                }
                catch (err) {
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
            }
            else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            const authorInfo = JSON.parse(jsonText);
            return { authorInfo };
        }
        catch (error) {
            console.error('[SeeReal] Error fetching author info:', error);
            throw new Error('Failed to fetch author information. Please try again.');
        }
    }
    async fetchRelatedArticles(payload) {
        const { title, source } = payload;
        const apiKey = await biasAnalyzer.getApiKey();
        if (!apiKey) {
            throw new Error('No API key. Add your Gemini API key in the extension popup.');
        }
        try {
            const genAI = new _google_generative_ai__WEBPACK_IMPORTED_MODULE_4__.GoogleGenerativeAI(apiKey);
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
            }
            else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            const data = JSON.parse(jsonText);
            return { relatedArticles: data.articles || [] };
        }
        catch (error) {
            console.error('[SeeReal] Error fetching related articles:', error);
            // Return empty list instead of throwing to avoid breaking the UI
            return { relatedArticles: [] };
        }
    }
    async generateDebateCards(payload) {
        const { text, purpose, title, author, source, date } = payload;
        const apiKey = await biasAnalyzer.getApiKey();
        if (!apiKey) {
            throw new Error('No API key. Add your Gemini API key in the extension popup.');
        }
        try {
            const genAI = new _google_generative_ai__WEBPACK_IMPORTED_MODULE_4__.GoogleGenerativeAI(apiKey);
            // Try models in order of preference
            const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash'];
            let rawText = '';
            let lastModelError;
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
                    if (rawText)
                        break;
                }
                catch (err) {
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
            }
            else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            const data = JSON.parse(jsonText);
            const cards = data.cards || [];
            // Save to history
            if (cards.length > 0) {
                const record = {
                    id: Math.random().toString(36).substring(2, 15),
                    url: payload.url || 'unknown', // Need to pass URL from content script
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
        }
        catch (error) {
            console.error('[SeeReal] Error generating debate cards:', error);
            throw new Error('Failed to generate debate cards. Please check your API key and try again.');
        }
    }
}


/***/ },

/***/ "./src/lib/analyzers/bias-detector.ts"
/*!********************************************!*\
  !*** ./src/lib/analyzers/bias-detector.ts ***!
  \********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BiasAnalyzer: () => (/* binding */ BiasAnalyzer)
/* harmony export */ });
/* harmony import */ var _google_generative_ai__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @google/generative-ai */ "./node_modules/@google/generative-ai/dist/index.mjs");
/**
 * SeeReal - Bias Detector
 * Uses Gemini Flash for political bias analysis
 * API key: from popup (chrome.storage.local) or .env.local at build time
 */

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
class BiasAnalyzer {
    constructor() {
        this.genAI = null;
    }
    /** Used by ApiManager for video generation; same key as bias analysis. */
    async getApiKey() {
        try {
            const stored = await chrome.storage.local.get('geminiApiKey');
            const fromStorage = stored.geminiApiKey;
            if (fromStorage && typeof fromStorage === 'string')
                return fromStorage;
            // Fallback: key from .env.local at build time (run: GEMINI_API_KEY=xxx npm run build)
            const fromEnv =  true ? "AIzaSyDUfRGLABe4vRea9CHg6icJLegvMKqn1sM" : 0;
            return fromEnv?.trim() || null;
        }
        catch {
            return null;
        }
    }
    async analyze(text) {
        const truncated = text.slice(0, 15000);
        const prompt = PROMPT + truncated;
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            return this.getFallbackResult();
        }
        this.genAI = new _google_generative_ai__WEBPACK_IMPORTED_MODULE_0__.GoogleGenerativeAI(apiKey);
        // Try current models (1.5-flash is deprecated)
        const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
        let lastErr;
        for (const modelName of modelNames) {
            try {
                const model = this.genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = result.response;
                const rawText = response.text();
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : rawText;
                const parsed = JSON.parse(jsonStr);
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
            }
            catch (err) {
                lastErr = err;
                if (err?.message?.includes('API key not valid'))
                    break; // Don't retry with bad key
            }
        }
        console.error('[SeeReal] Bias analysis error:', lastErr);
        return this.getFallbackResult();
    }
    clamp(n, min, max) {
        return Math.max(min, Math.min(max, Number(n) || 0));
    }
    getFallbackResult() {
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


/***/ },

/***/ "./src/lib/storage/storage-service.ts"
/*!********************************************!*\
  !*** ./src/lib/storage/storage-service.ts ***!
  \********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   StorageService: () => (/* binding */ StorageService)
/* harmony export */ });
/**
 * SeeReal - Storage Service
 * Handles persistent storage of article analyses using Chrome Storage API
 */
const STORAGE_KEY = 'seereal_article_history';
const STORAGE_VERSION = 1;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
class StorageService {
    /**
     * Save an article analysis to persistent storage
     */
    async saveAnalysis(record) {
        try {
            const data = await this.getStorageData();
            data.articles[record.url] = record;
            await this.setStorageData(data);
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to save analysis:', error);
            throw error;
        }
    }
    /**
     * Retrieve an article analysis by URL
     */
    async getAnalysis(url) {
        try {
            const data = await this.getStorageData();
            return data.articles[url] || null;
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to get analysis:', error);
            return null;
        }
    }
    /**
     * Get all stored analyses, sorted by timestamp (newest first)
     */
    async getAllAnalyses() {
        try {
            const data = await this.getStorageData();
            return Object.values(data.articles).sort((a, b) => b.timestamp - a.timestamp);
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to get all analyses:', error);
            return [];
        }
    }
    /**
     * Get lightweight metadata for all articles (for list views)
     */
    async getAllMetadata() {
        try {
            const analyses = await this.getAllAnalyses();
            return analyses.map((record) => ({
                url: record.url,
                title: record.title,
                author: record.author,
                source: record.source,
                timestamp: record.timestamp,
                leftRight: record.bias.left_right,
                objectivity: record.bias.objectivity,
                confidence: record.bias.confidence,
            }));
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to get metadata:', error);
            return [];
        }
    }
    /**
     * Delete a specific article analysis
     */
    async deleteAnalysis(url) {
        try {
            const data = await this.getStorageData();
            delete data.articles[url];
            await this.setStorageData(data);
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to delete analysis:', error);
            throw error;
        }
    }
    /**
     * Clear all stored analyses
     */
    async clearAllAnalyses() {
        try {
            const data = await this.getStorageData();
            data.articles = {};
            await this.setStorageData(data);
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to clear analyses:', error);
            throw error;
        }
    }
    /**
     * Save a debate card generation record
     */
    async saveDebateRecord(record) {
        try {
            const data = await this.getStorageData();
            data.debateHistory.unshift(record);
            // Keep only last 50 generations to save space
            if (data.debateHistory.length > 50) {
                data.debateHistory = data.debateHistory.slice(0, 50);
            }
            await this.setStorageData(data);
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to save debate record:', error);
            throw error;
        }
    }
    /**
     * Get all debate records
     */
    async getDebateHistory() {
        try {
            const data = await this.getStorageData();
            return data.debateHistory || [];
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to get debate history:', error);
            return [];
        }
    }
    /**
     * Delete a debate record by ID
     */
    async deleteDebateRecord(id) {
        try {
            const data = await this.getStorageData();
            data.debateHistory = data.debateHistory.filter(r => r.id !== id);
            await this.setStorageData(data);
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to delete debate record:', error);
            throw error;
        }
    }
    /**
     * Remove analyses older than MAX_AGE_MS
     */
    async clearOldAnalyses() {
        try {
            const data = await this.getStorageData();
            const cutoffTime = Date.now() - MAX_AGE_MS;
            let removedCount = 0;
            for (const [url, record] of Object.entries(data.articles)) {
                if (record.timestamp < cutoffTime) {
                    delete data.articles[url];
                    removedCount++;
                }
            }
            if (removedCount > 0) {
                await this.setStorageData(data);
            }
            return removedCount;
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to clear old analyses:', error);
            return 0;
        }
    }
    /**
     * Get storage statistics
     */
    async getStats() {
        try {
            const data = await this.getStorageData();
            const articles = Object.values(data.articles);
            const timestamps = [...articles.map((a) => a.timestamp), ...data.debateHistory.map(d => d.timestamp)];
            return {
                count: articles.length,
                oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
                newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : null,
                estimatedSizeBytes: JSON.stringify(data).length,
                debateCount: data.debateHistory.length,
            };
        }
        catch (error) {
            console.error('[SeeReal Storage] Failed to get stats:', error);
            return {
                count: 0,
                oldestTimestamp: null,
                newestTimestamp: null,
                estimatedSizeBytes: 0,
                debateCount: 0,
            };
        }
    }
    /**
     * Get storage data from Chrome Storage API
     */
    async getStorageData() {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const stored = result[STORAGE_KEY];
        if (!stored || stored.version !== STORAGE_VERSION) {
            // Initialize or migrate storage
            return {
                articles: {},
                debateHistory: [],
                version: STORAGE_VERSION,
            };
        }
        // Ensure debateHistory exists (migration for existing users)
        if (!stored.debateHistory) {
            stored.debateHistory = [];
        }
        return stored;
    }
    /**
     * Save storage data to Chrome Storage API
     */
    async setStorageData(data) {
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
    }
}


/***/ },

/***/ "./src/lib/video/veo-client.ts"
/*!*************************************!*\
  !*** ./src/lib/video/veo-client.ts ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   generateVideo: () => (/* binding */ generateVideo),
/* harmony export */   getVideoUri: () => (/* binding */ getVideoUri)
/* harmony export */ });
/**
 * SeeReal - Veo video generation client (REST)
 * Generates short (<15s) clips via Google Veo 3.1 using the Gemini API.
 * Uses 8-second duration for an infographic/news-cartoon style explainer.
 */
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-generate-preview';
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_ATTEMPTS = 30; // ~4 minutes max
function authHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
    };
}
/**
 * Start a long-running video generation job. Returns operation name.
 */
async function startGeneration(apiKey, prompt) {
    const url = `${BASE_URL}/models/${MODEL}:predictLongRunning`;
    const body = {
        instances: [{ prompt }],
        parameters: {
            durationSeconds: 8,
            aspectRatio: '16:9',
            resolution: '720p',
        },
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Veo start failed: ${res.status} ${errText}`);
    }
    const data = (await res.json());
    const name = data?.name;
    if (!name || typeof name !== 'string') {
        throw new Error('Veo start: missing operation name in response');
    }
    return name;
}
/**
 * Poll operation until done. Returns the raw operation response when done.
 */
async function pollOperation(apiKey, operationName) {
    const url = operationName.startsWith('http')
        ? operationName
        : `${BASE_URL}/${operationName}`;
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        const res = await fetch(url, {
            method: 'GET',
            headers: authHeaders(apiKey),
        });
        if (!res.ok) {
            throw new Error(`Veo poll failed: ${res.status} ${await res.text()}`);
        }
        const data = (await res.json());
        if (data.error?.message) {
            throw new Error(`Veo error: ${data.error.message}`);
        }
        if (data.done) {
            return data.response ?? {};
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error('Veo generation timed out');
}
/**
 * Extract video URI from operation response.
 * Uses a recursive search to find any property that looks like a video URI.
 */
function getVideoUri(response) {
    if (!response || typeof response !== 'object')
        return null;
    // Debug: Log the full response structure
    console.log('[SeeReal Veo] Full response:', JSON.stringify(response, null, 2));
    // Helper: check if a value is a valid video URI
    const isVideoUri = (val) => {
        if (typeof val !== 'string')
            return false;
        return val.startsWith('https://') && (val.includes('.mp4') ||
            val.includes('googlevideo.com') ||
            val.includes('generativelanguage.googleapis.com'));
    };
    // Helper: recursive search
    const findUri = (obj, depth = 0) => {
        if (depth > 5 || !obj || typeof obj !== 'object')
            return null;
        // 1. Check current object for direct URI candidate
        if ('uri' in obj && isVideoUri(obj.uri)) {
            return obj.uri;
        }
        if ('videoUri' in obj && isVideoUri(obj.videoUri)) {
            return obj.videoUri;
        }
        // 2. Check if this object IS the video object (has uri property but maybe not strictly valid check yet?)
        // Let's rely on strict check above first.
        // 3. Iterate keys
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            // If array, search elements
            if (Array.isArray(val)) {
                for (const item of val) {
                    const found = findUri(item, depth + 1);
                    if (found)
                        return found;
                }
            }
            // If object, search recursively
            else if (typeof val === 'object') {
                const found = findUri(val, depth + 1);
                if (found)
                    return found;
            }
        }
        return null;
    };
    // Special case: check top-level known paths first for speed/correctness
    // Path 1: generateVideoResponse.generatedSamples[0].video.uri
    const gen = response.generateVideoResponse;
    if (gen?.generatedSamples?.[0]?.video?.uri)
        return gen.generatedSamples[0].video.uri;
    if (gen?.generated_samples?.[0]?.video?.uri)
        return gen.generated_samples[0].video.uri;
    // Path 2: generatedVideos[0].video.uri
    const genVideos = response.generatedVideos;
    if (genVideos?.[0]?.video?.uri)
        return genVideos[0].video.uri;
    // Path 3: videos[0].uri
    const videos = response.videos;
    if (videos?.[0]?.uri)
        return videos[0].uri;
    // Fallback: Deep recursive search
    console.log('[SeeReal Veo] Standard paths failed. Starting deep recursive search...');
    return findUri(response);
}
/**
 * Download video from URI (with API key for auth) and return as base64.
 */
async function downloadVideo(apiKey, uri) {
    const res = await fetch(uri, {
        headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) {
        throw new Error(`Veo download failed: ${res.status}`);
    }
    const blob = await res.blob();
    const mimeType = blob.type || 'video/mp4';
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(bytes).toString('base64');
    return { base64, mimeType };
}
/**
 * Generate an 8-second infographic-style video from a text prompt. Returns base64-encoded video.
 */
async function generateVideo(apiKey, prompt) {
    const operationName = await startGeneration(apiKey, prompt);
    const response = await pollOperation(apiKey, operationName);
    const uri = getVideoUri(response);
    if (!uri) {
        const keys = response && typeof response === 'object' ? Object.keys(response).join(', ') : 'empty';
        throw new Error(`Veo response missing video URI. Response keys: ${keys || '(none)'}`);
    }
    // gs:// URIs require GCS auth; only https is supported for direct fetch
    if (uri.startsWith('gs://')) {
        throw new Error('Veo returned a Cloud Storage URI (gs://). This extension only supports direct download URLs. Try using Google AI Studio / Gemini API with a key that returns https URLs, or use Vertex AI with a GCS bucket and download the file separately.');
    }
    const { base64, mimeType } = await downloadVideo(apiKey, uri);
    return { videoBase64: base64, mimeType };
}


/***/ },

/***/ "./src/lib/video/video-prompt.ts"
/*!***************************************!*\
  !*** ./src/lib/video/video-prompt.ts ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   generateVideoPrompt: () => (/* binding */ generateVideoPrompt)
/* harmony export */ });
/* harmony import */ var _google_generative_ai__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @google/generative-ai */ "./node_modules/@google/generative-ai/dist/index.mjs");
/**
 * SeeReal - Video prompt generator
 * Uses Gemini to turn article context into a prompt for a 10-second infographic/news-cartoon explainer.
 */

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
async function generateVideoPrompt(apiKey, title, context) {
    const truncatedContext = context.slice(0, 2000);
    const prompt = PROMPT.replace('{{TITLE}}', title).replace('{{CONTEXT}}', truncatedContext);
    const genAI = new _google_generative_ai__WEBPACK_IMPORTED_MODULE_0__.GoogleGenerativeAI(apiKey);
    const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let lastErr;
    for (const modelName of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text()?.trim() ?? '';
            if (text.length > 0)
                return text;
        }
        catch (err) {
            lastErr = err;
            if (err?.message?.includes('API key not valid'))
                break;
        }
    }
    console.error('[SeeReal] Video prompt generation error:', lastErr);
    // Fallback: infographic-style prompt with narration from title
    return `Animated infographic, editorial cartoon style, 8 seconds. A narrator explains the story: context, what is happening, and why. Visuals show key facts. Narration in a calm news-explainer tone: "This story is about ${title.replace(/"/g, '')}. Here is what is going on and why it matters."`;
}


/***/ },

/***/ "./node_modules/@google/generative-ai/dist/index.mjs"
/*!***********************************************************!*\
  !*** ./node_modules/@google/generative-ai/dist/index.mjs ***!
  \***********************************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BlockReason: () => (/* binding */ BlockReason),
/* harmony export */   ChatSession: () => (/* binding */ ChatSession),
/* harmony export */   DynamicRetrievalMode: () => (/* binding */ DynamicRetrievalMode),
/* harmony export */   ExecutableCodeLanguage: () => (/* binding */ ExecutableCodeLanguage),
/* harmony export */   FinishReason: () => (/* binding */ FinishReason),
/* harmony export */   FunctionCallingMode: () => (/* binding */ FunctionCallingMode),
/* harmony export */   GenerativeModel: () => (/* binding */ GenerativeModel),
/* harmony export */   GoogleGenerativeAI: () => (/* binding */ GoogleGenerativeAI),
/* harmony export */   GoogleGenerativeAIError: () => (/* binding */ GoogleGenerativeAIError),
/* harmony export */   GoogleGenerativeAIFetchError: () => (/* binding */ GoogleGenerativeAIFetchError),
/* harmony export */   GoogleGenerativeAIRequestInputError: () => (/* binding */ GoogleGenerativeAIRequestInputError),
/* harmony export */   GoogleGenerativeAIResponseError: () => (/* binding */ GoogleGenerativeAIResponseError),
/* harmony export */   HarmBlockThreshold: () => (/* binding */ HarmBlockThreshold),
/* harmony export */   HarmCategory: () => (/* binding */ HarmCategory),
/* harmony export */   HarmProbability: () => (/* binding */ HarmProbability),
/* harmony export */   Outcome: () => (/* binding */ Outcome),
/* harmony export */   POSSIBLE_ROLES: () => (/* binding */ POSSIBLE_ROLES),
/* harmony export */   SchemaType: () => (/* binding */ SchemaType),
/* harmony export */   TaskType: () => (/* binding */ TaskType)
/* harmony export */ });
/**
 * Contains the list of OpenAPI data types
 * as defined by https://swagger.io/docs/specification/data-models/data-types/
 * @public
 */
var SchemaType;
(function (SchemaType) {
    /** String type. */
    SchemaType["STRING"] = "string";
    /** Number type. */
    SchemaType["NUMBER"] = "number";
    /** Integer type. */
    SchemaType["INTEGER"] = "integer";
    /** Boolean type. */
    SchemaType["BOOLEAN"] = "boolean";
    /** Array type. */
    SchemaType["ARRAY"] = "array";
    /** Object type. */
    SchemaType["OBJECT"] = "object";
})(SchemaType || (SchemaType = {}));

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @public
 */
var ExecutableCodeLanguage;
(function (ExecutableCodeLanguage) {
    ExecutableCodeLanguage["LANGUAGE_UNSPECIFIED"] = "language_unspecified";
    ExecutableCodeLanguage["PYTHON"] = "python";
})(ExecutableCodeLanguage || (ExecutableCodeLanguage = {}));
/**
 * Possible outcomes of code execution.
 * @public
 */
var Outcome;
(function (Outcome) {
    /**
     * Unspecified status. This value should not be used.
     */
    Outcome["OUTCOME_UNSPECIFIED"] = "outcome_unspecified";
    /**
     * Code execution completed successfully.
     */
    Outcome["OUTCOME_OK"] = "outcome_ok";
    /**
     * Code execution finished but with a failure. `stderr` should contain the
     * reason.
     */
    Outcome["OUTCOME_FAILED"] = "outcome_failed";
    /**
     * Code execution ran for too long, and was cancelled. There may or may not
     * be a partial output present.
     */
    Outcome["OUTCOME_DEADLINE_EXCEEDED"] = "outcome_deadline_exceeded";
})(Outcome || (Outcome = {}));

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Possible roles.
 * @public
 */
const POSSIBLE_ROLES = ["user", "model", "function", "system"];
/**
 * Harm categories that would cause prompts or candidates to be blocked.
 * @public
 */
var HarmCategory;
(function (HarmCategory) {
    HarmCategory["HARM_CATEGORY_UNSPECIFIED"] = "HARM_CATEGORY_UNSPECIFIED";
    HarmCategory["HARM_CATEGORY_HATE_SPEECH"] = "HARM_CATEGORY_HATE_SPEECH";
    HarmCategory["HARM_CATEGORY_SEXUALLY_EXPLICIT"] = "HARM_CATEGORY_SEXUALLY_EXPLICIT";
    HarmCategory["HARM_CATEGORY_HARASSMENT"] = "HARM_CATEGORY_HARASSMENT";
    HarmCategory["HARM_CATEGORY_DANGEROUS_CONTENT"] = "HARM_CATEGORY_DANGEROUS_CONTENT";
})(HarmCategory || (HarmCategory = {}));
/**
 * Threshold above which a prompt or candidate will be blocked.
 * @public
 */
var HarmBlockThreshold;
(function (HarmBlockThreshold) {
    // Threshold is unspecified.
    HarmBlockThreshold["HARM_BLOCK_THRESHOLD_UNSPECIFIED"] = "HARM_BLOCK_THRESHOLD_UNSPECIFIED";
    // Content with NEGLIGIBLE will be allowed.
    HarmBlockThreshold["BLOCK_LOW_AND_ABOVE"] = "BLOCK_LOW_AND_ABOVE";
    // Content with NEGLIGIBLE and LOW will be allowed.
    HarmBlockThreshold["BLOCK_MEDIUM_AND_ABOVE"] = "BLOCK_MEDIUM_AND_ABOVE";
    // Content with NEGLIGIBLE, LOW, and MEDIUM will be allowed.
    HarmBlockThreshold["BLOCK_ONLY_HIGH"] = "BLOCK_ONLY_HIGH";
    // All content will be allowed.
    HarmBlockThreshold["BLOCK_NONE"] = "BLOCK_NONE";
})(HarmBlockThreshold || (HarmBlockThreshold = {}));
/**
 * Probability that a prompt or candidate matches a harm category.
 * @public
 */
var HarmProbability;
(function (HarmProbability) {
    // Probability is unspecified.
    HarmProbability["HARM_PROBABILITY_UNSPECIFIED"] = "HARM_PROBABILITY_UNSPECIFIED";
    // Content has a negligible chance of being unsafe.
    HarmProbability["NEGLIGIBLE"] = "NEGLIGIBLE";
    // Content has a low chance of being unsafe.
    HarmProbability["LOW"] = "LOW";
    // Content has a medium chance of being unsafe.
    HarmProbability["MEDIUM"] = "MEDIUM";
    // Content has a high chance of being unsafe.
    HarmProbability["HIGH"] = "HIGH";
})(HarmProbability || (HarmProbability = {}));
/**
 * Reason that a prompt was blocked.
 * @public
 */
var BlockReason;
(function (BlockReason) {
    // A blocked reason was not specified.
    BlockReason["BLOCKED_REASON_UNSPECIFIED"] = "BLOCKED_REASON_UNSPECIFIED";
    // Content was blocked by safety settings.
    BlockReason["SAFETY"] = "SAFETY";
    // Content was blocked, but the reason is uncategorized.
    BlockReason["OTHER"] = "OTHER";
})(BlockReason || (BlockReason = {}));
/**
 * Reason that a candidate finished.
 * @public
 */
var FinishReason;
(function (FinishReason) {
    // Default value. This value is unused.
    FinishReason["FINISH_REASON_UNSPECIFIED"] = "FINISH_REASON_UNSPECIFIED";
    // Natural stop point of the model or provided stop sequence.
    FinishReason["STOP"] = "STOP";
    // The maximum number of tokens as specified in the request was reached.
    FinishReason["MAX_TOKENS"] = "MAX_TOKENS";
    // The candidate content was flagged for safety reasons.
    FinishReason["SAFETY"] = "SAFETY";
    // The candidate content was flagged for recitation reasons.
    FinishReason["RECITATION"] = "RECITATION";
    // The candidate content was flagged for using an unsupported language.
    FinishReason["LANGUAGE"] = "LANGUAGE";
    // Unknown reason.
    FinishReason["OTHER"] = "OTHER";
})(FinishReason || (FinishReason = {}));
/**
 * Task type for embedding content.
 * @public
 */
var TaskType;
(function (TaskType) {
    TaskType["TASK_TYPE_UNSPECIFIED"] = "TASK_TYPE_UNSPECIFIED";
    TaskType["RETRIEVAL_QUERY"] = "RETRIEVAL_QUERY";
    TaskType["RETRIEVAL_DOCUMENT"] = "RETRIEVAL_DOCUMENT";
    TaskType["SEMANTIC_SIMILARITY"] = "SEMANTIC_SIMILARITY";
    TaskType["CLASSIFICATION"] = "CLASSIFICATION";
    TaskType["CLUSTERING"] = "CLUSTERING";
})(TaskType || (TaskType = {}));
/**
 * @public
 */
var FunctionCallingMode;
(function (FunctionCallingMode) {
    // Unspecified function calling mode. This value should not be used.
    FunctionCallingMode["MODE_UNSPECIFIED"] = "MODE_UNSPECIFIED";
    // Default model behavior, model decides to predict either a function call
    // or a natural language repspose.
    FunctionCallingMode["AUTO"] = "AUTO";
    // Model is constrained to always predicting a function call only.
    // If "allowed_function_names" are set, the predicted function call will be
    // limited to any one of "allowed_function_names", else the predicted
    // function call will be any one of the provided "function_declarations".
    FunctionCallingMode["ANY"] = "ANY";
    // Model will not predict any function call. Model behavior is same as when
    // not passing any function declarations.
    FunctionCallingMode["NONE"] = "NONE";
})(FunctionCallingMode || (FunctionCallingMode = {}));
/**
 * The mode of the predictor to be used in dynamic retrieval.
 * @public
 */
var DynamicRetrievalMode;
(function (DynamicRetrievalMode) {
    // Unspecified function calling mode. This value should not be used.
    DynamicRetrievalMode["MODE_UNSPECIFIED"] = "MODE_UNSPECIFIED";
    // Run retrieval only when system decides it is necessary.
    DynamicRetrievalMode["MODE_DYNAMIC"] = "MODE_DYNAMIC";
})(DynamicRetrievalMode || (DynamicRetrievalMode = {}));

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Basic error type for this SDK.
 * @public
 */
class GoogleGenerativeAIError extends Error {
    constructor(message) {
        super(`[GoogleGenerativeAI Error]: ${message}`);
    }
}
/**
 * Errors in the contents of a response from the model. This includes parsing
 * errors, or responses including a safety block reason.
 * @public
 */
class GoogleGenerativeAIResponseError extends GoogleGenerativeAIError {
    constructor(message, response) {
        super(message);
        this.response = response;
    }
}
/**
 * Error class covering HTTP errors when calling the server. Includes HTTP
 * status, statusText, and optional details, if provided in the server response.
 * @public
 */
class GoogleGenerativeAIFetchError extends GoogleGenerativeAIError {
    constructor(message, status, statusText, errorDetails) {
        super(message);
        this.status = status;
        this.statusText = statusText;
        this.errorDetails = errorDetails;
    }
}
/**
 * Errors in the contents of a request originating from user input.
 * @public
 */
class GoogleGenerativeAIRequestInputError extends GoogleGenerativeAIError {
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_API_VERSION = "v1beta";
/**
 * We can't `require` package.json if this runs on web. We will use rollup to
 * swap in the version number here at build time.
 */
const PACKAGE_VERSION = "0.21.0";
const PACKAGE_LOG_HEADER = "genai-js";
var Task;
(function (Task) {
    Task["GENERATE_CONTENT"] = "generateContent";
    Task["STREAM_GENERATE_CONTENT"] = "streamGenerateContent";
    Task["COUNT_TOKENS"] = "countTokens";
    Task["EMBED_CONTENT"] = "embedContent";
    Task["BATCH_EMBED_CONTENTS"] = "batchEmbedContents";
})(Task || (Task = {}));
class RequestUrl {
    constructor(model, task, apiKey, stream, requestOptions) {
        this.model = model;
        this.task = task;
        this.apiKey = apiKey;
        this.stream = stream;
        this.requestOptions = requestOptions;
    }
    toString() {
        var _a, _b;
        const apiVersion = ((_a = this.requestOptions) === null || _a === void 0 ? void 0 : _a.apiVersion) || DEFAULT_API_VERSION;
        const baseUrl = ((_b = this.requestOptions) === null || _b === void 0 ? void 0 : _b.baseUrl) || DEFAULT_BASE_URL;
        let url = `${baseUrl}/${apiVersion}/${this.model}:${this.task}`;
        if (this.stream) {
            url += "?alt=sse";
        }
        return url;
    }
}
/**
 * Simple, but may become more complex if we add more versions to log.
 */
function getClientHeaders(requestOptions) {
    const clientHeaders = [];
    if (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.apiClient) {
        clientHeaders.push(requestOptions.apiClient);
    }
    clientHeaders.push(`${PACKAGE_LOG_HEADER}/${PACKAGE_VERSION}`);
    return clientHeaders.join(" ");
}
async function getHeaders(url) {
    var _a;
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append("x-goog-api-client", getClientHeaders(url.requestOptions));
    headers.append("x-goog-api-key", url.apiKey);
    let customHeaders = (_a = url.requestOptions) === null || _a === void 0 ? void 0 : _a.customHeaders;
    if (customHeaders) {
        if (!(customHeaders instanceof Headers)) {
            try {
                customHeaders = new Headers(customHeaders);
            }
            catch (e) {
                throw new GoogleGenerativeAIRequestInputError(`unable to convert customHeaders value ${JSON.stringify(customHeaders)} to Headers: ${e.message}`);
            }
        }
        for (const [headerName, headerValue] of customHeaders.entries()) {
            if (headerName === "x-goog-api-key") {
                throw new GoogleGenerativeAIRequestInputError(`Cannot set reserved header name ${headerName}`);
            }
            else if (headerName === "x-goog-api-client") {
                throw new GoogleGenerativeAIRequestInputError(`Header name ${headerName} can only be set using the apiClient field`);
            }
            headers.append(headerName, headerValue);
        }
    }
    return headers;
}
async function constructModelRequest(model, task, apiKey, stream, body, requestOptions) {
    const url = new RequestUrl(model, task, apiKey, stream, requestOptions);
    return {
        url: url.toString(),
        fetchOptions: Object.assign(Object.assign({}, buildFetchOptions(requestOptions)), { method: "POST", headers: await getHeaders(url), body }),
    };
}
async function makeModelRequest(model, task, apiKey, stream, body, requestOptions = {}, 
// Allows this to be stubbed for tests
fetchFn = fetch) {
    const { url, fetchOptions } = await constructModelRequest(model, task, apiKey, stream, body, requestOptions);
    return makeRequest(url, fetchOptions, fetchFn);
}
async function makeRequest(url, fetchOptions, fetchFn = fetch) {
    let response;
    try {
        response = await fetchFn(url, fetchOptions);
    }
    catch (e) {
        handleResponseError(e, url);
    }
    if (!response.ok) {
        await handleResponseNotOk(response, url);
    }
    return response;
}
function handleResponseError(e, url) {
    let err = e;
    if (!(e instanceof GoogleGenerativeAIFetchError ||
        e instanceof GoogleGenerativeAIRequestInputError)) {
        err = new GoogleGenerativeAIError(`Error fetching from ${url.toString()}: ${e.message}`);
        err.stack = e.stack;
    }
    throw err;
}
async function handleResponseNotOk(response, url) {
    let message = "";
    let errorDetails;
    try {
        const json = await response.json();
        message = json.error.message;
        if (json.error.details) {
            message += ` ${JSON.stringify(json.error.details)}`;
            errorDetails = json.error.details;
        }
    }
    catch (e) {
        // ignored
    }
    throw new GoogleGenerativeAIFetchError(`Error fetching from ${url.toString()}: [${response.status} ${response.statusText}] ${message}`, response.status, response.statusText, errorDetails);
}
/**
 * Generates the request options to be passed to the fetch API.
 * @param requestOptions - The user-defined request options.
 * @returns The generated request options.
 */
function buildFetchOptions(requestOptions) {
    const fetchOptions = {};
    if ((requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.signal) !== undefined || (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.timeout) >= 0) {
        const controller = new AbortController();
        if ((requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.timeout) >= 0) {
            setTimeout(() => controller.abort(), requestOptions.timeout);
        }
        if (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.signal) {
            requestOptions.signal.addEventListener("abort", () => {
                controller.abort();
            });
        }
        fetchOptions.signal = controller.signal;
    }
    return fetchOptions;
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Adds convenience helper methods to a response object, including stream
 * chunks (as long as each chunk is a complete GenerateContentResponse JSON).
 */
function addHelpers(response) {
    response.text = () => {
        if (response.candidates && response.candidates.length > 0) {
            if (response.candidates.length > 1) {
                console.warn(`This response had ${response.candidates.length} ` +
                    `candidates. Returning text from the first candidate only. ` +
                    `Access response.candidates directly to use the other candidates.`);
            }
            if (hadBadFinishReason(response.candidates[0])) {
                throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
            }
            return getText(response);
        }
        else if (response.promptFeedback) {
            throw new GoogleGenerativeAIResponseError(`Text not available. ${formatBlockErrorMessage(response)}`, response);
        }
        return "";
    };
    /**
     * TODO: remove at next major version
     */
    response.functionCall = () => {
        if (response.candidates && response.candidates.length > 0) {
            if (response.candidates.length > 1) {
                console.warn(`This response had ${response.candidates.length} ` +
                    `candidates. Returning function calls from the first candidate only. ` +
                    `Access response.candidates directly to use the other candidates.`);
            }
            if (hadBadFinishReason(response.candidates[0])) {
                throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
            }
            console.warn(`response.functionCall() is deprecated. ` +
                `Use response.functionCalls() instead.`);
            return getFunctionCalls(response)[0];
        }
        else if (response.promptFeedback) {
            throw new GoogleGenerativeAIResponseError(`Function call not available. ${formatBlockErrorMessage(response)}`, response);
        }
        return undefined;
    };
    response.functionCalls = () => {
        if (response.candidates && response.candidates.length > 0) {
            if (response.candidates.length > 1) {
                console.warn(`This response had ${response.candidates.length} ` +
                    `candidates. Returning function calls from the first candidate only. ` +
                    `Access response.candidates directly to use the other candidates.`);
            }
            if (hadBadFinishReason(response.candidates[0])) {
                throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
            }
            return getFunctionCalls(response);
        }
        else if (response.promptFeedback) {
            throw new GoogleGenerativeAIResponseError(`Function call not available. ${formatBlockErrorMessage(response)}`, response);
        }
        return undefined;
    };
    return response;
}
/**
 * Returns all text found in all parts of first candidate.
 */
function getText(response) {
    var _a, _b, _c, _d;
    const textStrings = [];
    if ((_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0].content) === null || _b === void 0 ? void 0 : _b.parts) {
        for (const part of (_d = (_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0].content) === null || _d === void 0 ? void 0 : _d.parts) {
            if (part.text) {
                textStrings.push(part.text);
            }
            if (part.executableCode) {
                textStrings.push("\n```" +
                    part.executableCode.language +
                    "\n" +
                    part.executableCode.code +
                    "\n```\n");
            }
            if (part.codeExecutionResult) {
                textStrings.push("\n```\n" + part.codeExecutionResult.output + "\n```\n");
            }
        }
    }
    if (textStrings.length > 0) {
        return textStrings.join("");
    }
    else {
        return "";
    }
}
/**
 * Returns functionCall of first candidate.
 */
function getFunctionCalls(response) {
    var _a, _b, _c, _d;
    const functionCalls = [];
    if ((_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0].content) === null || _b === void 0 ? void 0 : _b.parts) {
        for (const part of (_d = (_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0].content) === null || _d === void 0 ? void 0 : _d.parts) {
            if (part.functionCall) {
                functionCalls.push(part.functionCall);
            }
        }
    }
    if (functionCalls.length > 0) {
        return functionCalls;
    }
    else {
        return undefined;
    }
}
const badFinishReasons = [
    FinishReason.RECITATION,
    FinishReason.SAFETY,
    FinishReason.LANGUAGE,
];
function hadBadFinishReason(candidate) {
    return (!!candidate.finishReason &&
        badFinishReasons.includes(candidate.finishReason));
}
function formatBlockErrorMessage(response) {
    var _a, _b, _c;
    let message = "";
    if ((!response.candidates || response.candidates.length === 0) &&
        response.promptFeedback) {
        message += "Response was blocked";
        if ((_a = response.promptFeedback) === null || _a === void 0 ? void 0 : _a.blockReason) {
            message += ` due to ${response.promptFeedback.blockReason}`;
        }
        if ((_b = response.promptFeedback) === null || _b === void 0 ? void 0 : _b.blockReasonMessage) {
            message += `: ${response.promptFeedback.blockReasonMessage}`;
        }
    }
    else if ((_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0]) {
        const firstCandidate = response.candidates[0];
        if (hadBadFinishReason(firstCandidate)) {
            message += `Candidate was blocked due to ${firstCandidate.finishReason}`;
            if (firstCandidate.finishMessage) {
                message += `: ${firstCandidate.finishMessage}`;
            }
        }
    }
    return message;
}

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __await(v) {
    return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const responseLineRE = /^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
/**
 * Process a response.body stream from the backend and return an
 * iterator that provides one complete GenerateContentResponse at a time
 * and a promise that resolves with a single aggregated
 * GenerateContentResponse.
 *
 * @param response - Response from a fetch call
 */
function processStream(response) {
    const inputStream = response.body.pipeThrough(new TextDecoderStream("utf8", { fatal: true }));
    const responseStream = getResponseStream(inputStream);
    const [stream1, stream2] = responseStream.tee();
    return {
        stream: generateResponseSequence(stream1),
        response: getResponsePromise(stream2),
    };
}
async function getResponsePromise(stream) {
    const allResponses = [];
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            return addHelpers(aggregateResponses(allResponses));
        }
        allResponses.push(value);
    }
}
function generateResponseSequence(stream) {
    return __asyncGenerator(this, arguments, function* generateResponseSequence_1() {
        const reader = stream.getReader();
        while (true) {
            const { value, done } = yield __await(reader.read());
            if (done) {
                break;
            }
            yield yield __await(addHelpers(value));
        }
    });
}
/**
 * Reads a raw stream from the fetch response and join incomplete
 * chunks, returning a new stream that provides a single complete
 * GenerateContentResponse in each iteration.
 */
function getResponseStream(inputStream) {
    const reader = inputStream.getReader();
    const stream = new ReadableStream({
        start(controller) {
            let currentText = "";
            return pump();
            function pump() {
                return reader.read().then(({ value, done }) => {
                    if (done) {
                        if (currentText.trim()) {
                            controller.error(new GoogleGenerativeAIError("Failed to parse stream"));
                            return;
                        }
                        controller.close();
                        return;
                    }
                    currentText += value;
                    let match = currentText.match(responseLineRE);
                    let parsedResponse;
                    while (match) {
                        try {
                            parsedResponse = JSON.parse(match[1]);
                        }
                        catch (e) {
                            controller.error(new GoogleGenerativeAIError(`Error parsing JSON response: "${match[1]}"`));
                            return;
                        }
                        controller.enqueue(parsedResponse);
                        currentText = currentText.substring(match[0].length);
                        match = currentText.match(responseLineRE);
                    }
                    return pump();
                });
            }
        },
    });
    return stream;
}
/**
 * Aggregates an array of `GenerateContentResponse`s into a single
 * GenerateContentResponse.
 */
function aggregateResponses(responses) {
    const lastResponse = responses[responses.length - 1];
    const aggregatedResponse = {
        promptFeedback: lastResponse === null || lastResponse === void 0 ? void 0 : lastResponse.promptFeedback,
    };
    for (const response of responses) {
        if (response.candidates) {
            for (const candidate of response.candidates) {
                const i = candidate.index;
                if (!aggregatedResponse.candidates) {
                    aggregatedResponse.candidates = [];
                }
                if (!aggregatedResponse.candidates[i]) {
                    aggregatedResponse.candidates[i] = {
                        index: candidate.index,
                    };
                }
                // Keep overwriting, the last one will be final
                aggregatedResponse.candidates[i].citationMetadata =
                    candidate.citationMetadata;
                aggregatedResponse.candidates[i].groundingMetadata =
                    candidate.groundingMetadata;
                aggregatedResponse.candidates[i].finishReason = candidate.finishReason;
                aggregatedResponse.candidates[i].finishMessage =
                    candidate.finishMessage;
                aggregatedResponse.candidates[i].safetyRatings =
                    candidate.safetyRatings;
                /**
                 * Candidates should always have content and parts, but this handles
                 * possible malformed responses.
                 */
                if (candidate.content && candidate.content.parts) {
                    if (!aggregatedResponse.candidates[i].content) {
                        aggregatedResponse.candidates[i].content = {
                            role: candidate.content.role || "user",
                            parts: [],
                        };
                    }
                    const newPart = {};
                    for (const part of candidate.content.parts) {
                        if (part.text) {
                            newPart.text = part.text;
                        }
                        if (part.functionCall) {
                            newPart.functionCall = part.functionCall;
                        }
                        if (part.executableCode) {
                            newPart.executableCode = part.executableCode;
                        }
                        if (part.codeExecutionResult) {
                            newPart.codeExecutionResult = part.codeExecutionResult;
                        }
                        if (Object.keys(newPart).length === 0) {
                            newPart.text = "";
                        }
                        aggregatedResponse.candidates[i].content.parts.push(newPart);
                    }
                }
            }
        }
        if (response.usageMetadata) {
            aggregatedResponse.usageMetadata = response.usageMetadata;
        }
    }
    return aggregatedResponse;
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
async function generateContentStream(apiKey, model, params, requestOptions) {
    const response = await makeModelRequest(model, Task.STREAM_GENERATE_CONTENT, apiKey, 
    /* stream */ true, JSON.stringify(params), requestOptions);
    return processStream(response);
}
async function generateContent(apiKey, model, params, requestOptions) {
    const response = await makeModelRequest(model, Task.GENERATE_CONTENT, apiKey, 
    /* stream */ false, JSON.stringify(params), requestOptions);
    const responseJson = await response.json();
    const enhancedResponse = addHelpers(responseJson);
    return {
        response: enhancedResponse,
    };
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
function formatSystemInstruction(input) {
    // null or undefined
    if (input == null) {
        return undefined;
    }
    else if (typeof input === "string") {
        return { role: "system", parts: [{ text: input }] };
    }
    else if (input.text) {
        return { role: "system", parts: [input] };
    }
    else if (input.parts) {
        if (!input.role) {
            return { role: "system", parts: input.parts };
        }
        else {
            return input;
        }
    }
}
function formatNewContent(request) {
    let newParts = [];
    if (typeof request === "string") {
        newParts = [{ text: request }];
    }
    else {
        for (const partOrString of request) {
            if (typeof partOrString === "string") {
                newParts.push({ text: partOrString });
            }
            else {
                newParts.push(partOrString);
            }
        }
    }
    return assignRoleToPartsAndValidateSendMessageRequest(newParts);
}
/**
 * When multiple Part types (i.e. FunctionResponsePart and TextPart) are
 * passed in a single Part array, we may need to assign different roles to each
 * part. Currently only FunctionResponsePart requires a role other than 'user'.
 * @private
 * @param parts Array of parts to pass to the model
 * @returns Array of content items
 */
function assignRoleToPartsAndValidateSendMessageRequest(parts) {
    const userContent = { role: "user", parts: [] };
    const functionContent = { role: "function", parts: [] };
    let hasUserContent = false;
    let hasFunctionContent = false;
    for (const part of parts) {
        if ("functionResponse" in part) {
            functionContent.parts.push(part);
            hasFunctionContent = true;
        }
        else {
            userContent.parts.push(part);
            hasUserContent = true;
        }
    }
    if (hasUserContent && hasFunctionContent) {
        throw new GoogleGenerativeAIError("Within a single message, FunctionResponse cannot be mixed with other type of part in the request for sending chat message.");
    }
    if (!hasUserContent && !hasFunctionContent) {
        throw new GoogleGenerativeAIError("No content is provided for sending chat message.");
    }
    if (hasUserContent) {
        return userContent;
    }
    return functionContent;
}
function formatCountTokensInput(params, modelParams) {
    var _a;
    let formattedGenerateContentRequest = {
        model: modelParams === null || modelParams === void 0 ? void 0 : modelParams.model,
        generationConfig: modelParams === null || modelParams === void 0 ? void 0 : modelParams.generationConfig,
        safetySettings: modelParams === null || modelParams === void 0 ? void 0 : modelParams.safetySettings,
        tools: modelParams === null || modelParams === void 0 ? void 0 : modelParams.tools,
        toolConfig: modelParams === null || modelParams === void 0 ? void 0 : modelParams.toolConfig,
        systemInstruction: modelParams === null || modelParams === void 0 ? void 0 : modelParams.systemInstruction,
        cachedContent: (_a = modelParams === null || modelParams === void 0 ? void 0 : modelParams.cachedContent) === null || _a === void 0 ? void 0 : _a.name,
        contents: [],
    };
    const containsGenerateContentRequest = params.generateContentRequest != null;
    if (params.contents) {
        if (containsGenerateContentRequest) {
            throw new GoogleGenerativeAIRequestInputError("CountTokensRequest must have one of contents or generateContentRequest, not both.");
        }
        formattedGenerateContentRequest.contents = params.contents;
    }
    else if (containsGenerateContentRequest) {
        formattedGenerateContentRequest = Object.assign(Object.assign({}, formattedGenerateContentRequest), params.generateContentRequest);
    }
    else {
        // Array or string
        const content = formatNewContent(params);
        formattedGenerateContentRequest.contents = [content];
    }
    return { generateContentRequest: formattedGenerateContentRequest };
}
function formatGenerateContentInput(params) {
    let formattedRequest;
    if (params.contents) {
        formattedRequest = params;
    }
    else {
        // Array or string
        const content = formatNewContent(params);
        formattedRequest = { contents: [content] };
    }
    if (params.systemInstruction) {
        formattedRequest.systemInstruction = formatSystemInstruction(params.systemInstruction);
    }
    return formattedRequest;
}
function formatEmbedContentInput(params) {
    if (typeof params === "string" || Array.isArray(params)) {
        const content = formatNewContent(params);
        return { content };
    }
    return params;
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// https://ai.google.dev/api/rest/v1beta/Content#part
const VALID_PART_FIELDS = [
    "text",
    "inlineData",
    "functionCall",
    "functionResponse",
    "executableCode",
    "codeExecutionResult",
];
const VALID_PARTS_PER_ROLE = {
    user: ["text", "inlineData"],
    function: ["functionResponse"],
    model: ["text", "functionCall", "executableCode", "codeExecutionResult"],
    // System instructions shouldn't be in history anyway.
    system: ["text"],
};
function validateChatHistory(history) {
    let prevContent = false;
    for (const currContent of history) {
        const { role, parts } = currContent;
        if (!prevContent && role !== "user") {
            throw new GoogleGenerativeAIError(`First content should be with role 'user', got ${role}`);
        }
        if (!POSSIBLE_ROLES.includes(role)) {
            throw new GoogleGenerativeAIError(`Each item should include role field. Got ${role} but valid roles are: ${JSON.stringify(POSSIBLE_ROLES)}`);
        }
        if (!Array.isArray(parts)) {
            throw new GoogleGenerativeAIError("Content should have 'parts' property with an array of Parts");
        }
        if (parts.length === 0) {
            throw new GoogleGenerativeAIError("Each Content should have at least one part");
        }
        const countFields = {
            text: 0,
            inlineData: 0,
            functionCall: 0,
            functionResponse: 0,
            fileData: 0,
            executableCode: 0,
            codeExecutionResult: 0,
        };
        for (const part of parts) {
            for (const key of VALID_PART_FIELDS) {
                if (key in part) {
                    countFields[key] += 1;
                }
            }
        }
        const validParts = VALID_PARTS_PER_ROLE[role];
        for (const key of VALID_PART_FIELDS) {
            if (!validParts.includes(key) && countFields[key] > 0) {
                throw new GoogleGenerativeAIError(`Content with role '${role}' can't contain '${key}' part`);
            }
        }
        prevContent = true;
    }
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Do not log a message for this error.
 */
const SILENT_ERROR = "SILENT_ERROR";
/**
 * ChatSession class that enables sending chat messages and stores
 * history of sent and received messages so far.
 *
 * @public
 */
class ChatSession {
    constructor(apiKey, model, params, _requestOptions = {}) {
        this.model = model;
        this.params = params;
        this._requestOptions = _requestOptions;
        this._history = [];
        this._sendPromise = Promise.resolve();
        this._apiKey = apiKey;
        if (params === null || params === void 0 ? void 0 : params.history) {
            validateChatHistory(params.history);
            this._history = params.history;
        }
    }
    /**
     * Gets the chat history so far. Blocked prompts are not added to history.
     * Blocked candidates are not added to history, nor are the prompts that
     * generated them.
     */
    async getHistory() {
        await this._sendPromise;
        return this._history;
    }
    /**
     * Sends a chat message and receives a non-streaming
     * {@link GenerateContentResult}.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async sendMessage(request, requestOptions = {}) {
        var _a, _b, _c, _d, _e, _f;
        await this._sendPromise;
        const newContent = formatNewContent(request);
        const generateContentRequest = {
            safetySettings: (_a = this.params) === null || _a === void 0 ? void 0 : _a.safetySettings,
            generationConfig: (_b = this.params) === null || _b === void 0 ? void 0 : _b.generationConfig,
            tools: (_c = this.params) === null || _c === void 0 ? void 0 : _c.tools,
            toolConfig: (_d = this.params) === null || _d === void 0 ? void 0 : _d.toolConfig,
            systemInstruction: (_e = this.params) === null || _e === void 0 ? void 0 : _e.systemInstruction,
            cachedContent: (_f = this.params) === null || _f === void 0 ? void 0 : _f.cachedContent,
            contents: [...this._history, newContent],
        };
        const chatSessionRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        let finalResult;
        // Add onto the chain.
        this._sendPromise = this._sendPromise
            .then(() => generateContent(this._apiKey, this.model, generateContentRequest, chatSessionRequestOptions))
            .then((result) => {
            var _a;
            if (result.response.candidates &&
                result.response.candidates.length > 0) {
                this._history.push(newContent);
                const responseContent = Object.assign({ parts: [], 
                    // Response seems to come back without a role set.
                    role: "model" }, (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0].content);
                this._history.push(responseContent);
            }
            else {
                const blockErrorMessage = formatBlockErrorMessage(result.response);
                if (blockErrorMessage) {
                    console.warn(`sendMessage() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
                }
            }
            finalResult = result;
        });
        await this._sendPromise;
        return finalResult;
    }
    /**
     * Sends a chat message and receives the response as a
     * {@link GenerateContentStreamResult} containing an iterable stream
     * and a response promise.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async sendMessageStream(request, requestOptions = {}) {
        var _a, _b, _c, _d, _e, _f;
        await this._sendPromise;
        const newContent = formatNewContent(request);
        const generateContentRequest = {
            safetySettings: (_a = this.params) === null || _a === void 0 ? void 0 : _a.safetySettings,
            generationConfig: (_b = this.params) === null || _b === void 0 ? void 0 : _b.generationConfig,
            tools: (_c = this.params) === null || _c === void 0 ? void 0 : _c.tools,
            toolConfig: (_d = this.params) === null || _d === void 0 ? void 0 : _d.toolConfig,
            systemInstruction: (_e = this.params) === null || _e === void 0 ? void 0 : _e.systemInstruction,
            cachedContent: (_f = this.params) === null || _f === void 0 ? void 0 : _f.cachedContent,
            contents: [...this._history, newContent],
        };
        const chatSessionRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        const streamPromise = generateContentStream(this._apiKey, this.model, generateContentRequest, chatSessionRequestOptions);
        // Add onto the chain.
        this._sendPromise = this._sendPromise
            .then(() => streamPromise)
            // This must be handled to avoid unhandled rejection, but jump
            // to the final catch block with a label to not log this error.
            .catch((_ignored) => {
            throw new Error(SILENT_ERROR);
        })
            .then((streamResult) => streamResult.response)
            .then((response) => {
            if (response.candidates && response.candidates.length > 0) {
                this._history.push(newContent);
                const responseContent = Object.assign({}, response.candidates[0].content);
                // Response seems to come back without a role set.
                if (!responseContent.role) {
                    responseContent.role = "model";
                }
                this._history.push(responseContent);
            }
            else {
                const blockErrorMessage = formatBlockErrorMessage(response);
                if (blockErrorMessage) {
                    console.warn(`sendMessageStream() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
                }
            }
        })
            .catch((e) => {
            // Errors in streamPromise are already catchable by the user as
            // streamPromise is returned.
            // Avoid duplicating the error message in logs.
            if (e.message !== SILENT_ERROR) {
                // Users do not have access to _sendPromise to catch errors
                // downstream from streamPromise, so they should not throw.
                console.error(e);
            }
        });
        return streamPromise;
    }
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
async function countTokens(apiKey, model, params, singleRequestOptions) {
    const response = await makeModelRequest(model, Task.COUNT_TOKENS, apiKey, false, JSON.stringify(params), singleRequestOptions);
    return response.json();
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
async function embedContent(apiKey, model, params, requestOptions) {
    const response = await makeModelRequest(model, Task.EMBED_CONTENT, apiKey, false, JSON.stringify(params), requestOptions);
    return response.json();
}
async function batchEmbedContents(apiKey, model, params, requestOptions) {
    const requestsWithModel = params.requests.map((request) => {
        return Object.assign(Object.assign({}, request), { model });
    });
    const response = await makeModelRequest(model, Task.BATCH_EMBED_CONTENTS, apiKey, false, JSON.stringify({ requests: requestsWithModel }), requestOptions);
    return response.json();
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Class for generative model APIs.
 * @public
 */
class GenerativeModel {
    constructor(apiKey, modelParams, _requestOptions = {}) {
        this.apiKey = apiKey;
        this._requestOptions = _requestOptions;
        if (modelParams.model.includes("/")) {
            // Models may be named "models/model-name" or "tunedModels/model-name"
            this.model = modelParams.model;
        }
        else {
            // If path is not included, assume it's a non-tuned model.
            this.model = `models/${modelParams.model}`;
        }
        this.generationConfig = modelParams.generationConfig || {};
        this.safetySettings = modelParams.safetySettings || [];
        this.tools = modelParams.tools;
        this.toolConfig = modelParams.toolConfig;
        this.systemInstruction = formatSystemInstruction(modelParams.systemInstruction);
        this.cachedContent = modelParams.cachedContent;
    }
    /**
     * Makes a single non-streaming call to the model
     * and returns an object containing a single {@link GenerateContentResponse}.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async generateContent(request, requestOptions = {}) {
        var _a;
        const formattedParams = formatGenerateContentInput(request);
        const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        return generateContent(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings, tools: this.tools, toolConfig: this.toolConfig, systemInstruction: this.systemInstruction, cachedContent: (_a = this.cachedContent) === null || _a === void 0 ? void 0 : _a.name }, formattedParams), generativeModelRequestOptions);
    }
    /**
     * Makes a single streaming call to the model and returns an object
     * containing an iterable stream that iterates over all chunks in the
     * streaming response as well as a promise that returns the final
     * aggregated response.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async generateContentStream(request, requestOptions = {}) {
        var _a;
        const formattedParams = formatGenerateContentInput(request);
        const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        return generateContentStream(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings, tools: this.tools, toolConfig: this.toolConfig, systemInstruction: this.systemInstruction, cachedContent: (_a = this.cachedContent) === null || _a === void 0 ? void 0 : _a.name }, formattedParams), generativeModelRequestOptions);
    }
    /**
     * Gets a new {@link ChatSession} instance which can be used for
     * multi-turn chats.
     */
    startChat(startChatParams) {
        var _a;
        return new ChatSession(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings, tools: this.tools, toolConfig: this.toolConfig, systemInstruction: this.systemInstruction, cachedContent: (_a = this.cachedContent) === null || _a === void 0 ? void 0 : _a.name }, startChatParams), this._requestOptions);
    }
    /**
     * Counts the tokens in the provided request.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async countTokens(request, requestOptions = {}) {
        const formattedParams = formatCountTokensInput(request, {
            model: this.model,
            generationConfig: this.generationConfig,
            safetySettings: this.safetySettings,
            tools: this.tools,
            toolConfig: this.toolConfig,
            systemInstruction: this.systemInstruction,
            cachedContent: this.cachedContent,
        });
        const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        return countTokens(this.apiKey, this.model, formattedParams, generativeModelRequestOptions);
    }
    /**
     * Embeds the provided content.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async embedContent(request, requestOptions = {}) {
        const formattedParams = formatEmbedContentInput(request);
        const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        return embedContent(this.apiKey, this.model, formattedParams, generativeModelRequestOptions);
    }
    /**
     * Embeds an array of {@link EmbedContentRequest}s.
     *
     * Fields set in the optional {@link SingleRequestOptions} parameter will
     * take precedence over the {@link RequestOptions} values provided to
     * {@link GoogleGenerativeAI.getGenerativeModel }.
     */
    async batchEmbedContents(batchEmbedContentRequest, requestOptions = {}) {
        const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
        return batchEmbedContents(this.apiKey, this.model, batchEmbedContentRequest, generativeModelRequestOptions);
    }
}

/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Top-level class for this SDK
 * @public
 */
class GoogleGenerativeAI {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    /**
     * Gets a {@link GenerativeModel} instance for the provided model name.
     */
    getGenerativeModel(modelParams, requestOptions) {
        if (!modelParams.model) {
            throw new GoogleGenerativeAIError(`Must provide a model name. ` +
                `Example: genai.getGenerativeModel({ model: 'my-model-name' })`);
        }
        return new GenerativeModel(this.apiKey, modelParams, requestOptions);
    }
    /**
     * Creates a {@link GenerativeModel} instance from provided content cache.
     */
    getGenerativeModelFromCachedContent(cachedContent, modelParams, requestOptions) {
        if (!cachedContent.name) {
            throw new GoogleGenerativeAIRequestInputError("Cached content must contain a `name` field.");
        }
        if (!cachedContent.model) {
            throw new GoogleGenerativeAIRequestInputError("Cached content must contain a `model` field.");
        }
        /**
         * Not checking tools and toolConfig for now as it would require a deep
         * equality comparison and isn't likely to be a common case.
         */
        const disallowedDuplicates = ["model", "systemInstruction"];
        for (const key of disallowedDuplicates) {
            if ((modelParams === null || modelParams === void 0 ? void 0 : modelParams[key]) &&
                cachedContent[key] &&
                (modelParams === null || modelParams === void 0 ? void 0 : modelParams[key]) !== cachedContent[key]) {
                if (key === "model") {
                    const modelParamsComp = modelParams.model.startsWith("models/")
                        ? modelParams.model.replace("models/", "")
                        : modelParams.model;
                    const cachedContentComp = cachedContent.model.startsWith("models/")
                        ? cachedContent.model.replace("models/", "")
                        : cachedContent.model;
                    if (modelParamsComp === cachedContentComp) {
                        continue;
                    }
                }
                throw new GoogleGenerativeAIRequestInputError(`Different value for "${key}" specified in modelParams` +
                    ` (${modelParams[key]}) and cachedContent (${cachedContent[key]})`);
            }
        }
        const modelParamsFromCache = Object.assign(Object.assign({}, modelParams), { model: cachedContent.model, tools: cachedContent.tools, toolConfig: cachedContent.toolConfig, systemInstruction: cachedContent.systemInstruction, cachedContent });
        return new GenerativeModel(this.apiKey, modelParamsFromCache, requestOptions);
    }
}


//# sourceMappingURL=index.mjs.map


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!******************************************!*\
  !*** ./src/background/service-worker.ts ***!
  \******************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _api_manager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./api-manager */ "./src/background/api-manager.ts");
/**
 * SeeReal - Background Service Worker
 * Handles API communication, persistent storage, and message passing between content scripts
 */

const apiManager = new _api_manager__WEBPACK_IMPORTED_MODULE_0__.ApiManager();
chrome.runtime.onInstalled.addListener(() => {
    console.log('[SeeReal] Extension installed');
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch((err) => {
        console.error('[SeeReal] Message handler error:', err);
        sendResponse({ error: String(err) });
    });
    return true; // Keep channel open for async response
});
async function handleMessage(message) {
    switch (message.type) {
        case 'ANALYZE_ARTICLE':
            return apiManager.analyzeArticle(message.payload);
        case 'GET_CACHED_ANALYSIS':
            return apiManager.getCachedAnalysis(message.payload);
        case 'GET_ARTICLE_HISTORY':
            return apiManager.getArticleHistory();
        case 'DELETE_ARTICLE':
            await apiManager.deleteArticle(message.payload);
            return { success: true };
        case 'CLEAR_HISTORY':
            await apiManager.clearHistory();
            return { success: true };
        case 'GENERATE_VIDEO':
            return apiManager.generateArticleVideo(message.payload);
        case 'FETCH_AUTHOR_INFO':
            return apiManager.fetchAuthorInfo(message.payload);
        case 'FETCH_RELATED_ARTICLES':
            return apiManager.fetchRelatedArticles(message.payload);
        case 'GENERATE_DEBATE_CARDS':
            return apiManager.generateDebateCards(message.payload);
        case 'GET_DEBATE_HISTORY':
            return apiManager.getDebateHistory();
        case 'DELETE_DEBATE_RECORD':
            await apiManager.deleteDebateRecord(message.payload);
            return { success: true };
        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}

})();

/******/ })()
;
//# sourceMappingURL=background.js.map