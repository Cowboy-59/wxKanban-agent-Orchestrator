// Workflow engine — with spec-first enforcement
import { CommandPolicyEngine, SpecVerification, ForceOverride } from '../policy/command-policy';
import { LifecycleClient, LifecycleClientConfig } from '../../services/lifecycle-api/lifecycle-client';
import { BuildScopeWorker } from '../../workers/ai/buildscope-worker';
import { ProjectContext } from '../context/project-context';
import { LifecycleStage } from '../schemas/lifecycle';
import { CommandResult } from '../schemas/commands';
import { AuditRecord, ScopeDraft } from '../schemas/artifacts';

export type BuildScopeInput = Partial<ScopeDraft>;

export interface DbPushOptions {
	dryRun?: boolean;
	spec?: string;
	force?: boolean;
	skipLifecycle?: boolean;
}

export interface DispatchOptions {
	specVerification?: SpecVerification;
	override?: ForceOverride;
}

export class WorkflowEngine {
	static async runBuildScope(
		context: ProjectContext,
		input: BuildScopeInput,
		user?: string
	): Promise<{ result: CommandResult<ScopeDraft>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = CommandPolicyEngine.evaluateWithDetails(
			context.lifecycleStage, 'buildscope', context.customCommands
		);
		if (!policy.allowed) {
			const result: CommandResult<ScopeDraft> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'buildscope', input: input as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		const draft = await BuildScopeWorker.generateScopeDraft(input);
		const artifactResult = await LifecycleClient.createArtifactStatic(draft);
		if (!artifactResult.success) {
			const result: CommandResult<ScopeDraft> = { success: false, error: 'Artifact creation failed' };
			const audit: AuditRecord = { timestamp, command: 'buildscope', input: input as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		await LifecycleClient.transitionFeatureStatic(artifactResult.id!, LifecycleStage.Implementation);
		const result: CommandResult<ScopeDraft> = { success: true, artifact: draft };
		const audit: AuditRecord = { timestamp, command: 'buildscope', input: input as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
		return { result, audit };
	}

	static async runDbPush(
		context: ProjectContext,
		options: DbPushOptions,
		user?: string
	): Promise<{ result: CommandResult<Record<string, unknown>>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = CommandPolicyEngine.evaluateWithDetails(
			context.lifecycleStage, 'dbpush', context.customCommands
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'dbpush', input: options as unknown as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		const { handleDbPushCommand } = await import('./command-handlers/dbpush');
		const pushResult = await handleDbPushCommand(options);
		const result: CommandResult<Record<string, unknown>> = { success: true, artifact: pushResult as Record<string, unknown> };
		const audit: AuditRecord = { timestamp, command: 'dbpush', input: options as unknown as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
		return { result, audit };
	}

	static async dispatch(
		context: ProjectContext,
		command: string,
		input: Record<string, unknown>,
		user?: string,
		options?: DispatchOptions,
	): Promise<{ result: CommandResult<unknown>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();

		// Spec-first enforcement: use evaluateSpecFirst for spec-gated commands
		const policy = CommandPolicyEngine.isSpecGatedCommand(command)
			? CommandPolicyEngine.evaluateSpecFirst(
				context.lifecycleStage,
				command,
				options?.specVerification,
				options?.override,
				context.customCommands,
			)
			: CommandPolicyEngine.evaluateWithDetails(
				context.lifecycleStage, command, context.customCommands
			);

		if (!policy.allowed) {
			const result: CommandResult<unknown> = { success: false, error: policy.reason };
			const audit: AuditRecord = {
				timestamp, command, input,
				result: {
					...result as unknown as Record<string, unknown>,
					policyBlocked: true,
					requiresSpecCheck: policy.requiresSpecCheck,
				},
				user,
			};
			return { result, audit };
		}

		// Log escalation attempts (override was requested but command is still blocked)
		if (policy.overrideUsed) {
			const escalationAudit: AuditRecord = {
				timestamp,
				command: 'policy-escalation',
				input: { command, reason: options?.override?.reason, blocked: true },
				result: { escalationLogged: true, commandBlocked: true, severity: 'critical' },
				user,
			};
			console.warn(`[AUDIT][ESCALATION] Force override DENIED for '${command}' — reason: ${options?.override?.reason}. Command remains blocked.`);
			void escalationAudit; // consumed by audit trail — command is NOT allowed through
		}

		switch (command) {
			case 'buildscope':
				return WorkflowEngine.runBuildScope(context, input as BuildScopeInput, user);
			case 'dbpush':
				return WorkflowEngine.runDbPush(context, input as DbPushOptions, user);
			default: {
				const result: CommandResult<unknown> = {
					success: false,
					error: `No handler registered for command '${command}'`,
				};
				const audit: AuditRecord = { timestamp, command, input, result: result as unknown as Record<string, unknown>, user };
				return { result, audit };
			}
		}
	}
}
