import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

// [SCOPE 143 / T026] BEGIN — install the agent-run routing hooks on the first run after a kit upgrade (FR-018)
/**
 * SPEC-143 T026: the first kit session after an install or upgrade merges the routing hooks
 * (`_wxAI/routing/install.mjs`, an idempotent merge that leaves every other hook alone) into
 * `.claude/settings.json`, so a new capture or forward hook arrives with the kit instead of
 * waiting for someone to re-run kit:configure.
 *
 * Once per kit version: the version that last ran it is kept in `.wxai/routing-hooks.json`, so a
 * developer who removed the hooks (`install.mjs --uninstall`) is not overridden until the next
 * upgrade. Called from the same session entry point as ensureKitUpToDate (cli --help). Best
 * effort: every failure is swallowed and never affects the triggering command. Runs at most once
 * per process.
 */
export const ROUTING_MARKER_REL = path.join(".wxai", "routing-hooks.json");
let routingHooksSynced = false;

function readJson(file: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface RoutingHooksSyncResult {
  ran: boolean;
  reason: "no-routing-kit" | "no-kit-version" | "already-synced" | "installed" | "install-failed" | "error";
}

export function ensureRoutingHooksForKitVersion(projectRoot: string = process.cwd()): RoutingHooksSyncResult {
  if (routingHooksSynced) return { ran: false, reason: "already-synced" };
  routingHooksSynced = true;
  try {
    const install = path.join(projectRoot, "_wxAI", "routing", "install.mjs");
    if (!fs.existsSync(install)) return { ran: false, reason: "no-routing-kit" };
    const config = readJson(path.join(projectRoot, ".wxkanban-project.json"));
    const raw = config?.["kitVersion"] ?? config?.["version"];
    const kitVersion = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    if (!kitVersion) return { ran: false, reason: "no-kit-version" };
    const markerFile = path.join(projectRoot, ROUTING_MARKER_REL);
    if (readJson(markerFile)?.["kitVersion"] === kitVersion) return { ran: false, reason: "already-synced" };

    const r = spawnSync(process.execPath, [install, "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 15_000 });
    if (r.status !== 0) return { ran: true, reason: "install-failed" };
    fs.mkdirSync(path.dirname(markerFile), { recursive: true });
    fs.writeFileSync(markerFile, JSON.stringify({ kitVersion, installedAt: new Date().toISOString() }, null, 2) + "\n", "utf-8");
    return { ran: true, reason: "installed" };
  } catch {
    return { ran: false, reason: "error" };
  }
}

/** Test seam: lets a test run the sync more than once in one process. */
export function resetRoutingHooksSyncForTests(): void {
  routingHooksSynced = false;
}
// [SCOPE 143 / T026] END

// [SCOPE 155 / T002] BEGIN — install the session-feed Stop hook on the first run after a kit upgrade
/**
 * Same once-per-kit-version pattern as ensureRoutingHooksForKitVersion above, for the SPEC-155
 * session-feed hook (`_wxAI/remote/install.mjs`). A separate marker file so the two syncs never
 * read or clobber each other's "last synced version" state.
 */
export const SESSION_FEED_MARKER_REL = path.join(".wxai", "session-feed-hook.json");
let sessionFeedHookSynced = false;

export function ensureSessionFeedHookForKitVersion(projectRoot: string = process.cwd()): RoutingHooksSyncResult {
  if (sessionFeedHookSynced) return { ran: false, reason: "already-synced" };
  sessionFeedHookSynced = true;
  try {
    const install = path.join(projectRoot, "_wxAI", "remote", "install.mjs");
    if (!fs.existsSync(install)) return { ran: false, reason: "no-routing-kit" };
    const config = readJson(path.join(projectRoot, ".wxkanban-project.json"));
    const raw = config?.["kitVersion"] ?? config?.["version"];
    const kitVersion = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    if (!kitVersion) return { ran: false, reason: "no-kit-version" };
    const markerFile = path.join(projectRoot, SESSION_FEED_MARKER_REL);
    if (readJson(markerFile)?.["kitVersion"] === kitVersion) return { ran: false, reason: "already-synced" };

    const r = spawnSync(process.execPath, [install, "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 15_000 });
    if (r.status !== 0) return { ran: true, reason: "install-failed" };
    fs.mkdirSync(path.dirname(markerFile), { recursive: true });
    fs.writeFileSync(markerFile, JSON.stringify({ kitVersion, installedAt: new Date().toISOString() }, null, 2) + "\n", "utf-8");
    return { ran: true, reason: "installed" };
  } catch {
    return { ran: false, reason: "error" };
  }
}

/** Test seam: lets a test run the sync more than once in one process. */
export function resetSessionFeedHookSyncForTests(): void {
  sessionFeedHookSynced = false;
}
// [SCOPE 155 / T002] END
