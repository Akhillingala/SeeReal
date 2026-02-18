/**
 * SeeReal - Extension Popup
 * Streamlined UI with overlay toggle
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/globals.css';

const OVERLAY_ENABLED_KEY = 'overlayEnabled';

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      style={{ WebkitAppearance: 'none' }}
      className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 transition-all duration-300 focus:outline-none ${enabled ? 'border-yellow-500 bg-yellow-500' : 'border-white/20 bg-white/10'
        }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${enabled ? 'translate-x-7' : 'translate-x-0.5'
          }`}
      />
    </button>
  );
}

function Popup() {
  const [overlayEnabled, setOverlayEnabled] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(OVERLAY_ENABLED_KEY, (data) => {
      setOverlayEnabled(data[OVERLAY_ENABLED_KEY] !== false);
    });
  }, []);

  const handleToggle = (enabled: boolean) => {
    setOverlayEnabled(enabled);
    chrome.storage.local.set({ [OVERLAY_ENABLED_KEY]: enabled });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY', enabled }).catch(() => { });
      }
    });
  };

  const handleAnalyze = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_ANALYSIS' });
      window.close();
    }
  };

  return (
    <div className="w-72 bg-[#0a0a14] font-sans text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10">
        <img
          src={chrome.runtime.getURL('logo.svg')}
          alt="SeeReal"
          className="h-8 w-auto object-contain shrink-0"
        />
        <div>
          <p className="text-sm font-bold text-white leading-tight">SeeReal</p>
          <p className="text-[11px] text-white/40 leading-tight">News Transparency</p>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Toggle */}
        <div className="flex items-center justify-between rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Corner Widget</p>
            <p className="text-[11px] text-white/50 mt-0.5">
              {overlayEnabled ? 'Visible on all pages' : 'Hidden on all pages'}
            </p>
          </div>
          <ToggleSwitch enabled={overlayEnabled} onChange={handleToggle} />
        </div>

        {/* Analyze button */}
        <button
          type="button"
          onClick={handleAnalyze}
          className="w-full rounded-xl bg-yellow-600 py-3 text-sm font-semibold text-white hover:bg-yellow-500 transition-colors"
        >
          Analyze this page
        </button>
      </div>

      {/* Footer */}
      <p className="pb-3 text-center text-[10px] text-white/20">Powered by Gemini AI</p>
    </div>
  );
}

const root = document.getElementById('popup-root');
if (root) {
  createRoot(root).render(<Popup />);
}
