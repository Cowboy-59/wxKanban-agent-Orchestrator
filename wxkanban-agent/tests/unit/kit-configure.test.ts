import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleKitConfigureCommand } from '../../core/orchestrator/command-handlers/kit-configure';

const VALID_TOKEN = 'wxk_live_' + 'b'.repeat(64);
const VALID_PROJECT = '11111111-2222-3333-4444-555555555555';

function freshRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'kit-configure-'));
	return root;
}

describe('handleKitConfigureCommand', () => {
	let root: string;

	beforeEach(() => {
		root = freshRoot();
	});

	it('rejects a malformed token with exit 2', () => {
		const r = handleKitConfigureCommand({ token: 'not-a-token', projectId: VALID_PROJECT, projectRoot: root });
		expect(r.exitCode).toBe(2);
		expect(r.message).toMatch(/wxk_/);
	});

	it('rejects a non-https mcp-url with exit 2', () => {
		const r = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			mcpUrl: 'http://localhost:3002',
			projectRoot: root,
		});
		expect(r.exitCode).toBe(2);
		expect(r.message).toMatch(/https/);
	});

	it('writes a fresh .wxai/project.json atomically', () => {
		const r = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			projectRoot: root,
		});
		expect(r.exitCode).toBe(0);
		const written = r.writtenTo!;
		expect(existsSync(written)).toBe(true);
		const json = JSON.parse(readFileSync(written, 'utf-8'));
		expect(json.kit).toMatchObject({
			mcpBaseUrl: 'https://mcp.wxperts.com',
			apiToken: VALID_TOKEN,
			projectId: VALID_PROJECT,
		});
	});

	it('merges into an existing project.json instead of overwriting', () => {
		const path = join(root, '.wxai', 'project.json');
		mkdirSync(join(root, '.wxai'), { recursive: true });
		writeFileSync(path, JSON.stringify({ project: { name: 'demo' }, kit: { stale: true } }), 'utf-8');
		const r = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			projectRoot: root,
		});
		expect(r.exitCode).toBe(0);
		const json = JSON.parse(readFileSync(path, 'utf-8'));
		expect(json.project.name).toBe('demo');
		expect(json.kit.stale).toBe(true);
		expect(json.kit.apiToken).toBe(VALID_TOKEN);
	});

	it('redacts the token in the success message', () => {
		const r = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			projectRoot: root,
		});
		expect(r.exitCode).toBe(0);
		expect(r.message).not.toContain(VALID_TOKEN);
		expect(r.message).toContain('…');
	});

	it('--write-to=.env appends/replaces KEY= lines', () => {
		const envPath = join(root, '.env');
		writeFileSync(envPath, 'EXISTING=true\nWXKANBAN_API_TOKEN=old\n', 'utf-8');
		const r = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			writeTo: '.env',
			projectRoot: root,
		});
		expect(r.exitCode).toBe(0);
		const contents = readFileSync(envPath, 'utf-8');
		expect(contents).toContain(`WXKANBAN_API_TOKEN=${VALID_TOKEN}`);
		expect(contents).toContain('MCP_BASE_URL=https://mcp.wxperts.com');
		expect(contents).toContain('EXISTING=true');
		expect(contents).not.toContain('WXKANBAN_API_TOKEN=old');
	});

	afterEach(() => {
		try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
	});
});

import { afterEach } from 'vitest';
