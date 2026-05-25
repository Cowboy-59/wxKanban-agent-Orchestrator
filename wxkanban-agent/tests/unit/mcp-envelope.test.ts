// Spec 029 / T002 — unit tests for the shared MCP envelope module.
// Covers FR-004's four envelope variants:
//   (a) HTTP 200 success
//   (b) HTTP 422 blocked
//   (c) HTTP 200 with success:false (legacy blocked)
//   (d) HTTP 5xx (throws McpEnvelopeError)

import { describe, it, expect } from 'vitest';
import {
  parseEnvelope,
  classifyEnvelope,
  unwrapMcpContent,
  McpEnvelopeError,
} from '../../core/orchestrator/mcp-envelope';

// [SCOPE 029 / T002] BEGIN — makeResponse (test helper)
function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
// [SCOPE 029 / T002] END

// [SCOPE 029 / T002] BEGIN — wireWrap (test helper for MCP { content: [{ text }] } shape)
function wireWrap(inner: unknown): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(inner) }],
  };
}
// [SCOPE 029 / T002] END

describe('classifyEnvelope', () => {
  it('returns success:true when inner body has no envelope fields and status is 2xx', () => {
    const env = classifyEnvelope({ spec: { id: '029' }, tasks: [] }, 200);
    expect(env.success).toBe(true);
    expect(env.blocked).toBe(false);
    expect(env.blockingIssues).toEqual([]);
    expect(env.data).toEqual({ spec: { id: '029' }, tasks: [] });
  });

  it('returns blocked:true on HTTP 200 with inner success:false + blocked:true', () => {
    const env = classifyEnvelope(
      { success: false, blocked: true, blockingIssues: ['Actors section missing'] },
      200,
    );
    expect(env.success).toBe(false);
    expect(env.blocked).toBe(true);
    expect(env.blockingIssues).toEqual(['Actors section missing']);
  });

  it('returns blocked:true on HTTP 422 even when inner body lacks blocked field', () => {
    const env = classifyEnvelope({ success: false, blockingIssues: ['x'] }, 422);
    expect(env.blocked).toBe(true);
    expect(env.blockingIssues).toEqual(['x']);
  });

  it('respects inner success field when present', () => {
    const ok = classifyEnvelope({ success: true, spec: { id: '029' } }, 200);
    expect(ok.success).toBe(true);
    const notOk = classifyEnvelope({ success: false, message: 'x' }, 200);
    expect(notOk.success).toBe(false);
  });

  it('filters non-string entries out of blockingIssues', () => {
    const env = classifyEnvelope(
      { success: false, blocked: true, blockingIssues: ['ok', 42, null, 'also ok'] as unknown[] },
      422,
    );
    expect(env.blockingIssues).toEqual(['ok', 'also ok']);
  });
});

describe('unwrapMcpContent', () => {
  it('parses content[0].text as JSON', () => {
    const wire = wireWrap({ spec: 'inner-payload' });
    expect(unwrapMcpContent<{ spec: string }>(wire)).toEqual({ spec: 'inner-payload' });
  });

  it('throws when content array is missing', () => {
    expect(() => unwrapMcpContent({})).toThrow(McpEnvelopeError);
  });

  it('throws when content[0].text is not a string', () => {
    expect(() => unwrapMcpContent({ content: [{ type: 'text' }] })).toThrow(McpEnvelopeError);
  });

  it('throws when content[0].text is not valid JSON', () => {
    expect(() =>
      unwrapMcpContent({ content: [{ type: 'text', text: 'not-json {' }] }),
    ).toThrow(McpEnvelopeError);
  });
});

describe('parseEnvelope — FR-004 variants', () => {
  it('(a) HTTP 200 success', async () => {
    const res = makeResponse(200, wireWrap({ spec: { id: '029' }, tasks: [{ id: 't1' }] }));
    const env = await parseEnvelope<{ spec: { id: string }; tasks: Array<{ id: string }> }>(res);
    expect(env.success).toBe(true);
    expect(env.blocked).toBe(false);
    expect(env.data.spec.id).toBe('029');
    expect(env.data.tasks).toHaveLength(1);
  });

  it('(b) HTTP 422 blocked', async () => {
    const res = makeResponse(
      422,
      wireWrap({
        success: false,
        blocked: true,
        blockingIssues: ['Actors section must identify a primary actor.'],
        spec: null,
      }),
    );
    const env = await parseEnvelope(res);
    expect(env.success).toBe(false);
    expect(env.blocked).toBe(true);
    expect(env.blockingIssues).toEqual(['Actors section must identify a primary actor.']);
  });

  it('(c) HTTP 200 with legacy success:false + blocked:true', async () => {
    const res = makeResponse(
      200,
      wireWrap({
        success: false,
        blocked: true,
        blockingIssues: ['Business Problem must be specific.'],
      }),
    );
    const env = await parseEnvelope(res);
    expect(env.success).toBe(false);
    expect(env.blocked).toBe(true);
    expect(env.blockingIssues).toEqual(['Business Problem must be specific.']);
  });

  it('(d) HTTP 5xx throws McpEnvelopeError', async () => {
    const res = makeResponse(503, { error: 'service-unavailable' });
    await expect(parseEnvelope(res)).rejects.toThrow(McpEnvelopeError);
  });

  it('non-422 4xx also throws (401/403/400 are hard errors, not blocks)', async () => {
    const r401 = makeResponse(401, { error: 'unauthorized' });
    await expect(parseEnvelope(r401)).rejects.toThrow(McpEnvelopeError);
    const r400 = makeResponse(400, { error: 'bad-request' });
    await expect(parseEnvelope(r400)).rejects.toThrow(McpEnvelopeError);
  });
});
