import { spawn, spawnSync } from "child_process";

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
// MODIFIED-BY: SCOPE-086 — Marketplace-only. The Dev Cockpit is published to the
// public VS Code Marketplace (`wxperts.wxkanban-dev-cockpit`) and the kit no
// longer bundles or ships a `.vsix`. Install and UPDATE both come from the
// Marketplace: a gallery-managed copy auto-updates itself, so the orchestrator's
// only job is the first install when the extension is absent. There is no bundled
// artifact, no fallback, and no source override — install is always by gallery ID.
//
// Same best-effort contract as emitCockpitRefresh: `code` may be absent, no
// window may be open, or the consumer may not use VS Code — every failure is
// swallowed and MUST NOT affect the triggering command's exit status. Throttled
// to once per process. Disabled by WXKANBAN_NO_COCKPIT_REFRESH or the dedicated
// WXKANBAN_NO_COCKPIT_UPDATE.
const COCKPIT_EXTENSION_ID = "wxperts.wxkanban-dev-cockpit";
let cockpitUpdateChecked = false;

// Is the cockpit already installed? Reads `code --list-extensions`. Returns true
// / false, or null when `code` is unavailable (can't tell — and can't install).
function isCockpitInstalled(): boolean | null {
  const { cmd, shell } = resolveCodeCli();
  const res = shell
    ? spawnSync(`${cmd} --list-extensions`, { encoding: "utf8", shell: true, timeout: 15000 })
    : spawnSync(cmd, ["--list-extensions"], { encoding: "utf8", shell: false, timeout: 15000 });
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") return null;
  return res.stdout.split(/\r?\n/).some((line) => line.trim().toLowerCase() === COCKPIT_EXTENSION_ID);
}

export function ensureCockpitUpToDate(): void {
  if (cockpitUpdateChecked) return; // once per process
  cockpitUpdateChecked = true;
  if (process.env.WXKANBAN_NO_COCKPIT_REFRESH || process.env.WXKANBAN_NO_COCKPIT_UPDATE) return;
  try {
    // Already installed → nothing to do. A gallery-managed copy auto-updates
    // itself through VS Code, so there is no version to chase here. Return before
    // spawning an install so the common case stays cost-free.
    if (isCockpitInstalled() === true) return;

    // Not installed (or `code` unavailable) → install from the Marketplace. Make
    // it VISIBLE — a silently-missing cockpit is how a developer never discovers
    // the tool exists.
    console.error(`[cockpit] installing Dev Cockpit from the VS Code Marketplace (${COCKPIT_EXTENSION_ID})…`);

    if (!installCockpitFromGallery()) {
      // SCOPE-086 FR-002: the auto-install could not run (no `code` on PATH or the
      // gallery is unreachable). Never leave the customer with a silently-missing
      // cockpit — print an actionable, copy-pasteable manual path.
      console.error(
        [
          "[cockpit] Could not auto-install the Dev Cockpit from the Marketplace. Install it manually:",
          '  • VS Code: Extensions panel → search "wxKanban Dev Cockpit" → Install',
          `  • Or CLI:  code --install-extension ${COCKPIT_EXTENSION_ID}`,
          "  If `code` is not found, add it to PATH — VS Code: Ctrl/Cmd+Shift+P →",
          "  \"Shell Command: Install 'code' command in PATH\".",
        ].join("\n"),
      );
    }
  } catch {
    /* best-effort only — never affect the caller's exit status */
  }
}
// [SCOPE 042 / T038] END

// [SCOPE 086 / T001] BEGIN — Marketplace-only cockpit install
// Install (or reinstall/repair) the cockpit by Marketplace extension ID so the
// resulting copy is gallery-managed and auto-updates. BLOCKING (spawnSync) — it
// runs only on the rare path where the extension is absent, never in the
// steady-state no-op case, so the brief block is acceptable. Returns true when
// the install command reported success.
function installCockpitFromGallery(): boolean {
  const { cmd, shell } = resolveCodeCli();
  const INSTALL_TIMEOUT_MS = 120000;
  const res = shell
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
  return !res.error && res.status === 0;
}
// [SCOPE 086 / T001] END
