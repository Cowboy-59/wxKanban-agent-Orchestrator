// Command policy engine — stage gating + spec-first enforcement
import { LifecycleStage, AllowedCommandsByStage, CrossCuttingCommands } from '../schemas/lifecycle';

export interface PolicyEvaluation {
	allowed: boolean;
	reason?: string;
	stage: LifecycleStage;
	command: string;
	allowedCommands: string[];
	requiresSpecCheck: boolean;
	overrideUsed: boolean;
}

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

/**
 * Escalation request — returned when a force override is attempted.
 * The command is STILL BLOCKED but the escalation is logged for human review.
 * A human admin must approve escalations via the wxKanban admin UI.
 */
export interface EscalationRequest {
	command: string;
	reason: string;
	missing: string[];
	requestedBy: string;
	requestedAt: string;
}

// Commands that require a verified spec + DB records before execution
const SPEC_GATED_COMMANDS: readonly string[] = [
	'implement',
	'createtesttasks',
	'runqa',
	'runhuman',
	'prepareRelease',
	'finalizeRelease',
] as const;

// Valid spec statuses that allow implementation to proceed
const VALID_IMPLEMENTATION_STATUSES = [
	'tasks_generated',
	'in_progress',
	'ready_for_implementation',
	'planned',
] as const;

export class CommandPolicyEngine {
	static evaluate(stage: LifecycleStage, command: string, customCommands?: string[]): boolean {
		return CommandPolicyEngine.evaluateWithDetails(stage, command, customCommands).allowed;
	}

	static evaluateWithDetails(stage: LifecycleStage, command: string, customCommands?: string[]): PolicyEvaluation {
		const stageCommands = AllowedCommandsByStage[stage] || [];
		const allAllowed = [...stageCommands, ...CrossCuttingCommands, ...(customCommands || [])];
		const allowed = allAllowed.includes(command);
		const requiresSpecCheck = SPEC_GATED_COMMANDS.includes(command);
		return {
			allowed,
			reason: allowed ? undefined : `Command '${command}' is not permitted in the '${stage}' stage.`,
			stage,
			command,
			allowedCommands: allAllowed,
			requiresSpecCheck,
			overrideUsed: false,
		};
	}

	/**
	 * Spec-first enforcement gate (Section VIII + IX of projectrules.md).
	 * Must be called before any SPEC_GATED_COMMANDS execute.
	 * Returns a PolicyEvaluation with allowed=false if spec/tasks/docs are missing from DB.
	 */
	static evaluateSpecFirst(
		stage: LifecycleStage,
		command: string,
		specVerification: SpecVerification | undefined,
		override?: ForceOverride,
		customCommands?: string[],
	): PolicyEvaluation {
		// First check stage gate
		const stageCheck = CommandPolicyEngine.evaluateWithDetails(stage, command, customCommands);
		if (!stageCheck.allowed) {
			return stageCheck;
		}

		// If command doesn't require spec check, pass through
		if (!SPEC_GATED_COMMANDS.includes(command)) {
			return stageCheck;
		}

		// No verification data provided — block
		if (!specVerification) {
			return {
				...stageCheck,
				allowed: false,
				requiresSpecCheck: true,
				reason: formatBlockMessage(command, 'Spec verification not performed. Run spec check before implementation.'),
			};
		}

		// Check each requirement
		const missing: string[] = [];
		if (!specVerification.specExists) missing.push('spec');
		if (!specVerification.tasksExist) missing.push('tasks');
		if (!specVerification.documentsExist) missing.push('documents');

		if (missing.length > 0) {
			// Force override is NOT allowed — escalation is logged but command is BLOCKED.
			// A human admin must approve escalations via the wxKanban admin UI.
			if (override?.force && override.reason) {
				return {
					...stageCheck,
					allowed: false,
					requiresSpecCheck: true,
					overrideUsed: true,
					reason: formatEscalationMessage(command, override.reason, missing),
				};
			}

			return {
				...stageCheck,
				allowed: false,
				requiresSpecCheck: true,
				reason: formatBlockMessage(command, `Missing: ${missing.join(', ')}`),
			};
		}

		// Check spec status if provided
		if (specVerification.specStatus &&
			!VALID_IMPLEMENTATION_STATUSES.includes(specVerification.specStatus as typeof VALID_IMPLEMENTATION_STATUSES[number])) {
			if (override?.force && override.reason) {
				return {
					...stageCheck,
					allowed: false,
					requiresSpecCheck: true,
					overrideUsed: true,
					reason: formatEscalationMessage(command, override.reason, [`spec status: ${specVerification.specStatus}`]),
				};
			}

			return {
				...stageCheck,
				allowed: false,
				requiresSpecCheck: true,
				reason: formatBlockMessage(command, `Spec status '${specVerification.specStatus}' is not valid for implementation. Valid statuses: ${VALID_IMPLEMENTATION_STATUSES.join(', ')}`),
			};
		}

		return { ...stageCheck, requiresSpecCheck: true };
	}

	static isSpecGatedCommand(command: string): boolean {
		return SPEC_GATED_COMMANDS.includes(command);
	}

	static getValidImplementationStatuses(): readonly string[] {
		return VALID_IMPLEMENTATION_STATUSES;
	}
}

function formatEscalationMessage(command: string, reason: string, missing: string[]): string {
	return `ESCALATION REQUESTED — COMMAND STILL BLOCKED

Command '${command}' cannot proceed. A force override was requested but overrides are not permitted.

Reason given: ${reason}
Missing prerequisites: ${missing.join(', ')}

This escalation has been logged for admin review. To proceed:
1. An admin must resolve the missing prerequisites in the wxKanban database
2. Or an admin must approve the escalation via the admin UI
3. Then retry the command

Force overrides are logged but NEVER bypass enforcement in wxKanban.`;
}

function formatBlockMessage(command: string, details: string): string {
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
