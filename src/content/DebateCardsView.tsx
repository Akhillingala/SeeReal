import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtractedArticle } from '../lib/utils/article-parser';
import { DebateRecord, DebateCard } from '../lib/storage/types';

// Redundant local interface removed in favor of import from storage types

interface DebateCardsViewProps {
    article: ExtractedArticle;
}

export function DebateCardsView({ article }: DebateCardsViewProps) {
    const [purpose, setPurpose] = useState('');
    const [loading, setLoading] = useState(false);
    const [cards, setCards] = useState<DebateCard[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<DebateRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_DEBATE_HISTORY' });
            setHistory(response || []);
        } catch (err) {
            console.error('[SeeReal] Failed to load debate history:', err);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await chrome.runtime.sendMessage({ type: 'DELETE_DEBATE_RECORD', payload: id });
            setHistory((prev: DebateRecord[]) => prev.filter((r: DebateRecord) => r.id !== id));
            if (expandedHistoryId === id) setExpandedHistoryId(null);
        } catch (err) {
            console.error('[SeeReal] Failed to delete debate record:', err);
        }
    };

    const handleGenerate = async () => {
        if (!purpose.trim()) {
            setError('Please enter a purpose for the cards.');
            return;
        }

        setLoading(true);
        setError(null);
        setCards([]);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_DEBATE_CARDS',
                payload: {
                    text: article.text,
                    purpose: purpose,
                    title: article.title,
                    author: article.author,
                    source: article.source,
                    date: article.date,
                    url: article.url,
                },
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            setCards(response.cards || []);
            loadHistory(); // Refresh history after new generation
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate cards.');
        } finally {
            setLoading(false);
        }
    };

    const renderCardBody = (body: string, highlights: string[]) => {
        if (!highlights || highlights.length === 0) return body;

        // Sort highlights by length descending to avoid partial matches interfering
        const sortedHighlights = [...highlights].sort((a, b) => b.length - a.length);

        // Create a regex that matches any of the highlight strings. 
        // We use \b only for highlights that start/end with a word character to avoid partial matches
        // while still allowing phrases with punctuation to match correctly.
        const escapedHighlights = sortedHighlights.map(h => {
            const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const startBoundary = /^\w/.test(h) ? '\\b' : '';
            const endBoundary = /\w$/.test(h) ? '\\b' : '';
            return `${startBoundary}${escaped}${endBoundary}`;
        });
        const regex = new RegExp(`(${escapedHighlights.join('|')})`, 'gi');

        const parts = body.split(regex);

        return parts.map((part, i) => {
            const isHighlight = highlights.some(h => h.toLowerCase() === part.toLowerCase());
            return isHighlight ? (
                <span key={i} className="font-bold text-white bg-seereal-accent/20 px-0.5 rounded-sm">
                    {part}
                </span>
            ) : (
                <span key={i} className="text-white/60">
                    {part}
                </span>
            );
        });
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 mb-4 p-4 rounded-xl border border-white/10 bg-white/[0.04]">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Generate Debate Cards</h3>
                <p className="mb-3 text-xs text-white/50">
                    Enter a specific angle or argument you want to extract from this article.
                </p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        placeholder="e.g., Argue that the economic impact is overstated..."
                        className="flex-1 rounded-lg bg-black/40 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-seereal-accent/50"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="seereal-hover-btn rounded-lg bg-seereal-accent px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                    >
                        {loading ? 'Generating...' : 'Generate'}
                    </button>
                </div>
                {error && (
                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-400 font-medium">{error}</p>
                        <p className="mt-1 text-[10px] text-white/40">Tip: Check the background page console for details.</p>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-6 pb-20">
                {/* Current Results */}
                {cards.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Latest Generation</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>
                        <AnimatePresence mode="popLayout">
                            {cards.map((card: DebateCard, idx: number) => (
                                <motion.div
                                    key={`current-${idx}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="p-4 rounded-xl border border-seereal-accent/30 bg-seereal-accent/5 hover:bg-seereal-accent/10 transition-colors"
                                >
                                    <div className="mb-2">
                                        <span className="text-sm font-bold text-seereal-accent uppercase tracking-wide">
                                            [TAG] {card.tag}
                                        </span>
                                    </div>
                                    <div className="mb-3 text-[11px] font-medium text-white/40 italic">
                                        {card.cite}
                                    </div>
                                    <div className="text-xs leading-relaxed font-serif">
                                        {renderCardBody(card.body, card.highlights)}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {loading && (
                    <div className="space-y-4">
                        {[1, 2].map((i) => (
                            <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
                        ))}
                    </div>
                )}

                {/* History Section */}
                {history.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">History</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>

                        <div className="space-y-2">
                            {history.map((record: DebateRecord) => (
                                <div key={record.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                    <button
                                        onClick={() => setExpandedHistoryId(expandedHistoryId === record.id ? null : record.id)}
                                        className="w-full text-left p-3 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-white/90 truncate mr-2">
                                                {record.purpose}
                                            </p>
                                            <p className="text-[10px] text-white/40 mt-0.5 truncate">
                                                {record.articleTitle} • {new Date(record.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] font-bold text-seereal-accent/60 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                                {record.cards.length} cards
                                            </span>
                                            <button
                                                onClick={(e) => handleDeleteRecord(record.id, e)}
                                                className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                            <svg
                                                className={`w-4 h-4 text-white/30 transition-transform ${expandedHistoryId === record.id ? 'rotate-180' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </button>

                                    <AnimatePresence>
                                        {expandedHistoryId === record.id && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-white/10 bg-black/20"
                                            >
                                                <div className="p-4 space-y-4">
                                                    {record.cards.map((card: DebateCard, idx: number) => (
                                                        <div key={idx} className="pb-4 last:pb-0 border-b last:border-0 border-white/5">
                                                            <div className="mb-2">
                                                                <span className="text-[11px] font-bold text-seereal-accent/80 uppercase tracking-wide">
                                                                    [TAG] {card.tag}
                                                                </span>
                                                            </div>
                                                            <div className="mb-2 text-[10px] font-medium text-white/30 italic">
                                                                {card.cite}
                                                            </div>
                                                            <div className="text-[11px] leading-relaxed font-serif">
                                                                {renderCardBody(card.body, card.highlights)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!loading && cards.length === 0 && history.length === 0 && !error && (
                    <div className="flex h-40 flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-white/30 text-sm">
                            Your generated debate cards and history will appear here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
