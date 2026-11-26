import { join } from "path";
import { unlinkSync } from "fs";
import pino, { type DestinationStream, type Logger } from "pino";
import { formatCommandList, normalizeCommandText, resolveCommand, type CommandEntry } from "./command-set";
import { HandoffWatcher, type HandoffFile, type WatchFormat } from "./handoff-watch";
import { handoffFileName, projectAgentLive, writeOne } from "./handoff-writer";
import { logHandoff } from "./handoff-log";
import { statusFromDisk } from "./status-source"; // [SCOPE 159 / T023]
import { readStatusMemory } from "./status-source"; // [SCOPE 159 / T024]
import { loadAutopilotState } from "./autopilot-skip"; // [SCOPE 159 / T024]
import { formatStartupList, NO_DEVPLAN_MESSAGE, NOTHING_TO_DO_MESSAGE } from "./autopilot-startup"; // [SCOPE 159 / T024]

// [SCOPE 159 / T022] BEGIN — The local command lane: folder, file format and the Project Agent's watcher (FR-095)
//
// The local Claude session's one way into the running Project Agent. The session runs
// bin/agent-command.mjs with a listed command; the writer drops one small file into
// `.wxai/command/` (git-ignored like the handoff folder); the agent's lane watcher reads it,
// deletes it, resolves the text through the one command list (command-set.ts) and hands a
// listed command to the bridge's one inbound handler as the developer.
//
// The folder is untrusted input and is read with the handoff watcher's safe reads
// (handoff-watch.ts): regular files only, never a symlink, a size cap, a strict name. A file
// older than 2 minutes is deleted unrun, so a command typed while the agent was down never
// fires later. Each file runs once: it is deleted before it is acted on.

/** Relative to the repo root. Git-ignored (core/handoff-gitignore.ts). */
export const COMMAND_DIR = join(".wxai", "command");
/** `20261027T201500123Z.cmd`: a UTC timestamp to the millisecond. */
export const COMMAND_NAME_RE = /^\d{8}T\d{9}Z\.cmd$/;
/** Far larger than any command and its header. */
export const COMMAND_MAX_BYTES = 1024;
/** A command not run within 2 minutes is deleted unrun. */
export const COMMAND_MAX_AGE_MS = 2 * 60 * 1000;
/** The lane is interactive: scan often. fs.watch usually wins anyway. */
export const COMMAND_SCAN_MS = 2_000;
const COMMAND_FUTURE_SKEW_MS = 30_000;

export function commandDir(repoRoot: string): string {
  return join(repoRoot, COMMAND_DIR);
}

/** The file name for a command written at `d`. */
export function commandFileName(d: Date): string {
  return handoffFileName(d).replace(/\.md$/, ".cmd");
}

/** The whole file: a created-at header, a blank line, then the command text. */
export function renderCommandFile(command: string, createdAt: Date): string {
  return `created-at: ${createdAt.toISOString()}\n\n${command}\n`;
}

/** Parse a command file. The body is the command text; nothing is masked. */
export function parseCommandFile(text: string): { createdAt: Date; masked: number; body: string } | null {
  const m = /^created-at: (\S+)\r?\n\r?\n([\s\S]*)$/.exec(text);
  if (!m) return null;
  const createdAt = new Date(m[1]);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, masked: 0, body: m[2].trim() };
}

export const COMMAND_FORMAT: WatchFormat = {
  relDir: COMMAND_DIR,
  nameRe: COMMAND_NAME_RE,
  maxBytes: COMMAND_MAX_BYTES,
  maxAgeMs: COMMAND_MAX_AGE_MS,
  futureSkewMs: COMMAND_FUTURE_SKEW_MS,
  parse: parseCommandFile,
};

/** Posted when a lane command would have settled a push or an approval, or asked for push. */
export const LANE_PUSH_NOTE =
  "Push and CONFIRMED are answered by a person in the room. That command from the local session settled nothing.";

/** A Pino logger for lane events, JSON lines on stderr unless given a stream. Never the text. */
export function createCommandLogger(dest?: DestinationStream): Logger {
  return pino(
    { base: { component: "command" }, timestamp: pino.stdTimeFunctions.isoTime },
    dest ?? pino.destination({ dest: 2, sync: true }),
  );
}

export interface CommandLaneOptions {
  repoRoot: string;
  /** A listed command, normalized. The bridge's receiveLocalCommand. */
  deliver: (text: string, entry: CommandEntry) => void;
  logger?: Logger;
  now?: () => Date;
  scanMs?: number;
}

export class CommandLane {
  private readonly watcher: HandoffWatcher;

  constructor(private readonly opts: CommandLaneOptions) {
    this.watcher = new HandoffWatcher({
      repoRoot: opts.repoRoot,
      format: COMMAND_FORMAT,
      onReady: (f) => this.run(f),
      // The watcher already deleted it and logged "expired": a stale command never runs.
      onExpired: () => undefined,
      logger: opts.logger,
      now: opts.now,
      scanMs: opts.scanMs ?? COMMAND_SCAN_MS,
    });
  }

  start(): void {
    this.watcher.start();
  }

  stop(): void {
    this.watcher.stop();
  }

  /** One pass over the folder. Public so tests drive it instead of waiting on timers. */
  scan(): void {
    this.watcher.scan();
  }

  private log(event: "run" | "dropped" | "ignored", reason: string): void {
    if (this.opts.logger) logHandoff(this.opts.logger, event, { reason });
  }

  /** Delete first, so the file runs at most once; then resolve it through the one list. */
  private run(f: HandoffFile): void {
    try {
      unlinkSync(f.path);
    } catch {
      this.log("ignored", "undeletable");
      return;
    }
    const entry = resolveCommand(f.body);
    if (!entry) {
      this.log("dropped", "not-a-command");
      return;
    }
    // The transfer keeps its own rule, and a room-only word is never typed locally.
    if (entry.local === "transfer-rule" || entry.local === "room-only") {
      this.log("dropped", "not-for-lane");
      return;
    }
    this.log("run", entry.name.replace(/ /g, "-"));
    this.opts.deliver(normalizeCommandText(f.body), entry);
  }
}
// [SCOPE 159 / T022] END

// [SCOPE 159 / T022] BEGIN — The session's writer: --list, one command, one line, nothing written unless the agent runs (FR-095)
// MODIFIED-BY: [SCOPE 159 / T023] — "status" is answered here from disk by the one status builder, agent up or down, and may print several lines (FR-096)
// MODIFIED-BY: [SCOPE 159 / T024] — go, no and skip with nothing waiting, and autopilot during a run, print one line and write nothing; the autopilot wait lives in agentCommand (FR-097)

export const NOT_RUNNING_LINE =
  "The Project Agent is not running. Start it from the Dev Cockpit (Project Agent), or run `npm run project-agent` in wxkanban-agent/.";

/** [SCOPE 159 / T024] go, no or skip typed locally while no list or question waits. */
export const NOTHING_WAITING_LINE =
  "No devplan list or question is waiting, so there is nothing for go, no or skip to answer. Type autopilot to list the devplan. Nothing was written.";

/** [SCOPE 159 / T024] "autopilot" while an Autopilot run is active: the room's line, from both places. */
export const RUN_IN_PROGRESS_LINE = "Autopilot: a run is already in progress. Type status to see it.";

/** Exit codes, one per outcome. */
export const AGENT_COMMAND_EXIT = {
  sent: 0,
  notRunning: 1,
  notACommand: 2,
  notForLane: 3,
  writeFailed: 4,
  notNow: 5, // [SCOPE 159 / T024] the agent runs, but there is nothing for this command to act on
} as const;

export interface AgentCommandDeps {
  repoRoot: string;
  now?: () => Date;
  /** Is this pid alive? Injected for tests. */
  pidAlive?: (pid: number) => boolean;
}

export interface AgentCommandResult {
  code: number;
  lines: string[];
}

const NOT_FOR_LANE_LINES: Record<"push-rule" | "transfer-rule" | "room-only", (c: CommandEntry) => string> = {
  "push-rule": () =>
    "push is not sent to the Project Agent: the local session keeps its own git push rule (_wxAI/rules/git.md). In the room, push asks a person for CONFIRMED. Nothing was written.",
  "transfer-rule": () =>
    "transfer to agent has its own rule: follow _wxAI/rules/transfer.md (bin/transfer-to-agent.mjs). Nothing was written.",
  "room-only": (c) => `${c.name} is typed in the room only. Nothing was written.`,
};

/**
 * Commands the local session answers itself, before the liveness check, so they work with the
 * agent down.
 */
function localAnswer(entry: CommandEntry, deps: AgentCommandDeps): AgentCommandResult | null {
  switch (entry.name) {
    // [SCOPE 159 / T023] "status": the one status builder's text (the same builder the room's
    // STATUS uses), filled from disk. Exit 0 whether the agent runs or not; nothing is written.
    case "status":
      return { code: AGENT_COMMAND_EXIT.sent, lines: statusFromDisk(deps.repoRoot, (deps.now ?? (() => new Date()))(), deps.pidAlive) };
    default:
      return null;
  }
}

/** The whole writer. No network, no token mint, no process started: at most one small file. */
export function runAgentCommand(argv: readonly string[], deps: AgentCommandDeps): AgentCommandResult {
  if (argv.includes("--list")) return { code: AGENT_COMMAND_EXIT.sent, lines: formatCommandList() };
  const text = argv.join(" ").trim();
  const entry = resolveCommand(text);
  if (!entry) {
    return {
      code: AGENT_COMMAND_EXIT.notACommand,
      lines: ["Not a command. Run with --list for the commands. Nothing was written."],
    };
  }
  if (entry.local !== "lane") return { code: AGENT_COMMAND_EXIT.notForLane, lines: [NOT_FOR_LANE_LINES[entry.local](entry)] };
  const local = localAnswer(entry, deps);
  if (local) return local;
  if (!projectAgentLive(deps.repoRoot, deps.pidAlive)) return { code: AGENT_COMMAND_EXIT.notRunning, lines: [NOT_RUNNING_LINE] };
  // [SCOPE 159 / T024] The agent's own snapshot says whether anything waits for an answer, or a run is active.
  if (entry.kind === "answer" || entry.name === "autopilot") {
    const memory = readStatusMemory(deps.repoRoot);
    if (entry.kind === "answer" && memory?.awaitingGo === undefined && !memory?.question) {
      return { code: AGENT_COMMAND_EXIT.notNow, lines: [NOTHING_WAITING_LINE] };
    }
    if (entry.name === "autopilot" && memory?.runActive) {
      return { code: AGENT_COMMAND_EXIT.notNow, lines: [`${RUN_IN_PROGRESS_LINE} Nothing was written.`] };
    }
  }
  const command = normalizeCommandText(text);
  const createdAt = (deps.now ?? (() => new Date()))();
  try {
    writeOne(deps.repoRoot, createdAt, renderCommandFile(command, createdAt), {
      dir: commandDir(deps.repoRoot),
      nameFor: commandFileName,
    });
  } catch (err) {
    return {
      code: AGENT_COMMAND_EXIT.writeFailed,
      lines: [`The command could not be written (${(err as Error).message}). Nothing was sent.`],
    };
  }
  return { code: AGENT_COMMAND_EXIT.sent, lines: [`Sent to the Project Agent: ${command}.`] };
}
// [SCOPE 159 / T022] END

// [SCOPE 159 / T024] BEGIN — Local "autopilot": send it, then print the agent's answer from run state, or the sent line (FR-097)
//
// The writer waits on one disk signal: the run state's `startupListAt` (docs/GOD-State-Autopilot.json),
// which the agent stamps when it answers a devplan start (bridge.ts startDevplanList). Only a stamp at
// or after this command's own `created-at` counts, so a list saved by an earlier start is never
// printed as the answer. With no answer in time it prints the sent line; the list still reaches the room.

/** Printed when the agent has not answered within the wait: the list goes to the room either way. */
export const AUTOPILOT_SENT_LINE = "Sent to the Project Agent: autopilot. The list will appear in the room.";

/** The last line under a printed list. */
export const AUTOPILOT_GO_LINE = 'Type go to start this run (go debug for the step feed), no to cancel, or skip <num> to drop one scope.';

export const AUTOPILOT_WAIT_MS = 30_000;
export const AUTOPILOT_POLL_MS = 500;

export interface AgentCommandWaitDeps extends AgentCommandDeps {
  /** Waits between polls. Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;
  pollMs?: number;
}

/** The agent's answer to a devplan start made at or after `since`, as the lines to print; null while none. */
export function autopilotAnswer(repoRoot: string, since: Date): string[] | null {
  const state = loadAutopilotState(repoRoot);
  const at = state.startupListAt ? Date.parse(state.startupListAt) : Number.NaN;
  if (Number.isNaN(at) || at < since.getTime()) return null;
  const list = state.startupList;
  if (!list) return [NO_DEVPLAN_MESSAGE];
  if (list.length === 0) return [NOTHING_TO_DO_MESSAGE];
  const text = formatStartupList(list.map((s) => ({ num: s.scope, title: s.title, stage: s.stage ?? "Design" })));
  return [...text.split("\n"), "", AUTOPILOT_GO_LINE];
}

/** The writer as the session runs it: every command as runAgentCommand, and "autopilot" waits for its answer. */
export async function agentCommand(argv: readonly string[], deps: AgentCommandWaitDeps): Promise<AgentCommandResult> {
  const createdAt = (deps.now ?? (() => new Date()))();
  const result = runAgentCommand(argv, { ...deps, now: () => createdAt });
  if (result.code !== AGENT_COMMAND_EXIT.sent || argv.includes("--list") || resolveCommand(argv.join(" ").trim())?.name !== "autopilot") {
    return result;
  }
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const waitMs = deps.waitMs ?? AUTOPILOT_WAIT_MS;
  const pollMs = deps.pollMs ?? AUTOPILOT_POLL_MS;
  for (let waited = 0; waited < waitMs; waited += pollMs) {
    await sleep(pollMs);
    const lines = autopilotAnswer(deps.repoRoot, createdAt);
    if (lines) return { code: AGENT_COMMAND_EXIT.sent, lines };
  }
  return { code: AGENT_COMMAND_EXIT.sent, lines: [AUTOPILOT_SENT_LINE] };
}
// [SCOPE 159 / T024] END
