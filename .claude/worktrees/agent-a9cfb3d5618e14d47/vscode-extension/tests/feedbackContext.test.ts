// [SCOPE 148 / T007] Cockpit-filed reports record the kit version (SPEC-148 FR-014).
//
// Before this, a report carried only the Cockpit's own version, so "was this filed before
// the kit fix shipped?" had no answer and the server's recurrence guard had nothing to read.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// What captureContext reads that the shared stub does not carry: the Cockpit's own version
// and VS Code's. Added here rather than to tests/stubs/vscode.ts so no other test changes.
vi.mock('vscode', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  extensions: { getExtension: () => ({ packageJSON: { version: '0.2.45' } }) },
  version: '1.95.0',
}));

import { captureContext } from '../src/commands/feedback.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-feedbackctx-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ctx = (root: string) => ({ projectRoot: root, projectId: 'p', mcpBaseUrl: 'https://mcp.example' });

describe('captureContext — kitversion beside the Cockpit version', () => {
  it('records the kit version from the project config, as the update check reads it', () => {
    fs.writeFileSync(path.join(tmp, '.wxkanban-project.json'), JSON.stringify({ projectId: 'p', kitVersion: '1.7.84' }));
    const c = captureContext(ctx(tmp));
    expect(c.kitversion).toBe('1.7.84');
    expect(c.extensionversion).toBe('0.2.45');
  });

  it('falls back to `version` when the config has no kitVersion', () => {
    fs.writeFileSync(path.join(tmp, '.wxkanban-project.json'), JSON.stringify({ projectId: 'p', version: '1.7.80' }));
    expect(captureContext(ctx(tmp)).kitversion).toBe('1.7.80');
  });

  it('records null, not a guess, when the project has no kit config', () => {
    expect(captureContext(ctx(tmp)).kitversion).toBeNull();
  });
});
