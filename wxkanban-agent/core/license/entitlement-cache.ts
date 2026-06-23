// Read/write the cached entitlement token at `<projectRoot>/.wxai/.entitlement`.
// The token is opaque here; preflight.ts verifies and interprets it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export function entitlementPath(projectRoot: string): string {
  return join(projectRoot, ".wxai", ".entitlement");
}

export function readEntitlementToken(projectRoot: string): string | null {
  const p = entitlementPath(projectRoot);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeEntitlementToken(projectRoot: string, token: string): void {
  const p = entitlementPath(projectRoot);
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, token, "utf8");
  } catch {
    // Best-effort cache; a failure just means we re-fetch next time.
  }
  ensureEntitlementIgnored(projectRoot);
}

/**
 * Make sure the cached token is gitignored on the client so a per-developer
 * license artifact is never committed. Appends to an existing root `.gitignore`
 * only (matching the kit's other gitignore-ensure behavior); does not create one.
 * No-op if `.wxai/` or the entry is already covered.
 */
export function ensureEntitlementIgnored(projectRoot: string): void {
  const giPath = join(projectRoot, ".gitignore");
  try {
    if (!existsSync(giPath)) return;
    const gi = readFileSync(giPath, "utf8");
    if (gi.includes(".wxai/.entitlement") || /(^|\n)\.wxai\/\s*(\n|$)/.test(gi)) return;
    const sep = gi.endsWith("\n") ? "" : "\n";
    writeFileSync(
      giPath,
      `${gi}${sep}\n# wxKanban kit — cached signed entitlement token (per-developer; never commit)\n.wxai/.entitlement\n`,
      "utf8",
    );
  } catch {
    // Non-fatal — the snippet still documents the entry.
  }
}
