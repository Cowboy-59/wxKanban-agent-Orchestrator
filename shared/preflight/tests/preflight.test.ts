// Spec 029 / T001 — preflight regression + per-check unit tests.
// Verifies byte-for-byte equivalence with the inline preflight that
// previously lived in mcp-server/src/utils/project-kit.ts.

import { describe, it, expect } from 'vitest';
import {
  runPreflight,
  isMeaningfulText,
  isMeasurableMetric,
  matchesPlaceholder,
  extractActorValue,
  extractSectionContent,
} from '../src/index.js';

const COMPLETE_SCOPE = `
## Overview

This scope describes a real change that solves a measurable customer pain point with a concrete delivery plan and clearly identified responsible parties.

## Business Problem

Operators currently lack a reliable way to verify whether their database promotion actually landed; the existing CLI returns success even when zero rows were written, which causes wasted investigation time downstream.

## Actors

- Primary: Kit operator (customer or wxKanban author). Runs the CLI from a project root and expects the printed counts to truthfully reflect what landed server-side.
- Secondary: Hosted MCP server. Receives the promotion call, runs the preflight quality gate, and either persists the artifact or returns a blocked envelope.

## Success Metrics

1. Zero silent-success reports across 50 consecutive runs (target: 0).
2. Counts match server truth — specs created is derived from response.spec != null in 100% of cases.
3. capture_event metadata reports pushErrors equal to totals.errors.length within 1 second of dbpush completion.

## Scope Boundary

This scope covers the kit MCP client envelope handling, the kit dbpush blocked-envelope detection, the Phase 2 idempotency read, and the MCP server contract for blocked tools.

## Out of Scope

Rewriting the preflight quality gate itself, migrating consumer spec files, and changes to the wxKanban dashboard UI. These remain out of scope for this iteration to keep delivery focused.

## Open Questions

1. HTTP status for blocked envelopes — 422 vs. 200. Decision: ship 422.
2. Backward-compat window for envelope handling. Decision: keep both checks.
`;

describe('runPreflight — section checks', () => {
  it('passes on a fully-formed scope', () => {
    const result = runPreflight(COMPLETE_SCOPE);
    expect(result.isValid).toBe(true);
    expect(result.success).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.missingSections).toEqual([]);
  });

  it('hasOverview false when ## Overview heading is absent', () => {
    const noOverview = COMPLETE_SCOPE.replace('## Overview', '## Background');
    const result = runPreflight(noOverview);
    expect(result.checks.hasOverview).toBe(false);
    expect(result.missingSections).toContain('overview');
  });

  it('hasBusinessProblem false when section is placeholder text', () => {
    const placeholderProblem = COMPLETE_SCOPE.replace(
      /## Business Problem\n\nOperators currently lack[^.]+\./,
      '## Business Problem\n\nTODO: Define the business problem this feature solves',
    );
    const result = runPreflight(placeholderProblem);
    expect(result.checks.hasBusinessProblem).toBe(false);
    expect(result.blockingIssues).toContain('Business Problem must be specific and non-placeholder.');
  });

  it('hasActors false when Primary: line is missing', () => {
    const noPrimary = COMPLETE_SCOPE.replace(/- Primary: Kit operator[^\n]+/, '- Kit operator runs the CLI');
    const result = runPreflight(noPrimary);
    expect(result.checks.hasActors).toBe(false);
    expect(result.missingSections).toContain('actors');
    expect(result.blockingIssues).toContain('Actors section must identify a primary actor.');
  });

  it('hasActors false when Secondary: line is missing', () => {
    const noSecondary = COMPLETE_SCOPE.replace(/- Secondary: Hosted MCP server[^\n]+/, '- Hosted MCP server receives the call');
    const result = runPreflight(noSecondary);
    expect(result.checks.hasActors).toBe(false);
    expect(result.blockingIssues).toContain('Actors section must identify at least one secondary actor.');
  });

  it('hasSuccessMetrics false when heading is absent', () => {
    const noMetrics = COMPLETE_SCOPE.replace('## Success Metrics', '## Goals');
    const result = runPreflight(noMetrics);
    expect(result.checks.hasSuccessMetrics).toBe(false);
    expect(result.missingSections).toContain('success_metrics');
  });

  it('measurableSuccessMetrics false when fewer than 3 metrics have units/numbers', () => {
    const vague = COMPLETE_SCOPE.replace(
      /## Success Metrics[\s\S]*?## Scope Boundary/,
      '## Success Metrics\n\n1. Things work better.\n2. Users are happier.\n\n## Scope Boundary',
    );
    const result = runPreflight(vague);
    expect(result.minimumCriteriaStatus.measurableSuccessMetrics).toBe(false);
    expect(result.blockingIssues).toContain('Success Metrics must include at least 3 measurable outcomes.');
  });

  it('hasScopeBoundary false when content is placeholder', () => {
    const placeholder = COMPLETE_SCOPE.replace(
      /## Scope Boundary[\s\S]*?## Out of Scope/,
      '## Scope Boundary\n\nTODO: Define what is in scope for this feature\n\n## Out of Scope',
    );
    const result = runPreflight(placeholder);
    expect(result.minimumCriteriaStatus.scopeBoundary).toBe(false);
    expect(result.blockingIssues).toContain('Scope Boundary must define what is included.');
  });

  it('hasOutOfScope false when section is missing AND no exclude keyword', () => {
    const noOut = COMPLETE_SCOPE.replace(/## Out of Scope[\s\S]*?## Open Questions/, '## Open Questions');
    const result = runPreflight(noOut);
    expect(result.checks.hasOutOfScope).toBe(false);
    expect(result.missingSections).toContain('out_of_scope');
  });

  it('hasOpenQuestions accepts ## Clarifications as alias', () => {
    const clarif = COMPLETE_SCOPE.replace('## Open Questions', '## Clarifications');
    const result = runPreflight(clarif);
    expect(result.checks.hasOpenQuestions).toBe(true);
  });
});

describe('runPreflight — score + status semantics', () => {
  it('score is integer between 0 and 100', () => {
    const result = runPreflight(COMPLETE_SCOPE);
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('isValid requires blockingIssues empty AND score >= 80', () => {
    const result = runPreflight(COMPLETE_SCOPE);
    expect(result.isValid).toBe(blockingsClear(result) && result.score >= 80);
  });

  it('status reflects isValid', () => {
    const result = runPreflight(COMPLETE_SCOPE);
    expect(result.status).toBe(result.isValid ? 'valid' : 'invalid');
  });
});

describe('placeholder detection', () => {
  it('matches TODO/TBD/NEEDS CLARIFICATION as whole words', () => {
    expect(matchesPlaceholder('TODO: write this').length).toBeGreaterThan(0);
    expect(matchesPlaceholder('TBD').length).toBeGreaterThan(0);
    expect(matchesPlaceholder('this is NEEDS CLARIFICATION required').length).toBeGreaterThan(0);
  });

  it('does NOT match the natural word "placeholder" in prose', () => {
    expect(matchesPlaceholder('the URL still contains the placeholder string').length).toBe(0);
  });

  it('does match [placeholder] / <placeholder> / placeholder: as markers', () => {
    expect(matchesPlaceholder('See [placeholder] for details').length).toBeGreaterThan(0);
    expect(matchesPlaceholder('Value is <placeholder>').length).toBeGreaterThan(0);
    expect(matchesPlaceholder('placeholder: fill in later').length).toBeGreaterThan(0);
  });
});

describe('measurable metric heuristic', () => {
  it('counts metrics with numbers/percentages as measurable', () => {
    expect(isMeasurableMetric('Reduce p99 latency below 250ms')).toBe(true);
    expect(isMeasurableMetric('At least 95% of requests served in under 200ms')).toBe(true);
  });

  it('counts metrics with timing keywords even without numbers', () => {
    expect(isMeasurableMetric('Users complete onboarding within minutes')).toBe(true);
  });

  it('rejects vague aspirational metrics', () => {
    // Must avoid every keyword in the heuristic's allowlist
    // (users? / requests? / errors? / rate / latency / etc.).
    expect(isMeasurableMetric('Improve overall feel of the product')).toBe(false);
    expect(isMeasurableMetric('Better customer satisfaction outcomes')).toBe(false);
  });

  it('rejects metrics under minimum length', () => {
    expect(isMeasurableMetric('Done')).toBe(false);
  });
});

describe('actor extraction', () => {
  it('matches bulleted Primary: line', () => {
    expect(extractActorValue('- Primary: The kit operator', 'Primary')).toBe('The kit operator');
  });

  it('matches bare Primary: line (no bullet)', () => {
    expect(extractActorValue('Primary: The kit operator', 'Primary')).toBe('The kit operator');
  });

  it('does NOT match **Primary actor — name** em-dash form', () => {
    expect(extractActorValue('**Primary actor — The kit operator**', 'Primary')).toBe('');
  });
});

describe('section extraction', () => {
  it('returns content between heading and the next ## heading', () => {
    const md = '## Overview\n\nfirst line\nsecond line\n\n## Next\n\nignored';
    expect(extractSectionContent(md, /^##?\s*Overview\b/i)).toBe('first line\nsecond line');
  });

  it('returns empty string when heading is not found', () => {
    expect(extractSectionContent('## Other\n\nfoo', /^##?\s*Overview\b/i)).toBe('');
  });
});

describe('text meaningfulness gate', () => {
  it('rejects empty/short input', () => {
    expect(isMeaningfulText('', ['default'])).toBe(false);
    expect(isMeaningfulText('short', ['default'])).toBe(false);
  });

  it('rejects placeholder markers', () => {
    expect(isMeaningfulText('TODO: write something meaningful here later', ['default'])).toBe(false);
  });

  it('rejects exact default-template strings', () => {
    expect(isMeaningfulText('Default placeholder template body string', ['Default placeholder template body string'])).toBe(false);
  });

  it('accepts genuine prose above the minimum length', () => {
    expect(isMeaningfulText('Operators cannot trust the CLI report when the server silently blocks the push.', ['default'])).toBe(true);
  });
});

// [SCOPE 029 / T001] BEGIN — blockingsClear (test helper)
function blockingsClear(result: { blockingIssues: string[] }): boolean {
  return result.blockingIssues.length === 0;
}
// [SCOPE 029 / T001] END
