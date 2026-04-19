#!/usr/bin/env node
// Install verification gate (R11) — proves the kit is fully operational
import * as fs from 'fs';
import * as path from 'path';
import { LifecycleClient } from '../services/lifecycle-api/lifecycle-client';
import { CommandPolicyEngine } from '../core/policy/command-policy';
import { LifecycleStage, AllowedCommandsByStage } from '../core/schemas/lifecycle';
import { WorkflowEngine } from '../core/orchestrator/workflow-engine';
import { ProjectContext } from '../core/context/project-context';

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

	// Step 2: MCP server health check
	const step2Start = Date.now();
	const mcpUrl = process.env['MCP_BASE_URL'] || 'http://localhost:3002';
	const client = new LifecycleClient({ mcpBaseUrl: mcpUrl, projectId });
	const health = await client.checkHealth();
	if (health.healthy) {
		steps.push({ name: 'mcp-health', status: 'pass', message: `MCP server healthy at ${mcpUrl}`, durationMs: Date.now() - step2Start });
	} else {
		steps.push({ name: 'mcp-health', status: 'fail', message: `MCP server not reachable at ${mcpUrl}`, durationMs: Date.now() - step2Start });
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
			const commands = AllowedCommandsByStage[stage];
			if (!commands || commands.length === 0) {
				policyOk = false;
				break;
			}
			// Verify evaluate works
			const result = CommandPolicyEngine.evaluate(stage, commands[0]);
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
