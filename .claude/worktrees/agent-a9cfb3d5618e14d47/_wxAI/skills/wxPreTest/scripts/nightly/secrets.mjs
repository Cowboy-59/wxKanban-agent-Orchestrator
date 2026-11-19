// Nightly Testing: secrets (SCOPE-140 FR-010).
//
// Test-account and Designated Agent credentials live only in the UAT server's secret store. The
// configuration names them; the store hands them to the run as environment variables of the same
// name (every scheduler and secret store can do that). This module resolves the names, warns
// before a credential expires, and scans every output for a secret value before it is written.

// [SCOPE 140 / T010] BEGIN — Resolve secrets by name, warn on expiry, scan outputs (FR-010)
export const EXPIRY_WARNING_DAYS = 14;

/** The value of each named secret. Missing ones are reported by NAME; values are never printed. */
export function resolveSecrets(names, env = process.env) {
  const values = {};
  const missing = [];
  for (const name of names.filter(Boolean)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      missing.push(`${name} (not a valid secret name)`);
      continue;
    }
    const v = env[name];
    if (typeof v === 'string' && v.length) values[name] = v;
    else missing.push(name);
  }
  return { values, missing };
}

/** Every secret name a nightly configuration references. */
export function secretNames(nightly) {
  const names = [];
  for (const a of nightly?.accounts ?? []) names.push(a.usernameSecret, a.passwordSecret, a.otpSecret);
  if (nightly?.database?.urlSecret) names.push(nightly.database.urlSecret);
  if (nightly?.agent?.tokenSecret) names.push(nightly.agent.tokenSecret);
  return [...new Set(names.filter(Boolean))];
}

/** Accounts whose recorded expiry is near or past. The date is configuration, never the secret. */
export function expiryWarnings(nightly, now = new Date()) {
  const out = [];
  for (const a of nightly?.accounts ?? []) {
    if (!a.passwordExpiresAt) continue;
    const days = Math.floor((Date.parse(a.passwordExpiresAt) - now.getTime()) / 86_400_000);
    if (!Number.isFinite(days)) continue;
    if (days < 0) out.push(`test account "${a.name}": password expired ${-days} day(s) ago; sign-in will fail`);
    else if (days <= EXPIRY_WARNING_DAYS) out.push(`test account "${a.name}": password expires in ${days} day(s)`);
  }
  return out;
}

const PATTERNS = [
  { kind: 'JWT', re: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{8,}/g },
  { kind: 'connection string with a password', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@[^\s/]+/gi },
  { kind: 'bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  { kind: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
];

/**
 * Findings in one output: any resolved secret value, and anything shaped like a credential. Each
 * finding names the secret or the pattern and where, never the value (SC-9).
 */
export function scanText(text, { secrets = {}, where = 'output' } = {}) {
  const findings = [];
  const s = String(text ?? '');
  for (const [name, value] of Object.entries(secrets)) {
    if (value && value.length >= 4 && s.includes(value)) findings.push({ where, kind: `the value of secret ${name}` });
  }
  for (const p of PATTERNS) {
    if (p.re.test(s)) findings.push({ where, kind: p.kind });
    p.re.lastIndex = 0;
  }
  return findings;
}

/** Replace every resolved secret value with its name, for text that must be kept (a log line). */
export function redact(text, secrets = {}) {
  let s = String(text ?? '');
  for (const [name, value] of Object.entries(secrets)) if (value && value.length >= 4) s = s.split(value).join(`[secret ${name}]`);
  return s;
}
// [SCOPE 140 / T010] END
