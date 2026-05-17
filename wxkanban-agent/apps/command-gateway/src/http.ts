// Entry point for HTTP command gateway (R4)
import express from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowEngine } from '../../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../../core/context/project-context';
import { LifecycleStage } from '../../../core/schemas/lifecycle';
import { AllowedCommandsByStage, CrossCuttingCommands } from '../../../core/schemas/lifecycle';
import { bindWithAutoselect, PortRangeExhaustedError } from '../../../core/runtime/port-autoselect';
import { startParentWatcher, resolveParentPid } from '../../../core/runtime/parent-watcher';
import { writeServiceEntry, removeServiceEntry } from '../../../core/runtime/state-file';

const PREFERRED_PORT = parseInt(process.env['GATEWAY_HTTP_PORT'] || '3003', 10);
const SHUTDOWN_GRACE_MS = parseInt(process.env['KIT_SHUTDOWN_GRACE_MS'] || '5000', 10);
let BOUND_PORT = PREFERRED_PORT;

function resolveProjectContext(): ProjectContext {
	const configPath = path.resolve(process.cwd(), '.wxkanban-project.json');
	let projectId = process.env['WXKANBAN_PROJECT_ID'] || '';
	let lifecycleStage = LifecycleStage.Design;
	let customCommands: string[] | undefined;

	if (fs.existsSync(configPath)) {
		try {
			const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			projectId = (config['projectId'] as string) || projectId;
		} catch {
			// Use defaults
		}
	}

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
		projectId,
		projectName: path.basename(process.cwd()),
		description: '',
		lifecycleStage,
		features: [],
		artifacts: [],
		customCommands,
	};
}

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
	res.json({ status: 'ok', service: 'command-gateway', port: BOUND_PORT });
});

// List available commands for current stage
app.get('/commands', (_req, res) => {
	const context = resolveProjectContext();
	const stageCommands = AllowedCommandsByStage[context.lifecycleStage] || [];
	const allCommands = [...stageCommands, ...CrossCuttingCommands, ...(context.customCommands || [])];
	res.json({
		stage: context.lifecycleStage,
		commands: allCommands,
	});
});

// Dispatch a command
app.post('/dispatch', async (req, res) => {
	const context = resolveProjectContext();
	const { command, input, user } = req.body as {
		command: string;
		input?: Record<string, unknown>;
		user?: string;
	};

	if (!command) {
		res.status(400).json({ error: 'Missing required field: command' });
		return;
	}

	const { result, audit } = await WorkflowEngine.dispatch(
		context,
		command,
		input || {},
		user || 'http-gateway'
	);

	if (result.success) {
		res.json({ status: 'success', artifact: result.artifact, audit });
	} else {
		res.status(422).json({ status: 'error', error: result.error, audit });
	}
});

// [SCOPE 027 / T007] BEGIN — Wire gateway autoselect + parent-watcher
async function startGateway(): Promise<void> {
	let httpServer: import('http').Server | null = null;
	let watcher: { stop(): void } | null = null;
	let shuttingDown = false;

	const shutdown = async (reason: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`gateway: shutting down (${reason})`);
		if (watcher) {
			try { watcher.stop(); } catch { /* best effort */ }
		}
		try { removeServiceEntry('gateway'); } catch { /* best effort */ }
		if (httpServer) {
			const closed = new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					try { httpServer!.closeAllConnections?.(); } catch { /* node < 18.2 */ }
					resolve();
				}, SHUTDOWN_GRACE_MS);
				httpServer!.close(() => { clearTimeout(timer); resolve(); });
			});
			await closed;
		}
		process.exit(0);
	};

	process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
	process.on('SIGINT', () => { void shutdown('SIGINT'); });

	try {
		const { server, port } = await bindWithAutoselect({
			preferredPort: PREFERRED_PORT,
			buildServer: () => http.createServer(app) as unknown as import('net').Server,
			onListen: () => undefined,
		});
		httpServer = server as unknown as http.Server;
		BOUND_PORT = port;
		console.log(`Command gateway HTTP server listening on port ${port}`);
		writeServiceEntry('gateway', {
			port,
			pid: process.pid,
			parentpid: resolveParentPid(),
			startedAt: new Date().toISOString(),
			cmd: 'ts-node apps/command-gateway/src/http.ts',
		});
		watcher = startParentWatcher(resolveParentPid(), () => {
			void shutdown('parent-gone');
		});
	} catch (err) {
		if (err instanceof PortRangeExhaustedError) {
			console.error(
				`ERROR: cannot find a free port for gateway in range ${err.preferredPort}–${err.preferredPort + err.scanRange - 1}.\n` +
				`Suggestions:\n` +
				`  - Kill stale processes: wxkanban-agent kit:stop\n` +
				`  - Override the start port: GATEWAY_HTTP_PORT=4000 npm run kit:start`,
			);
			process.exit(1);
		}
		throw err;
	}
}
// [SCOPE 027 / T007] END

if (require.main === module) {
	void startGateway();
}

export { app, startGateway };
