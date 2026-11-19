/**
 * [SCOPE 043 / T028] Amendment E — attachments must never travel whole.
 *
 * Four consumers read `details` as a unit (triage prompt, lifecycle artifact,
 * list_my_feedback, the SysAdmin queue) and none may take a 128 KB log with it.
 * These tests pin the boundary rather than the formatting: what matters is that
 * content is bounded on every path out, and that the metadata still arrives.
 */
import { describe, it, expect } from 'vitest';
import {
  splitDetails,
  stripAttachmentContent,
  summarize,
  renderForTriage,
  renderForArtifact,
  type StoredAttachment,
} from '../src/utils/feedback-attachments.js';

function attachment(over: Partial<StoredAttachment> = {}): StoredAttachment {
  return {
    name: over.name ?? 'app.log',
    bytes: over.bytes ?? 5_000_000,
    truncated: over.truncated ?? true,
    redactions: over.redactions ?? 2,
    content: over.content ?? 'x'.repeat(120_000),
  };
}

describe('splitDetails', () => {
  it('separates attachments from the persona answers', () => {
    const { plain, attachments } = splitDetails({
      mode: 'quick',
      paste: 'it broke',
      attachments: [attachment()],
    });
    expect(plain).toEqual({ mode: 'quick', paste: 'it broke' });
    expect(attachments).toHaveLength(1);
  });

  it('treats a pre-Amendment-E row as having no attachments', () => {
    const { plain, attachments } = splitDetails({ mode: 'guided', doing: 'building' });
    expect(plain).toEqual({ mode: 'guided', doing: 'building' });
    expect(attachments).toEqual([]);
  });

  it('ignores a malformed attachments value instead of throwing', () => {
    // Read paths here serve surfaces that must not fail because one row is odd.
    expect(splitDetails({ attachments: 'not-a-list' }).attachments).toEqual([]);
    expect(splitDetails({ attachments: [{ nope: true }] }).attachments).toEqual([]);
    expect(splitDetails(null).attachments).toEqual([]);
  });
});

describe('stripAttachmentContent (FR-025)', () => {
  it('removes the content from a list payload but keeps the metadata', () => {
    const stripped = stripAttachmentContent({
      paste: 'crash',
      attachments: [attachment({ name: 'run.log', bytes: 900, redactions: 3 })],
    }) as { attachments: Array<Record<string, unknown>>; paste: string };

    expect(stripped.paste).toBe('crash');
    const [only] = stripped.attachments;
    expect(only['content']).toBeUndefined();
    expect(only).toMatchObject({ name: 'run.log', bytes: 900, redactions: 3, truncated: true });
    expect(String(only['excerpt']).length).toBeLessThanOrEqual(800);
  });

  it('leaves a row without attachments byte-identical', () => {
    const details = { mode: 'quick', paste: 'hi' };
    expect(stripAttachmentContent(details)).toBe(details);
  });

  it('keeps a large list payload bounded', () => {
    // Three maximum attachments on one row: ~360 KB inline, and this response
    // returns EVERY row on a ~2×/min poll. The summary must not scale with it.
    const details = { attachments: [attachment(), attachment(), attachment()] };
    expect(JSON.stringify(details).length).toBeGreaterThan(300_000);
    expect(JSON.stringify(stripAttachmentContent(details)).length).toBeLessThan(10_000);
  });
});

describe('summarize', () => {
  it('reports the held length so a caller knows a fetch is worth it', () => {
    const s = summarize(attachment({ content: 'y'.repeat(2_000) }));
    expect(s.contentLength).toBe(2_000);
    expect(s.excerpt.length).toBe(800);
    // Tail, not head — the failure is at the end of a log.
    expect(s.excerpt).toBe('y'.repeat(800));
  });
});

describe('renderForTriage (FR-026)', () => {
  it('bounds the whole attachment block regardless of how much was attached', () => {
    const out = renderForTriage([attachment(), attachment(), attachment()]);
    // 3 × 1,200-char excerpts, capped at 3,600 total, plus the metadata lines.
    expect(out.length).toBeLessThan(5_000);
    expect(out).toContain('app.log');
    expect(out).toContain('TRUNCATED');
    expect(out).toContain('2 credential value(s) masked by the client');
  });

  it('is empty when nothing is attached, so the prompt is unchanged', () => {
    expect(renderForTriage([])).toBe('');
  });

  it('tells the model the text is an excerpt', () => {
    expect(renderForTriage([attachment()])).toContain('excerpt');
  });
});

describe('renderForArtifact (FR-026)', () => {
  it('bounds what reaches a project document', () => {
    const md = renderForArtifact([attachment()]).join('\n');
    expect(md.length).toBeLessThan(6_000);
    expect(md).toContain('## Attachments');
    expect(md).toContain('app.log');
  });

  it('fences with ~~~ so a log containing a code fence cannot break out', () => {
    const md = renderForArtifact([attachment({ content: 'before\n```\nafter' })]).join('\n');
    expect(md).toContain('~~~text');
    // The ``` from the log is inside the ~~~ block, not terminating it.
    expect(md.indexOf('~~~text')).toBeLessThan(md.indexOf('```'));
  });

  it('contributes nothing when there are no attachments', () => {
    expect(renderForArtifact([])).toEqual([]);
  });
});
