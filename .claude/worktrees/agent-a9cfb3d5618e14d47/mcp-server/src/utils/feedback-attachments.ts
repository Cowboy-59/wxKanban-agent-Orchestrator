// [SCOPE 043 / T028] BEGIN — attachment splitting + bounded excerpts (Amendment E)
// One place that knows how to take attachments back OUT of `details`, because
// four consumers read that record whole and none of them may take the content
// with it:
//
//   triage prompt   — pays per token, every submission (FR-026)
//   lifecycle artifact — a project document, not a log store (FR-026)
//   list_my_feedback   — polled ~2×/min per project (FR-025)
//   SysAdmin queue     — one payload × queue depth (FR-025)
//
// Full content stays on the row and is served only by an explicit single-item
// fetch. The metadata always travels: a triager needs to know a log EXISTS and
// that its text was redacted, even when they are not reading it right now.

/** Reserved key inside `details`. Written server-side only — see submit_feedback. */
export const ATTACHMENTS_KEY = 'attachments';

export interface StoredAttachment {
  name: string;
  bytes: number;
  truncated: boolean;
  redactions: number;
  content: string;
}

/** What travels in place of an attachment when the content must not (FR-025). */
export interface AttachmentSummary {
  name: string;
  bytes: number;
  truncated: boolean;
  redactions: number;
  /** Characters of content held on the row, so a caller knows a fetch is worth it. */
  contentLength: number;
  /** Bounded tail — enough to recognise the failure without carrying the file. */
  excerpt: string;
}

/** Tail kept for the list/UI summary. */
const EXCERPT_CHARS = 800;
/** Tail kept per attachment for the triage prompt. */
const TRIAGE_EXCERPT_CHARS = 1_200;
/** Ceiling across every attachment in one triage prompt. */
const TRIAGE_TOTAL_CHARS = 3_600;
/** Tail kept per attachment in the rendered lifecycle artifact. */
const ARTIFACT_EXCERPT_CHARS = 4_000;

function isAttachment(v: unknown): v is StoredAttachment {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === 'string' && typeof o.content === 'string';
}

/**
 * Split a `details` record into the persona answers and the attachments.
 *
 * Tolerant by design: rows written before Amendment E have no attachments, and
 * a malformed entry is treated as absent rather than thrown on — this runs on
 * the read path of surfaces that must not fail because one row is odd.
 */
export function splitDetails(details: unknown): {
  plain: Record<string, unknown>;
  attachments: StoredAttachment[];
} {
  if (typeof details !== 'object' || details === null) return { plain: {}, attachments: [] };
  const { [ATTACHMENTS_KEY]: raw, ...plain } = details as Record<string, unknown>;
  const attachments = Array.isArray(raw) ? raw.filter(isAttachment) : [];
  return { plain, attachments };
}

function tail(text: string, n: number): string {
  return text.length <= n ? text : text.slice(-n);
}

export function summarize(a: StoredAttachment): AttachmentSummary {
  return {
    name: a.name,
    bytes: a.bytes,
    truncated: a.truncated,
    redactions: a.redactions,
    contentLength: a.content.length,
    excerpt: tail(a.content, EXCERPT_CHARS),
  };
}

/**
 * Rebuild `details` with every attachment reduced to a summary — the shape that
 * goes out on a list response (FR-025). Returns the input untouched when there
 * is nothing attached, so pre-Amendment-E rows are byte-identical.
 */
export function stripAttachmentContent(details: unknown): unknown {
  if (typeof details !== 'object' || details === null) return details;
  const { plain, attachments } = splitDetails(details);
  if (attachments.length === 0) return details;
  return { ...plain, [ATTACHMENTS_KEY]: attachments.map(summarize) };
}
// [SCOPE 043 / T028] END

// [SCOPE 043 / T028] BEGIN — renderers for the triage prompt and the artifact
function meta(a: StoredAttachment): string {
  const bits = [`${a.bytes.toLocaleString()} bytes on disk`];
  if (a.truncated) bits.push('TRUNCATED — tail only');
  if (a.redactions > 0) bits.push(`${a.redactions} credential value(s) masked by the client`);
  return bits.join('; ');
}

/**
 * Attachment block for the triage prompt (FR-026).
 *
 * The tail is what carries the failure, and the total is capped so the prompt
 * cost of a report does not scale with what was attached to it. The model is
 * told the text is an excerpt so it does not read the cut as the end of the run.
 */
export function renderForTriage(attachments: StoredAttachment[]): string {
  if (attachments.length === 0) return '';
  const lines: string[] = ['', 'Attachments (excerpts — the full text is on file, not shown here):'];
  let budget = TRIAGE_TOTAL_CHARS;
  for (const a of attachments) {
    lines.push(`- ${a.name} (${meta(a)})`);
    if (budget <= 0) {
      lines.push('  [excerpt omitted — prompt budget reached]');
      continue;
    }
    const excerpt = tail(a.content, Math.min(TRIAGE_EXCERPT_CHARS, budget));
    budget -= excerpt.length;
    lines.push(`  --- last ${excerpt.length} characters ---`, excerpt);
  }
  return lines.join('\n');
}

/**
 * Attachment section for the rendered lifecycle artifact (FR-026).
 *
 * A generous excerpt — this is what a human reads first — but still an excerpt:
 * the artifact is a project document and must not become the log's second home.
 */
export function renderForArtifact(attachments: StoredAttachment[]): string[] {
  if (attachments.length === 0) return [];
  const lines: string[] = ['## Attachments', ''];
  for (const a of attachments) {
    lines.push(`**${a.name}** — ${meta(a)}`);
    lines.push('');
    const excerpt = tail(a.content, ARTIFACT_EXCERPT_CHARS);
    if (excerpt.length < a.content.length) {
      lines.push(`_Showing the last ${excerpt.length} of ${a.content.length} characters._`);
      lines.push('');
    }
    // Fenced with a ~~~ so a log that itself contains ``` cannot break out.
    lines.push('~~~text', excerpt, '~~~', '');
  }
  return lines;
}
// [SCOPE 043 / T028] END
