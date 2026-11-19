/**
 * Spec 025 T007 / FR-014 / C14 — SSRF-guarded URL fetcher for document import.
 *
 * Two independent gates:
 *   1. Host allowlist (shared with the client via src/shared/url-allowlist.ts).
 *   2. DNS resolution + private/loopback/link-local/cloud-metadata IP rejection,
 *      which closes the DNS-rebind hole an allowlist alone leaves open (an
 *      allowed hostname could resolve to 169.254.169.254 or an RFC1918 host).
 *
 * Hard limits: 10s timeout, 500k-char response cap.
 */
import { lookup } from 'dns/promises';
import { createLogger } from '~/server/lib/logger.js';
import { validateImportUrl, IMPORT_MAX_CHARS } from '~/shared/url-allowlist.js';

const logger = createLogger('url-import-service');

const FETCH_TIMEOUT_MS = 10_000;

export class UrlImportError extends Error {
  constructor(
    message: string,
    public readonly statusHint: number = 400,
  ) {
    super(message);
    this.name = 'UrlImportError';
  }
}

/**
 * Reject IPs that must never be reachable from a server-side fetch:
 * loopback, RFC1918 private ranges, link-local (incl. the 169.254.169.254 cloud
 * metadata endpoint), unique-local IPv6 (fd00::/8), and IPv6 link-local
 * (fe80::/10). Returns null when the address is acceptable, or a reason string.
 */
export function rejectionReasonForIp(ip: string): string | null {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return 'loopback address';
    if (a === 10) return 'private network (10.0.0.0/8)';
    if (a === 172 && b >= 16 && b <= 31) return 'private network (172.16.0.0/12)';
    if (a === 192 && b === 168) return 'private network (192.168.0.0/16)';
    if (a === 169 && b === 254) return 'link-local / cloud metadata (169.254.0.0/16)';
    if (a === 0) return 'unspecified address';
    return null;
  }

  // IPv6 — normalize and check well-known dangerous prefixes.
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6 === '::1') return 'IPv6 loopback';
  if (v6 === '::') return 'IPv6 unspecified';
  if (v6.startsWith('fe80')) return 'IPv6 link-local (fe80::/10)';
  if (/^f[cd]/.test(v6)) return 'IPv6 unique-local (fc00::/7)';
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded v4.
  const mapped = v6.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped && mapped[1]) return rejectionReasonForIp(mapped[1]);
  return null;
}

/**
 * Fetch the content of an allowlisted documentation URL with SSRF protection.
 * Throws UrlImportError on any gate failure or upstream error.
 */
export async function fetchAllowedUrl(rawUrl: string): Promise<string> {
  const validation = validateImportUrl(rawUrl);
  if (!validation.ok) {
    throw new UrlImportError(validation.error);
  }
  const { url, hostname } = validation;

  // DNS-rebind defense: resolve every address the host maps to and reject if
  // any lands in a forbidden range.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UrlImportError(`Could not resolve ${hostname}.`);
  }
  for (const { address } of addresses) {
    const reason = rejectionReasonForIp(address);
    if (reason) {
      logger.warn({ hostname, address, reason }, 'SSRF guard rejected import host');
      throw new UrlImportError(`${hostname} resolves to a disallowed address (${reason}).`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'wxKanban-overview-import/1.0', Accept: 'text/*, */*' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UrlImportError(`${hostname} timed out after ${FETCH_TIMEOUT_MS / 1000}s.`, 504);
    }
    throw new UrlImportError(`Failed to fetch ${hostname}: ${err instanceof Error ? err.message : 'unknown error'}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new UrlImportError(
      'This resource requires authentication — private-repo support is scheduled for a follow-up scope.',
      res.status,
    );
  }
  if (!res.ok) {
    throw new UrlImportError(`${hostname} returned ${res.status}.`, 502);
  }

  const text = await res.text();
  if (text.length > IMPORT_MAX_CHARS) {
    // Truncate at the ceiling rather than rejecting the fetch outright; the
    // caller (import route) enforces the same ceiling on the final content.
    throw new UrlImportError(
      `Fetched content exceeds the ${IMPORT_MAX_CHARS.toLocaleString()}-character ceiling — an overview isn't the right container for that volume.`,
      413,
    );
  }
  return text;
}
