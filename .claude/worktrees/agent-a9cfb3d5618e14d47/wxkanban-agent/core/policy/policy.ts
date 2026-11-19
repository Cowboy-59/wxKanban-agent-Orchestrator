// Spec 030 — Pure stage-gate + spec-first decision engine. No IO. No global
// state. Inputs are values; output is a Decision. Both the CLI and MCP
// adapters call this function with their surface-specific name mapped to a
// Capability. Message format functions are ported byte-identical from the
// pre-refactor command-policy.ts (spec 030 FR-009).
//
// SCOPE-123 — the stage the gate reads is the stage of the SCOPE the command
// names, never a project-wide value. Scope-creating and cross-cutting commands
// read no stage at all (FR-008). Every refusal carries a machine-readable code
// so a caller can branch on it, not only read it (FR-004, FR-005).

import { LifecycleStage } from "../schemas/lifecycle";
import { Capability, CommandScoping, capabilityScoping, gateTable } from "./capabilities";

export interface SpecVerification {
  specExists: boolean;
  tasksExist: boolean;
  documentsExist: boolean;
  specStatus?: string;
}

export interface ForceOverride {
  force: boolean;
  reason: string;
}

// SCOPE-123 FR-004 — one thing that stands between a scope and its next stage.
export interface StageBlockerSummary {
  kind: string;
  message: string;
}

// SCOPE-123 FR-001 — the scope a command acts on, as the adapter resolved it.
export interface ScopeStageFacts {
  // null when the named scope has no row yet: a scope not yet created is in Design.
  scopeId: string | null;
  specNumber: string;
  label: string;
  stage: LifecycleStage;
  taskCount: number;
  openTaskCount: number;
  // What would advance the scope from its stage (FR-004, FR-010).
  blockers: StageBlockerSummary[];
  // Amendment C: false when the scope has no stage row and `stage` is inferred.
  tracked?: boolean;
  // The scope is archived or deferred; scoped commands do not run on it.
  inactive?: boolean;
}

// SCOPE-123 FR-004 / FR-005 — refusal codes a caller can branch on.
export type RefusalCode =
  | "STAGE_DENIED"
  | "SCOPE_INACTIVE"
  | "SCOPE_REQUIRED"
  | "UNKNOWN_COMMAND"
  | "SPEC_UNVERIFIED"
  | "ESCALATION_DENIED";

export interface Refusal {
  code: RefusalCode;
  command: string;
  scope?: ScopeStageFacts;
  requiredStages?: LifecycleStage[];
  availableCommands?: string[];
}

export interface Decision {
  allowed: boolean;
  reason?: string;
  refusal?: Refusal;
  capability: Capability;
  scoping: CommandScoping;
  // The named scope's stage; null for commands that act on no scope.
  currentPhase: LifecycleStage | null;
  requiresSpecCheck: boolean;
  overrideUsed: boolean;
}

export interface EvaluateInput {
  capability: Capability;
  // Surface-specific display name used in human-readable rejection / block
  // messages — preserves the "Command 'implement' ..." format today's CLI
  // produces (FR-009 byte-identical preservation). The CLI adapter passes
  // the bare CLI command name; the MCP adapter passes the bare CLI command
  // name (not the 'project.' tool form) so message strings stay identical
  // across surfaces.
  commandDisplayName: string;
  // SCOPE-123 FR-001 — required for scoped commands; ignored for the others.
  scope?: ScopeStageFacts;
  verification?: SpecVerification;
  override?: ForceOverride;
}

// Valid spec statuses that allowed implementation to proceed under the
// project-stage gate. SCOPE-123 FR-009: a scoped command is now decided by the
// named scope's STAGE, the one vocabulary; a second check on the status
// vocabulary would refuse fix work in QA (FR-013) on a value the stage already
// answered. Kept exported for callers that still read it.
export const VALID_IMPLEMENTATION_STATUSES = [
  "tasks_generated",
  "in_progress",
  "ready_for_implementation",
  "planned",
] as const;

// [SCOPE 123 / T007] BEGIN — formatStageDenial: an actionable refusal naming the scope (FR-004)
export function formatStageDenial(
  command: string,
  scope: ScopeStageFacts,
  requiredStages: readonly LifecycleStage[],
): string {
  const advance: string[] = [
    `${scope.openTaskCount} of ${scope.taskCount} task(s) still open`,
    ...scope.blockers.filter((b) => b.kind !== "open_tasks").map((b) => b.message),
  ];
  const inferred =
    scope.tracked === false
      ? ` (inferred: ${scope.label} has no recorded stage yet; project.backfill_scope_stages records it)`
      : "";
  return (
    `STAGE_DENIED — '${command}' cannot run on ${scope.label}: ${scope.label} is in ${scope.stage}${inferred}, ` +
    `and '${command}' runs in ${requiredStages.join(" or ")}.\n` +
    `What would advance ${scope.label}: ${advance.join("; ")}.`
  );
}
// [SCOPE 123 / T007] END

// [SCOPE 123 / T021] BEGIN — formatScopeInactive: scoped commands do not run on archived scopes
export function formatScopeInactive(command: string, scope: ScopeStageFacts): string {
  return (
    `SCOPE_INACTIVE — '${command}' cannot run on ${scope.label}: it is archived or deferred. ` +
    `Unarchive it first if the work is resuming.`
  );
}
// [SCOPE 123 / T021] END

// [SCOPE 123 / T012] BEGIN — formatScopeRequired: a scoped command sent with no scope
export function formatScopeRequired(command: string): string {
  const example = command === "implement" ? `${command} 123/T001` : `${command} --spec 123`;
  return (
    `SCOPE_REQUIRED — '${command}' acts on one scope, and none was named. ` +
    `Name the scope, for example: ${example}.`
  );
}
// [SCOPE 123 / T012] END

// [SCOPE 123 / T008] BEGIN — formatUnknownCommand: names no stage, lists what exists (FR-005)
export function formatUnknownCommand(command: string, available: readonly string[]): string {
  return (
    `UNKNOWN_COMMAND — '${command}' is not a recognised command. ` +
    `Available commands: ${available.join(", ")}.`
  );
}
// [SCOPE 123 / T008] END

// [SCOPE 123 / T001] BEGIN — evaluate: gate on the named scope's stage (replaces the spec 030 project-stage gate)
// [SCOPE 123 / T021] MODIFIED-BY — SCOPE_INACTIVE refusal for archived or deferred scopes
export function evaluate(input: EvaluateInput): Decision {
  const { capability, commandDisplayName, scope, verification, override } = input;
  const gate = gateTable[capability];
  const scoping = capabilityScoping[capability];
  const currentPhase = scoping === "scoped" && scope ? scope.stage : null;
  const base = { capability, scoping, currentPhase };

  // Stage gate (first check). Only scoped commands read a stage, and only the
  // stage of the scope they name. Scope-creating and cross-cutting commands are
  // permitted in every stage (FR-008), which capabilities.ts asserts at load.
  if (scoping === "scoped") {
    if (!scope) {
      return {
        ...base,
        allowed: false,
        reason: formatScopeRequired(commandDisplayName),
        refusal: { code: "SCOPE_REQUIRED", command: commandDisplayName },
        requiresSpecCheck: gate.requiresVerifiedSpec,
        overrideUsed: false,
      };
    }
    // [SCOPE 123 / T021] an archived or deferred scope takes no scoped command
    if (scope.inactive) {
      return {
        ...base,
        allowed: false,
        reason: formatScopeInactive(commandDisplayName, scope),
        refusal: { code: "SCOPE_INACTIVE", command: commandDisplayName, scope },
        requiresSpecCheck: gate.requiresVerifiedSpec,
        overrideUsed: false,
      };
    }
    const requiredStages = gate.allowedPhases === "all" ? [] : gate.allowedPhases;
    const stageAllowed = gate.allowedPhases === "all" || requiredStages.includes(scope.stage);
    if (!stageAllowed) {
      return {
        ...base,
        allowed: false,
        reason: formatStageDenial(commandDisplayName, scope, requiredStages),
        refusal: { code: "STAGE_DENIED", command: commandDisplayName, scope, requiredStages },
        requiresSpecCheck: gate.requiresVerifiedSpec,
        overrideUsed: false,
      };
    }
  }

  // If capability doesn't require spec verification, pass through.
  if (!gate.requiresVerifiedSpec) {
    return { ...base, allowed: true, requiresSpecCheck: false, overrideUsed: false };
  }

  // Spec-first verification gate.
  if (!verification) {
    return {
      ...base,
      allowed: false,
      reason: formatBlockMessage(
        commandDisplayName,
        "Spec verification not performed. Run spec check before implementation.",
      ),
      refusal: { code: "SPEC_UNVERIFIED", command: commandDisplayName, scope },
      requiresSpecCheck: true,
      overrideUsed: false,
    };
  }

  const missing: string[] = [];
  if (!verification.specExists) missing.push("spec");
  if (!verification.tasksExist) missing.push("tasks");
  if (!verification.documentsExist) missing.push("documents");

  if (missing.length > 0) {
    // Force override is logged but NEVER bypasses enforcement (gate.allowsEscalation
    // is `false` for every Capability — preserves today's contract).
    if (override?.force && override.reason) {
      return {
        ...base,
        allowed: false,
        reason: formatEscalationMessage(commandDisplayName, override.reason, missing),
        refusal: { code: "ESCALATION_DENIED", command: commandDisplayName, scope },
        requiresSpecCheck: true,
        overrideUsed: true,
      };
    }
    return {
      ...base,
      allowed: false,
      reason: formatBlockMessage(commandDisplayName, `Missing: ${missing.join(", ")}`),
      refusal: { code: "SPEC_UNVERIFIED", command: commandDisplayName, scope },
      requiresSpecCheck: true,
      overrideUsed: false,
    };
  }

  return { ...base, allowed: true, requiresSpecCheck: true, overrideUsed: false };
}
// [SCOPE 123 / T001] END

// Spec 030 FR-009 — Ported byte-identical from pre-refactor command-policy.ts.
// Any change to these strings is a release-gating concern (existing tests and
// downstream consumers may pattern-match on the literal text).
export function formatEscalationMessage(
  command: string,
  reason: string,
  missing: string[],
): string {
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

export function formatBlockMessage(command: string, details: string): string {
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
