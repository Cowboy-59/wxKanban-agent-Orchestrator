import { describe, it, expect } from 'vitest';
import {
  OVERVIEW_SECTION_KEYS,
  sectionsWithContent,
  buildInterviewStatePreamble,
  detectSectionProposals,
} from '../../src/server/ai/prompts/business-analyst.js';

/**
 * SPEC-025 FR-021 — Interview Continuity & Resilient Section-Write.
 *
 * Regression guard for the field-reported defect (Amendment C): the bounded
 * window (FR-020) starved the interview of its own state, so after ~2 sections
 * the model stopped emitting section fences and restarted at Problem. These
 * cover the durable state-derivation + preamble that stop that, plus the
 * server-side fence-detection safety net.
 */

// Build a draft body with the given covered sections populated and the rest
// left as the empty seed template (`## Heading\n\n`).
const HEADINGS: Record<string, string> = {
  problem: 'Problem',
  overview: 'Overview',
  goals: 'Goals',
  'primary-users': 'Primary Users',
  constraints: 'Constraints',
  'success-criteria': 'Success Criteria',
  notes: 'Notes',
};

function draftWith(covered: string[]): string {
  return (
    OVERVIEW_SECTION_KEYS.map((k) =>
      covered.includes(k)
        ? `## ${HEADINGS[k]}\n\nSome real content for ${HEADINGS[k]}.\n`
        : `## ${HEADINGS[k]}\n\n`,
    ).join('\n') + '\n'
  );
}

describe('FR-021 sectionsWithContent — durable covered-set from draft body', () => {
  it('an empty seed template covers nothing', () => {
    expect(sectionsWithContent(draftWith([])).size).toBe(0);
  });

  it('detects only the populated sections, ignoring empty placeholders', () => {
    const covered = sectionsWithContent(draftWith(['problem', 'overview']));
    expect([...covered].sort()).toEqual(['overview', 'problem']);
  });

  it('detects the last section (no trailing heading to bound it)', () => {
    expect(sectionsWithContent(draftWith(['notes'])).has('notes')).toBe(true);
  });

  it('empty/undefined content is safe', () => {
    expect(sectionsWithContent('').size).toBe(0);
  });
});

describe('FR-021 buildInterviewStatePreamble — window-independent place-keeping', () => {
  it('fresh interview points at Problem as current', () => {
    const p = buildInterviewStatePreamble(new Set());
    expect(p).toMatch(/covered: none yet/i);
    expect(p).toMatch(/Current section to work on now: Problem/);
  });

  it('after Problem+Overview, current is Goals and covered are listed', () => {
    const p = buildInterviewStatePreamble(new Set(['problem', 'overview']));
    expect(p).toMatch(/already covered.*Problem, Overview/);
    expect(p).toMatch(/Current section to work on now: Goals/);
    // The anti-restart instruction must be present.
    expect(p).toMatch(/Do NOT restart from Problem/);
  });

  it('when all seven are covered, it concludes instead of restarting', () => {
    const p = buildInterviewStatePreamble(new Set(OVERVIEW_SECTION_KEYS));
    expect(p).toMatch(/All seven sections are covered/);
    expect(p).toMatch(/Submit the proposal or Create the project/);
    expect(p).toMatch(/Do NOT restart from Problem/);
    expect(p).not.toMatch(/Current section to work on now/);
  });

  it('respects canonical template order regardless of insertion order', () => {
    const p = buildInterviewStatePreamble(new Set(['goals', 'problem']));
    expect(p).toMatch(/already covered.*Problem, Goals/);
    // First uncovered in order is Overview.
    expect(p).toMatch(/Current section to work on now: Overview/);
  });
});

describe('FR-021 detectSectionProposals — server-side fallback signal', () => {
  it('detects the canonical section:key fence', () => {
    const txt = 'Here is my draft:\n```section:goals\nShip faster.\n```';
    const d = detectSectionProposals(txt);
    expect(d).toHaveLength(1);
    expect(d[0]?.sectionKey).toBe('goals');
  });

  it('detects the looser ```key fence some models emit', () => {
    const txt = '```primary-users\nCareer-changers.\n```';
    expect(detectSectionProposals(txt)[0]?.sectionKey).toBe('primary-users');
  });

  it('ignores non-section language fences', () => {
    const txt = '```js\nconst x = 1;\n```';
    expect(detectSectionProposals(txt)).toHaveLength(0);
  });
});
