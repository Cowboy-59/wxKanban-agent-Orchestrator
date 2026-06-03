/**
 * Spec 028 / T018 — Bearer-aware HTTP client for the hosted MCP.
 *
 * Single chokepoint through which every kit-side caller talks to the MCP
 * server (workers, services, command-handlers, verify-install). Handles:
 *
 *   - token resolution per FR-005 precedence (env → kit block → legacy file)
 *   - bearer header attachment on every request
 *   - one automatic retry on 429 with Retry-After
 *   - clean 5xx error surface (no auto-retry)
 *   - fast-fail on missing token + https:// base URL
 *
 * Spec 029 / T002 — gains callToolWithEnvelope() which auto-unwraps the
 * MCP `{content:[{text}]}` wire body and returns the envelope (success /
 * blocked / blockingIssues / data). callTool() keeps its raw-wire return
 * for backward compatibility with existing callers (buildscope-worker,
 * lifecycle-client, tests). FR-002.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveMcpBaseUrl } from "../context/runtime-state";
import {
  unwrapMcpContent,
  classifyEnvelope,
  McpEnvelopeError,
  type McpEnvelope,
} from "../orchestrator/mcp-envelope";

export interface McpClientOptions {
  baseUrl?: string;
  token?: string;
  projectId?: string;
  projectRoot?: string;
  fetchImpl?: typeof fetch;
}

export interface McpCallResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

const TOKEN_RE = /^wxk_(live|test)_[a-f0-9]{64}$/;

function readKitBlock(projectRoot: string): { apiToken?: string } | null {
  const path = join(projectRoot, ".wxai", "project.json");
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf-8")) as { kit?: { apiToken?: unknown } };
    const t = json?.kit?.apiToken;
    return typeof t === "string" ? { apiToken: t } : null;
  } catch {
    return null;
  }
}

function readLegacyTokenFile(projectRoot: string): string | null {
  const path = join(projectRoot, ".wxkanban-project.json");
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf-8")) as { apiToken?: unknown };
    return typeof json?.apiToken === "string" ? json.apiToken : null;
  } catch {
    return null;
  }
}

// [SCOPE 028 / Phase 12 — FR-022] Workspace-local FIRST, env as fallback.
// Two VS Code windows open on different projects on one machine must each use
// THEIR workspace's token. A global/user-level WXKANBAN_API_TOKEN must not
// override a workspace-local token (it only fills in when the workspace has
// none). This reverses the original env-first precedence (FR-005).
export function resolveApiToken(opts: { projectRoot?: string; env?: NodeJS.ProcessEnv } = {}): string | null {
  const root = opts.projectRoot ?? process.cwd();

  const kit = readKitBlock(root);
  if (kit?.apiToken) return kit.apiToken;

  const legacy = readLegacyTokenFile(root);
  if (legacy) return legacy;

  const env = opts.env ?? process.env;
  if (env["WXKANBAN_API_TOKEN"]) return env["WXKANBAN_API_TOKEN"];

  return null;
}

// [SCOPE 028 / Phase 12 — FR-022] Resolve the workspace's projectId so it can be
// sent on every MCP call (the server validates it against the token's project).
function readProjectIdFile(projectRoot: string): string | null {
  const legacy = join(projectRoot, ".wxkanban-project.json");
  if (existsSync(legacy)) {
    try {
      const json = JSON.parse(readFileSync(legacy, "utf-8")) as { projectId?: unknown };
      if (typeof json?.projectId === "string") return json.projectId;
    } catch {
      /* fall through */
    }
  }
  const wxai = join(projectRoot, ".wxai", "project.json");
  if (existsSync(wxai)) {
    try {
      const json = JSON.parse(readFileSync(wxai, "utf-8")) as { projectId?: unknown };
      if (typeof json?.projectId === "string") return json.projectId;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export function resolveProjectId(opts: { projectRoot?: string } = {}): string | null {
  return readProjectIdFile(opts.projectRoot ?? process.cwd());
}

function maskToken(token: string): string {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 12)}…${token.slice(-4)}`;
}

export class McpClient {
  private readonly baseUrl: string;
  private readonly token: string | null;
  private readonly projectId: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly isHosted: boolean;

  constructor(opts: McpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? resolveMcpBaseUrl({ projectRoot: opts.projectRoot })).replace(/\/+$/, "");
    this.token = opts.token ?? resolveApiToken({ projectRoot: opts.projectRoot });
    // [SCOPE 028 / Phase 12 — FR-022] resolved once per client (per workspace).
    this.projectId = opts.projectId ?? resolveProjectId({ projectRoot: opts.projectRoot });
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.isHosted = /^https:\/\//i.test(this.baseUrl);

    if (this.isHosted && !this.token) {
      throw new Error(
        `mcp-client: no API token resolved for hosted endpoint ${this.baseUrl}.\n` +
          `Set WXKANBAN_API_TOKEN in your env, run 'wxkanban-agent kit:configure --token <token>',\n` +
          `or revert to the local-MCP path with 'npm run kit:start:legacy'.`,
      );
    }
    if (this.token && !TOKEN_RE.test(this.token)) {
      throw new Error(
        `mcp-client: token does not match wxk_(live|test)_<64hex> shape (got ${maskToken(this.token)})`,
      );
    }
  }

  get base(): string {
    return this.baseUrl;
  }

  async health(): Promise<McpCallResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/health`, { method: "GET" });
    const data = (await res.json().catch(() => undefined)) as unknown;
    return { ok: res.ok, status: res.status, data };
  }

  async callTool<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<McpCallResult<T>> {
    const url = `${this.baseUrl}/call`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    // [SCOPE 028 / Phase 12 — FR-022] Send the workspace's projectId on every
    // call so data lands in the correct project even with multiple concurrent
    // windows. The server validates it against the token's project (scope
    // backstop). Never override a projectId the caller already supplied (either
    // casing); unknown keys are stripped by the server's non-strict schemas.
    const finalArgs: Record<string, unknown> = { ...args };
    if (
      this.projectId &&
      finalArgs["projectId"] === undefined &&
      finalArgs["projectid"] === undefined
    ) {
      finalArgs["projectId"] = this.projectId;
    }
    const body = JSON.stringify({ tool, args: finalArgs });

    const first = await this.fetchImpl(url, { method: "POST", headers, body });

    if (first.status === 429) {
      const retryAfterSec = Number.parseInt(first.headers.get("Retry-After") ?? "1", 10) || 1;
      console.warn(`[mcp-client] 429 rate-limited; retrying once in ${retryAfterSec}s.`);
      await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
      const second = await this.fetchImpl(url, { method: "POST", headers, body });
      return this.toResult<T>(second);
    }

    if (first.status >= 500) {
      const text = await first.text().catch(() => "");
      return {
        ok: false,
        status: first.status,
        error:
          `mcp-client: hosted MCP returned ${first.status}. ` +
          `Check status at ${this.baseUrl}/health; do not retry blindly. Detail: ${text.slice(0, 200)}`,
      };
    }

    return this.toResult<T>(first);
  }

  private async toResult<T>(res: Response): Promise<McpCallResult<T>> {
    const data = (await res.json().catch(() => undefined)) as T | undefined;
    if (!res.ok) {
      const errMsg = (data as unknown as { error?: string } | undefined)?.error ?? `http-${res.status}`;
      return { ok: false, status: res.status, error: errMsg, data };
    }
    return { ok: true, status: res.status, data };
  }

  // [SCOPE 029 / T002] BEGIN — callToolWithEnvelope (envelope-aware variant)
  //
  // Returns the unwrapped MCP envelope (success / blocked / blockingIssues /
  // data) so callers can detect HTTP 422 OR HTTP 200 + success:false blocks
  // without duplicating wire-format parsing. Wraps callTool's HTTP +
  // 429-retry behavior; routes the resulting body through
  // unwrapMcpContent + classifyEnvelope from mcp-envelope.ts.
  //
  // 5xx and non-422 4xx still surface via McpCallResult.error (ok:false);
  // the envelope itself is only populated on 2xx and 422.
  async callToolWithEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<McpCallResult<McpEnvelope<T>>> {
    const raw = await this.callTool<unknown>(tool, args);
    if (!raw.ok) {
      return { ok: false, status: raw.status, error: raw.error };
    }
    // 422 from this client surfaces as ok:false above (status >= 400 path);
    // but if the server returned 200 with success:false (legacy block),
    // the body is a normal 2xx response from callTool's perspective.
    try {
      const inner = unwrapMcpContent<T>(raw.data);
      const envelope = classifyEnvelope<T>(inner, raw.status);
      return { ok: true, status: raw.status, data: envelope };
    } catch (err) {
      if (err instanceof McpEnvelopeError) {
        return { ok: false, status: raw.status, error: err.message };
      }
      throw err;
    }
  }
  // [SCOPE 029 / T002] END
}

// [SCOPE 028 / Phase 12 — FR-022] Key the cached client by workspace root so a
// single process never serves two different workspaces with one cached
// token/projectId. Each root gets its own client (token + projectId resolved
// from that root). getDefaultMcpClient() with no arg keeps the cwd default.
const defaultInstances = new Map<string, McpClient>();
export function getDefaultMcpClient(projectRoot?: string): McpClient {
  const key = projectRoot ?? process.cwd();
  let inst = defaultInstances.get(key);
  if (!inst) {
    inst = new McpClient({ projectRoot: key });
    defaultInstances.set(key, inst);
  }
  return inst;
}
export function resetDefaultMcpClientForTests(): void {
  defaultInstances.clear();
}
