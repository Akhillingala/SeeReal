/**
 * SeeReal - Article insights overlay
 * 75% viewport transparent overlay with 3D-style metrics and radar chart
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractArticle, type ExtractedArticle } from '../lib/utils/article-parser';
import { HistoryView } from './HistoryView';
import { AuthorProfile } from './AuthorProfile';
import { CitationsView } from './CitationsView';
import { DebateCardsView } from './DebateCardsView';
import type { ArticleRecord } from '../lib/storage/types';

interface BiasResult {
  left_right: number;
  auth_lib: number;
  nat_glob: number;
  objectivity: number;
  sensationalism: number;
  clarity: number;
  tone_calm_urgent: number;
  confidence: number;
  reasoning: string;
}

interface AnalysisState {
  status: 'idle' | 'loading' | 'success' | 'error';
  bias?: BiasResult;
  error?: string;
}

type ViewMode = 'minimized' | 'expanded';
type TabMode = 'analysis' | 'history' | 'citations' | 'debate-cards';

type VideoState = 'idle' | 'generating' | 'success' | 'error';

export function Overlay2D() {
  const [viewMode, setViewMode] = useState<ViewMode>('minimized');
  const [tabMode, setTabMode] = useState<TabMode>('analysis');
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: 'idle' });
  const [article, setArticle] = useState<ExtractedArticle | null>(null);
  const [videoState, setVideoState] = useState<VideoState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [showAuthorProfile, setShowAuthorProfile] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const runAnalysis = useCallback(async () => {
    const extracted = extractArticle();
    if (!extracted) {
      setAnalysis({
        status: 'error',
        error: 'Could not extract article content from this page.',
      });
      setArticle(null);
      return;
    }

    setArticle(extracted);
    setAnalysis({ status: 'loading' });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_ARTICLE',
        payload: {
          text: extracted.text,
          url: extracted.url,
          title: extracted.title,
          author: extracted.author,
          source: extracted.source,
        },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      setAnalysis({
        status: 'success',
        bias: response.bias,
      });
      setViewMode('expanded');

      // Fetch related articles
      setLoadingRelated(true);
      setRelatedArticles([]);
      chrome.runtime.sendMessage({
        type: 'FETCH_RELATED_ARTICLES',
        payload: {
          title: extracted.title,
          source: extracted.source,
        },
      }).then((res) => {
        setRelatedArticles(res?.relatedArticles || []);
      }).catch((err) => {
        console.warn('Failed to fetch related articles:', err);
      }).finally(() => {
        setLoadingRelated(false);
      });
    } catch (err) {
      setAnalysis({
        status: 'error',
        error: err instanceof Error ? err.message : 'Analysis failed.',
      });
    }
  }, []);

  useEffect(() => {
    const extracted = extractArticle();
    if (extracted) {
      setArticle(extracted);
    }
  }, []);

  useEffect(() => {
    const handler = () => runAnalysis();
    document.addEventListener('seereal-run-analysis', handler);
    return () => document.removeEventListener('seereal-run-analysis', handler);
  }, [runAnalysis]);

  const openOverlay = () => {
    setViewMode('expanded');
    setTabMode('analysis');
    if (analysis.status === 'idle') runAnalysis();
  };

  const handleSelectHistoryArticle = (record: ArticleRecord) => {
    setArticle({
      title: record.title,
      url: record.url,
      author: record.author,
      source: record.source,
      authorImageUrl: undefined,
      text: '', // Text isn't stored in history currently
    });
    setAnalysis({
      status: 'success',
      bias: record.bias,
    });
    setTabMode('analysis');
  };

  const runGenerateVideo = useCallback(async () => {
    const extracted = extractArticle();
    if (!extracted || analysis.status !== 'success' || !analysis.bias) {
      setVideoError('Analyze the article first.');
      setVideoState('error');
      return;
    }
    setVideoState('generating');
    setVideoError(null);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_VIDEO',
        payload: {
          title: extracted.title,
          excerpt: extracted.excerpt ?? extracted.text.slice(0, 300),
          reasoning: analysis.bias.reasoning,
        },
      });
      if (response === undefined) {
        throw new Error('Extension did not respond. Try refreshing the page.');
      }
      if (response?.error) throw new Error(response.error);
      const { videoBase64, mimeType } = response as { videoBase64: string; mimeType: string };
      if (!videoBase64) throw new Error('No video data returned.');
      const binary = Uint8Array.from(atob(videoBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([binary], { type: mimeType || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setVideoState('success');
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Video generation failed.');
      setVideoState('error');
    }
  }, [analysis.status, analysis.bias, videoUrl]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  return (
    <>
      <div className="seereal-overlay fixed bottom-6 right-6 z-[2147483647] font-sans">
        <AnimatePresence mode="wait">
          {viewMode === 'minimized' && (
            <motion.button
              key="minimized"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={openOverlay}
              className="seereal-btn-minimize flex h-14 w-14 items-center justify-center rounded-2xl bg-black/95 text-seereal-accent shadow-neon backdrop-blur-glass border border-white/25"
              title="SeeReal - Article insights"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </motion.button>
          )}

          {viewMode === 'expanded' && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed left-[7.5vw] top-[7.5vh] z-[2147483647] flex w-[85vw] h-[85vh] flex-col rounded-2xl border border-white/15 bg-black/95 shadow-2xl backdrop-blur-xl"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-white/20 px-4 py-3 bg-white/[0.03]">
                <div className="flex items-center gap-4">
                  <img src={chrome.runtime.getURL('logo.svg')} alt="SeeReal" className="h-8 w-auto object-contain" />
                  <div className="flex gap-1 rounded-lg bg-white/10 p-1">
                    <button
                      onClick={() => setTabMode('analysis')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tabMode === 'analysis'
                        ? 'bg-seereal-accent text-black'
                        : 'text-white/70 hover:text-white'
                        }`}
                    >
                      Analysis
                    </button>
                    <button
                      onClick={() => setTabMode('history')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tabMode === 'history'
                        ? 'bg-seereal-accent text-black'
                        : 'text-white/70 hover:text-white'
                        }`}
                    >
                      History
                    </button>
                    <button
                      onClick={() => setTabMode('debate-cards')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tabMode === 'debate-cards'
                        ? 'bg-seereal-accent text-black'
                        : 'text-white/70 hover:text-white'
                        }`}
                    >
                      Debate Cards
                    </button>
                  </div>
                </div>

                {/* Political Leaning Bar in Header */}
                {analysis.status === 'success' && analysis.bias && (
                  <div className="flex-1 max-w-md mx-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">Political Leaning</span>
                      <span className="text-[10px] font-bold text-seereal-accent uppercase tracking-tight">
                        {getMetricTerm('left_right', analysis.bias.left_right)}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                      {analysis.bias.left_right < 0 && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.abs(analysis.bias.left_right) / 2}%` }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                          className="absolute right-1/2 h-full bg-gradient-to-r from-yellow-600 to-yellow-400"
                        />
                      )}
                      {analysis.bias.left_right > 0 && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${analysis.bias.left_right / 2}%` }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                          className="absolute left-1/2 h-full bg-gradient-to-r from-yellow-400 to-yellow-600"
                        />
                      )}
                      <div className="absolute left-1/2 top-0 h-full w-0.5 bg-white/40 -ml-px" />
                    </div>
                    <div className="flex items-center justify-between mt-1 px-0.5">
                      <span className="text-[9px] text-white/40 font-medium tracking-tight">Left</span>
                      <span className="text-[9px] text-white/40 font-medium tracking-tight">Right</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTabMode('citations')}
                    className={`seereal-hover-btn rounded-lg px-3 py-2 text-sm transition-colors ${tabMode === 'citations'
                      ? 'bg-seereal-accent text-black font-medium'
                      : 'bg-white/15 text-white/90 hover:bg-white/25'
                      }`}
                  >
                    Citations
                  </button>
                  {tabMode === 'analysis' && (
                    <button
                      onClick={() => runAnalysis()}
                      className="seereal-hover-btn rounded-lg bg-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/25"
                    >
                      Re-analyze
                    </button>
                  )}
                  <button
                    onClick={() => setViewMode('minimized')}
                    className="seereal-hover-btn rounded-lg bg-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/25"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Article context: AI badge, author, source — only when success */}
              {analysis.status === 'success' && article && (
                <div className="shrink-0 border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center gap-3 bg-white/[0.02]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-seereal-accent/20 px-2.5 py-1 text-xs font-medium text-seereal-accent border border-seereal-accent/40">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Insights powered by AI
                  </span>
                  {(article.author || article.authorImageUrl) && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (article.author) {
                          setShowAuthorProfile(true);
                        }
                      }}
                      disabled={!article.author}
                      className="flex items-center gap-2 min-w-0 rounded-lg px-2 py-1 -ml-2 hover:bg-white/10 transition-colors disabled:cursor-default disabled:hover:bg-transparent group cursor-pointer"
                      title={article.author ? `View ${article.author}'s profile` : undefined}
                    >
                      {article.authorImageUrl ? (
                        <img
                          src={article.authorImageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover border border-white/20 bg-white/10"
                        />
                      ) : article.author ? (
                        <img
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(article.author)}&size=64&background=0D9488&color=fff&bold=true`}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover border border-white/20 bg-white/10"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
                          <span className="text-white/60 text-xs font-medium">?</span>
                        </div>
                      )}
                      <div className="min-w-0 flex items-center gap-1.5">
                        <div className="min-w-0">
                          {article.author && (
                            <p className="text-xs font-medium text-white/90 truncate group-hover:text-seereal-accent transition-colors">
                              {article.author}
                            </p>
                          )}
                          {article.source && (
                            <p className="text-[11px] text-white/50 truncate">{article.source}</p>
                          )}
                        </div>
                        {article.author && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="shrink-0 text-white/40 group-hover:text-seereal-accent transition-colors"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}
                  {article.source && !article.author && !article.authorImageUrl && (
                    <span className="text-[11px] text-white/50">{article.source}</span>
                  )}
                </div>
              )}

              {/* Content area: left list scrolls, radar fixed top-right */}
              <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
                {tabMode === 'history' ? (
                  <HistoryView
                    onSelectArticle={handleSelectHistoryArticle}
                    onClose={() => setTabMode('analysis')}
                  />
                ) : tabMode === 'debate-cards' ? (
                  <div className="min-h-0 flex-1 overflow-hidden flex flex-col p-3 md:p-4">
                    {article ? (
                      <DebateCardsView article={article as any} />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <p className="text-white/60">No article detected to generate cards.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-hidden flex flex-col p-3 md:p-4">
                    {tabMode === 'citations' ? (
                      article ? (
                        <CitationsView article={article} />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-center">
                          <p className="text-white/60">Analyze an article to generate citations.</p>
                        </div>
                      )
                    ) : (
                      <>
                        {analysis.status === 'idle' && (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                            <p className="mb-4 text-base text-white/90">
                              {article ? 'Click below to analyze this article' : 'No article detected on this page.'}
                            </p>
                            <button
                              onClick={runAnalysis}
                              disabled={!article}
                              className="seereal-hover-btn rounded-xl bg-yellow-600 px-8 py-3 text-base font-semibold text-white disabled:opacity-50 hover:bg-yellow-500 shadow-lg"
                            >
                              Analyze article
                            </button>
                          </div>
                        )}

                        {analysis.status === 'loading' && (
                          <div className="flex flex-col items-center justify-center gap-4 py-10">
                            <div className="h-12 w-12 animate-spin rounded-full border-4 border-seereal-accent/30 border-t-seereal-accent" />
                            <p className="text-base text-white/80">Analyzing article...</p>
                            <div className="grid w-full max-w-sm grid-cols-3 gap-2">
                              {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="h-16 rounded-lg bg-white/10 animate-pulse" />
                              ))}
                            </div>
                          </div>
                        )}

                        {analysis.status === 'error' && (
                          <div className="rounded-xl border-2 border-seereal-danger/50 bg-seereal-danger/10 p-4 max-w-lg">
                            <p className="text-base font-medium text-seereal-danger">{analysis.error}</p>
                            <p className="mt-1.5 text-xs text-white/70">Add your Gemini API key in the extension popup.</p>
                            <button
                              onClick={runAnalysis}
                              className="seereal-hover-btn mt-3 rounded-lg bg-white/25 px-4 py-2 text-sm font-medium text-white hover:bg-white/35"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {analysis.status === 'success' && analysis.bias && (
                          <ArticleInsightsDisplay
                            bias={analysis.bias}
                            relatedArticles={relatedArticles}
                            loadingRelated={loadingRelated}
                            className="min-h-0 flex-1 flex"
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Video section: player when success, or inline error */}
              {videoState === 'success' && videoUrl && (
                <div className="shrink-0 border-t border-white/20 px-4 py-3 bg-white/[0.03]">
                  <p className="text-xs font-medium uppercase tracking-wider text-white/50 mb-1.5">
                    Short clip (&lt;15s)
                  </p>
                  <video
                    src={videoUrl}
                    controls
                    className="w-full max-h-40 rounded-lg border border-white/10 bg-black/50"
                    preload="metadata"
                  />
                  <a
                    href={videoUrl}
                    download="seereal-article-clip.mp4"
                    className="mt-1.5 inline-block text-sm text-seereal-accent hover:underline"
                  >
                    Download clip
                  </a>
                </div>
              )}
              {videoState === 'error' && videoError && (
                <div className="shrink-0 border-t border-white/20 px-4 py-2 bg-seereal-danger/10">
                  <p className="text-sm text-seereal-danger">{videoError}</p>
                </div>
              )}

              {/* Footer with Generate video */}
              <div className="shrink-0 border-t border-white/20 px-4 py-3 flex items-center justify-between bg-white/[0.03]">
                <p className="text-xs text-white/50">Article insights · SeeReal</p>
                <button
                  type="button"
                  onClick={runGenerateVideo}
                  disabled={videoState === 'generating'}
                  title={
                    analysis.status !== 'success'
                      ? 'Analyze the article first to generate a short clip'
                      : undefined
                  }
                  className="seereal-hover-btn rounded-xl bg-white/25 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/35 border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {videoState === 'generating'
                    ? 'Generating clip…'
                    : analysis.status !== 'success'
                      ? 'Generate video (analyze first)'
                      : 'Generate video'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Author Profile Modal */}
      {showAuthorProfile && article?.author && (
        <AuthorProfile
          authorName={article.author}
          authorImageUrl={article.authorImageUrl}
          onClose={() => setShowAuthorProfile(false)}
        />
      )}
    </>
  );
}

/** Normalize -100..100 to 0..100 for radar */
function toRadarScale(v: number): number {
  return Math.round(((v + 100) / 200) * 100);
}

function getMetricTerm(key: string, value: number): string {
  if (key === 'left_right') {
    if (value <= -80) return 'Far Left';
    if (value <= -40) return 'Left';
    if (value <= -15) return 'Center-Left';
    if (value < 15) return 'Center';
    if (value < 40) return 'Center-Right';
    if (value < 80) return 'Right';
    return 'Far Right';
  }
  if (key === 'auth_lib') {
    if (value <= -40) return 'Authoritarian';
    if (value <= -15) return 'Auth-Leaning';
    if (value < 15) return 'Balanced';
    if (value < 40) return 'Lib-Leaning';
    return 'Libertarian';
  }
  if (key === 'nat_glob') {
    if (value <= -40) return 'Nationalist';
    if (value <= -15) return 'Nat-Leaning';
    if (value < 15) return 'Balanced';
    if (value < 40) return 'Glob-Leaning';
    return 'Globalist';
  }
  if (key === 'tone_calm_urgent') {
    if (value <= -40) return 'Very Calm';
    if (value <= -15) return 'Calm';
    if (value < 15) return 'Measured';
    if (value < 40) return 'Urgent';
    return 'Alarming';
  }
  // 0-100 metrics
  if (value < 20) return 'Very Low';
  if (value < 40) return 'Low';
  if (value < 60) return 'Moderate';
  if (value < 80) return 'High';
  return 'Very High';
}

function getSourceColor(source: string): { bg: string; text: string } {
  const s = source.toLowerCase();
  if (s.includes('cnn')) return { bg: 'rgba(204, 0, 0, 0.2)', text: '#ff4d4d' };
  if (s.includes('fox')) return { bg: 'rgba(0, 51, 102, 0.4)', text: '#66b2ff' };
  if (s.includes('bbc')) return { bg: 'rgba(187, 25, 25, 0.2)', text: '#ff6666' };
  if (s.includes('reuters')) return { bg: 'rgba(255, 128, 0, 0.15)', text: '#ff9933' };
  if (s.includes('nytimes') || s.includes('york times')) return { bg: 'rgba(255, 255, 255, 0.1)', text: '#ffffff' };
  if (s.includes('wsj') || s.includes('wall street')) return { bg: 'rgba(0, 128, 128, 0.2)', text: '#40e0d0' };
  if (s.includes('guardian')) return { bg: 'rgba(5, 41, 98, 0.4)', text: '#6699ff' };
  if (s.includes('al jazeera')) return { bg: 'rgba(193, 139, 39, 0.2)', text: '#eec170' };
  if (s.includes('bloomberg')) return { bg: 'rgba(0, 0, 255, 0.2)', text: '#6666ff' };
  if (s.includes('npr')) return { bg: 'rgba(36, 114, 181, 0.2)', text: '#66b2ff' };
  return { bg: 'rgba(255, 255, 255, 0.1)', text: 'rgba(255, 255, 255, 0.7)' };
}


function ArticleInsightsDisplay({ bias, relatedArticles, loadingRelated, className = '' }: { bias: BiasResult; relatedArticles: any[]; loadingRelated: boolean; className?: string }) {
  const [hoveredMetric, setHoveredMetric] = useState<{ label: string; description: string; x: number; y: number; showAbove: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const metrics = [
    {
      key: 'auth_lib',
      label: 'Auth. ↔ Libertarian',
      value: bias.auth_lib,
      range: 'bipolar' as const,
      description: 'Measures the balance between government authority and individual liberty.'
    },
    {
      key: 'nat_glob',
      label: 'National ↔ Global',
      value: bias.nat_glob,
      range: 'bipolar' as const,
      description: 'Contrast between national interests and global cooperation/perspectives.'
    },
    {
      key: 'objectivity',
      label: 'Objectivity',
      value: bias.objectivity,
      range: '0-100' as const,
      description: 'Indicates how factual and neutral the writing is (vs. opinionated).'
    },
    {
      key: 'sensationalism',
      label: 'Sensationalism',
      value: bias.sensationalism,
      range: '0-100' as const,
      description: 'Measures the use of emotional, dramatic, or clickbait language.'
    },
    {
      key: 'clarity',
      label: 'Clarity',
      value: bias.clarity,
      range: '0-100' as const,
      description: 'Evaluates how clear, well-structured, and easy to understand the text is.'
    },
    {
      key: 'tone_calm_urgent',
      label: 'Calm ↔ Urgent',
      value: bias.tone_calm_urgent,
      range: 'bipolar' as const,
      description: 'Assesses the emotional tone, from measured/calm to alarmist/urgent.'
    },
  ];

  const radarValues = metrics.map((m) =>
    m.range === 'bipolar' ? toRadarScale(m.value) : m.value
  );
  const center = 175;
  const radius = 140;
  const points = metrics.map((_, i) => {
    const angle = (i / metrics.length) * 2 * Math.PI - Math.PI / 2;
    const r = (radarValues[i] / 100) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  });
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const axisPoints = metrics.map((_, i) => {
    const angle = (i / metrics.length) * 2 * Math.PI - Math.PI / 2;
    return { x2: center + radius * Math.cos(angle), y2: center + radius * Math.sin(angle) };
  });

  return (
    <div ref={containerRef} className={`flex min-h-0 gap-3 relative ${className}`}>
      {/* Tooltip Portal-like rendering */}
      <AnimatePresence>
        {hoveredMetric && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              left: hoveredMetric.x,
              top: hoveredMetric.showAbove ? 'auto' : hoveredMetric.y + 4,
              bottom: hoveredMetric.showAbove ? (containerRef.current ? containerRef.current.offsetHeight - hoveredMetric.y + 24 : 0) : 'auto',
              zIndex: 50,
              pointerEvents: 'none',
            }}
            className="w-64 rounded-xl border border-white/20 bg-black/90 p-3 shadow-2xl backdrop-blur-md"
          >
            <p className="mb-1 text-xs font-bold text-seereal-accent uppercase tracking-wider">{hoveredMetric.label}</p>
            <p className="text-xs text-white/90 leading-relaxed">{hoveredMetric.description}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left: scrollable list of content boxes */}
      <div className="min-w-0 flex-1 overflow-y-auto pr-1">


        {/* Confidence moved up */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Confidence {bias.confidence}%
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-seereal-accent"
              initial={{ width: 0 }}
              animate={{ width: `${bias.confidence}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <section className="mb-4 rounded-lg border border-white/10 bg-white/[0.06] p-2.5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
            AI reasoning
          </h3>
          <p className="text-xs leading-relaxed text-white/75">{bias.reasoning}</p>
        </section>



        {/* Related Coverage Section */}
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
            Related Coverage
          </h3>
          {loadingRelated ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : relatedArticles.length > 0 ? (
            <div className="space-y-2">
              {relatedArticles.map((article: any, i: number) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-white/10 bg-white/[0.04] p-2.5 transition-colors hover:bg-white/[0.08] hover:border-white/20 group"
                >
                  <p className="text-sm font-medium text-white/90 group-hover:text-seereal-accent truncate">
                    {article.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    {(() => {
                      const colors = getSourceColor(article.source);
                      return (
                        <span
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                          className="px-1.5 py-0.5 rounded font-semibold tracking-tight uppercase text-[9px]"
                        >
                          {article.source}
                        </span>
                      );
                    })()}
                    <span className="text-white/40">{article.date}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40 italic">No related articles found.</p>
          )}
        </section>
      </div>

      {/* Right Column: Insights overview radar & metrics */}
      <section className="seereal-metric-row shrink-0 w-[280px] rounded-xl border border-white/10 bg-white/[0.06] p-3 flex flex-col max-h-full transition-transform duration-200">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
          Insights overview
        </h2>

        {/* Radar Chart - Smaller to fit better */}
        <div className="flex justify-center mb-2 shrink-0">
          <svg width="200" height="200" viewBox="0 0 350 350" className="overflow-visible">
            <defs>
              <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(255, 215, 0, 0.45)" />
                <stop offset="100%" stopColor="rgba(255, 215, 0, 0.12)" />
              </linearGradient>
              <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <circle
                key={r}
                cx={center}
                cy={center}
                r={radius * r}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1.5"
              />
            ))}
            {axisPoints.map((a, i) => (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={a.x2}
                y2={a.y2}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
            ))}
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              <polygon
                points={polygonPoints}
                fill="url(#radarFill)"
                stroke="rgba(255, 215, 0, 0.85)"
                strokeWidth="2"
                filter="url(#radarGlow)"
              />
            </motion.g>
            {metrics.map((m, i) => {
              const angle = (i / metrics.length) * 2 * Math.PI - Math.PI / 2;
              const labelR = radius + 32;
              const x = center + labelR * Math.cos(angle);
              const y = center + labelR * Math.sin(angle);
              return (
                <text
                  key={m.key}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  className="fill-white/40 text-[14px] font-medium"
                >
                  {m.label.split(' ↔ ')[0]}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Scrollable Metrics List Under Radar */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 scrollbar-custom">
          {metrics.map((m, i) => {
            const displayVal = getMetricTerm(m.key, m.value);
            return (
              <motion.div
                key={m.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="seereal-metric-row flex items-center justify-between rounded-md border border-white/5 bg-white/[0.04] px-2.5 py-1.5 transition-colors duration-200 hover:bg-white/10"
              >
                <span
                  className="text-xs text-white/70 truncate pr-2 cursor-help border-b border-dotted border-white/20 hover:text-white hover:border-white/40 transition-colors"
                  title={m.label}
                  onMouseEnter={(e) => {
                    if (containerRef.current) {
                      const containerRect = containerRef.current.getBoundingClientRect();
                      const targetRect = e.currentTarget.getBoundingClientRect();
                      const x = targetRect.left - containerRect.left;
                      const y = targetRect.bottom - containerRect.top;

                      // Calculate if we should show above (if in lower half of container)
                      const showAbove = y > containerRect.height / 2;

                      setHoveredMetric({
                        label: m.label,
                        description: m.description,
                        x,
                        y: showAbove ? targetRect.top - containerRect.top : y,
                        showAbove
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredMetric(null)}
                >
                  {m.label}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-seereal-accent">
                  {displayVal}
                </span>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
