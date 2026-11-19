import { basename, dirname, isAbsolute, relative, resolve, sep } from "path";

// [SCOPE 148 / T010] BEGIN — the triage run's allow-list hook (SPEC-148 FR-005)
//
// A triage session reads every company's feedback, and every word of it was written by a
// customer. A report that says "run git push" or "email the reporter list" must not be able
// to make the session do it. So the run is fenced by an ALLOW-list: anything not named here
// is denied, logged and counted, and the fence is a PreToolUse hook — `canUseTool` is never
// consulted in bypassPermissions (see override-gate.ts, found live 2026-09-25).
//
// Deliberately narrower than "any path except secrets": reads stay inside the working tree.
// A triage run has no reason to read outside the repo, and refusing it removes a whole class
// of credential files (~/.ssh, ~/.aws, the CLI's own credentials) from consideration.

export interface TriageHookOptions {
  /** The repo root the run works in. Every path is resolved against it. */
  repoRoot: string;
  /** The MCP server name the run's tools are registered under (`mcp__<name>__…`). */
  mcpServer: string;
  /** Called once per blocked call, for the run log and the report's block count. */
  onBlock?: (block: TriageBlock) => void;
}

export interface TriageBlock {
  tool: string;
  reason: string;
}

export type TriageDecision = { allow: true } | { allow: false; reason: string };

const allow: TriageDecision = { allow: true };
const deny = (reason: string): TriageDecision => ({ allow: false, reason });

/** The folder a triage run may write to, relative to the repo root. */
export const TRIAGE_DIR = "docs/triage";

// ── secrets ───────────────────────────────────────────────────────────────────────────

const SECRET_BASENAME = [
  /^\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^\.?credentials(\..*)?$/i,
  /^\.(npmrc|netrc|pypirc|git-credentials)$/i,
];
const SECRET_SEGMENT = new Set([".wxai", ".ssh", ".aws", ".gnupg"]);

/** True when a repo-relative path names a secret file or sits under a secret folder. */
export function isSecretPath(rel: string): boolean {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (parts.some((p) => SECRET_SEGMENT.has(p.toLowerCase()))) return true;
  const name = parts[parts.length - 1] ?? "";
  return SECRET_BASENAME.some((re) => re.test(name));
}

/**
 * True when a glob PATTERN could select a secret. Patterns are not names (`.env*`), so this
 * looks for the secret forms anywhere in the pattern rather than matching it exactly.
 */
export function globReachesSecret(pattern: string): boolean {
  return (
    isSecretPath(pattern) ||
    /(^|[\\/{,])\.env/i.test(pattern) ||
    /\.(pem|key|p12|pfx)\b/i.test(pattern) ||
    /(^|[\\/{,])\.(wxai|ssh|aws|gnupg)\b/i.test(pattern) ||
    /id_(rsa|dsa|ecdsa|ed25519)|credentials|\.(npmrc|netrc|pypirc|git-credentials)\b/i.test(pattern)
  );
}

/** The path relative to the repo root, or null when it resolves outside the repo. */
function insideRepo(repoRoot: string, p: string): string | null {
  const abs = isAbsolute(p) ? resolve(p) : resolve(repoRoot, p);
  const rel = relative(resolve(repoRoot), abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
}

function checkReadPath(repoRoot: string, p: string): TriageDecision {
  const rel = insideRepo(repoRoot, p);
  if (rel === null) return deny(`outside the repository: ${p}`);
  if (isSecretPath(rel)) return deny(`secret path: ${p}`);
  return allow;
}

// ── Bash ──────────────────────────────────────────────────────────────────────────────

/** Characters that chain, redirect, substitute or background a command. */
const SHELL_CONTROL = /[|&;<>`\n\r]|\$\(|\$\{/;

/** Split a command line into words, honouring single and double quotes. Null if unbalanced. */
export function splitWords(cmd: string): string[] | null {
  const words: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let inWord = false;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inWord) words.push(cur);
      cur = "";
      inWord = false;
      continue;
    }
    cur += ch;
    inWord = true;
  }
  if (quote) return null;
  if (inWord) words.push(cur);
  return words;
}

const GIT_SUBCOMMANDS = new Set(["log", "show", "diff"]);
/** git options that write files, read outside the repo, or run other programs. */
const GIT_FORBIDDEN = [/^--output(=|$)/, /^--no-index$/, /^--ext-diff$/, /^--textconv$/, /^--exec/, /^-c$/, /^--config/];
/** rg options that lift the hidden/ignore filters or run other programs. */
const RG_FORBIDDEN = [
  /^--hidden$/,
  /^-\.$/,
  /^-u+$/,
  /^--unrestricted$/,
  /^--no-ignore/,
  /^--pre(=|$|-glob)/,
  /^-z$/,
  /^--search-zip$/,
  /^-L$/,
  /^--follow$/,
];

function checkBash(repoRoot: string, command: unknown): TriageDecision {
  if (typeof command !== "string" || !command.trim()) return deny("empty command");
  if (SHELL_CONTROL.test(command)) return deny("pipes, redirection, chaining and substitution are not allowed");
  const words = splitWords(command.trim());
  if (!words || words.length === 0) return deny("unparseable command");

  const [prog, ...args] = words;
  if (prog === "git") {
    const sub = args[0];
    if (!sub || !GIT_SUBCOMMANDS.has(sub)) return deny(`only git log, git show and git diff are allowed`);
    for (const a of args.slice(1)) {
      if (GIT_FORBIDDEN.some((re) => re.test(a))) return deny(`git option not allowed: ${a}`);
      // `<rev>:<path>` and plain paths: neither may name a secret.
      const pathPart = a.includes(":") ? a.slice(a.indexOf(":") + 1) : a;
      if (pathPart && !pathPart.startsWith("-") && isSecretPath(pathPart)) return deny(`secret path: ${a}`);
    }
    return allow;
  }
  if (prog === "rg") {
    for (const a of args) {
      if (RG_FORBIDDEN.some((re) => re.test(a))) return deny(`rg option not allowed: ${a}`);
      if (a.startsWith("-")) continue;
      // A non-option word is the pattern or a path; refuse any that reaches a secret or leaves the repo.
      if (isSecretPath(a)) return deny(`secret path: ${a}`);
      if (/[\\/]/.test(a) && insideRepo(repoRoot, a) === null) return deny(`outside the repository: ${a}`);
    }
    return allow;
  }
  return deny(`command not allowed: ${prog}`);
}

// ── the decision ──────────────────────────────────────────────────────────────────────

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** Decide one tool call. Pure, so every row of the allow-list is testable directly. */
export function decideTriageTool(
  toolName: string,
  rawInput: unknown,
  opts: Pick<TriageHookOptions, "repoRoot" | "mcpServer">,
): TriageDecision {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Record<string, unknown>;
  const { repoRoot } = opts;

  switch (toolName) {
    case "Read": {
      const p = str(input.file_path);
      return p ? checkReadPath(repoRoot, p) : deny("Read without a path");
    }
    case "Glob": {
      const p = str(input.path) ?? ".";
      const d = checkReadPath(repoRoot, p);
      if (!d.allow) return d;
      const pattern = str(input.pattern) ?? "";
      return globReachesSecret(pattern) ? deny(`secret pattern: ${pattern}`) : allow;
    }
    case "Grep": {
      // Grep returns file CONTENTS, and a search from the repo root would read tracked files
      // under .wxai/. So it must name a folder or file, and that path must not be the root.
      const p = str(input.path);
      if (!p) return deny("Grep must name a path inside the repository");
      const rel = insideRepo(repoRoot, p);
      if (rel === null) return deny(`outside the repository: ${p}`);
      if (rel === "") return deny("Grep may not search from the repository root; name a folder");
      if (isSecretPath(rel)) return deny(`secret path: ${p}`);
      const glob = str(input.glob);
      if (glob && globReachesSecret(glob)) return deny(`secret glob: ${glob}`);
      return allow;
    }
    case "Bash":
      return checkBash(repoRoot, input.command);
    case "Write": {
      const p = str(input.file_path);
      if (!p) return deny("Write without a path");
      const rel = insideRepo(repoRoot, p);
      if (rel === null) return deny(`outside the repository: ${p}`);
      // Directly under docs/triage/: not the folder itself, not a sub-folder.
      if (dirname(rel).split(sep).join("/") !== TRIAGE_DIR) return deny(`writes go only directly under ${TRIAGE_DIR}/`);
      if (!/\.md$/i.test(basename(rel))) return deny("the triage report is a .md file");
      return allow;
    }
    default:
      return decideMcp(toolName, input, opts.mcpServer);
  }
}

function decideMcp(toolName: string, input: Record<string, unknown>, server: string): TriageDecision {
  const prefix = `mcp__${server}__`;
  if (!toolName.startsWith(prefix)) return deny(`tool not allowed: ${toolName}`);
  const tool = toolName.slice(prefix.length).replace(/\./g, "_");

  if (tool === "project_list_my_feedback") return allow;
  if (tool !== "project_update_feedback_status") return deny(`tool not allowed: ${toolName}`);

  // SPEC-148 FR-009 / FR-010: two moves, never a note. The server enforces the templates,
  // the version guard and the audit row; this keeps the agent from even asking for more.
  if (input.note !== undefined) return deny("a triage run never sends a note");
  if (input.status === "triaged") {
    return input.resolutionTemplate === undefined ? allow : deny("triaged takes no template");
  }
  if (input.status === "resolved") {
    return typeof input.resolutionTemplate === "string" ? allow : deny("resolved needs a resolutionTemplate");
  }
  return deny(`a triage run may only set triaged or resolved, not ${String(input.status)}`);
}

interface PreToolUseLike {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
}

interface HookResultLike {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "deny";
    permissionDecisionReason: string;
  };
}

/**
 * The PreToolUse hook for a triage session. Registered with NO matcher, so it sees every
 * tool; it answers allow or deny for each, never "no opinion" — an allow-list that let an
 * unknown tool through by default would be a deny-list.
 */
export function createTriageHook(
  opts: TriageHookOptions,
): (input: PreToolUseLike, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<HookResultLike> {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const tool = input.tool_name ?? "";
    const d = decideTriageTool(tool, input.tool_input, opts);
    if (!d.allow) opts.onBlock?.({ tool, reason: d.reason });
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: d.allow ? "allow" : "deny",
        permissionDecisionReason: d.allow ? "Within the triage allow-list." : `Triage allow-list: ${d.reason}`,
      },
    };
  };
}
// [SCOPE 148 / T010] END
