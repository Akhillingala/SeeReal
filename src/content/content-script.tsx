/**
 * SeeReal - Content Script
 * Injected into news pages; extracts article content and injects overlay
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { extractArticle } from '../lib/utils/article-parser';
import { Overlay2D } from './Overlay2D';
import '../styles/globals.css';

const OVERLAY_ID = 'seereal-overlay-root';
const OVERLAY_ENABLED_KEY = 'overlayEnabled';

function init() {
  if (document.getElementById(OVERLAY_ID)) return;

  // Read the saved toggle state before injecting
  chrome.storage.local.get(OVERLAY_ENABLED_KEY, (data) => {
    const enabled = data[OVERLAY_ENABLED_KEY] !== false; // default true

    const container = document.createElement('div');
    container.id = OVERLAY_ID;
    container.style.display = enabled ? '' : 'none';
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(<Overlay2D />);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'RUN_ANALYSIS') {
    document.dispatchEvent(new CustomEvent('seereal-run-analysis'));
  }

  if (message.type === 'TOGGLE_OVERLAY') {
    const container = document.getElementById(OVERLAY_ID);
    if (container) {
      container.style.display = message.enabled ? '' : 'none';
    }
  }
});

export { extractArticle };
