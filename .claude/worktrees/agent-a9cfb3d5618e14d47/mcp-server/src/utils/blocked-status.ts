// Spec 029 / T007 — HTTP 422 contract helper for blocked envelopes.
//
// Lives in its own module so the HTTP transport (index-http.ts) and the
// unit tests can share a single source of truth without dragging in the
// DB + config initialization that index-http.ts pulls. FR-012 / FR-013.

// [SCOPE 029 / T007] BEGIN — inferBlockedStatus (peek inner envelope for HTTP 422)
//
// MCP tool handlers return `{ content: [{ type: 'text', text: '<json>' }] }`.
// When the inner JSON has `{ success: false, blocked: true }` we surface
// HTTP 422 Unprocessable Entity so callers can branch on status code per
// FR-012. Non-blocked failures keep their existing handler-side status
// (5xx / 4xx via thrown error) per FR-013.
export function inferBlockedStatus(result: unknown): 200 | 422 {
  if (!result || typeof result !== 'object') return 200;
  const content = (result as { content?: Array<{ text?: string }> }).content;
  const text = Array.isArray(content) ? content[0]?.text : undefined;
  if (typeof text !== 'string') return 200;
  try {
    const inner = JSON.parse(text) as { success?: unknown; blocked?: unknown };
    if (inner && inner.success === false && inner.blocked === true) {
      return 422;
    }
  } catch {
    /* malformed — leave 200; the transport will deliver whatever the
       handler produced and the existing error-surface paths take over. */
  }
  return 200;
}
// [SCOPE 029 / T007] END
