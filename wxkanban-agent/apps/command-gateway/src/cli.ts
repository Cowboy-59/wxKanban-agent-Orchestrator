// Entry point for CLI command gateway (R4)
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowEngine, DispatchOptions } from '../../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../../core/context/project-context';
import { LifecycleStage } from '../../../core/schemas/lifecycle';
// Spec 030 — getAllowedCommandsForStage replaces direct use of the legacy
// AllowedCommandsByStage + CrossCuttingCommands exports; SpecVerification
// re-exported from cli-adapter for import-path-swap convenience.
import { getAllowedCommandsForStage, SpecVerification } from '../../../core/policy/adapters/cli-adapter';
import { buildSpecVerification, extractScopeNumber } from './spec-verification';
// Spec 031 Phase 2 — batch-mode `implement <scope>` dispatches directly to the
// orchestrator's batch handler, bypassing WorkflowEngine. Surgical mode
// (`implement <scope>/<task>`) continues through WorkflowEngine unchanged.
import {
	handleImplementBatchCommand,
	formatBatchSummaryTable,
} from '../../../core/orchestrator/command-handlers/implement';

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
	const allCommands = getAllowedCommandsForStage(stage, customCommands);
	console.log(`\nwxKanban Agent Orchestrator Kit`);
	console.log(`Current stage: ${stage}\n`);
	console.log(`Available CLI commands (stage-gated):`);
	for (const cmd of allCommands) {
		console.log(`  ${cmd}`);
	}
	console.log(`\nUsage: wxkanban-agent <command> [options]`);
	console.log(`\nFlag conventions:`);
	console.log(`  --key value      space-separated`);
	console.log(`  --key=value      = sign also accepted`);
	console.log(`  --kebab-case     converted to camelCase server-side (e.g. --feature-description → featureDescription)`);
	console.log(`  --camelCase      passed through unchanged`);
	console.log(`  --boolean-flag   passed as true when no value follows`);
	console.log(`\nExample:`);
	console.log(`  wxkanban-agent buildscope --feature-description "Time tracking" --quick`);
	console.log(`  wxkanban-agent buildscope --featureDescription="Time tracking" --quick`);

	const slashCount = countSlashCommands();
	if (slashCount > 0) {
		console.log(`\nClaude Code / slash commands (${slashCount} available):`);
		console.log(`  wxkanban-agent --list-slash    # list with descriptions`);
	}
}

/**
 * Walk _wxAI/commands/<name>.md in the project root and return their metadata.
 * Skips ENFORCEMENT_SUMMARY.md and any non-.md files. Description is parsed
 * from the YAML frontmatter `description:` line; falls back to the first
 * non-blank `# Title` line.
 */
function listSlashCommands(): Array<{ name: string; description: string }> {
	const cmdDir = path.resolve(process.cwd(), '_wxAI', 'commands');
	if (!fs.existsSync(cmdDir)) return [];
	const entries: Array<{ name: string; description: string }> = [];
	for (const file of fs.readdirSync(cmdDir).sort()) {
		if (!file.endsWith('.md')) continue;
		if (file === 'ENFORCEMENT_SUMMARY.md') continue;
		const full = path.join(cmdDir, file);
		let content = '';
		try {
			content = fs.readFileSync(full, 'utf-8');
		} catch {
			continue;
		}
		const name = file.replace(/\.md$/, '');
		let description = '';
		// Frontmatter description (between --- markers)
		const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
		if (fm) {
			const m = fm[1].match(/^description:\s*(.+)$/m);
			if (m) description = m[1].trim().replace(/^["']|["']$/g, '');
		}
		if (!description) {
			// Fall back to the first H1 heading
			const m = content.match(/^#\s+(.+?)(?:\s+—\s+|\s+-\s+|\s*$)/m);
			if (m) description = m[1].trim();
		}
		entries.push({ name, description });
	}
	return entries;
}

function countSlashCommands(): number {
	try {
		const cmdDir = path.resolve(process.cwd(), '_wxAI', 'commands');
		if (!fs.existsSync(cmdDir)) return 0;
		return fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md') && f !== 'ENFORCEMENT_SUMMARY.md').length;
	} catch {
		return 0;
	}
}

function printSlashCommands(): void {
	const cmds = listSlashCommands();
	console.log(`\nClaude Code / slash commands shipped with this kit (${cmds.length}):`);
	if (cmds.length === 0) {
		console.log(`  (none found at ${path.resolve(process.cwd(), '_wxAI', 'commands')})`);
		return;
	}
	const widest = cmds.reduce((w, c) => Math.max(w, c.name.length), 0);
	for (const c of cmds) {
		const desc = c.description || '(no description in frontmatter)';
		console.log(`  /${c.name.padEnd(widest)}  ${desc}`);
	}
	console.log(`\nSource: _wxAI/commands/<name>.md`);
	console.log(`Skills shipped at .claude/<skill>/ (use the matching slash command or load directly in Claude Code).`);
}

// Spec 031 Phase 2 — file-based proposal source.
// Convention: per-task proposal at `.wxai/proposals/<scope>/<taskId>.json`.
// The driving system (today: editor AI writes files; future: claude coworker
// pipes directly) populates this directory before invoking `implement <scope>`.
// Tasks with no proposal file are recorded as skipped (no proposal provided).
function createFileBasedProposalSource(
	projectRoot: string,
	scope: string,
): (taskId: string) => Promise<string | undefined> {
	return async (taskId: string) => {
		const proposalPath = path.resolve(
			projectRoot,
			'.wxai',
			'proposals',
			scope,
			`${taskId}.json`,
		);
		if (!fs.existsSync(proposalPath)) {
			return undefined;
		}
		return fs.readFileSync(proposalPath, 'utf-8');
	};
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const config = loadProjectConfig();
	const context = resolveProjectContext(config);

	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		printAvailableCommands(context.lifecycleStage, context.customCommands);
		return;
	}

	if (args[0] === '--list-slash' || args[0] === '--list-slash-commands') {
		printSlashCommands();
		return;
	}

	if (args[0] === '--version' || args[0] === '-v') {
		const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf-8')) as Record<string, unknown>;
		console.log(`wxkanban-agent v${pkg['version'] || '1.0.0'}`);
		return;
	}

	const command = args[0];
	const rawOptions: Record<string, unknown> = {};

	// BUG-7: pre-split `--key=value` into `--key value` so the standard
	// shell convention works alongside the existing space-separated form.
	// Without this, `--feature-description="x"` was parsed as a single
	// boolean flag with key `feature-description="x"` and the MCP call
	// crashed with `featureDescription: Required`.
	const expandedArgs: string[] = [];
	for (let i = 1; i < args.length; i++) {
		const a = args[i];
		if (a.startsWith('--') && a.includes('=')) {
			const eq = a.indexOf('=');
			expandedArgs.push(a.slice(0, eq), a.slice(eq + 1));
		} else {
			expandedArgs.push(a);
		}
	}

	// Parse CLI flags: --key value or --flag; collect positionals into `_`
	const positionals: string[] = [];
	for (let i = 0; i < expandedArgs.length; i++) {
		const arg = expandedArgs[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			const next = expandedArgs[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				rawOptions[key] = next;
				i++;
			} else {
				rawOptions[key] = true;
			}
		} else {
			positionals.push(arg);
		}
	}
	if (positionals.length > 0) {
		rawOptions['_'] = positionals;
	}

	const user = (rawOptions['user'] as string) || process.env['USER'] || 'cli-user';
	delete rawOptions['user'];

	// Spec 031 Phase 2 — batch-mode short-circuit for `implement <scope>`.
	// A positional matching ^\d{3}$ is batch mode; ^\d{3}/T\d+$ is surgical
	// (passes through to WorkflowEngine unchanged); anything else with the
	// implement command is a malformed argument.
	if (command === 'implement' && positionals.length > 0) {
		const positional = positionals[0]!;
		if (/^[0-9]{3}$/.test(positional)) {
			const batchResult = await handleImplementBatchCommand({
				scope: positional,
				projectRoot: process.cwd(),
				projectId: config.projectId,
				dryRun: rawOptions['dry-run'] === true || rawOptions['dryRun'] === true,
				acceptDrift: rawOptions['accept-drift'] === true || rawOptions['acceptDrift'] === true,
				continueOnError:
					rawOptions['continue-on-error'] === true ||
					rawOptions['continueOnError'] === true,
				proposalSource: createFileBasedProposalSource(process.cwd(), positional),
			});
			const verbose = rawOptions['verbose'] === true;
			console.log(formatBatchSummaryTable(batchResult, { verbose }));
			process.exit(batchResult.exitCode);
		} else if (!/^[0-9]{3}\/T[0-9]+$/.test(positional)) {
			console.error(
				`Fatal: invalid <scope> or <scope>/<task> argument: ${positional}`,
			);
			process.exit(2);
		}
		// else: surgical mode, falls through to WorkflowEngine.dispatch below.
	}

	// BUG-11: spec-gated commands (`implement`, `createtesttasks`, etc.) need
	// SpecVerification in DispatchOptions or evaluateSpecFirst hard-blocks them.
	// Build it from the local filesystem — implement.ts reads the same artifacts
	// via loadSpecBundle, so disk presence is the right gate.
	const scopeNum = extractScopeNumber(command, rawOptions);
	const specVerification: SpecVerification | undefined = scopeNum
		? buildSpecVerification(scopeNum, process.cwd())
		: undefined;
	const dispatchOptions: DispatchOptions | undefined = specVerification
		? { specVerification }
		: undefined;

	const { result, audit } = await WorkflowEngine.dispatch(context, command, rawOptions, user, dispatchOptions);

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
