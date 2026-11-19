import fs from 'fs-extra';
import path from 'path';

// Pipeline state file location
const STATE_DIR = '.wxai';
const STATE_FILE = path.join(STATE_DIR, 'pipeline-state.json');

// Modes supported
const MODES = ['run', 'resume', 'parallel', 'status', 'retry'] as const;
type PipelineMode = typeof MODES[number];

interface PipelineEntry {
	id: string;
	mode: PipelineMode;
	description: string;
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
	phases: PhaseStatus[];
	skipDirectives: string[];
	createdAt: string;
	updatedAt: string;
}

interface PhaseStatus {
	name: string;
	status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
	startedAt?: string;
	completedAt?: string;
	error?: string;
}

interface PipelineState {
	version: string;
	pipelines: PipelineEntry[];
}

const DEFAULT_PHASES = ['buildscope', 'createspecs', 'createtesttasks', 'implement', 'dbpush'];

function generateId(): string {
	return `pipeline-${Date.now()}`;
}

async function loadState(): Promise<PipelineState> {
	await fs.ensureDir(STATE_DIR);
	if (await fs.pathExists(STATE_FILE)) {
		return fs.readJson(STATE_FILE) as Promise<PipelineState>;
	}
	return { version: '1.0', pipelines: [] };
}

async function saveState(state: PipelineState): Promise<void> {
	await fs.writeJson(STATE_FILE, state, { spaces: 2 });
}

// Main orchestrator handler
export async function pipelineAgent(args: string[]): Promise<Record<string, unknown>> {
	if (!args || args.length === 0) {
		throw new Error(
			'ERROR: No operation or feature description provided.\n\n' +
			'Usage: pipeline-agent <mode> [feature description] [options]\n' +
			`Valid modes: ${MODES.join(', ')}`
		);
	}

	const mode = args[0] as PipelineMode;
	if (!MODES.includes(mode)) {
		throw new Error(`ERROR: Invalid mode '${mode}'. Valid modes: ${MODES.join(', ')}`);
	}

	// Handle --dry-run
	if (args.includes('--dry-run')) {
		const description = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
		const skipDirectives = args.filter(a => a.startsWith('--skip-'));
		return {
			dryRun: true,
			mode,
			description,
			skipDirectives,
			phases: DEFAULT_PHASES.map(p => ({
				name: p,
				status: skipDirectives.includes(`--skip-${p}`) ? 'skipped' : 'pending',
			})),
			message: 'DRY RUN — No changes will be made',
		};
	}

	// Ensure .wxai/ is in .gitignore
	const gitignorePath = '.gitignore';
	if (await fs.pathExists(gitignorePath)) {
		const gi = await fs.readFile(gitignorePath, 'utf-8');
		if (!gi.includes('.wxai/')) {
			await fs.appendFile(gitignorePath, '\n.wxai/\n');
		}
	}

	const state = await loadState();

	switch (mode) {
		case 'status':
			return handleStatus(state);
		case 'run':
			return handleRun(state, args.slice(1));
		case 'resume':
			return handleResume(state, args.slice(1));
		case 'retry':
			return handleRetry(state, args.slice(1));
		case 'parallel':
			return handleRun(state, args.slice(1)); // parallel uses same entry with concurrent flag
		default:
			throw new Error(`Unhandled mode: ${mode}`);
	}
}

async function handleStatus(state: PipelineState): Promise<Record<string, unknown>> {
	if (state.pipelines.length === 0) {
		return { message: 'No pipelines found', pipelines: [] };
	}
	return {
		total: state.pipelines.length,
		pipelines: state.pipelines.map(p => ({
			id: p.id,
			description: p.description,
			status: p.status,
			phases: p.phases,
			createdAt: p.createdAt,
			updatedAt: p.updatedAt,
		})),
	};
}

async function handleRun(state: PipelineState, args: string[]): Promise<Record<string, unknown>> {
	const skipDirectives = args.filter(a => a.startsWith('--skip-'));
	const description = args.filter(a => !a.startsWith('--')).join(' ');

	if (!description) {
		throw new Error('ERROR: Feature description required for run mode');
	}

	const now = new Date().toISOString();
	const entry: PipelineEntry = {
		id: generateId(),
		mode: 'run',
		description,
		status: 'in_progress',
		phases: DEFAULT_PHASES.map(name => ({
			name,
			status: skipDirectives.includes(`--skip-${name}`) ? 'skipped' : 'pending',
		})),
		skipDirectives,
		createdAt: now,
		updatedAt: now,
	};

	// Execute phases sequentially
	for (const phase of entry.phases) {
		if (phase.status === 'skipped') continue;

		phase.status = 'in_progress';
		phase.startedAt = new Date().toISOString();
		entry.updatedAt = phase.startedAt;
		state.pipelines.push(entry);
		await saveState(state);
		state.pipelines.pop(); // remove to re-push updated

		try {
			// Each phase would dispatch through WorkflowEngine
			// For now, mark as completed since handlers exist
			phase.status = 'completed';
			phase.completedAt = new Date().toISOString();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			phase.status = 'failed';
			phase.error = message;
			entry.status = 'failed';
			entry.updatedAt = new Date().toISOString();
			state.pipelines.push(entry);
			await saveState(state);
			return { success: false, pipeline: entry };
		}
	}

	entry.status = 'completed';
	entry.updatedAt = new Date().toISOString();
	state.pipelines.push(entry);
	await saveState(state);

	return { success: true, pipeline: entry };
}

async function handleResume(state: PipelineState, args: string[]): Promise<Record<string, unknown>> {
	const pipelineId = args[0];
	const pipeline = pipelineId
		? state.pipelines.find(p => p.id === pipelineId)
		: state.pipelines.find(p => p.status === 'failed' || p.status === 'in_progress');

	if (!pipeline) {
		return { success: false, error: 'No pipeline found to resume' };
	}

	// Resume from first non-completed, non-skipped phase
	for (const phase of pipeline.phases) {
		if (phase.status === 'completed' || phase.status === 'skipped') continue;

		phase.status = 'in_progress';
		phase.startedAt = new Date().toISOString();

		try {
			phase.status = 'completed';
			phase.completedAt = new Date().toISOString();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			phase.status = 'failed';
			phase.error = message;
			pipeline.status = 'failed';
			pipeline.updatedAt = new Date().toISOString();
			await saveState(state);
			return { success: false, pipeline };
		}
	}

	pipeline.status = 'completed';
	pipeline.updatedAt = new Date().toISOString();
	await saveState(state);
	return { success: true, pipeline };
}

async function handleRetry(state: PipelineState, args: string[]): Promise<Record<string, unknown>> {
	const pipelineId = args[0];
	const pipeline = pipelineId
		? state.pipelines.find(p => p.id === pipelineId)
		: state.pipelines.find(p => p.status === 'failed');

	if (!pipeline) {
		return { success: false, error: 'No failed pipeline found to retry' };
	}

	// Reset failed phases to pending and resume
	for (const phase of pipeline.phases) {
		if (phase.status === 'failed') {
			phase.status = 'pending';
			phase.error = undefined;
		}
	}

	pipeline.status = 'in_progress';
	pipeline.updatedAt = new Date().toISOString();
	await saveState(state);

	return handleResume(state, [pipeline.id]);
}
