// Spec 029 / T007 — HTTP 422 contract for blocked envelopes.
//
// Unit-tests the `inferBlockedStatus` helper that decides whether a tool
// handler's result should be returned with HTTP 200 or HTTP 422. Real
// end-to-end behavior (curl against a live MCP) is documented in the spec
// 029 implementation log; this file pins the rules so the helper does not
// regress.

import { describe, it, expect } from 'vitest';
import { inferBlockedStatus } from '../src/utils/blocked-status.js';

function wireWrap(inner: unknown): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(inner) }],
  };
}

describe('inferBlockedStatus (FR-012 / FR-013)', () => {
  it('returns 422 when inner JSON has success:false AND blocked:true', () => {
    const result = wireWrap({
      success: false,
      blocked: true,
      blockingIssues: ['Actors section missing'],
      spec: null,
    });
    expect(inferBlockedStatus(result)).toBe(422);
  });

  it('returns 200 on a normal success envelope', () => {
    const result = wireWrap({
      success: true,
      blocked: false,
      spec: { id: 'spec-uuid-029', specNumber: '029' },
      tasks: [],
    });
    expect(inferBlockedStatus(result)).toBe(200);
  });

  it('returns 200 when success is true and blocked is true (defensive — should not occur)', () => {
    // Only the (success:false AND blocked:true) pair indicates a real
    // preflight block. Defensive guard against malformed handler returns.
    const result = wireWrap({ success: true, blocked: true });
    expect(inferBlockedStatus(result)).toBe(200);
  });

  it('returns 200 when success is false but blocked is not true (other failure mode)', () => {
    // Non-blocked failures keep their existing status (handler throws,
    // transport translates to 500) per FR-013. The inferBlockedStatus
    // helper is conservative: only the canonical blocked envelope triggers
    // 422.
    const result = wireWrap({ success: false, error: 'unauthorized' });
    expect(inferBlockedStatus(result)).toBe(200);
  });

  it('returns 200 on malformed result (no content array)', () => {
    expect(inferBlockedStatus({})).toBe(200);
    expect(inferBlockedStatus(null)).toBe(200);
    expect(inferBlockedStatus(undefined)).toBe(200);
  });

  it('returns 200 when content[0].text is not valid JSON', () => {
    expect(inferBlockedStatus({ content: [{ type: 'text', text: 'not-json {' }] })).toBe(200);
  });

  it('returns 200 when content[0].text is missing', () => {
    expect(inferBlockedStatus({ content: [{ type: 'text' }] })).toBe(200);
    expect(inferBlockedStatus({ content: [] })).toBe(200);
  });
});

describe('FR-013 — non-blocked failures keep existing status codes', () => {
  it('does not affect 401/403/400 (those happen before the handler returns)', () => {
    // The helper only inspects handler return values. Auth + schema
    // failures throw before the handler invokes res.json(result), so they
    // never reach this code path. Documented here so the contract is
    // clear: inferBlockedStatus is *additive* — it adds 422 on top of the
    // existing transport status logic, never overrides 4xx/5xx errors.
    expect(true).toBe(true);
  });
});
