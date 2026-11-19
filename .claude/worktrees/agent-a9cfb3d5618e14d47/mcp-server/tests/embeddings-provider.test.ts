/**
 * SCOPE-074 / T002 — embeddings provider abstraction.
 * Mocks fetch; verifies provider selection, the Gemini batch path, the OpenAI-compatible
 * (selfhosted) path with input-order alignment, and the misconfiguration guards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  embed,
  resolveEmbeddingsConfig,
  type EmbeddingsConfig,
} from '../src/utils/embeddings-provider.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetch(json: unknown, ok = true, status = 200): void {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    json: async () => json,
    text: async () => JSON.stringify(json),
  })) as unknown as typeof fetch;
}

describe('resolveEmbeddingsConfig', () => {
  it('defaults to Gemini gemini-embedding-001 @ 768 dims', () => {
    const cfg = resolveEmbeddingsConfig({} as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe('gemini');
    expect(cfg.model).toBe('gemini-embedding-001');
    expect(cfg.dimensions).toBe(768);
  });
  it('honors selfhosted base URL + model', () => {
    const cfg = resolveEmbeddingsConfig({
      EMBEDDINGS_PROVIDER: 'selfhosted',
      EMBEDDINGS_BASE_URL: 'http://host:11434/v1',
      EMBEDDINGS_MODEL: 'nomic-embed-text',
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe('selfhosted');
    expect(cfg.baseUrl).toBe('http://host:11434/v1');
  });
});

describe('embed', () => {
  it('returns [] for empty input without calling fetch', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const out = await embed([]);
    expect(out).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('Gemini: parses batchEmbedContents in input order', async () => {
    mockFetch({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] });
    const cfg: EmbeddingsConfig = { provider: 'gemini', model: 'text-embedding-004', apiKey: 'k' };
    const out = await embed(['a', 'b'], cfg);
    expect(out).toEqual([[1, 2], [3, 4]]);
    const url = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(':batchEmbedContents');
    expect(url).toContain('key=k');
  });

  it('Gemini: throws without an API key', async () => {
    const cfg: EmbeddingsConfig = { provider: 'gemini', model: 'text-embedding-004' };
    await expect(embed(['a'], cfg)).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('OpenAI-compatible: realigns results by index', async () => {
    mockFetch({ data: [{ embedding: [5, 6], index: 1 }, { embedding: [1, 2], index: 0 }] });
    const cfg: EmbeddingsConfig = { provider: 'selfhosted', model: 'm', baseUrl: 'http://h/v1', apiKey: 't' };
    const out = await embed(['x', 'y'], cfg);
    expect(out).toEqual([[1, 2], [5, 6]]);
    const url = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toBe('http://h/v1/embeddings');
  });

  it('selfhosted: throws without a base URL', async () => {
    const cfg: EmbeddingsConfig = { provider: 'selfhosted', model: 'm' };
    await expect(embed(['a'], cfg)).rejects.toThrow(/EMBEDDINGS_BASE_URL/);
  });

  it('throws on a non-OK provider response', async () => {
    mockFetch({ error: 'boom' }, false, 500);
    const cfg: EmbeddingsConfig = { provider: 'gemini', model: 'text-embedding-004', apiKey: 'k' };
    await expect(embed(['a'], cfg)).rejects.toThrow(/Gemini embeddings error: 500/);
  });
});
