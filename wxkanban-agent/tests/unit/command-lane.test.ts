/**
 * SPEC-159 Amendment A, T022 (FR-095) — the local command lane and the session's writer.
 * The lane reads `.wxai/command/` like the handoff folder: regular files only, never a symlink,
 * a size cap, a strict name. A stale file is deleted unrun, a non-command is dropped and logged,
 * and each file runs once. The writer writes nothing unless the agent runs, and --list prints
 * the one list. Files live in a temp folder; no network, no database.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import type { DestinationStream } from "pino";
import {
  AGENT_COMMAND_EXIT,
  COMMAND_MAX_AGE_MS,
  COMMAND_MAX_BYTES,
  CommandLane,
  NOT_RUNNING_LINE,
  commandDir,
  commandFileName,
  createCommandLogger,
  parseCommandFile,
  renderCommandFile,
  runAgentCommand,
  // [SCOPE 159 / T024]
  AUTOPILOT_GO_LINE,
  AUTOPILOT_POLL_MS,
  AUTOPILOT_SENT_LINE,
  AUTOPILOT_WAIT_MS,
  NOTHING_WAITING_LINE,
  RUN_IN_PROGRESS_LINE,
  agentCommand,
  autopilotAnswer,
} from "../../apps/remote-bridge/src/command-lane";
import { loadAutopilotState, recordStartupList, saveAutopilotState } from "../../apps/remote-bridge/src/autopilot-skip"; // [SCOPE 159 / T024]
import { formatStartupList, NO_DEVPLAN_MESSAGE, NOTHING_TO_DO_MESSAGE } from "../../apps/remote-bridge/src/autopilot-startup"; // [SCOPE 159 / T024]
import { formatCommandList, type CommandEntry } from "../../apps/remote-bridge/src/command-set";
import { PANEL_SNAPSHOT_REL } from "../../apps/remote-bridge/src/room-view"; // [SCOPE 159 / T024]

// [SCOPE 159 / T022] BEGIN — helpers for the command lane tests (FR-095)
// MODIFIED-BY: [SCOPE 159 / T024] — snapshot(): the panel snapshot's status, for the go/no/skip and autopilot checks (FR-097)
const NOW = new Date("2026-11-26T15:00:00.000Z");
let root: string;
let delivered: Array<{ text: string; name: string }>;
let logLines: Array<{ event?: string; reason?: string; msg?: string }>;

const sink: DestinationStream = {
  write(s: string) {
    logLines.push(JSON.parse(s) as { event?: string; reason?: string; msg?: string });
  },
};

function lane(now: Date = NOW): CommandLane {
  return new CommandLane({
    repoRoot: root,
    deliver: (text: string, entry: CommandEntry) => delivered.push({ text, name: entry.name }),
    logger: createCommandLogger(sink),
    now: () => now,
  });
}

/** Drop a command file as the writer would, written at `at`. */
function drop(command: string, at: Date = NOW, body?: string): string {
  const dir = commandDir(root);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, commandFileName(at));
  writeFileSync(path, body ?? renderCommandFile(command, at), "utf-8");
  return path;
}

const files = (): string[] => (existsSync(commandDir(root)) ? readdirSync(commandDir(root)) : []);
const events = (): string[] => logLines.map((l) => `${l.event ?? "?"}:${l.reason ?? ""}`);

/** The worktree lock a live project agent holds. */
function agentRunning(): void {
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(join(root, ".wxai", "remote-session.lock"), JSON.stringify({ pid: 4242, owner: "project agent" }), "utf-8");
}

/** [SCOPE 159 / T024] The panel snapshot's status, as the running agent writes it. */
function snapshot(status: Record<string, unknown>): void {
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(join(root, PANEL_SNAPSHOT_REL), JSON.stringify({ status }), "utf-8");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "command-lane-"));
  delivered = [];
  logLines = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
// [SCOPE 159 / T022] END

// [SCOPE 159 / T022] BEGIN — the lane reads safely, runs once, and drops what is not a command (FR-095)
describe("FR-095 the command lane", () => {
  it("a listed command runs once and its file is deleted", () => {
    drop("STATUS.");
    const l = lane();
    l.scan();
    expect(delivered).toEqual([{ text: "status", name: "status" }]);
    expect(files()).toEqual([]);
    l.scan();
    expect(delivered).toHaveLength(1);
    expect(events()).toContain("run:status");
  });

  it("a file older than 2 minutes is deleted unrun", () => {
    drop("status", new Date(NOW.getTime() - COMMAND_MAX_AGE_MS - 1_000));
    lane().scan();
    expect(delivered).toEqual([]);
    expect(files()).toEqual([]);
    expect(events().some((e) => e.startsWith("expired:"))).toBe(true);
  });

  it("a non-command is dropped and logged, never delivered", () => {
    drop("rm -rf everything");
    lane().scan();
    expect(delivered).toEqual([]);
    expect(files()).toEqual([]);
    expect(events()).toContain("dropped:not-a-command");
    // The text itself is never logged.
    expect(JSON.stringify(logLines)).not.toContain("everything");
  });

  it("transfer to agent and a room-only word are dropped: they never come down the lane", () => {
    drop("transfer to agent", NOW);
    drop("cancel remote", new Date(NOW.getTime() + 1));
    lane().scan();
    expect(delivered).toEqual([]);
    expect(events().filter((e) => e === "dropped:not-for-lane")).toHaveLength(2);
  });

  it("an oversize file is ignored", () => {
    drop("status", NOW, renderCommandFile("status", NOW) + "x".repeat(COMMAND_MAX_BYTES));
    lane().scan();
    expect(delivered).toEqual([]);
    expect(events()).toContain("ignored:oversize");
  });

  it("a symlink is never followed", (ctx) => {
    const target = join(root, "elsewhere.txt");
    writeFileSync(target, renderCommandFile("status", NOW), "utf-8");
    mkdirSync(commandDir(root), { recursive: true });
    try {
      symlinkSync(target, join(commandDir(root), commandFileName(NOW)), "file");
    } catch {
      ctx.skip(); // this Windows account may not create symlinks
      return;
    }
    lane().scan();
    expect(delivered).toEqual([]);
    expect(events()).toContain("ignored:symlink");
    expect(existsSync(target)).toBe(true);
  });

  it("a badly named or malformed file is ignored", () => {
    mkdirSync(commandDir(root), { recursive: true });
    writeFileSync(join(commandDir(root), "status.cmd"), renderCommandFile("status", NOW), "utf-8");
    drop("status", NOW, "status\n");
    lane().scan();
    expect(delivered).toEqual([]);
    expect(events()).toEqual(expect.arrayContaining(["ignored:name", "ignored:malformed"]));
  });

  it("the file format round-trips: a created-at header, then the command", () => {
    const text = renderCommandFile("skip 3", NOW);
    expect(text.startsWith(`created-at: ${NOW.toISOString()}\n\n`)).toBe(true);
    expect(parseCommandFile(text)).toEqual({ createdAt: NOW, masked: 0, body: "skip 3" });
    expect(commandFileName(NOW)).toMatch(/^\d{8}T\d{9}Z\.cmd$/);
  });
});
// [SCOPE 159 / T022] END

// [SCOPE 159 / T022] BEGIN — the session's writer (FR-095)
// MODIFIED-BY: [SCOPE 159 / T023] — the not-running cases use "verbose": "status" is now answered locally, agent up or down (FR-096)
// MODIFIED-BY: [SCOPE 159 / T024] — the skip case first writes a snapshot with a list waiting: skip with nothing waiting is no longer sent (FR-097)
describe("FR-095 the agent-command writer", () => {
  const alive = () => true;

  it("--list prints the one list", () => {
    expect(runAgentCommand(["--list"], { repoRoot: root })).toEqual({ code: AGENT_COMMAND_EXIT.sent, lines: formatCommandList() });
  });

  it("not a command: one line, its own exit code, nothing written", () => {
    agentRunning();
    const r = runAgentCommand(["please", "deploy"], { repoRoot: root, pidAlive: alive });
    expect(r.code).toBe(AGENT_COMMAND_EXIT.notACommand);
    expect(r.lines).toEqual(["Not a command. Run with --list for the commands. Nothing was written."]);
    expect(files()).toEqual([]);
  });

  it("the agent not running: the exact line, nothing written", () => {
    const r = runAgentCommand(["verbose"], { repoRoot: root });
    expect(r).toEqual({ code: AGENT_COMMAND_EXIT.notRunning, lines: [NOT_RUNNING_LINE] });
    expect(NOT_RUNNING_LINE).toBe(
      "The Project Agent is not running. Start it from the Dev Cockpit (Project Agent), or run `npm run project-agent` in wxkanban-agent/.",
    );
    expect(files()).toEqual([]);
    // A lock whose pid is gone is not a running agent either.
    agentRunning();
    expect(runAgentCommand(["verbose"], { repoRoot: root, pidAlive: () => false }).code).toBe(AGENT_COMMAND_EXIT.notRunning);
    expect(files()).toEqual([]);
  });

  it("the agent running: one file written, and the lane reads it back as the same command", () => {
    agentRunning();
    snapshot({ state: "waiting", runActive: false, paused: false, awaitingGo: 2 });
    const r = runAgentCommand(["Skip", "3!"], { repoRoot: root, pidAlive: alive, now: () => NOW });
    expect(r).toEqual({ code: AGENT_COMMAND_EXIT.sent, lines: ["Sent to the Project Agent: skip 3."] });
    expect(files()).toEqual([commandFileName(NOW)]);
    expect(readFileSync(join(commandDir(root), commandFileName(NOW)), "utf-8")).toBe(renderCommandFile("skip 3", NOW));
    lane().scan();
    expect(delivered).toEqual([{ text: "skip 3", name: "skip" }]);
  });

  it("push keeps the git rule and transfer to agent keeps the transfer rule: nothing written", () => {
    agentRunning();
    const push = runAgentCommand(["PUSH"], { repoRoot: root, pidAlive: alive });
    expect(push.code).toBe(AGENT_COMMAND_EXIT.notForLane);
    expect(push.lines[0]).toContain("_wxAI/rules/git.md");
    const transfer = runAgentCommand(["transfer", "to", "agent"], { repoRoot: root, pidAlive: alive });
    expect(transfer.code).toBe(AGENT_COMMAND_EXIT.notForLane);
    expect(transfer.lines[0]).toContain("_wxAI/rules/transfer.md");
    expect(runAgentCommand(["cancel remote"], { repoRoot: root, pidAlive: alive }).code).toBe(AGENT_COMMAND_EXIT.notForLane);
    expect(files()).toEqual([]);
  });
});

// The launcher itself, once, through tsx: slow on this machine, so one process per case.
// The not-running case uses "verbose": "status" answers locally (FR-096).
describe("FR-095 bin/agent-command.mjs", () => {
  const bin = join(__dirname, "..", "..", "apps", "remote-bridge", "bin", "agent-command.mjs");
  const run = (args: string[]) =>
    spawnSync(process.execPath, [bin, ...args], {
      encoding: "utf-8",
      env: { ...process.env, WXKANBAN_REPO_ROOT: root },
      timeout: 110_000,
    });

  it("--list prints exactly the list", () => {
    const r = run(["--list"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trimEnd().split("\n").map((l) => l.replace(/\r$/, ""))).toEqual(formatCommandList());
  }, 120_000);

  it("with the agent not running it prints the line and writes nothing", () => {
    const r = run(["verbose"]);
    expect(r.status).toBe(AGENT_COMMAND_EXIT.notRunning);
    expect(r.stdout.trim()).toBe(NOT_RUNNING_LINE);
    expect(existsSync(commandDir(root))).toBe(false);
  }, 120_000);
});
// [SCOPE 159 / T022] END

// [SCOPE 159 / T024] BEGIN — the writer's autopilot wait and its go/no/skip check (FR-097)
describe("FR-097 the writer: autopilot and go", () => {
  const alive = () => true;
  const LIST = [
    { num: "200", title: "First scope", stage: "Implementation" },
    { num: "201", title: "Second scope", stage: "Design" },
  ];
  const runState = (scopes: typeof LIST | [] | null, at: Date): void => {
    mkdirSync(join(root, "docs"), { recursive: true });
    saveAutopilotState(root, recordStartupList(loadAutopilotState(root), scopes, at.toISOString()));
  };
  const idle = () => snapshot({ state: "idle", runActive: false, paused: false });

  it("go, no and skip with nothing waiting: one line, nothing written", async () => {
    agentRunning();
    for (const words of [["go"], ["No."], ["skip", "3"], ["go", "debug"]]) {
      expect(await agentCommand(words, { repoRoot: root, pidAlive: alive })).toEqual({
        code: AGENT_COMMAND_EXIT.notNow,
        lines: [NOTHING_WAITING_LINE],
      });
    }
    idle();
    expect((await agentCommand(["go"], { repoRoot: root, pidAlive: alive })).code).toBe(AGENT_COMMAND_EXIT.notNow);
    expect(files()).toEqual([]);
  });

  it("go is sent while a list or a question waits", async () => {
    agentRunning();
    snapshot({ state: "waiting", runActive: false, paused: false, awaitingGo: 2 });
    expect(await agentCommand(["go"], { repoRoot: root, pidAlive: alive, now: () => NOW })).toEqual({
      code: AGENT_COMMAND_EXIT.sent,
      lines: ["Sent to the Project Agent: go."],
    });
    rmSync(commandDir(root), { recursive: true, force: true });
    snapshot({ state: "waiting", runActive: true, paused: false, question: { who: "SCOPE-200", text: "May I?" } });
    expect((await agentCommand(["no"], { repoRoot: root, pidAlive: alive })).code).toBe(AGENT_COMMAND_EXIT.sent);
  });

  it("the agent down: the not-running line, nothing written, no wait", async () => {
    let slept = 0;
    const r = await agentCommand(["autopilot"], { repoRoot: root, sleep: async () => void (slept += 1) });
    expect(r).toEqual({ code: AGENT_COMMAND_EXIT.notRunning, lines: [NOT_RUNNING_LINE] });
    expect(slept).toBe(0);
    expect(files()).toEqual([]);
  });

  it("the list appears: the room's list text, then the go line", async () => {
    agentRunning();
    idle();
    const r = await agentCommand(["Autopilot."], {
      repoRoot: root,
      pidAlive: alive,
      now: () => NOW,
      sleep: async () => runState(LIST, NOW),
    });
    expect(files()).toEqual([commandFileName(NOW)]);
    expect(r.code).toBe(AGENT_COMMAND_EXIT.sent);
    expect(r.lines).toEqual([...formatStartupList(LIST).split("\n"), "", AUTOPILOT_GO_LINE]);
  });

  it("no devplan and nothing to run print the room's own line", async () => {
    agentRunning();
    idle();
    const none = await agentCommand(["run devplan"], { repoRoot: root, pidAlive: alive, now: () => NOW, sleep: async () => runState(null, NOW) });
    expect(none.lines).toEqual([NO_DEVPLAN_MESSAGE]);
    const empty = await agentCommand(["autopilot"], {
      repoRoot: root,
      pidAlive: alive,
      now: () => new Date(NOW.getTime() + 1),
      sleep: async () => runState([], new Date(NOW.getTime() + 1)),
    });
    expect(empty.lines).toEqual([NOTHING_TO_DO_MESSAGE]);
  });

  it("timeout: the sent line after about 30 s of 500 ms polls", async () => {
    agentRunning();
    idle();
    let slept = 0;
    const r = await agentCommand(["autopilot"], { repoRoot: root, pidAlive: alive, now: () => NOW, sleep: async () => void (slept += 1) });
    expect(r).toEqual({ code: AGENT_COMMAND_EXIT.sent, lines: [AUTOPILOT_SENT_LINE] });
    expect(AUTOPILOT_SENT_LINE).toBe("Sent to the Project Agent: autopilot. The list will appear in the room.");
    expect(slept).toBe(AUTOPILOT_WAIT_MS / AUTOPILOT_POLL_MS);
    expect(files()).toEqual([commandFileName(NOW)]);
  });

  it("a stale list is never printed: a list saved before the command times out", async () => {
    agentRunning();
    idle();
    runState(LIST, new Date(NOW.getTime() - 60_000));
    const r = await agentCommand(["autopilot"], { repoRoot: root, pidAlive: alive, now: () => NOW, sleep: async () => undefined });
    expect(r.lines).toEqual([AUTOPILOT_SENT_LINE]);
    // A list saved without a time (before T024) is stale too.
    saveAutopilotState(root, { ...loadAutopilotState(root), startupListAt: undefined });
    expect(autopilotAnswer(root, NOW)).toBeNull();
  });

  it("autopilot during an active run: one line, nothing written", async () => {
    agentRunning();
    snapshot({ state: "working", runActive: true, paused: false });
    const r = await agentCommand(["autopilot"], { repoRoot: root, pidAlive: alive });
    expect(r).toEqual({ code: AGENT_COMMAND_EXIT.notNow, lines: [`${RUN_IN_PROGRESS_LINE} Nothing was written.`] });
    expect(files()).toEqual([]);
  });

  it("other commands pass straight through, with no wait", async () => {
    agentRunning();
    let slept = 0;
    const r = await agentCommand(["verbose"], { repoRoot: root, pidAlive: alive, now: () => NOW, sleep: async () => void (slept += 1) });
    expect(r).toEqual({ code: AGENT_COMMAND_EXIT.sent, lines: ["Sent to the Project Agent: verbose."] });
    expect(slept).toBe(0);
  });
});
// [SCOPE 159 / T024] END
