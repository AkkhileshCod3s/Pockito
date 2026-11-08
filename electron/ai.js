import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { getPetSystemPrompt, FORMAT_RULES } from './ai/prompts.js';

export { getPetSystemPrompt, FORMAT_RULES };

/**
 * Groq API Configuration & Dynamic Model Resolution
 * Preference lists:
 * - Text: openai/gpt-oss-20b, openai/gpt-oss-120b, llama-3.3-70b-versatile, llama-3.1-8b-instant
 *   Fallback: first available non-whisper, non-tts, non-guard, non-compound chat model.
 * - Vision: qwen/qwen3.8-27b, qwen/qwen3.6-27b, meta-llama/llama-4-scout-17b-16e-instruct
 *   Fallback: friendly refusal if no vision model available.
 */

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_MODELS_URL = `${GROQ_BASE_URL}/models`;
export const GROQ_CHAT_URL = `${GROQ_BASE_URL}/chat/completions`;

export const PREFERRED_TEXT_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

export const PREFERRED_VISION_MODELS = [
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

export const MODEL_TEXT_DEFAULT = PREFERRED_TEXT_MODELS[0];
export const MODEL_VISION_DEFAULT = PREFERRED_VISION_MODELS[0];

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_TEXT_FILE_BYTES = 1024 * 1024; // 1 MB
export const MAX_TEXT_FILE_CHARS = 24_000; // ~6,000 tokens cap for attached text/code
export const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

export const VALID_MOODS = new Set([
  'neutral', 'happy', 'sad', 'sleepy', 'asleep', 'curious',
  'surprised', 'excited', 'angry', 'joy', 'love', 'uwu',
  'crying', 'smug', 'deadpan', 'annoyed', 'nervous', 'pouty',
  'dizzy', 'sparkle',
]);

export const VALID_ACTIONS = new Set([
  'none', 'happy', 'curious', 'excited', 'wave', 'dance', 'sad', 'surprised',
]);

const keyFilePath = () => path.join(app.getPath('userData'), 'groq.enc');

// In-memory transcript limited to the last 10 turns (text only, never raw image or file blobs)
let transcript = [];

// In-memory cache of model IDs this key can access for the current session
let cachedModels = null;

export function clearTranscript() {
  transcript = [];
}

export function getTranscript() {
  return [...transcript];
}

/**
 * Checks whether an encrypted API key file exists.
 */
export function hasKey() {
  try {
    return fs.existsSync(keyFilePath());
  } catch {
    return false;
  }
}

/**
 * Retrieves and decrypts the stored Groq API key.
 * Throws if encryption is unavailable or decryption fails.
 */
export function getKey() {
  if (!hasKey()) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is not available on this system.');
  }
  const encrypted = fs.readFileSync(keyFilePath());
  return safeStorage.decryptString(encrypted);
}

/**
 * Encrypts and saves the Groq API key.
 * Enforces safeStorage encryption; strictly refuses plaintext fallback.
 */
export function saveKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('API key must be a non-empty string.');
  }
  const trimmed = key.trim();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is not available on this system. Cannot safely store API key.');
  }
  const encrypted = safeStorage.encryptString(trimmed);
  const target = keyFilePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encrypted);

  // Refresh available models in memory after a key is saved
  fetchAvailableModels(trimmed, true).catch(() => {});
}

/**
 * Deletes any stored API key and resets session model cache.
 */
export function deleteKey() {
  cachedModels = null;
  try {
    if (fs.existsSync(keyFilePath())) {
      fs.unlinkSync(keyFilePath());
    }
  } catch (err) {
    console.error('Failed to remove key file:', err);
  }
}

/**
 * Fetches available models for the given or stored key and caches them in memory.
 */
export async function fetchAvailableModels(apiKey = null, force = false) {
  if (cachedModels && cachedModels.length > 0 && !force) {
    return cachedModels;
  }
  const key = apiKey || getKey();
  if (!key) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(GROQ_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key.trim()}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const body = await res.json();
      const models = (body.data || [])
        .map((m) => (typeof m === 'string' ? m : m.id))
        .filter(Boolean);
      if (models.length > 0) {
        cachedModels = models;
        return cachedModels;
      }
    }
  } catch {
    clearTimeout(timer);
  }
  return cachedModels || [];
}

/**
 * Tests an API key against the Groq /models endpoint.
 * Returns { success: true } or { success: false, status: number, error: string }.
 */
export async function testKey(apiKey) {
  const key = apiKey || getKey();
  if (!key) {
    return { success: false, status: 401, error: 'No API key provided.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key.trim()}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      try {
        const body = await res.json();
        const models = (body.data || [])
          .map((m) => (typeof m === 'string' ? m : m.id))
          .filter(Boolean);
        if (models.length > 0) {
          cachedModels = models;
        }
      } catch {}
      return { success: true };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        status: res.status,
        error: 'That key was not recognized by Groq (401). Please check and re-enter it.',
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        status: 429,
        error: 'Groq rate limit or quota reached (429). Limits apply across your entire Groq account.',
      };
    }

    let errorDetail = `Groq responded with HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) {
        errorDetail = body.error.message;
      }
    } catch {}

    return {
      success: false,
      status: res.status,
      error: errorDetail,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      success: false,
      status: 0,
      error: err.name === 'AbortError'
        ? 'Connection timed out (30s). Please check your internet connection.'
        : 'Could not reach Groq. Please check your internet connection.',
    };
  }
}

/**
 * Selects the best text model according to the user's preference list and available models.
 */
export function resolveTextModel(availableModels = [], excludedModels = new Set()) {
  const available = (availableModels || []).filter((id) => !excludedModels.has(id));

  // 1. Try preferred text models in preference order
  for (const preferred of PREFERRED_TEXT_MODELS) {
    if (available.includes(preferred)) {
      return preferred;
    }
  }

  // 2. Fall back to first available chat model that is not a whisper, tts, guard or compound model
  for (const id of available) {
    const lower = id.toLowerCase();
    if (
      !lower.includes('whisper') &&
      !lower.includes('tts') &&
      !lower.includes('guard') &&
      !lower.includes('safeguard') &&
      !lower.includes('compound') &&
      !lower.includes('embedding')
    ) {
      return id;
    }
  }

  return PREFERRED_TEXT_MODELS[0];
}

/**
 * Selects the best vision model according to the preference list.
 * Returns null if no vision model is available for this key.
 */
export function resolveVisionModel(availableModels = [], excludedModels = new Set()) {
  const available = (availableModels || []).filter((id) => !excludedModels.has(id));

  // 1. Try preferred vision models in preference order
  for (const preferred of PREFERRED_VISION_MODELS) {
    if (available.includes(preferred)) {
      return preferred;
    }
  }

  // 2. Fall back to any active vision-capable model
  for (const id of available) {
    const lower = id.toLowerCase();
    if (lower.includes('vision') || lower.includes('scout') || lower.includes('qwen')) {
      return id;
    }
  }

  return null;
}

/**
 * Checks if a model requires reasoning parameters.
 */
export function isReasoningModel(modelId) {
  const lower = (modelId || '').toLowerCase();
  return lower.includes('gpt-oss') || lower.includes('deepseek-r1') || lower.includes('reason');
}


/**
 * Sanitizes and validates the JSON output from the model.
 * Defensively strips raw reasoning tags (<think>...</think>).
 */
function sanitizePetReply(rawText) {
  let textToParse = typeof rawText === 'string' ? rawText : '';
  // Strip any raw reasoning / thinking tags so reasoning tokens never leak into the response
  textToParse = textToParse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  let parsed = null;
  try {
    parsed = JSON.parse(textToParse);
  } catch {
    const jsonMatch = textToParse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {}
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      text: typeof textToParse === 'string' && textToParse.length > 0 ? textToParse.slice(0, 200) : '...',
      mood: 'curious',
      action: 'none',
    };
  }

  const text = typeof parsed.text === 'string' && parsed.text.trim().length > 0
    ? parsed.text.trim()
    : '...';

  const mood = typeof parsed.mood === 'string' && VALID_MOODS.has(parsed.mood.toLowerCase())
    ? parsed.mood.toLowerCase()
    : 'neutral';

  const action = typeof parsed.action === 'string' && VALID_ACTIONS.has(parsed.action.toLowerCase())
    ? parsed.action.toLowerCase()
    : 'none';

  return { text, mood, action };
}

/**
 * Internal chat completion request executor.
 */
async function callGroqChat({ messages, model = MODEL_TEXT_DEFAULT, maxTokens = 1024, retryOn413 = true }) {
  const apiKey = getKey();
  if (!apiKey) {
    const err = new Error('No Groq API key configured. Please set up your key in AI settings.');
    err.status = 401;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const isReasoning = isReasoningModel(model);

  const requestBody = {
    model,
    messages,
    max_completion_tokens: Math.max(1024, maxTokens),
    response_format: { type: 'json_object' },
  };

  if (isReasoning) {
    // Low reasoning effort for speed, and parsed format so reasoning is kept in message.reasoning
    requestBody.reasoning_effort = 'low';
    requestBody.reasoning_format = 'parsed';
  } else {
    requestBody.temperature = 0.7;
  }

  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      return sanitizePetReply(content);
    }

    let errorMessage = `HTTP error ${res.status}`;
    let errorCode = null;
    try {
      const errorJson = await res.json();
      if (errorJson?.error?.message) {
        errorMessage = errorJson.error.message;
      }
      if (errorJson?.error?.code) {
        errorCode = errorJson.error.code;
      }
    } catch {}

    const error = new Error(errorMessage);
    error.status = res.status;
    error.code = errorCode;

    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) {
      error.retryAfter = retryAfter;
    }

    // 413: Context length exceeded - trim history and retry once
    if (res.status === 413 && retryOn413 && messages.length > 2) {
      const trimmed = [messages[0], messages[messages.length - 1]];
      return await callGroqChat({ messages: trimmed, model, maxTokens, retryOn413: false });
    }

    throw error;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Groq request timed out (30s). Please check your internet connection.');
      timeoutErr.status = 0;
      throw timeoutErr;
    }
    throw err;
  }
}

/**
 * Unified chat method supporting plain text, text/code files, and image attachments.
 * Implements dynamic model selection, reasoning safeguards, and 404 model retry with fallback.
 */
export async function chat({ userText = '', attachment = null, mobName = 'bluefish', petName = '' }) {
  const hasImage = attachment?.kind === 'image' && !!attachment?.dataUrl;
  const systemPrompt = getPetSystemPrompt(mobName, { hasImage, petName });

  let promptContent = userText.trim();
  let transcriptNote = userText.trim();

  // If text or code file attached, embed with boundary markers
  if (attachment?.kind === 'text' && attachment?.content) {
    promptContent = `[Attached file: ${attachment.name}]\n${attachment.content}\n[End of file]\n\n${promptContent || 'Please look at this file.'}`;
    transcriptNote = `${transcriptNote ? transcriptNote + ' ' : ''}[attached: ${attachment.name}]`;
  } else if (hasImage) {
    transcriptNote = `${transcriptNote ? transcriptNote + ' ' : ''}[attached: ${attachment.name || 'image'}]`;
  }

  if (!promptContent && !hasImage) {
    return { text: '...', mood: 'neutral', action: 'none' };
  }

  // Construct user message (multimodal if image attached, otherwise string)
  let userMessage;
  if (hasImage) {
    userMessage = {
      role: 'user',
      content: [
        { type: 'text', text: promptContent || 'What is in this image?' },
        {
          type: 'image_url',
          image_url: { url: attachment.dataUrl },
        },
      ],
    };
  } else {
    userMessage = {
      role: 'user',
      content: promptContent,
    };
  }

  // Sliding transcript window (last 8 entries before this turn)
  if (transcript.length > 8) {
    transcript = transcript.slice(transcript.length - 8);
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...transcript,
    userMessage,
  ];

  // Resolve model dynamically based on key's available models
  let availableModels = await fetchAvailableModels();
  const triedModels = new Set();

  let targetModel;
  if (hasImage) {
    targetModel = resolveVisionModel(availableModels, triedModels);
    if (!targetModel) {
      return {
        text: "Image questions aren't available with your Groq key right now.",
        mood: 'curious',
        action: 'none',
      };
    }
  } else {
    targetModel = resolveTextModel(availableModels, triedModels);
  }

  triedModels.add(targetModel);

  let reply;
  try {
    reply = await callGroqChat({ messages, model: targetModel });
  } catch (err) {
    const isModelNotFound =
      err.status === 404 ||
      /model.*(?:not found|does not exist|access|decommissioned)/i.test(err.message || '');

    if (isModelNotFound) {
      // Refresh the model list once from Groq
      availableModels = await fetchAvailableModels(null, /* force */ true);

      // Select next available model
      let nextModel;
      if (hasImage) {
        nextModel = resolveVisionModel(availableModels, triedModels);
        if (!nextModel) {
          return {
            text: "Image questions aren't available with your Groq key right now.",
            mood: 'curious',
            action: 'none',
          };
        }
      } else {
        nextModel = resolveTextModel(availableModels, triedModels);
      }

      if (nextModel && !triedModels.has(nextModel)) {
        triedModels.add(nextModel);
        try {
          reply = await callGroqChat({ messages, model: nextModel });
        } catch (retryErr) {
          const friendly = new Error("I couldn't reach a suitable model right now. Please try again in a moment.");
          friendly.status = retryErr.status || 0;
          throw friendly;
        }
      } else {
        const friendly = new Error("I couldn't reach a suitable model right now. Please try again in a moment.");
        friendly.status = 404;
        throw friendly;
      }
    } else {
      throw err;
    }
  }

  // Update transcript with lightweight summary (never image or file content)
  transcript.push({ role: 'user', content: transcriptNote });
  transcript.push({ role: 'assistant', content: JSON.stringify(reply) });

  return reply;
}
