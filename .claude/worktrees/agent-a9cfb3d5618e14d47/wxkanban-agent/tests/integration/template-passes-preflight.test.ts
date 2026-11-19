// Spec 029 / T014 — CI guard: the createspecs scope template must clear
// the MCP preflight on first generation (FR-015, FR-016, FR-024).
//
// If a future edit to `generateSpecMarkdown()` removes a required heading
// or replaces meaningful placeholder text with TODO/TBD markers, this
// test fails — preventing the YappChat-class regression from re-entering
// the codebase via the template path.

import { describe, it, expect } from 'vitest';
import { runPreflight } from '@wxkanban/preflight';
import { generateSpecMarkdown } from '../../core/orchestrator/command-handlers/createspecs';

describe('createspecs template — preflight regression fence (FR-016 / FR-024)', () => {
  it('default-templated scope (no human edits) passes runPreflight', () => {
    const markdown = generateSpecMarkdown({
      specNumber: '099',
      featureName: 'Sample Feature',
      scopeContent:
        'A reasonable Overview paragraph that has enough text to clear the meaningfulness gate easily and describes the WHAT and WHY of this scope.',
    });
    const result = runPreflight(markdown);
    expect(result.isValid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.blockingIssues).toEqual([]);
    expect(result.missingSections).toEqual([]);
  });

  it('all 7 canonical preflight checks pass on the template', () => {
    const markdown = generateSpecMarkdown({
      specNumber: '099',
      featureName: 'Sample Feature',
      scopeContent:
        'A reasonable Overview paragraph that has enough text to clear the meaningfulness gate easily.',
    });
    const result = runPreflight(markdown);
    expect(result.checks.hasOverview).toBe(true);
    expect(result.checks.hasBusinessProblem).toBe(true);
    expect(result.checks.hasActors).toBe(true);
    expect(result.checks.hasSuccessMetrics).toBe(true);
    expect(result.checks.hasScopeBoundary).toBe(true);
    expect(result.checks.hasOutOfScope).toBe(true);
    expect(result.checks.hasOpenQuestions).toBe(true);
  });

  it('all 7 minimum-criteria checks pass on the template', () => {
    const markdown = generateSpecMarkdown({
      specNumber: '099',
      featureName: 'Sample Feature',
      scopeContent:
        'A reasonable Overview paragraph that has enough text to clear the meaningfulness gate easily.',
    });
    const result = runPreflight(markdown);
    expect(result.minimumCriteriaStatus.businessProblem).toBe(true);
    expect(result.minimumCriteriaStatus.primaryActor).toBe(true);
    expect(result.minimumCriteriaStatus.secondaryActors).toBe(true);
    expect(result.minimumCriteriaStatus.measurableSuccessMetrics).toBe(true);
    expect(result.minimumCriteriaStatus.scopeBoundary).toBe(true);
    expect(result.minimumCriteriaStatus.outOfScope).toBe(true);
    expect(result.minimumCriteriaStatus.noPlaceholders).toBe(true);
  });

  it('FR-015a — Actors section uses Primary:/Secondary: line shape', () => {
    const markdown = generateSpecMarkdown({
      specNumber: '099',
      featureName: 'Sample',
      scopeContent: 'Overview with reasonable length to clear meaningfulness.',
    });
    // Direct evidence of the line shape: bullets with `Primary:` and
    // `Secondary:` labels (not bold-em-dash form).
    expect(markdown).toMatch(/^- Primary:/m);
    expect(markdown).toMatch(/^- Secondary:/m);
    expect(markdown).not.toMatch(/\*\*Primary actor —/);
    expect(markdown).not.toMatch(/\*\*Secondary actor —/);
  });

  it('canonical heading order matches FR-015', () => {
    const markdown = generateSpecMarkdown({
      specNumber: '099',
      featureName: 'Sample',
      scopeContent: 'Overview content.',
    });
    const order = [
      '## Overview',
      '## Business Problem',
      '## Actors',
      '## Success Metrics',
      '## Scope Boundary',
      '## Out of Scope',
      '## Open Questions',
      '## Functional Requirements',
    ];
    let lastIndex = -1;
    for (const heading of order) {
      const idx = markdown.indexOf(heading);
      expect(idx, `heading "${heading}" must appear in template`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });
});
