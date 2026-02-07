/**
 * SeeReal - Author Profile Component
 * Displays author background information including bio, articles, and professional details
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AuthorInfo {
    name: string;
    bio?: string;
    occupation?: string;
    age?: string;
    articles?: Array<{
        title: string;
        url: string;
        source?: string;
        date?: string;
    }>;
    socialLinks?: Array<{
        platform: string;
        url: string;
    }>;
    imageUrl?: string;
}

interface AuthorProfileProps {
    authorName: string;
    authorImageUrl?: string;
    onClose: () => void;
}

export function AuthorProfile({ authorName, authorImageUrl, onClose }: AuthorProfileProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [authorInfo, setAuthorInfo] = useState<AuthorInfo | null>(null);

    useEffect(() => {
        fetchAuthorInfo();
    }, [authorName]);

    const fetchAuthorInfo = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'FETCH_AUTHOR_INFO',
                payload: { authorName },
            });

            if (response?.error) {
                throw new Error(response.error);
            }

            setAuthorInfo(response.authorInfo);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch author information');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[2147483648] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-white/20 bg-black/95 shadow-2xl backdrop-blur-xl"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/20 px-6 py-4 bg-white/[0.03]">
                        <h2 className="text-xl font-bold text-white">Author Profile</h2>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                            aria-label="Close"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-6">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="h-12 w-12 animate-spin rounded-full border-4 border-seereal-accent/30 border-t-seereal-accent mb-4" />
                                <p className="text-white/70">Loading author information...</p>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl border-2 border-seereal-danger/50 bg-seereal-danger/10 p-6">
                                <p className="text-base font-medium text-seereal-danger mb-2">{error}</p>
                                <button
                                    onClick={fetchAuthorInfo}
                                    className="mt-3 rounded-lg bg-white/25 px-4 py-2 text-sm font-medium text-white hover:bg-white/35 transition-colors"
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {!loading && !error && authorInfo && (
                            <div className="space-y-6">
                                {/* Author Header */}
                                <div className="flex items-start gap-4">
                                    {(authorImageUrl || authorInfo.imageUrl) ? (
                                        <img
                                            src={authorImageUrl || authorInfo.imageUrl}
                                            alt={authorName}
                                            className="h-20 w-20 shrink-0 rounded-full object-cover border-2 border-white/20 bg-white/10"
                                        />
                                    ) : (
                                        <div className="h-20 w-20 shrink-0 rounded-full bg-gradient-to-br from-seereal-accent to-yellow-600 flex items-center justify-center border-2 border-white/20">
                                            <span className="text-2xl font-bold text-white">
                                                {authorName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-2xl font-bold text-white mb-1">{authorName}</h3>
                                        {authorInfo.occupation && (
                                            <p className="text-sm text-seereal-accent font-medium mb-1">{authorInfo.occupation}</p>
                                        )}
                                        {authorInfo.age && (
                                            <p className="text-sm text-white/50">Age: {authorInfo.age}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Biography */}
                                {authorInfo.bio && (
                                    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-2">
                                            Biography
                                        </h4>
                                        <p className="text-sm leading-relaxed text-white/80">{authorInfo.bio}</p>
                                    </div>
                                )}

                                {/* Social Links */}
                                {authorInfo.socialLinks && authorInfo.socialLinks.length > 0 && (
                                    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">
                                            Social & Professional Links
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {authorInfo.socialLinks.map((link, idx) => (
                                                <a
                                                    key={idx}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90 hover:bg-white/20 transition-colors border border-white/10"
                                                >
                                                    <span>{link.platform}</span>
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        width="14"
                                                        height="14"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                        <polyline points="15 3 21 3 21 9" />
                                                        <line x1="10" y1="14" x2="21" y2="3" />
                                                    </svg>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Other Articles */}
                                {authorInfo.articles && authorInfo.articles.length > 0 && (
                                    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">
                                            Other Articles ({authorInfo.articles.length})
                                        </h4>
                                        <div className="space-y-3 max-h-64 overflow-y-auto">
                                            {authorInfo.articles.map((article, idx) => (
                                                <a
                                                    key={idx}
                                                    href={article.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block rounded-lg bg-white/[0.04] p-3 hover:bg-white/[0.08] transition-colors border border-white/5"
                                                >
                                                    <p className="text-sm font-medium text-white/90 mb-1 line-clamp-2">
                                                        {article.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-white/50">
                                                        {article.source && <span>{article.source}</span>}
                                                        {article.source && article.date && <span>•</span>}
                                                        {article.date && <span>{article.date}</span>}
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* No additional info message */}
                                {!authorInfo.bio && !authorInfo.occupation && !authorInfo.articles?.length && !authorInfo.socialLinks?.length && (
                                    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-6 text-center">
                                        <p className="text-white/60">
                                            Limited information available for this author.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
