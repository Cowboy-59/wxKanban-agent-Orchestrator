// Entry point for HTTP command gateway (R4)
import express from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowEngine } from '../../../core/orchestrator/workflow-engine';
import { ensureCockpitUpToDate } from '../../../core/orchestrator/cockpit-refresh';
import { ensureKitUpToDate } from '../../../core/orchestrator/kit-update-check';
import { ProjectContext } from '../../../core/context/project-context';
import { LifecycleStage } from '../../../core/schemas/lifecycle';
// Spec 030 FR-007 — AllowedCommandsByStage + CrossCuttingCommands were removed
// from lifecycle.ts; the canonical per-stage command set comes from the
// cli-adapter (same path cli.ts and the MCP server use). This handler was the
// straggler that never migrated.
import { getAllowedCommandsForStage } from '../../../core/policy/adapters/cli-adapter';
import { bindWithAutoselect, PortRangeExhaustedError } from '../../../core/runtime/port-autoselect';
import { startParentWatcher, resolveParentPid } from '../../../core/runtime/parent-watcher';
import { writeServiceEntry, removeServiceEntry, reapDeadEntries } from '../../../core/runtime/state-file';
import { derivePreferredPort } from '../../../core/context/runtime-state';

// [SCOPE 068 / FR-005] Preferred port: explicit override wins; otherwise a
// deterministic per-project port (computed in startGateway from the project id).
const SHUTDOWN_GRACE_MS = parseInt(process.env['KIT_SHUTDOWN_GRACE_MS'] || '5000', 10);
const PROJECT_ROOT = process.cwd();
let BOUND_PORT = parseInt(process.env['GATEWAY_HTTP_PORT'] || '3003', 10);

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

// Health check — [SCOPE 068 / FR-002] echo project identity so a client can
// verify it's talking to its OWN project's gateway.
app.get('/health', (_req, res) => {
	const context = resolveProjectContext();
	res.json({
		status: 'ok',
		service: 'command-gateway',
		port: BOUND_PORT,
		projectId: context.projectId,
		projectRoot: PROJECT_ROOT,
	});
});

// List available commands for current stage
app.get('/commands', (_req, res) => {
	const context = resolveProjectContext();
	const allCommands = getAllowedCommandsForStage(context.lifecycleStage, context.customCommands);
	res.json({
		stage: context.lifecycleStage,
		commands: allCommands,
		projectId: context.projectId, // [SCOPE 068 / FR-002]
		projectRoot: PROJECT_ROOT,
	});
});

// Dispatch a command
app.post('/dispatch', async (req, res) => {
	const context = resolveProjectContext();
	const { command, input, user, projectId } = req.body as {
		command: string;
		input?: Record<string, unknown>;
		user?: string;
		projectId?: string;
	};

	if (!command) {
		res.status(400).json({ error: 'Missing required field: command' });
		return;
	}

	// [SCOPE 068 / FR-003] If the caller asserts a projectId, it MUST match this
	// gateway's project — otherwise we'd execute against the wrong repo. Absent
	// projectId stays back-compatible with older clients.
	if (projectId && context.projectId && projectId !== context.projectId) {
		res.status(409).json({
			error: 'projectId mismatch — this gateway belongs to a different project',
			gatewayProjectId: context.projectId,
			requestedProjectId: projectId,
		});
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
		// [SCOPE 068] Reap any stale entry left by a crashed gateway before we
		// bind/write, and pick a deterministic per-project preferred port (env
		// override wins) so two projects never prefer the same one.
		const context = resolveProjectContext();
		try { reapDeadEntries(PROJECT_ROOT); } catch { /* best effort */ }
		const envPort = process.env['GATEWAY_HTTP_PORT'];
		const preferredPort = envPort
			? parseInt(envPort, 10)
			: derivePreferredPort(context.projectId);

		const { server, port } = await bindWithAutoselect({
			preferredPort,
			buildServer: () => http.createServer(app) as unknown as import('net').Server,
			onListen: () => undefined,
		});
		httpServer = server as unknown as http.Server;
		BOUND_PORT = port;
		console.log(`Command gateway HTTP server listening on port ${port} (project ${context.projectId || '?'})`);
		writeServiceEntry('gateway', {
			port,
			pid: process.pid,
			parentpid: resolveParentPid(),
			startedAt: new Date().toISOString(),
			cmd: 'ts-node apps/command-gateway/src/http.ts',
			projectId: context.projectId || undefined,
		});
		watcher = startParentWatcher(resolveParentPid(), () => {
			void shutdown('parent-gone');
		});

		// Phase-agnostic cockpit self-heal. The dbpush/implement triggers only
		// fire in the Implementation phase; a Design-phase developer (the WinDev
		// conversion beachhead lives here) could run for weeks without ever
		// hitting them and stay stranded on an old cockpit. Boot is the one moment
		// every project-open passes through regardless of phase. Best-effort: any
		// failure is swallowed inside ensureCockpitUpToDate and never affects the
		// gateway. WXKANBAN_NO_COCKPIT_UPDATE / _REFRESH disable it.
		try { ensureCockpitUpToDate(); } catch { /* never block gateway boot */ }
		// Same boot moment self-surfaces a newer kit release (notify + confirm;
		// nothing overwritten). Silent in the author repo, throttled, best-effort.
		try { ensureKitUpToDate(); } catch { /* never block gateway boot */ }
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
