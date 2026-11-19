// Spec 029 / T002 — shared MCP envelope type + parser.
//
// The hosted MCP wraps every tool response as
//   { content: [{ type: "text", text: "<inner-json-string>" }] }
// and the *inner* JSON has the canonical tool payload. Preflight blocks
// arrive as inner `{ success: false, blocked: true, blockingIssues: [...] }`
// — historically with HTTP 200, but after spec 029 / FR-012 with HTTP 422.
//
// Both kit MCP clients (core/orchestrator/mcp-client.ts and
// core/http/mcp-client.ts) route their response parsing through this
// module so they share a single source of truth for envelope semantics.
// Spec 029 FR-001 / FR-002 / FR-003 / FR-004.

// Fences hand-written because the orchestrator implement CLI is broken
// (memory: feedback_orchestrator_cli_broken). Canonical format; auditfences
// passes.

// [SCOPE 029 / T002] BEGIN — McpEnvelope (typed success/blocked + payload)
export interface McpEnvelope<T = Record<string, unknown>> {
  success: boolean;
  blocked: boolean;
  blockingIssues: string[];
  data: T;
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — McpWireBody (outer { content: [{ text }] } shape)
export interface McpWireBody {
  content?: Array<{ type?: string; text?: string }>;
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — McpEnvelopeError (throws on malformed envelope)
export class McpEnvelopeError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
    this.name = 'McpEnvelopeError';
  }
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — unwrapMcpContent (parse content[0].text JSON-in-JSON)
export function unwrapMcpContent<T = Record<string, unknown>>(rawJson: unknown): T {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new McpEnvelopeError('MCP wire body is not an object', rawJson);
  }
  const wire = rawJson as McpWireBody;
  const text = wire.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new McpEnvelopeError('MCP wire body missing content[0].text', rawJson);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new McpEnvelopeError(
      `MCP inner content is not JSON: ${(err as Error).message}`,
      text.slice(0, 200),
    );
  }
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — classifyEnvelope (success/blocked from inner body)
//
// HTTP status is provided so callers can collapse the two block paths
// (legacy HTTP 200 + success:false, vs. new HTTP 422 + success:false) into
// a single envelope shape. We trust the inner body's `success` and `blocked`
// fields when present; otherwise a 2xx with no envelope hints is treated
// as success.
export function classifyEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
  body: T,
  httpStatus: number,
): McpEnvelope<T> {
  const innerSuccess = (body as Record<string, unknown>)['success'];
  const innerBlocked = (body as Record<string, unknown>)['blocked'];
  const innerIssues = (body as Record<string, unknown>)['blockingIssues'];

  const success =
    typeof innerSuccess === 'boolean' ? innerSuccess : httpStatus >= 200 && httpStatus < 300 && httpStatus !== 422;
  const blocked = innerBlocked === true || httpStatus === 422;
  const blockingIssues = Array.isArray(innerIssues)
    ? innerIssues.filter((s): s is string => typeof s === 'string')
    : [];

  return {
    success,
    blocked,
    blockingIssues,
    data: body,
  };
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — parseEnvelope (Response → unwrapped + classified envelope)
//
// FR-004 cases covered:
//   (a) HTTP 200 with success body              → {success: true,  blocked: false, ...}
//   (b) HTTP 422 with {success:false, blocked}  → {success: false, blocked: true,  blockingIssues}
//   (c) HTTP 200 with {success:false, blocked}  → {success: false, blocked: true,  blockingIssues}
//   (d) HTTP 5xx                                → throws McpEnvelopeError
export async function parseEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
  response: Response,
): Promise<McpEnvelope<T>> {
  if (response.status >= 500) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* non-fatal */
    }
    throw new McpEnvelopeError(
      `MCP returned ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      { status: response.status, body },
    );
  }
  // 4xx that's NOT 422 also indicates a hard error (401/403/400). Let the
  // caller decide how to surface it; here we throw with the body for
  // diagnostics. 422 is treated as a normal blocked-envelope response.
  if (response.status >= 400 && response.status !== 422) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      /* non-fatal */
    }
    throw new McpEnvelopeError(
      `MCP returned ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      { status: response.status, body },
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    throw new McpEnvelopeError(
      `MCP response body is not JSON: ${(err as Error).message}`,
    );
  }
  const inner = unwrapMcpContent<T>(raw);
  return classifyEnvelope<T>(inner, response.status);
}
// [SCOPE 029 / T002] END
