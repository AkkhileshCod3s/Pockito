import * as THREE from 'three';
import { renderMarkdown, bindMarkdownInteractions } from '../ui/markdown.js';

const _head = new THREE.Vector3();
const _screen = new THREE.Vector3();

export class Bubble {
  constructor({ stage, character, parent = document.body }) {
    this.stage = stage;
    this.character = character;

    this.el = document.createElement('div');
    this.el.className = 'pet-bubble hidden';
    this.el.innerHTML = `
      <div class="pet-bubble__tail"></div>
      <div class="pet-bubble__content"></div>
    `;
    this.contentEl = this.el.querySelector('.pet-bubble__content');
    parent.appendChild(this.el);

    this.timer = null;
    this.visible = false;
    this.isThinking = false;

    this.#injectStyles();
    bindMarkdownInteractions(this.contentEl);
  }

  #injectStyles() {
    if (document.getElementById('pockito-bubble-style')) return;
    const style = document.createElement('style');
    style.id = 'pockito-bubble-style';
    style.textContent = `
      .pet-bubble {
        position: fixed;
        z-index: 9998;
        pointer-events: auto;
        max-width: 280px;
        min-width: 50px;
        max-height: 140px;
        padding: 8px 12px;
        border-radius: 16px;
        background: #ffffff;
        border: 1px solid rgba(45, 130, 219, 0.25);
        box-shadow:
          0 4px 10px rgba(0, 0, 0, 0.12),
          inset 1px 1px 2px rgba(255, 255, 255, 0.9);
        color: #2b2b3a;
        font: 600 12px/1.38 ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif;
        text-align: left;
        opacity: 0;
        transform: translateY(4px) scale(0.96);
        transition: opacity 140ms ease, transform 140ms ease;
        word-break: break-word;
        overflow-y: auto;
        user-select: text;
        -webkit-user-select: text;
      }
      .pet-bubble.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .pet-bubble.hidden {
        display: none;
      }
      .pet-bubble__content {
        white-space: normal;
      }
      .pet-bubble__content p {
        margin: 0 0 4px 0;
      }
      .pet-bubble__content p:last-child {
        margin-bottom: 0;
      }
      .pet-bubble__content ul,
      .pet-bubble__content ol {
        margin: 2px 0 4px 0;
        padding-left: 1.2em;
      }
      .pet-bubble__content li {
        margin-bottom: 2px;
      }
      .pet-bubble__content blockquote {
        margin: 2px 0;
        padding: 2px 6px;
        border-left: 2px solid #cbd5e1;
        color: #64748b;
        font-style: italic;
      }
      .pet-bubble__content table {
        border-collapse: collapse;
        width: 100%;
        margin: 4px 0;
        font-size: 10px;
      }
      .pet-bubble__content th,
      .pet-bubble__content td {
        border: 1px solid #cbd5e1;
        padding: 2px 4px;
        text-align: left;
      }
      .pet-bubble__content th {
        background: rgba(0, 0, 0, 0.05);
        font-weight: 600;
      }
      .pet-bubble__content code:not(pre code) {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
        background: rgba(0, 0, 0, 0.08);
        padding: 1px 3px;
        border-radius: 3px;
      }
      .pet-bubble__content a.pockito-ext-link {
        color: #2563eb;
        text-decoration: underline;
        cursor: pointer;
        word-break: break-all;
      }
      .pet-bubble__content .code-block-wrapper {
        margin: 4px 0;
        border-radius: 6px;
        overflow: hidden;
        background: #1e1e2e;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
      }
      .pet-bubble__content .code-block-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #181825;
        padding: 2px 6px;
        border-bottom: 1px solid #313244;
        font-family: ui-monospace, monospace;
        font-size: 9px;
        color: #cdd6f4;
      }
      .pet-bubble__content .code-lang {
        font-weight: 700;
        letter-spacing: 0.5px;
        opacity: 0.8;
      }
      .pet-bubble__content .code-copy-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: #cdd6f4;
        font-size: 9px;
        padding: 1px 4px;
        cursor: pointer;
      }
      .pet-bubble__content .code-copy-btn.copied {
        background: #10b981;
        color: #ffffff;
      }
      .pet-bubble__content .code-block-wrapper pre {
        margin: 0;
        padding: 6px 8px;
        overflow-x: auto;
        font-family: Consolas, Menlo, Monaco, monospace;
        font-size: 10px;
        line-height: 1.35;
        color: #cdd6f4;
      }
      .pet-bubble__content .code-block-wrapper code {
        font-family: inherit;
        font-size: inherit;
        background: transparent;
        padding: 0;
        white-space: pre;
      }
      .pet-bubble__tail {
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 12px;
        height: 6px;
        background: #ffffff;
        clip-path: polygon(0 0, 100% 0, 50% 100%);
      }
      .pet-bubble__dots {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        padding: 3px 5px;
      }
      .pet-bubble__dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #50c3f5;
        animation: bubbleDot 1.2s infinite ease-in-out;
      }
      .pet-bubble__dot:nth-child(2) { animation-delay: 0.2s; background: #f2a65a; }
      .pet-bubble__dot:nth-child(3) { animation-delay: 0.4s; background: #f58aa5; }
      @keyframes bubbleDot {
        0%, 100% { transform: scale(0.8); opacity: 0.4; }
        50% { transform: scale(1.2); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  showThinking() {
    if (this.timer) clearTimeout(this.timer);
    this.isThinking = true;
    this.contentEl.textContent = '';
    const dotsWrap = document.createElement('span');
    dotsWrap.className = 'pet-bubble__dots';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'pet-bubble__dot';
      dotsWrap.appendChild(dot);
    }
    this.contentEl.appendChild(dotsWrap);
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('visible'));
    this.visible = true;
  }

  say(text) {
    if (this.timer) clearTimeout(this.timer);
    this.isThinking = false;
    this.contentEl.innerHTML = renderMarkdown(text || '...');
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('visible'));
    this.visible = true;

    const duration = Math.min(20_000, Math.max(4_000, (text?.length || 0) * 75));
    this.timer = setTimeout(() => this.hide(), duration);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.isThinking = false;
    this.el.classList.remove('visible');
    setTimeout(() => {
      if (!this.visible) this.el.classList.add('hidden');
    }, 160);
  }

  update() {
    if (!this.visible) return;

    const headJoint = this.character.mob?.joints?.head;
    if (!headJoint) return;

    headJoint.getWorldPosition(_head);
    const scale = this.character.placement?.scale || 1;
    _head.y += 0.8 * scale;

    _screen.copy(_head).project(this.stage.camera);

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const px = _screen.x * halfW + halfW;
    const py = -_screen.y * halfH + halfH;

    const w = this.el.offsetWidth || 140;
    const h = this.el.offsetHeight || 38;
    const margin = 12;

    const left = Math.max(margin, Math.min(px - w / 2, window.innerWidth - w - margin));
    const top = Math.max(margin, Math.min(py - h - 8, window.innerHeight - h - margin));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
  }
}
