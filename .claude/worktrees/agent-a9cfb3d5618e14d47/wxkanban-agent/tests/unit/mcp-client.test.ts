import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClient, resetDefaultMcpClientForTests } from '../../core/http/mcp-client';
import { callMcpTool } from '../../core/orchestrator/mcp-client';

const VALID_TOKEN = 'wxk_live_' + 'a'.repeat(64);
// [SCOPE 097 / T005] A server-valid legacy token that does NOT match the old
// wxk_(live|test)_<64hex> shape. The client must forward it, not reject it.
const LEGACY_TOKEN = 'drHsAbC123LegacyToken';

function fetchOnce(response: Partial<Response>): typeof fetch {
	return vi.fn().mockResolvedValueOnce(makeResponse(response)) as unknown as typeof fetch;
}

function makeResponse(p: Partial<Response>): Response {
	const headers = new Headers(p.headers);
	return {
		ok: p.ok ?? true,
		status: p.status ?? 200,
		headers,
		json: async () => (p as { json?: () => unknown }).json?.() ?? {},
		text: async () => (p as { text?: () => string }).text?.() ?? '',
	} as unknown as Response;
}

describe('McpClient', () => {
	beforeEach(() => {
		resetDefaultMcpClientForTests();
		delete process.env.WXKANBAN_API_TOKEN;
	});

	it('throws fast on hosted URL with no token resolved', () => {
		expect(() => new McpClient({ baseUrl: 'https://mcp.wxperts.com' })).toThrow(/no API token resolved/);
	});

	// [SCOPE 097 / T005 — FR-005] Client-side token-shape enforcement removed.
	// Token acceptance is a server-side authz decision; a client regex can only
	// produce false negatives (rejecting a token the server would accept).
	it('accepts a server-valid legacy (non-wxk_) token without throwing', () => {
		expect(() => new McpClient({ baseUrl: 'http://localhost:3002', token: LEGACY_TOKEN })).not.toThrow();
		expect(() => new McpClient({ baseUrl: 'https://mcp.wxperts.com', token: LEGACY_TOKEN })).not.toThrow();
	});

	it('forwards the legacy token unchanged as Bearer on /call', async () => {
		const calls: Array<{ init?: RequestInit }> = [];
		const fakeFetch = vi.fn(async (_url, init) => {
			calls.push({ init });
			return makeResponse({ ok: true, status: 200, json: async () => ({ ok: true }) });
		}) as unknown as typeof fetch;
		const client = new McpClient({
			baseUrl: 'https://mcp.wxperts.com',
			token: LEGACY_TOKEN,
			fetchImpl: fakeFetch,
		});
		await client.callTool('project.help', {});
		const headers = calls[0].init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${LEGACY_TOKEN}`);
	});

	it('attaches Bearer header on /call', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fakeFetch = vi.fn(async (url, init) => {
			calls.push({ url: String(url), init });
			return makeResponse({ ok: true, status: 200, json: async () => ({ ok: true }) });
		}) as unknown as typeof fetch;
		const client = new McpClient({
			baseUrl: 'https://mcp.wxperts.com',
			token: VALID_TOKEN,
			fetchImpl: fakeFetch,
		});
		const result = await client.callTool('project.help', {});
		expect(result.ok).toBe(true);
		const headers = calls[0].init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${VALID_TOKEN}`);
	});

	it('retries once on 429 with Retry-After', async () => {
		let attempt = 0;
		const fakeFetch = vi.fn(async () => {
			attempt += 1;
			if (attempt === 1) {
				return makeResponse({
					ok: false,
					status: 429,
					headers: new Headers({ 'Retry-After': '0' }),
					json: async () => ({ error: 'rate-limited' }),
				});
			}
			return makeResponse({ ok: true, status: 200, json: async () => ({ ok: true }) });
		}) as unknown as typeof fetch;
		const client = new McpClient({
			baseUrl: 'https://mcp.wxperts.com',
			token: VALID_TOKEN,
			fetchImpl: fakeFetch,
		});
		const result = await client.callTool('project.help');
		expect(attempt).toBe(2);
		expect(result.ok).toBe(true);
	});

	it('returns a clean error message on 5xx without retrying', async () => {
		const fakeFetch = vi.fn(async () =>
			makeResponse({ ok: false, status: 502, text: async () => 'upstream gone' }),
		) as unknown as typeof fetch;
		const client = new McpClient({
			baseUrl: 'https://mcp.wxperts.com',
			token: VALID_TOKEN,
			fetchImpl: fakeFetch,
		});
		const result = await client.callTool('project.help');
		expect(result.ok).toBe(false);
		expect(result.status).toBe(502);
		expect(result.error).toMatch(/502/);
		expect(fakeFetch).toHaveBeenCalledTimes(1);
	});
});

// [SCOPE 097 / T006 — FR-006] Policy parity: BOTH kit MCP clients forward the
// token untouched with no client-side shape gate, so no route can reintroduce
// the divergence that rejected a server-valid legacy token.
describe('mcp token-passing parity (orchestrator client)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('orchestrator callMcpTool forwards a legacy (non-wxk_) token as Bearer', async () => {
		let seenAuth: string | undefined;
		const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
			seenAuth = (init?.headers as Record<string, string> | undefined)?.Authorization;
			return makeResponse({
				ok: true,
				status: 200,
				json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }),
			});
		});
		vi.stubGlobal('fetch', fakeFetch);

		await expect(
			callMcpTool('project.help', {}, { baseUrl: 'https://mcp.wxperts.com', apiToken: LEGACY_TOKEN }),
		).resolves.toBeDefined();
		expect(seenAuth).toBe(`Bearer ${LEGACY_TOKEN}`);
	});
});
