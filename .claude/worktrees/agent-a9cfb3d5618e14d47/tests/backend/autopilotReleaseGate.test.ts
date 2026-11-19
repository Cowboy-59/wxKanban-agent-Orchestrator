/**
 * [SCOPE 154 / T012] Release gate — FR-012. Covers tests.md cases 25 and 26.
 */
import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_RELEASE_GATE_OPEN,
  AUTOPILOT_RELEASE_PREREQUISITES,
  isAutopilotReleaseGateOpen,
} from "../../src/server/services/AutopilotReleaseGate.js";

describe("Autopilot release gate (FR-012)", () => {
  it("passes when all three prerequisites are confirmed built (case 25)", () => {
    expect(
      isAutopilotReleaseGateOpen({
        handoffGuardFixed: true,
        apiKeyStrippedFromChildSession: true,
        pipelineWired: true,
      }),
    ).toBe(true);
  });

  it("fails closed when any prerequisite is unconfirmed (case 26)", () => {
    expect(
      isAutopilotReleaseGateOpen({
        handoffGuardFixed: true,
        apiKeyStrippedFromChildSession: false,
        pipelineWired: true,
      }),
    ).toBe(false);
    expect(
      isAutopilotReleaseGateOpen({
        handoffGuardFixed: false,
        apiKeyStrippedFromChildSession: true,
        pipelineWired: true,
      }),
    ).toBe(false);
    expect(
      isAutopilotReleaseGateOpen({
        handoffGuardFixed: true,
        apiKeyStrippedFromChildSession: true,
        pipelineWired: false,
      }),
    ).toBe(false);
  });

  it("is currently OPEN — all three prerequisites confirmed built (pipelineWired fixed 2026-11-08)", () => {
    expect(AUTOPILOT_RELEASE_PREREQUISITES.handoffGuardFixed).toBe(true);
    expect(AUTOPILOT_RELEASE_PREREQUISITES.apiKeyStrippedFromChildSession).toBe(true);
    expect(AUTOPILOT_RELEASE_PREREQUISITES.pipelineWired).toBe(true);
    expect(AUTOPILOT_RELEASE_GATE_OPEN).toBe(true);
  });
});
