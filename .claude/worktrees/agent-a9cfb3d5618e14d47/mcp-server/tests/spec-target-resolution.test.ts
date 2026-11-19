/**
 * SCOPE-124 / T022 — which spec a write actually lands on.
 *
 * Two customers hit the same silent wrong-record write from opposite directions: one un-archived
 * two specs deliberately marked [ARCHIVED — fictional] by asking for "0006" and "0002", the other
 * moved a kit scaffold spec "003" while meaning their own "0003". The old resolver put an exact
 * match and a numeric match in the same `find` predicate, so array order decided which won.
 *
 * These are behavioural assertions over the rule, which is why it moved out of the 5,000-line
 * switch: a rule that decides which row gets written should be provable without a database.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSpecTarget,
  SpecTargetAmbiguousError,
  SpecTargetNotFoundError,
} from '../src/utils/spec-persistence.js';

const spec = (id: string, specNumber: string, title: string, status = 'draft') => ({
  id,
  specNumber,
  title,
  status,
});

describe('SCOPE-124 T022 — resolveSpecTarget', () => {
  // Report 3ea10d39: real four-digit scopes alongside three-digit archived specs.
  const REPORTER_ONE = [
    spec('archived-006', '006', '[ARCHIVED — fictional] Acknowledgement Service', 'archived'),
    spec('archived-002', '002', '[ARCHIVED — fictional] Admin Dashboard', 'archived'),
    spec('real-0006', '0006', 'Reporting', 'planned'),
    spec('real-0002', '0002', 'Identity', 'planned'),
    spec('real-0007', '0007', 'Billing', 'planned'),
  ];

  it('an exact specNumber wins even when a numerically equal row comes first', () => {
    const resolved = resolveSpecTarget(REPORTER_ONE, { specNumber: '0006' });
    expect(resolved.spec.id).toBe('real-0006');
    expect(resolved.resolvedBy).toBe('exact');
  });

  it('the archived three-digit spec is reachable by its own exact number', () => {
    const resolved = resolveSpecTarget(REPORTER_ONE, { specNumber: '006' });
    expect(resolved.spec.id).toBe('archived-006');
    expect(resolved.spec.status).toBe('archived');
  });

  it('a number with no exact match still resolves when exactly one row normalizes to it', () => {
    const resolved = resolveSpecTarget(REPORTER_ONE, { specNumber: '7' });
    expect(resolved.spec.id).toBe('real-0007');
    expect(resolved.resolvedBy).toBe('normalized');
  });

  // Report 928f604f: a kit scaffold spec sharing the number space with the user's own.
  it('refuses rather than choosing when normalization matches more than one', () => {
    const specs = [
      spec('scaffold-003', '003', 'Dashboard / Main Application Shell'),
      spec('real-0003', '0003', 'Backend / API'),
    ];
    expect(() => resolveSpecTarget(specs, { specNumber: '3' })).toThrow(SpecTargetAmbiguousError);
  });

  it('the ambiguity error names every candidate, so the caller can pick one', () => {
    const specs = [
      spec('scaffold-003', '003', 'Dashboard / Main Application Shell'),
      spec('real-0003', '0003', 'Backend / API', 'implementing'),
    ];
    try {
      resolveSpecTarget(specs, { specNumber: '3' });
      throw new Error('expected an ambiguity refusal');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('"003"');
      expect(message).toContain('"0003"');
      expect(message).toContain('Dashboard / Main Application Shell');
      expect(message).toContain('Backend / API');
      expect(message).toContain('scaffold-003');
      expect(message).toContain('specId');
    }
  });

  it('specId is exact and never normalized', () => {
    const resolved = resolveSpecTarget(REPORTER_ONE, { specId: 'archived-002' });
    expect(resolved.spec.specNumber).toBe('002');
    expect(resolved.resolvedBy).toBe('specId');
  });

  it('a specId that is not in this project is not found, never a near match', () => {
    expect(() => resolveSpecTarget(REPORTER_ONE, { specId: 'someone-elses-spec' })).toThrow(
      SpecTargetNotFoundError,
    );
  });

  it('an unmatched number is not found rather than resolved to the nearest row', () => {
    expect(() => resolveSpecTarget(REPORTER_ONE, { specNumber: '0099' })).toThrow(
      SpecTargetNotFoundError,
    );
  });

  it('a non-numeric specNumber does not fall through to normalization', () => {
    const specs = [spec('a', 'draft-one', 'Freeform')];
    expect(() => resolveSpecTarget(specs, { specNumber: 'draft-two' })).toThrow(
      SpecTargetNotFoundError,
    );
    expect(resolveSpecTarget(specs, { specNumber: 'draft-one' }).resolvedBy).toBe('exact');
  });

  it('two rows carrying the identical specNumber are refused, not silently split', () => {
    const specs = [spec('dup-a', '0010', 'First'), spec('dup-b', '0010', 'Second')];
    expect(() => resolveSpecTarget(specs, { specNumber: '0010' })).toThrow(SpecTargetAmbiguousError);
  });
});
