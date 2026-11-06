/**
 * Spec 028 / T020 — `wxkanban-agent kit:configure` command handler.
 *
 * Writes the three hosted-MCP fields into `.wxai/project.json` (default) or
 * `.env` (when `--write-to=.env`). Token is never echoed in full to stdout.
 *
 * SPEC-143 T026: then stores the same project token on this machine for the agent-run forwarder
 * and installs the routing hooks (best effort; see setUpAgentRunForwarding).
 *
 * Exit codes:
 *   0 — write succeeded
 *   1 — runtime / I/O error
 *   2 — invalid args (malformed token, bad URL, etc.)
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";

// [SCOPE 095 / T004] Accept the real minted token format. generateApiToken() emits
// crypto.randomBytes(32).toString('base64url') → ~43 URL-safe chars with no prefix;
// the aspirational wxk_(live|test)_<64hex> form is kept for forward-compat. The prior
// regex accepted only the latter and so rejected every real token, breaking the
// documented `kit:configure` repair path.
const TOKEN_RE = /^(wxk_(live|test)_[a-f0-9]{64}|[A-Za-z0-9_-]{20,})$/;
const HOSTED_RE = /^https:\/\/.+/i;

export interface KitConfigureArgs {
  token: string;
  projectId: string;
  mcpUrl?: string;
  writeTo?: ".wxai" | ".env";
  projectRoot?: string;
  noSessionDefaults?: boolean;
  noRescueTokens?: boolean;
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

// [SCOPE 143 / T026] BEGIN — store the agent-run token on this machine and install the routing hooks (FR-018)
/**
 * After the config is written: hand the same project API token to `_wxAI/routing/token-store.mjs`
 * (stdin, never argv) so the agent-run forwarder can send runs from this machine, and run
 * `_wxAI/routing/install.mjs` (an idempotent hook merge). Both are best effort: a project without
 * the routing kit, or a failure here, never fails kit:configure. The lines returned never carry
 * the token.
 */
export function setUpAgentRunForwarding(projectRoot: string, projectId: string, token: string): string[] {
  const routing = join(projectRoot, "_wxAI", "routing");
  const store = join(routing, "token-store.mjs");
  const install = join(routing, "install.mjs");
  if (!existsSync(store) || !existsSync(install)) return [];
  const lines: string[] = [];
  const saved = spawnSync(process.execPath, [store, "--save", "--project", projectId, "--root", projectRoot], {
    input: token,
    encoding: "utf-8",
    windowsHide: true,
    timeout: 15_000,
  });
  lines.push(
    saved.status === 0
      ? "  agent runs: project token stored on this machine (~/.wxai/agentrun-tokens.json)"
      : `  agent runs: token NOT stored — ${(saved.stderr || saved.error?.message || "unknown error").trim()}`,
  );
  const hooked = spawnSync(process.execPath, [install, "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 15_000 });
  lines.push(
    hooked.status === 0
      ? `  routing hooks: ${(hooked.stdout || "installed").trim()}`
      : `  routing hooks: NOT installed — ${(hooked.stderr || hooked.error?.message || "unknown error").trim()}`,
  );
  return lines;
}
// [SCOPE 143 / T026] END

// [SCOPE 143 / T027] BEGIN — kit session defaults on init (FR-020)
/**
 * Best effort, never fatal: set CLAUDE_CODE_DISABLE_1M_CONTEXT and model in the owner's
 * `.claude/settings.json`, but only where FR-020's installer finds both unset (project, project
 * settings.local.json, or the owner's own `~/.claude/settings.json`). Skipped entirely when the
 * project has no `_wxAI/kit/` (older kit) or `--no-session-defaults` was passed.
 */
export function setUpSessionDefaults(projectRoot: string, skip: boolean): string[] {
  if (skip) return ["  session defaults: skipped (--no-session-defaults)"];
  const installer = join(projectRoot, "_wxAI", "kit", "install-session-defaults.mjs");
  if (!existsSync(installer)) return [];
  const result = spawnSync(process.execPath, [installer, "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 15_000 });
  if (result.status !== 0) {
    return [`  session defaults: NOT set — ${(result.stderr || result.error?.message || "unknown error").trim()}`];
  }
  return (result.stdout || "").trim().split(/\r?\n/).map((l) => `  ${l}`);
}
// [SCOPE 143 / T027] END

// [SCOPE 153 / T006] BEGIN — adds the rescue-tokens global installer alongside setUpSessionDefaults
/**
 * Runs `_wxAI/kit/install-rescue-tokens.mjs --root <projectRoot>` (best effort, never fatal to
 * kit:configure). Installs the rescue-tokens skill + its SessionStart hook into the operator's
 * global `~/.claude/` profile. Skipped entirely when the project has no `_wxAI/kit/` installer
 * (older kit) or `--no-rescue-tokens` was passed.
 */
export function setUpRescueTokens(projectRoot: string, skip: boolean): string[] {
  if (skip) return ["  rescue-tokens: skipped (--no-rescue-tokens)"];
  const installer = join(projectRoot, "_wxAI", "kit", "install-rescue-tokens.mjs");
  if (!existsSync(installer)) return [];
  const result = spawnSync(process.execPath, [installer, "--root", projectRoot], { encoding: "utf-8", windowsHide: true, timeout: 15_000 });
  if (result.status !== 0) {
    return [`  rescue-tokens: NOT set — ${(result.stderr || result.error?.message || "unknown error").trim()}`];
  }
  return (result.stdout || "").trim().split(/\r?\n/).map((l) => `  ${l}`);
}
// [SCOPE 153 / T006] END

export function handleKitConfigureCommand(args: KitConfigureArgs): KitConfigureResult {
  const mcpUrl = args.mcpUrl ?? "https://mcp.wxperts.com";
  const projectRoot = args.projectRoot ?? process.cwd();

  if (!TOKEN_RE.test(args.token)) {
    return {
      exitCode: 2,
      writtenTo: null,
      // [SCOPE 141 / T027] The old "Admin → Projects → API tokens" screen no longer exists.
      message: `kit:configure: token does not look like a wxKanban API token — expected the token shown when you download the kit (web app → your project → Kit tab → Generate Kit, then Download Kit) (got ${maskToken(args.token)}).`,
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
    // [SCOPE 143 / T026] the agent-run forwarder's token and hooks (best effort, never fatal)
    const forwarding = setUpAgentRunForwarding(projectRoot, block.projectId, block.apiToken);
    // [SCOPE 143 / T027] the kit's session defaults (best effort, never fatal)
    const sessionDefaults = setUpSessionDefaults(projectRoot, args.noSessionDefaults === true);
    // [SCOPE 153 / T006] MODIFIED-BY — best-effort, never fatal to kit:configure
    const rescueTokens = setUpRescueTokens(projectRoot, args.noRescueTokens === true);
    const extraLines = [...forwarding, ...sessionDefaults, ...rescueTokens];
    return {
      exitCode: 0,
      writtenTo: written,
      message:
        `kit:configure: wrote hosted-MCP config to ${written}\n` +
        `  mcpBaseUrl: ${block.mcpBaseUrl}\n` +
        `  projectId:  ${block.projectId}\n` +
        `  apiToken:   ${maskToken(block.apiToken)}` +
        (extraLines.length ? `\n${extraLines.join("\n")}` : ""),
    };
  } catch (err) {
    return {
      exitCode: 1,
      writtenTo: null,
      message: `kit:configure: write failed — ${(err as Error).message}`,
    };
  }
}
