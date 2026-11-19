// [SCOPE 043 / T029] BEGIN — app-side attachment helpers (Amendment E, FR-025)
// MIRROR of `mcp-server/src/utils/feedback-attachments.ts`. The two services do
// not share a package, and this repo already carries that split (the MCP schema
// is itself a partial mirror of `src/db/schema`), so the duplication is stated
// rather than smuggled: if the stored shape changes, BOTH copies move.
//
// Only the read-path half lives here. The MCP side owns writing attachments;
// the app side only ever strips them back out of a list payload and serves one
// on request.

export interface StoredAttachment {
  name: string;
  bytes: number;
  truncated: boolean;
  redactions: number;
  content: string;
}

export interface AttachmentSummary {
  name: string;
  bytes: number;
  truncated: boolean;
  redactions: number;
  contentLength: number;
  excerpt: string;
}

export const ATTACHMENTS_KEY = "attachments";

/** Tail kept in a list payload — enough to recognise the failure, not to store it. */
const EXCERPT_CHARS = 800;

function isAttachment(v: unknown): v is StoredAttachment {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === "string" && typeof o.content === "string";
}

/** Attachments held on a row. Empty for every pre-Amendment-E submission. */
export function attachmentsOf(details: unknown): StoredAttachment[] {
  if (typeof details !== "object" || details === null) return [];
  const raw = (details as Record<string, unknown>)[ATTACHMENTS_KEY];
  return Array.isArray(raw) ? raw.filter(isAttachment) : [];
}

export function summarizeAttachment(a: StoredAttachment): AttachmentSummary {
  return {
    name: a.name,
    bytes: a.bytes,
    truncated: a.truncated,
    redactions: a.redactions,
    contentLength: a.content.length,
    excerpt: a.content.length <= EXCERPT_CHARS ? a.content : a.content.slice(-EXCERPT_CHARS),
  };
}

/**
 * Replace attachment content with a summary (FR-025).
 *
 * The SysAdmin queue returns whole rows and was measured at 93 of them; three
 * 128 KB logs on one report is 384 KB that would otherwise be sent to every
 * admin loading the list, to render one row they may never open. Returns the
 * input unchanged when nothing is attached.
 */
export function stripAttachmentContent(details: unknown): unknown {
  const attachments = attachmentsOf(details);
  if (attachments.length === 0) return details;
  const rest = { ...(details as Record<string, unknown>) };
  rest[ATTACHMENTS_KEY] = attachments.map(summarizeAttachment);
  return rest;
}
// [SCOPE 043 / T029] END
