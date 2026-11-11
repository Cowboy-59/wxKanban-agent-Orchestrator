import { existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { readRuntimeState, isPidAlive, ServiceName } from "../../runtime/state-file";
import { readEntitlementToken } from "../../license/entitlement-cache";
import { verifyEntitlementToken } from "../../license/entitlement-token";

export type ServiceHealth = "alive" | "stale" | "missing";

export type EntitlementState = "active" | "grace" | "expired" | "inactive" | "unknown";

export interface EntitlementSummary {
  state: EntitlementState;
  status: string | null;
  detail: string;
}

const ENTITLEMENT_ALLOWED = new Set(["ACTIVE", "TRIAL"]);

// Read-only summary of the cached, signed entitlement token so a developer can
// see their license state (and any offline grace window) from kit:status. Never
// throws and never blocks — kit:status must always run.
export function summarizeEntitlement(
  projectRoot: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  publicKeyPem?: string,
): EntitlementSummary {
  const token = readEntitlementToken(projectRoot);
  if (!token) {
    return { state: "unknown", status: null, detail: "no entitlement cached yet (verified on first MCP call)" };
  }
  const claims = verifyEntitlementToken(token, publicKeyPem);
  if (!claims) {
    return { state: "unknown", status: null, detail: "cached entitlement is unreadable; will re-verify when online" };
  }
  const status = (claims.status ?? "").toUpperCase() || null;
  const allowed = status !== null && ENTITLEMENT_ALLOWED.has(status);
  if (!allowed) {
    return { state: "inactive", status, detail: `subscription is '${status ?? "unknown"}' — renew at https://wxperts.com/account/billing` };
  }
  const daysLeft = Math.floor((claims.exp - nowSec) / 86400);
  if (nowSec > claims.exp) {
    return { state: "expired", status, detail: "offline grace expired — reconnect to wxKanban to refresh" };
  }
  // Within the validity window; if close to exp and offline, it's the grace tail.
  const state: EntitlementState = daysLeft <= 2 ? "grace" : "active";
  return { state, status, detail: `${status}, valid ${daysLeft} more day(s) offline` };
}

// [SCOPE 143 / T026] BEGIN — agent-run capture hooks and the forwarder's token in kit:status (FR-018)
export type RoutingHooksState = "current" | "stale" | "missing" | "absent";

export interface RoutingSummary {
  /** absent = the project has no _wxAI/routing kit, so nothing is expected. */
  hooks: RoutingHooksState;
  /** Whether this machine holds a project token for the forwarder; null when not checked. */
  tokenStored: boolean | null;
  /** Records held back from forwarding (no task, no projectid, no stored token project); null when not checked (SCOPE 143 / T033, FR-022). */
  heldCount: number | null;
  /** Records the server permanently refused (4xx); only the T038 re-send script retries these; null when not checked (SCOPE 143 / T034, FR-023). */
  rejectedCount: number | null;
  /** Records waiting to send (unforwarded, unrejected); null when not checked. Surfaced alongside a missing token (SCOPE 143 / T035, FR-024). */
  waitingCount: number | null;
  detail: string;
}

/**
 * Runs `_wxAI/routing/install.mjs --check`, `token-store.mjs --check`, and `forward.mjs --stats`,
 * all read-only. Never throws and never prints a token: the token check reports only whether one
 * is stored.
 */
export function summarizeRouting(projectRoot: string): RoutingSummary {
  const routing = join(projectRoot, "_wxAI", "routing");
  const install = join(routing, "install.mjs");
  if (!existsSync(install)) return { hooks: "absent", tokenStored: null, heldCount: null, rejectedCount: null, waitingCount: null, detail: "no routing kit in this project" };
  let hooks: RoutingHooksState = "missing";
  try {
    const r = spawnSync(process.execPath, [install, "--check", "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 10_000 });
    const m = /are (current|stale|missing)/.exec(r.stdout ?? "");
    if (m) hooks = m[1] as RoutingHooksState;
  } catch {
    hooks = "missing";
  }
  let tokenStored: boolean | null = null;
  const store = join(routing, "token-store.mjs");
  if (existsSync(store)) {
    try {
      tokenStored = spawnSync(process.execPath, [store, "--check", "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 10_000 }).status === 0;
    } catch {
      tokenStored = false;
    }
  }
  // [SCOPE 143 / T033] BEGIN — surface held-record count from forward.mjs --stats (FR-022)
  let heldCount: number | null = null;
  // [SCOPE 143 / T034] BEGIN — surface the cumulative permanently-rejected count (FR-023)
  let rejectedCount: number | null = null;
  // [SCOPE 143 / T034] END
  // [SCOPE 143 / T035] BEGIN — surface records waiting to send, for the missing-token message (FR-024)
  let waitingCount: number | null = null;
  // [SCOPE 143 / T035] END
  const forwarder = join(routing, "forward.mjs");
  if (existsSync(forwarder)) {
    try {
      const r = spawnSync(process.execPath, [forwarder, "--stats", "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 10_000 });
      const parsed = r.status === 0 ? JSON.parse(r.stdout ?? "") : null;
      if (parsed && typeof parsed.held === "number") heldCount = parsed.held;
      if (parsed && typeof parsed.rejected === "number") rejectedCount = parsed.rejected;
      if (parsed && typeof parsed.pending === "number") waitingCount = parsed.pending;
    } catch {
      heldCount = null;
      rejectedCount = null;
      waitingCount = null;
    }
  }
  // [SCOPE 143 / T033] END
  const fix = hooks !== "current" || tokenStored === false ? " — run kit:configure to set them up" : "";
  // [SCOPE 143 / T035] BEGIN — a missing token names itself and the waiting count, never silent (FR-024)
  const tokenText =
    tokenStored === null
      ? ""
      : tokenStored
        ? ", project token stored"
        : `, no project token on this machine (${waitingCount ?? 0} record(s) waiting to send)`;
  // [SCOPE 143 / T035] END
  const heldText = heldCount ? `, ${heldCount} held (no task/project)` : "";
  const rejectedText = rejectedCount ? `, ${rejectedCount} rejected (needs re-send)` : "";
  return { hooks, tokenStored, heldCount, rejectedCount, waitingCount, detail: `hooks ${hooks}${tokenText}${heldText}${rejectedText}${fix}` };
}
// [SCOPE 143 / T026] END

export interface ServiceStatus {
  port: number | null;
  pid: number | null;
  parentpid: number | null;
  alive: boolean;
  parentAlive: boolean;
  uptimeSec: number | null;
  health: ServiceHealth;
}

export interface KitStatusReport {
  schemaVersion: number | null;
  services: Record<ServiceName, ServiceStatus>;
  summary: { healthy: number; stale: number; missing: number };
  entitlement?: EntitlementSummary;
  routing?: RoutingSummary;
}

export interface KitStatusOptions {
  format?: "text" | "json";
  strict?: boolean;
  projectRoot?: string;
}

export interface KitStatusHandlerResult {
  exitCode: 0 | 1 | 2;
  output: string;
  report: KitStatusReport | null;
}

// MCP is hosted (mcp.wxperts.com) — not a locally-tracked service. The gateway
// is the only service the kit starts locally.
export const EXPECTED_SERVICES: ServiceName[] = ["gateway"];

// [SCOPE 027 / T015] BEGIN — kit-status command handler
// MODIFIED-BY: [SCOPE 143 / T026] — reports the agent-run routing hooks and token (informational; the exit code is unchanged)
export async function handleKitStatusCommand(
  options: KitStatusOptions = {},
): Promise<KitStatusHandlerResult> {
  const state = readRuntimeState(options.projectRoot ?? process.cwd());

  if (state === null) {
    const output =
      options.format === "json"
        ? JSON.stringify(
            {
              schemaVersion: null,
              services: {},
              summary: { healthy: 0, stale: 0, missing: EXPECTED_SERVICES.length },
              error: "runtime-state file missing or unreadable",
            },
            null,
            2,
          )
        : "kit:status: runtime-state file not found (.wxai/kit-runtime.json)\n" +
          "Run `npm run kit:start` to start the orchestrator gateway. (MCP is hosted at mcp.wxperts.com — nothing to start locally.)";
    return { exitCode: 2, output, report: null };
  }

  const now = Date.now();
  const report: KitStatusReport = {
    schemaVersion: state.schemaVersion,
    services: {} as Record<ServiceName, ServiceStatus>,
    summary: { healthy: 0, stale: 0, missing: 0 },
    entitlement: summarizeEntitlement(options.projectRoot ?? process.cwd()),
    routing: summarizeRouting(options.projectRoot ?? process.cwd()),
  };

  for (const name of EXPECTED_SERVICES) {
    const entry = state.services[name];
    if (!entry) {
      report.services[name] = {
        port: null,
        pid: null,
        parentpid: null,
        alive: false,
        parentAlive: false,
        uptimeSec: null,
        health: "missing",
      };
      report.summary.missing += 1;
      continue;
    }
    const alive = isPidAlive(entry.pid);
    const parentAlive = isPidAlive(entry.parentpid);
    const startedAtMs = Date.parse(entry.startedAt);
    const uptimeSec = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((now - startedAtMs) / 1000))
      : null;
    report.services[name] = {
      port: entry.port,
      pid: entry.pid,
      parentpid: entry.parentpid,
      alive,
      parentAlive,
      uptimeSec,
      health: alive ? "alive" : "stale",
    };
    if (alive) report.summary.healthy += 1;
    else report.summary.stale += 1;
  }

  const errorCount = options.strict
    ? report.summary.stale + report.summary.missing
    : report.summary.missing;
  const exitCode: 0 | 1 = errorCount > 0 ? 1 : 0;

  const output =
    options.format === "json"
      ? JSON.stringify(report, null, 2)
      : renderText(report);

  return { exitCode, output, report };
}
// [SCOPE 027 / T015] END

// [SCOPE 027 / T015] BEGIN — kit-status command handler
// MODIFIED-BY: [SCOPE 143 / T026] — prints the routing line
export function renderText(report: KitStatusReport): string {
  const lines: string[] = [];
  for (const name of EXPECTED_SERVICES) {
    const s = report.services[name];
    if (s.health === "missing") {
      lines.push(`${name.padEnd(10)} NOT RUNNING`);
      continue;
    }
    if (s.health === "stale") {
      lines.push(
        `${name.padEnd(10)} port=${s.port} pid=${s.pid} (STALE — pid not alive)`,
      );
      continue;
    }
    const parentTag = s.parentAlive ? "parent alive" : "parent gone";
    const uptime = s.uptimeSec !== null ? formatUptime(s.uptimeSec) : "?";
    lines.push(
      `${name.padEnd(10)} port=${s.port} pid=${s.pid} (alive, ${parentTag}) up=${uptime}`,
    );
  }
  lines.push("");
  lines.push(
    `${report.summary.healthy} healthy, ${report.summary.stale} stale, ${report.summary.missing} missing`,
  );
  if (report.entitlement) {
    const e = report.entitlement;
    lines.push(`entitlement ${e.state}${e.status ? ` (${e.status})` : ""} — ${e.detail}`);
  }
  if (report.routing && report.routing.hooks !== "absent") {
    lines.push(`agent runs ${report.routing.detail}`);
  }
  return lines.join("\n");
}
// [SCOPE 027 / T015] END

// [SCOPE 027 / T015] BEGIN — kit-status command handler
export function formatUptime(uptimeSec: number): string {
  if (uptimeSec < 60) return `${uptimeSec}s`;
  const m = Math.floor(uptimeSec / 60);
  const s = uptimeSec % 60;
  if (m < 60) return `${m}m${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h${remM}m${s}s`;
}
// [SCOPE 027 / T015] END
