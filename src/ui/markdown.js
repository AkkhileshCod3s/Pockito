import { marked } from 'marked';
import DOMPurifyFactory from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';

// Initialize DOMPurify for browser / electron renderer environment
export const DOMPurify =
  typeof window !== 'undefined' && window.document && window.Element
    ? (DOMPurifyFactory.sanitize ? DOMPurifyFactory : DOMPurifyFactory(window))
    : DOMPurifyFactory;

// Register supported programming languages for code block syntax highlighting
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('sql', sql);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Configure marked with GFM and custom code block rendering
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code(token) {
      const rawText = token.text || '';
      const rawLang = (token.lang || '').trim().split(/\s+/)[0].toLowerCase();
      const displayLang = (rawLang || 'text').toUpperCase();

      let highlighted = '';
      if (rawLang && hljs.getLanguage(rawLang)) {
        try {
          highlighted = hljs.highlight(rawText, { language: rawLang, ignoreIllegals: true }).value;
        } catch {
          highlighted = escapeHtml(rawText);
        }
      } else {
        highlighted = escapeHtml(rawText);
      }

      const encodedRaw = encodeURIComponent(rawText);

      return (
        `<div class="code-block-wrapper">` +
        `<div class="code-block-header">` +
        `<span class="code-lang">${escapeHtml(displayLang)}</span>` +
        `<button type="button" class="code-copy-btn" data-raw="${encodedRaw}" title="Copy code">Copy</button>` +
        `</div>` +
        `<pre><code class="hljs ${rawLang ? `language-${escapeHtml(rawLang)}` : ''}">${highlighted}</code></pre>` +
        `</div>`
      );
    },
  },
});

// Configure DOMPurify hooks to enforce security restrictions:
// 1. Strip remote images, keeping only data:image/... (user previews)
// 2. Enforce external links target="_blank" rel="noopener noreferrer" and .pockito-ext-link
if (typeof DOMPurify?.addHook === 'function') {
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'img') {
      const src = node.getAttribute('src') || '';
      if (!src.startsWith('data:image/')) {
        node.remove();
      }
    }
  });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (href.startsWith('http://') || href.startsWith('https://')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
        node.classList.add('pockito-ext-link');
      } else {
        node.removeAttribute('href');
      }
    }
  });
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 's', 'del', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'pre', 'code', 'span', 'div',
    'a', 'button', 'img',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel', 'class',
    'data-raw', 'type', 'src', 'alt', 'width', 'height',
  ],
  ALLOW_DATA_ATTR: true,
};

/**
 * Safety net: detect text segments containing >4 semicolon/brace delimiters on a line of length > 120
 * and insert newlines at statement boundaries to prevent unformatted/minified code display.
 */
export function formatUnbrokenCode(text) {
  if (typeof text !== 'string') return '';
  const lines = text.split('\n');
  let changed = false;
  const processed = lines.map((line) => {
    if (line.length > 120) {
      const matchCount = (line.match(/[;{}]/g) || []).length;
      if (matchCount > 4) {
        changed = true;
        return line
          .replace(/;\s*/g, ';\n')
          .replace(/\{\s*/g, '{\n  ')
          .replace(/\s*\}\s*/g, '\n}\n');
      }
    }
    return line;
  });
  return changed ? processed.join('\n') : text;
}

/**
 * In-flight streaming helper: ensures any unclosed code block fences are closed
 * in memory so partial streams format as code blocks cleanly without breaking layout.
 */
export function balanceCodeFences(text) {
  if (typeof text !== 'string') return '';
  const fenceMatches = text.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    return text + '\n```';
  }
  return text;
}

/**
 * Renders raw Markdown into sanitized, syntax-highlighted HTML.
 */
export function renderMarkdown(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let processed = formatUnbrokenCode(rawText);
  processed = balanceCodeFences(processed);
  const rawHtml = marked.parse(processed);
  if (typeof DOMPurify?.sanitize === 'function') {
    return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
  }
  return rawHtml;
}

/**
 * Attaches event delegation for copy buttons and external links.
 */
export function bindMarkdownInteractions(containerEl, { onOpenExternal } = {}) {
  if (!containerEl || containerEl.__pockitoMarkdownBound) return;
  containerEl.__pockitoMarkdownBound = true;

  containerEl.addEventListener('click', (e) => {
    // 1. Code copy button
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const encoded = copyBtn.getAttribute('data-raw');
      if (encoded) {
        try {
          const rawCode = decodeURIComponent(encoded);
          navigator.clipboard.writeText(rawCode).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = originalText;
              copyBtn.classList.remove('copied');
            }, 1500);
          }).catch((err) => {
            console.error('Failed to copy code to clipboard:', err);
          });
        } catch (err) {
          console.error('Error decoding code for copy:', err);
        }
      }
      return;
    }

    // 2. External links
    const link = e.target.closest('a.pockito-ext-link, a[href]');
    if (link) {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onOpenExternal === 'function') {
          onOpenExternal(href);
        } else if (window.mobHost?.openExternal) {
          window.mobHost.openExternal(href);
        } else {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    }
  });
}

/**
 * Throttled stream renderer to prevent DOM updates from lagging the Three.js loop.
 */
export class StreamRenderer {
  constructor(targetEl, { onOpenExternal } = {}) {
    this.targetEl = targetEl;
    this.onOpenExternal = onOpenExternal;
    this.pendingText = '';
    this.rafId = null;
    this.lastRenderTime = 0;
    this.isAttached = false;
  }

  attach() {
    if (!this.isAttached && this.targetEl) {
      bindMarkdownInteractions(this.targetEl, { onOpenExternal: this.onOpenExternal });
      this.isAttached = true;
    }
  }

  update(text) {
    this.pendingText = text;
    const now = performance.now();
    const elapsed = now - this.lastRenderTime;

    if (elapsed >= 60) {
      this.#render();
    } else if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.#render();
      });
    }
  }

  finish(text) {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingText = text !== undefined ? text : this.pendingText;
    this.#render();
  }

  #render() {
    this.lastRenderTime = performance.now();
    if (this.targetEl) {
      this.targetEl.innerHTML = renderMarkdown(this.pendingText);
    }
  }
}
