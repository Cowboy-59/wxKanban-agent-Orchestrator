// Spec 030 FR-014 — Decision-table tests for policy.evaluate(). The table
// IS the executable specification of the gate. Adding a new Capability
// requires adding new rows; CI failures on this test point straight at the
// unspecified cells.
//
// Coverage:
// - Every Capability allowed in its declared phase + cross-cutting in all phases
// - Every stage-gated Capability blocked in non-matching phases
// - Spec-first verification matrix (none, valid, missing-fields, partial,
//   invalid-status) for capabilities with requiresVerifiedSpec: true
// - Force override never bypasses (always logged as overrideUsed but never
//   allowed: true)
// - Byte-identical error/block/escalation message preservation (FR-009)

import { describe, it, expect } from "vitest";
import { LifecycleStage } from "../../../core/schemas/lifecycle";
import { Capability, gateTable } from "../../../core/policy/capabilities";
import {
  evaluate,
  formatBlockMessage,
  formatEscalationMessage,
  SpecVerification,
} from "../../../core/policy/policy";

const ALL_PHASES: LifecycleStage[] = [
  LifecycleStage.Design,
  LifecycleStage.Implementation,
  LifecycleStage.QATesting,
  LifecycleStage.HumanTesting,
  LifecycleStage.Beta,
  LifecycleStage.Release,
];

const STAGE_GATED_PAIRS: Array<{ capability: Capability; phase: LifecycleStage; displayName: string }> = [
  { capability: Capability.BuildScope, phase: LifecycleStage.Design, displayName: "buildscope" },
  { capability: Capability.CreateSpecs, phase: LifecycleStage.Design, displayName: "createspecs" },
  { capability: Capability.ImplementTask, phase: LifecycleStage.Implementation, displayName: "implement" },
  { capability: Capability.CreateTestTasks, phase: LifecycleStage.Implementation, displayName: "createtesttasks" },
  { capability: Capability.RunQa, phase: LifecycleStage.QATesting, displayName: "runqa" },
  { capability: Capability.RunHuman, phase: LifecycleStage.HumanTesting, displayName: "runhuman" },
  { capability: Capability.PrepareRelease, phase: LifecycleStage.Beta, displayName: "prepareRelease" },
  { capability: Capability.FinalizeRelease, phase: LifecycleStage.Release, displayName: "finalizeRelease" },
];

const CROSS_CUTTING: Array<{ capability: Capability; displayName: string }> = [
  { capability: Capability.DbPush, displayName: "dbpush" },
  { capability: Capability.PipelineAgent, displayName: "pipeline-agent" },
  { capability: Capability.AuditFences, displayName: "auditfences" },
  { capability: Capability.KitStatus, displayName: "kit:status" },
];

const VALID_VERIFICATION: SpecVerification = {
  specExists: true,
  tasksExist: true,
  documentsExist: true,
  specStatus: "tasks_generated",
};

describe("policy.evaluate — Stage gate decision table", () => {
  describe("stage-gated capabilities allowed in their declared phase", () => {
    for (const { capability, phase, displayName } of STAGE_GATED_PAIRS) {
      it(`${capability} is allowed in ${phase} (with valid verification when required)`, () => {
        const decision = evaluate({
          capability,
          currentPhase: phase,
          commandDisplayName: displayName,
          verification: VALID_VERIFICATION,
        });
        expect(decision.allowed).toBe(true);
        expect(decision.capability).toBe(capability);
        expect(decision.currentPhase).toBe(phase);
        expect(decision.overrideUsed).toBe(false);
      });
    }
  });

  describe("stage-gated capabilities blocked in non-matching phases", () => {
    for (const { capability, phase, displayName } of STAGE_GATED_PAIRS) {
      for (const otherPhase of ALL_PHASES) {
        if (otherPhase === phase) continue;
        it(`${capability} is blocked in ${otherPhase} (declared: ${phase})`, () => {
          const decision = evaluate({
            capability,
            currentPhase: otherPhase,
            commandDisplayName: displayName,
            verification: VALID_VERIFICATION,
          });
          expect(decision.allowed).toBe(false);
          expect(decision.reason).toBe(
            `Command '${displayName}' is not permitted in the '${otherPhase}' stage.`,
          );
        });
      }
    }
  });

  describe("cross-cutting capabilities allowed in every phase", () => {
    for (const { capability, displayName } of CROSS_CUTTING) {
      for (const phase of ALL_PHASES) {
        it(`${capability} is allowed in ${phase}`, () => {
          const decision = evaluate({
            capability,
            currentPhase: phase,
            commandDisplayName: displayName,
          });
          expect(decision.allowed).toBe(true);
          expect(decision.requiresSpecCheck).toBe(false);
          expect(decision.overrideUsed).toBe(false);
        });
      }
    }
  });
});

describe("policy.evaluate — Spec-first verification gate", () => {
  it("blocks spec-gated capability with no verification supplied", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.requiresSpecCheck).toBe(true);
    expect(decision.reason).toBe(
      formatBlockMessage(
        "implement",
        "Spec verification not performed. Run spec check before implementation.",
      ),
    );
  });

  it("blocks spec-gated capability with missing spec field", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: { specExists: false, tasksExist: true, documentsExist: true },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(formatBlockMessage("implement", "Missing: spec"));
  });

  it("blocks spec-gated capability with missing tasks field", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: { specExists: true, tasksExist: false, documentsExist: true },
    });
    expect(decision.reason).toBe(formatBlockMessage("implement", "Missing: tasks"));
  });

  it("blocks spec-gated capability with multiple missing fields", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: { specExists: false, tasksExist: false, documentsExist: false },
    });
    expect(decision.reason).toBe(
      formatBlockMessage("implement", "Missing: spec, tasks, documents"),
    );
  });

  it("blocks spec-gated capability with invalid specStatus", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: {
        specExists: true,
        tasksExist: true,
        documentsExist: true,
        specStatus: "draft",
      },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Spec status 'draft' is not valid for implementation/);
  });

  it("does NOT consult verification when capability does not require spec", () => {
    // Cross-cutting capability called without verification — should pass through
    const decision = evaluate({
      capability: Capability.DbPush,
      currentPhase: LifecycleStage.Beta,
      commandDisplayName: "dbpush",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresSpecCheck).toBe(false);
  });
});

describe("policy.evaluate — Force override never bypasses", () => {
  it("force override on spec-gated capability with missing verification → blocked, overrideUsed=true", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: { specExists: false, tasksExist: false, documentsExist: false },
      override: { force: true, reason: "test override" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.overrideUsed).toBe(true);
    expect(decision.reason).toBe(
      formatEscalationMessage("implement", "test override", ["spec", "tasks", "documents"]),
    );
  });

  it("force override on invalid spec status → blocked, overrideUsed=true", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: {
        specExists: true,
        tasksExist: true,
        documentsExist: true,
        specStatus: "draft",
      },
      override: { force: true, reason: "status override" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.overrideUsed).toBe(true);
    expect(decision.reason).toMatch(/ESCALATION REQUESTED — COMMAND STILL BLOCKED/);
  });

  it("force override without reason is ignored (no escalation, normal block)", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Implementation,
      commandDisplayName: "implement",
      verification: { specExists: false, tasksExist: false, documentsExist: false },
      override: { force: true, reason: "" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.overrideUsed).toBe(false);
  });

  it("every gate-table row has allowsEscalation: false (no Capability ever permits override)", () => {
    for (const capability of Object.values(Capability) as Capability[]) {
      expect(gateTable[capability].allowsEscalation).toBe(false);
    }
  });
});

describe("policy.evaluate — Byte-identical message preservation (FR-009)", () => {
  it("rejection message for stage mismatch", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      currentPhase: LifecycleStage.Design,
      commandDisplayName: "implement",
      verification: VALID_VERIFICATION,
    });
    expect(decision.reason).toBe(
      "Command 'implement' is not permitted in the 'Design' stage.",
    );
  });

  it("block message preserves the canonical header + Required Actions list", () => {
    const msg = formatBlockMessage("implement", "Missing: spec");
    expect(msg).toMatch(/^IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED/);
    expect(msg).toMatch(/1\. Complete wxAI pipeline Phase 4\.5 \(Task Push\)/);
    expect(msg).toMatch(/_wxAI\/commands\/wxAI-pipeline-mandatory-database\.md/);
  });

  it("escalation message preserves the canonical header + reason interpolation", () => {
    const msg = formatEscalationMessage("implement", "my reason", ["spec"]);
    expect(msg).toMatch(/^ESCALATION REQUESTED — COMMAND STILL BLOCKED/);
    expect(msg).toMatch(/Reason given: my reason/);
    expect(msg).toMatch(/Missing prerequisites: spec/);
    expect(msg).toMatch(/Force overrides are logged but NEVER bypass enforcement/);
  });
});

describe("gateTable consistency (spec 030 FR-010 module-load assert)", () => {
  it("every Capability has exactly one gate row", () => {
    for (const capability of Object.values(Capability) as Capability[]) {
      expect(gateTable[capability]).toBeDefined();
    }
  });

  it("every gate row references a real Capability", () => {
    const validCaps = new Set(Object.values(Capability));
    for (const key of Object.keys(gateTable)) {
      expect(validCaps.has(key as Capability)).toBe(true);
    }
  });

  it("the 6 capabilities requiring verified spec are exactly the post-Design stage-gated ones", () => {
    const requireVerified = (Object.values(Capability) as Capability[]).filter(
      (c) => gateTable[c].requiresVerifiedSpec,
    );
    expect(requireVerified.sort()).toEqual([
      Capability.CreateTestTasks,
      Capability.FinalizeRelease,
      Capability.ImplementTask,
      Capability.PrepareRelease,
      Capability.RunHuman,
      Capability.RunQa,
    ].sort());
  });

  it("the 4 cross-cutting capabilities have allowedPhases: 'all'", () => {
    const crossCutting = (Object.values(Capability) as Capability[]).filter(
      (c) => gateTable[c].allowedPhases === "all",
    );
    expect(crossCutting.sort()).toEqual([
      Capability.AuditFences,
      Capability.DbPush,
      Capability.KitStatus,
      Capability.PipelineAgent,
    ].sort());
  });
});
