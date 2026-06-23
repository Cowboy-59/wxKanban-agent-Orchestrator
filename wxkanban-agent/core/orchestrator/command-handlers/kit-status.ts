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
