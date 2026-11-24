/**
 * [SCOPE 159 / T010] Run board: survives restart, ids only, Manager-written.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlockLog } from "../../apps/remote-bridge/src/worker-guard";
import { RunBoardStore } from "../../apps/remote-bridge/src/run-board";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "rb-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("UT-047 run board", () => {
  it("a fresh store sees the same scopes, assignments and checkpoint after a restart", () => {
    const root = tmp();
    new RunBoardStore({ root, projectId: "p1" }).update((b) => {
      b.scopes.push({ scopeId: "S1", specId: "P1" });
      b.assignments.push({ taskId: "T1", worker: "w1", persona: "builder" });
      b.checkpoint = { at: "2026-11-24T00:00:00Z", taskId: "T1" };
    });
    const b = new RunBoardStore({ root, projectId: "p1" }).load();
    expect(b.scopes).toEqual([{ scopeId: "S1", specId: "P1" }]);
    expect(b.assignments[0]).toEqual({ taskId: "T1", worker: "w1", persona: "builder" });
    expect(b.checkpoint?.taskId).toBe("T1");
  });
  it("holds ids only: a status or title field is stripped", () => {
    const root = tmp();
    new RunBoardStore({ root, projectId: "p1" }).update((b) => {
      b.assignments.push({ taskId: "T1", worker: "w1", persona: "x", status: "done", title: "secret title" } as never);
    });
    const raw = readFileSync(join(root, ".wxai", "run-board.json"), "utf8");
    expect(raw).not.toContain("status");
    expect(raw).not.toContain("secret title");
  });
  it("a worker-marked write is refused and counted; a damaged file gives an empty board", () => {
    const blocks = new BlockLog();
    const root = tmp();
    const s = new RunBoardStore({ root, projectId: "p1", env: { WXAI_WORKER: "1" }, blocks });
    expect(s.update(() => undefined)).toEqual({ ok: false, reason: "worker_refused" });
    expect(blocks.count()).toBe(1);
    expect(new RunBoardStore({ root, projectId: "other" }).load().scopes).toEqual([]);
  });
});
