import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// [SCOPE 042 / T021] BEGIN — emitCockpitRefresh (best-effort IDE refresh ping)
// The VS Code Dev Cockpit (spec 042) registers a URI handler at
// vscode://wxperts.wxkanban-dev-cockpit/refresh. After dbpush or implement
// changes the project's remaining work, we ping that URI so the cockpit
// re-queries MCP immediately instead of waiting for its fallback poll.
//
// This is strictly fire-and-forget: `code` may not be on PATH, no editor
// window may be open, or the consumer may not use VS Code at all. Every failure
// is swallowed — emitting a refresh must NEVER affect the exit status of the
// command that triggered it. Set WXKANBAN_NO_COCKPIT_REFRESH=1 to disable.
const COCKPIT_REFRESH_URI = "vscode://wxperts.wxkanban-dev-cockpit/refresh";

export function emitCockpitRefresh(): void {
  if (process.env.WXKANBAN_NO_COCKPIT_REFRESH) return;
  try {
    const isWindows = process.platform === "win32";
    // On Windows `code` is a .cmd that Node can only spawn via the shell; pass
    // ONE command string (the URI is a fixed constant) to avoid the DEP0190
    // warning that shell:true + an args array emits. Non-Windows uses no shell.
    const child = isWindows
      ? spawn(`code.cmd --open-url "${COCKPIT_REFRESH_URI}"`, { stdio: "ignore", detached: true, shell: true })
      : spawn("code", ["--open-url", COCKPIT_REFRESH_URI], { stdio: "ignore", detached: true, shell: false });
    // Never let a missing `code` binary surface as an unhandled error.
    child.on("error", () => undefined);
    child.unref();
  } catch {
    /* best-effort only */
  }
}
// [SCOPE 042 / T021] END

// [SCOPE 042 / T038] BEGIN — ensureCockpitUpToDate (opportunistic self-heal)
// FR-009/FR-010 install/update the cockpit only at kit init and at an accepted
// kit upgrade. That leaves a developer who hand-installed an older .vsix (or
// skipped the upgrade re-run) on a stale cockpit indefinitely. FR-012 closes
// the gap: at the same dbpush/implement refresh moments, compare the installed
// cockpit version to the .vsix bundled with this kit and `--force` install the
// bundle when the installed copy is missing or older. Equal → no-op; a
// newer-installed cockpit is left untouched (never downgrade).
//
// Same best-effort contract as emitCockpitRefresh: `code` may be absent, no
// window may be open, or the consumer may not use VS Code — every failure is
// swallowed and MUST NOT affect the triggering command's exit status. Throttled
// to once per process (the bundled version cannot change mid-run). Disabled by
// WXKANBAN_NO_COCKPIT_REFRESH or the dedicated WXKANBAN_NO_COCKPIT_UPDATE.
const COCKPIT_EXTENSION_ID = "wxperts.wxkanban-dev-cockpit";
const COCKPIT_VSIX_PREFIX = "wxkanban-dev-cockpit-";
let cockpitUpdateChecked = false;

// Compare two dotted version strings numerically. Returns >0 if a>b, <0 if a<b,
// 0 if equal. Non-numeric segments are coerced to 0 (the cockpit uses plain
// x.y.z, so this is sufficient — no prerelease/build handling needed).
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] ?? "0", 10) || 0;
    const nb = parseInt(pb[i] ?? "0", 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// Locate the cockpit .vsix bundled with this kit and return its path + version
// (parsed from the wxkanban-dev-cockpit-<version>.vsix filename). The layout
// differs between the dogfood repo (vscode-extension/ at the project root) and
// the kit download payload (build-release packs the artifact in), so we probe a
// prioritized set of candidate dirs and pick the highest-versioned match.
export function findBundledVsix(): { vsixPath: string; version: string } | null {
  const candidates: string[] = [];
  if (process.env.WXKANBAN_COCKPIT_VSIX_DIR) candidates.push(process.env.WXKANBAN_COCKPIT_VSIX_DIR);
  candidates.push(path.join(process.cwd(), "vscode-extension"));
  candidates.push(process.cwd());
  // Walk up from this compiled file looking for a vscode-extension sibling
  // anywhere inside the kit package.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, "vscode-extension"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  let best: { vsixPath: string; version: string } | null = null;
  for (const candidate of candidates) {
    let entries: string[];
    try {
      entries = fs.readdirSync(candidate);
    } catch {
      continue; // dir doesn't exist — try the next candidate
    }
    for (const name of entries) {
      if (!name.startsWith(COCKPIT_VSIX_PREFIX) || !name.endsWith(".vsix")) continue;
      const version = name.slice(COCKPIT_VSIX_PREFIX.length, -".vsix".length);
      if (!/^\d+(\.\d+)*$/.test(version)) continue;
      if (!best || compareVersions(version, best.version) > 0) {
        best = { vsixPath: path.join(candidate, name), version };
      }
    }
    if (best) return best; // first candidate dir with a match wins (highest priority)
  }
  return null;
}

// Read the installed cockpit version via `code --list-extensions
// --show-versions` (line `wxperts.wxkanban-dev-cockpit@x.y.z`). Returns the
// version string, or null when not installed / `code` unavailable.
function readInstalledCockpitVersion(): string | null {
  const isWindows = process.platform === "win32";
  const res = isWindows
    ? spawnSync("code.cmd --list-extensions --show-versions", { encoding: "utf8", shell: true, timeout: 15000 })
    : spawnSync("code", ["--list-extensions", "--show-versions"], { encoding: "utf8", shell: false, timeout: 15000 });
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") return null;
  for (const line of res.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(COCKPIT_EXTENSION_ID + "@")) {
      return trimmed.slice(COCKPIT_EXTENSION_ID.length + 1);
    }
  }
  return null; // extension not in the list
}

export function ensureCockpitUpToDate(): void {
  if (cockpitUpdateChecked) return; // once per process
  cockpitUpdateChecked = true;
  if (process.env.WXKANBAN_NO_COCKPIT_REFRESH || process.env.WXKANBAN_NO_COCKPIT_UPDATE) return;
  try {
    const bundled = findBundledVsix();
    if (!bundled) return; // no bundled artifact to install from

    const installed = readInstalledCockpitVersion();
    // Skip when up to date or ahead. installed === null means not installed
    // (or `code` unavailable) — only install if `code` is actually present,
    // which the install spawn below will determine; a missing `code` makes it a
    // silent no-op via the error handler.
    if (installed !== null && compareVersions(installed, bundled.version) >= 0) return;

    const isWindows = process.platform === "win32";
    // Quote the path (may contain spaces) for the Windows shell form.
    const child = isWindows
      ? spawn(`code.cmd --install-extension "${bundled.vsixPath}" --force`, { stdio: "ignore", detached: true, shell: true })
      : spawn("code", ["--install-extension", bundled.vsixPath, "--force"], { stdio: "ignore", detached: true, shell: false });
    child.on("error", () => undefined); // missing `code` must never surface
    child.unref();
  } catch {
    /* best-effort only — never affect the caller's exit status */
  }
}
// [SCOPE 042 / T038] END
