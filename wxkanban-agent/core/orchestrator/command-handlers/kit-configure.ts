/**
 * Spec 028 / T020 — `wxkanban-agent kit:configure` command handler.
 *
 * Writes the three hosted-MCP fields into `.wxai/project.json` (default) or
 * `.env` (when `--write-to=.env`). Token is never echoed in full to stdout.
 *
 * Exit codes:
 *   0 — write succeeded
 *   1 — runtime / I/O error
 *   2 — invalid args (malformed token, bad URL, etc.)
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

const TOKEN_RE = /^wxk_(live|test)_[a-f0-9]{64}$/;
const HOSTED_RE = /^https:\/\/.+/i;

export interface KitConfigureArgs {
  token: string;
  projectId: string;
  mcpUrl?: string;
  writeTo?: ".wxai" | ".env";
  projectRoot?: string;
}

export interface KitConfigureResult {
  exitCode: 0 | 1 | 2;
  message: string;
  writtenTo: string | null;
}

function maskToken(t: string): string {
  if (t.length <= 12) return "***";
  return `${t.slice(0, 12)}…${t.slice(-4)}`;
}

function atomicWriteJson(filePath: string, json: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(json, null, 2) + "\n", { encoding: "utf-8" });
  renameSync(tmp, filePath);
}

function mergeKitBlock(existing: unknown, block: { mcpBaseUrl: string; apiToken: string; projectId: string }): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  base.kit = { ...((base.kit as Record<string, unknown> | undefined) ?? {}), ...block };
  return base;
}

function writeToProjectJson(projectRoot: string, block: { mcpBaseUrl: string; apiToken: string; projectId: string }): string {
  const path = join(projectRoot, ".wxai", "project.json");
  const existing = existsSync(path) ? safeReadJson(path) : null;
  const next = mergeKitBlock(existing, block);
  atomicWriteJson(path, next);
  return path;
}

function safeReadJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeToEnv(projectRoot: string, block: { mcpBaseUrl: string; apiToken: string; projectId: string }): string {
  const path = join(projectRoot, ".env");
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = existing.split(/\r?\n/);
  const replace = (key: string, value: string): void => {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const entry = `${key}=${value}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);
  };
  replace("MCP_BASE_URL", block.mcpBaseUrl);
  replace("WXKANBAN_API_TOKEN", block.apiToken);
  replace("WXKANBAN_PROJECT_ID", block.projectId);
  // Atomic via tmp + rename
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, lines.filter((l, i) => i < lines.length - 1 || l !== "").join("\n") + "\n", "utf-8");
  renameSync(tmp, path);
  return path;
}

export function handleKitConfigureCommand(args: KitConfigureArgs): KitConfigureResult {
  const mcpUrl = args.mcpUrl ?? "https://mcp.wxperts.com";
  const projectRoot = args.projectRoot ?? process.cwd();

  if (!TOKEN_RE.test(args.token)) {
    return {
      exitCode: 2,
      writtenTo: null,
      message: `kit:configure: token does not match wxk_(live|test)_<64hex> (got ${maskToken(args.token)}).`,
    };
  }
  if (!HOSTED_RE.test(mcpUrl)) {
    return {
      exitCode: 2,
      writtenTo: null,
      message: `kit:configure: --mcp-url must start with https:// (got ${mcpUrl}).`,
    };
  }
  if (!args.projectId || args.projectId.length < 8) {
    return {
      exitCode: 2,
      writtenTo: null,
      message: `kit:configure: --project-id is required and must look like a UUID.`,
    };
  }

  const block = { mcpBaseUrl: mcpUrl, apiToken: args.token, projectId: args.projectId };
  const target = args.writeTo ?? ".wxai";

  try {
    const written = target === ".env" ? writeToEnv(projectRoot, block) : writeToProjectJson(projectRoot, block);
    return {
      exitCode: 0,
      writtenTo: written,
      message:
        `kit:configure: wrote hosted-MCP config to ${written}\n` +
        `  mcpBaseUrl: ${block.mcpBaseUrl}\n` +
        `  projectId:  ${block.projectId}\n` +
        `  apiToken:   ${maskToken(block.apiToken)}`,
    };
  } catch (err) {
    return {
      exitCode: 1,
      writtenTo: null,
      message: `kit:configure: write failed — ${(err as Error).message}`,
    };
  }
}
