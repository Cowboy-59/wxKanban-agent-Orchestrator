// SCOPE-108 / T011 — SSRF guard for server-side URL fetches. Extracted from SCOPE-106's
// SiteStyleCaptureService so both the style-capture (headless) and the page-rebuild capture
// (static/cheerio) share one guard without the page-rebuild path pulling in the headless-
// browser deps. Resolves the host and refuses localhost / private / link-local addresses
// (incl. the 169.254.169.254 cloud metadata IP) before any fetch or navigation.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// [SCOPE 108 / T011] BEGIN — SSRF guard (public http(s) URLs only)
export function isPrivateAddress(addr: string): boolean {
  if (addr === "::1" || addr === "0.0.0.0") return true;
  if (/^127\./.test(addr)) return true; // loopback
  if (/^10\./.test(addr)) return true; // private A
  if (/^192\.168\./.test(addr)) return true; // private C
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return true; // private B
  if (/^169\.254\./.test(addr)) return true; // link-local incl. cloud metadata
  if (/^(f[cd])/i.test(addr)) return true; // IPv6 unique-local
  if (/^fe80:/i.test(addr)) return true; // IPv6 link-local
  return false;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  // Auto-prefix a bare domain (e.g. "stripe.com") with https:// so it parses.
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost") throw new Error("Refusing to fetch a local address");
  const addr = isIP(host) ? host : (await lookup(host)).address;
  if (isPrivateAddress(addr)) {
    throw new Error("Refusing to fetch a private/internal address");
  }
  return u;
}
// [SCOPE 108 / T011] END
