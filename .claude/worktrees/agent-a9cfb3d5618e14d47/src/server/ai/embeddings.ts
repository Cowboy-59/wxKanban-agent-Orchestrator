// [SCOPE 075 / T1] BEGIN — app-side embeddings (capability index search + populate).
// [SCOPE 099 / T006] MODIFIED-BY — send `dimensions`; reject wrong-width vectors
// Separate from llm-provider (generation): embeddings are vectorization. Default
// gemini-embedding-001 @ outputDimensionality 768 to match the live capabilityindex
// vector(768). A `selfhosted` OpenAI-compatible endpoint (bring-your-own / SCOPE-076)
// is supported for data residency. (mcp-server has its own copy; this is the app's.)
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("app-embeddings");

const GEMINI_DEFAULT_MODEL = "gemini-embedding-001";
const DEFAULT_DIMENSIONS = 768;

// [SCOPE 099 / T006] `openai` added to close a real drift: this app-side copy
// accepted only gemini|selfhosted while mcp-server's accepted gemini|openai|selfhosted.
// Same EMBEDDINGS_PROVIDER env var, two different answers — set it to `openai` and the
// MCP honored it while the app silently fell back to GEMINI, i.e. the exact vendor the
// operator was trying to leave. Both copies now accept the same set.
export type AppEmbeddingsProvider = "gemini" | "openai" | "selfhosted";

export interface AppEmbeddingsConfig {
  provider: AppEmbeddingsProvider;
  model: string;
  /** Width the index requires. Always set — used to VALIDATE what came back. */
  dimensions: number;
  /**
   * [SCOPE 099 / T006] Only set when EMBEDDINGS_DIM was given explicitly, and only
   * then is `dimensions` sent to the provider. Most 768-native models reject the
   * param outright — DeepInfra 400s on BAAI/bge-base-en-v1.5 with "does not support
   * matryoshka representation". Sending it by default would break every call to the
   * very model we want. Truncation is opt-in; validation is always on.
   */
  requestedDimensions?: number;
  baseUrl?: string;
  apiKey?: string;
}

const OPENAI_DEFAULT_MODEL = "text-embedding-3-small";

export function resolveAppEmbeddingsConfig(env: NodeJS.ProcessEnv = process.env): AppEmbeddingsConfig {
  const raw = (env.EMBEDDINGS_PROVIDER || "gemini").toLowerCase();
  const provider: AppEmbeddingsProvider =
    raw === "selfhosted" || raw === "openai" || raw === "gemini" ? raw : "gemini";
  if (raw !== provider) {
    logger.warn({ raw }, "Unknown EMBEDDINGS_PROVIDER — falling back to gemini");
  }
  const requestedDimensions = env.EMBEDDINGS_DIM ? parseInt(env.EMBEDDINGS_DIM, 10) : undefined;
  const dimensions = requestedDimensions ?? DEFAULT_DIMENSIONS;
  if (provider === "selfhosted") {
    return { provider, model: env.EMBEDDINGS_MODEL || "nomic-embed-text", dimensions, requestedDimensions, baseUrl: env.EMBEDDINGS_BASE_URL, apiKey: env.EMBEDDINGS_API_KEY };
  }
  if (provider === "openai") {
    return { provider, model: env.EMBEDDINGS_MODEL || OPENAI_DEFAULT_MODEL, dimensions, requestedDimensions, baseUrl: env.EMBEDDINGS_BASE_URL || "https://api.openai.com/v1", apiKey: env.OPENAI_API_KEY };
  }
  // Gemini is the exception: outputDimensionality is REQUIRED to get 768 out of a
  // model whose native width is 3072, so it always sends the expected width.
  return { provider: "gemini", model: env.EMBEDDINGS_MODEL || GEMINI_DEFAULT_MODEL, dimensions, requestedDimensions: dimensions, apiKey: env.GEMINI_API_KEY };
}

/** Embed texts → vectors (input order preserved). Throws on misconfig / non-OK response. */
export async function embed(texts: string[], cfg: AppEmbeddingsConfig = resolveAppEmbeddingsConfig()): Promise<number[][]> {
  if (texts.length === 0) return [];
  return cfg.provider === "gemini" ? embedGemini(texts, cfg) : embedOpenAiCompatible(texts, cfg);
}

/** pgvector text literal for a vector (used in `$n::vector` casts). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

async function embedGemini(texts: string[], cfg: AppEmbeddingsConfig): Promise<number[][]> {
  if (!cfg.apiKey) throw new Error("GEMINI_API_KEY not configured (EMBEDDINGS_PROVIDER=gemini)");
  const model = cfg.model.startsWith("models/") ? cfg.model : `models/${cfg.model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents?key=${cfg.apiKey}`;
  const body = { requests: texts.map((text) => ({ model, content: { parts: [{ text }] }, outputDimensionality: cfg.dimensions })) };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    logger.error({ status: res.status }, "gemini embeddings error");
    throw new Error(`Gemini embeddings error: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
  const out = (json.embeddings || []).map((e) => e.values);
  if (out.length !== texts.length) throw new Error(`Gemini returned ${out.length} embeddings for ${texts.length} inputs`);
  assertVectorWidth(out, cfg);
  return out;
}

async function embedOpenAiCompatible(texts: string[], cfg: AppEmbeddingsConfig): Promise<number[][]> {
  if (!cfg.baseUrl) throw new Error(`EMBEDDINGS_BASE_URL not configured (EMBEDDINGS_PROVIDER=${cfg.provider})`);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers,
    // [SCOPE 099 / T006] `dimensions` is sent ONLY when explicitly requested via
    // EMBEDDINGS_DIM. Verified: DeepInfra 400s on BAAI/bge-base-en-v1.5 ("does not
    // support matryoshka representation") — sending it unconditionally would break
    // every call to a 768-native model, which is exactly what we want to use. Use it
    // to TRUNCATE a wider Matryoshka model (nomic, text-embedding-3-small); otherwise
    // rely on the model's native width and let assertVectorWidth police the result.
    body: JSON.stringify({ model: cfg.model, input: texts, ...(cfg.requestedDimensions ? { dimensions: cfg.requestedDimensions } : {}) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error({ status: res.status, provider: cfg.provider, detail: detail.slice(0, 300) }, "embeddings error");
    throw new Error(`Embeddings error (${cfg.provider}): ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
  const data = json.data || [];
  if (data.length !== texts.length) throw new Error(`${cfg.provider} returned ${data.length} embeddings for ${texts.length} inputs`);
  const vectors = [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  assertVectorWidth(vectors, cfg);
  return vectors;
}

/**
 * The capability index is `vector(768)`. A vector of any other width is not a
 * degraded result, it is a corrupt row — pgvector will either reject the insert or
 * (worse) the value gets written and every later similarity search is meaningless.
 * Fail here, where the provider and model are still in scope to name.
 */
function assertVectorWidth(vectors: number[][], cfg: AppEmbeddingsConfig): void {
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
// [SCOPE 075 / T1] END
