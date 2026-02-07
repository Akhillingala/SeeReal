
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExtractedArticle } from '../lib/utils/article-parser';

type CitationFormat = 'APA' | 'MLA' | 'Chicago' | 'Harvard' | 'IEEE';

interface CitationsViewProps {
    article: ExtractedArticle;
}

export function CitationsView({ article }: CitationsViewProps) {
    const [format, setFormat] = useState<CitationFormat>('APA');
    const [copied, setCopied] = useState(false);

    const citation = useMemo(() => {
        return generateCitation(article, format);
    }, [article, format]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(citation);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy citation:', err);
        }
    };

    const formats: CitationFormat[] = ['APA', 'MLA', 'Chicago', 'Harvard', 'IEEE'];

    return (
        <div className="flex h-full flex-col">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {formats.map((fmt) => (
                    <button
                        key={fmt}
                        onClick={() => setFormat(fmt)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${format === fmt
                            ? 'bg-seereal-accent text-black'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'
                            }`}
                    >
                        {fmt}
                    </button>
                ))}
            </div>

            <div className="relative flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={format}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="font-serif text-sm leading-relaxed text-white/90 select-text break-words whitespace-pre-wrap"
                    >
                        {/* Render HTML for italics etc */}
                        <div dangerouslySetInnerHTML={{ __html: citation }} />
                    </motion.div>
                </AnimatePresence>

                <div className="absolute bottom-3 right-3">
                    <button
                        onClick={handleCopy}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${copied
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                            }`}
                    >
                        {copied ? (
                            <>
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                Copied!
                            </>
                        ) : (
                            <>
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                Copy text
                            </>
                        )}
                    </button>
                </div>
            </div>

            <p className="mt-3 text-[10px] text-white/40">
                *Citations are generated automatically based on available page metadata. Verify accuracy before use.
            </p>
        </div>
    );
}

function generateCitation(article: CitationsViewProps['article'], format: CitationFormat): string {
    const { title, url, author, date, source, publisher } = article;

    // Helpers
    const today = new Date();
    const accessDate = `${today.getDate()} ${today.toLocaleString('default', { month: 'short' })}. ${today.getFullYear()}`;
    const pubDateObj = date ? new Date(date) : null;
    const pubYear = pubDateObj ? pubDateObj.getFullYear() : 'n.d.';
    const pubDateFull = pubDateObj
        ? `${pubDateObj.getDate()} ${pubDateObj.toLocaleString('default', { month: 'long' })} ${pubDateObj.getFullYear()}`
        : 'n.d.';

    const authorParts = author ? author.split(' ') : [];
    const lastName = authorParts.length > 1 ? authorParts.pop() : author;
    const firstName = authorParts.join(' ');
    const authorFormatted = lastName && firstName
        ? `${lastName}, ${firstName[0]}.`
        : article.author || 'Anonymous'; // Default fallback

    const siteName = publisher || source || new URL(url).hostname;

    switch (format) {
        case 'APA':
            // Author, A. A. (Year, Month Day). Title of article. Site Name. URL
            return `${authorFormatted} (${pubYear}${pubDateObj ? ', ' + pubDateObj.toLocaleString('default', { month: 'long' }) + ' ' + pubDateObj.getDate() : ''}). <i>${title}</i>. ${siteName}. ${url}`;

        case 'MLA':
            // Author Last, First. "Title of Article." Website Name, Day Month Year, URL. Accessed Day Month Year.
            // Note: MLA 9 omits http://
            const cleanUrl = url.replace(/^https?:\/\//, '');
            return `${lastName && firstName ? `${lastName}, ${firstName}` : (article.author || 'Anonymous')}. "${title}." <i>${siteName}</i>, ${pubDateFull !== 'n.d.' ? pubDateFull : 'n.d.'}, ${cleanUrl}. Accessed ${today.getDate()} ${today.toLocaleString('default', { month: 'short' })}. ${today.getFullYear()}.`;

        case 'Chicago':
            // Last, First. "Title of Article." Website Name. Month Day, Year. URL.
            return `${lastName && firstName ? `${lastName}, ${firstName}` : (article.author || 'Anonymous')}. "${title}." ${siteName}. ${pubDateObj ? pubDateObj.toLocaleString('default', { month: 'long' }) + ' ' + pubDateObj.getDate() + ', ' + pubYear : 'n.d.'}. ${url}.`;

        case 'Harvard':
            // Last, Initial(s). (Year) 'Title of article', Site Name, Day Month (if available). Available at: URL (Accessed: Day Month Year).
            return `${authorFormatted} (${pubYear}) '${title}', <i>${siteName}</i>${pubDateObj ? ', ' + pubDateObj.getDate() + ' ' + pubDateObj.toLocaleString('default', { month: 'long' }) : ''}. Available at: ${url} (Accessed: ${accessDate}).`;

        case 'IEEE':
            // [1] A. Author, "Title of article," Site Name, Month. Day, Year. [Online]. Available: URL. [Accessed: Month. Day, Year].
            const ieeeAuthor = lastName && firstName ? `${firstName[0]}. ${lastName}` : (article.author || 'Anonymous');
            const ieeeDate = pubDateObj ? `${pubDateObj.toLocaleString('default', { month: 'short' })}. ${pubDateObj.getDate()}, ${pubYear}` : 'n.d.';
            const ieeeAccess = `${today.toLocaleString('default', { month: 'short' })}. ${today.getDate()}, ${today.getFullYear()}`;
            return `[1] ${ieeeAuthor}, "${title}," <i>${siteName}</i>, ${ieeeDate}. [Online]. Available: ${url}. [Accessed: ${ieeeAccess}].`;

        default:
            return '';
    }
}
