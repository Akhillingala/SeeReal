/**
 * SeeReal - Storage Type Definitions
 * Shared interfaces for article history storage
 */

import type { BiasResult } from '../analyzers/bias-detector';

export interface ArticleRecord {
    url: string;
    title: string;
    author?: string;
    source?: string;
    bias: BiasResult;
    timestamp: number;
    cached: boolean;
}

export interface ArticleMetadata {
    url: string;
    title: string;
    author?: string;
    source?: string;
    timestamp: number;
    // Summary metrics for quick display
    leftRight: number;
    objectivity: number;
    confidence: number;
}

export interface DebateCard {
    tag: string;
    cite: string;
    body: string;
    highlights: string[];
}

export interface DebateRecord {
    id: string;
    url: string;
    articleTitle: string;
    purpose: string;
    cards: DebateCard[];
    timestamp: number;
}

export interface StorageStats {
    count: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    estimatedSizeBytes: number;
    debateCount: number;
}

export interface StorageData {
    articles: Record<string, ArticleRecord>;
    debateHistory: DebateRecord[];
    version: number; // For future schema migrations
}
