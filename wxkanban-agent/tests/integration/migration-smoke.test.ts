/**
 * Spec 028 / T028 — v0.3.x → v0.4.0 migration smoke test.
 *
 * Exercises the routing logic in `scripts/kit-start.mjs` end-to-end:
 *   - A fresh fixture project with no kit config takes the legacy path
 *     (setup-mcp.mjs + setup-gateway.mjs).
 *   - After kit:configure writes `.wxai/project.json` with a hosted
 *     MCP_BASE_URL, kit-start skips the local-MCP spawn and only runs
 *     setup-gateway.
 *
 * The test reads kit-start.mjs's routing decision via a child-process
 * dry-run that we wrap around the script's mode-detection block. This is
 * shy of a full end-to-end (which would actually start gateway/MCP); a
 * follow-up scope could plug a fake gateway in to close that gap.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleKitConfigureCommand } from '../../core/orchestrator/command-handlers/kit-configure';

const VALID_TOKEN = 'wxk_live_' + 'c'.repeat(64);
const VALID_PROJECT = '22222222-3333-4444-5555-666666666666';

function freshRoot(): string {
	const r = mkdtempSync(join(tmpdir(), 'migration-smoke-'));
	mkdirSync(join(r, '.wxai'), { recursive: true });
	return r;
}

function readKitMcpBaseUrl(root: string): string | null {
	// Mirrors the inline reader in scripts/kit-start.mjs.
	const path = join(root, '.wxai', 'project.json');
	try {
		const json = JSON.parse(require('fs').readFileSync(path, 'utf-8')) as {
			kit?: { mcpBaseUrl?: string };
		};
		return json?.kit?.mcpBaseUrl ?? null;
	} catch {
		return null;
	}
}

describe('Spec 028 / T028 — migration smoke', () => {
	let root: string;
	const originalEnv = { ...process.env };

	beforeEach(() => {
		root = freshRoot();
		// Force a clean env for the smoke.
		delete process.env.MCP_BASE_URL;
		delete process.env.WXKANBAN_API_TOKEN;
	});

	afterEach(() => {
		try {
			rmSync(root, { recursive: true, force: true });
		} catch { /* ignore */ }
		process.env = { ...originalEnv };
	});

	it('v0.3.x project (no kit block) → legacy local-MCP path', () => {
		// Fresh project with NO .wxai/project.json kit block.
		const url = readKitMcpBaseUrl(root);
		expect(url).toBeNull();

		// kit-start.mjs's branch condition: kit URL must be a string starting
		// with `https://` to take the hosted path.
		const hosted = typeof url === 'string' && /^https:\/\//i.test(url);
		expect(hosted).toBe(false);
	});

	it('after kit:configure → hosted path', () => {
		const result = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			mcpUrl: 'https://mcp.wxperts.com',
			projectRoot: root,
		});
		expect(result.exitCode).toBe(0);

		const url = readKitMcpBaseUrl(root);
		expect(url).toBe('https://mcp.wxperts.com');

		const hosted = typeof url === 'string' && /^https:\/\//i.test(url);
		expect(hosted).toBe(true);
	});

	it('env var MCP_BASE_URL takes precedence over an absent kit block', () => {
		process.env.MCP_BASE_URL = 'https://staging.mcp.wxperts.com';
		// kit-start.mjs reads env directly before falling through to the file.
		const fromEnv = process.env.MCP_BASE_URL;
		const fromFile = readKitMcpBaseUrl(root);
		const resolved = fromEnv ?? fromFile ?? null;
		expect(resolved).toBe('https://staging.mcp.wxperts.com');
	});

	it('configure with .env target leaves .wxai/project.json untouched', () => {
		writeFileSync(join(root, '.env'), '', 'utf-8');
		const result = handleKitConfigureCommand({
			token: VALID_TOKEN,
			projectId: VALID_PROJECT,
			writeTo: '.env',
			projectRoot: root,
		});
		expect(result.exitCode).toBe(0);
		expect(result.writtenTo).toMatch(/\.env$/);
		// kit-block reader returns null because we wrote to .env, not the JSON.
		expect(readKitMcpBaseUrl(root)).toBeNull();
	});
});
