// Spec 030 FR-005 — CLI surface adapter. Translates CLI command names to
// Capability + delegates to the pure policy.evaluate(). Returns the existing
// PolicyEvaluation shape so today's call sites need only an import-path swap.
// Contains no decision logic beyond the name lookup.

import { LifecycleStage } from "../../schemas/lifecycle";
import { Capability, gateTable } from "../capabilities";
import {
  evaluate,
  Decision,
  SpecVerification,
  ForceOverride,
} from "../policy";

// Mirrors the PolicyEvaluation interface from the pre-refactor
// command-policy.ts so existing call sites compile unchanged.
export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  stage: LifecycleStage;
  command: string;
  allowedCommands: string[];
  requiresSpecCheck: boolean;
  overrideUsed: boolean;
}

// Re-export the verification + override types so existing imports of
// `SpecVerification` / `ForceOverride` from command-policy.ts only need
// an import-path swap.
export type { SpecVerification, ForceOverride } from "../policy";

// Spec 030 FR-005 — exhaustive 12-row mapping. Every Capability has exactly
// one CLI command name.
const CLI_COMMAND_TO_CAPABILITY: Readonly<Record<string, Capability>> = {
  buildscope: Capability.BuildScope,
  createspecs: Capability.CreateSpecs,
  implement: Capability.ImplementTask,
  createtesttasks: Capability.CreateTestTasks,
  runqa: Capability.RunQa,
  runhuman: Capability.RunHuman,
  prepareRelease: Capability.PrepareRelease,
  finalizeRelease: Capability.FinalizeRelease,
  dbpush: Capability.DbPush,
  "pipeline-agent": Capability.PipelineAgent,
  auditfences: Capability.AuditFences,
  "kit:status": Capability.KitStatus,
  "scaffold:frontend": Capability.ScaffoldFrontend,
};

// Reverse map for computing `allowedCommands` per stage in the
// PolicyEvaluation result. Built once at module load.
const CAPABILITY_TO_CLI_COMMAND: Readonly<Record<Capability, string>> =
  Object.fromEntries(
    Object.entries(CLI_COMMAND_TO_CAPABILITY).map(([cmd, cap]) => [cap, cmd]),
  ) as Record<Capability, string>;

function computeAllowedCommands(
  stage: LifecycleStage,
  customCommands?: string[],
): string[] {
  const allowed: string[] = [];
  for (const cap of Object.values(Capability) as Capability[]) {
    const gate = gateTable[cap];
    const matches =
      gate.allowedPhases === "all" || gate.allowedPhases.includes(stage);
    if (matches) {
      allowed.push(CAPABILITY_TO_CLI_COMMAND[cap]);
    }
  }
  if (customCommands && customCommands.length > 0) {
    allowed.push(...customCommands);
  }
  return allowed;
}

export function evaluateCommand(
  stage: LifecycleStage,
  commandName: string,
  verification?: SpecVerification,
  override?: ForceOverride,
  customCommands?: string[],
): PolicyEvaluation {
  const allowedCommands = computeAllowedCommands(stage, customCommands);

  // Custom commands pass through unchecked (preserves today's opaque
  // allow-list behavior from CommandPolicyEngine).
  if (customCommands && customCommands.includes(commandName)) {
    return {
      allowed: true,
      stage,
      command: commandName,
      allowedCommands,
      requiresSpecCheck: false,
      overrideUsed: false,
    };
  }

  const capability = CLI_COMMAND_TO_CAPABILITY[commandName];
  if (!capability) {
    // Byte-identical rejection format for unknown commands.
    return {
      allowed: false,
      reason: `Command '${commandName}' is not permitted in the '${stage}' stage.`,
      stage,
      command: commandName,
      allowedCommands,
      requiresSpecCheck: false,
      overrideUsed: false,
    };
  }

  const decision: Decision = evaluate({
    capability,
    currentPhase: stage,
    commandDisplayName: commandName,
    verification,
    override,
  });

  return {
    allowed: decision.allowed,
    reason: decision.reason,
    stage,
    command: commandName,
    allowedCommands,
    requiresSpecCheck: decision.requiresSpecCheck,
    overrideUsed: decision.overrideUsed,
  };
}

// Compatibility shim — preserves the legacy CommandPolicyEngine.evaluate()
// boolean-returning signature for callers that only care about allow/deny.
// Internally just delegates to evaluateCommand.
export function evaluateCommandAllowed(
  stage: LifecycleStage,
  commandName: string,
  customCommands?: string[],
): boolean {
  return evaluateCommand(stage, commandName, undefined, undefined, customCommands)
    .allowed;
}

// Stage-check only — mirrors the legacy CommandPolicyEngine.evaluateWithDetails
// behavior used by workflow-engine.ts runX methods (which intentionally skip
// the spec-first check; the dispatch() method handles spec-first separately
// after stage passes). Preserves today's two-step gating shape exactly.
export function evaluateStageOnly(
  stage: LifecycleStage,
  commandName: string,
  customCommands?: string[],
): PolicyEvaluation {
  const allowedCommands = computeAllowedCommands(stage, customCommands);

  if (customCommands && customCommands.includes(commandName)) {
    return {
      allowed: true,
      stage,
      command: commandName,
      allowedCommands,
      requiresSpecCheck: false,
      overrideUsed: false,
    };
  }

  const capability = CLI_COMMAND_TO_CAPABILITY[commandName];
  if (!capability) {
    return {
      allowed: false,
      reason: `Command '${commandName}' is not permitted in the '${stage}' stage.`,
      stage,
      command: commandName,
      allowedCommands,
      requiresSpecCheck: false,
      overrideUsed: false,
    };
  }

  const gate = gateTable[capability];
  const stageAllowed =
    gate.allowedPhases === "all" || gate.allowedPhases.includes(stage);
  if (!stageAllowed) {
    return {
      allowed: false,
      reason: `Command '${commandName}' is not permitted in the '${stage}' stage.`,
      stage,
      command: commandName,
      allowedCommands,
      requiresSpecCheck: gate.requiresVerifiedSpec,
      overrideUsed: false,
    };
  }

  return {
    allowed: true,
    stage,
    command: commandName,
    allowedCommands,
    requiresSpecCheck: gate.requiresVerifiedSpec,
    overrideUsed: false,
  };
}

// Returns the full set of commands allowed in `stage` (stage-gated + cross-
// cutting + any user-supplied custom commands). Used by cli.ts for the
// printAvailableCommands help text and by verify-install.ts for smoke checks.
// Replaces direct use of the legacy AllowedCommandsByStage + CrossCuttingCommands
// exports from lifecycle.ts.
export function getAllowedCommandsForStage(
  stage: LifecycleStage,
  customCommands?: string[],
): string[] {
  return computeAllowedCommands(stage, customCommands);
}

// isSpecGatedCommand mirrors CommandPolicyEngine.isSpecGatedCommand —
// some legacy call sites use this to decide whether to bother gathering
// SpecVerification before calling evaluateCommand.
export function isSpecGatedCommand(commandName: string): boolean {
  const capability = CLI_COMMAND_TO_CAPABILITY[commandName];
  if (!capability) return false;
  return gateTable[capability].requiresVerifiedSpec;
}
