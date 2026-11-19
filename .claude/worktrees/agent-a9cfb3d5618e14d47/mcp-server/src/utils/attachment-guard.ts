// [SCOPE 126 / T001] BEGIN — server-side attachment content boundary (FR-016)
/**
 * The boundary wxKanban states to customers is: **only documentation reaches us —
 * no source, no secrets.** A 2026-08-13 egress audit found that boundary holds
 * architecturally (the kit's code-emitting handler imports no network client, and
 * `project.implement` has no field capable of carrying code) with exactly one
 * contradiction: `project_submit_feedback` accepts verbatim file content, persists
 * it, and excerpts it into a third-party triage prompt.
 *
 * The Cockpit already restricts file type, refuses binaries, and masks credentials
 * before sending (`vscode-extension/src/services/attachmentText.ts`). None of that
 * binds the server. `project_submit_feedback` is reachable by anything holding a
 * token, so a caller that is not the Cockpit can attach a `.ts` file, or a `.env`
 * renamed to `.txt`, and the server stores it and ships a tail of it to Groq. The
 * `redactions` field is worse than useless in that scenario: it is a number the
 * client reports about itself, which the server has never verified.
 *
 * SCOPE-043's own schema comment already makes this argument for the SIZE caps —
 * "the client is not the enforcement point". FR-016 applies the identical reasoning
 * to CONTENT. Nothing here changes behavior for a Cockpit user: the extension
 * already refuses these files, so this only closes the path around it.
 *
 * DELIBERATE DUPLICATION. The redaction rules below mirror the Cockpit's copy. The
 * hosted MCP is a standalone deployment (`rootDir: ./src`; only @wxkanban/preflight
 * and @wxkanban/watermark are shared packages), so hoisting this into a common
 * module would put a new workspace package on the release path of a server that
 * auto-deploys on push to main. The two copies MUST stay in step — change one,
 * change the other.
 */

/**
 * Text formats a log or diagnostic realistically arrives as — a mirror of the
 * Cockpit's ALLOWED_EXTENSIONS. Source-code extensions are absent on purpose: a
 * stack trace belongs in a report, the file it came from does not.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'log', 'txt', 'json', 'md', 'csv', 'yml', 'yaml', 'xml', 'ini', 'conf', 'out', 'err',
] as const;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isAllowedAttachmentName(name: string): boolean {
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/**
 * A dotfile carries its secret in the NAME, not the extension: `.env`, `.npmrc`,
 * `.pgpass` all have no extension at all, so an extension allowlist alone would
 * pass `.env` straight through if a caller declared it as the whole filename.
 */
const CREDENTIAL_FILENAMES = new Set([
  '.env', '.npmrc', '.pgpass', '.netrc', '.htpasswd', 'credentials', 'id_rsa',
]);

export function isCredentialFilename(name: string): boolean {
  const base = name.split(/[\\/]/).pop() ?? name;
  const lower = base.toLowerCase();
  if (CREDENTIAL_FILENAMES.has(lower)) return true;
  // `.env.production`, `.env.local` — the family, not just the bare name.
  return lower === '.env' || lower.startsWith('.env.');
}

/**
 * The server receives an already-decoded string, so the Cockpit's Buffer-based NUL
 * check does not port directly. A NUL survives JSON transport as U+0000, and a
 * binary decoded as UTF-8 arrives as a drift of U+FFFD replacement characters —
 * both are tells that this is not the text file its name claims.
 */
export function looksBinaryText(content: string): boolean {
  const head = content.slice(0, 8192);
  if (head.includes('\u0000')) return true;
  const replacements = (head.match(/\uFFFD/g) ?? []).length;
  return replacements > 0 && replacements / Math.max(head.length, 1) > 0.01;
}

interface RedactionRule {
  re: RegExp;
  /** 1-based capture group holding the secret value. */
  group: number;
}

export const REDACTED = '[redacted]';

// ORDER MATTERS, and getting it wrong is worse than not redacting at all. The
// generic key=value rule runs LAST because it is the greedy one: against
// `Authorization: Bearer <token>` it would match `Authorization` + `:`, take
// `Bearer` as the value, and yield a line that LOOKS scrubbed with the token still
// in it. Specific patterns claim their text first.
const RULES: RedactionRule[] = [
  // A private key block is a secret in its entirety, not a value in a field.
  {
    re: /()(-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----)/g,
    group: 2,
  },
  { re: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/g, group: 2 },
  // A JWT is self-identifying and worth catching with no labelling key at all.
  { re: /()\b(eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,})/g, group: 2 },
  { re: /()\b(AKIA[0-9A-Z]{16})\b/g, group: 2 },
  // Credentials embedded in a URI — keep the user, mask the password.
  //
  // Every quantifier here is BOUNDED, and that is load-bearing rather than tidy.
  // With an unbounded `*` on the scheme, a long run of alphanumerics (any large
  // log, or a base64 blob) makes the star swallow the whole input, fail on `://`,
  // and backtrack one character at a time — from every start position. Measured
  // on this rule before bounding: 10KB 95ms, 50KB 2.4s, 131KB 16.3s. Quadratic,
  // on a 128KB-capped field reachable by any token holder.
  //
  // Real schemes are short (`https`, `postgres`, `mongodb+srv`), so 32 is generous
  // and turns the per-position cost into a constant.
  { re: /([a-zA-Z][a-zA-Z0-9+.-]{0,31}:\/\/[^\s:/@]{1,256}:)([^\s@/]{1,256})(?=@)/g, group: 2 },
  // key = value / "key": "value" — the shape credentials actually appear in.
  //
  // The leading guard is a negative lookbehind, NOT `\b`. Underscore is a word
  // character, so `\b` never matches inside `DB_PASSWORD`, `API_KEY`, or
  // `AWS_SECRET_ACCESS_KEY` — the single most common way a credential shows up in
  // a log or an env dump. The lookbehind still refuses a mid-word hit like
  // `bypassword`.
  {
    re: /(?<![A-Za-z0-9])(pass(?:word)?|pwd|secret|token|api[_-]?key|apikey|auth(?:orization)?|credentials?|private[_-]?key|connection[_-]?string|access[_-]?key|secret[_-]?key|client[_-]?secret)\b(["']?\s*[:=]\s*["']?)([^\s"',;}]{4,})/gi,
    group: 3,
  },
];

/** Auth SCHEME names are not secrets; masking them protects nothing and inflates the count. */
const NOT_SECRET_VALUES = new Set([
  'bearer', 'basic', 'digest', 'token', 'null', 'true', 'false', 'none', 'undefined',
]);

/**
 * Mask credential values in `text`. Returns the scrubbed copy and how many were
 * masked. Text already carrying `[redacted]` is not counted again, so running this
 * over Cockpit-scrubbed content is idempotent and reports 0 — which is the common
 * case and the one that must stay silent.
 */
export function redactSecrets(text: string): { text: string; redactions: number } {
  let out = text;
  let redactions = 0;
  for (const rule of RULES) {
    out = out.replace(rule.re, (match, ...groups: unknown[]) => {
      const value = groups[rule.group - 1];
      if (typeof value !== 'string' || value.length === 0) return match;
      if (value === REDACTED) return match;
      if (NOT_SECRET_VALUES.has(value.toLowerCase())) return match;
      redactions += 1;
      const at = match.lastIndexOf(value);
      return at < 0 ? match : match.slice(0, at) + REDACTED + match.slice(at + value.length);
    });
  }
  return { text: out, redactions };
}

/**
 * Why this attachment may not be stored, or null when it may.
 *
 * Rejection is reserved for what cannot be made safe by masking: the wrong KIND of
 * file. Secrets inside an otherwise-legitimate log are masked instead — dropping
 * the whole report would cost the submitter their bug and teach them to stop
 * attaching logs, which is the outcome that actually loses evidence.
 */
export function attachmentRejectionReason(a: { name: string; content: string }): string | null {
  if (isCredentialFilename(a.name)) {
    return `attachment "${a.name}" is a credential file; these are never accepted`;
  }
  if (!isAllowedAttachmentName(a.name)) {
    return (
      `attachment "${a.name}" has extension "${extensionOf(a.name) || '(none)'}", which is not an ` +
      `accepted text/log format (${ALLOWED_ATTACHMENT_EXTENSIONS.join(', ')}). ` +
      `Source files are not accepted — paste the relevant excerpt into the report instead.`
    );
  }
  if (looksBinaryText(a.content)) {
    return `attachment "${a.name}" contains binary content despite a text extension`;
  }
  return null;
}

/**
 * Re-scan and mask, independent of what the client claimed.
 *
 * `redactions` becomes client-reported PLUS server-masked. It is reported to
 * triagers as "credential value(s) masked", and a count that omitted the server's
 * own work would understate what was in the file.
 */
export function sanitizeAttachment<T extends { content: string; redactions: number }>(a: T): T {
  const { text, redactions } = redactSecrets(a.content);
  if (redactions === 0) return a;
  return { ...a, content: text, redactions: a.redactions + redactions };
}
// [SCOPE 126 / T001] END
