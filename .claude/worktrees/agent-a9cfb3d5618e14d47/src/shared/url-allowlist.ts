/**
 * Spec 025 FR-014 / C14 — URL-import host allowlist (shared client + server).
 *
 * Single source of truth so the client-side validation in ImportDialog and the
 * server-side SSRF guard in UrlImportService never drift. Extending this list is
 * a deliberate scope decision: arbitrary HTTPS reach is an SSRF risk (cloud
 * metadata endpoints, internal services, RFC1918 ranges) and requires a
 * dedicated threat-model review before relaxing.
 */

export const IMPORT_ALLOWED_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'gist.github.com',
  'gitlab.com',
  'bitbucket.org',
  'docs.google.com',
  'notion.so',
] as const;

/** Hard ceiling on imported content, in characters (FR-014). */
export const IMPORT_MAX_CHARS = 500_000;

/** Soft cap on pasted content, in characters (FR-013). Overflow hands off to import. */
export const PASTE_MAX_CHARS = 10_000;

/**
 * Returns true when `hostname` is on the allowlist, including subdomains of an
 * allowed host (e.g. `foo.notion.so`). Exact-match or dotted-suffix match only —
 * `evilnotion.so` does NOT match `notion.so`.
 */
export function isAllowedImportHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return IMPORT_ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * Parse + validate a candidate import URL. Returns the normalized URL on
 * success, or an error string describing the rejection. Used by both the client
 * (pre-flight UX) and the server (hard gate).
 */
export function validateImportUrl(
  raw: string,
): { ok: true; url: string; hostname: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only https:// URLs are supported.' };
  }
  if (!isAllowedImportHost(parsed.hostname)) {
    return {
      ok: false,
      error: `${parsed.hostname} is not an allowed host. Supported: ${IMPORT_ALLOWED_HOSTS.join(', ')}.`,
    };
  }
  return { ok: true, url: parsed.toString(), hostname: parsed.hostname };
}
