/**
 * [SCOPE 154 / T015] The waiting Autopilot question: pass-through words, timings, room lines (FR-015),
 * the debug step feed (FR-017), and park lines filled from the unit (FR-016).
 */
import { describe, expect, it } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  AUTOPILOT_QUESTION_LAST_CALL_MS,
  AUTOPILOT_QUESTION_PARK_MS,
  formatQuestionAsked,
  formatQuestionAutoParked,
  formatQuestionBroughtBack,
  formatQuestionHeartbeatLine,
  formatQuestionLastCall,
  formatQuestionReminder,
  isQuestionPassThrough,
  toAutopilotQuestion,
  type PendingAutopilotQuestion,
} from "../../apps/remote-bridge/src/autopilot-question";
import { describeUnitMessage } from "../../apps/remote-bridge/src/autopilot-debug-feed";
import { fillParkedGate } from "../../apps/remote-bridge/src/autopilot-pipeline";
import { buildHeartbeat, describeRunningUnit, formatElapsed } from "../../apps/remote-bridge/src/autopilot-heartbeat";
import type { AutopilotRunState } from "../../apps/remote-bridge/src/autopilot-skip";

const q = { scopeNum: "042", question: "Use Stripe or Paddle?", askedAt: new Date("2026-11-08T10:00:00Z") };

describe("isQuestionPassThrough", () => {
  it("lets every control word through, in any case and with spaces", () => {
    for (const w of ["status", "STATUS", " Status ", "pause", "resume", "verbose", "concise", "stop"]) {
      expect(isQuestionPassThrough(w)).toBe(true);
    }
  });

  it("treats anything else as an answer", () => {
    for (const w of ["Stripe", "park", "status please", "yes", ""]) expect(isQuestionPassThrough(w)).toBe(false);
  });
});

describe("question timings", () => {
  it("posts the last call at 10 minutes and parks at 15", () => {
    expect(AUTOPILOT_QUESTION_LAST_CALL_MS).toBe(10 * 60_000);
    expect(AUTOPILOT_QUESTION_PARK_MS).toBe(15 * 60_000);
  });
});

describe("question room lines", () => {
  it("asks with the scope, the question, and PARK", () => {
    const s = formatQuestionAsked(q);
    expect(s).toContain("SCOPE-042 needs input");
    expect(s).toContain('"Use Stripe or Paddle?"');
    expect(s).toContain("PARK");
  });

  it("last call says it parks in 5 minutes and that status brings it back", () => {
    const s = formatQuestionLastCall(q);
    expect(s).toContain("last call");
    expect(s).toContain("parks by itself in 5 minutes");
    expect(s).toContain('reply "status" to bring it back');
  });

  it("auto-park, bring-back, reminder and heartbeat lines all name the scope", () => {
    expect(formatQuestionAutoParked(q)).toContain('SCOPE-042\'s question is parked');
    expect(formatQuestionAutoParked(q)).toContain('"status"');
    expect(formatQuestionBroughtBack(q)).toContain("parked question from SCOPE-042");
    expect(formatQuestionReminder(q)).toContain("SCOPE-042 is waiting on you");
    expect(formatQuestionHeartbeatLine(q)).toBe('Waiting on your answer — SCOPE-042: "Use Stripe or Paddle?" Reply with the answer, or PARK.');
  });

  it("toAutopilotQuestion drops the resolver", () => {
    const pending: PendingAutopilotQuestion = { ...q, resolve: () => undefined, broughtBack: true };
    expect(toAutopilotQuestion(pending)).toEqual(q);
  });
});

describe("describeUnitMessage (go debug)", () => {
  const assistant = (content: unknown[]): SDKMessage =>
    ({ type: "assistant", message: { content }, parent_tool_use_id: null, session_id: "s" }) as unknown as SDKMessage;

  it("gives one line per tool call, then the text", () => {
    const lines = describeUnitMessage(
      assistant([
        { type: "text", text: "Reading the spec first." },
        { type: "tool_use", name: "Read", input: { file_path: "specs/042-billing/spec.md" } },
        { type: "tool_use", name: "Bash", input: { command: "npm test" } },
      ]),
    );
    expect(lines).toEqual(["· Read: specs/042-billing/spec.md", "· Bash: npm test", "Reading the spec first."]);
  });

  it("names a tool with no recognizable target by name only, and trims long targets", () => {
    const long = "x".repeat(300);
    const lines = describeUnitMessage(
      assistant([
        { type: "tool_use", name: "TodoWrite", input: { todos: [] } },
        { type: "tool_use", name: "Grep", input: { pattern: long } },
      ]),
    );
    expect(lines[0]).toBe("· TodoWrite");
    expect(lines[1]).toBe(`· Grep: ${"x".repeat(120)}`);
  });

  it("is empty for anything that is not an assistant turn", () => {
    expect(describeUnitMessage({ type: "result" } as unknown as SDKMessage)).toEqual([]);
    expect(describeUnitMessage(assistant([{ type: "text", text: "   " }]))).toEqual([]);
  });
});

describe("fillParkedGate", () => {
  const unit = { num: "042", title: "Billing" };

  it("fills an empty park line from the unit and the project name — never 'undefined'", () => {
    const g = fillParkedGate({}, unit, "ScanShip");
    expect(g).toEqual({ project: "ScanShip", scope: "SCOPE-042", question: "(no question text)", blocks: "SCOPE-042 (Billing)" });
  });

  it("keeps what the unit already gave", () => {
    const g = fillParkedGate({ project: "P", scope: "S", question: "Q?", blocks: "B" }, unit, "ScanShip");
    expect(g).toEqual({ project: "P", scope: "S", question: "Q?", blocks: "B" });
  });

  it("falls back to 'this project' when no name is known", () => {
    expect(fillParkedGate({}, unit, undefined).project).toBe("this project");
  });
});

describe("heartbeat names the running unit and a waiting question", () => {
  const now = new Date("2026-11-08T11:05:00Z");
  const running: AutopilotRunState = {
    mode: "autopilot",
    skips: [],
    startupList: [{ scope: "042", title: "Billing", status: "waiting" }],
    currentScope: "042",
    currentStep: "running",
    stepStartedAt: "2026-11-08T10:53:00Z",
  };

  it("formatElapsed", () => {
    expect(formatElapsed(30_000)).toBe("under a minute");
    expect(formatElapsed(12 * 60_000)).toBe("12m");
    expect(formatElapsed(65 * 60_000)).toBe("1h 05m");
    expect(formatElapsed(-5)).toBe("under a minute");
  });

  it("describeRunningUnit gives scope, title and elapsed; undefined when nothing runs", () => {
    expect(describeRunningUnit(running, now)).toBe("SCOPE-042 — Billing (12m so far)");
    expect(describeRunningUnit({ mode: "autopilot", skips: [] }, now)).toBeUndefined();
  });

  it("a quiet heartbeat says what is still running instead of only 'nothing changed'", () => {
    const r = buildHeartbeat({ state: running, paused: false, previouslyPosted: [], now });
    expect(r.kind).toBe("nothing-changed");
    expect(r.message).toBe("Autopilot heartbeat: still working on SCOPE-042 — Billing (12m so far). Nothing else changed since the last post.");
  });

  it("every heartbeat repeats a waiting question, paused or not", () => {
    const line = formatQuestionHeartbeatLine(q);
    expect(buildHeartbeat({ state: running, paused: false, previouslyPosted: [], now, waitingQuestion: q }).message).toContain(line);
    const paused = buildHeartbeat({ state: running, paused: true, previouslyPosted: [], waitingQuestion: q });
    expect(paused.message).toBe(`Autopilot heartbeat: paused.\n${line}`);
  });

  it("a full heartbeat adds the running line after the finished units", () => {
    const state: AutopilotRunState = { ...running, units: [{ scope: "041", title: "Auth", status: "done" }] };
    const r = buildHeartbeat({ state, paused: false, previouslyPosted: [], now });
    expect(r.message).toBe("Autopilot heartbeat:\nDone — SCOPE-041: Auth.\nWorking on SCOPE-042 — Billing (12m so far).");
  });
});
