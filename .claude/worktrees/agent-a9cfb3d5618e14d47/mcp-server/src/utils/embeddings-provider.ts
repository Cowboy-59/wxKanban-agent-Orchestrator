// [SCOPE 074 / T002] BEGIN — embeddings provider abstraction
// Embeddings are a deterministic vectorization (not LLM reasoning/generation), so they are
// allowed in the MCP/server deterministic layer per SCOPE-074. Provider is selected by
// EMBEDDINGS_PROVIDER (separate from LLM_PROVIDER — generation runs on groq, which has no
// embeddings). v1 default = Gemini text-embedding-004 (768-dim); `selfhosted` points at any
// OpenAI-compatible /v1/embeddings endpoint (bring-your-own / data residency, SCOPE-076).
import logger from './logger.js';

export type EmbeddingsProvider = 'gemini' | 'openai' | 'selfhosted';

export interface EmbeddingsConfig {
  provider: EmbeddingsProvider;
  model: string;
  /** OpenAI-compatible base URL (openai|selfhosted). */
  baseUrl?: string;
  apiKey?: string;
  /** Output dimensions — must match the capabilityindex vector(N). Used to VALIDATE. */
  dimensions?: number;
  /**
   * [SCOPE 099 / T006] Only set when EMBEDDINGS_DIM was given explicitly, and only
   * then is `dimensions` sent upstream. Most 768-native models reject the param —
   * DeepInfra 400s on BAAI/bge-base-en-v1.5 ("does not support matryoshka
   * representation"). Truncation is opt-in; width validation is always on.
   */
  requestedDimensions?: number;
}

// gemini-embedding-001 is the current GA embedding model (text-embedding-004 was retired -> 404).
// Default 3072 dims; we request outputDimensionality to match the vector(768) table.
const GEMINI_DEFAULT_MODEL = 'gemini-embedding-001';
const DEFAULT_DIMENSIONS = 768;
const OPENAI_DEFAULT_MODEL = 'text-embedding-3-small';

export function resolveEmbeddingsConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingsConfig {
  const provider = (env.EMBEDDINGS_PROVIDER || 'gemini').toLowerCase() as EmbeddingsProvider;
  // [SCOPE 099 / T006] `dimensions` is now set on EVERY branch, not just gemini.
  // It previously existed only on the gemini path, so assertVectorWidth's `if
  // (!expected) return` short-circuited on selfhosted/openai — i.e. width validation
  // was absent from precisely the paths this scope moves us onto. `requestedDimensions`
  // stays undefined unless EMBEDDINGS_DIM is explicit (see the interface).
  const requestedDimensions = env.EMBEDDINGS_DIM ? parseInt(env.EMBEDDINGS_DIM, 10) : undefined;
  const dimensions = requestedDimensions ?? DEFAULT_DIMENSIONS;
  if (provider === 'selfhosted') {
    return {
      provider,
      model: env.EMBEDDINGS_MODEL || 'nomic-embed-text',
      baseUrl: env.EMBEDDINGS_BASE_URL, // e.g. http://customer-host:11434/v1 (validated at call time)
      apiKey: env.EMBEDDINGS_API_KEY,
      dimensions,
      requestedDimensions,
    };
  }
  if (provider === 'openai') {
    return {
      provider,
      model: env.EMBEDDINGS_MODEL || OPENAI_DEFAULT_MODEL,
      baseUrl: env.EMBEDDINGS_BASE_URL || 'https://api.openai.com/v1',
      apiKey: env.OPENAI_API_KEY,
      dimensions,
      requestedDimensions,
    };
  }
  return {
    provider: 'gemini',
    model: env.EMBEDDINGS_MODEL || GEMINI_DEFAULT_MODEL,
    apiKey: env.GEMINI_API_KEY,
    dimensions,
    // Gemini is the exception: outputDimensionality is REQUIRED to get 768 from a
    // model whose native width is 3072, so it always sends the expected width.
    requestedDimensions: dimensions,
  };
}

/**
 * Embed a batch of texts into vectors. Order of the result matches the input order.
 * Throws on misconfiguration or a non-OK provider response.
 */
export async function embed(texts: string[], cfg: EmbeddingsConfig = resolveEmbeddingsConfig()): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (cfg.provider === 'gemini') return embedGemini(texts, cfg);
  return embedOpenAiCompatible(texts, cfg); // openai + selfhosted share the OpenAI wire format
}

async function embedGemini(texts: string[], cfg: EmbeddingsConfig): Promise<number[][]> {
  if (!cfg.apiKey) throw new Error('GEMINI_API_KEY not configured (EMBEDDINGS_PROVIDER=gemini)');
  const model = cfg.model.startsWith('models/') ? cfg.model : `models/${cfg.model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents?key=${cfg.apiKey}`;
  const dim = cfg.dimensions ?? DEFAULT_DIMENSIONS;
  const body = {
    requests: texts.map((text) => ({ model, content: { parts: [{ text }] }, outputDimensionality: dim })),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    logger.error('embeddings.gemini.error', undefined, { status: res.status, detail });
    throw new Error(`Gemini embeddings error: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
  const out = (json.embeddings || []).map((e) => e.values);
  if (out.length !== texts.length) {
    throw new Error(`Gemini returned ${out.length} embeddings for ${texts.length} inputs`);
  }
  assertVectorWidth(out, cfg);
  return out;
}

async function embedOpenAiCompatible(texts: string[], cfg: EmbeddingsConfig): Promise<number[][]> {
  if (!cfg.baseUrl) {
    throw new Error(`EMBEDDINGS_BASE_URL not configured (EMBEDDINGS_PROVIDER=${cfg.provider})`);
  }
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/embeddings`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    // [SCOPE 099 / T006] `dimensions` sent ONLY when explicitly requested via
    // EMBEDDINGS_DIM. Verified: DeepInfra 400s on BAAI/bge-base-en-v1.5 ("does not
    // support matryoshka representation"), so sending it unconditionally would break
    // every call to a 768-native model. Use it to TRUNCATE a wider Matryoshka model;
    // otherwise trust the native width and let assertVectorWidth police the result.
    body: JSON.stringify({ model: cfg.model, input: texts, ...(cfg.requestedDimensions ? { dimensions: cfg.requestedDimensions } : {}) }),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    logger.error('embeddings.openai_compatible.error', undefined, { provider: cfg.provider, status: res.status, detail });
    throw new Error(`Embeddings error (${cfg.provider}): ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
  const data = json.data || [];
  if (data.length !== texts.length) {
    throw new Error(`${cfg.provider} returned ${data.length} embeddings for ${texts.length} inputs`);
  }
  // Sort by index to guarantee input-order alignment.
  const vectors = [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  assertVectorWidth(vectors, cfg);
  return vectors;
}

/**
 * [SCOPE 099 / T006] The capability index is `vector(768)`. A vector of any other
 * width is not a degraded result, it is a corrupt row — pgvector rejects the insert,
 * or the value lands and every later similarity search is meaningless. Fail where the
 * provider and model are still in scope to name. Applies to the gemini path too:
 * outputDimensionality is a request, not a guarantee.
 */
function assertVectorWidth(vectors: number[][], cfg: EmbeddingsConfig): void {
  const expected = cfg.dimensions;
  if (!expected) return;
  const bad = vectors.find((v) => v.length !== expected);
  if (bad) {
    throw new Error(
      `Embeddings width mismatch: ${cfg.provider}/${cfg.model} returned ${bad.length}-dim vectors, ` +
        `but the index expects ${expected}. Pick a model whose native width is ${expected} ` +
        `(e.g. nomic-embed-text, BAAI/bge-base-en-v1.5), or set EMBEDDINGS_DIM to match and re-index.`,
    );
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}
// [SCOPE 074 / T002] END
