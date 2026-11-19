// [SCOPE 124 / T002] BEGIN — read-modify-write merge for buildscope --edit
/**
 * SCOPE-124 / FR-002 — an edit is a read-modify-write, not a regeneration.
 *
 * `buildScope`'s edit branch located a file name and then rebuilt the ENTIRE document from the
 * caller's arguments via `buildScopeContent`. Every field the caller did not supply came back as
 * the generator's default, so editing one section silently replaced all the others with
 * boilerplate — reported as a blank re-interview (ff0eb155) and as generating an empty shell
 * (a02e6ec5).
 *
 * The fix is to splice, never regenerate. Each supplied field replaces ONLY its own region of the
 * existing bytes; everything else is carried through untouched. Two consequences worth stating,
 * because they are the acceptance criteria:
 *
 *   - Supplying no optional fields is a no-op on content, byte for byte.
 *   - Editing one section leaves every other byte of the document identical — including hand-
 *     written sections this generator has no concept of.
 *
 * That last point is why this cannot be "parse into fields, re-emit". `buildScopeContent` stamps
 * a fresh `**Created**` date and a `### Session <today>` clarifications block, and emits fixed
 * US1-US3 / FR-001-FR-006 boilerplate. A round-trip through it is never byte-identical, and a
 * document that has since been edited by hand loses everything the generator cannot represent.
 *
 * Where a field's own region does not exist, we CREATE it rather than overwrite a neighbouring
 * section. A scope with no `## Business Problem` heading gets one inserted; its `## Overview` is
 * not repurposed, even though preflight falls back to reading Overview when Business Problem is
 * absent. Overwriting a section that belongs to a different field is the very defect being fixed.
 *
 * Target regions mirror what `@wxkanban/preflight` actually reads, so a merged document scores the
 * same way a generated one does. Generated scopes carry actors and boundary in the Core Design
 * table; hand-written scopes carry them in `## Actors` / `## Scope Boundary`. Both are handled,
 * heading form first.
 */

import { isMeaningfulText, DEFAULT_SCOPE_CONTENT } from '@wxkanban/preflight';
import { applyItemEdits, type ScopeItemEdit } from './scope-edits.js';
import { verifyOnlyNamedChanged } from './scope-verify.js';
import { buildAmendmentLogEntry, appendAmendmentLog } from './scope-log.js';

export interface ScopeEditFields {
  /**
   * Accepted for compatibility and deliberately ignored. [SCOPE 135 / T007] FR-011: on an edit,
   * callers use featureDescription to describe the CHANGE, so it no longer retitles the document.
   */
  featureDescription?: string;
  /** [SCOPE 135 / T007] The only field that retitles the H1. */
  title?: string;
  primaryActor?: string;
  secondaryActors?: string[];
  businessProblem?: string;
  successMetrics?: string[];
  scopeBoundary?: string;
  outOfScope?: string;
  integrationContext?: string;
  constraintsAndRisks?: string;
  /**
   * [SCOPE 135 / T016] FR-017 - whole-section replacements. `functionalRequirements` and
   * `userScenarios` arrive already rendered (the renderers live beside the create path in
   * project-kit.ts); the four technical sections are the author's markdown, or "None".
   */
  functionalRequirements?: string[];
  userScenarios?: string[];
  dataRequirements?: string;
  apiRoutes?: string;
  frontendComponents?: string;
  keyEntities?: string;
  /** [SCOPE 135 / T016] FR-018 - add / replace / remove one named FR, US or acceptance line. */
  edits?: ScopeItemEdit[];
  /** Amendment letter stamped into "Removed" stubs. */
  amendment?: string;
  /** ISO date for "Removed" stubs and the log entry; defaults to today. Injectable so tests are stable. */
  date?: string;
  /**
   * [SCOPE 135 / T020] FR-022 — when given, an edit that changes anything appends an Amendment Log
   * entry. buildScope always passes it; the reason is optional and logs "No reason given" when absent.
   */
  log?: { reason?: string; unattended?: boolean };
}

/**
 * SCOPE-124 / T003 — what one edit displaced, per region.
 *
 * FR-002 asks the response to show the edit's blast radius, so the caller can see that changing
 * one field did not quietly take a neighbouring section with it. Counts and an excerpt rather than
 * the whole previous body: the point is recognition, not a second copy of the document in the
 * envelope.
 */
export interface ScopeEditChange {
  /** Region key — `business_problem`, `actors`, `title`, … */
  section: string;
  /** `replaced` overwrote existing bytes; `created` added a region that did not exist. */
  action: 'replaced' | 'created';
  previousLines: number;
  previousChars: number;
  /** Enough of the displaced text to recognise it. Empty when the region was created. */
  previousExcerpt: string;
  /**
   * True when the displaced text was real content — judged by preflight's own `isMeaningfulText`,
   * so "substantial" means exactly what it means everywhere else in this codebase: not empty, not
   * a placeholder, and not the generator's default for that field. Overwriting boilerplate is not
   * a blast radius worth warning about; overwriting someone's paragraph is.
   */
  substantial: boolean;
}

export interface ScopeMergeResult {
  /** The merged document. Byte-identical to `existingContent` when nothing was supplied. */
  content: string;
  /**
   * Which regions this edit rewrote, in document order — e.g. `['business_problem', 'actors']`.
   * Empty when the edit was a no-op.
   */
  replacedSections: string[];
  /** Regions that did not exist and were appended rather than replaced. Subset of the above. */
  createdSections: string[];
  /** [SCOPE 124 / T003] Per-region detail behind `replacedSections`, in the same order. */
  changes: ScopeEditChange[];
}

/**
 * The generator defaults for a region, so a replacement can tell boilerplate from real prose.
 * Regions with no default (title, metrics) compare against an empty list, so displaced text there
 * counts on its own merits.
 */
const SECTION_DEFAULTS: Record<string, string[]> = {
  business_problem: DEFAULT_SCOPE_CONTENT.businessProblem,
  actors: [...DEFAULT_SCOPE_CONTENT.primaryActor, ...DEFAULT_SCOPE_CONTENT.secondaryActors],
  scope_boundary: DEFAULT_SCOPE_CONTENT.scopeBoundary,
  out_of_scope: DEFAULT_SCOPE_CONTENT.outOfScope,
  integration_context: DEFAULT_SCOPE_CONTENT.integrationContext,
  constraints_and_risks: DEFAULT_SCOPE_CONTENT.constraintsAndRisks,
};

function describeChange(
  section: string,
  action: 'replaced' | 'created',
  previousText: string,
): ScopeEditChange {
  const trimmed = previousText.trim();
  return {
    section,
    action,
    previousLines: trimmed === '' ? 0 : trimmed.split(/\r?\n/).length,
    previousChars: trimmed.length,
    previousExcerpt: trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed,
    substantial: action === 'replaced' && isMeaningfulText(trimmed, SECTION_DEFAULTS[section] ?? []),
  };
}

/** Preserve the document's existing line endings; a CRLF scope must not come back LF. */
function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

/**
 * Index of the heading line matching `pattern`, or -1. Matches `#` or `##` the way preflight's
 * `extractSectionContent` does, so the two agree on what counts as a section.
 */
function findHeadingIndex(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line.trim()));
}

/**
 * Index of the next heading of ANY level after `startIndex`, or `lines.length`.
 *
 * Deliberately stricter than preflight's `extractSectionContent`, which stops only at `##` and so
 * reads straight through a `###` subsection. That is right for *scoring* a section and wrong for
 * *replacing* one: in a generated scope `### Core Design` sits inside `## Overview`, and a
 * Business-Problem edit bounded the preflight way swallowed the whole Core Design table — the exact
 * class of collateral damage T002 exists to prevent. Caught by T003's reporting, which showed a
 * one-line edit displacing 8 lines.
 *
 * The trade-off is deliberate: a section that genuinely owns subsections has only its leading prose
 * replaced. Under-replacing is recoverable; destroying a table the caller never mentioned is not.
 */
function findSectionEnd(lines: string[], startIndex: number): number {
  for (let idx = startIndex + 1; idx < lines.length; idx += 1) {
    if (/^#{1,6}\s+/.test(lines[idx].trim())) {
      return idx;
    }
  }
  return lines.length;
}

/**
 * Replace the body of the section headed at `headingIndex` with `bodyLines`, keeping exactly one
 * blank line before the following heading so the document's shape survives repeated edits.
 */
function replaceSectionBody(
  lines: string[],
  headingIndex: number,
  bodyLines: string[],
): { lines: string[]; previous: string } {
  const end = findSectionEnd(lines, headingIndex);
  const previous = lines.slice(headingIndex + 1, end).join('\n');
  const isLastSection = end === lines.length;
  const replacement = ['', ...bodyLines];
  if (!isLastSection) {
    replacement.push('');
  }
  return {
    lines: [...lines.slice(0, headingIndex + 1), ...replacement, ...lines.slice(end)],
    previous,
  };
}

/**
 * [SCOPE 135 / T016] Replace a section INCLUDING its subsections - to the next heading of the same
 * or a higher level. `replaceSectionBody` stops at any heading and so would leave `### FR-001`
 * items behind; a whole-array replace of the requirements has to take them.
 */
function replaceWholeSection(
  lines: string[],
  headingIndex: number,
  bodyLines: string[],
): { lines: string[]; previous: string } {
  const level = (lines[headingIndex].trim().match(/^(#+)/) as RegExpMatchArray)[1].length;
  let end = lines.length;
  for (let idx = headingIndex + 1; idx < lines.length; idx += 1) {
    const heading = lines[idx].trim().match(/^(#{1,6})\s+/);
    if (heading && heading[1].length <= level) {
      end = idx;
      break;
    }
  }
  const previous = lines.slice(headingIndex + 1, end).join('\n');
  const replacement = ['', ...bodyLines];
  if (end !== lines.length) replacement.push('');
  return { lines: [...lines.slice(0, headingIndex + 1), ...replacement, ...lines.slice(end)], previous };
}

/** Body for a technical section: the author's markdown, or the same sentence a create writes for "None". */
function technicalBody(value: string | undefined): string[] | null {
  const text = value?.trim();
  if (!text) return null;
  return /^none[.!]?$/i.test(text) ? ['None — not affected by this scope.'] : textBody(text);
}

/**
 * Append a new `## <heading>` section at the end of the document.
 *
 * Appending is deliberate over inserting at a "natural" position: every insertion point is a guess
 * about a document whose structure we do not own, and a wrong guess moves bytes the caller did not
 * ask to move.
 */
function appendSection(lines: string[], heading: string, bodyLines: string[]): string[] {
  const trimmedTail = [...lines];
  while (trimmedTail.length > 0 && trimmedTail[trimmedTail.length - 1].trim() === '') {
    trimmedTail.pop();
  }
  return [...trimmedTail, '', `## ${heading}`, '', ...bodyLines, ''];
}

/**
 * Replace the value cell of a Core Design table row — `| **Primary Actor** | value |`.
 * Returns the untouched array when no such row exists.
 */
function replaceCoreDesignValue(
  lines: string[],
  label: string,
  value: string,
): { lines: string[]; matched: boolean; previous: string } {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowPattern = new RegExp(`^(\\s*\\|\\s*\\*\\*${escapedLabel}\\*\\*\\s*\\|)\\s*(.*?)\\s*(\\|.*)$`, 'i');

  for (let idx = 0; idx < lines.length; idx += 1) {
    const match = lines[idx].match(rowPattern);
    if (match) {
      const next = [...lines];
      next[idx] = `${match[1]} ${value} ${match[3]}`;
      return { lines: next, matched: true, previous: match[2] };
    }
  }
  return { lines, matched: false, previous: '' };
}

/**
 * Replace a `Primary:` / `Secondary:` labelled line inside the Actors section. Mirrors preflight's
 * `extractActorValue`, including its tolerance for a leading list marker.
 */
function replaceActorLine(
  lines: string[],
  actorsHeadingIndex: number,
  label: 'Primary' | 'Secondary',
  value: string,
): { lines: string[]; matched: boolean; previous: string } {
  const end = findSectionEnd(lines, actorsHeadingIndex);
  const linePattern = new RegExp(`^(\\s*[-*]?\\s*${label}\\s*:\\s*)(.+)$`, 'i');

  for (let idx = actorsHeadingIndex + 1; idx < end; idx += 1) {
    const match = lines[idx].match(linePattern);
    if (match) {
      const next = [...lines];
      next[idx] = `${match[1]}${value}`;
      return { lines: next, matched: true, previous: match[2] };
    }
  }
  return { lines, matched: false, previous: '' };
}

/** Replace a `- <label>: value` bullet inside the Notes section. */
function replaceNotesBullet(
  lines: string[],
  label: string,
  value: string,
): { lines: string[]; matched: boolean; previous: string } {
  const notesIndex = findHeadingIndex(lines, /^##?\s*Notes\b/i);
  if (notesIndex === -1) {
    return { lines, matched: false, previous: '' };
  }
  const end = findSectionEnd(lines, notesIndex);
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bulletPattern = new RegExp(`^(\\s*[-*]\\s*${escapedLabel}\\s*:\\s*)(.+)$`, 'i');

  for (let idx = notesIndex + 1; idx < end; idx += 1) {
    const match = lines[idx].match(bulletPattern);
    if (match) {
      const next = [...lines];
      next[idx] = `${match[1]}${value}`;
      return { lines: next, matched: true, previous: match[2] };
    }
  }
  return { lines, matched: false, previous: '' };
}

/** Body lines for a free-text field: the paragraph as supplied, split on its own newlines. */
function textBody(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

/** Body lines for a metric list: numbered, matching what `buildScopeContent` emits. */
function metricBody(values: string[]): string[] {
  return values.map((metric, index) => `${index + 1}. ${metric}`);
}

/**
 * Apply supplied fields over an existing scope document.
 *
 * `existingContent` is authoritative for everything not supplied. Supplying nothing returns it
 * unchanged, by identity — no parse, no rejoin, no chance of a stray whitespace difference.
 */
export function mergeScopeEdit(existingContent: string, fields: ScopeEditFields): ScopeMergeResult {
  const replacedSections: string[] = [];
  const createdSections: string[] = [];
  const changes: ScopeEditChange[] = [];

  const hasEdit =
    (fields.businessProblem !== undefined && fields.businessProblem !== '') ||
    (fields.primaryActor !== undefined && fields.primaryActor !== '') ||
    (fields.secondaryActors !== undefined && fields.secondaryActors.length > 0) ||
    (fields.successMetrics !== undefined && fields.successMetrics.length > 0) ||
    (fields.scopeBoundary !== undefined && fields.scopeBoundary !== '') ||
    (fields.outOfScope !== undefined && fields.outOfScope !== '') ||
    (fields.integrationContext !== undefined && fields.integrationContext !== '') ||
    (fields.constraintsAndRisks !== undefined && fields.constraintsAndRisks !== '') ||
    // [SCOPE 135 / T016] FR-017 - these used to be ignored, so an edit supplying only them
    // reported "no fields were supplied".
    (fields.functionalRequirements !== undefined && fields.functionalRequirements.length > 0) ||
    (fields.userScenarios !== undefined && fields.userScenarios.length > 0) ||
    (fields.dataRequirements !== undefined && fields.dataRequirements.trim() !== '') ||
    (fields.apiRoutes !== undefined && fields.apiRoutes.trim() !== '') ||
    (fields.frontendComponents !== undefined && fields.frontendComponents.trim() !== '') ||
    (fields.keyEntities !== undefined && fields.keyEntities.trim() !== '') ||
    (fields.edits !== undefined && fields.edits.length > 0);

  const eol = detectEol(existingContent);
  let lines = splitLines(existingContent);

  // --- Title -----------------------------------------------------------------------------------
  // MODIFIED-BY: [SCOPE 135 / T007 + T009] — only an explicit `title` retitles, and the H1 may read
  // `# Spec NNN:`, `# Scope NNN:`, `# SCOPE-NNN:` or `# Spec NNN —`. `featureDescription` used to
  // retitle, but it is a required argument that an edit fills with a description of the change —
  // ff0eb155 would have had its scope renamed "four surgical edits to SCOPE-010". Rewriting the H1
  // with an identical string is a no-op, which keeps the round-trip criterion intact.
  let titleChanged = false;
  let previousTitle = '';
  const newTitle = fields.title?.trim();
  if (newTitle) {
    const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
    if (titleIndex !== -1) {
      const match =
        lines[titleIndex].match(/^(#\s+(?:Spec|Scope)[\s-]*\d+\s*[:—–-]\s*)(.*)$/i) ??
        lines[titleIndex].match(/^(#\s+)(.*)$/);
      if (match && match[2] !== newTitle) {
        lines = [...lines];
        lines[titleIndex] = `${match[1]}${newTitle}`;
        titleChanged = true;
        previousTitle = match[2];
      }
    }
  }

  if (!hasEdit && !titleChanged) {
    return { content: existingContent, replacedSections: [], createdSections: [], changes: [] };
  }
  if (titleChanged) {
    replacedSections.push('title');
    changes.push(describeChange('title', 'replaced', previousTitle));
  }

  // --- Business Problem ------------------------------------------------------------------------
  // Falls back to CREATING the section rather than overwriting Overview. Preflight reads Overview
  // when Business Problem is absent, but writing there would destroy prose this field does not own.
  if (fields.businessProblem) {
    const index = findHeadingIndex(lines, /^##?\s*Business\s*Problem\b/i);
    if (index !== -1) {
      const applied = replaceSectionBody(lines, index, textBody(fields.businessProblem));
      lines = applied.lines;
      changes.push(describeChange('business_problem', 'replaced', applied.previous));
    } else {
      lines = appendSection(lines, 'Business Problem', textBody(fields.businessProblem));
      createdSections.push('business_problem');
      changes.push(describeChange('business_problem', 'created', ''));
    }
    replacedSections.push('business_problem');
  }

  // --- Actors ----------------------------------------------------------------------------------
  // Heading form first (hand-written scopes), Core Design table second (generated scopes).
  const applyActor = (label: 'Primary' | 'Secondary', value: string, coreDesignLabel: string): void => {
    const actorsIndex = findHeadingIndex(lines, /^##?\s*Actors\b/i);
    if (actorsIndex !== -1) {
      const attempt = replaceActorLine(lines, actorsIndex, label, value);
      if (attempt.matched) {
        lines = attempt.lines;
        changes.push(describeChange('actors', 'replaced', attempt.previous));
        return;
      }
      // Section exists but lacks this label — add the line rather than inventing a second section.
      const end = findSectionEnd(lines, actorsIndex);
      let insertAt = end;
      while (insertAt > actorsIndex + 1 && lines[insertAt - 1].trim() === '') {
        insertAt -= 1;
      }
      lines = [...lines.slice(0, insertAt), `- ${label}: ${value}`, ...lines.slice(insertAt)];
      changes.push(describeChange('actors', 'created', ''));
      return;
    }

    const coreDesign = replaceCoreDesignValue(lines, coreDesignLabel, value);
    if (coreDesign.matched) {
      lines = coreDesign.lines;
      changes.push(describeChange('actors', 'replaced', coreDesign.previous));
      return;
    }

    lines = appendSection(lines, 'Actors', [`- ${label}: ${value}`]);
    createdSections.push('actors');
    changes.push(describeChange('actors', 'created', ''));
  };

  if (fields.primaryActor) {
    applyActor('Primary', fields.primaryActor, 'Primary Actor');
    replacedSections.push('actors');
  }
  if (fields.secondaryActors && fields.secondaryActors.length > 0) {
    applyActor('Secondary', fields.secondaryActors.join(', '), 'Secondary Actors');
    if (!replacedSections.includes('actors')) {
      replacedSections.push('actors');
    }
  }

  // --- Success Metrics -------------------------------------------------------------------------
  if (fields.successMetrics && fields.successMetrics.length > 0) {
    const index = findHeadingIndex(lines, /^##?\s*(?:Success\s*Metrics|Success\s*Criteria)\b/i);
    if (index !== -1) {
      const applied = replaceSectionBody(lines, index, metricBody(fields.successMetrics));
      lines = applied.lines;
      changes.push(describeChange('success_metrics', 'replaced', applied.previous));
    } else {
      lines = appendSection(lines, 'Success Metrics', metricBody(fields.successMetrics));
      createdSections.push('success_metrics');
      changes.push(describeChange('success_metrics', 'created', ''));
    }
    replacedSections.push('success_metrics');
  }

  // --- Scope Boundary --------------------------------------------------------------------------
  if (fields.scopeBoundary) {
    const index = findHeadingIndex(lines, /^##?\s*(?:Scope\s*Boundary|In\s*Scope)\b/i);
    if (index !== -1) {
      const applied = replaceSectionBody(lines, index, textBody(fields.scopeBoundary));
      lines = applied.lines;
      changes.push(describeChange('scope_boundary', 'replaced', applied.previous));
    } else {
      const coreDesign = replaceCoreDesignValue(lines, 'Scope Boundary', fields.scopeBoundary);
      if (coreDesign.matched) {
        lines = coreDesign.lines;
        changes.push(describeChange('scope_boundary', 'replaced', coreDesign.previous));
      } else {
        lines = appendSection(lines, 'Scope Boundary', textBody(fields.scopeBoundary));
        createdSections.push('scope_boundary');
        changes.push(describeChange('scope_boundary', 'created', ''));
      }
    }
    replacedSections.push('scope_boundary');
  }

  // --- Out of Scope ----------------------------------------------------------------------------
  if (fields.outOfScope) {
    const index = findHeadingIndex(lines, /^##?\s*Out\s*of\s*Scope\b/i);
    if (index !== -1) {
      const applied = replaceSectionBody(lines, index, textBody(fields.outOfScope));
      lines = applied.lines;
      changes.push(describeChange('out_of_scope', 'replaced', applied.previous));
    } else {
      lines = appendSection(lines, 'Out of Scope', textBody(fields.outOfScope));
      createdSections.push('out_of_scope');
      changes.push(describeChange('out_of_scope', 'created', ''));
    }
    replacedSections.push('out_of_scope');
  }

  // --- Integration Context ---------------------------------------------------------------------
  // Generated scopes carry this as a `- Integration context:` bullet under `## Notes`; preflight
  // looks for either that bullet or an `## Integration Context` heading.
  if (fields.integrationContext) {
    const index = findHeadingIndex(lines, /^##?\s*Integration\s*Context\b/i);
    if (index !== -1) {
      const applied = replaceSectionBody(lines, index, textBody(fields.integrationContext));
      lines = applied.lines;
      changes.push(describeChange('integration_context', 'replaced', applied.previous));
    } else {
      const bullet = replaceNotesBullet(lines, 'Integration context', fields.integrationContext);
      if (bullet.matched) {
        lines = bullet.lines;
        changes.push(describeChange('integration_context', 'replaced', bullet.previous));
      } else {
        lines = appendSection(lines, 'Integration Context', textBody(fields.integrationContext));
        createdSections.push('integration_context');
        changes.push(describeChange('integration_context', 'created', ''));
      }
    }
    replacedSections.push('integration_context');
  }

  // --- Constraints and Risks -------------------------------------------------------------------
  // NOT `## Constraints`: that section holds the generator's MUST bullets, which this field does
  // not own. Same rule as Business Problem vs Overview.
  if (fields.constraintsAndRisks) {
    const index = findHeadingIndex(lines, /^##?\s*Constraints\s*(?:and|&)\s*Risks\b/i);
    if (index !== -1) {
      const applied = replaceSectionBody(lines, index, textBody(fields.constraintsAndRisks));
      lines = applied.lines;
      changes.push(describeChange('constraints_and_risks', 'replaced', applied.previous));
    } else {
      const bullet = replaceNotesBullet(lines, 'Constraints and risks', fields.constraintsAndRisks);
      if (bullet.matched) {
        lines = bullet.lines;
        changes.push(describeChange('constraints_and_risks', 'replaced', bullet.previous));
      } else {
        lines = appendSection(lines, 'Constraints and Risks', textBody(fields.constraintsAndRisks));
        createdSections.push('constraints_and_risks');
        changes.push(describeChange('constraints_and_risks', 'created', ''));
      }
    }
    replacedSections.push('constraints_and_risks');
  }

  // --- Requirements, scenarios and the four technical sections ([SCOPE 135 / T016]) -------------
  // Whole-section replace: the section runs to the next heading of the SAME OR HIGHER level, so the
  // `### FR-nnn` items inside `## Functional Requirements` go with it. That is what a create does,
  // and what the caller asked for by supplying the whole array.
  const nonEmpty = (value: string[] | undefined): string[] | null => (value && value.length > 0 ? value : null);
  const wholeSections: Array<{ name: string; pattern: RegExp; heading: string; body: string[] | null }> = [
    { name: 'user_scenarios', pattern: /^##?\s*User\s*(?:Scenarios|Stor(?:y|ies))\b/i, heading: 'User Scenarios & Testing', body: nonEmpty(fields.userScenarios) },
    { name: 'functional_requirements', pattern: /^##?\s*Functional\s*Requirements\b/i, heading: 'Functional Requirements', body: nonEmpty(fields.functionalRequirements) },
    { name: 'data_requirements', pattern: /^##?\s*Data\s*Requirements\b/i, heading: 'Data Requirements', body: technicalBody(fields.dataRequirements) },
    { name: 'api_routes', pattern: /^##?\s*API\s*Routes\b/i, heading: 'API Routes', body: technicalBody(fields.apiRoutes) },
    { name: 'frontend_components', pattern: /^##?\s*Frontend\s*Components\b/i, heading: 'Frontend Components', body: technicalBody(fields.frontendComponents) },
    { name: 'key_entities', pattern: /^##?\s*Key\s*Entities\b/i, heading: 'Key Entities', body: technicalBody(fields.keyEntities) },
  ];
  for (const section of wholeSections) {
    if (section.body === null) continue;
    const index = findHeadingIndex(lines, section.pattern);
    if (index !== -1) {
      const applied = replaceWholeSection(lines, index, section.body);
      lines = applied.lines;
      changes.push(describeChange(section.name, 'replaced', applied.previous));
    } else {
      lines = appendSection(lines, section.heading, section.body);
      createdSections.push(section.name);
      changes.push(describeChange(section.name, 'created', ''));
    }
    replacedSections.push(section.name);
  }

  // --- Edits by named item ([SCOPE 135 / T016], FR-018) ------------------------------------------
  // After the whole-section fields, so an edit can address an item a rewrite just produced. A
  // refusal (unknown target, empty content) throws ScopeEditRefusal and no draft is produced.
  if (fields.edits && fields.edits.length > 0) {
    const applied = applyItemEdits(lines, fields.edits, {
      date: fields.date ?? new Date().toISOString().slice(0, 10),
      amendment: fields.amendment,
    });
    lines = applied.lines;
    for (const change of applied.changes) {
      changes.push(describeChange(change.target, change.action, change.previous));
      replacedSections.push(change.target);
      if (change.action === 'created') createdSections.push(change.target);
    }
  }

  // --- Byte-identical check ([SCOPE 135 / T017], FR-019) ---------------------------------------
  // Everything this edit did not name must come back exactly as it went in. A merge defect refuses
  // here, with no draft, instead of reaching the author as a quietly rewritten paragraph.
  // MODIFIED-BY: [SCOPE 135 / T020] — checked BEFORE the log entry is added. The existing log lies
  // outside every named region, so this is what keeps earlier entries byte-identical. Checking after
  // the append instead let the line diff slide a new entry's closing fence onto the previous entry's
  // identical one and report the insertion a line early — refusing every second logged edit.
  verifyOnlyNamedChanged(
    existingContent,
    lines.join(eol),
    replacedSections,
    createdSections.some((name) => !/^(?:FR|US)-?\d/.test(name)),
  );

  // --- Amendment Log ([SCOPE 135 / T020], FR-022) ----------------------------------------------
  // One entry per edit that changed something, appended to the end of `## Amendment Log`. The
  // replaced text is taken from the diff of base and draft, before the entry itself is added.
  // appendAmendmentLog inserts at one point only, so nothing verified above can move.
  if (fields.log && replacedSections.length > 0) {
    const entry = buildAmendmentLogEntry(
      {
        date: fields.date ?? new Date().toISOString().slice(0, 10),
        amendment: fields.amendment,
        reason: fields.log.reason,
        items: replacedSections,
        unattended: fields.log.unattended,
      },
      splitLines(existingContent),
      lines,
    );
    lines = appendAmendmentLog(lines, entry).lines;
  }

  const content = lines.join(eol);
  return { content, replacedSections, createdSections, changes };
}
// [SCOPE 124 / T002] END
