// SPEC-143 T013 / FR-010: comparison plans and records. Internal projects only; never billed.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { planComparison, projectKind, recordOutcomes } from "../../../_wxAI/routing/compare.mjs";
import { buildReport } from "../../../_wxAI/routing/report.mjs";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "routing-compare-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
function settings(root: string, text: string): void {
  mkdirSync(join(root, "decisions"), { recursive: true });
  writeFileSync(join(root, "decisions", "settings.yaml"), text, "utf-8");
}

describe("project kind", () => {
  it("defaults to internal and reads both inline and block forms", () => {
    const root = tmp();
    expect(projectKind(root)).toBe("internal");
    settings(root, "project: { kind: client }\n");
    expect(projectKind(root)).toBe("client");
    settings(root, "gate:\n  a: 1\nproject:\n  kind: client\n");
    expect(projectKind(root)).toBe("client");
    settings(root, "project:\n  kind: internal\n");
    expect(projectKind(root)).toBe("internal");
  });
});

describe("planComparison", () => {
  it("emits two worktree paths, git commands, and a comparison id without running anything", () => {
    const root = tmp();
    const plan = planComparison({ root, taskid: "T5", current: "claude-sonnet-5-5", candidate: "claude-haiku-5-5", difficulty: "easy" });
    expect(plan.ok).toBe(true);
    expect(plan.worktrees).toHaveLength(2);
    expect(plan.worktrees[0].path).not.toBe(plan.worktrees[1].path);
    expect(plan.worktrees[1].route).toBe("official");
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0]).toContain("worktree add");
    expect(existsSync(plan.worktrees[0].path)).toBe(false);
  });

  it("refuses a client project and logs the refusal", () => {
    const root = tmp();
    settings(root, "project: { kind: client }\n");
    const plan = planComparison({ root, taskid: "T5", current: "a", candidate: "b" });
    expect(plan.ok).toBe(false);
    expect(plan.refused).toBe(true);
    const log = readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf-8");
    expect(JSON.parse(log.trim().split("\n")[0]).event).toBe("refusal");
  });

  it("T029: refuses a side that is not a Claude model on the official client, and logs it", () => {
    for (const candidate of ["claude-haiku-5-5:omniroute", "llama-4-scout", "omniroute/claude-haiku-5-5"]) {
      const root = tmp();
      const plan = planComparison({ root, taskid: "T5", current: "claude-sonnet-5-5", candidate, difficulty: "easy" });
      expect(plan.ok, candidate).toBe(false);
      expect(plan.refused).toBe(true);
      expect(plan.fallbackModel).toBe("claude-haiku-5-5");
      const ev = readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
      expect(ev.map((e) => e.event)).toEqual(["refusal"]);
    }
  });
});

describe("recordOutcomes", () => {
  const outcomes = {
    comparisonid: "cmp-1",
    taskid: "T5",
    difficulty: "easy",
    command: "implement",
    runs: [
      { variant: "current", model: "claude-sonnet-5-5", route: "official", firstpass: true, inputtokens: 1000, outputtokens: 100, activeseconds: 600 },
      { variant: "candidate", model: "claude-haiku-5-5", route: "official", firstpass: false, inputtokens: 1000, outputtokens: 100, activeseconds: 720 },
    ],
  };

  it("writes two C1 records sharing the comparison id, flagged never-billed, and logs a comparison event", () => {
    const root = tmp();
    const res = recordOutcomes({ root, outcomes });
    expect(res.ok).toBe(true);
    const recs = readFileSync(join(root, "decisions", "agentrun-log.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.comparisonid === "cmp-1" && r.neverbilled === true)).toBe(true);
    expect(recs[1].cachereadtokens).toBeNull();
    expect(readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf-8")).toContain('"comparison"');
  });

  it("never reaches the billable view", () => {
    const root = tmp();
    recordOutcomes({ root, outcomes });
    expect(buildReport({ root }).json.billable.tasks).toEqual({});
  });

  it("refuses on a client project and rejects malformed outcomes", () => {
    const root = tmp();
    expect(() => recordOutcomes({ root, outcomes: { ...outcomes, runs: [outcomes.runs[0]] } })).toThrow();
    settings(root, "project: { kind: client }\n");
    expect(recordOutcomes({ root, outcomes }).ok).toBe(false);
    expect(existsSync(join(root, "decisions", "agentrun-log.jsonl"))).toBe(false);
  });

  it("T029: refuses outcomes with a run off the official client or on another provider, writing no record", () => {
    for (const bad of [{ route: "omniroute" }, { provider: "groq", model: "llama-4" }]) {
      const root = tmp();
      const runs = [outcomes.runs[0], { ...outcomes.runs[1], ...bad }];
      const res = recordOutcomes({ root, outcomes: { ...outcomes, runs } });
      expect(res.ok).toBe(false);
      expect(res.refused).toBe(true);
      expect(existsSync(join(root, "decisions", "agentrun-log.jsonl"))).toBe(false);
      expect(readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf-8")).toContain('"refusal"');
    }
  });
});
