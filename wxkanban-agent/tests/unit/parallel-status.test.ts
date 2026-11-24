/**
 * [SCOPE 159 / T019] Parallel status file (FR-085).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { capInForce, windowOf, writeParallelStatus, type StatusHeader } from "../../apps/remote-bridge/src/parallel-status";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ps-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const h: StatusHeader = { window: "day", capInForce: 3, userCap: 3, machineMax: 8, presenceSetBy: "none", workingShare: 0.67 };

describe("UT-094 status file", () => {
  it("a state change shows in the file at once (inside the 10 second bound)", () => {
    const root = tmp();
    const t0 = Date.now();
    writeParallelStatus(root, h, [{ unit: "SPEC-1", agent: "w1", worktree: "wt1", state: "running" }]);
    writeParallelStatus(root, h, [{ unit: "SPEC-1", agent: "w1", worktree: "wt1", state: "parked", question: "which table?" }]);
    const txt = readFileSync(join(root, "docs", "GOD-Parallel-Status.md"), "utf8");
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(txt).toContain("| SPEC-1 | w1 | wt1 | parked | which table? |");
    expect(txt).toContain("Agents working: 67% (target 70%)");
  });
  it("no secret and no contact detail appear", () => {
    const root = tmp();
    writeParallelStatus(root, h, [{ unit: "u", agent: "a", worktree: "w", state: "parked", question: "mail bob@example.com or +1 555 123 4567 key AKIAIOSFODNN7EXAMPLE" }]);
    const txt = readFileSync(join(root, "docs", "GOD-Parallel-Status.md"), "utf8");
    for (const s of ["bob@example.com", "555 123 4567", "AKIAIOSFODNN7EXAMPLE"]) expect(txt).not.toContain(s);
  });
  it("night or a live remote session lifts the cap to the machine max; the setter is named", () => {
    expect(windowOf(new Date(2026, 10, 24, 19, 0))).toBe("night");
    expect(windowOf(new Date(2026, 10, 24, 6, 0))).toBe("day");
    expect(capInForce(3, 8, "night", false)).toEqual({ cap: 8, presenceSetBy: "night_window" });
    expect(capInForce(3, 8, "day", true)).toEqual({ cap: 8, presenceSetBy: "bridge" });
    expect(capInForce(12, 8, "day", false)).toEqual({ cap: 8, presenceSetBy: "none" });
  });
});
