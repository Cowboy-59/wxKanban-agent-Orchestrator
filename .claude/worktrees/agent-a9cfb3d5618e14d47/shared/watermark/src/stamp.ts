// SCOPE-082 — stampMarkdown / verifyMarkdown for @wxkanban/watermark.
// Adds a wxKanban attribution to generated Markdown: (1) a frontmatter
// provenance block, (2) a visible attribution footer linking to
// www.wxperts.com, and (3) an invisible zero-width signature. Idempotent:
// re-stamping an already-stamped document returns it unchanged.
//
// This is a branding / funnel mark, NOT a tamper-proof control (scope 082).

import { decodeZeroWidth, encodeZeroWidth } from './zero-width.js';

// [SCOPE 082 / T002] BEGIN — watermark constants + types
/** Public attribution URL — every visible mark links here. */
export const WATERMARK_URL = 'https://www.wxperts.com';
/** Bare host shown in plain-text contexts (e.g. PDF footer). */
export const WATERMARK_HOST = 'www.wxperts.com';
/** Zero-width payload prefix + format version. Bump only on format changes. */
export const WATERMARK_SIG_PREFIX = 'wxk1';

/** What produced the artifact — drives the visible verb. */
export type WatermarkKind = 'generated' | 'converted';

export interface StampOptions {
  /** 'generated' (project docs) or 'converted' (conversion outputs). */
  kind: WatermarkKind;
  /** wxKanban/app/kit version string recorded in the mark. */
  version: string;
  /** ISO-8601 timestamp; defaults to now. Pass a fixed value for determinism. */
  generatedAt?: string;
  /** Optional generator label (e.g. 'lifecycle', 'devplan') for the frontmatter. */
  generator?: string;
}

export interface WatermarkInfo {
  present: boolean;
  kind?: WatermarkKind;
  version?: string;
}
// [SCOPE 082 / T002] END

// [SCOPE 082 / T002] BEGIN — buildAttributionLine (shared visible footer text)
/**
 * The single visible attribution line, reused by the Markdown footer and the
 * PDF footer template. `date` is the YYYY-MM-DD portion of generatedAt.
 */
export function buildAttributionLine(kind: WatermarkKind, version: string, date: string): string {
  const verb = kind === 'converted' ? 'Converted' : 'Generated';
  return `${verb} with wxKanban — ${WATERMARK_HOST} · v${version} · ${date}`;
}
// [SCOPE 082 / T002] END

// [SCOPE 082 / T002] BEGIN — verifyMarkdown (recover the embedded signature)
/**
 * Inspect `content` for an embedded wxKanban zero-width signature and report
 * presence + the encoded kind and version. Never throws.
 */
export function verifyMarkdown(content: string): WatermarkInfo {
  try {
    const payload = decodeZeroWidth(content);
    if (!payload) return { present: false };
    const parts = payload.split('|');
    if (parts.length !== 3 || parts[0] !== WATERMARK_SIG_PREFIX) {
      return { present: false };
    }
    const kind: WatermarkKind = parts[1] === 'C' ? 'converted' : 'generated';
    return { present: true, kind, version: parts[2] };
  } catch {
    return { present: false };
  }
}
// [SCOPE 082 / T002] END

// [SCOPE 082 / T002] BEGIN — injectFrontmatter (merge provenance keys)
/**
 * Insert wxKanban provenance keys into the document's YAML frontmatter,
 * creating a frontmatter block if none exists. Flat keys avoid the complexity
 * of merging nested YAML.
 */
function injectFrontmatter(content: string, opts: StampOptions, generatedAt: string): string {
  const lines = [
    `wxkanbanGenerator: ${opts.generator ?? opts.kind}`,
    `wxkanbanVersion: ${opts.version}`,
    `wxkanbanGeneratedAt: ${generatedAt}`,
    `wxkanbanSource: ${WATERMARK_URL}`,
  ];
  // Existing frontmatter: a leading `---` line, then keys, then a closing `---`.
  if (/^---\r?\n/.test(content)) {
    const close = content.indexOf('\n---', 3);
    if (close !== -1) {
      const head = content.slice(0, close);
      const tail = content.slice(close);
      return `${head}\n${lines.join('\n')}${tail}`;
    }
  }
  return `---\n${lines.join('\n')}\n---\n\n${content}`;
}
// [SCOPE 082 / T002] END

// [SCOPE 082 / T002] BEGIN — stampMarkdown (frontmatter + footer + zero-width)
/**
 * Stamp `content` with the wxKanban attribution. Idempotent — if a signature is
 * already present the input is returned unchanged. Designed to never throw on
 * string input; on any internal failure it returns the original content so the
 * caller's generation never blocks (FR-009).
 */
export function stampMarkdown(content: string, opts: StampOptions): string {
  try {
    if (verifyMarkdown(content).present) return content;

    const generatedAt = opts.generatedAt ?? new Date().toISOString();
    const date = generatedAt.slice(0, 10);

    const withFrontmatter = injectFrontmatter(content, opts, generatedAt);

    const sigChar = opts.kind === 'converted' ? 'C' : 'G';
    const signature = encodeZeroWidth(`${WATERMARK_SIG_PREFIX}|${sigChar}|${opts.version}`);

    const body = withFrontmatter.replace(/\s+$/, '');
    const footer = `*${buildAttributionLine(opts.kind, opts.version, date)}* [↗](${WATERMARK_URL})`;

    return `${body}\n\n---\n\n<!-- wxkanban:watermark -->\n${footer}${signature}\n`;
  } catch {
    return content;
  }
}
// [SCOPE 082 / T002] END
