/**
 * [SCOPE 159 / T009] Work memory: one writer, masked, capped, append-only, company wall.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlockLog } from "../../apps/remote-bridge/src/worker-guard";
import { WORK_MEMORY_CAP, WorkMemory, mainRepoPath, maskAndCap } from "../../apps/remote-bridge/src/work-memory";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "wm-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const hist = (task: string) => ({ task, scope: "S1", spec: "P1", done: "did it", files: ["a.ts"], problems: "none", ledgerIds: ["L-1"], testResult: "pass" });

describe("UT-046 work memory", () => {
  it("one history entry per task; a repeat and an edit are refused", () => {
    const wm = new WorkMemory({ root: tmp(), companyId: "c1", projectId: "p1" });
    expect(wm.append("history", hist("T1")).ok).toBe(true);
    expect(wm.append("history", hist("T1"))).toEqual({ ok: false, reason: "duplicate_task" });
    expect(wm.edit("history-1")).toEqual({ ok: false, reason: "append_only" });
    const r = wm.read("history", "c1");
    expect(r.ok && r.rows).toHaveLength(1);
  });
  it("an over-cap write is cut and marked; a secret never reaches the file", () => {
    const root = tmp();
    const wm = new WorkMemory({ root, companyId: "c1", projectId: "p1" });
    const secret = "AKIAIOSFODNN7EXAMPLE";
    wm.append("nugget", { question: `key ${secret} ${"x".repeat(5000)}`, choice: "c", why: "w", alternatives: "a", preference: "p" });
    const raw = readFileSync(join(root, "decisions", "workmemory-nuggets.jsonl"), "utf8");
    expect(raw).not.toContain(secret);
    expect(raw).toMatch(/\[cut: \d+ characters over cap\]/);
    expect(maskAndCap("y".repeat(WORK_MEMORY_CAP + 7))).toMatch(/\[cut: 7 characters over cap\]$/);
  });
  it("a worker-marked process is refused and counted", () => {
    const blocks = new BlockLog();
    const wm = new WorkMemory({ root: tmp(), companyId: "c1", projectId: "p1", env: { WXAI_WORKER: "1" }, blocks });
    expect(wm.append("future", { idea: "i", deferredBecause: "later" })).toEqual({ ok: false, reason: "worker_refused" });
    expect(blocks.count()).toBe(1);
  });
  it("a cross-company read is refused", () => {
    const wm = new WorkMemory({ root: tmp(), companyId: "c1", projectId: "p1" });
    wm.append("future", { idea: "i", deferredBecause: "later" });
    expect(wm.read("future", "c2")).toEqual({ ok: false, reason: "cross_company" });
  });
  it("a worktree reads from the main repo path", () => {
    expect(mainRepoPath("/r/wxKanban/.claude/worktrees/agent-1").replace(/\\/g, "/")).toMatch(/\/r\/wxKanban$/);
    expect(mainRepoPath("/r/wxKanban").replace(/\\/g, "/")).toMatch(/\/r\/wxKanban$/);
  });
});
