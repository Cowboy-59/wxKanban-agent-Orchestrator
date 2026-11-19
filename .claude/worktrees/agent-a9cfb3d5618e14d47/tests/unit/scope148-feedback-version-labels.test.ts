// [SCOPE 148 / T007] The report body names each version for what it is (SPEC-148 FR-014).
//
// `extensionversion` is the Dev Cockpit's version; the old line called it "kit", so a reader
// deciding whether a kit fix had shipped to this submitter was reading the wrong number.
import { describe, it, expect, vi } from 'vitest';

// Importing the service must never reach a real database.
vi.mock('../../src/db/client.js', () => ({ db: {} }));

import { buildSeedBody } from '../../src/server/services/FeedbackTriageService.js';

const line = (context: Record<string, unknown>) =>
  buildSeedBody({ paste: 'Export does nothing' }, context).split('\n\n').pop();

describe('buildSeedBody — the "Reported from" line', () => {
  it('labels the Cockpit version as Cockpit and the kit version as kit', () => {
    expect(line({ extensionversion: '0.2.45', kitversion: '1.7.84', vscodeversion: '1.95.0', os: 'win32 10' })).toBe(
      '_Reported from: Cockpit 0.2.45 · kit 1.7.84 · VS Code 1.95.0 · win32 10_',
    );
  });

  it('never calls the Cockpit version "kit" when no kit version was recorded', () => {
    const l = line({ extensionversion: '0.2.45', os: 'win32 10' });
    expect(l).toBe('_Reported from: Cockpit 0.2.45 · win32 10_');
    expect(l).not.toContain('kit');
  });
});
