// SPEC-143 / T007 — difficulty class rule with owner override (FR-004, contract C3).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { classify, overrideDifficulty } from "../../../_wxAI/routing/difficulty.mjs";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "routing-difficulty-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("classify", () => {
  it.each(["security", "auth", "money", "schema", "migration", "production"])("a task touching %s is heavy whatever its file count", (t) => {
    for (const files of [0, 1, 3, 5]) {
      const out = classify({ files, acceptanceCriteria: 1, touches: [t] });
      expect(out.difficulty).toBe("heavy");
      expect(out.reasons).toContain(`touches ${t}`);
    }
  });

  it("matches touches case-insensitively and lists every heavy reason", () => {
    const out = classify({ files: 9, acceptanceCriteria: 6, touches: ["Security", " AUTH "], escalated: true });
    expect(out.difficulty).toBe("heavy");
    expect(out.reasons).toEqual(["touches security", "touches auth", "9 files (more than 5)", "6 acceptance criteria (more than 4)", "already escalated"]);
  });

  it("heavy at more than 5 files, more than 4 criteria, or escalated; not at the boundary", () => {
    expect(classify({ files: 6 }).difficulty).toBe("heavy");
    expect(classify({ files: 5 }).difficulty).toBe("moderate");
    expect(classify({ files: 1, acceptanceCriteria: 5 }).difficulty).toBe("heavy");
    expect(classify({ files: 1, acceptanceCriteria: 4 }).difficulty).toBe("easy");
    expect(classify({ files: 1, escalated: true }).difficulty).toBe("heavy");
  });

  it("moderate for 2 to 5 files or new logic with tests", () => {
    expect(classify({ files: 2 })).toEqual({ difficulty: "moderate", reasons: ["2 files (2 to 5)"] });
    expect(classify({ files: 1, newLogicWithTests: true })).toEqual({ difficulty: "moderate", reasons: ["new logic with tests"] });
  });

  it("easy otherwise; lists count as their length", () => {
    expect(classify({ files: ["a.ts"], acceptanceCriteria: ["one"] }).difficulty).toBe("easy");
    expect(classify({}).difficulty).toBe("easy");
    expect(classify({ files: 1, touches: ["docs", "ui"] }).difficulty).toBe("easy");
  });

  it("US2: rename easy, 3-file feature with tests moderate, auth change heavy", () => {
    expect(classify({ files: 1, acceptanceCriteria: 1 }).difficulty).toBe("easy");
    expect(classify({ files: 3, acceptanceCriteria: 3, newLogicWithTests: true }).difficulty).toBe("moderate");
    expect(classify({ files: 1, acceptanceCriteria: 2, touches: ["auth"] }).difficulty).toBe("heavy");
  });

  it("is deterministic", () => {
    const input = { files: 4, acceptanceCriteria: 2, touches: ["ui"] };
    expect(classify(input)).toEqual(classify(input));
  });

  it.each([[-1], [2.5], ["many"], [true]])("rejects a bad file count %j", (files) => {
    expect(() => classify({ files: files as never })).toThrow(TypeError);
  });

  it("rejects touches that are not a list", () => {
    expect(() => classify({ touches: "security" as never })).toThrow(TypeError);
  });
});

describe("overrideDifficulty", () => {
  it("appends one C5 override event", () => {
    const out = overrideDifficulty(root, "T042", "heavy", "andy", { from: "moderate", command: "implement" });
    expect(out.difficulty).toBe("heavy");
    const lines = readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const ev = JSON.parse(lines[0]);
    expect(Object.keys(ev)).toEqual(["time", "event", "taskid", "command", "from", "to", "reason", "evidence"]);
    expect(ev).toMatchObject({ event: "override", taskid: "T042", command: "implement", from: "moderate", to: "heavy", evidence: "by andy" });
    expect(Number.isNaN(Date.parse(ev.time))).toBe(false);
  });

  it("appends, never rewrites", () => {
    overrideDifficulty(root, "T1", "easy", "andy");
    overrideDifficulty(root, "T2", "moderate", "andy");
    const lines = readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf8").trim().split("\n");
    expect(lines.map((l) => JSON.parse(l).taskid)).toEqual(["T1", "T2"]);
  });

  it.each([
    ["T1", "extreme", "andy"],
    ["", "easy", "andy"],
    ["T1", "easy", ""],
  ])("rejects bad input (%j, %j, %j) and writes nothing", (taskid, difficulty, by) => {
    expect(() => overrideDifficulty(root, taskid, difficulty, by)).toThrow(TypeError);
    expect(() => readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf8")).toThrow();
  });
});
