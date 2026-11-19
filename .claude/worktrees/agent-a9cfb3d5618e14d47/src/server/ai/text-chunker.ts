/**
 * Spec 025 T008 / FR-014 N9 — text chunking utility for import analysis.
 *
 * Large imported documents are split into ~8k-character windows so the AI
 * section-mapper sees the full document across sequential calls with
 * accumulating context (chunk N is sent alongside the section-mapping produced
 * from chunks 1..N-1, so the final output is stitched rather than disjoint).
 *
 * A hard cap on AI calls per import (default 80) prevents runaway cost on
 * near-ceiling documents (500k / 8k ≈ 62 chunks worst case + revision headroom).
 */

export const DEFAULT_CHUNK_SIZE = 8_000;
export const CHUNK_OVERLAP = 200;
export const MAX_AI_CALLS_PER_IMPORT = 80;

/**
 * Split `text` into windows of at most `size` characters, breaking on the
 * nearest sentence/line boundary before the hard limit where possible and
 * carrying a small overlap so context is not lost across the seam.
 */
export function chunkText(text: string, size: number = DEFAULT_CHUNK_SIZE): string[] {
  if (size <= CHUNK_OVERLAP) {
    throw new Error('chunk size must exceed the overlap');
  }
  const trimmed = text.trim();
  if (trimmed.length <= size) {
    return trimmed.length === 0 ? [] : [trimmed];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + size, trimmed.length);

    // If we're not at the very end, prefer to break on a boundary within the
    // last ~500 chars of the window (paragraph > sentence > word).
    if (end < trimmed.length) {
      const window = trimmed.slice(start, end);
      const searchFrom = Math.max(0, window.length - 500);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('.\n'),
      );
      const word = window.lastIndexOf(' ');
      const boundary =
        para >= searchFrom ? para + 2 : sentence >= searchFrom ? sentence + 1 : word >= searchFrom ? word + 1 : -1;
      if (boundary > 0) {
        end = start + boundary;
      }
    }

    chunks.push(trimmed.slice(start, end).trim());

    if (end >= trimmed.length) break;
    // Step forward, leaving an overlap so the next chunk re-sees the seam.
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

/**
 * Returns the number of AI calls a `chunkCount`-chunk import would consume, and
 * throws if it would exceed the per-import cap. Callers use this to fail fast
 * before issuing any LLM calls on an oversized document.
 */
export function assertWithinCallCap(chunkCount: number): void {
  if (chunkCount > MAX_AI_CALLS_PER_IMPORT) {
    throw new Error(
      `Import requires ${chunkCount} AI passes, exceeding the ${MAX_AI_CALLS_PER_IMPORT}-call cap. Trim the document or split it.`,
    );
  }
}
