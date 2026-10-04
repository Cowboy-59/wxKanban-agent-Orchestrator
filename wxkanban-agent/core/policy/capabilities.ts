// Spec 030 — Canonical Capability enum + Stage Gate table for the kit's
// workflow operations. Single source of truth for which operations are
// permitted in which Lifecycle Phase, and which require a verified spec.
// Both the CLI adapter and MCP adapter translate their surface-specific
// names to a Capability and consult this module via policy.evaluate().

import { LifecycleStage } from "../schemas/lifecycle";

export enum Capability {
  // Stage-gated capabilities (each permitted in exactly one Lifecycle Phase)
  BuildScope = "BuildScope",
  CreateSpecs = "CreateSpecs",
  ImplementTask = "ImplementTask",
  CreateTestTasks = "CreateTestTasks",
  RunQa = "RunQa",
  RunHuman = "RunHuman",
  PrepareRelease = "PrepareRelease",
  FinalizeRelease = "FinalizeRelease",
  // Cross-cutting capabilities (permitted in every Lifecycle Phase)
  DbPush = "DbPush",
  PipelineAgent = "PipelineAgent",
  AuditFences = "AuditFences",
  KitStatus = "KitStatus",
  // SCOPE-095 Amendment A / T007 — the hosted-MCP bootstrap command. Cross-
  // cutting by necessity: it runs on a project that has no lifecycle stage yet.
  KitConfigure = "KitConfigure",
  ScaffoldFrontend = "ScaffoldFrontend",
  // Spec 103 / T007 — reconcile a scope/spec group's on-disk files to its
  // archived status (move to/from specs/_archive/). Local FS only, every phase.
  ArchiveFiles = "ArchiveFiles",
  // WinDev/WebDev conversion FROM the technical-doc PDF (Design-only, no spec).
  WxConversion = "WxConversion",
  // Scope generation over the converted artifacts (Design-only, no spec).
  WxConversionScope = "WxConversionScope",
  // Clarion (SoftVelocity/PCSoft) conversion FROM TXA/TXD/.clw source (Design-only, no spec).
  CwConversion = "CwConversion",
  // Scope generation over the converted Clarion artifacts (Design-only, no spec).
  CwConversionScope = "CwConversionScope",
  // Visual Basic 6 conversion FROM .vbp/.frm/.bas/.cls source (Design-only, no spec).
  VbConversion = "VbConversion",
  // Scope generation over the converted VB6 artifacts (Design-only, no spec).
  VbConversionScope = "VbConversionScope",
}

export interface CapabilityGate {
  allowedPhases: LifecycleStage[] | "all";
  requiresVerifiedSpec: boolean;
  // Force overrides are logged but NEVER bypass enforcement.
  // Preserves the contract from the pre-refactor command-policy.ts.
  allowsEscalation: false;
}

// SCOPE-123 FR-008 — every command is one of three classes:
//   scoped          acts on one named scope; gated on THAT scope's stage
//   scope-creating  creates a scope (or amends one); what it creates starts in
//                   Design, so it runs in every stage
//   cross-cutting   acts on no scope; runs in every stage
// No class reads a project stage. A Record over the enum makes leaving a
// Capability out a compile error, so a new command cannot default silently.
export type CommandScoping = "scoped" | "scope-creating" | "cross-cutting";

export const capabilityScoping: Readonly<Record<Capability, CommandScoping>> = {
  [Capability.BuildScope]: "scope-creating",
  // Amendment C, decision 10: createspecs re-pushes an amended scope's specs and
  // tasks in place, whatever stage the scope has reached.
  [Capability.CreateSpecs]: "scope-creating",
  [Capability.ImplementTask]: "scoped",
  [Capability.CreateTestTasks]: "scoped",
  [Capability.RunQa]: "scoped",
  [Capability.RunHuman]: "scoped",
  [Capability.PrepareRelease]: "scoped",
  [Capability.FinalizeRelease]: "scoped",
  [Capability.DbPush]: "cross-cutting",
  [Capability.PipelineAgent]: "cross-cutting",
  [Capability.AuditFences]: "cross-cutting",
  [Capability.KitStatus]: "cross-cutting",
  [Capability.KitConfigure]: "cross-cutting",
  [Capability.ScaffoldFrontend]: "cross-cutting",
  [Capability.ArchiveFiles]: "cross-cutting",
  [Capability.WxConversion]: "scope-creating",
  [Capability.WxConversionScope]: "scope-creating",
  [Capability.CwConversion]: "scope-creating",
  [Capability.CwConversionScope]: "scope-creating",
  [Capability.VbConversion]: "scope-creating",
  [Capability.VbConversionScope]: "scope-creating",
} as const;

export const gateTable: Readonly<Record<Capability, CapabilityGate>> = {
  // SCOPE-123 FR-008 — scope-creating: every stage (was Design-only on the
  // project stage, which blocked amending a running scope).
  [Capability.BuildScope]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  // SCOPE-123 Amendment C — scope-creating: every stage (createSpecs moves a
  // scope out of Design, so Design-only would refuse every amendment re-push).
  [Capability.CreateSpecs]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  // SCOPE-123 FR-013 — fix work: a scope in QA or HumanTesting with a failing
  // test must be fixable through the tool. Nothing moves backward.
  [Capability.ImplementTask]: {
    allowedPhases: [
      LifecycleStage.Implementation,
      LifecycleStage.QATesting,
      LifecycleStage.HumanTesting,
    ],
    requiresVerifiedSpec: true,
    allowsEscalation: false,
  },
  [Capability.CreateTestTasks]: {
    allowedPhases: [LifecycleStage.Implementation],
    requiresVerifiedSpec: true,
    allowsEscalation: false,
  },
  [Capability.RunQa]: {
    allowedPhases: [LifecycleStage.QATesting],
    requiresVerifiedSpec: true,
    allowsEscalation: false,
  },
  [Capability.RunHuman]: {
    allowedPhases: [LifecycleStage.HumanTesting],
    requiresVerifiedSpec: true,
    allowsEscalation: false,
  },
  // [SCOPE 111 / T042] Both release capabilities MUST consult the test gate
  // before promoting, once a handler exists for them (there is none today —
  // these are declared capabilities with no implementation yet).
  //
  // Call `project.test_gate_status` and refuse on any forced item it reports:
  //   prepareRelease  → requirement 'ai'   (the pre-UAT machine gate)
  //   finalizeRelease → requirement 'all'  (every forced item, project-wide)
  //
  // Do NOT re-derive the verdict here. The application's phase views read the
  // same tool, and a second implementation will disagree with the first exactly
  // at a release — the moment it costs the most to be wrong about.
  [Capability.PrepareRelease]: {
    allowedPhases: [LifecycleStage.Beta],
    requiresVerifiedSpec: true,
    allowsEscalation: false,
  },
  [Capability.FinalizeRelease]: {
    allowedPhases: [LifecycleStage.Release],
    requiresVerifiedSpec: true,
    allowsEscalation: false,
  },
  [Capability.DbPush]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.PipelineAgent]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.AuditFences]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.KitStatus]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  // SCOPE-095 Amendment A / T007 — bootstrap. Stage-gating this command is a
  // contradiction: it writes the config the stage is read from, so any gate
  // narrower than "all" locks the customer out of their own setup.
  [Capability.KitConfigure]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.ScaffoldFrontend]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.ArchiveFiles]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  // SCOPE-123 FR-008 — the conversion commands are scope-creating: what they
  // produce starts in Design, so they run in every stage (were Design-only on
  // the project stage). They still cannot require a verified spec.
  [Capability.WxConversion]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.WxConversionScope]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.CwConversion]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.CwConversionScope]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.VbConversion]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.VbConversionScope]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
} as const;

// [SCOPE 123 / T012] BEGIN — assertScopingConsistency: classes and gate rows must agree
// Fires at first import. A scoped command must name the stages it runs in; a
// scope-creating or cross-cutting command must run in every stage, because
// nothing it could be gated on describes the scope it is about to create or
// the project as a whole.
(function assertScopingConsistency(): void {
  for (const cap of Object.values(Capability) as Capability[]) {
    const scoping = capabilityScoping[cap];
    if (scoping === undefined) {
      throw new Error(`capabilities.ts drift: Capability.${cap} is not classified scoped/scope-creating/cross-cutting.`);
    }
    const phases = gateTable[cap].allowedPhases;
    if (scoping === "scoped" && phases === "all") {
      throw new Error(`capabilities.ts drift: scoped Capability.${cap} must list the stages it runs in.`);
    }
    if (scoping !== "scoped" && phases !== "all") {
      throw new Error(`capabilities.ts drift: ${scoping} Capability.${cap} must run in every stage.`);
    }
  }
})();
// [SCOPE 123 / T012] END

// Spec 030 FR-010 — Module-load drift assert.
// Fires synchronously at first import if Capability enum and gateTable
// disagree. Catches the most common future regression (add a Capability,
// forget the gate row) before any runtime caller can be silently misled.
(function assertCapabilityGateConsistency(): void {
  const allCapabilities = Object.values(Capability) as Capability[];
  for (const cap of allCapabilities) {
    if (!(cap in gateTable)) {
      throw new Error(
        `capabilities.ts drift: Capability.${cap} has no gateTable row.`,
      );
    }
  }
  for (const key of Object.keys(gateTable)) {
    if (!allCapabilities.includes(key as Capability)) {
      throw new Error(
        `capabilities.ts drift: gateTable key '${key}' is not a valid Capability member.`,
      );
    }
  }
})();
