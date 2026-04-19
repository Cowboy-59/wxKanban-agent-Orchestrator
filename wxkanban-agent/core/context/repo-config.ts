// Repo config types and loader
import * as fs from 'fs';
import * as path from 'path';

export interface RepoConfig {
	projectId: string;
	version: string;
	kitVersion: string;
	mcpServer: string;
	mcpTransport: string;
	mcpHttpUrl: string;
	commandsDir: string;
	rulesDir: string;
}

const DEFAULTS: RepoConfig = {
	projectId: '',
	version: '1.0.0',
	kitVersion: '1.0.0',
	mcpServer: 'mcp-server/dist/index-http.js',
	mcpTransport: 'http',
	mcpHttpUrl: 'http://localhost:3002',
	commandsDir: '_wxAI/commands/',
	rulesDir: '_wxAI-project/rules/',
};

export function loadRepoConfig(projectRoot?: string): RepoConfig {
	const root = projectRoot || process.cwd();
	const configPath = path.join(root, '.wxkanban-project.json');

	if (!fs.existsSync(configPath)) {
		return { ...DEFAULTS };
	}

	try {
		const raw = fs.readFileSync(configPath, 'utf-8');
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			projectId: (parsed['projectId'] as string) || DEFAULTS.projectId,
			version: (parsed['version'] as string) || DEFAULTS.version,
			kitVersion: (parsed['kitVersion'] as string) || DEFAULTS.kitVersion,
			mcpServer: (parsed['mcpServer'] as string) || DEFAULTS.mcpServer,
			mcpTransport: (parsed['mcpTransport'] as string) || DEFAULTS.mcpTransport,
			mcpHttpUrl: (parsed['mcpHttpUrl'] as string) || DEFAULTS.mcpHttpUrl,
			commandsDir: (parsed['commandsDir'] as string) || DEFAULTS.commandsDir,
			rulesDir: (parsed['rulesDir'] as string) || DEFAULTS.rulesDir,
		};
	} catch {
		return { ...DEFAULTS };
	}
}
