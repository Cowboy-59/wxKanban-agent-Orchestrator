// SCOPE-135 / FR-007 + FR-014 — completeness warnings never move the gate.

import { describe, it, expect } from 'vitest';
import { runPreflight, countScopeCompleteness, completenessWarnings } from '../src/index.js';

const BASE = `
## Overview

Operators reconcile billable time across three spreadsheets, which delays invoices by a week every month.

## Actors

- Primary: Consulting operations manager
- Secondary: Project manager, Finance lead

## Success Metrics

1. 95% of invoices are generated within 5 minutes of period close.
2. Missed billable hours drop by 25% within 30 days.
3. 50 concurrent review sessions run with under 1% errors.

## Scope Boundary

Include time-entry review, approval routing, and invoice-ready export.

## Out of Scope

Exclude payment collection, tax calculation, and ERP synchronization.

## Open Questions

- None.
`;

// The shape SCOPE-126 had before its hand repair: the generator's six template FRs.
const PRE_REPAIR = `${BASE}
## Functional Requirements

### FR-001 — Primary workflow support

The system MUST support the primary in-scope workflow.

**Acceptance Criteria**:
- [ ] The primary actor can complete the core workflow without manual workaround.

### FR-002 — Business rule enforcement

The system MUST enforce the business rules.

**Acceptance Criteria**:
- [ ] The workflow does not proceed when business rules are violated.

### FR-003 — Visibility for affected actors
### FR-004 — Integration alignment
### FR-005 — History and traceability
### FR-006 — Reporting and operational review
`;

const REAL = `${BASE}
## User Scenarios & Testing

### US1 — Manager approves a week
### US2 — Finance imports the export
### US3 — A project has no manager

## Functional Requirements

### FR-001 — Review time entries before export

The system MUST let the manager approve each week.

**Acceptance Criteria**:
- [ ] Only approved weeks appear in the export.

| FR-002 | Route approvals | covered by the table form, which carries no criteria body |
`;

describe('SCOPE-135 FR-007 — boilerplate FR detector', () => {
  it('names every boilerplate title in the SCOPE-126 pre-repair shape', () => {
    const counts = countScopeCompleteness(PRE_REPAIR);
    expect(counts.boilerplateFunctionalRequirements).toEqual([
      'FR-001 Primary workflow support',
      'FR-002 Business rule enforcement',
      'FR-003 Visibility for affected actors',
      'FR-004 Integration alignment',
      'FR-005 History and traceability',
      'FR-006 Reporting and operational review',
    ]);
    expect(runPreflight(PRE_REPAIR).warnings.join(' ')).toContain('generator boilerplate');
  });

  it('is warning-only: score, isValid and blockingIssues equal those of the same scope without FRs', () => {
    const withFiller = runPreflight(PRE_REPAIR);
    const without = runPreflight(BASE);
    expect(withFiller.score).toBe(without.score);
    expect(withFiller.isValid).toBe(without.isValid);
    expect(withFiller.blockingIssues).toEqual(without.blockingIssues);
  });
});

describe('SCOPE-135 FR-014 — completeness counts', () => {
  it('counts FRs in heading and table form, criteria only where an FR owns a section', () => {
    const counts = countScopeCompleteness(REAL);
    expect(counts.functionalRequirementIds).toEqual(['FR-001', 'FR-002']);
    expect(counts.functionalRequirementsWithCriteria).toBe(1);
    expect(counts.functionalRequirementsWithoutCriteria).toEqual([]);
    expect(counts.userScenarioCount).toBe(3);
    expect(completenessWarnings(counts)).toEqual([]);
  });

  it('warns on no FRs, FRs without criteria, and fewer than 3 scenarios', () => {
    expect(runPreflight(BASE).warnings.join(' ')).toContain('No functional requirements found');
    const preRepair = runPreflight(PRE_REPAIR).warnings.join(' ');
    expect(preRepair).toContain('4 functional requirement(s) have no acceptance criteria: FR-003, FR-004, FR-005, FR-006.');
    expect(preRepair).toContain('0 user scenario(s) found');
  });

  it('ignores FR lines inside fenced code', () => {
    const fenced = `${BASE}\n\`\`\`md\n### FR-001 — Example in a code block\n\`\`\`\n`;
    expect(countScopeCompleteness(fenced).functionalRequirementIds).toEqual([]);
  });
});
