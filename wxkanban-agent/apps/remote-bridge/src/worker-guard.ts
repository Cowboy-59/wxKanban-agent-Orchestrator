// Hard blocks for workers (SPEC-159 FR-021). Four things a worker may never do: git push,
// git commit, ledger append, and a task reassign. Text matching alone is not the guard: the
// bridge marks each worker process (WXAI_WORKER=1), puts a git shim first on PATH, installs a
// reference-transaction hook, and strips push credentials. Pure: no I/O except the file writers.

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// [SCOPE 159 / T007] BEGIN — Worker process mark, environment and refusal counter (FR-021)
export const WORKER_MARK_ENV = "WXAI_WORKER";
/** Environment variables that let a push authenticate; a worker never carries them. */
export const STRIPPED_CREDENTIAL_ENV = ["GIT_ASKPASS", "SSH_ASKPASS", "SSH_AUTH_SOCK", "GIT_SSH_COMMAND", "GH_TOKEN", "GITHUB_TOKEN"] as const;

export type BlockedAction = "git_push" | "git_commit" | "ledger_append" | "task_reassign";

/** True when the process carries the worker mark. */
export function isWorkerProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WORKER_MARK_ENV] === "1";
}

/** The environment for a worker process: marked, shim first on PATH, push credentials removed. */
export function buildWorkerEnv(base: NodeJS.ProcessEnv, shimDir: string, pathSep = process.platform === "win32" ? ";" : ":"): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, [WORKER_MARK_ENV]: "1" };
  for (const k of STRIPPED_CREDENTIAL_ENV) delete env[k];
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = `${shimDir}${pathSep}${env[pathKey] ?? ""}`;
  return env;
}

export interface BlockedAttempt {
  action: BlockedAction;
  worker: string;
  at: string;
  via: string;
}

/** Every denied attempt, counted and logged with the worker identity. */
export class BlockLog {
  private readonly rows: BlockedAttempt[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  record(action: BlockedAction, worker: string, via: string): BlockedAttempt {
    const row = { action, worker, via, at: this.now().toISOString() };
    this.rows.push(row);
    return row;
  }

  count(action?: BlockedAction): number {
    return action ? this.rows.filter((r) => r.action === action).length : this.rows.length;
  }

  all(): BlockedAttempt[] {
    return [...this.rows];
  }
}
// [SCOPE 159 / T007] END

// [SCOPE 159 / T007] BEGIN — Worker tool-call classifier for the PreToolUse hook (FR-021)
const SEGMENT_SPLIT = /&&|\|\||;|\||\n|`|\$\(|\)/;
const GIT_SUB = /(?:^|[\s"'])git(?:\.exe)?\s+(?:-[A-Za-z]\S*\s+(?:\S+\s+)?|--\S+\s+)*(commit|push)(?:\s|$|["'])/;
const LEDGER_APPEND = /ledger\.mjs["']?\s+append\b/;
// A script reached by name still gets caught at the process layer; these catch the obvious wrappers.
const WRAPPER_RUN = /(?:node|npm|npx|pnpm|yarn|sh|bash|zsh|pwsh|powershell|cmd)\b/;

/** Classify one Bash command line. Returns the first blocked action found, or null. */
export function classifyBashCommand(command: string): BlockedAction | null {
  // Unwrap `bash -c "..."`, `sh -c '...'`, `cmd /c ...`, `powershell -Command ...` bodies too.
  const bodies = [command];
  for (const m of command.matchAll(/(?:-c|-Command|\/c)\s+(["'])([\s\S]*?)\1/gi)) bodies.push(m[2] ?? "");
  for (const body of bodies) {
    for (const seg of body.split(SEGMENT_SPLIT)) {
      const g = GIT_SUB.exec(seg);
      if (g) return g[1] === "push" ? "git_push" : "git_commit";
      if (LEDGER_APPEND.test(seg)) return "ledger_append";
    }
  }
  return null;
}

/** An MCP tool call that changes who a task is assigned to (ruled T001: carries assignedToId). */
export function isReassignCall(toolName: string, input: unknown): boolean {
  if (!/(^|__)project[._]update_task$/.test(toolName)) return false;
  return typeof input === "object" && input !== null && "assignedToId" in (input as Record<string, unknown>);
}

export interface WorkerToolCall {
  tool: string;
  input: unknown;
}

/** Decide one worker tool call. Null means allowed; the Manager's own calls never come here. */
export function classifyWorkerCall(call: WorkerToolCall): BlockedAction | null {
  if (isReassignCall(call.tool, call.input)) return "task_reassign";
  if (call.tool === "Bash" || call.tool === "PowerShell") {
    const cmd = (call.input as { command?: unknown } | null)?.command;
    if (typeof cmd === "string") return classifyBashCommand(cmd);
  }
  return null;
}

export const DENY_REASON: Record<BlockedAction, string> = {
  git_push: "Workers may not push. The Manager and the owner do.",
  git_commit: "Workers may not commit. The Manager and the owner do.",
  ledger_append: "Workers may not append to the decision ledger. It takes only an owner-approved append.",
  task_reassign: "Workers may not reassign a task. The Manager does.",
};

/** A PreToolUse hook callback: denies the four, logs each, allows the rest. */
export function makeWorkerPreToolUseHook(workerId: string, log: BlockLog) {
  return async (input: { tool_name?: string; tool_input?: unknown }): Promise<Record<string, unknown>> => {
    const hit = classifyWorkerCall({ tool: input.tool_name ?? "", input: input.tool_input });
    if (!hit) return {};
    log.record(hit, workerId, "pretooluse");
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: DENY_REASON[hit],
      },
    };
  };
}

/** A process-layer guard (git shim, ledger script, reassign path): refuse when the mark is present. */
export function refuseIfWorker(action: BlockedAction, env: NodeJS.ProcessEnv, log?: BlockLog, worker = "unknown"): string | null {
  if (!isWorkerProcess(env)) return null;
  log?.record(action, worker, "process-mark");
  return DENY_REASON[action];
}

// Keep the wrapper regex referenced so a future caller can test a "runs a script" hint.
export function looksLikeScriptRun(command: string): boolean {
  return WRAPPER_RUN.test(command);
}
// [SCOPE 159 / T007] END

// [SCOPE 159 / T007] BEGIN — git shim and reference-transaction hook writers (FR-021)
/** POSIX shim: with the mark set, refuse commit and push (even with --no-verify); else run real git. */
export function gitShimSource(realGit: string): string {
  return [
    "#!/bin/sh",
    `if [ "$${WORKER_MARK_ENV}" = "1" ]; then`,
    '  for a in "$@"; do',
    '    case "$a" in',
    "      commit|push)",
    '        echo "git $a refused: workers may not commit or push (SPEC-159 FR-021)" >&2',
    "        exit 1 ;;",
    "    esac",
    "  done",
    "fi",
    `exec "${realGit}" "$@"`,
    "",
  ].join("\n");
}

/** Windows shim (git.cmd) with the same rule. */
export function gitShimCmdSource(realGit: string): string {
  return [
    "@echo off",
    `if "%${WORKER_MARK_ENV}%"=="1" (`,
    "  for %%a in (%*) do (",
    '    if /I "%%a"=="commit" (echo git commit refused: workers may not commit or push 1>&2 & exit /b 1)',
    '    if /I "%%a"=="push" (echo git push refused: workers may not commit or push 1>&2 & exit /b 1)',
    "  )",
    ")",
    `"${realGit}" %*`,
    "",
  ].join("\r\n");
}

/** reference-transaction hook: --no-verify does not skip it; refuses any heads/tags change when marked. */
export function referenceTransactionHookSource(): string {
  return [
    "#!/bin/sh",
    '[ "$1" = "prepared" ] || exit 0',
    `[ "$${WORKER_MARK_ENV}" = "1" ] || exit 0`,
    "while read old new ref; do",
    '  case "$ref" in',
    "    refs/heads/*|refs/tags/*)",
    '      echo "ref change refused: workers may not move branches or tags (SPEC-159 FR-021)" >&2',
    "      exit 1 ;;",
    "  esac",
    "done",
    "exit 0",
    "",
  ].join("\n");
}

/** Find the real git on PATH, skipping the shim directory. Falls back to plain "git". */
export function resolveRealGit(env: NodeJS.ProcessEnv, skipDir: string): string {
  const sep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  const pathVal = env[Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH"] ?? "";
  for (const dir of pathVal.split(sep)) {
    if (!dir || dir === skipDir) continue;
    for (const e of exts) {
      const p = join(dir, `git${e}`);
      if (existsSync(p)) return p;
    }
  }
  return "git";
}

/** The one block log for every worker this process launches. */
export const workerBlocks = new BlockLog();

/** Worker env for a repo: shims installed under .wxai/worker-bin, real git resolved first. */
export function workerEnv(base: NodeJS.ProcessEnv, repoRoot: string): NodeJS.ProcessEnv {
  const shimDir = join(repoRoot, ".wxai", "worker-bin");
  const realGit = resolveRealGit(base, shimDir);
  installWorkerShims(shimDir, realGit);
  return buildWorkerEnv(base, shimDir);
}

/** Write the shims into a directory the bridge owns and return it for buildWorkerEnv. */
export function installWorkerShims(dir: string, realGit: string): string {
  mkdirSync(dir, { recursive: true });
  const sh = join(dir, "git");
  writeFileSync(sh, gitShimSource(realGit), "utf8");
  try {
    chmodSync(sh, 0o755);
  } catch {
    // not supported on every file system; the .cmd shim covers Windows
  }
  writeFileSync(join(dir, "git.cmd"), gitShimCmdSource(realGit), "utf8");
  return dir;
}
// [SCOPE 159 / T007] END
