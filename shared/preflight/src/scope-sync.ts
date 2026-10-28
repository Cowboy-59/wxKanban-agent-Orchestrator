// [SCOPE 135 / T019] BEGIN — the synced-hash marker a local scope file carries (FR-021)
/**
 * SCOPE-135 / FR-021 — a local scope file records which stored copy it was last synced with, so an
 * edit can refuse when a colleague has pushed a newer one since.
 *
 * The record is line 1 of the file:
 *
 *   <!-- wxkanban:synced sha256=<hex> at=<ISO date> -->
 *
 * The hash is over the file WITHOUT that line, with CRLF normalised to LF, so a Windows checkout and
 * a Linux checkout of the same text agree. The kit writes it after a push; the server compares it with
 * the stored copy. Both sides import this one module — two hash functions would eventually disagree
 * about a trailing newline and refuse every edit.
 */

import { createHash } from 'node:crypto';

const MARKER_LINE = /^<!--\s*wxkanban:synced\s+sha256=([0-9a-f]{64})(?:\s+at=(\S+))?\s*-->\s*$/;

export interface ScopeSyncMarker {
  hash: string;
  /** When the kit wrote the marker, if recorded. */
  at?: string;
}

/** The marker on line 1, or null when the file has none (written before SPEC-135 Amendment B). */
export function readScopeSyncMarker(content: string): ScopeSyncMarker | null {
  const first = content.split(/\r?\n/, 1)[0] ?? '';
  const match = first.match(MARKER_LINE);
  return match ? { hash: match[1], ...(match[2] ? { at: match[2] } : {}) } : null;
}

/** The document without its marker line — what is stored, and what is hashed. */
export function stripScopeSyncMarker(content: string): string {
  const match = content.match(/^[^\r\n]*(\r?\n|$)/);
  const first = match ? match[0].replace(/\r?\n$/, '') : '';
  return MARKER_LINE.test(first) ? content.slice((match as RegExpMatchArray)[0].length) : content;
}

/** SHA-256 of the document without its marker, LF-normalised. */
export function scopeSyncHash(content: string): string {
  return createHash('sha256').update(stripScopeSyncMarker(content).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** The document with line 1 set to a marker for `hash`, keeping the file's own line ending. */
export function withScopeSyncMarker(content: string, hash: string, at: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  return `<!-- wxkanban:synced sha256=${hash} at=${at} -->${eol}${stripScopeSyncMarker(content)}`;
}
// [SCOPE 135 / T019] END
