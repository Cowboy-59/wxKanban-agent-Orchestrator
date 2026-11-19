// Spec 030 FR-014 — Decision-table tests for policy.evaluate(). The table
// IS the executable specification of the gate. Adding a new Capability
// requires adding new rows; CI failures on this test point straight at the
// unspecified cells.
//
// SCOPE-123 — the stage in the table is the stage of the SCOPE the command
// names. Scoped commands are judged on it; scope-creating and cross-cutting
// commands read no stage. Refusals carry a machine-readable code.
//
// Coverage:
// - Every scoped Capability allowed in its declared stages, blocked elsewhere
// - Scope-creating + cross-cutting allowed in every stage, with no scope at all
// - The classification of every Capability (FR-008), asserted exactly
// - Spec-first verification matrix for capabilities with requiresVerifiedSpec
// - Force override never bypasses
// - Message preservation (spec 030 FR-009) and the FR-004 / FR-005 messages

import { describe, it, expect } from "vitest";
import { LifecycleStage } from "../../../core/schemas/lifecycle";
import { Capability, capabilityScoping, gateTable } from "../../../core/policy/capabilities";
import {
  evaluate,
  formatBlockMessage,
  formatEscalationMessage,
  formatUnknownCommand,
  ScopeStageFacts,
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

function scopeIn(stage: LifecycleStage, overrides: Partial<ScopeStageFacts> = {}): ScopeStageFacts {
  return {
    scopeId: "scope-a",
    specNumber: "101",
    label: "SPEC-101",
    stage,
    taskCount: 4,
    openTaskCount: 2,
    blockers: [{ kind: "open_tasks", message: "2 of 4 tasks still open." }],
    ...overrides,
  };
}

const SCOPED: Array<{ capability: Capability; phases: LifecycleStage[]; displayName: string }> = [
  // SCOPE-123 FR-013 — implement also runs in QA and HumanTesting (fix work).
  {
    capability: Capability.ImplementTask,
    phases: [LifecycleStage.Implementation, LifecycleStage.QATesting, LifecycleStage.HumanTesting],
    displayName: "implement",
  },
  { capability: Capability.CreateTestTasks, phases: [LifecycleStage.Implementation], displayName: "createtesttasks" },
  { capability: Capability.RunQa, phases: [LifecycleStage.QATesting], displayName: "runqa" },
  { capability: Capability.RunHuman, phases: [LifecycleStage.HumanTesting], displayName: "runhuman" },
  { capability: Capability.PrepareRelease, phases: [LifecycleStage.Beta], displayName: "prepareRelease" },
  { capability: Capability.FinalizeRelease, phases: [LifecycleStage.Release], displayName: "finalizeRelease" },
];

const ANY_STAGE: Array<{ capability: Capability; displayName: string }> = [
  { capability: Capability.BuildScope, displayName: "buildscope" },
  // Amendment C, decision 10: createspecs re-pushes an amended scope in any stage.
  { capability: Capability.CreateSpecs, displayName: "createspecs" },
  { capability: Capability.WxConversion, displayName: "wxconversion" },
  { capability: Capability.CwConversionScope, displayName: "cwconversionscope" },
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

describe("policy.evaluate — scoped commands are judged on the named scope's stage", () => {
  for (const { capability, phases, displayName } of SCOPED) {
    for (const phase of ALL_PHASES) {
      const allowed = phases.includes(phase);
      it(`${capability} on a scope in ${phase} -> ${allowed ? "allowed" : "STAGE_DENIED"}`, () => {
        const decision = evaluate({
          capability,
          commandDisplayName: displayName,
          scope: scopeIn(phase),
          verification: VALID_VERIFICATION,
        });
        expect(decision.allowed).toBe(allowed);
        expect(decision.currentPhase).toBe(phase);
        if (!allowed) {
          expect(decision.refusal).toMatchObject({ code: "STAGE_DENIED", command: displayName, requiredStages: phases });
          expect(decision.refusal!.scope!.label).toBe("SPEC-101");
        }
      });
    }
  }

  it("a scoped command naming no scope is refused SCOPE_REQUIRED, never judged on a project value", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      verification: VALID_VERIFICATION,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal?.code).toBe("SCOPE_REQUIRED");
    expect(decision.currentPhase).toBeNull();
    expect(decision.reason).toContain("implement 123/T001");
  });
});

describe("policy.evaluate — scope-creating and cross-cutting commands run in every stage (FR-008)", () => {
  for (const { capability, displayName } of ANY_STAGE) {
    it(`${capability} is allowed with no scope named`, () => {
      const decision = evaluate({ capability, commandDisplayName: displayName });
      expect(decision.allowed).toBe(true);
      expect(decision.currentPhase).toBeNull();
    });
    it(`${capability} is allowed whatever stage a scope is in`, () => {
      for (const phase of ALL_PHASES) {
        expect(evaluate({ capability, commandDisplayName: displayName, scope: scopeIn(phase) }).allowed).toBe(true);
      }
    });
  }
});

describe("SCOPE-123 FR-008 — every command is classified; the list is asserted exactly", () => {
  it("classifies each Capability as scoped, scope-creating or cross-cutting", () => {
    expect({ ...capabilityScoping }).toEqual({
      BuildScope: "scope-creating",
      CreateSpecs: "scope-creating",
      ImplementTask: "scoped",
      CreateTestTasks: "scoped",
      RunQa: "scoped",
      RunHuman: "scoped",
      PrepareRelease: "scoped",
      FinalizeRelease: "scoped",
      DbPush: "cross-cutting",
      PipelineAgent: "cross-cutting",
      AuditFences: "cross-cutting",
      KitStatus: "cross-cutting",
      KitConfigure: "cross-cutting",
      ScaffoldFrontend: "cross-cutting",
      ArchiveFiles: "cross-cutting",
      WxConversion: "scope-creating",
      WxConversionScope: "scope-creating",
      CwConversion: "scope-creating",
      CwConversionScope: "scope-creating",
      VbConversion: "scope-creating",
      VbConversionScope: "scope-creating",
    });
  });

  it("every Capability has a class (a Record over the enum: a missing one is a compile error)", () => {
    for (const capability of Object.values(Capability) as Capability[]) {
      expect(capabilityScoping[capability]).toBeDefined();
    }
  });

  it("scoped rows name their stages; every other class runs in all stages", () => {
    for (const capability of Object.values(Capability) as Capability[]) {
      const all = gateTable[capability].allowedPhases === "all";
      expect(all).toBe(capabilityScoping[capability] !== "scoped");
    }
  });
});

describe("SCOPE-123 FR-004 — a stage refusal is actionable", () => {
  const decision = evaluate({
    capability: Capability.RunQa,
    commandDisplayName: "runqa",
    scope: scopeIn(LifecycleStage.Design, {
      taskCount: 14,
      openTaskCount: 14,
      blockers: [{ kind: "no_tasks", message: "unused" }],
    }),
    verification: VALID_VERIFICATION,
  });

  it("names the scope, its stage, the required stage and the open-task count", () => {
    expect(decision.reason).toContain("SPEC-101");
    expect(decision.reason).toContain("is in Design");
    expect(decision.reason).toContain("runs in QA");
    expect(decision.reason).toContain("14 of 14 task(s) still open");
  });

  it("names no project-level value", () => {
    expect(decision.reason).not.toMatch(/project/i);
  });

  it("is machine-readable: a code plus the scope facts", () => {
    expect(decision.refusal?.code).toBe("STAGE_DENIED");
    expect(decision.refusal?.scope?.openTaskCount).toBe(14);
    expect(decision.refusal?.requiredStages).toEqual([LifecycleStage.QATesting]);
  });

  it("names an open test gate as well as open tasks (FR-010)", () => {
    const gated = evaluate({
      capability: Capability.FinalizeRelease,
      commandDisplayName: "finalizeRelease",
      scope: scopeIn(LifecycleStage.QATesting, {
        openTaskCount: 0,
        blockers: [{ kind: "no_machine_tests", message: "The scope has no machine tests. Run /wxCreateTestPlan." }],
      }),
      verification: VALID_VERIFICATION,
    });
    expect(gated.reason).toContain("0 of 4 task(s) still open");
    expect(gated.reason).toContain("/wxCreateTestPlan");
  });
});

describe("SCOPE-123 Amendment C / review fixes — inactive and inferred scopes", () => {
  it("refuses a scoped command on an archived or deferred scope, whatever its stage", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: scopeIn(LifecycleStage.Implementation, { inactive: true }),
      verification: VALID_VERIFICATION,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal?.code).toBe("SCOPE_INACTIVE");
  });

  it("says when the scope's stage is inferred rather than recorded", () => {
    const decision = evaluate({
      capability: Capability.RunQa,
      commandDisplayName: "runqa",
      scope: scopeIn(LifecycleStage.Implementation, { tracked: false }),
      verification: VALID_VERIFICATION,
    });
    expect(decision.reason).toContain("inferred");
    expect(decision.reason).toContain("project.backfill_scope_stages");
    const recorded = evaluate({
      capability: Capability.RunQa,
      commandDisplayName: "runqa",
      scope: scopeIn(LifecycleStage.Implementation),
      verification: VALID_VERIFICATION,
    });
    expect(recorded.reason).not.toContain("inferred");
  });
});

describe("SCOPE-123 FR-005 — the stage denial and the unknown-command error are different", () => {
  it("the two strings are not equal, and the unknown one names no stage", () => {
    const denial = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "kit:configure",
      scope: scopeIn(LifecycleStage.Design),
      verification: VALID_VERIFICATION,
    }).reason;
    const unknown = formatUnknownCommand("kit:configure", ["dbpush", "implement"]);
    expect(denial).toBeDefined();
    expect(unknown).not.toBe(denial);
    for (const stage of ALL_PHASES) {
      expect(unknown).not.toContain(`'${stage}'`);
      expect(unknown).not.toContain(` ${stage} `);
    }
    expect(unknown).toMatch(/^UNKNOWN_COMMAND/);
    expect(denial).toMatch(/^STAGE_DENIED/);
  });
});

describe("policy.evaluate — Spec-first verification gate", () => {
  const inImplementation = scopeIn(LifecycleStage.Implementation);

  it("blocks spec-gated capability with no verification supplied", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: inImplementation,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.requiresSpecCheck).toBe(true);
    expect(decision.refusal?.code).toBe("SPEC_UNVERIFIED");
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
      commandDisplayName: "implement",
      scope: inImplementation,
      verification: { specExists: false, tasksExist: true, documentsExist: true },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(formatBlockMessage("implement", "Missing: spec"));
  });

  it("blocks spec-gated capability with missing tasks field", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: inImplementation,
      verification: { specExists: true, tasksExist: false, documentsExist: true },
    });
    expect(decision.reason).toBe(formatBlockMessage("implement", "Missing: tasks"));
  });

  it("blocks spec-gated capability with multiple missing fields", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: inImplementation,
      verification: { specExists: false, tasksExist: false, documentsExist: false },
    });
    expect(decision.reason).toBe(
      formatBlockMessage("implement", "Missing: spec, tasks, documents"),
    );
  });

  it("the spec STATUS no longer decides: the scope's stage does (FR-009, FR-013)", () => {
    // A scope in QA doing fix work has status 'qa' or 'implementing', neither of
    // which was in the old status list; the stage already answered.
    for (const specStatus of ["implementing", "qa", "draft"]) {
      const decision = evaluate({
        capability: Capability.ImplementTask,
        commandDisplayName: "implement",
        scope: scopeIn(LifecycleStage.QATesting),
        verification: { ...VALID_VERIFICATION, specStatus },
      });
      expect(decision.allowed).toBe(true);
    }
  });

  it("does NOT consult verification when capability does not require spec", () => {
    const decision = evaluate({ capability: Capability.DbPush, commandDisplayName: "dbpush" });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresSpecCheck).toBe(false);
  });
});

describe("policy.evaluate — Force override never bypasses", () => {
  it("force override on spec-gated capability with missing verification → blocked, overrideUsed=true", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: scopeIn(LifecycleStage.Implementation),
      verification: { specExists: false, tasksExist: false, documentsExist: false },
      override: { force: true, reason: "test override" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.overrideUsed).toBe(true);
    expect(decision.refusal?.code).toBe("ESCALATION_DENIED");
    expect(decision.reason).toBe(
      formatEscalationMessage("implement", "test override", ["spec", "tasks", "documents"]),
    );
  });

  it("force override cannot move a stage denial either", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: scopeIn(LifecycleStage.Design),
      verification: VALID_VERIFICATION,
      override: { force: true, reason: "let me through" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusal?.code).toBe("STAGE_DENIED");
  });

  it("force override without reason is ignored (no escalation, normal block)", () => {
    const decision = evaluate({
      capability: Capability.ImplementTask,
      commandDisplayName: "implement",
      scope: scopeIn(LifecycleStage.Implementation),
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

describe("policy.evaluate — Message preservation (spec 030 FR-009)", () => {
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

  it("the 6 capabilities requiring verified spec are exactly the post-Design scoped ones", () => {
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
});
