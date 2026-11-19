// [SCOPE 155 / T002] BEGIN — redaction: mask, never block (FR-001, FR-002)
// (moved from handoff-writer.ts, unchanged, originally [SCOPE 149 / T002]; split out so the
// SPEC-155 session-feed hook and rolling summary can reuse it as a standalone bundle, without
// pulling in handoff-writer's agent-mode/agent-status dependencies.)
//
// Anything that looks like a key, token, password or connection string becomes `[redacted]`
// before the file is written. Each pattern is replaced through a function, never a
// replacement string, so a `$` inside matched text can never be read as a pattern.
// Order matters: the widest shapes (private key blocks, URLs with credentials) go first so a
// narrower pattern never masks half of one and leaves the rest.

export const REDACTED = "[redacted]";

interface MaskRule {
  name: string;
  re: RegExp;
  /** The replacement for one match. Keeps a harmless label where it helps a reader. */
  mask: (match: string, ...groups: string[]) => string;
}

const MASK_RULES: MaskRule[] = [
  {
    name: "private-key",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    mask: () => REDACTED,
  },
  {
    // postgres://user:pass@host/db, mysql://…, redis://:pass@…, https://user:token@host — any URL with credentials.
    name: "connection-string",
    re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/]*:[^\s@/]+@[^\s'"`<>)]+/gi,
    mask: () => REDACTED,
  },
  {
    name: "bearer",
    re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
    mask: () => `Bearer ${REDACTED}`,
  },
  {
    // password=…, DB_PASSWORD: …, api_key = "…", secret: '…', token=…
    name: "assignment",
    re: /\b([A-Za-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_-]*)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
    mask: (_m: string, name: string, sep: string) => `${name}${sep}${REDACTED}`,
  },
  { name: "yca-token", re: /\byca_[A-Za-z0-9_-]{6,}/g, mask: () => REDACTED },
  {
    // Well-known key prefixes: OpenAI/Anthropic sk-, Stripe sk_/rk_/pk_live, GitHub, Slack, AWS, Google, JWTs.
    name: "prefixed-key",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g,
    mask: () => REDACTED,
  },
  {
    // A bare random token (e.g. the kit's 43-character base64url API token). Mixed case AND a
    // digit, 32+ characters, so commit SHAs (lower-case hex) and ordinary words are left alone.
    name: "opaque-token",
    re: /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}\b/g,
    mask: () => REDACTED,
  },
];

/** Mask secrets in `text`. Returns the masked text and how many items were masked. */
export function redactSecrets(text: string): { text: string; masked: number } {
  let masked = 0;
  let out = text;
  for (const rule of MASK_RULES) {
    out = out.replace(rule.re, (match: string, ...rest: unknown[]) => {
      // A match that is already only the mask (or a label plus the mask) is not a new secret.
      if (match === REDACTED) return match;
      const groups = rest.filter((g): g is string => typeof g === "string");
      const replaced = rule.mask(match, ...groups);
      if (replaced !== match) masked += 1;
      return replaced;
    });
  }
  return { text: out, masked };
}
// [SCOPE 155 / T002] END
