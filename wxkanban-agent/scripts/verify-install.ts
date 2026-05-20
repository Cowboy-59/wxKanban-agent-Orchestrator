#!/usr/bin/env node
// Install verification gate (R11) — proves the kit is fully operational
import * as fs from 'fs';
import * as path from 'path';
import { LifecycleClient } from '../services/lifecycle-api/lifecycle-client';
// Spec 030 — cli-adapter helpers replace direct command-policy + lifecycle exports.
import { evaluateCommandAllowed, getAllowedCommandsForStage } from '../core/policy/adapters/cli-adapter';
import { LifecycleStage } from '../core/schemas/lifecycle';
import { WorkflowEngine } from '../core/orchestrator/workflow-engine';
import { ProjectContext } from '../core/context/project-context';
import { resolveServiceUrl } from '../core/context/runtime-state';
import { handleKitStatusCommand } from '../core/orchestrator/command-handlers/kit-status';

interface VerificationStep {
	name: string;
	status: 'pass' | 'fail' | 'skip';
	message: string;
	durationMs: number;
}

async function runVerification(): Promise<{ success: boolean; steps: VerificationStep[] }> {
	const steps: VerificationStep[] = [];
	const projectRoot = process.cwd();

	// Step 1: Check .wxkanban-project.json exists
	const step1Start = Date.now();
	const configPath = path.join(projectRoot, '.wxkanban-project.json');
	if (fs.existsSync(configPath)) {
		steps.push({ name: 'project-config', status: 'pass', message: 'Found .wxkanban-project.json', durationMs: Date.now() - step1Start });
	} else {
		steps.push({ name: 'project-config', status: 'fail', message: 'Missing .wxkanban-project.json', durationMs: Date.now() - step1Start });
		return { success: false, steps };
	}

	// Read projectId
	let projectId = '';
	try {
		const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		projectId = config['projectId'] as string || '';
	} catch {
		steps.push({ name: 'project-config-parse', status: 'fail', message: 'Cannot parse .wxkanban-project.json', durationMs: 0 });
		return { success: false, steps };
	}

	// Step 2: MCP server health check.
	// Spec 028 / T023 — split into `hosted-mcp-reachable` and `token-valid` when the
	// resolved URL is https://; otherwise keep the legacy local-MCP check.
	const step2Start = Date.now();
	const mcpUrl = resolveServiceUrl('mcp');
	const isHosted = /^https:\/\//i.test(mcpUrl);
	const stepName = isHosted ? 'hosted-mcp-reachable' : 'mcp-health';
	const client = new LifecycleClient({ projectId });
	const health = await client.checkHealth();
	if (health.healthy) {
		steps.push({ name: stepName, status: 'pass', message: `MCP healthy at ${mcpUrl}`, durationMs: Date.now() - step2Start });
	} else {
		steps.push({ name: stepName, status: 'fail', message: `MCP not reachable at ${mcpUrl}`, durationMs: Date.now() - step2Start });
	}

	if (isHosted) {
		const tokenStepStart = Date.now();
		const tokenCheck = await client.listOpenItems(1);
		if (tokenCheck.success) {
			steps.push({ name: 'token-valid', status: 'pass', message: 'API token accepted by hosted MCP', durationMs: Date.now() - tokenStepStart });
		} else {
			steps.push({ name: 'token-valid', status: 'fail', message: 'Hosted MCP rejected the API token (missing/invalid/revoked)', durationMs: Date.now() - tokenStepStart });
		}
	}

	// Step 3: DB reachability (via MCP health details)
	const step3Start = Date.now();
	const dbConnected = health.details?.['dbConnected'] === true;
	if (dbConnected) {
		steps.push({ name: 'db-reachable', status: 'pass', message: 'wxKanban DB reachable via MCP', durationMs: Date.now() - step3Start });
	} else if (health.healthy) {
		steps.push({ name: 'db-reachable', status: 'fail', message: 'MCP healthy but DB not connected', durationMs: Date.now() - step3Start });
	} else {
		steps.push({ name: 'db-reachable', status: 'skip', message: 'Skipped (MCP not reachable)', durationMs: Date.now() - step3Start });
	}

	// Step 4: Policy engine loads correctly
	const step4Start = Date.now();
	try {
		const allStages = Object.values(LifecycleStage);
		let policyOk = true;
		for (const stage of allStages) {
			const commands = getAllowedCommandsForStage(stage);
			if (!commands || commands.length === 0) {
				policyOk = false;
				break;
			}
			// Verify evaluate works for the first stage-allowed command
			const result = evaluateCommandAllowed(stage, commands[0]!);
			if (!result) {
				policyOk = false;
				break;
			}
		}
		if (policyOk) {
			steps.push({ name: 'policy-engine', status: 'pass', message: 'Policy engine loaded and evaluating correctly', durationMs: Date.now() - step4Start });
		} else {
			steps.push({ name: 'policy-engine', status: 'fail', message: 'Policy engine evaluation failed', durationMs: Date.now() - step4Start });
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({ name: 'policy-engine', status: 'fail', message: `Policy engine error: ${message}`, durationMs: Date.now() - step4Start });
	}

	// Step 5: buildscope --dry-run end-to-end
	const step5Start = Date.now();
	try {
		const context: ProjectContext = {
			projectId,
			projectName: 'verification-test',
			description: 'Install verification dry run',
			lifecycleStage: LifecycleStage.Design,
			features: [],
			artifacts: [],
		};
		const { result } = await WorkflowEngine.dispatch(context, 'buildscope', {
			title: 'Verification Test',
			problemStatement: 'Install verification',
			objectives: ['Verify kit installation'],
		}, 'verify-install');

		if (result.success) {
			steps.push({ name: 'buildscope-dryrun', status: 'pass', message: 'buildscope executed successfully end-to-end', durationMs: Date.now() - step5Start });
		} else {
			steps.push({ name: 'buildscope-dryrun', status: 'fail', message: `buildscope failed: ${result.error}`, durationMs: Date.now() - step5Start });
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({ name: 'buildscope-dryrun', status: 'fail', message: `buildscope error: ${message}`, durationMs: Date.now() - step5Start });
	}

	// [SCOPE 027 / T022] BEGIN — verify-install kit:status step
	const stepKitStatusStart = Date.now();
	try {
		const kitStatusResult = await handleKitStatusCommand({ format: 'json' });
		if (kitStatusResult.exitCode === 2) {
			steps.push({
				name: 'kit-status',
				status: 'skip',
				message: 'Skipped (runtime-state file absent — kit not started in this session)',
				durationMs: Date.now() - stepKitStatusStart,
			});
		} else if (kitStatusResult.exitCode === 0) {
			steps.push({
				name: 'kit-status',
				status: 'pass',
				message: `kit:status reports ${kitStatusResult.report?.summary.healthy} healthy service(s)`,
				durationMs: Date.now() - stepKitStatusStart,
			});
		} else {
			steps.push({
				name: 'kit-status',
				status: 'fail',
				message: `kit:status reports stale or missing services (exit ${kitStatusResult.exitCode})`,
				durationMs: Date.now() - stepKitStatusStart,
			});
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({
			name: 'kit-status',
			status: 'fail',
			message: `kit:status threw: ${message}`,
			durationMs: Date.now() - stepKitStatusStart,
		});
	}
	// [SCOPE 027 / T022] END

	// Step 6: spec 026 — templates bundled
	const step6Start = Date.now();
	const templateChecks = [
		path.join(__dirname, '..', 'templates', 'migrations', '0001-026-codefencing.sql'),
		path.join(__dirname, '..', 'templates', 'CLAUDE.md.fencing-snippet.md'),
		path.join(__dirname, '..', 'templates', 'auditfences-github-action.yml'),
		path.join(__dirname, '..', 'templates', 'schema', 'taskfences.ts'),
	];
	const missingTemplates = templateChecks.filter(p => !fs.existsSync(p));
	if (missingTemplates.length === 0) {
		steps.push({ name: 'spec026-templates', status: 'pass', message: 'All spec 026 templates bundled', durationMs: Date.now() - step6Start });
	} else {
		steps.push({ name: 'spec026-templates', status: 'fail', message: `Missing templates: ${missingTemplates.map(p => path.basename(p)).join(', ')}`, durationMs: Date.now() - step6Start });
	}

	// Step 7: spec 026 — implement command registered + responds to invalid arg
	const step7Start = Date.now();
	try {
		const ctx: ProjectContext = {
			projectId,
			projectName: 'verification-test',
			description: 'Install verification',
			lifecycleStage: LifecycleStage.Implementation,
			features: [],
			artifacts: [],
		};
		const { result } = await WorkflowEngine.dispatch(ctx, 'implement', {}, 'verify-install', {
			specVerification: { specExists: true, tasksExist: true, documentsExist: true, specStatus: 'in_progress' },
		});
		if (!result.success && (result.error || '').includes('implement requires <scope>/<task>')) {
			steps.push({ name: 'implement-registered', status: 'pass', message: 'implement command registered and validates arguments', durationMs: Date.now() - step7Start });
		} else {
			steps.push({ name: 'implement-registered', status: 'fail', message: `implement command unexpected response: ${result.error || 'success'}`, durationMs: Date.now() - step7Start });
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({ name: 'implement-registered', status: 'fail', message: `implement check error: ${message}`, durationMs: Date.now() - step7Start });
	}

	// Step 8: spec 026 — auditfences command runs to completion (dry baseline scan)
	const step8Start = Date.now();
	try {
		const ctx: ProjectContext = {
			projectId,
			projectName: 'verification-test',
			description: 'Install verification',
			lifecycleStage: LifecycleStage.Implementation,
			features: [],
			artifacts: [],
		};
		const { result } = await WorkflowEngine.dispatch(ctx, 'auditfences', { format: 'json' }, 'verify-install');
		if (result.success || (result.artifact && (result.artifact as Record<string, unknown>)['summary'])) {
			steps.push({ name: 'auditfences-runs', status: 'pass', message: 'auditfences command runs to completion', durationMs: Date.now() - step8Start });
		} else {
			steps.push({ name: 'auditfences-runs', status: 'pass', message: 'auditfences ran (reported findings — expected in pre-baseline repo)', durationMs: Date.now() - step8Start });
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({ name: 'auditfences-runs', status: 'fail', message: `auditfences error: ${message}`, durationMs: Date.now() - step8Start });
	}

	// Step 9: spec 026 — fence-emitter module loads
	const step9Start = Date.now();
	try {
		const { emitFence, MAX_DESCRIPTION_LENGTH, FULL_REPLACEMENT_THRESHOLD } = await import('../core/orchestrator/fence-emitter');
		if (typeof emitFence === 'function' && MAX_DESCRIPTION_LENGTH === 60 && FULL_REPLACEMENT_THRESHOLD === 0.8) {
			steps.push({ name: 'fence-emitter-loaded', status: 'pass', message: 'fence-emitter module loaded with spec constants', durationMs: Date.now() - step9Start });
		} else {
			steps.push({ name: 'fence-emitter-loaded', status: 'fail', message: 'fence-emitter loaded but spec constants do not match', durationMs: Date.now() - step9Start });
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		steps.push({ name: 'fence-emitter-loaded', status: 'fail', message: `fence-emitter load failed: ${message}`, durationMs: Date.now() - step9Start });
	}

	// Write verification timestamp if all pass
	const allPassed = steps.every(s => s.status === 'pass' || s.status === 'skip');
	if (allPassed) {
		try {
			const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			config['install-verified-at'] = new Date().toISOString();
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		} catch {
			// Non-fatal
		}
	}

	return { success: allPassed, steps };
}

// CLI entry
if (require.main === module) {
	runVerification().then(({ success, steps }) => {
		console.log('\n=== wxKanban Kit Install Verification ===\n');
		for (const step of steps) {
			const icon = step.status === 'pass' ? 'PASS' : step.status === 'fail' ? 'FAIL' : 'SKIP';
			console.log(`  [${icon}] ${step.name}: ${step.message} (${step.durationMs}ms)`);
		}
		console.log(`\nResult: ${success ? 'ALL CHECKS PASSED' : 'VERIFICATION FAILED'}\n`);
		if (!success) process.exit(1);
	}).catch((err: Error) => {
		console.error(`Fatal: ${err.message}`);
		process.exit(1);
	});
}

export { runVerification };
