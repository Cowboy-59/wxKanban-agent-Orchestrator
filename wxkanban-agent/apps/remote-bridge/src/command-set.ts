// The one command list (SPEC-159 Amendment A, FR-095). Every command works in the local Claude
// session and in the project room, with the same word and the same result. Both places read THIS
// list: the room's control-word switch (bridge.ts handleControl), the devplan list's answer check
// (inbound.ts isListAnswer), the local command lane (command-lane.ts) and the session's writer
// (bin/agent-command.mjs, which prints the list with --list). A command added here works in both
// places with no second edit. Pure: no I/O.

// [SCOPE 159 / T022] BEGIN — The one command list and its resolver (FR-095)
// MODIFIED-BY: [SCOPE 159 / T024] — "autopilot" is wired: the word and its alias "run devplan" start the list; the wiredLater field is gone (FR-097)

/** answer: settles a waiting devplan list. control: a room control word. devplan: the Autopilot list. handoff: the transfer. */
export type CommandKind = "answer" | "control" | "devplan" | "handoff";

/**
 * What the local session does with it:
 *   lane          — sent down the command lane to the running Project Agent (bin/agent-command.mjs);
 *   push-rule     — stays with the local session's own git push rule; never sent down the lane;
 *   transfer-rule — the existing transfer rule (_wxAI/rules/transfer.md), not re-implemented here;
 *   room-only     — typed in the room only.
 */
export type LocalRoute = "lane" | "push-rule" | "transfer-rule" | "room-only";

interface CommandSpec {
  /** Canonical word, lower case. */
  readonly name: string;
  /** Other words that mean the same command, lower case. */
  readonly aliases: readonly string[];
  readonly kind: CommandKind;
  /** One line, shown by `agent-command.mjs --list`. */
  readonly description: string;
  readonly local: LocalRoute;
  /** "num": the words must be followed by a number (skip 3). "debug": an optional trailing "debug" (go debug). */
  readonly argument?: "num" | "debug";
}

const ENTRIES = [
  // T023 replaces what "status" says, from one builder for both places.
  { name: "status", aliases: [], kind: "control", local: "lane", description: "One summary of the agent's state and outstanding work." },
  // instruction-intake.ts isRunDevplan resolves through this entry: every word on it starts the list.
  { name: "autopilot", aliases: ["run devplan"], kind: "devplan", local: "lane", description: "List the devplan items and wait; go starts the run." },
  { name: "go", aliases: [], kind: "answer", local: "lane", argument: "debug", description: "Start the waiting devplan list (go debug: with the debug feed)." },
  { name: "no", aliases: [], kind: "answer", local: "lane", description: "Cancel the waiting devplan list." },
  { name: "skip", aliases: [], kind: "answer", local: "lane", argument: "num", description: "skip <num>: drop one scope from the waiting list." },
  { name: "stop", aliases: [], kind: "control", local: "lane", description: "Interrupt the agent's current turn." },
  { name: "continue", aliases: [], kind: "control", local: "lane", description: "Carry on after a stop." },
  { name: "pause", aliases: [], kind: "control", local: "lane", description: "Pause a running Autopilot run." },
  { name: "resume", aliases: [], kind: "control", local: "lane", description: "Resume a paused Autopilot run." },
  { name: "verbose", aliases: [], kind: "control", local: "lane", description: "Stream the agent's output as it types." },
  { name: "concise", aliases: [], kind: "control", local: "lane", description: "Summarised output only." },
  {
    name: "push",
    aliases: [],
    kind: "control",
    local: "push-rule",
    description: "Room: pre-push review, then push on CONFIRMED from a person. Local: the session's own git push rule.",
  },
  { name: "transfer to agent", aliases: [], kind: "handoff", local: "transfer-rule", description: "Hand the session's state to the Project Agent (the transfer rule)." },
  { name: "triage", aliases: [], kind: "control", local: "lane", description: "Run feedback triage (feedback-sink project only)." },
  { name: "cancel remote", aliases: [], kind: "control", local: "room-only", description: "End remote mode (room only)." },
] as const satisfies readonly CommandSpec[];

/** Every canonical command name. */
export type CommandName = (typeof ENTRIES)[number]["name"];

export interface CommandEntry extends CommandSpec {
  readonly name: CommandName;
}

/** THE list. Read by the room, the lane and the local writer; nothing else holds a copy. */
export const COMMANDS: readonly CommandEntry[] = Object.freeze(ENTRIES.map((e) => Object.freeze({ ...e })));

/** Longer than any command with its argument; anything longer is never a command. */
export const MAX_COMMAND_CHARS = 200;

/** Whole message, any casing, one optional run of trailing "." or "!", inner whitespace collapsed. */
export function normalizeCommandText(text: string): string {
  return text.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ").toLowerCase();
}

/** The listed command this whole message is, or null. "skip" needs a number; "go debug" is go. */
export function resolveCommand(text: string): CommandEntry | null {
  if (typeof text !== "string" || text.length > MAX_COMMAND_CHARS) return null;
  const t = normalizeCommandText(text);
  if (!t) return null;
  for (const c of COMMANDS) {
    for (const w of [c.name, ...c.aliases]) {
      if (c.argument === "num") {
        if (t.startsWith(`${w} `) && /^\d+$/.test(t.slice(w.length + 1))) return c;
        continue;
      }
      if (t === w) return c;
      if (c.argument === "debug" && t === `${w} debug`) return c;
    }
  }
  return null;
}

/** How the words are typed, for the list: "skip <num>", "go [debug]". */
function usageOf(c: CommandEntry): string {
  if (c.argument === "num") return `${c.name} <num>`;
  if (c.argument === "debug") return `${c.name} [debug]`;
  return c.name;
}

const ROUTE_NOTE: Record<LocalRoute, string> = {
  lane: "",
  "push-rule": " [local: your own push rule]",
  "transfer-rule": " [local: the transfer rule]",
  "room-only": " [room only]",
};

/** The list as `agent-command.mjs --list` prints it: one line per command. */
export function formatCommandList(): string[] {
  return COMMANDS.map((c) => {
    const also = c.aliases.length > 0 ? ` (also: ${c.aliases.join(", ")})` : "";
    return `${usageOf(c)}${also} — ${c.description}${ROUTE_NOTE[c.local]}`;
  });
}
// [SCOPE 159 / T022] END
