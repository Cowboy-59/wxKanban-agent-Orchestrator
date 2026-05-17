"use strict";
// Spec 030 FR-006 — MCP surface adapter. Translates MCP tool names to
// Capability, resolves current phase + spec verification from the DB in
// parallel, then delegates to the pure policy.evaluate(). Returns the
// existing StageEnforcementResult shape so today's mcp-server call site
// needs only an import-path swap.
//
// Per spec 030 FR-008, spec-first verification is enforced uniformly
// across both surfaces. The MCP adapter always feeds the resolved
// SpecVerification into policy.evaluate() — closing the pre-refactor gap
// where MCP allowed spec-gated tools without verification.
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTool = enforceTool;
const capabilities_1 = require("../capabilities");
const policy_1 = require("../policy");
const resolve_current_phase_1 = require("../resolve-current-phase");
const resolve_spec_verification_1 = require("../resolve-spec-verification");
// Spec 030 FR-006 — exhaustive 12-row mapping. Each row carries the bare
// CLI command name as displayName so the message strings produced by
// policy.evaluate() are byte-identical across CLI and MCP surfaces (FR-009).
// 3 mappings target currently-registered MCP tools; 9 are reserved for
// the follow-up MCP parity scope (handlers don't exist yet — these rows
// are inert at runtime since the MCP server never dispatches them).
const MCP_TOOL_MAP = {
    // Currently registered (live)
    "project.buildscope": {
        capability: capabilities_1.Capability.BuildScope,
        displayName: "buildscope",
    },
    "project.create_specs": {
        capability: capabilities_1.Capability.CreateSpecs,
        displayName: "createspecs",
    },
    "project.implement": {
        capability: capabilities_1.Capability.ImplementTask,
        displayName: "implement",
    },
    // Inert until MCP parity scope registers the handlers
    "project.createtesttasks": {
        capability: capabilities_1.Capability.CreateTestTasks,
        displayName: "createtesttasks",
    },
    "project.runqa": { capability: capabilities_1.Capability.RunQa, displayName: "runqa" },
    "project.runhuman": {
        capability: capabilities_1.Capability.RunHuman,
        displayName: "runhuman",
    },
    "project.prepareRelease": {
        capability: capabilities_1.Capability.PrepareRelease,
        displayName: "prepareRelease",
    },
    "project.finalizeRelease": {
        capability: capabilities_1.Capability.FinalizeRelease,
        displayName: "finalizeRelease",
    },
    "project.dbpush": {
        capability: capabilities_1.Capability.DbPush,
        displayName: "dbpush",
    },
    "project.pipeline_agent": {
        capability: capabilities_1.Capability.PipelineAgent,
        displayName: "pipeline-agent",
    },
    "project.auditfences": {
        capability: capabilities_1.Capability.AuditFences,
        displayName: "auditfences",
    },
    "project.kit_status": {
        capability: capabilities_1.Capability.KitStatus,
        displayName: "kit:status",
    },
};
async function enforceTool(db, projectId, toolName) {
    const mapping = MCP_TOOL_MAP[toolName];
    // Unmapped tool name → pass through ungated (preserves the legacy
    // enforceStage behavior for the 30+ non-gated MCP tools like
    // project.help, project.create_task, project.session_start, etc.).
    if (!mapping) {
        return {
            allowed: true,
            currentStage: null,
            requestedTool: toolName,
        };
    }
    let currentPhase;
    let verification;
    try {
        [currentPhase, verification] = await Promise.all([
            (0, resolve_current_phase_1.resolveCurrentPhase)(db, projectId),
            (0, resolve_spec_verification_1.resolveSpecVerification)(db, projectId),
        ]);
    }
    catch (err) {
        if (err instanceof resolve_current_phase_1.ProjectNotFoundError) {
            return {
                allowed: false,
                currentStage: null,
                requestedTool: toolName,
                reason: err.message,
            };
        }
        throw err;
    }
    const decision = (0, policy_1.evaluate)({
        capability: mapping.capability,
        currentPhase,
        commandDisplayName: mapping.displayName,
        verification,
    });
    return {
        allowed: decision.allowed,
        currentStage: currentPhase,
        requestedTool: toolName,
        reason: decision.reason,
    };
}
//# sourceMappingURL=mcp-adapter.js.map