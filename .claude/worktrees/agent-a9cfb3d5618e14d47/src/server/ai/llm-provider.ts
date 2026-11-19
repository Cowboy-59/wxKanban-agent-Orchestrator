import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('llm-provider');

export type LlmProvider = 'groq' | 'gemini' | 'anthropic' | 'openai-compatible';

/**
 * How a provider talks on the wire. This — not the vendor — is the real axis of
 * variation: there are exactly three shapes, and vendors are just rows pointing at
 * one of them. `groq` and `openai-compatible` share the `openai` sender.
 */
export type WireFormat = 'openai' | 'anthropic' | 'gemini';

export const ALL_PROVIDERS: readonly LlmProvider[] = [
  'groq',
  'gemini',
  'anthropic',
  'openai-compatible',
];

// [SCOPE 099 / T001] BEGIN — Typed LLM configuration error
export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
}
// [SCOPE 099 / T001] END

interface ProviderPreset {
  wire: WireFormat;
  /** Fixed endpoint. Undefined = caller must supply one (openai-compatible). */
  baseUrl?: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel?: string;
}

const PRESETS: Record<LlmProvider, ProviderPreset> = {
  groq: {
    wire: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-120b', // [SCOPE 099 / T013] llama-3.3-70b-versatile retired by Groq
  },
  gemini: {
    wire: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
  },
  anthropic: {
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyEnv: 'ANTHROPIC_API_KEY',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-haiku-4-5-20251001',
  },
  // No baseUrl: LLM_BASE_URL is required. That single knob is what lets this one
  // row serve a free endpoint today and a self-hosted model later (SCOPE-099),
  // and what SCOPE-076 fills per-tenant via resolveEndpoint({ baseUrl }).
  'openai-compatible': {
    wire: 'openai',
    keyEnv: 'LLM_API_KEY',
    modelEnv: 'LLM_MODEL',
  },
};

// [SCOPE 099 / T001] BEGIN — Resolve LLM_PROVIDER, failing loudly when unknown
export function getProvider(): LlmProvider {
  const raw = (process.env['LLM_PROVIDER'] || 'groq').toLowerCase();
  if ((ALL_PROVIDERS as readonly string[]).includes(raw)) return raw as LlmProvider;
  // FR-001. Previously this warned and returned 'groq', which meant a typo or a
  // not-yet-supported value silently routed every AI call to the exhausted
  // 100k-tok/day tier — a wrong answer that looks like a working one.
  throw new LlmConfigError(
    `Unknown LLM_PROVIDER "${raw}". Expected one of: ${ALL_PROVIDERS.join(', ')}.`,
  );
}
// [SCOPE 099 / T001] END

// [SCOPE 099 / T001] BEGIN — Per-provider model default
export function getProviderModel(provider: LlmProvider): string {
  const preset = PRESETS[provider];
  const fromEnv = process.env[preset.modelEnv];
  if (fromEnv) return fromEnv;
  if (preset.defaultModel) return preset.defaultModel;
  throw new LlmConfigError(
    `${preset.modelEnv} not configured (LLM_PROVIDER=${provider}). There is no default model for this provider — set it to the model your endpoint serves, e.g. gpt-oss-120b.`,
  );
}
// [SCOPE 099 / T001] END

// [SCOPE 100 / T017] BEGIN — Which providers are actually configured (bio provider picker)
/**
 * The providers a founder can actually pick right now: those whose API key env is
 * set. `openai-compatible` has no fixed endpoint, so it also needs LLM_BASE_URL —
 * a key alone can't reach anything. Keeps the Bio picker free of dead options that
 * would only fail at call time.
 */
export function availableProviders(): LlmProvider[] {
  return ALL_PROVIDERS.filter((provider) => {
    const preset = PRESETS[provider];
    if (!process.env[preset.keyEnv]) return false;
    if (!preset.baseUrl) return Boolean(process.env['LLM_BASE_URL']);
    return true;
  });
}
// [SCOPE 100 / T017] END

export interface ResolvedEndpoint {
  provider: LlmProvider;
  wire: WireFormat;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ResolveEndpointOptions {
  provider?: LlmProvider;
  model?: string;
  /** Overrides the preset/env endpoint. The SCOPE-076 per-tenant seam. */
  baseUrl?: string;
  apiKey?: string;
}

// [SCOPE 099 / T001] BEGIN — Single endpoint resolution seam
/**
 * The one place that decides where an AI call goes. Order: per-call override >
 * env > provider preset. Every generation path resolves through here, so this is
 * also the single place worth logging.
 */
export function resolveEndpoint(opts: ResolveEndpointOptions = {}): ResolvedEndpoint {
  const provider = opts.provider ?? getProvider();
  const preset = PRESETS[provider];

  // Order matters: a provider with a FIXED endpoint (groq/gemini/anthropic) must
  // never read LLM_BASE_URL — that var belongs to openai-compatible alone. Reading
  // it first would point Gemini at whatever endpoint happened to be staged in .env.
  const baseUrl = opts.baseUrl ?? preset.baseUrl ?? process.env['LLM_BASE_URL'];
  if (!baseUrl) {
    throw new LlmConfigError(
      `LLM_BASE_URL not configured (LLM_PROVIDER=${provider}). Point it at any OpenAI-compatible endpoint, e.g. https://api.cerebras.ai/v1 (hosted) or http://localhost:11434/v1 (self-hosted).`,
    );
  }

  const apiKey = opts.apiKey ?? process.env[preset.keyEnv] ?? '';
  if (!apiKey) {
    throw new LlmConfigError(`${preset.keyEnv} not configured (LLM_PROVIDER=${provider})`);
  }

  return {
    provider,
    wire: preset.wire,
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    model: opts.model ?? getProviderModel(provider),
  };
}
// [SCOPE 099 / T001] END

// [SCOPE 099 / T001] BEGIN — Tolerant JSON parse for reasoning models
/**
 * Reasoning models wrap JSON in prose or ```json fences even under a JSON mode.
 * Hoisted from MarketingAIService so every JSON call site parses the same way.
 * Returns null rather than throwing — callers decide whether that is fatal.
 */
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the outermost {...} or [...] the model emitted.
    const match = cleaned.match(/[{[][\s\S]*[}\]]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
// [SCOPE 099 / T001] END

export interface GenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // [SCOPE 065 / T001] Optional per-call provider/model override. When supplied
  // these win over the global LLM_PROVIDER env (lets marketing copy use Claude
  // without changing the app-wide default). Omitted → existing env behavior.
  provider?: LlmProvider;
  model?: string;
  /** Ask the provider for JSON. Mapped per wire; best-effort on anthropic. */
  jsonMode?: boolean;
}

// [SCOPE 099 / T001] BEGIN — Non-streaming generation across all wire formats
export async function generateOnce(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const { systemPrompt, temperature = 0.7, maxTokens = 2048, jsonMode = false } = opts;
  const ep = resolveEndpoint({ provider: opts.provider, model: opts.model });

  logger.info(
    { provider: ep.provider, wire: ep.wire, model: ep.model, override: Boolean(opts.provider) },
    'LLM request',
  );

  if (ep.wire === 'openai') {
    return generateOpenAi(prompt, { ep, systemPrompt, temperature, maxTokens, jsonMode });
  }
  if (ep.wire === 'anthropic') {
    return generateAnthropic(prompt, { ep, systemPrompt, temperature, maxTokens, jsonMode });
  }
  return generateGemini(prompt, { ep, systemPrompt, temperature, maxTokens, jsonMode });
}
// [SCOPE 099 / T001] END

interface SendArgs {
  ep: ResolvedEndpoint;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
}

// [SCOPE 099 / T001] BEGIN — Provider error carrying the response body
// [SCOPE 099 / T002] MODIFIED-BY — exported so streamChat shares one error shape
/**
 * Providers explain *why* they rejected a call in the response body. Discarding it
 * (as every branch here used to) turns a one-line fix into a debugging session —
 * "400 Bad Request" alone is unactionable. Truncated: bodies can be large.
 */
export async function providerError(res: Response, provider: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    detail = '<unreadable body>';
  }
  return new Error(`${provider} API error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
}
// [SCOPE 099 / T001] END

// [SCOPE 100 / T010] BEGIN — 429 backoff for burst token-per-minute limits
/**
 * How long to wait before retrying a 429, in ms. Prefer the provider's own hint:
 * the `retry-after` header (seconds) if present, else the "try again in 24.245s"
 * phrase Groq embeds in the JSON body. Falls back to an exponential default keyed
 * to the attempt. Capped so one exhausted minute never stalls a request forever.
 */
const RATE_LIMIT_MAX_RETRIES = Number(process.env['LLM_RATE_LIMIT_RETRIES'] ?? 6);
const RATE_LIMIT_MAX_WAIT_MS = 35_000;

function retryAfterMs(res: Response, body: string, attempt: number): number {
  const header = res.headers.get('retry-after');
  const fromHeader = header ? Number(header) * 1000 : NaN;
  const m = body.match(/try again in\s+([\d.]+)\s*s/i);
  const fromBody = m ? Number(m[1]) * 1000 : NaN;
  const hinted = Number.isFinite(fromHeader) ? fromHeader : fromBody;
  // +250ms so we resume just after the window clears, not on its exact edge.
  const wait = Number.isFinite(hinted) ? hinted + 250 : 2 ** attempt * 1000;
  return Math.min(wait, RATE_LIMIT_MAX_WAIT_MS);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
// [SCOPE 100 / T010] END

// [SCOPE 099 / T001] BEGIN — OpenAI-wire sender (groq + openai-compatible)
// [SCOPE 100 / T010] MODIFIED-BY — retry 429s with backoff so a burst that
// overflows the per-minute token budget self-paces instead of failing.
async function generateOpenAi(prompt: string, a: SendArgs): Promise<string> {
  let systemPrompt = a.systemPrompt;
  // The OpenAI JSON-mode contract (enforced by Groq et al): the messages must
  // contain the literal word "json" or the call 400s. Callers asking for JSON via
  // a schema-shaped prompt often never say the word, so guarantee it here rather
  // than making every call site remember. Verified against gpt-oss-120b.
  if (a.jsonMode && !/json/i.test(`${systemPrompt ?? ''}\n${prompt}`)) {
    systemPrompt = `${systemPrompt ?? ''}\n\nRespond with valid JSON only.`.trim();
  }
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ];
  const requestBody = JSON.stringify({
    model: a.ep.model,
    messages,
    temperature: a.temperature,
    max_tokens: a.maxTokens,
    ...(a.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${a.ep.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${a.ep.apiKey}`,
      },
      body: requestBody,
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error(`Empty response from ${a.ep.provider}`);
      return text;
    }
    // Only 429s are worth waiting on; every other status is a real failure.
    if (res.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      const detail = await res.text();
      const waitMs = retryAfterMs(res, detail, attempt);
      logger.warn(
        { provider: a.ep.provider, model: a.ep.model, attempt: attempt + 1, waitMs },
        'rate limited (429) — backing off',
      );
      await sleep(waitMs);
      continue;
    }
    throw await providerError(res, a.ep.provider);
  }
}
// [SCOPE 099 / T001] END

// [SCOPE 099 / T001] BEGIN — Anthropic-wire sender
async function generateAnthropic(prompt: string, a: SendArgs): Promise<string> {
  // No native JSON mode; instruct instead. Documented as best-effort — callers
  // must still parse defensively via parseJsonLoose.
  const system = a.jsonMode
    ? `${a.systemPrompt ?? ''}\n\nRespond with valid JSON only. No prose, no code fences.`.trim()
    : a.systemPrompt;
  const res = await fetch(`${a.ep.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': a.ep.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: a.ep.model,
      max_tokens: a.maxTokens,
      temperature: a.temperature,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw await providerError(res, 'Anthropic');
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Anthropic');
  return text;
}
// [SCOPE 099 / T001] END

// [SCOPE 099 / T001] BEGIN — Gemini-wire sender
async function generateGemini(prompt: string, a: SendArgs): Promise<string> {
  const url = `${a.ep.baseUrl}/models/${a.ep.model}:generateContent?key=${a.ep.apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: a.temperature,
      maxOutputTokens: a.maxTokens,
      ...(a.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (a.systemPrompt) {
    body['systemInstruction'] = { parts: [{ text: a.systemPrompt }] };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await providerError(res, 'Gemini');
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}
// [SCOPE 099 / T001] END
