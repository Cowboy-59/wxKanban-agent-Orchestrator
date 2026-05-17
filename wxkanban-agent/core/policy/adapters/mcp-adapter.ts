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

import { Capability } from "../capabilities";
import { evaluate, Decision } from "../policy";
import {
  resolveCurrentPhase,
  PhaseQueryClient,
  ProjectNotFoundError,
} from "../resolve-current-phase";
import {
  resolveSpecVerification,
  SpecVerificationQueryClient,
} from "../resolve-spec-verification";

// Mirrors the StageEnforcementResult interface from the pre-refactor
// mcp-server/src/utils/stage-enforcement.ts so the call site in
// mcp-server/src/server.ts compiles unchanged.
export interface StageEnforcementResult {
  allowed: boolean;
  currentStage: string | null;
  requestedTool: string;
  reason?: string;
}

// DB shape this adapter expects. Combines the two resolver interfaces;
// any client satisfying both works (FenceDbClient does; a Drizzle
// instance wrapped with `(sql, params) => db.execute(sqlRaw(sql, params))`
// does too).
export interface McpDbClient
  extends PhaseQueryClient,
    SpecVerificationQueryClient {}

// Spec 030 FR-006 — exhaustive 12-row mapping. Each row carries the bare
// CLI command name as displayName so the message strings produced by
// policy.evaluate() are byte-identical across CLI and MCP surfaces (FR-009).
// 3 mappings target currently-registered MCP tools; 9 are reserved for
// the follow-up MCP parity scope (handlers don't exist yet — these rows
// are inert at runtime since the MCP server never dispatches them).
const MCP_TOOL_MAP: Readonly<
  Record<string, { capability: Capability; displayName: string }>
> = {
  // Currently registered (live)
  "project.buildscope": {
    capability: Capability.BuildScope,
    displayName: "buildscope",
  },
  "project.create_specs": {
    capability: Capability.CreateSpecs,
    displayName: "createspecs",
  },
  "project.implement": {
    capability: Capability.ImplementTask,
    displayName: "implement",
  },
  // Inert until MCP parity scope registers the handlers
  "project.createtesttasks": {
    capability: Capability.CreateTestTasks,
    displayName: "createtesttasks",
  },
  "project.runqa": { capability: Capability.RunQa, displayName: "runqa" },
  "project.runhuman": {
    capability: Capability.RunHuman,
    displayName: "runhuman",
  },
  "project.prepareRelease": {
    capability: Capability.PrepareRelease,
    displayName: "prepareRelease",
  },
  "project.finalizeRelease": {
    capability: Capability.FinalizeRelease,
    displayName: "finalizeRelease",
  },
  "project.dbpush": {
    capability: Capability.DbPush,
    displayName: "dbpush",
  },
  "project.pipeline_agent": {
    capability: Capability.PipelineAgent,
    displayName: "pipeline-agent",
  },
  "project.auditfences": {
    capability: Capability.AuditFences,
    displayName: "auditfences",
  },
  "project.kit_status": {
    capability: Capability.KitStatus,
    displayName: "kit:status",
  },
};

export async function enforceTool(
  db: McpDbClient,
  projectId: string,
  toolName: string,
): Promise<StageEnforcementResult> {
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
      resolveCurrentPhase(db, projectId),
      resolveSpecVerification(db, projectId),
    ]);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return {
        allowed: false,
        currentStage: null,
        requestedTool: toolName,
        reason: err.message,
      };
    }
    throw err;
  }

  const decision: Decision = evaluate({
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
