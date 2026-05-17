"use strict";
// Spec 030 — Pure stage-gate + spec-first decision engine. No IO. No global
// state. Inputs are values; output is a Decision. Both the CLI and MCP
// adapters call this function with their surface-specific name mapped to a
// Capability. Message format functions are ported byte-identical from the
// pre-refactor command-policy.ts (spec 030 FR-009).
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_IMPLEMENTATION_STATUSES = void 0;
exports.evaluate = evaluate;
exports.formatEscalationMessage = formatEscalationMessage;
exports.formatBlockMessage = formatBlockMessage;
const capabilities_1 = require("./capabilities");
// Valid spec statuses that allow implementation to proceed. Ported byte-
// identical from the pre-refactor command-policy.ts SPEC_GATED check.
exports.VALID_IMPLEMENTATION_STATUSES = [
    "tasks_generated",
    "in_progress",
    "ready_for_implementation",
    "planned",
];
function evaluate(input) {
    const { capability, currentPhase, commandDisplayName, verification, override } = input;
    const gate = capabilities_1.gateTable[capability];
    // Stage gate (first check).
    const stageAllowed = gate.allowedPhases === "all" || gate.allowedPhases.includes(currentPhase);
    if (!stageAllowed) {
        return {
            allowed: false,
            reason: `Command '${commandDisplayName}' is not permitted in the '${currentPhase}' stage.`,
            capability,
            currentPhase,
            requiresSpecCheck: gate.requiresVerifiedSpec,
            overrideUsed: false,
        };
    }
    // If capability doesn't require spec verification, pass through.
    if (!gate.requiresVerifiedSpec) {
        return {
            allowed: true,
            capability,
            currentPhase,
            requiresSpecCheck: false,
            overrideUsed: false,
        };
    }
    // Spec-first verification gate.
    if (!verification) {
        return {
            allowed: false,
            reason: formatBlockMessage(commandDisplayName, "Spec verification not performed. Run spec check before implementation."),
            capability,
            currentPhase,
            requiresSpecCheck: true,
            overrideUsed: false,
        };
    }
    const missing = [];
    if (!verification.specExists)
        missing.push("spec");
    if (!verification.tasksExist)
        missing.push("tasks");
    if (!verification.documentsExist)
        missing.push("documents");
    if (missing.length > 0) {
        // Force override is logged but NEVER bypasses enforcement (gate.allowsEscalation
        // is `false` for every Capability — preserves today's contract).
        if (override?.force && override.reason) {
            return {
                allowed: false,
                reason: formatEscalationMessage(commandDisplayName, override.reason, missing),
                capability,
                currentPhase,
                requiresSpecCheck: true,
                overrideUsed: true,
            };
        }
        return {
            allowed: false,
            reason: formatBlockMessage(commandDisplayName, `Missing: ${missing.join(", ")}`),
            capability,
            currentPhase,
            requiresSpecCheck: true,
            overrideUsed: false,
        };
    }
    if (verification.specStatus &&
        !exports.VALID_IMPLEMENTATION_STATUSES.includes(verification.specStatus)) {
        if (override?.force && override.reason) {
            return {
                allowed: false,
                reason: formatEscalationMessage(commandDisplayName, override.reason, [
                    `spec status: ${verification.specStatus}`,
                ]),
                capability,
                currentPhase,
                requiresSpecCheck: true,
                overrideUsed: true,
            };
        }
        return {
            allowed: false,
            reason: formatBlockMessage(commandDisplayName, `Spec status '${verification.specStatus}' is not valid for implementation. Valid statuses: ${exports.VALID_IMPLEMENTATION_STATUSES.join(", ")}`),
            capability,
            currentPhase,
            requiresSpecCheck: true,
            overrideUsed: false,
        };
    }
    return {
        allowed: true,
        capability,
        currentPhase,
        requiresSpecCheck: true,
        overrideUsed: false,
    };
}
// Spec 030 FR-009 — Ported byte-identical from pre-refactor command-policy.ts.
// Any change to these strings is a release-gating concern (existing tests and
// downstream consumers may pattern-match on the literal text).
function formatEscalationMessage(command, reason, missing) {
    return `ESCALATION REQUESTED — COMMAND STILL BLOCKED

Command '${command}' cannot proceed. A force override was requested but overrides are not permitted.

Reason given: ${reason}
Missing prerequisites: ${missing.join(", ")}

This escalation has been logged for admin review. To proceed:
1. An admin must resolve the missing prerequisites in the wxKanban database
2. Or an admin must approve the escalation via the admin UI
3. Then retry the command

Force overrides are logged but NEVER bypass enforcement in wxKanban.`;
}
function formatBlockMessage(command, details) {
    return `IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED

Command '${command}' cannot proceed because the specification is not properly verified in the wxKanban database.

${details}

Required Actions:
1. Complete wxAI pipeline Phase 4.5 (Task Push)
2. Run: createspecs to generate spec artifacts
3. Run: dbpush to sync to database
4. Re-verify database status
5. Retry command

Reference: _wxAI/commands/wxAI-pipeline-mandatory-database.md`;
}
//# sourceMappingURL=policy.js.map