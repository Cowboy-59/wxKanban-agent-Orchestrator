/**
 * [SCOPE 155 / T008] Unit coverage for the rolling session-summary tracker (FR-002, FR-006).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueryFn } from "../../apps/remote-bridge/src/sdk-loader";
import {
  SessionSummaryTracker,
  buildSummaryPrompt,
  parseSummaryReply,
} from "../../apps/remote-bridge/src/session-summary";

/** A minimal fake `query()` that yields one result message then is done. */
function fakeQuery(resultText: string): QueryFn {
  return (() => {
    async function* iterable() {
      yield { type: "result", result: resultText } as never;
    }
    return Object.assign(iterable(), { close: () => undefined }) as unknown as ReturnType<QueryFn>;
  }) as QueryFn;
}

describe("buildSummaryPrompt / parseSummaryReply", () => {
  it("builds a prompt carrying the previous summary and the new lines only", () => {
    const prompt = buildSummaryPrompt("prior summary text", [{ ts: "2026-11-08T00:00:00.000Z", text: "fixed the bug" }]);
    expect(prompt).toContain("prior summary text");
    expect(prompt).toContain("fixed the bug");
  });

  it("parses the first JSON object found, ignoring surrounding commentary", () => {
    const reply = 'Sure, here you go:\n{"summary": "s", "lastEntry": "e", "blockers": ["b1"]}\nthanks';
    expect(parseSummaryReply(reply)).toEqual({ summary: "s", lastEntry: "e", blockers: ["b1"] });
  });

  it("returns null when no JSON object is present", () => {
    expect(parseSummaryReply("no json here")).toBeNull();
  });

  it("drops non-string blockers and defaults missing fields to empty strings/array", () => {
    const reply = '{"summary": "s", "blockers": ["ok", 5, null]}';
    expect(parseSummaryReply(reply)).toEqual({ summary: "s", lastEntry: "", blockers: ["ok"] });
  });
});

describe("SessionSummaryTracker.refresh", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "session-summary-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeFeed(lines: Array<{ ts: string; text: string }>): void {
    mkdirSync(join(repoRoot, ".wxai"), { recursive: true });
    writeFileSync(join(repoRoot, ".wxai", "session-feed.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  }

  it("no-ops when there is no feed file yet (no model call)", async () => {
    let called = false;
    const tracker = new SessionSummaryTracker({
      repoRoot,
      query: () => {
        called = true;
        throw new Error("should not be called");
      },
    });
    await tracker.refresh();
    expect(called).toBe(false);
    expect(tracker.getState()).toEqual({ summary: "", lastEntry: "", blockers: [], summaryAt: null });
  });

  it("no-ops when the feed has no lines beyond what was already processed", async () => {
    writeFeed([]);

    let called = false;
    const tracker = new SessionSummaryTracker({
      repoRoot,
      query: () => {
        called = true;
        throw new Error("should not be called");
      },
    });
    await tracker.refresh();
    expect(called).toBe(false);
  });

  it("summarizes new lines via the injected cheap-tier query and masks the result", async () => {
    writeFeed([{ ts: "2026-11-08T00:00:00.000Z", text: "started the task" }]);

    const fakeReply = JSON.stringify({
      summary: "Working on SCOPE-155. api_key=sk-ant-fakefakefakefakefakefakefake",
      lastEntry: "started the task",
      blockers: ["waiting on Andy"],
    });

    const tracker = new SessionSummaryTracker({
      repoRoot,
      now: () => new Date("2026-11-08T01:00:00.000Z"),
      query: fakeQuery(fakeReply),
    });

    await tracker.refresh();
    const state = tracker.getState();
    expect(state.lastEntry).toBe("started the task");
    expect(state.blockers).toEqual(["waiting on Andy"]);
    expect(state.summary).not.toContain("sk-ant-fakefakefakefakefakefakefake");
    expect(state.summaryAt).toBe("2026-11-08T01:00:00.000Z");
  });

  it("keeps the previous state and warns when the model reply is not parseable JSON", async () => {
    writeFeed([{ ts: "2026-11-08T00:00:00.000Z", text: "turn one" }]);

    const warnings: string[] = [];
    const tracker = new SessionSummaryTracker({
      repoRoot,
      warn: (line) => warnings.push(line),
      query: fakeQuery("not json"),
    });

    await tracker.refresh();
    expect(tracker.getState()).toEqual({ summary: "", lastEntry: "", blockers: [], summaryAt: null });
    expect(warnings.some((w) => w.includes("not parseable"))).toBe(true);
  });

  it("keeps the previous state and warns when the model call throws", async () => {
    writeFeed([{ ts: "2026-11-08T00:00:00.000Z", text: "turn one" }]);

    const warnings: string[] = [];
    const tracker = new SessionSummaryTracker({
      repoRoot,
      warn: (line) => warnings.push(line),
      query: () => {
        throw new Error("sdk unavailable");
      },
    });

    await tracker.refresh();
    expect(tracker.getState().summary).toBe("");
    expect(warnings.some((w) => w.includes("summarization failed"))).toBe(true);
  });
});
