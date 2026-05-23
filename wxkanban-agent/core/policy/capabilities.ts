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
  ScaffoldFrontend = "ScaffoldFrontend",
}

export interface CapabilityGate {
  allowedPhases: LifecycleStage[] | "all";
  requiresVerifiedSpec: boolean;
  // Force overrides are logged but NEVER bypass enforcement.
  // Preserves the contract from the pre-refactor command-policy.ts.
  allowsEscalation: false;
}

export const gateTable: Readonly<Record<Capability, CapabilityGate>> = {
  [Capability.BuildScope]: {
    allowedPhases: [LifecycleStage.Design],
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.CreateSpecs]: {
    allowedPhases: [LifecycleStage.Design],
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
  [Capability.ImplementTask]: {
    allowedPhases: [LifecycleStage.Implementation],
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
  [Capability.ScaffoldFrontend]: {
    allowedPhases: "all",
    requiresVerifiedSpec: false,
    allowsEscalation: false,
  },
} as const;

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
