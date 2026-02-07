/**
 * CReal - Article insights overlay
 * 75% viewport transparent overlay with 3D-style metrics and radar chart
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractArticle } from '../lib/utils/article-parser';

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

type VideoState = 'idle' | 'generating' | 'success' | 'error';

export function Overlay2D() {
  const [viewMode, setViewMode] = useState<ViewMode>('minimized');
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: 'idle' });
  const [article, setArticle] = useState<{ title: string; url: string } | null>(null);
  const [videoState, setVideoState] = useState<VideoState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

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

    setArticle({ title: extracted.title, url: extracted.url });
    setAnalysis({ status: 'loading' });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_ARTICLE',
        payload: {
          text: extracted.text,
          url: extracted.url,
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
      setArticle({ title: extracted.title, url: extracted.url });
    }
  }, []);

  useEffect(() => {
    const handler = () => runAnalysis();
    document.addEventListener('creal-run-analysis', handler);
    return () => document.removeEventListener('creal-run-analysis', handler);
  }, [runAnalysis]);

  const openOverlay = () => {
    setViewMode('expanded');
    if (analysis.status === 'idle') runAnalysis();
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
    <div className="creal-overlay fixed bottom-6 right-6 z-[2147483647] font-sans">
      <AnimatePresence mode="wait">
        {viewMode === 'minimized' && (
          <motion.button
            key="minimized"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={openOverlay}
            className="creal-btn-minimize flex h-20 w-20 items-center justify-center rounded-2xl bg-black/75 text-creal-accent shadow-neon backdrop-blur-glass border border-white/25"
            title="CReal - Article insights"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
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
            className="fixed left-[12.5vw] top-[12.5vh] z-[2147483647] flex w-[75vw] h-[75vh] flex-col rounded-2xl border border-white/15 bg-black/72 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/20 px-6 py-4 bg-white/[0.03]">
              <span className="text-xl font-bold tracking-tight text-creal-accent">CReal</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => runAnalysis()}
                  className="rounded-lg bg-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/25 transition-colors"
                >
                  Re-analyze
                </button>
                <button
                  onClick={() => setViewMode('minimized')}
                  className="rounded-lg bg-white/15 px-3 py-2 text-sm text-white/90 hover:bg-white/25 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Content area: left list scrolls, radar fixed top-right */}
            <div className="min-h-0 flex-1 overflow-hidden flex flex-col p-4 md:p-5">
              {analysis.status === 'idle' && (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                  <p className="mb-6 text-lg text-white/90">
                    {article ? 'Click below to analyze this article' : 'No article detected on this page.'}
                  </p>
                  <button
                    onClick={runAnalysis}
                    disabled={!article}
                    className="rounded-xl bg-cyan-600 px-10 py-4 text-lg font-semibold text-white disabled:opacity-50 hover:bg-cyan-500 transition-colors shadow-lg"
                  >
                    Analyze article
                  </button>
                </div>
              )}

              {analysis.status === 'loading' && (
                <div className="flex flex-col items-center justify-center gap-6 py-16">
                  <div className="h-14 w-14 animate-spin rounded-full border-4 border-creal-accent/30 border-t-creal-accent" />
                  <p className="text-lg text-white/80">Analyzing article...</p>
                  <div className="grid w-full max-w-md grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-24 rounded-xl bg-white/10 animate-pulse" />
                    ))}
                  </div>
                </div>
              )}

              {analysis.status === 'error' && (
                <div className="rounded-xl border-2 border-creal-danger/50 bg-creal-danger/10 p-6 max-w-lg">
                  <p className="text-lg font-medium text-creal-danger">{analysis.error}</p>
                  <p className="mt-2 text-sm text-white/70">Add your Gemini API key in the extension popup.</p>
                  <button
                    onClick={runAnalysis}
                    className="mt-4 rounded-lg bg-white/25 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/35 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {analysis.status === 'success' && analysis.bias && (
                <ArticleInsightsDisplay bias={analysis.bias} className="min-h-0 flex-1 flex" />
              )}
            </div>

            {/* Video section: player when success, or inline error */}
            {videoState === 'success' && videoUrl && (
              <div className="shrink-0 border-t border-white/20 px-6 py-4 bg-white/[0.03]">
                <p className="text-xs font-medium uppercase tracking-wider text-white/50 mb-2">
                  Short clip (&lt;15s)
                </p>
                <video
                  src={videoUrl}
                  controls
                  className="w-full max-h-48 rounded-lg border border-white/10 bg-black/50"
                  preload="metadata"
                />
                <a
                  href={videoUrl}
                  download="creal-article-clip.mp4"
                  className="mt-2 inline-block text-sm text-creal-accent hover:underline"
                >
                  Download clip
                </a>
              </div>
            )}
            {videoState === 'error' && videoError && (
              <div className="shrink-0 border-t border-white/20 px-6 py-2 bg-creal-danger/10">
                <p className="text-sm text-creal-danger">{videoError}</p>
              </div>
            )}

            {/* Footer with Generate video */}
            <div className="shrink-0 border-t border-white/20 px-6 py-4 flex items-center justify-between bg-white/[0.03]">
              <p className="text-sm text-white/50">Article insights · CReal</p>
              <button
                type="button"
                onClick={runGenerateVideo}
                disabled={videoState === 'generating'}
                title={
                  analysis.status !== 'success'
                    ? 'Analyze the article first to generate a short clip'
                    : undefined
                }
                className="rounded-xl bg-white/25 px-6 py-3 text-sm font-semibold text-white hover:bg-white/35 transition-colors border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}

/** Normalize -100..100 to 0..100 for radar */
function toRadarScale(v: number): number {
  return Math.round(((v + 100) / 200) * 100);
}

function ArticleInsightsDisplay({ bias, className = '' }: { bias: BiasResult; className?: string }) {
  const metrics = [
    { key: 'left_right', label: 'Left ↔ Right', value: bias.left_right, range: 'bipolar' as const },
    { key: 'auth_lib', label: 'Auth. ↔ Libertarian', value: bias.auth_lib, range: 'bipolar' as const },
    { key: 'nat_glob', label: 'National ↔ Global', value: bias.nat_glob, range: 'bipolar' as const },
    { key: 'objectivity', label: 'Objectivity', value: bias.objectivity, range: '0-100' as const },
    { key: 'sensationalism', label: 'Sensationalism', value: bias.sensationalism, range: '0-100' as const },
    { key: 'clarity', label: 'Clarity', value: bias.clarity, range: '0-100' as const },
    { key: 'tone_calm_urgent', label: 'Calm ↔ Urgent', value: bias.tone_calm_urgent, range: 'bipolar' as const },
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
    <div className={`flex min-h-0 gap-4 ${className}`}>
      {/* Left: scrollable list of metric boxes */}
      <div className="min-w-0 flex-1 overflow-y-auto pr-2">
        <div className="space-y-2">
          {metrics.map((m, i) => {
            const isBipolar = m.range === 'bipolar';
            const displayVal = isBipolar ? (m.value > 0 ? '+' : '') + m.value : `${m.value}%`;
            return (
              <motion.div
                key={m.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5"
              >
                <span className="text-sm text-white/85 truncate pr-2" title={m.label}>
                  {m.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                  {displayVal}
                </span>
              </motion.div>
            );
          })}
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-white/50">
          Confidence {bias.confidence}%
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-creal-accent"
            initial={{ width: 0 }}
            animate={{ width: `${bias.confidence}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.06] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
            AI reasoning
          </h3>
          <p className="text-xs leading-relaxed text-white/75">{bias.reasoning}</p>
        </section>
      </div>

      {/* Top right: Insights overview radar */}
      <section className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] p-4 self-start">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
          Insights overview
        </h2>
        <svg width="240" height="240" viewBox="0 0 350 350" className="overflow-visible">
          <defs>
            <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(0, 217, 255, 0.45)" />
              <stop offset="100%" stopColor="rgba(0, 217, 255, 0.12)" />
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
              stroke="rgba(0, 217, 255, 0.85)"
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
                className="fill-white/50 text-[9px] font-medium"
              >
                {m.label.split(' ↔ ')[0]}
              </text>
            );
          })}
        </svg>
      </section>
    </div>
  );
}
