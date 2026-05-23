// Workflow engine — with spec-first enforcement
// Spec 030 — swapped from command-policy to the new policy/adapters/cli-adapter.
// Behavioral shape preserved: evaluateStageOnly matches the legacy
// evaluateWithDetails (stage-only check); evaluateCommand matches the legacy
// evaluateSpecFirst (stage + spec-first); isSpecGatedCommand unchanged.
import {
	evaluateStageOnly,
	evaluateCommand,
	isSpecGatedCommand,
	SpecVerification,
	ForceOverride,
} from '../policy/adapters/cli-adapter';
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
		const policy = evaluateStageOnly(
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
		const policy = evaluateStageOnly(
			context.lifecycleStage, 'dbpush', context.customCommands
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'dbpush', input: options as unknown as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		const { handleDbPushCommand } = await import('./command-handlers/dbpush');
		// CLI passes flags as their literal kebab form (`--dry-run` → `dry-run`).
		// Map to the camelCase the handler expects.
		const raw = options as unknown as Record<string, unknown>;
		const mapped: DbPushOptions = {
			dryRun: raw['dry-run'] === true || raw['dryRun'] === true,
			force: raw['force'] === true,
			skipLifecycle: raw['skip-lifecycle'] === true || raw['skipLifecycle'] === true,
			spec: typeof raw['spec'] === 'string' ? (raw['spec'] as string) : undefined,
		};
		const pushResult = await handleDbPushCommand(mapped);
		const result: CommandResult<Record<string, unknown>> = { success: true, artifact: pushResult as unknown as Record<string, unknown> };
		const audit: AuditRecord = { timestamp, command: 'dbpush', input: options as unknown as Record<string, unknown>, result: result as unknown as Record<string, unknown>, user };
		return { result, audit };
	}

	static async runImplement(
		context: ProjectContext,
		options: Record<string, unknown>,
		user?: string,
	): Promise<{ result: CommandResult<Record<string, unknown>>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = evaluateStageOnly(
			context.lifecycleStage, 'implement', context.customCommands,
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'implement', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}

		const target = options['target'] as string | undefined;
		const positional = (options['_'] as string[] | undefined)?.[0] ?? target;
		const scopeTask = (positional || (options['scope-task'] as string | undefined) || '').toString();
		const match = scopeTask.match(/^(\d{3})\/(T\d+)$/);
		if (!match) {
			const result: CommandResult<Record<string, unknown>> = {
				success: false,
				error: `implement requires <scope>/<task> argument, e.g. 026/T009. Got: '${scopeTask}'`,
			};
			const audit: AuditRecord = { timestamp, command: 'implement', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}

		const { handleImplementCommand, ImplementError } = await import('./command-handlers/implement');
		try {
			const handlerResult = await handleImplementCommand({
				scope: match[1]!,
				task: match[2]!,
				dryRun: options['dry-run'] === true,
				replace: options['replace'] === true,
				modify: options['modify'] === true,
				acceptDrift: options['accept-drift'] === true,
				specsRoot: options['specs-root'] as string | undefined,
				fileOverride: options['file'] as string | undefined,
				projectId: options['project-id'] as string | undefined,
				// Spec 019 R6a — proposal from user's editor AI
				inputPath: options['input'] as string | undefined,
				proposalJson: options['proposal-json'] as string | undefined,
				printPromptOnly: options['print-prompt'] === true,
			});
			console.log(handlerResult.message);
			if (handlerResult.warnings.length > 0) {
				for (const w of handlerResult.warnings) console.warn(`  warn: ${w}`);
			}
			// Spec 019 R6a AC 3 — when called with --print-prompt, emit the
			// system + user prompt to stdout so the developer can paste it
			// into their editor AI.
			if (handlerResult.prompt) {
				console.log('\n=== SYSTEM PROMPT ===\n');
				console.log(handlerResult.prompt.systemPrompt);
				console.log('\n=== USER PROMPT ===\n');
				console.log(handlerResult.prompt.userPrompt);
				console.log('\n=== END PROMPT ===\n');
				console.log('Paste the above into your editor AI. When it returns a JSON');
				console.log('proposal, save it to a file and re-run:');
				console.log(`  wxkanban-agent implement ${match[1]}/${match[2]} --input <proposal.json>`);
			}
			const result: CommandResult<Record<string, unknown>> = {
				success: handlerResult.exitCode === 0,
				artifact: handlerResult as unknown as Record<string, unknown>,
			};
			if (handlerResult.exitCode !== 0) {
				result.error = handlerResult.message;
			}
			const audit: AuditRecord = { timestamp, command: 'implement', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const exitCode = err instanceof ImplementError ? err.exitCode : 3;
			const result: CommandResult<Record<string, unknown>> = { success: false, error: `implement exited ${exitCode}: ${message}` };
			const audit: AuditRecord = { timestamp, command: 'implement', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
	}

	// Spec 019 R6a — createspecs is MCP-input-driven. The user's editor AI
	// produces the CreateSpecsArgs JSON; this dispatcher passes it through
	// to the handler which writes the spec artifacts. No kit-internal AI.
	static async runCreateSpecs(
		context: ProjectContext,
		options: Record<string, unknown>,
		user?: string,
	): Promise<{ result: CommandResult<Record<string, unknown>>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = evaluateStageOnly(
			context.lifecycleStage, 'createspecs', context.customCommands,
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'createspecs', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}

		const { runCreateSpecsCommand, CreateSpecsError } = await import('./command-handlers/createspecs');
		try {
			const handlerResult = await runCreateSpecsCommand({
				inputPath: options['input'] as string | undefined,
				proposalJson: options['proposal-json'] as string | undefined,
				printPromptOnly: options['print-prompt'] === true,
			});
			console.log(handlerResult.message);
			if (handlerResult.prompt) {
				console.log('\n=== SYSTEM PROMPT ===\n');
				console.log(handlerResult.prompt.systemPrompt);
				console.log('\n=== USER PROMPT ===\n');
				console.log(handlerResult.prompt.userPrompt);
				console.log('\n=== END PROMPT ===\n');
				console.log('Paste the above into your editor AI. Save the returned JSON to a file,');
				console.log('then re-run:  wxkanban-agent createspecs --input <args.json>');
			}
			const result: CommandResult<Record<string, unknown>> = {
				success: handlerResult.exitCode === 0,
				artifact: handlerResult as unknown as Record<string, unknown>,
			};
			if (handlerResult.exitCode !== 0) {
				result.error = handlerResult.message;
			}
			const audit: AuditRecord = { timestamp, command: 'createspecs', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const exitCode = err instanceof CreateSpecsError ? err.exitCode : 3;
			const result: CommandResult<Record<string, unknown>> = { success: false, error: `createspecs exited ${exitCode}: ${message}` };
			const audit: AuditRecord = { timestamp, command: 'createspecs', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
	}

	static async runKitStatus(
		context: ProjectContext,
		options: Record<string, unknown>,
		user?: string,
	): Promise<{ result: CommandResult<Record<string, unknown>>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = evaluateStageOnly(
			context.lifecycleStage, 'kit:status', context.customCommands,
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'kit:status', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		const { handleKitStatusCommand } = await import('./command-handlers/kit-status');
		const handlerResult = await handleKitStatusCommand({
			format: (options['format'] as 'text' | 'json' | undefined) ?? 'text',
			strict: options['strict'] === true,
		});
		console.log(handlerResult.output);
		const success = handlerResult.exitCode === 0;
		const result: CommandResult<Record<string, unknown>> = success
			? { success: true, artifact: { summary: handlerResult.report?.summary, exitCode: handlerResult.exitCode } }
			: { success: false, error: `kit:status exited with code ${handlerResult.exitCode}` };
		const audit: AuditRecord = { timestamp, command: 'kit:status', input: options, result: result as unknown as Record<string, unknown>, user };
		return { result, audit };
	}

	static async runScaffoldFrontend(
		context: ProjectContext,
		options: Record<string, unknown>,
		user?: string,
	): Promise<{ result: CommandResult<Record<string, unknown>>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = evaluateStageOnly(
			context.lifecycleStage, 'scaffold:frontend', context.customCommands,
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'scaffold:frontend', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		const { handleScaffoldFrontend } = await import('./command-handlers/scaffold-frontend');
		const handlerResult = await handleScaffoldFrontend({
			dryRun: options['dry-run'] === true || options['dryRun'] === true,
			force: options['force'] === true,
			yes: options['yes'] === true,
		});
		console.log(handlerResult.output);
		const success = handlerResult.exitCode === 0;
		const result: CommandResult<Record<string, unknown>> = success
			? {
				success: true,
				artifact: {
					exitCode: handlerResult.exitCode,
					actions: handlerResult.actions,
					packageJsonChanged: handlerResult.packageJsonChanged,
					claudeMdChanged: handlerResult.claudeMdChanged,
				},
			}
			: { success: false, error: `scaffold:frontend exited with code ${handlerResult.exitCode}` };
		const audit: AuditRecord = { timestamp, command: 'scaffold:frontend', input: options, result: result as unknown as Record<string, unknown>, user };
		return { result, audit };
	}

	static async runAuditFences(
		context: ProjectContext,
		options: Record<string, unknown>,
		user?: string,
	): Promise<{ result: CommandResult<Record<string, unknown>>; audit: AuditRecord }> {
		const timestamp = new Date().toISOString();
		const policy = evaluateStageOnly(
			context.lifecycleStage, 'auditfences', context.customCommands,
		);
		if (!policy.allowed) {
			const result: CommandResult<Record<string, unknown>> = { success: false, error: policy.reason };
			const audit: AuditRecord = { timestamp, command: 'auditfences', input: options, result: result as unknown as Record<string, unknown>, user };
			return { result, audit };
		}
		const { handleAuditFencesCommand } = await import('./command-handlers/auditfences');
		const handlerResult = await handleAuditFencesCommand({
			path: options['path'] as string | undefined,
			format: (options['format'] as 'text' | 'json' | undefined) ?? 'text',
			strict: options['strict'] === true,
			baseline: options['baseline'] === true,
			history: options['history'] as string | undefined,
			specsRoot: options['specs-root'] as string | undefined,
			legacyFile: options['legacy-file'] as string | undefined,
		});
		console.log(handlerResult.output);
		const success = handlerResult.exitCode === 0;
		const result: CommandResult<Record<string, unknown>> = success
			? { success: true, artifact: { summary: handlerResult.result?.summary, exitCode: handlerResult.exitCode } }
			: { success: false, error: `auditfences exited with code ${handlerResult.exitCode}` };
		const audit: AuditRecord = { timestamp, command: 'auditfences', input: options, result: result as unknown as Record<string, unknown>, user };
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
		const policy = isSpecGatedCommand(command)
			? evaluateCommand(
				context.lifecycleStage,
				command,
				options?.specVerification,
				options?.override,
				context.customCommands,
			)
			: evaluateStageOnly(
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
			case 'auditfences':
				return WorkflowEngine.runAuditFences(context, input, user);
			case 'implement':
				return WorkflowEngine.runImplement(context, input, user);
			case 'createspecs':
				return WorkflowEngine.runCreateSpecs(context, input, user);
			case 'kit:status':
				return WorkflowEngine.runKitStatus(context, input, user);
			case 'scaffold:frontend':
				return WorkflowEngine.runScaffoldFrontend(context, input, user);
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
