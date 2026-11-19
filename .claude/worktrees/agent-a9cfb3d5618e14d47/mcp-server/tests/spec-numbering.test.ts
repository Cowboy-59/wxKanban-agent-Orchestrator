/**
 * SCOPE-089 — per-project scope numbering.
 *
 * The next scope number MUST be counted from THIS project's own specs in the DB,
 * not the server filesystem. Regression guard for the bug where every new project
 * got "092" because generateNextSpecNumber read the hosted server's baked-in
 * wxKanban scopes (up to 091) instead of the calling project's rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rows: { specNumber: string }[] = [];

vi.mock('../src/db/connection.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
  },
  pool: {},
}));
vi.mock('../src/db/schema.js', () => ({
  projectspecifications: { projectId: 'projectid', specNumber: 'specnumber' },
}));
vi.mock('../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), audit: vi.fn() },
}));

import { generateNextSpecNumber } from '../src/utils/project-kit.js';

const PROJECT = 'caec1280-6dda-43a6-a0e1-10a21ccb8045';

beforeEach(() => {
  rows = [];
});

describe('SCOPE-089 generateNextSpecNumber — per-project DB numbering', () => {
  it('returns 001 for a fresh project with no specs (was wrongly 092)', async () => {
    rows = [];
    expect(await generateNextSpecNumber(PROJECT)).toBe('001');
  });

  it('counts from THIS project only — max(existing)+1', async () => {
    rows = [{ specNumber: '001' }, { specNumber: '002' }, { specNumber: '003' }];
    expect(await generateNextSpecNumber(PROJECT)).toBe('004');
  });

  it('ignores gaps and non-numeric rows, taking the true max', async () => {
    rows = [{ specNumber: '001' }, { specNumber: '007' }, { specNumber: 'main' }];
    expect(await generateNextSpecNumber(PROJECT)).toBe('008');
  });

  it('zero-pads to three digits', async () => {
    rows = [{ specNumber: '099' }];
    expect(await generateNextSpecNumber(PROJECT)).toBe('100');
  });
});
