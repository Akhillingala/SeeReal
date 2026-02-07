/**
 * CReal - Extension Popup
 * API key configuration and quick actions
 */

declare const __GEMINI_API_KEY_FROM_ENV__: string | undefined;

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/globals.css';

const STORAGE_KEY = 'geminiApiKey';

function Popup() {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const key = data[STORAGE_KEY] ?? '';
      setApiKey(key);
      // Key is configured if: saved in storage OR from .env.local at build time
      const fromEnv = typeof __GEMINI_API_KEY_FROM_ENV__ !== 'undefined' && __GEMINI_API_KEY_FROM_ENV__?.trim();
      setHasKey(!!key.trim() || !!fromEnv);
    });
  }, []);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const key = apiKey.trim();
    if (!key) {
      setStatus('error');
      setErrorMsg('Please enter an API key.');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }
    setStatus('saving');
    setErrorMsg('');
    chrome.storage.local.set({ [STORAGE_KEY]: key }, () => {
      if (chrome.runtime.lastError) {
        setStatus('error');
        setErrorMsg(chrome.runtime.lastError?.message ?? 'Failed to save');
      } else {
        setStatus('saved');
        setHasKey(true);
        setShowKeyForm(false);
      }
      setTimeout(() => setStatus('idle'), 3000);
    });
  };

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_ANALYSIS' });
      window.close();
    }
  };

  if (hasKey && !showKeyForm) {
    return (
      <div className="w-96 bg-[#0a0a14] p-5 font-sans text-white">
        <h1 className="mb-5 text-xl font-bold text-[#00D9FF]">CReal</h1>
        <p className="mb-5 text-base text-white/80">Key configured ✓</p>
        <button
          type="button"
          onClick={handleAnalyze}
          className="mb-4 w-full rounded-xl bg-cyan-700 py-3.5 text-base font-semibold text-white hover:bg-cyan-600 transition-colors"
        >
          Analyze this page
        </button>
        <button
          type="button"
          onClick={() => setShowKeyForm(true)}
          className="w-full rounded-lg bg-white/10 py-2 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        >
          Change API key
        </button>
      </div>
    );
  }

  return (
    <div className="w-96 bg-[#0a0a14] p-5 font-sans text-white">
      <h1 className="mb-5 text-xl font-bold text-[#00D9FF]">CReal</h1>
      <p className="mb-4 text-base text-white/80">
        Add your Gemini API key to enable bias analysis:
      </p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="AIza..."
        className="mb-4 w-full rounded-lg border-2 border-white/20 bg-white/5 px-4 py-3 text-base text-white placeholder-white/40 focus:border-[#00D9FF] focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={status === 'saving'}
        className="w-full rounded-xl bg-cyan-700 py-3.5 text-base font-semibold text-white hover:bg-cyan-600 disabled:opacity-70 transition-colors"
      >
        {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved!' : 'Save API Key'}
      </button>
      {status === 'error' && (
        <p className="mt-2 text-xs text-[#FF0055]">{errorMsg}</p>
      )}
      <p className="mt-4 text-sm text-white/50">
        Get your key at{' '}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#00D9FF] hover:underline"
        >
          Google AI Studio
        </a>
      </p>
      {hasKey && (
        <button
          type="button"
          onClick={() => setShowKeyForm(false)}
          className="mt-3 w-full rounded-lg bg-white/10 py-2 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

const root = document.getElementById('popup-root');
if (root) {
  createRoot(root).render(<Popup />);
}
