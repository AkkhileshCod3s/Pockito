import * as THREE from 'three';
import { MOBS } from '../mobs/index.js';
import { ACTIONS } from '../character/states.js';
import { EXPRESSION_NAMES } from '../face/expressions.js';
import { renderMarkdown, bindMarkdownInteractions } from '../ui/markdown.js';

const _point = new THREE.Vector3();
const VALID_ACTIONS = new Set(['none', 'happy', 'curious', 'excited', 'wave', 'dance', 'sad', 'surprised']);
const SKIP_ACTION_STATES = new Set(['carried', 'drop', 'sleep']);

export class ChatPanel {
  constructor({ stage, character, screen, host, settings, parent = document.body }) {
    this.stage = stage;
    this.character = character;
    this.screen = screen;
    this.host = host;
    this.settings = settings;

    this.isOpen = false;
    this.isOver = false;
    this.isAnchored = false;
    this.isProcessingAttachment = false;
    this.isCapturing = false;
    this.currentAttachment = null;
    this.messages = []; // in-memory history of last ~10 messages
    this.lastSentText = '';
    this.lastSentAttachment = null;

    this.#buildDOM(parent);
    this.#injectStyles();
    this.#bindEvents();
    this.#listenCaptureResult();
  }

  #buildDOM(parent) {
    this.el = document.createElement('div');
    this.el.className = 'pockito-chat-card hidden';

    // Tail element pointing at pet
    this.tailEl = document.createElement('div');
    this.tailEl.className = 'chat-card__tail tail-down';
    this.el.appendChild(this.tailEl);

    // Close button
    this.btnClose = document.createElement('button');
    this.btnClose.type = 'button';
    this.btnClose.className = 'chat-card__btn-close';
    this.btnClose.textContent = '×';
    this.btnClose.title = 'Close chat';
    this.btnClose.setAttribute('aria-label', 'Close chat');
    this.el.appendChild(this.btnClose);

    // Message list container
    this.msgList = document.createElement('div');
    this.msgList.className = 'chat-card__msg-list';
    this.el.appendChild(this.msgList);

    // Thinking indicator bubble (appended inside msgList when waiting)
    this.thinkingBubble = document.createElement('div');
    this.thinkingBubble.className = 'chat-msg chat-msg--pet chat-msg--thinking hidden';
    this.thinkingBubble.innerHTML = `
      <div class="chat-msg__bubble">
        <span class="chat-dot"></span>
        <span class="chat-dot"></span>
        <span class="chat-dot"></span>
      </div>
    `;

    // Attachment chip row
    this.attachmentRow = document.createElement('div');
    this.attachmentRow.className = 'chat-card__attachment-row hidden';

    this.chip = document.createElement('div');
    this.chip.className = 'chat-chip';

    this.chipThumb = document.createElement('img');
    this.chipThumb.className = 'chat-chip__thumb';
    this.chipThumb.alt = 'Attachment thumbnail';
    this.chipThumb.onerror = () => {
      this.chipThumb.classList.add('hidden');
      this.chipIcon.classList.remove('hidden');
    };

    this.chipIcon = document.createElement('span');
    this.chipIcon.className = 'chat-chip__icon hidden';
    this.chipIcon.textContent = '📄';

    this.chipName = document.createElement('span');
    this.chipName.className = 'chat-chip__name';

    this.chipSpinner = document.createElement('span');
    this.chipSpinner.className = 'chat-chip__spinner hidden';
    this.chipSpinner.textContent = '…';

    this.chipRemove = document.createElement('button');
    this.chipRemove.type = 'button';
    this.chipRemove.className = 'chat-chip__remove';
    this.chipRemove.textContent = '×';
    this.chipRemove.title = 'Remove attachment';
    this.chipRemove.setAttribute('aria-label', 'Remove attachment');

    this.chip.appendChild(this.chipThumb);
    this.chip.appendChild(this.chipIcon);
    this.chip.appendChild(this.chipName);
    this.chip.appendChild(this.chipSpinner);
    this.chip.appendChild(this.chipRemove);
    this.attachmentRow.appendChild(this.chip);
    this.el.appendChild(this.attachmentRow);

    // Input row: [camera] [upload] [message box] [send]
    this.inputRow = document.createElement('div');
    this.inputRow.className = 'chat-card__input-row';

    this.btnCamera = document.createElement('button');
    this.btnCamera.type = 'button';
    this.btnCamera.className = 'chat-btn-action';
    this.btnCamera.textContent = '📷';
    this.btnCamera.title = 'Capture screen area (Shift+click for full screen)';
    this.btnCamera.setAttribute('aria-label', 'Capture screen area');

    this.btnUpload = document.createElement('button');
    this.btnUpload.type = 'button';
    this.btnUpload.className = 'chat-btn-action';
    this.btnUpload.textContent = '📎';
    this.btnUpload.title = 'Attach image or text file';
    this.btnUpload.setAttribute('aria-label', 'Attach file');

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'chat-card__textarea';
    this.textarea.maxLength = 1000;
    this.textarea.rows = 1;
    this.textarea.autocomplete = 'off';
    this.textarea.spellcheck = false;

    this.btnSend = document.createElement('button');
    this.btnSend.type = 'button';
    this.btnSend.className = 'chat-btn-send';
    this.btnSend.textContent = '↑';
    this.btnSend.title = 'Send message';
    this.btnSend.setAttribute('aria-label', 'Send message');

    this.inputRow.appendChild(this.btnCamera);
    this.inputRow.appendChild(this.btnUpload);
    this.inputRow.appendChild(this.textarea);
    this.inputRow.appendChild(this.btnSend);

    this.el.appendChild(this.inputRow);
    parent.appendChild(this.el);
  }

  #injectStyles() {
    if (document.getElementById('pockito-chat-card-style')) return;
    const style = document.createElement('style');
    style.id = 'pockito-chat-card-style';
    style.textContent = `
      .pockito-chat-card {
        position: fixed;
        z-index: 9998;
        width: 320px;
        background: #ffffff;
        border: 1px solid rgba(45, 130, 219, 0.28);
        border-radius: 20px;
        box-shadow:
          0 4px 12px rgba(0, 0, 0, 0.12),
          inset 1px 1px 2px rgba(255, 255, 255, 0.9);
        padding: 12px 14px 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        opacity: 0;
        pointer-events: auto;
        transform: scale(0.96);
        transition: opacity 140ms ease, transform 140ms ease;
        font-family: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif;
        color: #2b2b3a;
        user-select: none;
        -webkit-user-select: none;
      }
      .pockito-chat-card.visible {
        opacity: 1;
        transform: scale(1);
      }
      .pockito-chat-card.faded {
        opacity: 0;
        pointer-events: none;
      }
      .pockito-chat-card.hidden {
        display: none;
      }
      /* Speech Bubble Tail */
      .chat-card__tail {
        position: absolute;
        width: 14px;
        height: 8px;
        background: #ffffff;
        z-index: 10;
      }
      .chat-card__tail.tail-down {
        bottom: -7px;
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        border-top: 1px solid #ffffff;
      }
      .chat-card__tail.tail-up {
        top: -7px;
        clip-path: polygon(50% 0, 0 100%, 100% 100%);
      }
      /* Close button */
      .chat-card__btn-close {
        position: absolute;
        top: 6px;
        right: 8px;
        background: none;
        border: none;
        font-size: 17px;
        font-weight: 700;
        color: #94a3b8;
        cursor: pointer;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 6px;
      }
      .chat-card__btn-close:hover {
        color: #ef4444;
      }
      /* Messages List */
      .chat-card__msg-list {
        max-height: 220px;
        min-height: 48px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-right: 4px;
        margin-top: 4px;
      }
      .chat-card__msg-list::-webkit-scrollbar {
        width: 4px;
      }
      .chat-card__msg-list::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
      }
      .chat-msg {
        display: flex;
        max-width: 86%;
      }
      .chat-msg--user {
        align-self: flex-end;
      }
      .chat-msg--pet {
        align-self: flex-start;
      }
      .chat-msg__bubble {
        padding: 6px 10px;
        border-radius: 14px;
        font-size: 12px;
        line-height: 1.4;
        word-break: break-word;
        user-select: text;
        -webkit-user-select: text;
      }
      .chat-msg--user .chat-msg__bubble {
        background: #2d82db;
        color: #ffffff;
        border-bottom-right-radius: 3px;
        box-shadow: 0 1px 3px rgba(45, 130, 219, 0.2);
        white-space: pre-wrap;
      }
      .chat-msg--pet .chat-msg__bubble {
        background: #ffeecd;
        color: #2b2b3a;
        border-bottom-left-radius: 3px;
        border: 1px solid rgba(242, 166, 90, 0.25);
        white-space: normal;
      }
      .chat-msg--error .chat-msg__bubble {
        background: #fee2e2;
        color: #c45b76;
        border: 1px solid #f58aa5;
        white-space: pre-wrap;
      }
      /* Markdown formatting in pet messages */
      .chat-msg--pet .chat-msg__bubble p {
        margin: 0 0 6px 0;
      }
      .chat-msg--pet .chat-msg__bubble p:last-child {
        margin-bottom: 0;
      }
      .chat-msg--pet .chat-msg__bubble ul,
      .chat-msg--pet .chat-msg__bubble ol {
        margin: 4px 0 6px 0;
        padding-left: 1.3em;
      }
      .chat-msg--pet .chat-msg__bubble li {
        margin-bottom: 2px;
      }
      .chat-msg--pet .chat-msg__bubble blockquote {
        margin: 4px 0;
        padding: 2px 8px;
        border-left: 3px solid #cbd5e1;
        color: #64748b;
        font-style: italic;
      }
      .chat-msg--pet .chat-msg__bubble table {
        border-collapse: collapse;
        width: 100%;
        margin: 6px 0;
        font-size: 11px;
      }
      .chat-msg--pet .chat-msg__bubble th,
      .chat-msg--pet .chat-msg__bubble td {
        border: 1px solid #cbd5e1;
        padding: 4px 6px;
        text-align: left;
      }
      .chat-msg--pet .chat-msg__bubble th {
        background: rgba(0, 0, 0, 0.05);
        font-weight: 600;
      }
      .chat-msg--pet .chat-msg__bubble code:not(pre code) {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
        background: rgba(0, 0, 0, 0.08);
        padding: 2px 4px;
        border-radius: 4px;
      }
      .chat-msg--pet .chat-msg__bubble a.pockito-ext-link {
        color: #2563eb;
        text-decoration: underline;
        cursor: pointer;
        word-break: break-all;
      }
      /* Code Blocks */
      .code-block-wrapper {
        margin: 6px 0;
        border-radius: 8px;
        overflow: hidden;
        background: #1e1e2e;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      }
      .code-block-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #181825;
        padding: 3px 8px;
        border-bottom: 1px solid #313244;
        font-family: ui-monospace, monospace;
        font-size: 10px;
        color: #cdd6f4;
      }
      .code-lang {
        font-weight: 700;
        letter-spacing: 0.5px;
        opacity: 0.8;
      }
      .code-copy-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: #cdd6f4;
        font-size: 10px;
        padding: 1px 6px;
        cursor: pointer;
        transition: background 120ms;
      }
      .code-copy-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .code-copy-btn.copied {
        background: #10b981;
        color: #ffffff;
        border-color: #10b981;
      }
      .code-block-wrapper pre {
        margin: 0;
        padding: 8px 10px;
        overflow-x: auto;
        font-family: Consolas, Menlo, Monaco, monospace;
        font-size: 11px;
        line-height: 1.4;
        color: #cdd6f4;
      }
      .code-block-wrapper code {
        font-family: inherit;
        font-size: inherit;
        background: transparent;
        padding: 0;
        white-space: pre;
      }
      /* Syntax Highlighting */
      .hljs-keyword, .hljs-selector-tag { color: #cba6f7; font-weight: 600; }
      .hljs-string, .hljs-addition { color: #a6e3a1; }
      .hljs-number, .hljs-literal { color: #fab387; }
      .hljs-comment, .hljs-quote { color: #6c7086; font-style: italic; }
      .hljs-title, .hljs-section, .hljs-function { color: #89b4fa; }
      .hljs-variable, .hljs-template-variable { color: #f38ba8; }
      .hljs-attr, .hljs-attribute { color: #f9e2af; }
      .hljs-built_in { color: #94e2d5; }
      .hljs-type, .hljs-class { color: #f9e2af; }
      .hljs-subst, .hljs-punctuation { color: #cdd6f4; }
      /* Thinking Dots */
      .chat-msg--thinking .chat-msg__bubble {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        padding: 6px 10px;
      }
      .chat-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #50c3f5;
        animation: chatDotPulse 1.2s infinite ease-in-out;
      }
      .chat-dot:nth-child(2) { animation-delay: 0.2s; background: #f2a65a; }
      .chat-dot:nth-child(3) { animation-delay: 0.4s; background: #f58aa5; }
      @keyframes chatDotPulse {
        0%, 100% { transform: scale(0.8); opacity: 0.5; }
        50% { transform: scale(1.2); opacity: 1; }
      }
      /* Attachment Chip */
      .chat-card__attachment-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .chat-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f1f5f9;
        border: 1px solid rgba(45, 130, 219, 0.2);
        border-radius: 10px;
        padding: 3px 8px;
        font-size: 11px;
        color: #334155;
        max-width: 100%;
      }
      .chat-chip__thumb {
        width: 22px;
        height: 22px;
        border-radius: 4px;
        object-fit: cover;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }
      .chat-chip__icon {
        font-size: 13px;
      }
      .chat-chip__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 180px;
      }
      .chat-chip__remove {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
        padding: 0 2px;
      }
      .chat-chip__remove:hover {
        color: #ef4444;
      }
      .chat-chip__spinner {
        color: #50c3f5;
        font-weight: 700;
        animation: chatDotPulse 1s infinite;
      }
      /* Input Row */
      .chat-card__input-row {
        display: flex;
        align-items: flex-end;
        gap: 6px;
      }
      .chat-btn-action {
        background: #f8fafc;
        border: 1px solid rgba(120, 170, 225, 0.3);
        border-radius: 50%;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 2px 0 rgba(45, 130, 219, 0.18);
        transition: transform 80ms ease, box-shadow 80ms ease;
      }
      .chat-btn-action:hover:not(:disabled) {
        background: #f0f7ff;
      }
      .chat-btn-action:active:not(:disabled) {
        transform: translateY(1px);
        box-shadow: none;
      }
      .chat-card__textarea {
        flex: 1;
        background: #f4f8fd;
        border: 1px solid rgba(45, 130, 219, 0.2);
        border-radius: 14px;
        padding: 7px 10px;
        font-family: inherit;
        font-size: 12px;
        line-height: 1.35;
        color: #2b2b3a;
        outline: none;
        resize: none;
        min-height: 32px;
        max-height: 96px;
        box-shadow:
          inset 2px 2px 4px rgba(45, 130, 219, 0.1),
          inset -1px -1px 2px rgba(255, 255, 255, 0.9);
        user-select: text !important;
        -webkit-user-select: text !important;
      }
      .chat-card__textarea:focus {
        border-color: #2d82db;
        box-shadow:
          inset 2px 2px 4px rgba(45, 130, 219, 0.14),
          0 0 0 2px rgba(80, 195, 245, 0.35);
      }
      .chat-btn-send {
        background: linear-gradient(180deg, #50c3f5 0%, #2d82db 100%);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        color: #ffffff;
        font-weight: 800;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 3px 0 #1b5ea3;
        transition: transform 80ms ease, box-shadow 80ms ease;
      }
      .chat-btn-send:hover:not(:disabled) {
        filter: brightness(1.08);
      }
      .chat-btn-send:active:not(:disabled) {
        transform: translateY(2px);
        box-shadow: 0 1px 0 #1b5ea3;
      }
      .chat-btn-send:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .hidden {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  #bindEvents() {
    bindMarkdownInteractions(this.msgList, {
      onOpenExternal: (url) => this.host?.openExternal?.(url),
    });

    this.btnClose.addEventListener('click', () => this.close());

    // Auto-grow textarea
    this.textarea.addEventListener('input', () => {
      this.textarea.style.height = 'auto';
      const h = Math.min(96, Math.max(32, this.textarea.scrollHeight));
      this.textarea.style.height = `${h}px`;
      this.#updateSendState();
    });

    // Enter sends, Shift+Enter makes new line
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendCurrent();
      }
    });

    this.btnSend.addEventListener('click', () => this.sendCurrent());

    this.btnCamera.addEventListener('click', (e) => this.#startScreenCapture({ fullScreen: e.shiftKey }));

    this.btnUpload.addEventListener('click', () => this.#openFileDialog());

    this.chipRemove.addEventListener('click', () => this.removeAttachment());

    // Close on Escape or click outside
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    window.addEventListener('blur', () => {
      // Main process sets suspended=true or isCapturing=true while capture or file dialog is active
      if (this.isOpen && !this.isSuspended && !this.isCapturing) {
        this.close();
      }
    });

    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this.reanchor();
      }
    });

    // Track pointer over state
    this.el.addEventListener('mouseenter', () => { this.isOver = true; });
    this.el.addEventListener('mouseleave', () => { this.isOver = false; });
  }

  contains(node) {
    return this.el.contains(node);
  }

  isPointOver(x, y) {
    if (!this.isOpen) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  open({ greeting = null } = {}) {
    this.isOpen = true;
    this.host?.setChatMode(true);

    // Stop pet wandering and hold position
    this.character.inChat = true;
    this.character.loco.stop();
    this.character.loco.speed = 0;
    this.character.restLift = this.character.lift;

    // Update placeholder
    const mobKey = this.settings?.mob || 'bluefish';
    const mobLabel = MOBS[mobKey]?.label || 'Pockito';
    this.textarea.placeholder = `Say something to your ${mobLabel.toLowerCase()}…`;

    this.el.classList.remove('hidden');
    this.el.classList.remove('faded');
    requestAnimationFrame(() => {
      this.el.classList.add('visible');
      this.reanchor();
      this.textarea.focus();
    });

    if (greeting && this.messages.length === 0) {
      this.addMessage({ role: 'pet', text: greeting });
    }

    this.#updateSendState();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.isOver = false;
    this.character.inChat = false;
    this.host?.setChatMode(false);

    // Delete attachment from memory
    this.removeAttachment();

    this.el.classList.remove('visible');
    setTimeout(() => {
      if (!this.isOpen) this.el.classList.add('hidden');
    }, 150);
  }

  onDragStart() {
    if (!this.isOpen) return;
    this.el.classList.add('faded');
  }

  onDragEnd() {
    if (!this.isOpen) return;
    this.reanchor();
    this.el.classList.remove('faded');
  }

  /**
   * Computes the card anchor ONCE from the pet's resting standing position.
   * Clamped to screen bounds, never updated per frame.
   */
  reanchor() {
    const scale = this.character.placement?.scale || 1;
    const standingHeight = this.character.mob.height * scale;
    const floorY = this.character.placement?.floorY || 0;
    const lift = this.character.lift || 0;

    // Top standing point of pet in world coordinates
    _point.set(this.character.loco.x, floorY + lift + standingHeight, 0);
    _point.project(this.stage.camera);

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const px = _point.x * halfW + halfW;
    const py = -_point.y * halfH + halfH;

    // Base point of pet for below positioning
    _point.set(this.character.loco.x, floorY + lift, 0);
    _point.project(this.stage.camera);
    const basePy = -_point.y * halfH + halfH;

    const cardW = 320;
    const cardH = this.el.offsetHeight || 180;
    const margin = 12;

    let targetLeft = px - cardW / 2;
    targetLeft = Math.max(margin, Math.min(window.innerWidth - cardW - margin, targetLeft));

    let targetTop = py - cardH - 14;
    let tailDown = true;

    // If not enough room above pet, position below pet
    if (targetTop < margin) {
      targetTop = basePy + 14;
      tailDown = false;
    }

    targetTop = Math.max(margin, Math.min(window.innerHeight - cardH - margin, targetTop));

    // Position card via transform
    this.el.style.left = `${Math.round(targetLeft)}px`;
    this.el.style.top = `${Math.round(targetTop)}px`;

    // Position tail pointing at pet's x
    const tailX = Math.max(16, Math.min(cardW - 24, px - targetLeft - 7));
    this.tailEl.style.left = `${Math.round(tailX)}px`;

    if (tailDown) {
      this.tailEl.className = 'chat-card__tail tail-down';
    } else {
      this.tailEl.className = 'chat-card__tail tail-up';
    }

    this.isAnchored = true;
  }

  #updateSendState() {
    const hasText = this.textarea.value.trim().length > 0;
    const hasAttachment = !!this.currentAttachment;
    const isReady = !this.isProcessingAttachment && (hasText || hasAttachment);
    this.btnSend.disabled = !isReady;
  }

  addMessage({ role = 'pet', text = '', isError = false }) {
    const item = { role, text, isError };
    this.messages.push(item);
    if (this.messages.length > 10) {
      this.messages.shift();
    }
    this.#renderMessages();
  }

  #renderMessages() {
    const isNearBottom =
      this.msgList.scrollHeight - this.msgList.scrollTop - this.msgList.clientHeight < 48;

    this.msgList.textContent = '';
    for (const msg of this.messages) {
      const msgWrap = document.createElement('div');
      msgWrap.className = `chat-msg chat-msg--${msg.role}${msg.isError ? ' chat-msg--error' : ''}`;

      const bubble = document.createElement('div');
      bubble.className = 'chat-msg__bubble';
      if (msg.role === 'pet' && !msg.isError) {
        bubble.innerHTML = renderMarkdown(msg.text);
      } else {
        bubble.textContent = msg.text;
      }

      msgWrap.appendChild(bubble);
      this.msgList.appendChild(msgWrap);
    }

    // Thinking indicator stays at bottom when active
    this.msgList.appendChild(this.thinkingBubble);

    // Auto-scroll to bottom only if user was near bottom
    if (isNearBottom) {
      this.msgList.scrollTop = this.msgList.scrollHeight;
    }
  }

  showThinking(show) {
    const isNearBottom =
      this.msgList.scrollHeight - this.msgList.scrollTop - this.msgList.clientHeight < 48;

    if (show) {
      this.thinkingBubble.classList.remove('hidden');
    } else {
      this.thinkingBubble.classList.add('hidden');
    }

    if (isNearBottom) {
      this.msgList.scrollTop = this.msgList.scrollHeight;
    }
  }

  async sendCurrent() {
    const text = this.textarea.value.trim();
    const attachment = this.currentAttachment;

    if (!text && !attachment) return;
    if (this.isProcessingAttachment) return;

    this.lastSentText = text;
    this.lastSentAttachment = attachment;

    // Add user message to list
    let userMsgText = text;
    if (attachment) {
      userMsgText = `${text ? text + ' ' : ''}[${attachment.name}]`;
    }
    this.addMessage({ role: 'user', text: userMsgText });

    // Clear input & attachment
    this.textarea.value = '';
    this.textarea.style.height = '32px';
    this.removeAttachment(false);
    this.#updateSendState();

    // Pet enters thinking state
    this.showThinking(true);
    this.character.trigger('think', {}, true);

    try {
      const reply = await this.host.sendChatMessage({ text, attachmentId: attachment?.id });
      this.showThinking(false);

      if (reply?.error) {
        this.addMessage({ role: 'pet', text: reply.error, isError: true });
        this.character.trigger('oops', { then: 'idle' }, true);
        // Put text back into input for retry
        this.textarea.value = this.lastSentText;
        this.currentAttachment = this.lastSentAttachment;
        if (this.currentAttachment) this.#showAttachmentChip(this.currentAttachment);
        this.#updateSendState();
        return;
      }

      // Add pet reply
      this.addMessage({ role: 'pet', text: reply.text || '...' });

      // Apply reply expressions and actions
      const isAsleepOrCarried = SKIP_ACTION_STATES.has(this.character.stateName);
      if (reply.mood && EXPRESSION_NAMES.includes(reply.mood)) {
        this.character.face.setExpression(reply.mood);
      }
      if (!isAsleepOrCarried && reply.action && VALID_ACTIONS.has(reply.action) && reply.action !== 'none' && ACTIONS.includes(reply.action)) {
        this.character.trigger(reply.action, { then: 'idle' }, true);
      } else {
        this.character.trigger('idle', {}, true);
      }
    } catch (err) {
      this.showThinking(false);
      this.addMessage({ role: 'pet', text: err.message || 'Something went wrong.', isError: true });
      this.character.trigger('oops', { then: 'idle' }, true);
      this.textarea.value = this.lastSentText;
      this.currentAttachment = this.lastSentAttachment;
      if (this.currentAttachment) this.#showAttachmentChip(this.currentAttachment);
      this.#updateSendState();
    }
  }

  #listenCaptureResult() {
    this.removeCaptureListener?.();
    this.removeCaptureListener = this.host?.onCaptureResult?.((res) => {
      this.isCapturing = false;
      this.btnCamera.disabled = false;

      if (res?.ok) {
        this.setAttachment({
          id: res.id,
          name: res.name || 'Screenshot.jpg',
          kind: 'image',
          thumbnail: res.dataUrl,
          dataUrl: res.dataUrl,
        });
      } else if (res?.reason !== 'cancelled') {
        const msg = res?.message || 'Screen capture was cancelled.';
        if (res?.reason === 'permission') {
          this.addPermissionMessage(msg);
        } else {
          this.addMessage({ role: 'pet', text: msg, isError: true });
        }
      }
      this.textarea.focus();
    });
  }

  addPermissionMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg chat-msg--pet chat-msg--error';
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'chat-msg__bubble';
    const textEl = document.createElement('div');
    textEl.textContent = text;
    bubbleEl.appendChild(textEl);

    const btnSettings = document.createElement('button');
    btnSettings.type = 'button';
    btnSettings.className = 'chat-btn-permission';
    btnSettings.textContent = 'Open System Settings';
    btnSettings.style.cssText = 'margin-top: 8px; padding: 4px 12px; font-size: 11px; font-weight: 600; border-radius: 999px; background: #e02424; color: #fff; border: none; cursor: pointer; display: inline-block;';
    btnSettings.addEventListener('click', () => {
      this.host?.openPermissionSettings?.();
    });
    bubbleEl.appendChild(btnSettings);

    msgEl.appendChild(bubbleEl);
    this.msgList.appendChild(msgEl);
    this.msgList.scrollTop = this.msgList.scrollHeight;
  }

  async #startScreenCapture(opts = {}) {
    if (this.isCapturing) return;
    this.isCapturing = true;
    this.btnCamera.disabled = true;

    try {
      const res = await this.host?.startScreenCapture?.(opts);
      if (res && res.ok === false) {
        this.isCapturing = false;
        this.btnCamera.disabled = false;
        if (res.reason !== 'already_running') {
          this.addMessage({ role: 'pet', text: res.message || 'Could not start screen capture.', isError: true });
        }
      }
    } catch (err) {
      this.isCapturing = false;
      this.btnCamera.disabled = false;
      this.addMessage({ role: 'pet', text: err.message || "Couldn't start screen capture.", isError: true });
    }
  }

  async #openFileDialog() {
    this.isSuspended = true;
    try {
      const res = await this.host.openFileDialog();
      if (res && res.id) {
        this.setAttachment(res);
      } else if (res && res.error) {
        this.addMessage({ role: 'pet', text: res.error, isError: true });
      }
    } catch (err) {
      this.addMessage({ role: 'pet', text: err.message || "Couldn't read file.", isError: true });
    } finally {
      this.isSuspended = false;
      this.textarea.focus();
    }
  }

  setAttachment(attachment) {
    this.currentAttachment = attachment;
    this.#showAttachmentChip(attachment);
    this.#updateSendState();
  }

  #showAttachmentChip(attachment) {
    if (attachment.kind === 'image') {
      this.chipName.textContent = 'This image will be sent to Groq when you press send';
      this.chipThumb.src = attachment.thumbnail || attachment.dataUrl;
      this.chipThumb.classList.remove('hidden');
      this.chipIcon.classList.add('hidden');
    } else {
      this.chipName.textContent = attachment.name || 'Attachment';
      this.chipThumb.classList.add('hidden');
      this.chipIcon.classList.remove('hidden');
    }

    this.attachmentRow.classList.remove('hidden');
  }

  removeAttachment(notifyHost = true) {
    if (this.currentAttachment && notifyHost) {
      this.host?.deleteAttachment?.(this.currentAttachment.id);
    }
    this.currentAttachment = null;
    this.attachmentRow.classList.add('hidden');
    this.#updateSendState();
  }

  update() {
    // Intentionally no-op per frame to eliminate jitter and lag
  }
}
