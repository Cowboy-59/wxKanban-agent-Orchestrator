// Spec 030 FR-005 — CLI surface adapter. Translates CLI command names to
// Capability + delegates to the pure policy.evaluate(). Returns the existing
// PolicyEvaluation shape so today's call sites need only an import-path swap.
// Contains no decision logic beyond the name lookup.
//
// SCOPE-123 — the gate input is the NAMED SCOPE's stage facts, resolved by the
// caller from the hub (`project.scope_stage`), never a project-wide stage. An
// unregistered command gets its own UNKNOWN_COMMAND error naming no stage
// (FR-005); it used to reuse the stage-denial sentence, which caused
// `kit:configure` to be triaged as a stage-gate bug (report bd756151).

import { LifecycleStage } from "../../schemas/lifecycle";
import { Capability, CommandScoping, capabilityScoping, gateTable } from "../capabilities";
import {
  evaluate,
  Decision,
  Refusal,
  ScopeStageFacts,
  SpecVerification,
  ForceOverride,
  formatStageDenial,
  formatScopeInactive,
  formatScopeRequired,
  formatUnknownCommand,
} from "../policy";

// Mirrors the PolicyEvaluation interface from the pre-refactor
// command-policy.ts so existing call sites compile unchanged.
export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  // SCOPE-123 FR-004 — machine-readable refusal; set whenever allowed is false.
  refusal?: Refusal;
  // The named scope's stage; null for commands that act on no scope.
  stage: LifecycleStage | null;
  command: string;
  allowedCommands: string[];
  requiresSpecCheck: boolean;
  overrideUsed: boolean;
}

// Re-export the verification + override types so existing imports of
// `SpecVerification` / `ForceOverride` from command-policy.ts only need
// an import-path swap.
export type { SpecVerification, ForceOverride, ScopeStageFacts, Refusal } from "../policy";

// Spec 030 FR-005 — exhaustive mapping. Every Capability has exactly one CLI
// command name. (Spec 036 added scaffold:frontend; spec 044 added wxconversion.)
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
  // SCOPE-095 Amendment A / T007 — without this row kit:configure fell to the
  // `if (!capability)` branch below, which phrased every unknown command as a
  // stage violation (customer report bd756151). SCOPE-123 FR-005 gives that
  // branch its own message.
  "kit:configure": Capability.KitConfigure,
  "scaffold:frontend": Capability.ScaffoldFrontend,
  "archive:files": Capability.ArchiveFiles,
  // WinDev/WebDev conversion entry points (scope-creating).
  wxconversion: Capability.WxConversion,
  wxconversionscope: Capability.WxConversionScope,
  // Clarion conversion entry points (scope-creating).
  cwconversion: Capability.CwConversion,
  cwconversionscope: Capability.CwConversionScope,
  // Visual Basic 6 conversion entry points (scope-creating).
  vbconversion: Capability.VbConversion,
  vbconversionscope: Capability.VbConversionScope,
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

// [SCOPE 123 / T008] BEGIN — listCommands: every registered command, for UNKNOWN_COMMAND
export function listCommands(customCommands?: string[]): string[] {
  return [...Object.keys(CLI_COMMAND_TO_CAPABILITY), ...(customCommands ?? [])];
}
// [SCOPE 123 / T008] END

// [SCOPE 123 / T012] BEGIN — getCommandScoping: which class a CLI command is in (null when unknown)
export function getCommandScoping(commandName: string): CommandScoping | null {
  const capability = CLI_COMMAND_TO_CAPABILITY[commandName];
  return capability ? capabilityScoping[capability] : null;
}

// Every registered command with its class and the stages it runs in, for help text.
export function describeCommands(
  customCommands?: string[],
): Array<{ command: string; scoping: CommandScoping | "custom"; stages: LifecycleStage[] }> {
  const described: Array<{ command: string; scoping: CommandScoping | "custom"; stages: LifecycleStage[] }> =
    Object.entries(CLI_COMMAND_TO_CAPABILITY).map(([command, cap]) => {
      const phases = gateTable[cap].allowedPhases;
      return { command, scoping: capabilityScoping[cap], stages: phases === "all" ? [] : [...phases] };
    });
  for (const command of customCommands ?? []) {
    described.push({ command, scoping: "custom", stages: [] });
  }
  return described;
}
// [SCOPE 123 / T012] END

// [SCOPE 123 / T008] BEGIN — unknownCommand: the FR-005 refusal, naming no stage
function unknownCommand(commandName: string, customCommands?: string[]): PolicyEvaluation {
  const available = listCommands(customCommands);
  return {
    allowed: false,
    reason: formatUnknownCommand(commandName, available),
    refusal: { code: "UNKNOWN_COMMAND", command: commandName, availableCommands: available },
    stage: null,
    command: commandName,
    allowedCommands: available,
    requiresSpecCheck: false,
    overrideUsed: false,
  };
}
// [SCOPE 123 / T008] END

// [SCOPE 123 / T001] BEGIN — evaluateCommand: stage + spec-first, on the named scope (refusal site 1)
export function evaluateCommand(
  scope: ScopeStageFacts | undefined,
  commandName: string,
  verification?: SpecVerification,
  override?: ForceOverride,
  customCommands?: string[],
): PolicyEvaluation {
  // Custom commands pass through unchecked (preserves today's opaque
  // allow-list behavior from CommandPolicyEngine).
  if (customCommands && customCommands.includes(commandName)) {
    return {
      allowed: true,
      stage: scope?.stage ?? null,
      command: commandName,
      allowedCommands: listCommands(customCommands),
      requiresSpecCheck: false,
      overrideUsed: false,
    };
  }

  const capability = CLI_COMMAND_TO_CAPABILITY[commandName];
  if (!capability) return unknownCommand(commandName, customCommands);

  const decision: Decision = evaluate({
    capability,
    commandDisplayName: commandName,
    scope,
    verification,
    override,
  });

  return {
    allowed: decision.allowed,
    reason: decision.reason,
    refusal: decision.refusal,
    stage: decision.currentPhase,
    command: commandName,
    allowedCommands: decision.currentPhase
      ? computeAllowedCommands(decision.currentPhase, customCommands)
      : listCommands(customCommands),
    requiresSpecCheck: decision.requiresSpecCheck,
    overrideUsed: decision.overrideUsed,
  };
}
// [SCOPE 123 / T001] END

// Compatibility shim — preserves the legacy CommandPolicyEngine.evaluate()
// boolean-returning signature for callers that only care about allow/deny.
// Internally just delegates to evaluateCommand.
export function evaluateCommandAllowed(
  scope: ScopeStageFacts | undefined,
  commandName: string,
  customCommands?: string[],
): boolean {
  return evaluateCommand(scope, commandName, undefined, undefined, customCommands)
    .allowed;
}

// [SCOPE 123 / T001] BEGIN — evaluateStageOnly: the stage check alone, on the named scope (refusal sites 2 and 3)
// [SCOPE 123 / T021] MODIFIED-BY — SCOPE_INACTIVE refusal for archived or deferred scopes
// Mirrors the legacy CommandPolicyEngine.evaluateWithDetails behavior used by
// workflow-engine.ts runX methods (which intentionally skip the spec-first
// check; the dispatch() method handles spec-first separately after stage
// passes). Preserves today's two-step gating shape exactly.
export function evaluateStageOnly(
  scope: ScopeStageFacts | undefined,
  commandName: string,
  customCommands?: string[],
): PolicyEvaluation {
  if (customCommands && customCommands.includes(commandName)) {
    return {
      allowed: true,
      stage: scope?.stage ?? null,
      command: commandName,
      allowedCommands: listCommands(customCommands),
      requiresSpecCheck: false,
      overrideUsed: false,
    };
  }

  const capability = CLI_COMMAND_TO_CAPABILITY[commandName];
  if (!capability) return unknownCommand(commandName, customCommands);

  const gate = gateTable[capability];
  const scoping = capabilityScoping[capability];
  if (scoping === "scoped") {
    if (!scope) {
      return {
        allowed: false,
        reason: formatScopeRequired(commandName),
        refusal: { code: "SCOPE_REQUIRED", command: commandName },
        stage: null,
        command: commandName,
        allowedCommands: listCommands(customCommands),
        requiresSpecCheck: gate.requiresVerifiedSpec,
        overrideUsed: false,
      };
    }
    if (scope.inactive) {
      return {
        allowed: false,
        reason: formatScopeInactive(commandName, scope),
        refusal: { code: "SCOPE_INACTIVE", command: commandName, scope },
        stage: scope.stage,
        command: commandName,
        allowedCommands: listCommands(customCommands),
        requiresSpecCheck: gate.requiresVerifiedSpec,
        overrideUsed: false,
      };
    }
    const requiredStages = gate.allowedPhases === "all" ? [] : gate.allowedPhases;
    if (gate.allowedPhases !== "all" && !requiredStages.includes(scope.stage)) {
      return {
        allowed: false,
        reason: formatStageDenial(commandName, scope, requiredStages),
        refusal: { code: "STAGE_DENIED", command: commandName, scope, requiredStages },
        stage: scope.stage,
        command: commandName,
        allowedCommands: computeAllowedCommands(scope.stage, customCommands),
        requiresSpecCheck: gate.requiresVerifiedSpec,
        overrideUsed: false,
      };
    }
  }

  return {
    allowed: true,
    stage: scoping === "scoped" && scope ? scope.stage : null,
    command: commandName,
    allowedCommands: scope ? computeAllowedCommands(scope.stage, customCommands) : listCommands(customCommands),
    requiresSpecCheck: gate.requiresVerifiedSpec,
    overrideUsed: false,
  };
}
// [SCOPE 123 / T001] END

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
