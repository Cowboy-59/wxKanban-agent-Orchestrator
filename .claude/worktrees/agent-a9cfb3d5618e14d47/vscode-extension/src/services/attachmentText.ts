// [SCOPE 043 / T026] BEGIN — pure attachment text handling (Amendment E, FR-023/FR-024)
// Bounding and credential-scrubbing, with NO runtime `vscode` import, per the
// cockpit test convention — this is the half that carries the risk, so it is the
// half that has to be testable under plain Node. The dialog and filesystem calls
// live next door in `attachments.ts`.

/** Text formats a log/diagnostic realistically arrives as. Binary is out of scope. */
export const ALLOWED_EXTENSIONS = [
  'log', 'txt', 'json', 'md', 'csv', 'yml', 'yaml', 'xml', 'ini', 'conf', 'out', 'err',
] as const;

/** Per-file ceiling after truncation. Tail-kept: a log's failure is at its end. */
export const MAX_FILE_BYTES = 128 * 1024;
/** Ceiling across every attachment on one report. */
export const MAX_TOTAL_BYTES = 256 * 1024;
/** How many files one report may carry. */
export const MAX_FILES = 3;
/** Refuse to load more than this into memory — far past what a useful tail needs. */
export const MAX_READ_BYTES = 32 * 1024 * 1024;

export interface FeedbackAttachment {
  /** Base name only — the submitter's directory layout is not our business. */
  name: string;
  /** Size of the file on disk, before truncation. */
  bytes: number;
  /** True when the stored content is a tail slice of a larger file. */
  truncated: boolean;
  /** How many credential values were masked (FR-024). Surfaced to the submitter. */
  redactions: number;
  /** Bounded, redacted UTF-8 text. */
  content: string;
}

/** What the webview is told about an attachment — deliberately not the content. */
export interface AttachmentChip {
  name: string;
  bytes: number;
  truncated: boolean;
  redactions: number;
}

export function toChip(a: FeedbackAttachment): AttachmentChip {
  return { name: a.name, bytes: a.bytes, truncated: a.truncated, redactions: a.redactions };
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isAllowedExtension(name: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/**
 * A NUL byte in the leading region is the cheap, reliable tell for a binary file
 * wearing a text extension. Screenshots are out of scope (Amendment E), and this
 * is what makes one arrive as a clear refusal rather than as mojibake.
 */
export function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}
// [SCOPE 043 / T026] END

// [SCOPE 043 / T026] BEGIN — credential redaction (FR-024)
// Each rule masks ONE capture group so the surrounding text stays readable — a
// triager still sees `password=[redacted]` and knows which key was involved,
// which is the point of masking the value rather than dropping the line.
interface RedactionRule {
  re: RegExp;
  /** 1-based capture group holding the secret value. */
  group: number;
}

export const REDACTED = '[redacted]';

// ORDER MATTERS, and getting it wrong is worse than not redacting at all.
// The generic key=value rule runs LAST because it is the greedy one: against
// `Authorization: Bearer <token>` it matches `Authorization` + `:` and takes
// `Bearer` as the value, yielding `Authorization: [redacted] <token>` — a line
// that LOOKS scrubbed while the token is still sitting in it. Specific patterns
// claim their text first; the generic rule sweeps up only what is left.
const RULES: RedactionRule[] = [
  // A private key block is a secret in its entirety, not a value in a field.
  {
    re: /()(-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----)/g,
    group: 2,
  },
  // Authorization: Bearer <token>
  { re: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/g, group: 2 },
  // A JWT is self-identifying and worth catching even with no labelling key.
  { re: /()\b(eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,})/g, group: 2 },
  // AWS access key id.
  { re: /()\b(AKIA[0-9A-Z]{16})\b/g, group: 2 },
  // Credentials embedded in a URI — keep the user, mask the password.
  //
  // [SCOPE 126 / T001] Every quantifier here is BOUNDED, and that is load-bearing.
  // With an unbounded `*` on the scheme, a long run of alphanumerics — any large
  // log, or a base64 blob — makes the star swallow the whole input, fail on `://`,
  // and backtrack one character at a time from every start position. Measured
  // before bounding: 10KB 95ms, 50KB 2.4s, 131KB 16.3s. That is quadratic on a
  // field capped at 128KB, i.e. attaching one big log froze the extension.
  //
  // Real schemes are short (`https`, `postgres`, `mongodb+srv`), so 32 is generous
  // and turns the per-position cost into a constant.
  { re: /([a-zA-Z][a-zA-Z0-9+.-]{0,31}:\/\/[^\s:/@]{1,256}:)([^\s@/]{1,256})(?=@)/g, group: 2 },
  // key = value / "key": "value" — the shape credentials actually appear in.
  //
  // The leading guard is a negative lookbehind, NOT `\b`. Underscore is a word
  // character, so `\b` never matches inside `DB_PASSWORD`, `API_KEY`, or
  // `AWS_SECRET_ACCESS_KEY` — which is the single most common way a credential
  // shows up in a log or an env dump. The lookbehind still refuses a mid-word
  // hit like `bypassword`.
  {
    re: /(?<![A-Za-z0-9])(pass(?:word)?|pwd|secret|token|api[_-]?key|apikey|auth(?:orization)?|credentials?|private[_-]?key|connection[_-]?string|access[_-]?key|secret[_-]?key|client[_-]?secret)\b(["']?\s*[:=]\s*["']?)([^\s"',;}]{4,})/gi,
    group: 3,
  },
];

/**
 * Auth SCHEME names are not secrets. Without this, the generic rule masks the
 * word `Bearer` in an already-scrubbed header and reports a second redaction
 * that protected nothing.
 */
const NOT_SECRET_VALUES = new Set([
  'bearer', 'basic', 'digest', 'token', 'null', 'true', 'false', 'none', 'undefined',
]);

/**
 * Mask credential values in `text`. Returns the scrubbed copy and how many were
 * masked. The file on disk is never touched (FR-024) — this operates on the
 * in-memory copy about to be transmitted.
 */
export function redactSecrets(text: string): { text: string; redactions: number } {
  let out = text;
  let redactions = 0;
  for (const rule of RULES) {
    out = out.replace(rule.re, (match, ...groups: unknown[]) => {
      const value = groups[rule.group - 1];
      if (typeof value !== 'string' || value.length === 0) return match;
      // Already-masked text must not be counted twice on a re-scan.
      if (value === REDACTED) return match;
      if (NOT_SECRET_VALUES.has(value.toLowerCase())) return match;
      redactions += 1;
      const at = match.lastIndexOf(value);
      return at < 0 ? match : match.slice(0, at) + REDACTED + match.slice(at + value.length);
    });
  }
  return { text: out, redactions };
}
// [SCOPE 043 / T026] END

// [SCOPE 043 / T026] BEGIN — tail truncation
/**
 * Keep the LAST `MAX_FILE_BYTES` of a file and mark what was dropped.
 *
 * Slicing the buffer can land mid-character, so the kept region advances to the
 * first line break — which discards the partial character AND lands the cut on a
 * line boundary, the only place a log is readable from.
 */
export function tailSlice(buf: Buffer): { text: string; truncated: boolean } {
  if (buf.byteLength <= MAX_FILE_BYTES) return { text: buf.toString('utf8'), truncated: false };
  const tail = buf.subarray(buf.byteLength - MAX_FILE_BYTES);
  // Drop the UTF-8 continuation bytes the cut landed inside, BEFORE decoding —
  // otherwise the first character comes back as U+FFFD. Advancing to a newline
  // usually hides this, but a file with no newline in its tail (minified JSON, a
  // single-line dump) has no newline to advance to.
  let start = 0;
  while (start < tail.byteLength && (tail[start]! & 0xc0) === 0x80) start += 1;
  const decoded = tail.subarray(start).toString('utf8');
  // Land on a line boundary when one is close by; do not discard a large tail
  // chasing one that is not there.
  const nl = decoded.indexOf('\n');
  const body = nl >= 0 && nl < 4096 ? decoded.slice(nl + 1) : decoded;
  const dropped = buf.byteLength - MAX_FILE_BYTES;
  return {
    text: `[... ${dropped.toLocaleString()} earlier bytes omitted — tail of the file follows ...]\n${body}`,
    truncated: true,
  };
}
// [SCOPE 043 / T026] END
