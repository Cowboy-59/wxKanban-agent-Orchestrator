// Spec 019 — thin HTTP wrapper for calling MCP tools from kit handlers.
// Pattern lifted from workers/ai/buildscope-worker.ts. Used by dbpush and
// any future workflow handler that needs to sync data to the MCP Project
// Hub. The kit's role is to relay validated content; the MCP server owns
// the canonical DB writes (see spec 019 R6a — kit is workflow, not AI).
//
// Spec 029 / T002 — response parsing routes through ./mcp-envelope.ts so
// the kit handles blocked envelopes (HTTP 422 OR HTTP 200 + success:false)
// uniformly. callMcpTool keeps its `Promise<T>` signature for backward
// compatibility (FR-002, T002 acceptance #4); callers that want the full
// envelope use callMcpToolWithEnvelope (introduced for T003's pushNewSpec /
// pushExistingSpec rewrite).

import { resolveMcpBaseUrl } from '../context/runtime-state';
import {
  parseEnvelope,
  McpEnvelopeError,
  type McpEnvelope as McpEnvelopeShape,
} from './mcp-envelope';

export interface McpCallOptions {
  baseUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
}

// [SCOPE 029 / T002] BEGIN — McpClientError (preserved error class for callers)
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
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — sendMcpRequest (HTTP POST + abort/timeout)
async function sendMcpRequest(
  name: string,
  args: Record<string, unknown>,
  options: McpCallOptions,
): Promise<Response> {
  const mcpUrl = options.baseUrl ?? resolveMcpBaseUrl();
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
  return response;
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — callMcpToolWithEnvelope (T003 entry point)
//
// Returns the full envelope so callers can detect blocked responses. Used
// by dbpush's pushNewSpec / pushExistingSpec (spec 029 FR-005, FR-007).
export async function callMcpToolWithEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>,
  options: McpCallOptions = {},
): Promise<McpEnvelopeShape<T>> {
  const response = await sendMcpRequest(name, args, options);
  try {
    return await parseEnvelope<T>(response);
  } catch (err) {
    if (err instanceof McpEnvelopeError) {
      throw new McpClientError(
        `MCP tool ${name}: ${err.message}`,
        name,
        err.raw && typeof err.raw === 'object' && 'status' in (err.raw as object)
          ? (err.raw as { status?: number; body?: string })
          : undefined,
      );
    }
    throw err;
  }
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — callMcpTool (legacy entry point — returns data only)
//
// Preserved for callers that haven't migrated yet (FR-002 / T002 acceptance
// #4: existing callers compile without changes). Returns the parsed inner
// payload; a blocked envelope appears as a successful return whose body has
// `success: false, blocked: true` — exactly the silent-success failure
// scope 029 is designed to fix. T003 migrates dbpush to
// callMcpToolWithEnvelope so this path stops lying.
export async function callMcpTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  options: McpCallOptions = {},
): Promise<T> {
  const envelope = await callMcpToolWithEnvelope<Record<string, unknown>>(name, args, options);
  return envelope.data as unknown as T;
}
// [SCOPE 029 / T002] END
