import { randomBytes } from "node:crypto";

// [SCOPE 070 / T005] BEGIN — Banner Studio tracked-link helpers (code, host allowlist, redirect URL)
// Shared by the banner router (SPEC-067), the links CRUD + /r/:code redirect (SPEC-068),
// and the export bundle (SPEC-069). The link `code` is opaque + non-enumerable; the
// destination host is allowlisted on write (defense-in-depth — the redirect itself is
// already open-redirect-proof because it only ever reads the stored destination).
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Short, opaque, non-enumerable link code (the :code in /r/:code). */
export function generateLinkCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += BASE62[bytes[i]! % 62];
  return out;
}

function allowedHosts(): string[] {
  const raw = process.env["BANNER_LINK_ALLOWED_HOSTS"];
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }
  return [
    "wxkanban.com",
    "www.wxkanban.com",
    "wxperts.com",
    "www.wxperts.com",
    "windev.wxperts.com",
    "wxkanban.wxperts.com",
  ];
}

/** Defense-in-depth: a tracked link's destination must point at an allowlisted host. */
export function isAllowedDestinationHost(destinationUrl: string): boolean {
  try {
    const u = new URL(destinationUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return allowedHosts().includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Absolute /r/:code URL on the app domain (REDIRECT_BASE_URL) — for export + embed. */
export function buildRedirectUrl(code: string): string {
  const base = (process.env["REDIRECT_BASE_URL"] || "").replace(/\/+$/, "");
  return `${base}/r/${code}`;
}
// [SCOPE 070 / T005] END
