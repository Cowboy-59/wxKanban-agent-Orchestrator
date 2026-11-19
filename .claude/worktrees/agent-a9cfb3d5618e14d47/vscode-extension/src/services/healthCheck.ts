// [SCOPE 094 / T001] BEGIN — proactive orchestrator + MCP health probe
// Startup/refresh health check for the Dev Cockpit. Answers the two questions a
// developer has on open: is my project wired to the orchestrator, and can the kit
// actually reach the hosted MCP?
//
// The MCP hub's GET /health is auth-EXEMPT (mcp-server/src/index-http.ts) — every
// middleware short-circuits it — so this probe runs even before sign-in and never
// needs a token. Ported from scripts/kit-status.mjs::probeHostedMcp (fetch /health,
// 5s abort). No local gateway process exists in the hosted model (spec 028): the
// "orchestrator" the developer talks to IS the hosted MCP, so its /health doubles
// as the orchestrator health signal (status ok + dbConnected).
import { resolveProjectContext } from './projectContext.js';

const PROBE_TIMEOUT_MS = 5000;

/** Result of probing the hosted MCP hub's /health endpoint. */
export interface McpHealthProbe {
  /** /health responded 2xx. */
  reachable: boolean;
  /** hub-reported DB connectivity (null when unreachable/omitted). */
  dbConnected: boolean | null;
  /** hub version string (null when unreachable/omitted). */
  version: string | null;
  /** the base URL that was probed (self-diagnoses a misconfigured endpoint). */
  endpoint: string;
  /** short failure reason when unreachable ('timeout' | 'HTTP 5xx' | message). */
  error: string | null;
}

/** Overall Cockpit health snapshot: local orchestrator wiring + MCP reachability. */
export interface SystemHealth {
  /** a valid .wxkanban-project.json resolved — the project is linked to the orchestrator. */
  linked: boolean;
  /** MCP hub reachability probe (only meaningful when linked). */
  mcp: McpHealthProbe;
  /** rolled-up verdict for the header row. */
  overall: 'ok' | 'degraded' | 'offline' | 'unlinked';
}

/** Probe one hub's /health with a hard 5s timeout. Never throws. */
export async function probeMcpHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<McpHealthProbe> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(endpoint, { signal: controller.signal });
    if (!res.ok) {
      return { reachable: false, dbConnected: null, version: null, endpoint: baseUrl, error: `HTTP ${res.status}` };
    }
    const body = (await res.json().catch(() => ({}))) as { version?: unknown; dbConnected?: unknown };
    return {
      reachable: true,
      dbConnected: typeof body.dbConnected === 'boolean' ? body.dbConnected : null,
      version: typeof body.version === 'string' ? body.version : null,
      endpoint: baseUrl,
      error: null,
    };
  } catch (err) {
    const name = (err as { name?: string }).name;
    return {
      reachable: false,
      dbConnected: null,
      version: null,
      endpoint: baseUrl,
      error: name === 'AbortError' ? 'timeout' : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the workspace project and probe the orchestrator/MCP health.
 *  Token-free (uses the auth-exempt /health), so it works in every load state.
 *  `folderPaths` are the open workspace folders (caller passes them so this stays
 *  vscode-free and unit-testable — same pattern as resolveProjectContext). */
export async function checkSystemHealth(
  folderPaths: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<SystemHealth> {
  const ctx = resolveProjectContext(folderPaths);
  if (!ctx) {
    return {
      linked: false,
      mcp: { reachable: false, dbConnected: null, version: null, endpoint: '', error: 'no project linked' },
      overall: 'unlinked',
    };
  }
  const mcp = await probeMcpHealth(ctx.mcpBaseUrl, fetchImpl);
  const overall: SystemHealth['overall'] = !mcp.reachable
    ? 'offline'
    : mcp.dbConnected === false
      ? 'degraded'
      : 'ok';
  return { linked: true, mcp, overall };
}
// [SCOPE 094 / T001] END
