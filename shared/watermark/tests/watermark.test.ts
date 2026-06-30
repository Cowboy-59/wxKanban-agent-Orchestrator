// SCOPE-082 / T004 — unit tests for @wxkanban/watermark.
// Success Criteria #3: stamp→verify round-trip recovers the version with 100%
// accuracy; verify reports absence on an unstamped file; stamping is idempotent.

import { describe, it, expect } from 'vitest';
import {
  stampMarkdown,
  verifyMarkdown,
  encodeZeroWidth,
  decodeZeroWidth,
  stripZeroWidth,
  WATERMARK_HOST,
} from '../src/index.js';

const DOC = '# Lifecycle\n\nSome generated content.\n\n- item one\n- item two\n';

describe('zero-width codec', () => {
  it('round-trips an arbitrary payload', () => {
    const payload = 'wxk1|G|1.5.190';
    const encoded = encodeZeroWidth(payload);
    expect(decodeZeroWidth(encoded)).toBe(payload);
  });

  it('round-trips UTF-8 (multi-byte) payloads', () => {
    const payload = 'wxk1|C|1.2.3—é';
    expect(decodeZeroWidth(encodeZeroWidth(payload))).toBe(payload);
  });

  it('produces only invisible characters', () => {
    const encoded = encodeZeroWidth('wxk1|G|9.9.9');
    expect(stripZeroWidth(encoded)).toBe('');
    expect(encoded).not.toMatch(/[\x20-\x7e]/);
  });

  it('returns null when no signature is present', () => {
    expect(decodeZeroWidth('plain text, nothing hidden')).toBeNull();
  });

  it('finds the signature embedded inside surrounding text', () => {
    const encoded = encodeZeroWidth('wxk1|G|1.0.0');
    const haystack = `before ${encoded} after`;
    expect(decodeZeroWidth(haystack)).toBe('wxk1|G|1.0.0');
  });
});

describe('stampMarkdown', () => {
  it('embeds a recoverable signature with the correct version + kind', () => {
    const stamped = stampMarkdown(DOC, { kind: 'generated', version: '1.5.190', generatedAt: '2026-06-30T12:00:00.000Z' });
    const info = verifyMarkdown(stamped);
    expect(info.present).toBe(true);
    expect(info.version).toBe('1.5.190');
    expect(info.kind).toBe('generated');
  });

  it('records the converted kind for conversion outputs', () => {
    const stamped = stampMarkdown(DOC, { kind: 'converted', version: '2.0.0', generatedAt: '2026-06-30T12:00:00.000Z' });
    expect(verifyMarkdown(stamped).kind).toBe('converted');
  });

  it('adds a visible attribution footer linking to the host', () => {
    const stamped = stampMarkdown(DOC, { kind: 'generated', version: '1.5.190', generatedAt: '2026-06-30T12:00:00.000Z' });
    expect(stamped).toContain(WATERMARK_HOST);
    expect(stamped).toContain('Generated with wxKanban');
    expect(stamped).toContain('v1.5.190');
    expect(stamped).toContain('2026-06-30');
  });

  it('adds a frontmatter provenance block when none exists', () => {
    const stamped = stampMarkdown(DOC, { kind: 'generated', version: '1.5.190', generator: 'lifecycle', generatedAt: '2026-06-30T12:00:00.000Z' });
    expect(stamped.startsWith('---\n')).toBe(true);
    expect(stamped).toContain('wxkanbanVersion: 1.5.190');
    expect(stamped).toContain('wxkanbanGenerator: lifecycle');
    expect(stamped).toContain('wxkanbanGeneratedAt: 2026-06-30T12:00:00.000Z');
  });

  it('merges provenance keys into existing frontmatter without breaking it', () => {
    const withFm = '---\ntitle: My Doc\n---\n\n# Body\n';
    const stamped = stampMarkdown(withFm, { kind: 'generated', version: '1.5.190', generatedAt: '2026-06-30T12:00:00.000Z' });
    // No second frontmatter block is created: the existing title and the new
    // provenance keys live inside the one block (between the first `---\n` and
    // the next `\n---`). The trailing footer `---` rule is outside it.
    expect(stamped.startsWith('---\n')).toBe(true);
    const frontmatter = stamped.slice(0, stamped.indexOf('\n---', 3));
    expect(frontmatter).toContain('title: My Doc');
    expect(frontmatter).toContain('wxkanbanVersion: 1.5.190');
    expect(stamped.match(/title: My Doc/g)?.length).toBe(1);
  });

  it('is idempotent — re-stamping returns the input unchanged', () => {
    const once = stampMarkdown(DOC, { kind: 'generated', version: '1.5.190', generatedAt: '2026-06-30T12:00:00.000Z' });
    const twice = stampMarkdown(once, { kind: 'generated', version: '9.9.9', generatedAt: '2027-01-01T00:00:00.000Z' });
    expect(twice).toBe(once);
  });
});

describe('verifyMarkdown', () => {
  it('reports absence on an unstamped document', () => {
    expect(verifyMarkdown(DOC)).toEqual({ present: false });
  });

  it('reports absence when the zero-width run is stripped', () => {
    const stamped = stampMarkdown(DOC, { kind: 'generated', version: '1.5.190', generatedAt: '2026-06-30T12:00:00.000Z' });
    expect(verifyMarkdown(stripZeroWidth(stamped))).toEqual({ present: false });
  });
});
