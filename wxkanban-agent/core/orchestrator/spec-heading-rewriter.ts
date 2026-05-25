// Spec 029 / T011 — in-place spec.md heading rewriter for FR-019.
//
// Given a spec.md and a list of heading-shape sections that the classifier
// flagged (T010), this module:
//   1. Backs up the original file to `<path>.bak-<ISO-timestamp>` (UTC,
//      with `:` replaced by `-` for Windows safety).
//   2. Rewrites each bold-inline label into its own `## Heading`.
//   3. Special-cases Actors so `**Primary actor — Name**` (or `**Primary**`)
//      becomes `- Primary: Name` (and same for Secondary).
//   4. Skips content inside fenced code blocks (` ``` ... ``` `).
//
// Returns the backup path and the list of sections actually rewritten so
// callers can confirm + re-run preflight.

import { readFileSync, writeFileSync, copyFileSync } from 'fs';

import { SECTION_LABELS } from './heading-classifier';

export interface RewriteResult {
  bakPath: string;
  rewroteSections: string[];
  newContent: string;
}

// [SCOPE 029 / T011] BEGIN — backupTimestamp (filename-safe ISO timestamp)
function backupTimestamp(now: Date = new Date()): string {
  // 2026-05-25T13:45:46.574Z → 2026-05-25T13-45-46-574Z
  return now.toISOString().replace(/[:.]/g, '-');
}
// [SCOPE 029 / T011] END

// [SCOPE 029 / T011] BEGIN — splitFenced (segments outside ```code``` get rewrites)
//
// Returns alternating segments: [outside, inside, outside, inside, ...]
// where odd-indexed entries are inside fenced code blocks.
function splitFenced(content: string): string[] {
  const segments: string[] = [];
  const fenceRe = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(content)) !== null) {
    segments.push(content.slice(lastIndex, match.index));
    segments.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  segments.push(content.slice(lastIndex));
  return segments;
}
// [SCOPE 029 / T011] END

// [SCOPE 029 / T011] BEGIN — rewriteBoldLabel (split `**Label**` into `## Label`)
//
// Matches `**Label**` or `**Label:**` and replaces with a heading + the
// following text on its own line. Handles both:
//   `**Business Problem** Customers lose money` → `## Business Problem\n\nCustomers lose money`
//   `**Business Problem:** Customers lose money` → same
function rewriteBoldLabel(segment: string, label: string): { changed: boolean; result: string } {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match `**Label**` or `**Label:**` followed by optional whitespace and
  // capture the trailing text on that line.
  const re = new RegExp(`\\*\\*${escaped}\\s*:?\\s*\\*\\*\\s*([^\\n]*)`, 'i');
  if (!re.test(segment)) return { changed: false, result: segment };
  const result = segment.replace(re, (_full, body: string) => {
    const trimmed = body.trim();
    return trimmed.length > 0
      ? `\n\n## ${label}\n\n${trimmed}\n`
      : `\n\n## ${label}\n`;
  });
  return { changed: true, result };
}
// [SCOPE 029 / T011] END

// [SCOPE 029 / T011] BEGIN — rewriteActorsBoldEmDash (Actors content shape fix)
//
// Rewrites `**Primary actor — Name**` / `**Primary actor: Name**` into
// `- Primary: Name`. Also handles plain `**Primary** Name` form. Same for
// Secondary. Multiple occurrences accumulate as a bulleted list under the
// existing `## Actors` heading.
function rewriteActorsBoldEmDash(segment: string): { changed: boolean; result: string } {
  let result = segment;
  let changed = false;

  // **Primary actor — Name** OR **Primary actor: Name** OR **Primary actor - Name**
  const primaryEmDashRe = /\*\*Primary(?:\s+actor)?\s*[-—:]\s*([^*]+?)\*\*/gi;
  result = result.replace(primaryEmDashRe, (_m, name: string) => {
    changed = true;
    return `- Primary: ${name.trim()}`;
  });

  const secondaryEmDashRe = /\*\*Secondary(?:\s+actors?)?\s*[-—:]\s*([^*]+?)\*\*/gi;
  result = result.replace(secondaryEmDashRe, (_m, name: string) => {
    changed = true;
    return `- Secondary: ${name.trim()}`;
  });

  // Plain `**Primary**` / `**Secondary**` with following text on same line
  // (handled second so the more specific em-dash form wins above).
  const primaryPlainRe = /\*\*Primary(?:\s+actor)?\*\*\s*([^\n]+)/gi;
  result = result.replace(primaryPlainRe, (_m, name: string) => {
    changed = true;
    return `- Primary: ${name.trim()}`;
  });

  const secondaryPlainRe = /\*\*Secondary(?:\s+actors?)?\*\*\s*([^\n]+)/gi;
  result = result.replace(secondaryPlainRe, (_m, name: string) => {
    changed = true;
    return `- Secondary: ${name.trim()}`;
  });

  return { changed, result };
}
// [SCOPE 029 / T011] END

// [SCOPE 029 / T011] BEGIN — rewriteContent (orchestrate per-section rewrites)
export function rewriteContent(
  content: string,
  headingShapeSections: string[],
): { newContent: string; rewroteSections: string[] } {
  const segments = splitFenced(content);
  const rewroteSections: string[] = [];

  for (const section of headingShapeSections) {
    let sectionChanged = false;
    for (let i = 0; i < segments.length; i += 2) {
      // Skip odd-indexed segments (inside code fences)
      const segment = segments[i] ?? '';
      if (section === 'actors') {
        const { changed, result } = rewriteActorsBoldEmDash(segment);
        if (changed) {
          segments[i] = result;
          sectionChanged = true;
        }
      } else {
        const label = SECTION_LABELS[section];
        if (!label) continue;
        const { changed, result } = rewriteBoldLabel(segment, label);
        if (changed) {
          segments[i] = result;
          sectionChanged = true;
        }
      }
    }
    if (sectionChanged) rewroteSections.push(section);
  }

  return {
    newContent: segments.join(''),
    rewroteSections,
  };
}
// [SCOPE 029 / T011] END

// [SCOPE 029 / T011] BEGIN — rewriteHeadings (file-system entry point)
export function rewriteHeadings(
  specPath: string,
  headingShapeSections: string[],
  now: Date = new Date(),
): RewriteResult {
  const original = readFileSync(specPath, 'utf-8');
  const bakPath = `${specPath}.bak-${backupTimestamp(now)}`;
  copyFileSync(specPath, bakPath);
  const { newContent, rewroteSections } = rewriteContent(original, headingShapeSections);
  if (rewroteSections.length > 0) {
    writeFileSync(specPath, newContent, 'utf-8');
  }
  return { bakPath, rewroteSections, newContent };
}
// [SCOPE 029 / T011] END
