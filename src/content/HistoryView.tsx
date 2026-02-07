/**
 * SeeReal - History View Component
 * Displays previously analyzed articles with search and delete functionality
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ArticleRecord } from '../lib/storage/types';

interface HistoryViewProps {
    onSelectArticle: (record: ArticleRecord) => void;
    onClose: () => void;
}

export function HistoryView({ onSelectArticle, onClose }: HistoryViewProps) {
    const [history, setHistory] = useState<ArticleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_ARTICLE_HISTORY' });
            setHistory(response || []);
        } catch (error) {
            console.error('[SeeReal] Failed to load history:', error);
            setHistory([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (url: string, event: React.MouseEvent) => {
        event.stopPropagation();
        try {
            await chrome.runtime.sendMessage({ type: 'DELETE_ARTICLE', payload: url });
            setHistory((prev) => prev.filter((item) => item.url !== url));
        } catch (error) {
            console.error('[SeeReal] Failed to delete article:', error);
        }
    };

    const handleClearAll = async () => {
        try {
            await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
            setHistory([]);
            setShowClearConfirm(false);
        } catch (error) {
            console.error('[SeeReal] Failed to clear history:', error);
        }
    };

    const filteredHistory = history.filter((item) => {
        const query = searchQuery.toLowerCase();
        return (
            item.title.toLowerCase().includes(query) ||
            item.url.toLowerCase().includes(query) ||
            item.author?.toLowerCase().includes(query) ||
            item.source?.toLowerCase().includes(query)
        );
    });

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const getBiasLabel = (value: number) => {
        if (value < -30) return 'Left';
        if (value > 30) return 'Right';
        return 'Center';
    };

    const getBiasColor = (value: number) => {
        if (value < -30) return 'text-blue-400';
        if (value > 30) return 'text-red-400';
        return 'text-gray-400';
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="shrink-0 border-b border-white/20 px-4 py-3 bg-white/[0.03]">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">Article History</h2>
                    <div className="flex items-center gap-2">
                        {history.length > 0 && (
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="text-xs text-white/60 hover:text-red-400 transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="seereal-hover-btn rounded-lg bg-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/25"
                        >
                            Back
                        </button>
                    </div>
                </div>

                {/* Search */}
                <input
                    type="text"
                    placeholder="Search by title, URL, author, or source..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:border-seereal-accent focus:outline-none focus:ring-1 focus:ring-seereal-accent"
                />
            </div>

            {/* Clear confirmation dialog */}
            <AnimatePresence>
                {showClearConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        onClick={() => setShowClearConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-xl border border-white/20 bg-black/95 p-6 max-w-sm mx-4"
                        >
                            <h3 className="text-lg font-bold text-white mb-2">Clear all history?</h3>
                            <p className="text-sm text-white/70 mb-4">
                                This will permanently delete all {history.length} analyzed articles. This action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    className="flex-1 rounded-lg bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleClearAll}
                                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
                                >
                                    Clear all
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-10">
                        <div className="h-12 w-12 animate-spin rounded-full border-4 border-seereal-accent/30 border-t-seereal-accent" />
                        <p className="mt-4 text-sm text-white/70">Loading history...</p>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <svg
                            className="h-16 w-16 text-white/20 mb-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        <p className="text-base text-white/70">
                            {searchQuery ? 'No articles match your search' : 'No analyzed articles yet'}
                        </p>
                        <p className="mt-1 text-sm text-white/50">
                            {searchQuery ? 'Try a different search term' : 'Analyze an article to get started'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredHistory.map((item, index) => (
                            <motion.div
                                key={item.url}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                onClick={() => onSelectArticle(item)}
                                className="group cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] p-3 transition-all hover:border-seereal-accent/50 hover:bg-white/[0.1]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-semibold text-white line-clamp-2 mb-1">
                                            {item.title}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50 mb-2">
                                            {item.source && <span>{item.source}</span>}
                                            {item.author && (
                                                <>
                                                    <span>•</span>
                                                    <span>{item.author}</span>
                                                </>
                                            )}
                                            <span>•</span>
                                            <span>{formatDate(item.timestamp)}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getBiasColor(item.bias.left_right)} bg-white/10`}
                                            >
                                                {getBiasLabel(item.bias.left_right)}
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
                                                {item.bias.objectivity}% objective
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
                                                {item.bias.confidence}% confidence
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(item.url, e)}
                                        className="shrink-0 rounded-lg p-2 text-white/40 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                                        title="Delete"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer stats */}
            {!loading && filteredHistory.length > 0 && (
                <div className="shrink-0 border-t border-white/20 px-4 py-2 bg-white/[0.03]">
                    <p className="text-xs text-white/50">
                        Showing {filteredHistory.length} of {history.length} article{history.length !== 1 ? 's' : ''}
                    </p>
                </div>
            )}
        </div>
    );
}
