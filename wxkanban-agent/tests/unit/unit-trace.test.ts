/** [SCOPE 159 / T020] T017 recorder and T019 status hooks fed by the unit trace (FR-081, FR-082, FR-085). */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnitTrace, specIdOf } from "../../apps/remote-bridge/src/unit-trace";
import { RunRecorder } from "../../apps/remote-bridge/src/run-record";
import { PARALLEL_STATUS_REL } from "../../apps/remote-bridge/src/parallel-status";

const unit = { num: "159", title: "Common room", text: "Implements SPEC-159 tasks" };

describe("UT-034 unit trace", () => {
  it("rewrites the status file on start, park and finish", () => {
    const root = mkdtempSync(join(tmpdir(), "wx-trace-"));
    const t = new UnitTrace({ root });
    const read = () => readFileSync(join(root, PARALLEL_STATUS_REL), "utf8");
    t.start(unit);
    expect(read()).toContain("| running |");
    t.end(unit, { ok: false, parkedGates: [{ project: "p", scope: "SCOPE-159", question: "Push now?", blocks: "release" }] });
    expect(read()).toContain("| parked | Push now? |");
    t.start(unit);
    t.end(unit, { ok: true });
    expect(read()).toContain("| finished |");
  });

  it("saves one run record per unit with links, gates and a masked blocker", () => {
    const root = mkdtempSync(join(tmpdir(), "wx-trace-"));
    const t = new UnitTrace({ root });
    t.start(unit);
    t.gate(unit, "L-1", "KAIN");
    t.end(unit, { ok: false, error: "failed with key AKIAIOSFODNN7EXAMPLE" });
    const [rec] = new RunRecorder(root).read();
    expect(rec?.links).toMatchObject({ taskId: "unit:159", specId: "SPEC-159", scopeId: "SCOPE-159", brainstormRecord: "none" });
    expect(rec?.outcomes.gates).toEqual([{ gateId: "L-1", answeredBy: "KAIN" }]);
    expect(JSON.stringify(rec)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("never throws on an unwritable root and never leaves spec id empty", () => {
    const t = new UnitTrace({ root: "\0bad" });
    expect(() => {
      t.start(unit);
      t.end(unit, { ok: true });
    }).not.toThrow();
    expect(specIdOf({ num: "1", title: "x" })).toBe("unresolved");
  });
});
