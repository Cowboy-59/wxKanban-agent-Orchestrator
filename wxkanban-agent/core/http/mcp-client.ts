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
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveServiceUrl } from "../context/runtime-state";

export interface McpClientOptions {
  baseUrl?: string;
  token?: string;
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

export function resolveApiToken(opts: { projectRoot?: string; env?: NodeJS.ProcessEnv } = {}): string | null {
  const env = opts.env ?? process.env;
  if (env["WXKANBAN_API_TOKEN"]) return env["WXKANBAN_API_TOKEN"];

  const root = opts.projectRoot ?? process.cwd();
  const kit = readKitBlock(root);
  if (kit?.apiToken) return kit.apiToken;

  const legacy = readLegacyTokenFile(root);
  if (legacy) return legacy;

  return null;
}

function maskToken(token: string): string {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 12)}…${token.slice(-4)}`;
}

export class McpClient {
  private readonly baseUrl: string;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly isHosted: boolean;

  constructor(opts: McpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? resolveServiceUrl("mcp", { projectRoot: opts.projectRoot })).replace(/\/+$/, "");
    this.token = opts.token ?? resolveApiToken({ projectRoot: opts.projectRoot });
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
    const body = JSON.stringify({ tool, args });

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
}

let defaultInstance: McpClient | null = null;
export function getDefaultMcpClient(): McpClient {
  if (!defaultInstance) defaultInstance = new McpClient();
  return defaultInstance;
}
export function resetDefaultMcpClientForTests(): void {
  defaultInstance = null;
}
