// Kit-side entitlement preflight (Phase 1B).
//
// Local-only commands (wxconversion, cwconversion, vbconversion, auditfences, scaffold:frontend, ...) never
// touch the hosted MCP, so the server-side entitlement gate (Phase 1A) can't see
// them. This module fails them closed when the customer's wxKanban subscription
// has lapsed, using a short-lived Ed25519-signed token cached in .wxai/.
//
// Honest limits (see plan Phase 4): this is a SPEED BUMP, not a wall. A no-token
// thief, an old server without a signing key, or a clock frozen inside the grace
// window can still run these low-value local commands. The durable control is
// Phase 1A (everything valuable runs server-side). We fail closed on the cases
// we CAN prove (definitive "inactive" signed status; expired token while offline)
// and fail open on the indeterminate ones so we never brick a legitimate offline
// or pre-rollout customer.
import { verifyEntitlementToken, type EntitlementClaims } from "./entitlement-token";
import { readEntitlementToken, writeEntitlementToken } from "./entitlement-cache";

const ALLOWED_STATUSES = new Set(["ACTIVE", "TRIAL"]);
const SKEW_SEC = 300;
const REMEDIATION_URL = "https://wxperts.com/account/billing";

export type EntitlementMode = "enforce" | "monitor" | "off";

// Commands that must run even when entitlement has lapsed, so the customer can
// see their state and recover.
const EXEMPT_COMMANDS = new Set(["kit:status", "help"]);

export interface RefreshResult {
  enforced: boolean; // server has a signing key configured
  token: string | null; // signed token when enforced
  allowed?: boolean; // server's plain decision (used when not enforced)
  status?: string | null;
}

export type RefreshFn = () => Promise<RefreshResult | null>; // null = could not reach server

export interface PreflightOptions {
  command: string;
  projectRoot?: string;
  mode?: EntitlementMode;
  nowSec?: number;
  refresh?: RefreshFn;
  /** Override the verification key (tests only). */
  publicKeyPem?: string;
}

export interface PreflightResult {
  allowed: boolean;
  reason?: string;
  status?: string | null;
  source: "exempt" | "off" | "cache" | "server" | "grace" | "indeterminate" | "denied" | "monitor";
}

function resolveMode(explicit?: EntitlementMode): EntitlementMode {
  const v = explicit ?? (process.env.WXKANBAN_ENTITLEMENT as EntitlementMode | undefined);
  return v === "off" || v === "monitor" || v === "enforce" ? v : "enforce";
}

type ClaimState = "valid" | "expired" | "inactive" | "future";

function classifyClaims(c: EntitlementClaims, nowSec: number): ClaimState {
  if (nowSec + SKEW_SEC < c.iat) return "future"; // clock rolled back before issue
  if (nowSec > c.exp) return "expired";
  const status = (c.status ?? "").toUpperCase();
  return ALLOWED_STATUSES.has(status) ? "valid" : "inactive";
}

function deny(
  mode: EntitlementMode,
  reason: string,
  status: string | null,
  source: PreflightResult["source"] = "denied",
): PreflightResult {
  if (mode === "monitor") return { allowed: true, status, source: "monitor" };
  return {
    allowed: false,
    reason: `wxKanban entitlement check failed: ${reason}. See ${REMEDIATION_URL}`,
    status,
    source,
  };
}

export async function assertEntitled(opts: PreflightOptions): Promise<PreflightResult> {
  if (EXEMPT_COMMANDS.has(opts.command)) return { allowed: true, source: "exempt" };
  const mode = resolveMode(opts.mode);
  if (mode === "off") return { allowed: true, source: "off" };

  const root = opts.projectRoot ?? process.cwd();
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);

  // 1) Trust a valid cached token without any network.
  const cached = readEntitlementToken(root);
  let hadCache = false;
  if (cached) {
    const claims = verifyEntitlementToken(cached, opts.publicKeyPem);
    if (claims) {
      hadCache = true;
      const state = classifyClaims(claims, nowSec);
      if (state === "valid") return { allowed: true, status: claims.status, source: "cache" };
      if (state === "inactive") {
        return deny(mode, `subscription is '${claims.status ?? "unknown"}'`, claims.status);
      }
      // expired / future → try to refresh below
    }
  }

  // 2) Refresh from the server.
  let refreshed: RefreshResult | null = null;
  try {
    refreshed = opts.refresh ? await opts.refresh() : await defaultRefresh(root);
  } catch {
    refreshed = null;
  }

  if (refreshed) {
    if (!refreshed.enforced) {
      // Server has no signing key yet (pre-rollout). Honor a plain deny if given,
      // otherwise treat as a no-op so we don't block during rollout.
      if (refreshed.allowed === false) {
        return deny(mode, "subscription is not active", refreshed.status ?? null);
      }
      return { allowed: true, status: refreshed.status ?? null, source: "server" };
    }
    if (refreshed.token) {
      const claims = verifyEntitlementToken(refreshed.token, opts.publicKeyPem);
      if (claims) {
        writeEntitlementToken(root, refreshed.token);
        const state = classifyClaims(claims, nowSec);
        if (state === "valid") return { allowed: true, status: claims.status, source: "server" };
        return deny(mode, `subscription is '${claims.status ?? "unknown"}'`, claims.status);
      }
    }
    // enforced but missing/invalid token → fall through to offline handling
  }

  // 3) Could not reach or verify the server.
  if (hadCache) {
    // We had a real token but it's expired/invalid and we're offline → past the
    // 7-day grace baked into the token's exp. Fail closed.
    return deny(mode, "offline and the cached entitlement has expired — reconnect to wxKanban", null, "grace");
  }
  // No usable cache and can't verify → don't brick a legitimate offline first run
  // or a pre-rollout server. Fail open (logged by the caller).
  return { allowed: true, source: "indeterminate" };
}

function unwrapEntitlementPayload(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if ("enforced" in d || "allowed" in d) return d;
  const content = d["content"];
  if (Array.isArray(content) && content[0] && typeof content[0] === "object") {
    const text = (content[0] as Record<string, unknown>)["text"];
    if (typeof text === "string") {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Refresh timeout — never stall a command waiting on entitlement. */
const REFRESH_TIMEOUT_MS = 4000;

async function defaultRefresh(root: string): Promise<RefreshResult | null> {
  const { McpClient, resolveApiToken } = await import("../http/mcp-client");
  // No token → cannot authenticate get_entitlement; treat as indeterminate.
  if (!resolveApiToken({ projectRoot: root })) return null;
  const client = new McpClient({ projectRoot: root });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), REFRESH_TIMEOUT_MS));
  const res = await Promise.race([client.callTool("project.get_entitlement", {}), timeout]);
  if (!res || !res.ok) return null;
  const payload = unwrapEntitlementPayload(res.data);
  if (!payload) return null;
  return {
    enforced: payload["enforced"] === true,
    token: typeof payload["token"] === "string" ? (payload["token"] as string) : null,
    allowed: typeof payload["allowed"] === "boolean" ? (payload["allowed"] as boolean) : undefined,
    status: typeof payload["status"] === "string" ? (payload["status"] as string) : null,
  };
}
