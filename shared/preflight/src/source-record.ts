// [SCOPE 135 / T024] BEGIN — the source-record pointer: grammar, parser, formatter, expander (FR-028)
// MODIFIED-BY: [SCOPE 135 / T029] — tighter grammar, exported fence tracker, entry-count edit guard.
// MODIFIED-BY: [SCOPE 135 / T031] — only the first `## Amendment Log` opens the log; the header closes on an indented `##`.
/**
 * SCOPE-135 Amendment C / FR-023..FR-028 — a scope names the brainstorm record it came from.
 *
 * A create carries the pointer as a header line right after `**Source**`:
 *
 *   **Source Record**: docs/brainstorms/2026-11-20-agent-common-room.md#21
 *
 * An edit never rewrites that line; it writes its own pointer inside the Amendment Log entry it adds:
 *
 *   ### 2026-11-22 — Amendment C
 *   ...
 *   - Source Record: docs/brainstorms/2026-11-20-agent-common-room.md#15
 *
 * The server (FR-023 refusal), the kit (FR-027 strip guard) and SCOPE-159 run stamps (FR-081) all read
 * the pointer through this one module, so the grammar has exactly one implementation.
 *
 * Grammar: `none`, or `<path>[#row(,row)*]` where
 *   - path is repo-relative, forward slashes, ends in `.md`; only ASCII letters, digits, `.`, `_`, `-`
 *     and `/`; no `..` or `.` segment, no empty segment, no leading `/`, no folder name ending in `.`;
 *   - a row is `[0-9]+[a-z]?` with no leading zero (`0` itself is allowed), kept as a string; single
 *     rows only, no ranges, no row twice;
 *   - no `#` means the whole document; one record per scope (`;` is reserved).
 */

/** A pointer into one record: the whole document when `rows` is empty. */
export interface SourceRecordPointer {
  path: string;
  rows: string[];
}

/** A value that passed the grammar. */
export type SourceRecordValue = SourceRecordPointer | 'none';

/**
 * What a document says: a pointer, `'none'`, `'unresolved'` (a line is present but outside the
 * grammar), or `null` (no line — read as "none"; existing scopes need no backfill).
 */
export type SourceRecordReading = SourceRecordValue | 'unresolved' | null;

/** One lettered `### <date> — Amendment <X>` entry under `## Amendment Log`, in log order. */
export interface SourceRecordAmendment {
  letter: string;
  date: string;
  /** null when the entry has no `- Source Record:` line. */
  pointer: SourceRecordValue | 'unresolved' | null;
}

export interface ParsedSourceRecord {
  header: SourceRecordReading;
  amendments: SourceRecordAmendment[];
}

export type SourceRecordValidation =
  | { ok: true; pointer: SourceRecordValue }
  | { ok: false; reason: string };

/** One-line statement of the grammar, for error messages and tool descriptions. */
export const SOURCE_RECORD_GRAMMAR =
  '"none", or a repo-relative path ending in .md with optional rows: <path>[#row(,row)*], e.g. docs/brainstorms/2026-11-20-agent-common-room.md#21 or docs/brainstorms/x.md#3,7a,12';

// [SCOPE 135 / T029] Rows carry no leading zero, so a pointer byte-matches the ledger's `#21` and
// never `#021`. Paths are limited to a safe ASCII set, so a control, bidi-override, zero-width or
// Windows-invalid character cannot make a pointer display as, or open as, a different file.
const ROW = /^(?:0|[1-9][0-9]*)[a-z]?$/;
const FORBIDDEN_PATH_CHAR = /[\s#;`\\:]/;
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;

/** Check `value` against the grammar. Nothing is trimmed or rewritten: what is checked is what is written. */
export function validateSourceRecord(value: string): SourceRecordValidation {
  if (value === 'none') return { ok: true, pointer: 'none' };
  if (value.length === 0) return { ok: false, reason: 'the value is empty' };
  if (value.includes(';')) return { ok: false, reason: 'only one record per scope (";" is reserved)' };

  const hash = value.indexOf('#');
  const path = hash === -1 ? value : value.slice(0, hash);
  const rowText = hash === -1 ? null : value.slice(hash + 1);

  if (path.length === 0) return { ok: false, reason: 'the path is empty' };
  if (FORBIDDEN_PATH_CHAR.test(path)) {
    return { ok: false, reason: 'the path contains whitespace, a backslash, a colon, "#", ";" or a backtick' };
  }
  if (!SAFE_PATH.test(path)) {
    return { ok: false, reason: 'the path may use only ASCII letters, digits, ".", "_", "-" and "/"' };
  }
  if (path.startsWith('/')) return { ok: false, reason: 'the path must be repo-relative (no leading "/")' };
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return { ok: false, reason: 'the path has an empty, "." or ".." segment' };
  }
  if (segments.slice(0, -1).some((segment) => segment.endsWith('.'))) {
    return { ok: false, reason: 'a folder name in the path ends in "." (Windows would open a different path)' };
  }
  if (!path.endsWith('.md') || path === '.md' || segments[segments.length - 1] === '.md') {
    return { ok: false, reason: 'the path must name a .md file' };
  }

  if (rowText === null) return { ok: true, pointer: { path, rows: [] } };
  if (rowText.length === 0) return { ok: false, reason: 'a "#" must be followed by at least one row' };
  const rows = rowText.split(',');
  const bad = rows.find((row) => !ROW.test(row));
  if (bad !== undefined) {
    return {
      ok: false,
      reason:
        bad === ''
          ? 'a row is empty'
          : `row "${bad}" is not a single row (digits with no leading zero, then at most one lower-case letter; no ranges)`,
    };
  }
  const repeated = rows.find((row, index) => rows.indexOf(row) !== index);
  if (repeated !== undefined) return { ok: false, reason: `row "${repeated}" is listed twice` };
  return { ok: true, pointer: { path, rows } };
}

/** The value the server writes. `validateSourceRecord(formatSourceRecord(p))` returns `p`. */
export function formatSourceRecord(pointer: SourceRecordValue): string {
  if (pointer === 'none') return 'none';
  return pointer.rows.length > 0 ? `${pointer.path}#${pointer.rows.join(',')}` : pointer.path;
}

/**
 * One `<path>#<row>` per row — byte-identical to the ledger `source` field written by
 * `_wxAI/askgate/import.mjs` (`${recordPath}#${row.num}`). A whole-document pointer returns `[path]`;
 * `none` returns `[]`.
 */
export function expandPointers(pointer: SourceRecordValue): string[] {
  if (pointer === 'none') return [];
  if (pointer.rows.length === 0) return [pointer.path];
  return pointer.rows.map((row) => `${pointer.path}#${row}`);
}

const HEADER_LINE = /^\*\*Source Record\*\*:[ \t]*(.*?)[ \t]*$/;
const LOG_LINE = /^-[ \t]+Source Record:[ \t]*(.*?)[ \t]*$/;
const ENTRY_HEADING = /^###\s+(\d{4}-\d{2}-\d{2})(?:\s+[—–-]\s+Amendment\s+(.+?))?\s*$/;
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^\s{0,3}(`{3,}|~{3,})\s*$/;

/**
 * [SCOPE 135 / T029] FR-028 — the two heading tests that bound the Amendment Log, shared by the writer
 * (`appendAmendmentLog`, mcp-server `scope-log.ts`) and this parser so they always agree on where the
 * log starts and ends. Both are ATX headings indented at most 3 spaces; a line indented 4 or more
 * (or by a tab) is indented code, not a heading. Call them only on lines outside a fence.
 */
export function isAmendmentLogHeading(line: string): boolean {
  return /^ {0,3}##[ \t]+Amendment[ \t]+Log\b/i.test(line);
}

/** [SCOPE 135 / T029] FR-028 — a `#` or `##` heading, which ends the Amendment Log. */
export function endsAmendmentLog(line: string): boolean {
  return /^ {0,3}#{1,2}(?:[ \t]|$)/.test(line);
}

function readValue(raw: string): SourceRecordValue | 'unresolved' {
  const checked = validateSourceRecord(raw);
  return checked.ok ? checked.pointer : 'unresolved';
}

/**
 * Track fenced code the CommonMark way: a fence closes only on the same character, at least as long
 * as the opener, with nothing else on the line. The Amendment Log's verbatim blocks use fences longer
 * than any backtick run they contain, so a naive toggle would read their contents as live lines.
 *
 * [SCOPE 135 / T029] Exported: `appendAmendmentLog` (mcp-server `scope-log.ts`) uses this same
 * tracker, so the writer and the parser always agree on where the log ends (FR-028). Call it once per
 * document and feed it every line in order; it returns true for a fence line or a line inside a fence.
 */
export function createFenceTracker(): (line: string) => boolean {
  let open: { char: string; length: number } | null = null;
  return (line: string): boolean => {
    if (open) {
      const close = line.match(FENCE_CLOSE);
      if (close && close[1][0] === open.char && close[1].length >= open.length) open = null;
      return true;
    }
    const start = line.match(FENCE_OPEN);
    // [SCOPE 135 / T029] FR-028 — CommonMark: a backtick opener's info string may not hold a
    // backtick, so ```npm run x``` is inline code, not a fence that would hide the rest of the scope.
    if (start && !(start[1][0] === '`' && start[2].includes('`'))) {
      open = { char: start[1][0], length: start[1].length };
      return true;
    }
    return false;
  };
}

/**
 * Read a scope's pointers. The header pointer comes from the header block only — after the optional
 * line-1 synced marker, up to the first `## ` heading. Amendment pointers come only from lettered
 * entries under `## Amendment Log`; a date-only entry (no letter) is not listed. Fenced code is skipped.
 */
export function parseSourceRecord(content: string): ParsedSourceRecord {
  const lines = (content ?? '').split(/\r?\n/);
  const inFence = createFenceTracker();

  let header: SourceRecordReading = null;
  let inHeader = true;
  let inLog = false;
  let logSeen = false;
  const amendments: SourceRecordAmendment[] = [];
  let current: SourceRecordAmendment | null = null;

  for (const line of lines) {
    if (inFence(line)) continue;

    // [SCOPE 135 / T031] FR-028 — an ATX `##` indented up to 3 spaces closes the header, as the writer reads it.
    if (/^ {0,3}##(?:[ \t]|$)/.test(line)) inHeader = false;

    if (inHeader) {
      const match = line.match(HEADER_LINE);
      if (match && header === null) header = readValue(match[1]);
      continue;
    }

    // [SCOPE 135 / T031] FR-028 — only the FIRST `## Amendment Log` opens the log, the one
    // appendAmendmentLog writes to. A later heading with the same text ends it below, like any `##`.
    if (!logSeen && isAmendmentLogHeading(line)) {
      logSeen = true;
      inLog = true;
      current = null;
      continue;
    }
    if (inLog && endsAmendmentLog(line)) {
      // [SCOPE 135 / T029] FR-028 — the same heading test appendAmendmentLog uses to place an entry.
      inLog = false;
      current = null;
      continue;
    }
    if (!inLog) continue;

    if (/^###\s/.test(line)) {
      const entry = line.match(ENTRY_HEADING);
      current = entry && entry[2] ? { letter: entry[2], date: entry[1], pointer: null } : null;
      if (current) amendments.push(current);
      continue;
    }
    if (current && current.pointer === null) {
      const match = line.match(LOG_LINE);
      if (match) current.pointer = readValue(match[1]);
    }
  }

  return { header, amendments };
}

/**
 * FR-027 — did the server apply the pointer that was sent? On a create the header must carry it; on
 * an edit the LAST lettered Amendment Log entry must carry the letter and the value sent (an earlier
 * entry with the same value does not count). Used by the kit worker and named by the agent paths.
 *
 * [SCOPE 135 / T029] `sent.base` is the document the edit was sent against (`currentScopeContent`).
 * When given, the response must hold exactly one more lettered entry than it, so a server that wrote
 * no entry cannot pass on the strength of a previous entry that already carried the same letter and
 * value.
 */
export function sourceRecordApplied(
  content: string,
  sent: { value: string; amendment?: string; edit: boolean; base?: string },
): boolean {
  const parsed = parseSourceRecord(content);
  const matches = (reading: SourceRecordReading): boolean =>
    reading !== null && reading !== 'unresolved' && formatSourceRecord(reading) === sent.value;
  if (!sent.edit) return matches(parsed.header);
  if (typeof sent.base === 'string' && sent.base.trim() !== '') {
    if (parsed.amendments.length !== parseSourceRecord(sent.base).amendments.length + 1) return false;
  }
  const last = parsed.amendments[parsed.amendments.length - 1];
  return Boolean(last && last.letter === sent.amendment?.trim() && matches(last.pointer));
}

/** The message every path stops with when the pointer did not come back (FR-027). */
export const SOURCE_RECORD_NOT_APPLIED = 'server too old: sourceRecord was not applied';
// [SCOPE 135 / T024] END
