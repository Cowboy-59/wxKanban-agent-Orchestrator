// Command rules loader — loads additional command rules from project config
import * as fs from 'fs';
import * as path from 'path';

export interface CommandRulesConfig {
	customCommands?: string[];
	disabledCommands?: string[];
}

export function loadCommandRules(projectRoot: string): CommandRulesConfig {
	const settingsPath = path.join(projectRoot, 'ai-settings.json');
	if (!fs.existsSync(settingsPath)) {
		return {};
	}

	try {
		const raw = fs.readFileSync(settingsPath, 'utf-8');
		const settings = JSON.parse(raw) as Record<string, unknown>;
		return {
			customCommands: Array.isArray(settings['customCommands']) ? settings['customCommands'] as string[] : undefined,
			disabledCommands: Array.isArray(settings['disabledCommands']) ? settings['disabledCommands'] as string[] : undefined,
		};
	} catch {
		return {};
	}
}
