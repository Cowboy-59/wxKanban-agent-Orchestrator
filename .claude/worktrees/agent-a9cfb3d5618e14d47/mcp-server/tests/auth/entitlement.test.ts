/**
 * Entitlement gate unit tests.
 *
 * The DB and logger are mocked so tests stay hermetic. The decision logic is
 * exercised via the pure evaluator and via checkEntitlement() with an injected
 * loader (no real database).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/connection.js', () => ({
  db: {},
  pool: {},
}));
vi.mock('../../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), audit: vi.fn() },
}));

import {
  evaluateEntitlementRow,
  checkEntitlement,
  clearEntitlementCache,
  isEntitlementExempt,
  ENTITLEMENT_EXEMPT_TOOLS,
  type CompanyEntitlementRow,
} from '../../src/auth/entitlement.js';

beforeEach(() => clearEntitlementCache());

describe('evaluateEntitlementRow — truth table', () => {
  const cases: Array<{ name: string; row: CompanyEntitlementRow | null; allowed: boolean; code?: string }> = [
    { name: 'ACTIVE + active flag', row: { status: 'ACTIVE', active: true, exempt: false }, allowed: true },
    { name: 'TRIAL + active flag', row: { status: 'TRIAL', active: true, exempt: false }, allowed: true },
    { name: 'lowercase active (normalized)', row: { status: 'active', active: true, exempt: false }, allowed: true },
    { name: 'SUSPENDED', row: { status: 'SUSPENDED', active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
    { name: 'CANCELLED', row: { status: 'CANCELLED', active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
    { name: 'PENDING', row: { status: 'PENDING', active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
    { name: 'ACTIVE but activeflag false', row: { status: 'ACTIVE', active: false, exempt: false }, allowed: false, code: 'subscription-inactive' },
    { name: 'billingexempt overrides a bad status', row: { status: 'CANCELLED', active: false, exempt: true }, allowed: true },
    { name: 'no customer row', row: null, allowed: false, code: 'entitlement-unknown' },
    { name: 'null status', row: { status: null, active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
    // [SCOPE 090 / T013] Amendment A — mirrored from the app-side policy truth
    // table (tests/unit/scope090-subscription-policy.test.ts). These two live in
    // separate deploy units and cannot share code, so drift is caught here.
    { name: 'PENDING_INACTIVE (failed card)', row: { status: 'PENDING_INACTIVE', active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
    { name: 'CANCELED (US spelling)', row: { status: 'CANCELED', active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
    { name: 'unknown status blocks rather than falling through', row: { status: 'SOMETHING_NEW', active: true, exempt: false }, allowed: false, code: 'subscription-inactive' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = evaluateEntitlementRow(c.row);
      expect(r.allowed).toBe(c.allowed);
      if (c.code) expect(r.code).toBe(c.code);
      if (!c.allowed) expect(r.reason).toBeTruthy();
    });
  }
});

describe('checkEntitlement — loader + cache', () => {
  it('null customerId is denied (entitlement-unknown)', async () => {
    const r = await checkEntitlement(null);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('entitlement-unknown');
  });

  it('allows an ACTIVE customer via injected loader', async () => {
    const loader = vi.fn().mockResolvedValue({ status: 'ACTIVE', active: true, exempt: false });
    const r = await checkEntitlement('cust-1', loader);
    expect(r.allowed).toBe(true);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('caches the decision (loader called once across two calls)', async () => {
    const loader = vi.fn().mockResolvedValue({ status: 'ACTIVE', active: true, exempt: false });
    await checkEntitlement('cust-2', loader);
    await checkEntitlement('cust-2', loader);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('denies a SUSPENDED customer', async () => {
    const loader = vi.fn().mockResolvedValue({ status: 'SUSPENDED', active: true, exempt: false });
    const r = await checkEntitlement('cust-3', loader);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('subscription-inactive');
  });

  it('fails OPEN (degraded) on a loader error so a DB blip does not lock out paying customers', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('db down'));
    const r = await checkEntitlement('cust-4', loader);
    expect(r.allowed).toBe(true);
    expect(r.code).toBe('entitlement-degraded');
  });
});

describe('isEntitlementExempt', () => {
  it('exempts diagnostic/recovery tools', () => {
    expect(isEntitlementExempt('project.help')).toBe(true);
    expect(isEntitlementExempt('project.kit_status')).toBe(true);
    expect(isEntitlementExempt('project.get_entitlement')).toBe(true);
  });
  it('does not exempt value tools', () => {
    expect(isEntitlementExempt('project.buildscope')).toBe(false);
    expect(isEntitlementExempt('project.implement')).toBe(false);
  });

  // [SCOPE 090 / T013] Amendment A FR-011.
  it('exempts the tools that tell a lapsed customer they are lapsed', () => {
    // Without these the editor session throws on its first call and the user is
    // left with a broken tool and no readable explanation.
    expect(isEntitlementExempt('project.session_start')).toBe(true);
    expect(isEntitlementExempt('project.cockpit_summary')).toBe(true);
  });

  it('the exempt set stays small — it is the hole in a fail-closed gate', () => {
    expect(ENTITLEMENT_EXEMPT_TOOLS.size).toBeLessThanOrEqual(10);
  });
});
