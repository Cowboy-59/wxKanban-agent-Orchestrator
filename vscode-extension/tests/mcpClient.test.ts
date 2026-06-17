/**
 * Spec 042 / T014 + T031 — MCP HTTP client behaviour.
 *
 * Covers the wire contract the cockpit depends on: bearer auth, MCP envelope
 * unwrap, a single 429 retry, and error mapping (which feeds the "MCP
 * unreachable" state).
 */
import { describe, it, expect, vi } from 'vitest';
import { CockpitMcpClient, McpClientError } from '../src/services/mcpClient';

function envelope(payload: unknown): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(payload) }] }), { status: 200 });
}

describe('CockpitMcpClient', () => {
  it('sends bearer auth + tool/args and unwraps the MCP envelope', async () => {
    const summary = { projectId: 'p1', scopes: [], unlinkedTasks: [] };
    const fetchImpl = vi.fn(async () => envelope(summary)) as unknown as typeof fetch;
    const client = new CockpitMcpClient({ baseUrl: 'https://mcp.wxperts.com/', token: 'tok', fetchImpl });

    const result = await client.cockpitSummary('p1');

    expect(result).toEqual(summary);
    const [url, init] = (fetchImpl as unknown as vi.Mock).mock.calls[0];
    expect(url).toBe('https://mcp.wxperts.com/call'); // trailing slash trimmed
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ tool: 'project.cockpit_summary', args: { projectid: 'p1' } });
  });

  it('retries once on 429 then succeeds', async () => {
    const summary = { projectId: 'p1', scopes: [], unlinkedTasks: [] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(envelope(summary)) as unknown as typeof fetch;
    const client = new CockpitMcpClient({ baseUrl: 'https://mcp.wxperts.com', token: 'tok', fetchImpl });

    const result = await client.cockpitSummary('p1');
    expect(result).toEqual(summary);
    expect((fetchImpl as unknown as vi.Mock).mock.calls.length).toBe(2);
  });

  it('throws McpClientError carrying the HTTP status on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const client = new CockpitMcpClient({ baseUrl: 'https://mcp.wxperts.com', token: 'bad', fetchImpl });

    await expect(client.cockpitSummary('p1')).rejects.toMatchObject({ status: 401 });
    await expect(client.cockpitSummary('p1')).rejects.toBeInstanceOf(McpClientError);
  });

  it('throws when the envelope shape is unexpected', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 })) as unknown as typeof fetch;
    const client = new CockpitMcpClient({ baseUrl: 'https://mcp.wxperts.com', token: 'tok', fetchImpl });
    await expect(client.cockpitSummary('p1')).rejects.toBeInstanceOf(McpClientError);
  });
});
