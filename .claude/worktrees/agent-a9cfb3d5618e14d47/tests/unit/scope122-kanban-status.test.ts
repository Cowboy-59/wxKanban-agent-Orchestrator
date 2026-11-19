// [SCOPE 122 / T006] Kanban status vocabulary — behaviour + drift guard.
//
// The defect these pin was a LEGAL WRITE THAT RENDERED NOWHERE: the MCP accepted
// `beta`, the row was correct in the database, every other surface reported it healthy,
// and the Kanban board filtered the card out of every column at once because placement
// was a bare lookup whose miss-case is `undefined`. Measured 2026-08-03: a customer had
// 8 of 9 scopes invisible.
//
// So every assertion here is about what the BOARD RESOLVES, never about what was
// stored. A test that only checks "the write succeeded" reproduces the blind spot.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveColumnId,
  isHiddenStatus,
  HIDDEN_COLUMN,
  FALLBACK_COLUMN_ID,
  STATUS_TO_COLUMN,
  MCP_STATUS_TO_COLUMN,
} from '../../src/shared/kanban-status';

const REAL_COLUMNS = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6', 'deferred'];

/** How many real columns would show this status. The original bug made this 0. */
function columnsContaining(status: string): number {
  return REAL_COLUMNS.filter((c) => resolveColumnId(status) === c).length;
}

describe('SCOPE-122 — the MCP vocabulary renders', () => {
  it('places `beta` in Phase 5 — the exact status that vanished for a customer', () => {
    expect(resolveColumnId('beta')).toBe('phase5');
  });

  it('places `qa` in Phase 3', () => {
    expect(resolveColumnId('qa')).toBe('phase3');
  });

  it('places `human_testing` in Phase 4', () => {
    expect(resolveColumnId('human_testing')).toBe('phase4');
  });
});

describe('SCOPE-122 — the app vocabulary still renders (no regression)', () => {
  // The change is purely additive; this is what proves it.
  it.each([
    ['draft', 'phase1'],
    ['planned', 'phase2'],
    ['implementing', 'phase2'],
    ['implemented', 'phase3'],
    ['qa_passed', 'phase3'],
    ['human_tested', 'phase4'],
    ['beta_cleared', 'phase5'],
    ['released', 'phase6'],
    ['deferred', 'deferred'],
  ])('%s still resolves to %s', (status, column) => {
    expect(resolveColumnId(status)).toBe(column);
  });
});

describe('SCOPE-122 — nothing may vanish (FR-002)', () => {
  it('an UNKNOWN status appears in exactly 1 column, never 0', () => {
    // The heart of it. Asserting "some column contains it" would not catch the original
    // bug; only counting does, because the failure was a card in ZERO columns.
    expect(columnsContaining('not_a_real_status')).toBe(1);
    expect(resolveColumnId('not_a_real_status')).toBe(FALLBACK_COLUMN_ID);
  });

  it('resolves every conceivable input to a real column or the hidden sentinel', () => {
    const inputs = ['', '   ', 'BETA', 'beta ', 'Released', 'null', 'undefined', '123'];
    for (const s of inputs) {
      const r = resolveColumnId(s);
      expect(r === HIDDEN_COLUMN || REAL_COLUMNS.includes(r)).toBe(true);
    }
  });

  it('never returns undefined for any known or unknown status', () => {
    const all = [...Object.keys(STATUS_TO_COLUMN), ...Object.keys(MCP_STATUS_TO_COLUMN), 'zzz'];
    for (const s of all) expect(resolveColumnId(s)).toBeDefined();
  });
});

describe('SCOPE-122 — archived is hidden BY INTENT, not by accident (FR-007)', () => {
  it('archived appears in 0 real columns', () => {
    expect(columnsContaining('archived')).toBe(0);
    expect(isHiddenStatus('archived')).toBe(true);
  });

  it('an unknown status is NOT hidden — the two paths are distinct', () => {
    // If these ever collapse into one behaviour, "hidden" has become "vanished" again.
    expect(isHiddenStatus('not_a_real_status')).toBe(false);
    expect(columnsContaining('not_a_real_status')).toBe(1);
  });
});

describe('SCOPE-122 — drift guard vs the MCP vocabulary (FR-005)', () => {
  const MCP_SCHEMA = join(process.cwd(), 'mcp-server', 'src', 'utils', 'schemas.ts');

  it('every status the MCP can write resolves to a board outcome', () => {
    // Read the MCP's enum off disk: mcp-server is a separate deployment and the app
    // cannot import from it. If the file moves, FAIL rather than silently skip — a
    // guard that quietly stops running is worse than no guard.
    expect(
      existsSync(MCP_SCHEMA),
      'mcp-server/src/utils/schemas.ts not found — update this drift guard',
    ).toBe(true);

    const src = readFileSync(MCP_SCHEMA, 'utf8');
    const block = /export const SpecStatusSchema = z\.enum\(\[([\s\S]*?)\]\);/.exec(src);
    expect(block, 'SpecStatusSchema not found — the MCP schema was restructured').not.toBeNull();

    const mcpStatuses = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(mcpStatuses.length).toBeGreaterThan(0);

    // Every MCP status must land somewhere deliberate: a real column, or hidden by an
    // explicit rule. The fallback does NOT count here — falling back means the board
    // does not actually know this status, which is the drift we are guarding against.
    const unaccounted = mcpStatuses.filter((s) => {
      const explicit = s in STATUS_TO_COLUMN || s in MCP_STATUS_TO_COLUMN;
      return !explicit;
    });
    expect(
      unaccounted,
      `MCP can write these statuses but the board has no explicit mapping: ${unaccounted.join(', ')}`,
    ).toEqual([]);
  });
});
