/**
 * SCOPE-154 / T014 (FR-014) — Cockpit live view of the running scope and process, the rules
 * that do not need VS Code: parsing the local run-state file into the view the Autopilot tree
 * shows. Pins: a missing/unparseable file reads as "not running"; a present file is "running"
 * even with nothing in it yet; units/skips/startupList merge into one list keyed by scope; and
 * elapsed time is derived from `stepStartedAt`, never stored.
 */
import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  statusLabel,
  toAutopilotView,
  type AutopilotRunStateFile,
} from '../src/services/autopilotRunState';

// [SCOPE 154 / T014] BEGIN — Autopilot run-state view model tests
describe('toAutopilotView', () => {
  it('reports not running when there is no state at all', () => {
    const view = toAutopilotView(null);
    expect(view.running).toBe(false);
    expect(view.items).toEqual([]);
    expect(view.currentScope).toBeNull();
  });

  it('is running once the file exists, even with nothing in it yet', () => {
    const view = toAutopilotView({});
    expect(view.running).toBe(true);
    expect(view.currentScope).toBeNull();
    expect(view.currentStep).toBeNull();
    expect(view.elapsedMs).toBeNull();
  });

  it('merges startupList, skips, and units into one list keyed by scope', () => {
    const state: AutopilotRunStateFile = {
      startupList: [{ scope: '160', title: 'New feature', status: 'waiting' }],
      skips: [{ scope: '161', title: 'Skipped thing', status: 'skipped' }],
      units: [{ scope: '162', title: 'Done thing', status: 'done' }],
    };
    const view = toAutopilotView(state);
    expect(view.items.map((i) => i.scope).sort()).toEqual(['160', '161', '162']);
    expect(view.items.find((i) => i.scope === '162')?.status).toBe('done');
    expect(view.items.find((i) => i.scope === '161')?.status).toBe('skipped');
  });

  it('a unit record overrides an earlier startupList entry for the same scope', () => {
    const state: AutopilotRunStateFile = {
      startupList: [{ scope: '160', title: 'New feature', status: 'waiting' }],
      units: [{ scope: '160', title: 'New feature', status: 'failed' }],
    };
    const view = toAutopilotView(state);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].status).toBe('failed');
  });

  it('derives elapsed time from stepStartedAt rather than storing it', () => {
    const now = Date.parse('2026-11-08T12:10:00.000Z');
    const state: AutopilotRunStateFile = {
      currentScope: '163',
      currentStep: 'implement',
      stepStartedAt: '2026-11-08T12:00:00.000Z',
    };
    const view = toAutopilotView(state, now);
    expect(view.currentScope).toBe('163');
    expect(view.currentStep).toBe('implement');
    expect(view.elapsedMs).toBe(10 * 60 * 1000);
  });

  it('adds the current scope to the list even when it is not otherwise listed', () => {
    const view = toAutopilotView({ currentScope: '170' });
    expect(view.items.find((i) => i.scope === '170')?.status).toBe('in-progress');
  });
});

describe('formatElapsed', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatElapsed(42_000)).toBe('42s');
    expect(formatElapsed(12 * 60_000 + 5_000)).toBe('12m 05s');
    expect(formatElapsed(3 * 3_600_000 + 5 * 60_000)).toBe('3h 05m');
  });
});

describe('statusLabel', () => {
  it('labels every status', () => {
    expect(statusLabel('done')).toBe('done');
    expect(statusLabel('failed')).toBe('failed');
    expect(statusLabel('in-progress')).toBe('in progress');
    expect(statusLabel('waiting')).toBe('waiting');
  });
});
// [SCOPE 154 / T014] END
