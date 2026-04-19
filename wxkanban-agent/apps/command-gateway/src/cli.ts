// Entry point for CLI command gateway (R4)
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowEngine } from '../../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../../core/context/project-context';
import { LifecycleStage } from '../../../core/schemas/lifecycle';
import { AllowedCommandsByStage, CrossCuttingCommands } from '../../../core/schemas/lifecycle';

interface ProjectConfig {
	projectId: string;
	version: string;
	kitVersion: string;
}

function loadProjectConfig(): ProjectConfig {
	const configPath = path.resolve(process.cwd(), '.wxkanban-project.json');
	if (!fs.existsSync(configPath)) {
		throw new Error(`No .wxkanban-project.json found in ${process.cwd()}. Run kit init first.`);
	}
	const raw = fs.readFileSync(configPath, 'utf-8');
	return JSON.parse(raw) as ProjectConfig;
}

function resolveProjectContext(config: ProjectConfig): ProjectContext {
	// Read lifecycle stage from .wxai/project.json if it exists
	let lifecycleStage = LifecycleStage.Design;
	const wxaiPath = path.resolve(process.cwd(), '.wxai', 'project.json');
	if (fs.existsSync(wxaiPath)) {
		try {
			const wxai = JSON.parse(fs.readFileSync(wxaiPath, 'utf-8')) as Record<string, unknown>;
			const stage = wxai['lifecycleStage'] as string;
			if (stage && Object.values(LifecycleStage).includes(stage as LifecycleStage)) {
				lifecycleStage = stage as LifecycleStage;
			}
		} catch {
			// Use default
		}
	}

	// Read custom commands from ai-settings.json if present
	let customCommands: string[] | undefined;
	const aiSettingsPath = path.resolve(process.cwd(), 'ai-settings.json');
	if (fs.existsSync(aiSettingsPath)) {
		try {
			const settings = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf-8')) as Record<string, unknown>;
			const cmds = settings['customCommands'] as string[] | undefined;
			if (Array.isArray(cmds)) {
				customCommands = cmds;
			}
		} catch {
			// Ignore
		}
	}

	return {
		projectId: config.projectId,
		projectName: path.basename(process.cwd()),
		description: '',
		lifecycleStage,
		features: [],
		artifacts: [],
		customCommands,
	};
}

function printAvailableCommands(stage: LifecycleStage, customCommands?: string[]): void {
	const stageCommands = AllowedCommandsByStage[stage] || [];
	const allCommands = [...stageCommands, ...CrossCuttingCommands, ...(customCommands || [])];
	console.log(`\nwxKanban Agent Orchestrator Kit`);
	console.log(`Current stage: ${stage}\n`);
	console.log(`Available commands:`);
	for (const cmd of allCommands) {
		console.log(`  ${cmd}`);
	}
	console.log(`\nUsage: wxkanban-agent <command> [options]`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const config = loadProjectConfig();
	const context = resolveProjectContext(config);

	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		printAvailableCommands(context.lifecycleStage, context.customCommands);
		return;
	}

	if (args[0] === '--version' || args[0] === '-v') {
		const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf-8')) as Record<string, unknown>;
		console.log(`wxkanban-agent v${pkg['version'] || '1.0.0'}`);
		return;
	}

	const command = args[0];
	const rawOptions: Record<string, unknown> = {};

	// Parse simple CLI flags: --key value or --flag
	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const next = args[i + 1];
			if (next && !next.startsWith('--')) {
				rawOptions[key] = next;
				i++;
			} else {
				rawOptions[key] = true;
			}
		}
	}

	const user = (rawOptions['user'] as string) || process.env['USER'] || 'cli-user';
	delete rawOptions['user'];

	const { result, audit } = await WorkflowEngine.dispatch(context, command, rawOptions, user);

	if (result.success) {
		console.log(JSON.stringify({ status: 'success', artifact: result.artifact, audit }, null, 2));
	} else {
		console.error(JSON.stringify({ status: 'error', error: result.error, audit }, null, 2));
		process.exit(1);
	}
}

main().catch((err: Error) => {
	console.error(`Fatal: ${err.message}`);
	process.exit(1);
});
