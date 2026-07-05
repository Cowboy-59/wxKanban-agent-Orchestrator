import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Resolve the VS Code CLI across platforms. On Windows it's `code.cmd`, which
// Node can only spawn through the shell. On macOS/Linux `code` is frequently NOT
// on PATH (VS Code requires the manual "Shell Command: Install 'code' command in
// PATH"), so probe the standard install locations before falling back to bare
// `code`. Returns the launch command plus whether it needs a shell.
// WXKANBAN_CODE_BIN overrides everything (escape hatch for non-standard installs).
function resolveCodeCli(): { cmd: string; shell: boolean } {
  if (process.env.WXKANBAN_CODE_BIN) {
    return { cmd: process.env.WXKANBAN_CODE_BIN, shell: process.platform === "win32" };
  }
  if (process.platform === "win32") return { cmd: "code.cmd", shell: true };
  const candidates = [
    "code",
    "/usr/local/bin/code",
    "/opt/homebrew/bin/code",
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    "/Applications/VSCodium.app/Contents/Resources/app/bin/codium",
  ];
  for (const cmd of candidates) {
    try {
      const probe = spawnSync(cmd, ["--version"], { stdio: "ignore", timeout: 3000 });
      if (!probe.error && probe.status === 0) return { cmd, shell: false };
    } catch {
      /* try the next candidate */
    }
  }
  return { cmd: "code", shell: false }; // best-effort; the spawn error handler swallows ENOENT
}

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
    const { cmd, shell } = resolveCodeCli();
    // On Windows `code.cmd` must run via the shell; pass ONE command string (the
    // URI is a fixed constant) to avoid the DEP0190 warning that shell:true + an
    // args array emits. macOS/Linux use the resolved binary with no shell.
    const child = shell
      ? spawn(`${cmd} --open-url "${COCKPIT_REFRESH_URI}"`, { stdio: "ignore", detached: true, shell: true })
      : spawn(cmd, ["--open-url", COCKPIT_REFRESH_URI], { stdio: "ignore", detached: true, shell: false });
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
// kit upgrade. FR-012 closes the gap for a stale hand-installed copy: at the
// same dbpush/implement refresh moments, ensure the cockpit is current.
//
// SCOPE-086 FR-004 changes HOW: the cockpit is now published to the public VS
// Code Marketplace (`wxperts.wxkanban-dev-cockpit`), so we prefer installing by
// Marketplace extension ID — a gallery-managed copy auto-updates itself, which a
// sideloaded `.vsix` never does. The bundled `.vsix` is only a fallback when the
// gallery install cannot run (offline / `code` missing / gallery unreachable).
// We never downgrade a copy already at or ahead of the bundled floor.
//
// Same best-effort contract as emitCockpitRefresh: `code` may be absent, no
// window may be open, or the consumer may not use VS Code — every failure is
// swallowed and MUST NOT affect the triggering command's exit status. Throttled
// to once per process. Disabled by WXKANBAN_NO_COCKPIT_REFRESH or the dedicated
// WXKANBAN_NO_COCKPIT_UPDATE.
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
  const { cmd, shell } = resolveCodeCli();
  const res = shell
    ? spawnSync(`${cmd} --list-extensions --show-versions`, { encoding: "utf8", shell: true, timeout: 15000 })
    : spawnSync(cmd, ["--list-extensions", "--show-versions"], { encoding: "utf8", shell: false, timeout: 15000 });
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
    const installed = readInstalledCockpitVersion();

    // Steady state: an installed copy that is at or ahead of the bundled floor
    // needs no action here — a gallery-managed copy auto-updates itself, and we
    // never downgrade to an older bundled `.vsix`. Return before spawning
    // anything so the common case stays cost-free. (With no bundled artifact to
    // compare against, an existing install is likewise left alone.)
    if (installed !== null && (!bundled || compareVersions(installed, bundled.version) >= 0)) {
      return;
    }

    // An install (not present) or an update (older than the bundled floor) is
    // needed. Prefer the Marketplace gallery so the copy is gallery-managed and
    // auto-updates; fall back to the bundled `.vsix` only if the gallery install
    // cannot run. Make it VISIBLE — a silently-swallowed stale cockpit is how a
    // developer ends up several versions behind without any signal.
    console.error(
      `[cockpit] installing/updating Dev Cockpit ${installed ?? "(not installed)"} -> gallery ${COCKPIT_EXTENSION_ID}` +
        (bundled ? ` (fallback ${path.basename(bundled.vsixPath)} ${bundled.version})` : ""),
    );

    const ok = installCockpitGalleryFirst(bundled ? bundled.vsixPath : null);
    if (!ok) {
      // SCOPE-086 FR-002 (T006): auto-install could not run (no `code` on PATH,
      // gallery unreachable AND no/failed bundled .vsix). Never leave the
      // customer with a silently-missing cockpit — print an actionable,
      // copy-pasteable manual path instead of a swallowed one-liner.
      const lines = [
        "[cockpit] Could not auto-install the Dev Cockpit. Install it manually:",
        '  • VS Code: Extensions panel → search "wxKanban Dev Cockpit" → Install',
        `  • Or CLI:  code --install-extension ${COCKPIT_EXTENSION_ID}`,
      ];
      if (bundled) lines.push(`  • Offline: code --install-extension "${bundled.vsixPath}"`);
      lines.push(
        '  If `code` is not found, add it to PATH — VS Code: Ctrl/Cmd+Shift+P →',
        '  "Shell Command: Install \'code\' command in PATH".',
      );
      console.error(lines.join("\n"));
    }
  } catch {
    /* best-effort only — never affect the caller's exit status */
  }
}
// [SCOPE 042 / T038] END

// Resolve the cockpit install source from WXKANBAN_COCKPIT_SOURCE (SCOPE-086
// FR-004 / T003). `auto` (default) = gallery-first with .vsix fallback;
// `gallery` = Marketplace only (never sideload); `vsix` = bundled artifact only
// (for policy-locked environments where the Marketplace gallery is blocked).
// Any unrecognized value is treated as `auto`.
// [SCOPE 086 / T003] BEGIN — WXKANBAN_COCKPIT_SOURCE escape hatch (auto/gallery/vsix)
function cockpitSource(): "auto" | "gallery" | "vsix" {
  const v = (process.env.WXKANBAN_COCKPIT_SOURCE ?? "auto").trim().toLowerCase();
  return v === "gallery" || v === "vsix" ? v : "auto";
}
// [SCOPE 086 / T003] END

// Install or update the cockpit, gallery-first. Prefer installing by Marketplace
// extension ID so the resulting copy is gallery-managed and auto-updates; only
// when that install cannot run (or WXKANBAN_COCKPIT_SOURCE forces it) do we fall
// back to the bundled `.vsix`. This is BLOCKING (spawnSync) on purpose: we need
// the gallery exit status to decide whether to fall back. It runs only on the
// rare path where an install/update is actually required — never in the
// steady-state no-op case — so the brief block is acceptable. Returns true when
// any install command reported success.
// [SCOPE 086 / T001] BEGIN — Marketplace-first self-update in ensureCockpitUpToDate
function installCockpitGalleryFirst(bundledVsixPath: string | null): boolean {
  const { cmd, shell } = resolveCodeCli();
  const INSTALL_TIMEOUT_MS = 120000;
  const source = cockpitSource();

  // 1) Gallery install by Marketplace ID (the auto-updating copy). Skipped when
  //    the source is pinned to the bundled `.vsix`.
  if (source !== "vsix") {
    const gallery = shell
      ? spawnSync(`${cmd} --install-extension ${COCKPIT_EXTENSION_ID} --force`, {
          stdio: "ignore",
          shell: true,
          timeout: INSTALL_TIMEOUT_MS,
        })
      : spawnSync(cmd, ["--install-extension", COCKPIT_EXTENSION_ID, "--force"], {
          stdio: "ignore",
          shell: false,
          timeout: INSTALL_TIMEOUT_MS,
        });
    if (!gallery.error && gallery.status === 0) return true;
  }

  // 2) Fallback: the bundled `.vsix` (offline / air-gapped / gallery unreachable).
  //    Skipped when the source is pinned to the gallery.
  if (source !== "gallery" && bundledVsixPath) {
    const vsix = shell
      ? spawnSync(`${cmd} --install-extension "${bundledVsixPath}" --force`, {
          stdio: "ignore",
          shell: true,
          timeout: INSTALL_TIMEOUT_MS,
        })
      : spawnSync(cmd, ["--install-extension", bundledVsixPath, "--force"], {
          stdio: "ignore",
          shell: false,
          timeout: INSTALL_TIMEOUT_MS,
        });
    if (!vsix.error && vsix.status === 0) return true;
  }

  return false;
}
// [SCOPE 086 / T001] END
