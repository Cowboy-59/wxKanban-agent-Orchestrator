// Spec 030 FR-006 — MCP surface adapter. Translates MCP tool names to
// Capability, resolves stage + spec verification from the DB, then delegates
// to the pure policy.evaluate(). Returns the existing StageEnforcementResult
// shape so today's mcp-server call site needs only an import-path swap.
//
// Per spec 030 FR-008, spec-first verification is enforced uniformly
// across both surfaces. The MCP adapter always feeds the resolved
// SpecVerification into policy.evaluate() — closing the pre-refactor gap
// where MCP allowed spec-gated tools without verification.
//
// SCOPE-123 FR-001 — the stage is the stage of the SCOPE the tool call names
// (its specNumber / specId argument), read from `specificationphases`. This
// adapter used to resolve ONE project-wide stage from `projectphases`, which
// described none of a multi-scope project's scopes and defaulted to Design;
// that read is gone from every gate path.

import { Capability, capabilityScoping } from "../capabilities";
import { evaluate, Decision, Refusal, ScopeStageFacts, SpecVerification } from "../policy";
import { ProjectNotFoundError, PhaseQueryClient } from "../resolve-current-phase";
import {
  resolveScopeVerification,
  SpecVerificationQueryClient,
} from "../resolve-spec-verification";
import { LifecycleStage } from "../../schemas/lifecycle";
import { StageQueryClient } from "../../stage/store";
import { ScopeGateChecker, ScopeRecord, assessScope, evaluateStageExit } from "../../stage/advance";
import { findScopeByRef, scopeRefFromArgs } from "../../stage/lookup";
import { INACTIVE_SCOPE_STATUSES, scopeLabel } from "../../stage/vocabulary";

// Mirrors the StageEnforcementResult interface from the pre-refactor
// mcp-server/src/utils/stage-enforcement.ts so the call site in
// mcp-server/src/server.ts compiles unchanged.
export interface StageEnforcementResult {
  allowed: boolean;
  // The named scope's stage; null for tools that act on no scope.
  currentStage: string | null;
  requestedTool: string;
  reason?: string;
  // SCOPE-123 FR-004 — machine-readable refusal for the caller to branch on.
  refusal?: Refusal;
}

// DB shape this adapter expects. Any client with a `query(sql, params)` that
// returns `{ rows }` works — a node-postgres Pool does.
export interface McpDbClient
  extends PhaseQueryClient,
    SpecVerificationQueryClient,
    StageQueryClient {}

// Spec 030 FR-006 — exhaustive mapping. Each row carries the bare CLI command
// name as displayName so the message strings produced by policy.evaluate() are
// identical across CLI and MCP surfaces (FR-009). Rows for tools the MCP server
// does not register are inert at runtime.
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
  // WinDev/WebDev conversion entry points (scope-creating).
  "project.wxconversion": {
    capability: Capability.WxConversion,
    displayName: "wxconversion",
  },
  "project.wxconversionscope": {
    capability: Capability.WxConversionScope,
    displayName: "wxconversionscope",
  },
  // Clarion conversion entry points (scope-creating).
  "project.cwconversion": {
    capability: Capability.CwConversion,
    displayName: "cwconversion",
  },
  "project.cwconversionscope": {
    capability: Capability.CwConversionScope,
    displayName: "cwconversionscope",
  },
  // Visual Basic 6 conversion entry points (scope-creating).
  "project.vbconversion": {
    capability: Capability.VbConversion,
    displayName: "vbconversion",
  },
  "project.vbconversionscope": {
    capability: Capability.VbConversionScope,
    displayName: "vbconversionscope",
  },
};

export interface EnforceToolOptions {
  // The tool call's arguments; the named scope is read from them.
  args?: Record<string, unknown>;
  // The server's test gate, narrowed to a scope. Lets a refusal name the open
  // gate as well as the open tasks (FR-010). Optional: without it the refusal
  // still names the stage and the open-task count.
  gates?: ScopeGateChecker;
  // The project the caller's token is bound to. When set, a gated tool naming a
  // different project is refused BEFORE anything is read: the refusal text names
  // a scope's stage, task counts and test keys, so reading another project's
  // scope here would disclose it (review finding, SCOPE-123 T021).
  boundProjectId?: string;
}

// [SCOPE 123 / T002] BEGIN — assertProjectExists: a mapped tool on an unknown project is refused
async function assertProjectExists(db: PhaseQueryClient, projectId: string): Promise<void> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM companyprojects WHERE id = $1 LIMIT 1`,
    [projectId],
  );
  if (result.rows.length === 0) throw new ProjectNotFoundError(projectId);
}
// [SCOPE 123 / T002] END

// [SCOPE 123 / T002] BEGIN — resolveScopeFacts: the named scope's stage, tasks and blockers
// [SCOPE 123 / T021] MODIFIED-BY — carries tracked (inferred stage, decision 9) and inactive
//
// A scope the tool names but that has no row yet is a scope being created: it is
// in Design with no tasks. A scope with a row but no stage row is judged on its
// inferred stage (Amendment C, decision 9) and marked untracked.
export async function resolveScopeFacts(
  db: StageQueryClient,
  record: ScopeRecord | null,
  specNumber: string,
  gates?: ScopeGateChecker,
): Promise<ScopeStageFacts> {
  // Without the server's gate, the facts still carry the stage and open-task
  // count; a gated stage's blocker then says the gate was not evaluated here.
  const checker: ScopeGateChecker =
    gates ??
    (async () => {
      throw new Error("not evaluated on this surface");
    });
  const assessment = record
    ? await assessScope(db, record.id, checker, { full: Boolean(gates) })
    : null;
  if (!record || !assessment) {
    const verdict = evaluateStageExit({ stage: LifecycleStage.Design, taskCount: 0, openTaskCount: 0 });
    return {
      scopeId: null,
      specNumber,
      label: scopeLabel(specNumber),
      stage: LifecycleStage.Design,
      taskCount: 0,
      openTaskCount: 0,
      blockers: verdict.blockers.map((b) => ({ kind: b.kind, message: b.message })),
    };
  }
  return {
    scopeId: record.id,
    specNumber: record.specNumber,
    label: scopeLabel(record.specNumber),
    stage: assessment.stage,
    taskCount: assessment.taskCount,
    openTaskCount: assessment.openTaskCount,
    blockers: assessment.blockers.map((b) => ({ kind: b.kind, message: b.message })),
    tracked: assessment.tracked,
    inactive: INACTIVE_SCOPE_STATUSES.includes(record.status),
  };
}
// [SCOPE 123 / T002] END

// [SCOPE 123 / T002] BEGIN — enforceTool: per-scope gate for MCP tool calls (replaces the projectphases read)
// [SCOPE 123 / T021] MODIFIED-BY — refuse a project other than the token's before any read
export async function enforceTool(
  db: McpDbClient,
  projectId: string,
  toolName: string,
  options: EnforceToolOptions = {},
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

  if (options.boundProjectId && options.boundProjectId !== projectId) {
    return {
      allowed: false,
      currentStage: null,
      requestedTool: toolName,
      reason: `scope-mismatch: ${toolName} named project ${projectId}, but the token is bound to project ${options.boundProjectId}.`,
    };
  }

  let scope: ScopeStageFacts | undefined;
  let verification: SpecVerification | undefined;
  try {
    await assertProjectExists(db, projectId);
    if (capabilityScoping[mapping.capability] === "scoped") {
      const ref = scopeRefFromArgs(options.args);
      if (ref) {
        const record = await findScopeByRef(db, projectId, ref);
        scope = await resolveScopeFacts(db, record, record?.specNumber ?? ref.specNumber ?? ref.specId ?? "", options.gates);
        verification = record
          ? await resolveScopeVerification(db, record)
          : { specExists: false, tasksExist: false, documentsExist: false };
      }
    }
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
    commandDisplayName: mapping.displayName,
    scope,
    verification,
  });

  return {
    allowed: decision.allowed,
    currentStage: decision.currentPhase,
    requestedTool: toolName,
    reason: decision.reason,
    refusal: decision.refusal,
  };
}
// [SCOPE 123 / T002] END
