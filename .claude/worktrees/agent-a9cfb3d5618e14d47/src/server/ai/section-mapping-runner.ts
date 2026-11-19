/**
 * Spec 025 FR-013 / FR-014 — SSE runner that maps source content onto the six
 * overview sections and streams the result to the client.
 *
 * Shared by the paste-analyze (A9) and import (A10/A11) routes. Handles:
 *   - chunking large content with the per-import call cap (T008 / N9)
 *   - accumulating-context multi-pass mapping (only the final pass is streamed)
 *   - transcript persistence with the C16 asymmetry: imports persist the raw
 *     source (role='user' + sourceuri); pastes persist only the AI analysis.
 *
 * SSE event contract (matches the ai-message route):
 *   event: progress   data: { current, total }   (per chunk pass)
 *   event: chunk      data: { delta }             (final pass only)
 *   event: done       data: { messageId }
 *   event: heartbeat  data: { ts }                (every 15s, N4)
 *   event: error      data: { error }
 */
import type { Request, Response } from 'express';
import { db } from '~/db/client.js';
import { overviewtranscripts } from '~/db/schema/overviewtranscripts.js';
import { createLogger } from '~/server/lib/logger.js';
import { chunkText, assertWithinCallCap } from '~/server/ai/text-chunker.js';
import { streamChat, LlmConfigError } from '~/server/ai/llm-stream.js';
import {
  SECTION_MAPPER_SYSTEM_PROMPT,
  buildSectionMappingTurn,
} from '~/server/ai/prompts/section-mapper.js';

const logger = createLogger('section-mapping-runner');

export async function runSectionMapping(
  req: Request,
  res: Response,
  opts: {
    draftid: string;
    sourceText: string;
    /** When set, the raw source is persisted to the transcript (FR-014 / C16). */
    sourceuri?: string | null;
    /** Imports persist raw source; pastes do not (C16). */
    persistRaw: boolean;
  },
): Promise<void> {
  const { draftid, sourceText, sourceuri = null, persistRaw } = opts;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: Record<string, unknown>): void => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    send('heartbeat', { ts: new Date().toISOString() });
  }, 15_000);

  let aborted = false;
  req.on('close', () => {
    aborted = true;
    clearInterval(heartbeat);
  });

  try {
    const chunks = chunkText(sourceText);
    if (chunks.length === 0) {
      clearInterval(heartbeat);
      send('error', { error: 'No content to analyze.' });
      res.end();
      return;
    }
    assertWithinCallCap(chunks.length);

    let priorMapping = '';
    for (let i = 0; i < chunks.length && !aborted; i++) {
      const isLast = i === chunks.length - 1;
      send('progress', { current: i + 1, total: chunks.length });
      const turn = buildSectionMappingTurn({
        sourceText: chunks[i]!,
        chunkIndex: i,
        chunkTotal: chunks.length,
        priorMapping,
      });
      priorMapping = await streamChat({
        system: SECTION_MAPPER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: turn }],
        onDelta: isLast ? (delta) => send('chunk', { delta }) : undefined,
      });
    }

    if (aborted) {
      clearInterval(heartbeat);
      return;
    }

    // Persist transcript rows. Imports keep the raw source (C16); pastes don't.
    if (persistRaw) {
      await db.insert(overviewtranscripts).values({
        overviewdraftid: draftid,
        role: 'user',
        content: sourceText,
        sourceuri,
      });
    }
    const [persisted] = await db
      .insert(overviewtranscripts)
      .values({
        overviewdraftid: draftid,
        role: 'assistant',
        content: priorMapping,
        sourceuri,
      })
      .returning();

    clearInterval(heartbeat);
    send('done', { messageId: persisted!.id });
    res.end();
  } catch (err) {
    clearInterval(heartbeat);
    logger.error({ err, draftid }, 'section mapping failed');
    try {
      const message =
        err instanceof LlmConfigError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Section mapping failed';
      send('error', { error: message });
      res.end();
    } catch {
      // stream already closed
    }
  }
}
