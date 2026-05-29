import { spawn } from "child_process";

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
