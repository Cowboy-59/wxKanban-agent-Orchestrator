// SCOPE-135 / FR-007 + FR-014 — completeness counts the gate does not enforce.
//
// runPreflight decides isValid from actors, metrics, boundaries and placeholders. It never looked at
// functional requirements, acceptance criteria or user scenarios, so a scope with none of them could
// score 100 while the buildscope checklist beside it showed those boxes unticked (field report
// 7874b04b). The decision (2026-10-04) was to keep the gate as it is and make the gap visible: these
// counts feed runPreflight's WARNINGS and the checklist's Advisory group, never the score.
//
// One counter, two consumers: if the checklist and the warnings each counted their own way, they
// would disagree about the same document — the very contradiction this exists to remove.

// [SCOPE 135 / T004] BEGIN — scope completeness counts (FR, acceptance criteria, scenarios, boilerplate)
/**
 * The six FR titles the buildscope generator emitted before SCOPE-135. Any of them in a scope means
 * the requirements are template filler, not the author's — and createSpecs fans out from them.
 */
export const BOILERPLATE_FR_TITLES = [
  'Primary workflow support',
  'Business rule enforcement',
  'Visibility for affected actors',
  'Integration alignment',
  'History and traceability',
  'Reporting and operational review',
] as const;

export interface ScopeCompleteness {
  /** Distinct FR ids found in any form: heading, bullet, bold lead, or table row. */
  functionalRequirementIds: string[];
  /** Heading-form FRs whose section carries no acceptance criteria. */
  functionalRequirementsWithoutCriteria: string[];
  /** Heading-form FRs whose section does carry acceptance criteria. */
  functionalRequirementsWithCriteria: number;
  /** User scenario headings: `US1`, `US-1`, `User Story 1`, `Scenario 1`. */
  userScenarioCount: number;
  /** Boilerplate titles found on FR lines, as `FR-001 Primary workflow support`. */
  boilerplateFunctionalRequirements: string[];
}

const FR_ID = /\bFR-(\d+)\b/;
// FR-NNN leading a heading, a list item, a bold run, or a table cell.
const FR_LINE = /^\s*(?:#{1,6}\s*|[-*]\s+|\|\s*)?\**\s*FR-\d+\b/;
const FR_HEADING = /^(#{1,6})\s*\**\s*FR-\d+\b/;
const SCENARIO_HEADING = /^#{1,6}\s*\**\s*(?:US-?\s?\d+|User\s+Stor(?:y|ies)\s+\d+|Scenario\s+\d+)\b/i;
const HEADING = /^(#{1,6})\s+/;
// "**Acceptance Criteria**", "Acceptance criteria:", "#### Acceptance Criteria", or checkbox lines.
const CRITERIA = /acceptance\s+criteria|^\s*[-*]\s+\[[ xX]\]/im;

function stripCodeFences(content: string): string[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      kept.push('');
      continue;
    }
    kept.push(inFence ? '' : line);
  }
  return kept;
}

export function countScopeCompleteness(content: string): ScopeCompleteness {
  const lines = stripCodeFences(content);
  const ids = new Set<string>();
  const withoutCriteria: string[] = [];
  let withCriteria = 0;
  let userScenarioCount = 0;
  const boilerplate: string[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];

    if (SCENARIO_HEADING.test(line)) {
      userScenarioCount += 1;
    }

    if (!FR_LINE.test(line)) {
      continue;
    }
    const idMatch = line.match(FR_ID);
    if (!idMatch) {
      continue;
    }
    const id = `FR-${idMatch[1].padStart(3, '0')}`;
    ids.add(id);

    const title = BOILERPLATE_FR_TITLES.find((candidate) => line.toLowerCase().includes(candidate.toLowerCase()));
    if (title && !boilerplate.some((entry) => entry.startsWith(`${id} `))) {
      boilerplate.push(`${id} ${title}`);
    }

    // Acceptance criteria are judged only where an FR owns a section — a heading. A bullet or table
    // row has no body to search, so it is neither counted for nor against.
    const heading = line.match(FR_HEADING);
    if (!heading) {
      continue;
    }
    const level = heading[1].length;
    let end = lines.length;
    for (let next = idx + 1; next < lines.length; next += 1) {
      const nextHeading = lines[next].match(HEADING);
      if (nextHeading && nextHeading[1].length <= level) {
        end = next;
        break;
      }
    }
    const body = lines.slice(idx + 1, end).join('\n');
    if (CRITERIA.test(body)) {
      withCriteria += 1;
    } else if (!withoutCriteria.includes(id)) {
      withoutCriteria.push(id);
    }
  }

  return {
    functionalRequirementIds: [...ids],
    functionalRequirementsWithoutCriteria: withoutCriteria,
    functionalRequirementsWithCriteria: withCriteria,
    userScenarioCount,
    boilerplateFunctionalRequirements: boilerplate,
  };
}

/**
 * Warning text for every completeness gap. Warning-only by contract: runPreflight appends these to
 * `warnings` and they never touch `score`, `isValid` or `blockingIssues`.
 */
export function completenessWarnings(completeness: ScopeCompleteness): string[] {
  const warnings: string[] = [];
  if (completeness.boilerplateFunctionalRequirements.length > 0) {
    warnings.push(
      `Functional Requirements contain generator boilerplate, not the author's requirements: ${completeness.boilerplateFunctionalRequirements.join('; ')}. Replace them before createSpecs, which builds specs from this section.`,
    );
  }
  if (completeness.functionalRequirementIds.length === 0) {
    warnings.push('No functional requirements found (no FR-NNN entries). createSpecs builds specs from them, so add them before createSpecs.');
  } else if (completeness.functionalRequirementsWithoutCriteria.length > 0) {
    warnings.push(
      `${completeness.functionalRequirementsWithoutCriteria.length} functional requirement(s) have no acceptance criteria: ${completeness.functionalRequirementsWithoutCriteria.join(', ')}.`,
    );
  }
  if (completeness.userScenarioCount < 3) {
    warnings.push(
      `${completeness.userScenarioCount} user scenario(s) found; at least 3 (primary, secondary, and an edge case) are recommended.`,
    );
  }
  return warnings;
}
// [SCOPE 135 / T004] END
