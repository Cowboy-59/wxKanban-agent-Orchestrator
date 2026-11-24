/**
 * [SCOPE 159 / T017] Run links and outcomes (FR-081, FR-082).
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunRecorder, emptyOutcomes, reworkOf } from "../../apps/remote-bridge/src/run-record";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "rr-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const now = () => new Date("2026-11-24T10:00:00Z");
const links = { taskId: "T017", specId: "SPEC-159", scopeId: "SCOPE-159" };

describe("UT-086 run links", () => {
  it("every run carries task, spec and scope ids; brainstorm is none when absent", () => {
    const r = new RunRecorder(tmp(), now);
    const rec = r.save("run1", { ...links, ledgerIds: ["D-0001"] });
    expect(rec.links).toMatchObject({ ...links, brainstormRecord: "none", ledgerIds: ["D-0001"] });
    expect(r.read()).toHaveLength(1);
  });
  it("a run missing an id is refused", () => {
    expect(() => new RunRecorder(tmp(), now).save("r", { taskId: "T1", specId: "", scopeId: "S" })).toThrow(/specId/);
  });
});

describe("UT-087 outcomes", () => {
  it("a failed test and a blocked attempt both show, and the secret in the reason is masked", () => {
    const r = new RunRecorder(tmp(), now);
    const o = emptyOutcomes();
    o.tests.failed = 1;
    o.blocked.push({ what: "git push", why: "key AKIAIOSFODNN7EXAMPLE denied" });
    r.save("run2", links, o);
    const [rec] = r.read();
    expect(rec?.outcomes.tests.failed).toBe(1);
    expect(rec?.outcomes.blocked).toHaveLength(1);
    expect(JSON.stringify(rec)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
  it("rework counts only the three recorded events", () => {
    const base = { taskId: "T1", at: "a", finishedAt: "f" };
    expect(reworkOf({ kind: "task_reopened", ...base })?.reason).toBe("task_reopened");
    expect(reworkOf({ kind: "gate_sent_back", ...base })?.reason).toBe("gate_sent_back");
    expect(reworkOf({ kind: "test_failed_on_finished", ...base })?.reason).toBe("test_failed_on_finished");
    expect(reworkOf({ kind: "rerun_before_done", ...base })).toBeNull();
    expect(reworkOf({ kind: "edit", ...base })).toBeNull();
  });
  it("records older than 30 days are pruned", () => {
    const root = tmp();
    const dir = join(root, ".wxai", "run-log");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "runs-2026-09-01.jsonl"), "{}\n");
    new RunRecorder(root, now).save("r", links);
    expect(readdirSync(dir)).toEqual(["runs-2026-11-24.jsonl"]);
  });
});
