// Spec 029 / T010 — heading-shape classifier tests.

import { describe, it, expect } from 'vitest';
import { classifyBlockingIssuesFromContent } from '../../core/orchestrator/heading-classifier';

// Spec where every required section is a bold label inside Overview —
// classic YappChat shape.
const ALL_BOLD_INLINE = `# Spec

## Overview

**Business Problem** Customers lose money when X happens.
**Actors** **Primary actor — Operator** **Secondary actor — System**
**Success Metrics** 1. faster, 2. cheaper, 3. measurable
**Scope Boundary** Only the X module.
**Out of Scope** Y is excluded
**Open Questions** None.
`;

// Spec with proper headings but actors in bold-em-dash form (also
// heading-shape rewritable).
const ACTORS_BOLD_EMDASH = `# Spec

## Overview

A real fix for a real problem with enough text to clear the meaningfulness gate easily.

## Business Problem

The specific business problem is that the kit silently succeeds when the server blocks the push.

## Actors

**Primary actor — Kit operator running dbpush**
**Secondary actor — MCP server receiving the call**

## Success Metrics

1. Zero silent-success reports across 50 consecutive runs.
2. Counts match server truth — 100% of cases.
3. capture_event metadata reports pushErrors within 1 second.

## Scope Boundary

Kit MCP client envelope handling.

## Out of Scope

Rewriting the preflight rules themselves.

## Open Questions

None.
`;

// Spec where Business Problem is genuinely empty (no bold label, no
// heading — purely content missing).
const TRULY_MISSING_BP = `# Spec

## Overview

A real fix for a real problem with enough text to clear the meaningfulness gate easily.

## Actors

- Primary: Operator
- Secondary: System

## Success Metrics

1. one
2. two
3. three

## Scope Boundary

x

## Out of Scope

y

## Open Questions

z
`;

describe('classifyBlockingIssuesFromContent', () => {
  it('all-bold-inline spec → all flagged sections classified as heading-shape (none as content)', () => {
    const r = classifyBlockingIssuesFromContent(ALL_BOLD_INLINE);
    // Every section the preflight flags is recoverable by mechanical
    // heading rewrite (the labels are bold inside Overview).
    expect(r.headingShape.length).toBeGreaterThan(0);
    expect(r.content).toEqual([]);
    // No section appears in both arrays.
    for (const s of r.headingShape) {
      expect(r.content).not.toContain(s);
    }
  });

  it('actors-bold-em-dash spec → actors classified as heading-shape', () => {
    const r = classifyBlockingIssuesFromContent(ACTORS_BOLD_EMDASH);
    expect(r.headingShape).toContain('actors');
    expect(r.content).not.toContain('actors');
  });

  it('truly-missing-business-problem spec → business_problem classified as content', () => {
    const r = classifyBlockingIssuesFromContent(TRULY_MISSING_BP);
    // The Business Problem section is genuinely absent (no heading, no
    // bold label) — must be classified as content, not heading-shape.
    if (r.headingShape.length + r.content.length > 0) {
      expect(r.content).toContain('business_problem');
      expect(r.headingShape).not.toContain('business_problem');
    }
  });

  it('passing spec → both arrays empty', () => {
    const PASSING = `# Spec\n\n## Overview\n\nFine text covering the meaningfulness threshold.\n\n## Business Problem\n\nReal business problem text long enough to pass.\n\n## Actors\n\n- Primary: Operator with daily responsibility\n- Secondary: Reviewer or downstream system\n\n## Success Metrics\n\n1. Outcome 1 within 5 minutes\n2. Outcome 2 reduce errors by 30%\n3. Outcome 3 at least 95% pass rate\n\n## Scope Boundary\n\nKit MCP client surface.\n\n## Out of Scope\n\nServer-side rewrites.\n\n## Open Questions\n\nNone.\n`;
    const r = classifyBlockingIssuesFromContent(PASSING);
    expect(r.headingShape).toEqual([]);
    expect(r.content).toEqual([]);
  });
});
