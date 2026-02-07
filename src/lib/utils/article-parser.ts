/**
 * SeeReal - Article Parser
 * Extracts article text and metadata from news pages
 */

const ARTICLE_SELECTORS = [
  'article',
  '[role="article"]',
  'main article',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.story-body',
  '.article-body',
  '[itemprop="articleBody"]',
  '.content-body',
  '.post-body',
  'main',
];

const IGNORE_SELECTORS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  '.advertisement',
  '.ad',
  '[role="navigation"]',
  '.comments',
  '.social-share',
];


export interface ExtractedArticle {
  title: string;
  text: string;
  url: string;
  source?: string;
  excerpt?: string;
  author?: string;
  authorImageUrl?: string;
  date?: string;
  publisher?: string;
}

export function extractArticle(): ExtractedArticle | null {
  const url = window.location.href;
  const title = getTitle();
  const text = getArticleText();
  const source = getSource(url);

  if (!text || text.trim().length < 100) {
    return null;
  }

  return {
    title,
    text: text.trim(),
    url,
    source,
    excerpt: text.slice(0, 300).trim() + (text.length > 300 ? '...' : ''),
    author: getAuthor(),
    authorImageUrl: getAuthorImageUrl(),
    date: getDate(),
    publisher: getPublisher(),
  };
}

function getAuthor(): string | undefined {
  const meta = document.querySelector('meta[name="author"]')?.getAttribute('content');
  if (meta?.trim()) return meta.trim();

  const ogAuthor = document.querySelector('meta[property="article:author"]')?.getAttribute('content');
  if (ogAuthor?.trim()) {
    try {
      const name = new URL(ogAuthor).pathname.split('/').filter(Boolean).pop();
      if (name) return decodeURIComponent(name).replace(/[-_]/g, ' ');
    } catch {
      return ogAuthor.trim();
    }
  }

  const bySelectors = [
    '[itemprop="author"]',
    '.byline__author',
    '.author-name',
    '.article__byline a',
    '.entry-author a',
    '.post-author a',
    'a[rel="author"]',
    '[data-testid="author-name"]',
    '.byline',
    '.author',
  ];
  for (const sel of bySelectors) {
    const el = document.querySelector(sel);
    const name = el?.textContent?.trim();
    if (name && name.length < 120) return name;
  }
  return undefined;
}

function getAuthorImageUrl(): string | undefined {
  const authorBlock = document.querySelector('[itemprop="author"]');
  if (authorBlock) {
    const img = authorBlock.querySelector('img[src]');
    const src = img?.getAttribute('src');
    if (src && isImageUrl(src)) return toAbsoluteUrl(src);
  }

  const authorImgSelectors = [
    '.author img',
    '.byline img',
    '.article__byline img',
    '.c-author__image img',
    '[data-testid="author-avatar"] img',
  ];
  for (const sel of authorImgSelectors) {
    const img = document.querySelector(sel);
    const src = (img as HTMLImageElement)?.src || img?.getAttribute('src');
    if (src && isImageUrl(src)) return toAbsoluteUrl(src);
  }

  return undefined;
}

function getDate(): string | undefined {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[name="publish_date"]',
    'meta[name="original-publish-date"]',
    'time[itemprop="datePublished"]',
    'time[datetime]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const val = el?.getAttribute('content') || el?.getAttribute('datetime') || el?.getAttribute('datetime');
    if (val) return val;
  }

  // Fallback to searching for date-like strings in standard bio/date areas
  const dateElements = document.querySelectorAll('.date, .published, .timestamp, time');
  for (const el of Array.from(dateElements)) {
    if (el.textContent && /\d{4}/.test(el.textContent)) {
      return el.textContent.trim();
    }
  }

  return undefined;
}

function getPublisher(): string | undefined {
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (ogSiteName) return ogSiteName.trim();

  const publisher = document.querySelector('meta[name="publisher"]')?.getAttribute('content');
  if (publisher) return publisher.trim();

  const appName = document.querySelector('meta[name="application-name"]')?.getAttribute('content');
  if (appName) return appName.trim();

  try {
    return window.location.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function isImageUrl(s: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s) || s.includes('img') || s.includes('avatar') || s.includes('photo');
}

function toAbsoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

function getTitle(): string {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) return ogTitle.trim();

  const h1 = document.querySelector('h1');
  if (h1) return h1.textContent?.trim() ?? '';

  return document.title ?? 'Untitled';
}

function getArticleText(): string {
  let container: Element | null = null;

  for (const selector of ARTICLE_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && getTextLength(el) > 200) {
      container = el;
      break;
    }
  }

  if (!container) {
    container = document.body;
  }

  return extractTextFromElement(container);
}

function getTextLength(el: Element): number {
  return extractTextFromElement(el).replace(/\s+/g, ' ').trim().length;
}

function extractTextFromElement(el: Element): string {
  const clone = el.cloneNode(true) as Element;

  for (const selector of IGNORE_SELECTORS) {
    clone.querySelectorAll(selector).forEach((n) => n.remove());
  }

  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function getSource(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

