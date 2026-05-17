// Spec 019 — thin HTTP wrapper for calling MCP tools from kit handlers.
// Pattern lifted from workers/ai/buildscope-worker.ts. Used by dbpush and
// any future workflow handler that needs to sync data to the MCP Project
// Hub. The kit's role is to relay validated content; the MCP server owns
// the canonical DB writes (see spec 019 R6a — kit is workflow, not AI).

import { resolveServiceUrl } from '../context/runtime-state';

export interface McpEnvelope {
  content?: Array<{ text?: string }>;
}

export interface McpCallOptions {
  baseUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
}

export class McpClientError extends Error {
  constructor(
    message: string,
    public readonly tool: string,
    public readonly cause?: { status?: number; body?: string },
  ) {
    super(message);
    this.name = 'McpClientError';
  }
}

export async function callMcpTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  options: McpCallOptions = {},
): Promise<T> {
  const mcpUrl = options.baseUrl ?? resolveServiceUrl('mcp');
  const token = options.apiToken ?? process.env['WXKANBAN_API_TOKEN'];
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Connection: 'close',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer =
    options.timeoutMs !== undefined
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${mcpUrl}/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tool: name, args }),
      signal: controller.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw new McpClientError(
      `MCP not reachable at ${mcpUrl}/call (${(err as Error).message}). Start the kit runtime with \`node scripts/setup-mcp.mjs\`.`,
      name,
    );
  }
  if (timer) clearTimeout(timer);

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* non-fatal */
    }
    throw new McpClientError(
      `MCP tool ${name} returned ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 500)}` : ''}`,
      name,
      { status: response.status, body },
    );
  }

  const envelope = (await response.json()) as McpEnvelope;
  const text = envelope.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new McpClientError(`MCP tool ${name}: response missing content[0].text`, name);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new McpClientError(
      `MCP tool ${name}: response body is not JSON: ${(err as Error).message}`,
      name,
    );
  }
}
