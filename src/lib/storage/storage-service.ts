/**
 * SeeReal - Storage Service
 * Handles persistent storage of article analyses using Chrome Storage API
 */

import type { ArticleRecord, ArticleMetadata, StorageStats, StorageData, DebateRecord, DebateCard } from './types';

const STORAGE_KEY = 'seereal_article_history';
const STORAGE_VERSION = 1;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class StorageService {
    /**
     * Save an article analysis to persistent storage
     */
    async saveAnalysis(record: ArticleRecord): Promise<void> {
        try {
            const data = await this.getStorageData();
            data.articles[record.url] = record;
            await this.setStorageData(data);
        } catch (error) {
            console.error('[SeeReal Storage] Failed to save analysis:', error);
            throw error;
        }
    }

    /**
     * Retrieve an article analysis by URL
     */
    async getAnalysis(url: string): Promise<ArticleRecord | null> {
        try {
            const data = await this.getStorageData();
            return data.articles[url] || null;
        } catch (error) {
            console.error('[SeeReal Storage] Failed to get analysis:', error);
            return null;
        }
    }

    /**
     * Get all stored analyses, sorted by timestamp (newest first)
     */
    async getAllAnalyses(): Promise<ArticleRecord[]> {
        try {
            const data = await this.getStorageData();
            return Object.values(data.articles).sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error('[SeeReal Storage] Failed to get all analyses:', error);
            return [];
        }
    }

    /**
     * Get lightweight metadata for all articles (for list views)
     */
    async getAllMetadata(): Promise<ArticleMetadata[]> {
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
        } catch (error) {
            console.error('[SeeReal Storage] Failed to get metadata:', error);
            return [];
        }
    }

    /**
     * Delete a specific article analysis
     */
    async deleteAnalysis(url: string): Promise<void> {
        try {
            const data = await this.getStorageData();
            delete data.articles[url];
            await this.setStorageData(data);
        } catch (error) {
            console.error('[SeeReal Storage] Failed to delete analysis:', error);
            throw error;
        }
    }

    /**
     * Clear all stored analyses
     */
    async clearAllAnalyses(): Promise<void> {
        try {
            const data = await this.getStorageData();
            data.articles = {};
            await this.setStorageData(data);
        } catch (error) {
            console.error('[SeeReal Storage] Failed to clear analyses:', error);
            throw error;
        }
    }

    /**
     * Save a debate card generation record
     */
    async saveDebateRecord(record: DebateRecord): Promise<void> {
        try {
            const data = await this.getStorageData();
            data.debateHistory.unshift(record);
            // Keep only last 50 generations to save space
            if (data.debateHistory.length > 50) {
                data.debateHistory = data.debateHistory.slice(0, 50);
            }
            await this.setStorageData(data);
        } catch (error) {
            console.error('[SeeReal Storage] Failed to save debate record:', error);
            throw error;
        }
    }

    /**
     * Get all debate records
     */
    async getDebateHistory(): Promise<DebateRecord[]> {
        try {
            const data = await this.getStorageData();
            return data.debateHistory || [];
        } catch (error) {
            console.error('[SeeReal Storage] Failed to get debate history:', error);
            return [];
        }
    }

    /**
     * Delete a debate record by ID
     */
    async deleteDebateRecord(id: string): Promise<void> {
        try {
            const data = await this.getStorageData();
            data.debateHistory = data.debateHistory.filter(r => r.id !== id);
            await this.setStorageData(data);
        } catch (error) {
            console.error('[SeeReal Storage] Failed to delete debate record:', error);
            throw error;
        }
    }

    /**
     * Remove analyses older than MAX_AGE_MS
     */
    async clearOldAnalyses(): Promise<number> {
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
        } catch (error) {
            console.error('[SeeReal Storage] Failed to clear old analyses:', error);
            return 0;
        }
    }

    /**
     * Get storage statistics
     */
    async getStats(): Promise<StorageStats> {
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
        } catch (error) {
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
    private async getStorageData(): Promise<StorageData> {
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

        return stored as StorageData;
    }

    /**
     * Save storage data to Chrome Storage API
     */
    private async setStorageData(data: StorageData): Promise<void> {
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
    }
}
