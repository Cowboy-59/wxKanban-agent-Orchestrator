/**
 * SPEC-159 Amendment A, T023 (FR-096) — "status" from one builder.
 * The builder is pure: each outstanding item alone and all together, exactly one line with
 * nothing outstanding, secrets masked, a long question cut. The local reader fills it from disk:
 * with the agent down it still answers, says so, and shows no stale "working" or question; it
 * writes no command file. Files live in a temp folder; no network, no database.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildStatus, devplanItemsLeft, STATUS_QUESTION_MAX, type StatusMemory, type StatusState } from "../../apps/remote-bridge/src/status-summary";
import { pendingHandoffs, readStatusMemory, statusFromBridge, statusFromDisk } from "../../apps/remote-bridge/src/status-source";
import { AGENT_COMMAND_EXIT, commandDir, runAgentCommand } from "../../apps/remote-bridge/src/command-lane";
import { PANEL_SNAPSHOT_REL } from "../../apps/remote-bridge/src/room-view";
import type { AutopilotRunState } from "../../apps/remote-bridge/src/autopilot-skip";

// [SCOPE 159 / T023] BEGIN — helpers for the status builder tests (FR-096)
const NOW = new Date("2026-11-26T15:00:00.000Z");
const EMPTY_RUN: AutopilotRunState = { mode: "autopilot", skips: [] };
const IDLE: StatusMemory = { state: "idle", runActive: false, paused: false };

function state(over: Partial<StatusState> = {}): StatusState {
  return { agentRunning: true, memory: IDLE, handoffs: { count: 0 }, run: EMPTY_RUN, ...over };
}

const RUN: AutopilotRunState = {
  mode: "autopilot",
  skips: [],
  units: [{ scope: "200", title: "First", status: "done" }],
  startupList: [
    { scope: "200", title: "First", status: "waiting" },
    { scope: "201", title: "Second", status: "waiting" },
    { scope: "202", title: "Third", status: "waiting" },
  ],
  currentScope: "201",
  currentStep: "running",
  stepStartedAt: new Date(NOW.getTime() - 12 * 60_000).toISOString(),
};

let root: string;

function writeRun(run: AutopilotRunState): void {
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "GOD-State-Autopilot.json"), JSON.stringify(run), "utf8");
}
function writeHandoff(name: string): void {
  mkdirSync(join(root, ".wxai", "handoff"), { recursive: true });
  writeFileSync(join(root, ".wxai", "handoff", name), "handoff body", "utf8");
}
function writeSnapshot(status: StatusMemory): void {
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(join(root, PANEL_SNAPSHOT_REL), JSON.stringify({ rows: [], gates: [], runLogFile: "x", status }), "utf8");
}
function writeLock(): void {
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(join(root, ".wxai", "remote-session.lock"), JSON.stringify({ pid: 4242, owner: "project agent" }), "utf8");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "status-summary-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
// [SCOPE 159 / T023] END

// [SCOPE 159 / T023] BEGIN — the pure builder (FR-096)
describe("FR-096 the one status builder", () => {
  it("nothing outstanding gives exactly one line saying so", () => {
    expect(buildStatus(state(), NOW)).toEqual(["Status — the Project Agent is running (idle). Nothing outstanding."]);
    expect(buildStatus(state({ agentRunning: false, memory: undefined }), NOW)).toEqual([
      "Status — the Project Agent is not running. Nothing outstanding.",
    ]);
  });

  it("a pending handoff alone", () => {
    const lines = buildStatus(state({ handoffs: { count: 2, oldestAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() } }), NOW);
    expect(lines).toEqual(["Status — the Project Agent is running (idle).", "Handoffs pending: 2 (oldest waiting 5m)."]);
  });

  it("a running run alone, with its current unit", () => {
    const run: AutopilotRunState = { ...RUN, units: [], startupList: [{ scope: "201", title: "Second", status: "waiting" }] };
    // Every startup item is the running one; it is still left, so the items line names it.
    const lines = buildStatus(state({ memory: { state: "working", runActive: true, paused: false }, run }), NOW);
    expect(lines[0]).toBe("Status — the Project Agent is running (working).");
    expect(lines[1]).toBe("Autopilot run: working on SCOPE-201 — Second (12m so far).");
  });

  it("a running run between units, and paused", () => {
    const lines = buildStatus(state({ memory: { state: "idle", runActive: true, paused: true } }), NOW);
    expect(lines).toEqual(["Status — the Project Agent is running (idle).", "Autopilot run: active, between units — paused."]);
  });

  it("a waiting question alone", () => {
    const lines = buildStatus(state({ memory: { ...IDLE, state: "waiting", question: { who: "push", text: "Push main to origin?" } } }), NOW);
    expect(lines).toEqual(["Status — the Project Agent is running (waiting).", 'Waiting on an answer — push: "Push main to origin?"']);
  });

  it("devplan items left alone, and a devplan list waiting for go", () => {
    const run: AutopilotRunState = { ...RUN, currentScope: undefined, stepStartedAt: undefined };
    expect(buildStatus(state({ run }), NOW)).toEqual([
      "Status — the Project Agent is running (idle).",
      "Devplan items left: 2 — SCOPE-201, SCOPE-202.",
    ]);
    expect(buildStatus(state({ memory: { ...IDLE, awaitingGo: 1 } }), NOW)).toEqual([
      "Status — the Project Agent is running (idle).",
      'Devplan list waiting for "go": 1 scope.',
    ]);
  });

  it("everything together, in a fixed order", () => {
    const lines = buildStatus(
      state({
        memory: { state: "waiting", runActive: true, paused: false, question: { who: "SCOPE-201", text: "Which table?" } },
        handoffs: { count: 1, oldestAt: new Date(NOW.getTime() - 3 * 60_000).toISOString() },
        run: RUN,
      }),
      NOW,
    );
    expect(lines).toEqual([
      "Status — the Project Agent is running (waiting).",
      "Handoffs pending: 1 (oldest waiting 3m).",
      "Autopilot run: working on SCOPE-201 — Second (12m so far).",
      'Waiting on an answer — SCOPE-201: "Which table?"',
      "Devplan items left: 2 — SCOPE-201, SCOPE-202.",
    ]);
  });

  it("a secret in a question or a unit title comes out masked", () => {
    const run: AutopilotRunState = {
      ...RUN,
      startupList: [{ scope: "201", title: "Rotate password=Swordfish99", status: "waiting" }],
      units: [],
    };
    const lines = buildStatus(
      state({ memory: { state: "waiting", runActive: true, paused: false, question: { who: "gated action", text: "run with token=abc123def456" } }, run }),
      NOW,
    ).join("\n");
    expect(lines).not.toContain("Swordfish99");
    expect(lines).not.toContain("abc123def456");
  });

  it("a long question is cut", () => {
    const text = "word ".repeat(100);
    const line = buildStatus(state({ memory: { ...IDLE, question: { who: "push", text } } }), NOW)[1];
    const quoted = /"(.*)"$/.exec(line)?.[1] ?? "";
    expect(quoted.length).toBe(STATUS_QUESTION_MAX);
    expect(quoted.endsWith("…")).toBe(true);
  });

  it("items left: done and skipped are not left; more than five are counted", () => {
    const startupList = ["1", "2", "3", "4", "5", "6", "7", "8"].map((s) => ({ scope: s, title: `T${s}`, status: "waiting" as const }));
    const run: AutopilotRunState = {
      mode: "autopilot",
      skips: [{ scope: "2", title: "T2", status: "skipped", dependents: [] }],
      units: [{ scope: "1", title: "T1", status: "done" }],
      startupList,
    };
    expect(devplanItemsLeft(run)).toEqual(["3", "4", "5", "6", "7", "8"]);
    expect(buildStatus(state({ run }), NOW)[1]).toBe("Devplan items left: 6 — SCOPE-3, SCOPE-4, SCOPE-5, SCOPE-6, SCOPE-7, +1 more.");
  });
});
// [SCOPE 159 / T023] END

// [SCOPE 159 / T023] BEGIN — the local reader fills the builder from disk (FR-096)
describe("FR-096 status from disk", () => {
  it("with the agent down it still answers, says not running, and shows no stale working or question", () => {
    writeRun(RUN);
    writeHandoff("20261126T145000000Z.md");
    // A snapshot left behind by an agent that is gone: never trusted.
    writeSnapshot({ state: "working", runActive: true, paused: false, question: { who: "push", text: "Push main to origin?" } });
    const r = runAgentCommand(["status"], { repoRoot: root, now: () => NOW });
    expect(r.code).toBe(AGENT_COMMAND_EXIT.sent);
    expect(r.lines).toEqual([
      "Status — the Project Agent is not running.",
      "Handoffs pending: 1 (oldest waiting 10m).",
      "Autopilot: no run active; the saved run stopped at SCOPE-201 — Second.",
      "Devplan items left: 2 — SCOPE-201, SCOPE-202.",
    ]);
    const text = r.lines.join("\n");
    expect(text).not.toContain("working");
    expect(text).not.toContain("Waiting on an answer");
    // A lock whose pid is gone is not a running agent either.
    writeLock();
    expect(runAgentCommand(["status"], { repoRoot: root, now: () => NOW, pidAlive: () => false }).lines).toEqual(r.lines);
  });

  it("status writes no command file, agent up or down", () => {
    expect(runAgentCommand(["STATUS."], { repoRoot: root, now: () => NOW }).code).toBe(AGENT_COMMAND_EXIT.sent);
    writeLock();
    const up = runAgentCommand(["status"], { repoRoot: root, now: () => NOW, pidAlive: () => true });
    expect(up.code).toBe(AGENT_COMMAND_EXIT.sent);
    expect(up.lines).toEqual(["Status — the Project Agent is running. Nothing outstanding."]);
    expect(existsSync(commandDir(root))).toBe(false);
  });

  it("with the agent up, the snapshot's memory and the bridge's memory give the same text", () => {
    const memory: StatusMemory = { state: "waiting", runActive: true, paused: false, awaitingGo: 2, question: { who: "push", text: "Push main to origin?" } };
    writeRun(RUN);
    writeHandoff("20261126T145000000Z.md");
    writeLock();
    writeSnapshot(memory);
    expect(readStatusMemory(root)).toEqual(memory);
    expect(statusFromDisk(root, NOW, () => true)).toEqual(statusFromBridge(root, memory, NOW));
  });

  it("pending handoffs: names only, well-named regular files only", () => {
    writeHandoff("20261126T145000000Z.md");
    writeHandoff("20261126T140000000Z.md");
    writeHandoff("notes.md");
    mkdirSync(join(root, ".wxai", "handoff", "20261126T130000000Z.md"));
    expect(pendingHandoffs(root)).toEqual({ count: 2, oldestAt: "2026-11-26T14:00:00.000Z" });
  });

  it("a malformed snapshot is ignored", () => {
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(join(root, PANEL_SNAPSHOT_REL), JSON.stringify({ status: { state: "bogus" } }), "utf8");
    expect(readStatusMemory(root)).toBeUndefined();
    writeFileSync(join(root, PANEL_SNAPSHOT_REL), "{not json", "utf8");
    expect(readStatusMemory(root)).toBeUndefined();
  });
});
// [SCOPE 159 / T023] END
