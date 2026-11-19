// SPEC-142 T008 / T011 / T012 / T017: the Ask Gate flow.
//
// Runs against the REAL Ledger-area modules (ledger, search, file backend, settings, log) in a
// throwaway project, so what passes here is what the hook does. Only the slow memory service is
// a stand-in, injected to prove the 2000 ms budget. The global tier is pointed at an empty temp
// directory so the developer's own ~/.wxai is never read.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { appendEntry } from "../../../_wxAI/askgate/ledger.mjs";
import { fileBackend } from "../../../_wxAI/askgate/file.mjs";
import { search as realSearch } from "../../../_wxAI/askgate/search.mjs";
import {
  appendAssumption,
  defaultOption,
  mainRepoRootOf,
  runGate,
  searchWithinBudget,
  statusLine,
} from "../../../_wxAI/askgate/gate.mjs";

const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

const PRORATION = {
  scope: "SCOPE-142",
  question: "How are endorsements prorated?",
  decision: "Daily, on the endorsement effective date.",
  rationale: "Matches the carrier's billing.",
  kind: "Agreed",
  evidence: "confirmed",
  source: "docs/brainstorms/x.md#4",
  date: "2026-10-22",
};

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function project(mode: "observe" | "enforce" | null, entries: Record<string, unknown>[] = [PRORATION]): { root: string; globalRoot: string } {
// [SCOPE 142 / T008] END
  const root = mkdtempSync(join(tmpdir(), "askgate-gate-"));
  const globalRoot = mkdtempSync(join(tmpdir(), "askgate-global-"));
  temps.push(root, globalRoot);
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "decisions"));
  if (mode) writeFileSync(join(root, "decisions", "settings.yaml"), `gate:\n  mode: ${mode}\n  matchThreshold: 0.5\n`);
  for (const e of entries) appendEntry(root, e, "owner");
  return { root, globalRoot };
}

const logLines = (root: string) => {
  const f = join(root, "decisions", "gate-log.jsonl");
  return existsSync(f) ? readFileSync(f, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const ledgerBytes = (root: string) => readFileSync(join(root, "decisions", "ledger.yaml"), "utf-8");

const gate = (root: string, globalRoot: string, items: { text: string; options?: unknown[] }[], extra: Record<string, unknown> = {}) =>
  runGate(items, { root, globalRoot, session: "s-1", intercept: "tool", deps: { backends: [fileBackend], routeBlocker: null, ...(extra.deps as object) }, ...extra });

describe("enforce mode", () => {
  it("US1: a covered question is answered with the decision text and ID, and logged once", async () => {
    const { root, globalRoot } = project("enforce");
    const g = await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }]);
    expect(g.decision).toBe("stop");
    expect(g.reason).toContain("D-0001");
    expect(g.reason).toContain("Daily, on the endorsement effective date.");
    expect(g.reason).toMatch(/why each decision applies/);
    const log = logLines(root);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ intercept: "tool", outcome: "answered", ledgerId: "D-0001", mode: "enforce", wouldHaveAnswered: true, session: "s-1" });
    expect(typeof log[0].score).toBe("number");
  });

  it("US4: an uncovered ordinary question becomes an assumption; ledger unchanged", async () => {
    const { root, globalRoot } = project("enforce");
    const before = ledgerBytes(root);
    const g = await gate(root, globalRoot, [{ text: "Should the log line use ISO 8601 timestamps or epoch milliseconds?", options: [{ label: "Epoch ms" }, { label: "ISO 8601 (Recommended)" }] }]);
    expect(g.decision).toBe("stop");
    expect(g.reason).toMatch(/most reasonable default/);
    expect(g.reason).toContain("ISO 8601 (Recommended)");
    const yaml = readFileSync(join(root, "decisions", "assumptions.yaml"), "utf-8");
    expect(yaml).toContain('question: "Should the log line use ISO 8601 timestamps or epoch milliseconds?"');
    expect(yaml).toContain('defaultChosen: "ISO 8601 (Recommended)"');
    expect(yaml).toContain("reviewed: false");
    expect(ledgerBytes(root)).toBe(before);
    expect(logLines(root)).toMatchObject([{ outcome: "assumed", class: "assumption", ledgerId: null }]);
  });

  it("a blocker lets the question through to the developer and is logged", async () => {
    const { root, globalRoot } = project("enforce");
    const g = await gate(root, globalRoot, [{ text: "Can I load the production customer table into my local database?" }]);
    expect(g.decision).toBe("let-through");
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
    expect(logLines(root)).toMatchObject([{ outcome: "passed-through", class: "blocker" }]);
  });

  it("a blocker goes to route.mjs when it is there, which logs it (still exactly one line)", async () => {
    const { root, globalRoot } = project("enforce");
    const calls: unknown[] = [];
    const routeBlocker = async (r: string, outcome: unknown, ctx: { question: string }) => {
      calls.push({ r, outcome, ctx });
      writeFileSync(join(r, "decisions", "gate-log.jsonl"), JSON.stringify({ outcome: "queued", question: ctx.question }) + "\n", { flag: "a" });
      return { route: "queue", dqId: "DQ-07", alsoRoom: false };
    };
    const g = await gate(root, globalRoot, [{ text: "Should I deploy this to App Runner tonight?" }], { deps: { routeBlocker } });
    expect(calls).toHaveLength(1);
    expect(g.decision).toBe("stop");
    expect(g.reason).toContain("DQ-07");
    expect(g.reason).toMatch(/stop work on this unit/);
    expect(logLines(root)).toHaveLength(1);
  });

  it("a mixed call (one answered, one blocker) reaches the developer; the agent is told what is decided", async () => {
    const { root, globalRoot } = project("enforce");
    const g = await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }, { text: "Should I push to main now?" }]);
    expect(g.decision).toBe("let-through");
    expect(g.note).toContain("D-0001");
    const log = logLines(root);
    expect(log).toHaveLength(2);
    expect(log.map((l) => l.outcome)).toEqual(["passed-through", "passed-through"]);
    expect(log.find((l) => /prorated/.test(l.question))).toMatchObject({ ledgerId: "D-0001", wouldHaveAnswered: true });
    expect(log.find((l) => /push/.test(l.question))).toMatchObject({ class: "blocker", ledgerId: null });
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
  });

  it("a superseded decision never answers", async () => {
    const { root, globalRoot } = project("enforce");
    appendEntry(root, { ...PRORATION, decision: "Monthly, on the billing date.", kind: "Changed", supersedes: "D-0001" }, "owner");
    const g = await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }]);
    expect(g.reason).toContain("D-0002");
    expect(g.reason).not.toContain("Daily, on the endorsement effective date.");
  });

  it("an evidence:unknown entry never answers, and makes the question a blocker", async () => {
    const { root, globalRoot } = project("enforce", [{ ...PRORATION, kind: "Parked", evidence: "unknown" }]);
    const g = await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }]);
    expect(g.decision).toBe("let-through");
    expect(logLines(root)).toMatchObject([{ outcome: "passed-through", class: "blocker", ledgerId: null }]);
  });

  it("regression (found by hand): a partial match to a decision is a blocker, never an assumption", async () => {
    const { root, globalRoot } = project("enforce");
    const g = await gate(root, globalRoot, [{ text: "Before I write the calculation: how are endorsements prorated?" }]);
    expect(g.decision).toBe("let-through");
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
    expect(logLines(root)).toMatchObject([{ outcome: "passed-through", class: "blocker" }]);
  });

  it("an empty question is a blocker and still gets its one log line", async () => {
    const { root, globalRoot } = project("enforce");
    const g = await gate(root, globalRoot, []);
    expect(g.decision).toBe("let-through");
    expect(logLines(root)).toMatchObject([{ outcome: "passed-through", class: "blocker" }]);
  });
});

describe("observe mode (FR-013, US7)", () => {
  it("is the default, never stops, and logs would-have-answered, score and class", async () => {
    const { root, globalRoot } = project(null);
    const g = await gate(root, globalRoot, [
      { text: "How are endorsements prorated?" },
      { text: "Should I name the helper formatDuration or durationToText?" },
      { text: "Should I drop the invoices_archive table?" },
    ]);
    expect(g.mode).toBe("observe");
    expect(g.decision).toBe("let-through");
    const log = logLines(root);
    expect(log).toHaveLength(3);
    expect(log.every((l) => l.outcome === "observed" && l.mode === "observe")).toBe(true);
    expect(log[0]).toMatchObject({ wouldHaveAnswered: true, ledgerId: "D-0001", class: null });
    expect(log[1]).toMatchObject({ wouldHaveAnswered: false, class: "assumption" });
    expect(log[2]).toMatchObject({ wouldHaveAnswered: false, class: "blocker" });
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
  });

  it("switching to enforce needs only the setting, no reinstall", async () => {
    const { root, globalRoot } = project("observe");
    expect((await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }])).decision).toBe("let-through");
    writeFileSync(join(root, "decisions", "settings.yaml"), "gate:\n  mode: enforce\n  matchThreshold: 0.5\n");
    expect((await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }])).decision).toBe("stop");
  });
});

describe("the 2000 ms budget and the status line (T017, FR-017, US6)", () => {
  const slowService = (ms: number) => ({
    name: "openviking",
    available: async () => true,
    search: () => new Promise((r) => setTimeout(() => r([]), ms).unref()),
  });
  const downService = { name: "openviking", available: async () => false, search: async () => [] };

  it("US6: a slow service is cut off at the budget; the file backend answers; fellBack shown", async () => {
    const { root, globalRoot } = project("enforce");
    const t0 = Date.now();
    const g = await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }], { budgetMs: 300, deps: { backends: [slowService(10_000), fileBackend], routeBlocker: null } });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(g.decision).toBe("stop");
    expect(g.reason).toContain("D-0001");
    expect(g.status).toBe("Ask Gate: memory service down (file fallback) [enforce]");
  });

  it("the gate's own guard holds even when search ignores its budget", async () => {
    const hangingSearch = (q: string, opts: { backends: { name: string }[] }) =>
      opts.backends.some((b) => b.name !== "file") ? new Promise(() => {}) : realSearch(q, opts);
    const { root, globalRoot } = project("enforce");
    const t0 = Date.now();
    const s = await searchWithinBudget("How are endorsements prorated?", {
      search: hangingSearch, root, mainRepoRoot: root, threshold: 0.5, backends: [slowService(10_000), fileBackend], budgetMs: 250, globalRoot,
    } as never);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(s).toMatchObject({ status: "answered", backend: "file", fellBack: true });
  });

  it("a service that is down falls back at once", async () => {
    const { root, globalRoot } = project("enforce");
    const g = await gate(root, globalRoot, [{ text: "How are endorsements prorated?" }], { deps: { backends: [downService, fileBackend], routeBlocker: null } });
    expect(g.decision).toBe("stop");
    expect(g.status).toMatch(/down \(file fallback\)/);
  });

  it("status: up, down, not installed", () => {
    expect(statusLine([{ backend: "openviking", fellBack: false, serviceRegistered: true }], "observe")).toBe("Ask Gate: memory service up [observe]");
    expect(statusLine([{ backend: "file", fellBack: true, serviceRegistered: true }], "enforce")).toBe("Ask Gate: memory service down (file fallback) [enforce]");
    expect(statusLine([{ backend: "file", fellBack: false, serviceRegistered: false }], "observe")).toBe("Ask Gate: memory service not installed (file search) [observe]");
  });
});

describe("helpers", () => {
  it("reads the ledger from the main repo, never a worktree", () => {
    const main = mkdtempSync(join(tmpdir(), "askgate-main-"));
    const wt = mkdtempSync(join(tmpdir(), "askgate-wt-"));
    temps.push(main, wt);
    mkdirSync(join(main, ".git", "worktrees", "unit-a"), { recursive: true });
    writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "unit-a")}\n`);
    mkdirSync(join(wt, "src"));
    expect(mainRepoRootOf(join(wt, "src")).toLowerCase()).toBe(main.toLowerCase());
    expect(mainRepoRootOf(main).toLowerCase()).toBe(main.toLowerCase());
  });

  it("assumptions.yaml stays a valid list when appended to repeatedly, quotes included", () => {
    const root = mkdtempSync(join(tmpdir(), "askgate-asm-"));
    temps.push(root);
    appendAssumption(root, { time: "t1", question: 'Use "a" or b?', defaultChosen: "a", agent: "x" });
    appendAssumption(root, { time: "t2", question: "Second: yes?", defaultChosen: null, agent: "y" });
    const text = readFileSync(join(root, "decisions", "assumptions.yaml"), "utf-8");
    expect(text.match(/^- time:/gm)).toHaveLength(2);
    expect(text).toContain('question: "Use \\"a\\" or b?"');
    expect(text).toContain("defaultChosen: null");
  });

  it("the default is the recommended option, else the first", () => {
    expect(defaultOption([{ label: "A" }, { label: "B (Recommended)" }])).toBe("B (Recommended)");
    expect(defaultOption([{ label: "A" }, { label: "B" }])).toBe("A");
    expect(defaultOption([])).toBeNull();
  });
});
