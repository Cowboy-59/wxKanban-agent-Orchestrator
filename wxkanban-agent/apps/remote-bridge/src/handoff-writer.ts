import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { Logger } from "pino";
import { fetchProjectAgentSettings, lockPath, readProjectAgentConfig } from "./agent-mode";
import { readRefusal } from "./agent-status";
import { ensureHandoffGitignore } from "../../../core/handoff-gitignore"; // [SCOPE 149 / T003]
import { logHandoff } from "./handoff-log";

// [SCOPE 149 / T002] BEGIN — handoff format: folder, file name, fixed fields (FR-003, FR-005)
//
// The one shape both sides agree on. The writer renders it; the Project Agent's watcher
// (handoff-watch.ts) parses it back. A handoff is a short-lived local file, never a database
// record, and the session never posts it: the agent does, under its own tag.

/** Relative to the repo root. Git-ignored (T003). */
export const HANDOFF_DIR = join(".wxai", "handoff");
/** The summary's hard cap, marker included (FR-003). */
export const HANDOFF_MAX_CHARS = 2000;
export const TRUNCATED_MARKER = "...truncated";
/** `20261027T201500123Z.md`: a UTC timestamp to the millisecond. */
export const HANDOFF_NAME_RE = /^\d{8}T\d{9}Z\.md$/;

export const HANDOFF_FIELDS = [
  { key: "repoBranch", heading: "Repo and branch" },
  { key: "workingOn", heading: "Working on" },
  { key: "done", heading: "Done" },
  { key: "inFlight", heading: "In flight" },
  { key: "blocked", heading: "Blocked or waiting on a decision" },
  { key: "uncommitted", heading: "Uncommitted work" },
  { key: "nextStep", heading: "Next step" },
  { key: "resume", heading: "Where to resume" },
] as const;

export function handoffDir(repoRoot: string): string {
  return join(repoRoot, HANDOFF_DIR);
}

/** The file name for a handoff created at `d`. */
export function handoffFileName(d: Date): string {
  const iso = d.toISOString(); // 2026-10-27T20:15:00.123Z
  return `${iso.slice(0, 10).replace(/-/g, "")}T${iso.slice(11, 19).replace(/:/g, "")}${iso.slice(20, 23)}Z.md`;
}
// [SCOPE 149 / T002] END

// [SCOPE 149 / T002] BEGIN — redaction: mask, never block (FR-004)
//
// Anything that looks like a key, token, password or connection string becomes `[redacted]`
// before the file is written. Each pattern is replaced through a function, never a
// replacement string, so a `$` inside matched text can never be read as a pattern.
// Order matters: the widest shapes (private key blocks, URLs with credentials) go first so a
// narrower pattern never masks half of one and leaves the rest.

export const REDACTED = "[redacted]";

interface MaskRule {
  name: string;
  re: RegExp;
  /** The replacement for one match. Keeps a harmless label where it helps a reader. */
  mask: (match: string, ...groups: string[]) => string;
}

const MASK_RULES: MaskRule[] = [
  {
    name: "private-key",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    mask: () => REDACTED,
  },
  {
    // postgres://user:pass@host/db, mysql://…, redis://:pass@…, https://user:token@host — any URL with credentials.
    name: "connection-string",
    re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/]*:[^\s@/]+@[^\s'"`<>)]+/gi,
    mask: () => REDACTED,
  },
  {
    name: "bearer",
    re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
    mask: () => `Bearer ${REDACTED}`,
  },
  {
    // password=…, DB_PASSWORD: …, api_key = "…", secret: '…', token=…
    name: "assignment",
    re: /\b([A-Za-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_-]*)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
    mask: (_m: string, name: string, sep: string) => `${name}${sep}${REDACTED}`,
  },
  { name: "yca-token", re: /\byca_[A-Za-z0-9_-]{6,}/g, mask: () => REDACTED },
  {
    // Well-known key prefixes: OpenAI/Anthropic sk-, Stripe sk_/rk_/pk_live, GitHub, Slack, AWS, Google, JWTs.
    name: "prefixed-key",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g,
    mask: () => REDACTED,
  },
  {
    // A bare random token (e.g. the kit's 43-character base64url API token). Mixed case AND a
    // digit, 32+ characters, so commit SHAs (lower-case hex) and ordinary words are left alone.
    name: "opaque-token",
    re: /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}\b/g,
    mask: () => REDACTED,
  },
];

/** Mask secrets in `text`. Returns the masked text and how many items were masked. */
export function redactSecrets(text: string): { text: string; masked: number } {
  let masked = 0;
  let out = text;
  for (const rule of MASK_RULES) {
    out = out.replace(rule.re, (match: string, ...rest: unknown[]) => {
      // A match that is already only the mask (or a label plus the mask) is not a new secret.
      if (match === REDACTED) return match;
      const groups = rest.filter((g): g is string => typeof g === "string");
      const replaced = rule.mask(match, ...groups);
      if (replaced !== match) masked += 1;
      return replaced;
    });
  }
  return { text: out, masked };
}
// [SCOPE 149 / T002] END

// [SCOPE 149 / T002] BEGIN — fixed template: every field, 'none' when empty, no file bodies (FR-003)

/** What the session composes. Every field is optional; unknown keys are ignored. */
export interface HandoffInput {
  repo?: string;
  branch?: string;
  workingOn?: string | string[];
  done?: string | string[];
  inFlight?: string | string[];
  blocked?: string | string[];
  /** Counts and file NAMES only: a string, or { count, files }. */
  uncommitted?: string | { count?: number; files?: string[] };
  nextStep?: string | string[];
  resume?: string | string[];
}

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_FILE_NAMES = 50;
const FILE_NAME_RE = /^[^\r\n\t]{1,260}$/;
const DIFF_MARKER_RE = /^(?:diff --git |@@ [^\n]*@@|\+\+\+ |--- (?:a\/|b\/|\/dev\/null))/m;
const DIFF_LINE_RE = /^(?:diff --git |index [0-9a-f]{6,}|@@ |\+\+\+ |--- |[+-]|\\ No newline)/;

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((x) => `- ${x.trim()}`)
      .join("\n");
  }
  return "";
}

/**
 * Remove file bodies and diffs from a field (FR-003). Fenced code blocks are dropped whole;
 * a field that carries a diff header loses its diff lines. Names and counts survive.
 */
export function stripContents(text: string): string {
  let out = text.replace(/```[\s\S]*?(?:```|$)/g, "[file content removed]");
  if (DIFF_MARKER_RE.test(out)) {
    const kept = out.split(/\r?\n/).filter((line) => !DIFF_LINE_RE.test(line));
    kept.push("[diff removed]");
    out = kept.join("\n");
  }
  return out.trim();
}

function uncommittedText(v: HandoffInput["uncommitted"]): string {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return "";
  const files = Array.isArray(v.files)
    ? v.files.filter((f): f is string => typeof f === "string" && FILE_NAME_RE.test(f.trim())).map((f) => f.trim())
    : [];
  const count = typeof v.count === "number" && Number.isFinite(v.count) ? Math.max(0, Math.trunc(v.count)) : files.length;
  if (count === 0 && files.length === 0) return "";
  const shown = files.slice(0, MAX_FILE_NAMES);
  const more = files.length > shown.length ? `\n- …and ${files.length - shown.length} more` : "";
  return `${count} file${count === 1 ? "" : "s"}${shown.length ? `:\n${shown.map((f) => `- ${f}`).join("\n")}${more}` : ""}`;
}

/** Validate raw JSON input at the boundary. Anything not an object is an empty handoff. */
export function parseHandoffInput(raw: unknown): HandoffInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof r[k] === "string" ? (r[k] as string) : undefined);
  const strOrList = (k: string): string | string[] | undefined => {
    const v = r[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    return undefined;
  };
  let uncommitted: HandoffInput["uncommitted"];
  const u = r.uncommitted;
  if (typeof u === "string") uncommitted = u;
  else if (u && typeof u === "object" && !Array.isArray(u)) {
    const uo = u as Record<string, unknown>;
    uncommitted = {
      count: typeof uo.count === "number" ? uo.count : undefined,
      files: Array.isArray(uo.files) ? uo.files.filter((x): x is string => typeof x === "string") : undefined,
    };
  }
  return {
    repo: str("repo"),
    branch: str("branch"),
    workingOn: strOrList("workingOn"),
    done: strOrList("done"),
    inFlight: strOrList("inFlight"),
    blocked: strOrList("blocked"),
    uncommitted,
    nextStep: strOrList("nextStep"),
    resume: strOrList("resume"),
  };
}

/** The input size cap, so a runaway session cannot hand the writer megabytes. */
export function readHandoffInput(text: string): HandoffInput {
  if (Buffer.byteLength(text, "utf-8") > MAX_INPUT_BYTES) {
    throw new Error(`handoff input is over ${MAX_INPUT_BYTES / 1024} KB`);
  }
  return parseHandoffInput(text.trim() ? (JSON.parse(text) as unknown) : {});
}

/** Render the body (the fields), before masking and the cap. */
export function renderFields(input: HandoffInput): string {
  const value = (key: (typeof HANDOFF_FIELDS)[number]["key"]): string => {
    switch (key) {
      case "repoBranch": {
        const repo = (input.repo ?? "").trim();
        const branch = (input.branch ?? "").trim();
        return repo || branch ? `${repo || "none"} · branch ${branch || "none"}` : "";
      }
      case "uncommitted":
        return stripContents(uncommittedText(input.uncommitted));
      default:
        return stripContents(asText(input[key]));
    }
  };
  return HANDOFF_FIELDS.map((f) => `## ${f.heading}\n${value(f.key) || "none"}`).join("\n\n");
}

/** Cap at HANDOFF_MAX_CHARS, ending with a visible marker line when cut. */
export function capSummary(doc: string): string {
  if (doc.length <= HANDOFF_MAX_CHARS) return doc;
  const room = HANDOFF_MAX_CHARS - TRUNCATED_MARKER.length - 1;
  return `${doc.slice(0, room).trimEnd()}\n${TRUNCATED_MARKER}`;
}

/** The full file: a header the agent reads (created-at, masked count), then the fields. */
export function renderHandoff(input: HandoffInput, createdAt: Date): { doc: string; masked: number } {
  const { text, masked } = redactSecrets(renderFields(input));
  const doc = capSummary(`created-at: ${createdAt.toISOString()}\nmasked: ${masked}\n\n${text}\n`);
  return { doc, masked };
}
// [SCOPE 149 / T002] END

// [SCOPE 149 / T002] BEGIN — preflight: the room can be used and the Project Agent is running (FR-002)
//
// Three causes, each named in one plain line with its fix, and nothing written when any of
// them holds (T001, owner decision B / T010):
//   Allow remote off       GET /api/project-agent/settings (read-only, the existing route)
//   agent running          .wxai/remote-session.lock held by a live pid whose owner is the project agent
//   why it is not running  .wxai/project-agent-status.json, the refusal the agent recorded (T010)
// A live agent wins over a recorded refusal: the file is stale once an agent has started.
// The writer never calls POST /api/project-agent/room — that mints a new MCP token and
// revokes the running agent's.

export type BlockedCause =
  | "no_token"
  | "settings_unreachable"
  | "remote_not_allowed"
  | "no_company_account"
  | "worktree_locked"
  | "agent_not_running";

export type PreflightResult = { ok: true } | { ok: false; cause: BlockedCause; line: string };

export interface PreflightDeps {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  /** Is this pid alive? Injected for tests. */
  pidAlive?: (pid: number) => boolean;
}

const START_FIX = "start it from the Dev Cockpit (Project Agent), or run `npm run project-agent` in wxkanban-agent/";

export const BLOCKED_LINES: Record<BlockedCause, string> = {
  no_token:
    "Handoff stopped: this project has no wxKanban kit API token. Fix: run `wxkanban-agent kit:configure --token <token>`, then try again.",
  settings_unreachable:
    "Handoff stopped: could not check this project's Allow remote setting with wxKanban. Fix: check the connection and the project's kit token, then try again.",
  remote_not_allowed:
    "Handoff stopped: Allow remote is off for this project. Fix: a company ADMIN or the project's TEAM_MANAGER turns on Allow remote in the project's Kit tab in wxKanban.",
  no_company_account:
    "Handoff stopped: your company has no YappChatt account, so the Project Agent cannot open the project room. Fix: start the Project Agent from the Dev Cockpit and accept creating the company YappChatt account, or ask a company ADMIN to set it up.",
  worktree_locked:
    `Handoff stopped: the Project Agent could not start because another session holds this working tree. Fix: end that session, then ${START_FIX}.`,
  agent_not_running: `Handoff stopped: the Project Agent is not running. Fix: ${START_FIX}.`,
};

function defaultPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** True when the worktree lock is held by a live project agent. */
export function projectAgentLive(repoRoot: string, pidAlive: (pid: number) => boolean = defaultPidAlive): boolean {
  const path = lockPath(repoRoot);
  if (!existsSync(path)) return false;
  try {
    const held = JSON.parse(readFileSync(path, "utf-8")) as { pid?: unknown; owner?: unknown };
    return typeof held.pid === "number" && held.owner === "project agent" && pidAlive(held.pid);
  } catch {
    return false;
  }
}

function blocked(cause: BlockedCause): PreflightResult {
  return { ok: false, cause, line: BLOCKED_LINES[cause] };
}

export async function preflight(deps: PreflightDeps): Promise<PreflightResult> {
  let cfg: ReturnType<typeof readProjectAgentConfig>;
  try {
    cfg = readProjectAgentConfig(["--project-agent"], deps.env, deps.repoRoot);
  } catch {
    return blocked("no_token");
  }
  if (!cfg) return blocked("no_token");

  let allowRemote: boolean;
  try {
    allowRemote = (await fetchProjectAgentSettings(cfg)).allowRemote;
  } catch {
    return blocked("settings_unreachable");
  }
  if (!allowRemote) return blocked("remote_not_allowed");

  if (projectAgentLive(deps.repoRoot, deps.pidAlive)) return { ok: true };

  const refusal = readRefusal(deps.repoRoot);
  switch (refusal?.refused) {
    case "no_company_account":
      return blocked("no_company_account");
    case "worktree_locked":
      return blocked("worktree_locked");
    // remote_not_allowed is recorded, but the settings call above just said remote is on:
    // the agent refused before it was turned on and has not been started since.
    default:
      return blocked("agent_not_running");
  }
}
// [SCOPE 149 / T002] END

// [SCOPE 149 / T002] BEGIN — the handoff run: preflight, render, write exactly one file (FR-001 – FR-005)
// MODIFIED-BY: [SCOPE 149 / T003] — ensures the .gitignore entries before the first handoff is written (FR-005)

export interface HandoffRunDeps extends PreflightDeps {
  now?: () => Date;
  logger?: Logger;
}

export type HandoffRunResult =
  | { ok: true; line: string; relPath: string; masked: number }
  | { ok: false; line: string; cause: BlockedCause };

/** Write the file atomically: a dot-temp in the same folder (ignored by the watcher), then rename. */
function writeOne(repoRoot: string, createdAt: Date, doc: string): string {
  // An existing project gets the ignore entries at the moment it first needs them, the same
  // way entitlement-cache.ts ensures its own entry when it writes its file. Never creates a
  // .gitignore, never throws.
  ensureHandoffGitignore(repoRoot);
  const dir = handoffDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  let at = createdAt.getTime();
  let name = handoffFileName(new Date(at));
  while (existsSync(join(dir, name))) name = handoffFileName(new Date(++at));
  const tmp = join(dir, `.${name}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, doc, { encoding: "utf-8", flag: "wx", mode: 0o600 });
    renameSync(tmp, join(dir, name));
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    throw err;
  }
  return name;
}

/**
 * The whole command. Never posts to the room, never reads .env, launches no process: it
 * writes one file and the running Project Agent posts it.
 */
export async function runHandoff(input: HandoffInput, deps: HandoffRunDeps): Promise<HandoffRunResult> {
  const pre = await preflight(deps);
  if (!pre.ok) return { ok: false, line: pre.line, cause: pre.cause };

  const createdAt = (deps.now ?? (() => new Date()))();
  const { doc, masked } = renderHandoff(input, createdAt);
  const name = writeOne(deps.repoRoot, createdAt, doc);
  const relPath = `.wxai/handoff/${name}`;
  if (masked > 0 && deps.logger) {
    logHandoff(deps.logger, "masked", { createdAt: createdAt.toISOString(), masked, chars: doc.length });
  }
  return {
    ok: true,
    relPath,
    masked,
    line: `Handoff written: ${relPath} (${masked} item${masked === 1 ? "" : "s"} masked). The Project Agent will post it to the room.`,
  };
}
// [SCOPE 149 / T002] END

// [SCOPE 149 / T002] BEGIN — the preflight's token keys from the repo's .env (FR-002, amended 2026-10-28)
const ENV_FILE_KEYS: readonly string[] = ["WXKANBAN_API_TOKEN", "WXKANBAN_APP_BASE_URL", "WXKANBAN_MCP_URL"];

/**
 * The environment the preflight runs with: `env`, plus ENV_FILE_KEYS from the repo's `.env` where
 * `env` has none. The Project Agent loads the same file at start (main.ts loadRepoEnv), so the
 * writer and the agent agree on the token. No other key is read and `env` is not changed.
 */
export function preflightEnv(repoRoot: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  const path = join(repoRoot, ".env");
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!m || !ENV_FILE_KEYS.includes(m[1]) || out[m[1]] !== undefined) continue;
    out[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
// [SCOPE 149 / T002] END
