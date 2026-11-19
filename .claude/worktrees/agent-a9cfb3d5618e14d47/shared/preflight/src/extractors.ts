// Spec 029 / T001 — section/actor/metric extractors for preflight scoring.
// Extracted byte-for-byte from mcp-server/src/utils/project-kit.ts.

import { normalizeText } from './text-utils.js';

// [SCOPE 029 / T001] BEGIN — extractSectionContent (text under a heading until next ##)
export function extractSectionContent(content: string, headingPattern: RegExp): string {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => headingPattern.test(line.trim()));

  if (startIndex === -1) {
    return '';
  }

  const sectionLines: string[] = [];
  for (let idx = startIndex + 1; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (/^##\s+/.test(trimmed)) {
      break;
    }
    sectionLines.push(lines[idx]);
  }

  return sectionLines.join('\n').trim();
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — extractActorValue (Primary: / Secondary: line label pattern)
// MODIFIED-BY: [SCOPE 124 / T011] — the label is recognised through Markdown emphasis.
/**
 * SCOPE-124 / T011 (FR-007) — the label identifies the actor; the formatting does not.
 *
 * `- **Secondary**: Supervisor` was rejected while the unbolded line passed, so validation was
 * coupled to typography — and the methodology we ship tells authors to write exactly that label,
 * which the check then refused once it was emphasised.
 *
 * Correction to the task's own wording: `- Secondary: **Supervisor**` — emphasis on the actor's
 * NAME — already passed, because `normalizeText` strips `**` from the captured value. What failed
 * was emphasis on the LABEL (`**Secondary**:`, `*Secondary*:`) and emphasis wrapping the whole
 * line (`**- Secondary: …**`), since the old pattern required the label to start immediately after
 * an optional bullet. All three forms are accepted now.
 */
const EMPHASIS = '(?:\\*\\*|\\*|__|_)';

export function extractActorValue(sectionContent: string, label: 'Primary' | 'Secondary'): string {
  const pattern = new RegExp(
    // leading emphasis (whole-line bold) → bullet → emphasis → LABEL → emphasis → colon
    `(?:^|\\n)\\s*${EMPHASIS}?\\s*[-*]?\\s*${EMPHASIS}?\\s*${label}\\s*${EMPHASIS}?\\s*:\\s*(.+)$`,
    'im',
  );
  const match = sectionContent.match(pattern);
  return match ? normalizeText(match[1]) : '';
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — extractCoreDesignValue (table-row | **Label** | value | pattern)
export function extractCoreDesignValue(content: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`\\|\\s*\\*\\*${escapedLabel}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, 'i'));
  return match ? normalizeText(match[1]) : '';
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — extractMetricLines (bulleted/numbered list items)
export function extractMetricLines(sectionContent: string): string[] {
  return sectionContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => normalizeText(line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')))
    .filter(Boolean);
}
// [SCOPE 029 / T001] END
