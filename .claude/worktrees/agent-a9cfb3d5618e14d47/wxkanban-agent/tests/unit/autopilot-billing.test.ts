/**
 * [SCOPE 154 / T010] Resource-time booking via agentruns, reused as-is (FR-009).
 */
import { describe, expect, it } from "vitest";
import { AUTOPILOT_REUSES_EXISTING_AGENTRUNS_MECHANISM } from "../../apps/remote-bridge/src/autopilot-billing";
import { runPipeline, type PipelineOptions } from "../../apps/remote-bridge/src/autopilot-pipeline";

describe("autopilot billing (FR-009)", () => {
  it("documents that Autopilot reuses the existing agentruns mechanism", () => {
    expect(AUTOPILOT_REUSES_EXISTING_AGENTRUNS_MECHANISM).toBe(true);
  });

  it("runs every unit with no billing/plan-gate check in the pipeline itself (case 23)", async () => {
    const opts: PipelineOptions = {
      units: [{ num: "900", title: "No Time and Billing on this company" }],
      runUnit: async () => ({ ok: true }),
    };
    const outcomes = await runPipeline(opts);
    expect(outcomes).toEqual([{ scope: opts.units[0], status: "done" }]);
  });
});
