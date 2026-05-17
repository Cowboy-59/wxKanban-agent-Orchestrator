"use strict";
// Spec 030 — Canonical Capability enum + Stage Gate table for the kit's
// workflow operations. Single source of truth for which operations are
// permitted in which Lifecycle Phase, and which require a verified spec.
// Both the CLI adapter and MCP adapter translate their surface-specific
// names to a Capability and consult this module via policy.evaluate().
Object.defineProperty(exports, "__esModule", { value: true });
exports.gateTable = exports.Capability = void 0;
const lifecycle_1 = require("../schemas/lifecycle");
var Capability;
(function (Capability) {
    // Stage-gated capabilities (each permitted in exactly one Lifecycle Phase)
    Capability["BuildScope"] = "BuildScope";
    Capability["CreateSpecs"] = "CreateSpecs";
    Capability["ImplementTask"] = "ImplementTask";
    Capability["CreateTestTasks"] = "CreateTestTasks";
    Capability["RunQa"] = "RunQa";
    Capability["RunHuman"] = "RunHuman";
    Capability["PrepareRelease"] = "PrepareRelease";
    Capability["FinalizeRelease"] = "FinalizeRelease";
    // Cross-cutting capabilities (permitted in every Lifecycle Phase)
    Capability["DbPush"] = "DbPush";
    Capability["PipelineAgent"] = "PipelineAgent";
    Capability["AuditFences"] = "AuditFences";
    Capability["KitStatus"] = "KitStatus";
})(Capability || (exports.Capability = Capability = {}));
exports.gateTable = {
    [Capability.BuildScope]: {
        allowedPhases: [lifecycle_1.LifecycleStage.Design],
        requiresVerifiedSpec: false,
        allowsEscalation: false,
    },
    [Capability.CreateSpecs]: {
        allowedPhases: [lifecycle_1.LifecycleStage.Design],
        requiresVerifiedSpec: false,
        allowsEscalation: false,
    },
    [Capability.ImplementTask]: {
        allowedPhases: [lifecycle_1.LifecycleStage.Implementation],
        requiresVerifiedSpec: true,
        allowsEscalation: false,
    },
    [Capability.CreateTestTasks]: {
        allowedPhases: [lifecycle_1.LifecycleStage.Implementation],
        requiresVerifiedSpec: true,
        allowsEscalation: false,
    },
    [Capability.RunQa]: {
        allowedPhases: [lifecycle_1.LifecycleStage.QATesting],
        requiresVerifiedSpec: true,
        allowsEscalation: false,
    },
    [Capability.RunHuman]: {
        allowedPhases: [lifecycle_1.LifecycleStage.HumanTesting],
        requiresVerifiedSpec: true,
        allowsEscalation: false,
    },
    [Capability.PrepareRelease]: {
        allowedPhases: [lifecycle_1.LifecycleStage.Beta],
        requiresVerifiedSpec: true,
        allowsEscalation: false,
    },
    [Capability.FinalizeRelease]: {
        allowedPhases: [lifecycle_1.LifecycleStage.Release],
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
};
// Spec 030 FR-010 — Module-load drift assert.
// Fires synchronously at first import if Capability enum and gateTable
// disagree. Catches the most common future regression (add a Capability,
// forget the gate row) before any runtime caller can be silently misled.
(function assertCapabilityGateConsistency() {
    const allCapabilities = Object.values(Capability);
    for (const cap of allCapabilities) {
        if (!(cap in exports.gateTable)) {
            throw new Error(`capabilities.ts drift: Capability.${cap} has no gateTable row.`);
        }
    }
    for (const key of Object.keys(exports.gateTable)) {
        if (!allCapabilities.includes(key)) {
            throw new Error(`capabilities.ts drift: gateTable key '${key}' is not a valid Capability member.`);
        }
    }
})();
//# sourceMappingURL=capabilities.js.map