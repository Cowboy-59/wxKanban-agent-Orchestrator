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
export function extractActorValue(sectionContent: string, label: 'Primary' | 'Secondary'): string {
  const match = sectionContent.match(new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${label}\\s*:\\s*(.+)$`, 'im'));
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
