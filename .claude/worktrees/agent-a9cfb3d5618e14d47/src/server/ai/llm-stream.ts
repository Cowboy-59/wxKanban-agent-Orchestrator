/**
 * Spec 025 FR-019 — shared LLM chat-streaming helper.
 *
 * The single streaming provider-dispatch + SSE-parse path. Endpoint selection is
 * delegated to llm-provider's `resolveEndpoint` (SCOPE-099 / T002) so this module
 * no longer reads LLM_PROVIDER or any per-vendor key itself.
 *
 * Used by paste-analyze (A9), import (A10), and — once T003 lands — the interview
 * route (A4), which currently still keeps its own inline copy.
 */
import { createLogger } from '~/server/lib/logger.js';
import {
  resolveEndpoint,
  providerError,
  type LlmProvider,
} from '~/server/ai/llm-provider.js';

const logger = createLogger('llm-stream');

// [SCOPE 099 / T001] Re-export, not a redeclaration. This module and llm-provider
// both threw a same-named LlmConfigError, which are DIFFERENT classes — so once
// streamChat resolves through llm-provider (T002), section-mapping-runner's
// `err instanceof LlmConfigError` would silently stop matching. One definition,
// one identity. Importers of llm-stream keep working unchanged.
export { LlmConfigError } from '~/server/ai/llm-provider.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// [SCOPE 099 / T002] BEGIN — Streaming chat across all wire formats
/**
 * Run a streaming chat completion against the configured endpoint. Calls `onDelta`
 * for each streamed text fragment (omit it to collect silently) and resolves with
 * the full assistant text. Throws LlmConfigError when the endpoint is misconfigured,
 * or Error (carrying the provider's response body) on an upstream failure.
 *
 * Dispatches on WIRE FORMAT, not vendor: `groq` and `openai-compatible` are the same
 * sender at different base URLs. No `jsonMode` here on purpose — OpenAI-style
 * `response_format: json_object` is documented as incompatible with streaming, and
 * the only structured-output caller is non-streaming (use generateOnce({jsonMode})).
 */
export async function streamChat(opts: {
  system: string;
  messages: ChatMessage[];
  onDelta?: (delta: string) => void;
  maxTokens?: number;
  temperature?: number;
  /** Per-call override; wins over LLM_PROVIDER (the SCOPE-065 pattern). */
  provider?: LlmProvider;
  model?: string;
}): Promise<string> {
  const { system, messages, onDelta, maxTokens = 2048, temperature = 0.4 } = opts;
  const ep = resolveEndpoint({ provider: opts.provider, model: opts.model });

  logger.info(
    { provider: ep.provider, wire: ep.wire, model: ep.model, override: Boolean(opts.provider) },
    'LLM stream request',
  );

  let res: globalThis.Response;

  if (ep.wire === 'anthropic') {
    // Anthropic requires alternating user/assistant turns and forbids a LEADING
    // assistant message. Ported from the interview's inline copy (overview.ts),
    // which was the only place that handled it — streamChat had no equivalent, so
    // the interview would have broken on anthropic the moment it moved here (T003).
    // Order matters: window first, THEN trim — trimming before slicing can
    // re-expose an assistant turn at index 0.
    const trimmed = messages[0]?.role === 'assistant' ? messages.slice(1) : messages;
    res = await fetch(`${ep.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ep.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ep.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: trimmed,
        stream: true,
      }),
    });
  } else if (ep.wire === 'gemini') {
    const url = `${ep.baseUrl}/models/${ep.model}:streamGenerateContent?alt=sse&key=${ep.apiKey}`;
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
  } else {
    // OpenAI wire — serves groq AND openai-compatible (Cerebras / HF router /
    // self-hosted vLLM). Only the base URL differs.
    res = await fetch(`${ep.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ep.apiKey}` },
      body: JSON.stringify({
        model: ep.model,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: true,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  }

  if (!res.ok) throw await providerError(res, ep.provider);
  if (!res.body) throw new Error(`${ep.provider} returned no response body`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nlIdx;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          choices?: Array<{ delta?: { content?: string } }>;
          type?: string;
          delta?: { type?: string; text?: string };
        };
        const delta =
          obj.candidates?.[0]?.content?.parts?.[0]?.text ??
          obj.choices?.[0]?.delta?.content ??
          (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta'
            ? obj.delta.text
            : undefined);
        if (delta) {
          full += delta;
          onDelta?.(delta);
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  }

  // SCOPE-099 US5 — never return a silent blank turn.
  // Reasoning models (gpt-oss et al) stream a `reasoning` channel alongside
  // `content`, and the reasoning is charged FIRST. If max_tokens runs out mid-
  // reasoning the provider still answers HTTP 200 with finish_reason "length" and
  // an EMPTY content string — verified on both Cerebras and Groq at max_tokens=32.
  // Without this guard that renders as an empty assistant bubble with no error, and
  // gets persisted as a real turn. An empty completion is never a valid answer here.
  if (full.length === 0) {
    throw new Error(
      `${ep.provider} returned an empty completion (model=${ep.model}). ` +
        `A reasoning model can consume the whole max_tokens budget before emitting ` +
        `any content — raise maxTokens (currently ${maxTokens}) or check the model.`,
    );
  }

  logger.debug({ provider: ep.provider, chars: full.length }, 'streamChat completed');
  return full;
}
// [SCOPE 099 / T002] END
