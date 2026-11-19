// Spec 029 / T010 — heading-shape classifier.
//
// When the MCP server blocks a spec at preflight (FR-005), the kit needs
// to know which missing sections can be fixed by a mechanical heading
// rewrite (split a bold label out into its own `## Heading`) vs. which
// need real human-authored content. This classifier walks the file's
// current text + preflight verdict and produces two lists. The interactive
// auto-correct path in T012 only operates on `headingShape`.
//
// Algorithm:
//   1. Read the spec file.
//   2. Call `runPreflight()` to get `missingSections`.
//   3. For each missing section, check whether the section's label appears
//      as a bold (`**Label**` or `**Label:**`) anywhere in the file. If
//      yes, the section is *probably* present as a bold-inline label
//      inside another section and can be rewritten — classified as
//      `headingShape`. Otherwise, the section is genuinely missing or has
//      placeholder content — classified as `content`.
//   4. Actors is special: the section heading is usually present, but the
//      preflight checks `extractActorValue()` finds `Primary:` / `Secondary:`
//      line labels. If the file mentions Primary/Secondary actors via
//      bold-em-dash form (`**Primary actor — Name**`), we classify as
//      heading-shape (rewritable). Otherwise content.

import { readFileSync } from 'fs';
import { runPreflight } from '@wxkanban/preflight';

// [SCOPE 029 / T010] BEGIN — sectionLabels (missingSection → human label)
export const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  business_problem: 'Business Problem',
  actors: 'Actors',
  success_metrics: 'Success Metrics',
  scope_boundary: 'Scope Boundary',
  out_of_scope: 'Out of Scope',
  open_questions: 'Open Questions',
};
// [SCOPE 029 / T010] END

// [SCOPE 029 / T010] BEGIN — ClassifiedIssues (return shape)
export interface ClassifiedIssues {
  headingShape: string[]; // missing-section names that can be auto-rewritten
  content: string[];      // missing-section names that need human authoring
}
// [SCOPE 029 / T010] END

// [SCOPE 029 / T010] BEGIN — labelAppearsAsBold (heading-shape signal)
//
// Matches `**Label**` and `**Label:**` (bold inline label) anywhere in the
// file. Used to decide whether a missing section is recoverable by a
// mechanical heading rewrite.
function labelAppearsAsBold(content: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match `**Label**`, `**Label:**`, or `**Label —` / `**Label -` (the
  // YappChat bold-em-dash form).
  const re = new RegExp(`\\*\\*${escaped}(?:\\s*[-—:]|\\*\\*)`, 'i');
  return re.test(content);
}
// [SCOPE 029 / T010] END

// [SCOPE 029 / T010] BEGIN — isActorsRewritable (Actors special-case)
//
// Detects YappChat-class actor problems where the Actors section heading
// exists but `extractActorValue()` fails because the content uses
// `**Primary actor — Name**` instead of `Primary: Name`. Classified as
// heading-shape so the rewriter can convert the body.
function isActorsRewritable(content: string): boolean {
  // Any of these forms suggests actor identification is present but in
  // the wrong shape:
  //   **Primary actor** ... **Secondary actor** ...
  //   **Primary** ... **Secondary** ...
  //   **Primary actor — Name** ... **Secondary actor — Name** ...
  const primaryRe = /\*\*Primary(?:\s+actor)?(?:\s*[-—:]|\*\*)/i;
  const secondaryRe = /\*\*Secondary(?:\s+actors?)?(?:\s*[-—:]|\*\*)/i;
  return primaryRe.test(content) && secondaryRe.test(content);
}
// [SCOPE 029 / T010] END

// [SCOPE 029 / T010] BEGIN — classifyBlockingIssues (main entry)
export function classifyBlockingIssues(specPath: string): ClassifiedIssues {
  const content = readFileSync(specPath, 'utf-8');
  return classifyBlockingIssuesFromContent(content);
}
// [SCOPE 029 / T010] END

// [SCOPE 029 / T010] BEGIN — classifyBlockingIssuesFromContent (test-friendly variant)
export function classifyBlockingIssuesFromContent(content: string): ClassifiedIssues {
  const preflight = runPreflight(content);
  const result: ClassifiedIssues = { headingShape: [], content: [] };

  for (const section of preflight.missingSections) {
    if (section === 'actors') {
      // Special: heading often present; classify by content shape.
      if (isActorsRewritable(content)) {
        result.headingShape.push(section);
      } else {
        result.content.push(section);
      }
      continue;
    }
    const label = SECTION_LABELS[section];
    if (!label) {
      // Unknown section name (should not happen for the canonical 7) —
      // default to `content` so we don't auto-rewrite something we don't
      // understand.
      result.content.push(section);
      continue;
    }
    if (labelAppearsAsBold(content, label)) {
      result.headingShape.push(section);
    } else {
      result.content.push(section);
    }
  }

  return result;
}
// [SCOPE 029 / T010] END
