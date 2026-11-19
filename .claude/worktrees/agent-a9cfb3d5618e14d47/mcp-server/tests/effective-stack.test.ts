/**
 * SPEC-056 / T006 — effective-stack resolver: resolved-stack vs. fallback +
 * the get_stack resolution order (project -> company -> built-in/null).
 *
 * Pure-function tests, no DB. The resolver is the single resolution point the
 * project.get_stack handler consumes; the no-regression fallback (T005) is the
 * null branch — nothing resolves -> get_stack returns null -> materialize-stack
 * writes no stack.md -> generation is byte-for-byte today's behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveStack,
  type StackDocInput,
} from '../src/utils/effective-stack.js';

const projectDoc: StackDocInput = { content: '# project stack', updatedAt: '2026-06-14T00:00:00.000Z' };
const companyProfile: StackDocInput = { content: '# company stack', updatedAt: '2026-06-10T00:00:00.000Z' };

describe('resolveEffectiveStack — priority order', () => {
  it('returns the project doc when present (project wins over company)', () => {
    const r = resolveEffectiveStack(projectDoc, companyProfile);
    expect(r).toEqual({ content: '# project stack', updatedAt: projectDoc.updatedAt, source: 'project' });
  });

  it('project doc wins even with no company profile', () => {
    const r = resolveEffectiveStack(projectDoc, null);
    expect(r?.source).toBe('project');
    expect(r?.content).toBe('# project stack');
  });

  it('falls through to the company profile when no project doc', () => {
    const r = resolveEffectiveStack(null, companyProfile);
    expect(r).toEqual({ content: '# company stack', updatedAt: companyProfile.updatedAt, source: 'company' });
  });

  it('returns null (built-in default / no regression) when neither resolves', () => {
    expect(resolveEffectiveStack(null, null)).toBeNull();
    expect(resolveEffectiveStack(undefined, undefined)).toBeNull();
  });
});

describe('resolveEffectiveStack — empty content is treated as absent', () => {
  it('skips a project doc with empty content and uses the company profile', () => {
    const r = resolveEffectiveStack({ content: '', updatedAt: null }, companyProfile);
    expect(r?.source).toBe('company');
  });

  it('returns null when both have empty content', () => {
    expect(
      resolveEffectiveStack({ content: '', updatedAt: null }, { content: '', updatedAt: null }),
    ).toBeNull();
  });
});
