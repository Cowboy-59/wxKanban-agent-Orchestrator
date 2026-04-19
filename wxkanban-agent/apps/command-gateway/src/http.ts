// Entry point for HTTP command gateway (R4)
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowEngine } from '../../../core/orchestrator/workflow-engine';
import { ProjectContext } from '../../../core/context/project-context';
import { LifecycleStage } from '../../../core/schemas/lifecycle';
import { AllowedCommandsByStage, CrossCuttingCommands } from '../../../core/schemas/lifecycle';

const PORT = parseInt(process.env['GATEWAY_HTTP_PORT'] || '3003', 10);

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
	res.json({ status: 'ok', service: 'command-gateway', port: PORT });
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

app.listen(PORT, () => {
	console.log(`Command gateway HTTP server listening on port ${PORT}`);
});

export { app };
