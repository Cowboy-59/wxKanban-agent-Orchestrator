import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClient, resetDefaultMcpClientForTests } from '../../core/http/mcp-client';

const VALID_TOKEN = 'wxk_live_' + 'a'.repeat(64);

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

	it('rejects malformed tokens', () => {
		expect(() => new McpClient({ baseUrl: 'http://localhost:3002', token: 'bogus' })).toThrow(/wxk_/);
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
