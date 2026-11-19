/**
 * SCOPE-124 / T018 (FR-001) — with a projectId, the database is the only source.
 *
 * `validateScope` carried the same filesystem fallback T001 removed from the edit path.
 * `resolveWorkspaceRoot()` on the hosted MCP is the wxKanban repository, so a consumer validating
 * their spec 016 fell through to `readdirSync` and had OUR `016-scope-help.md` scored instead —
 * they were told their scope passed, or which issues to fix, on the strength of another tenant's
 * document. The `filePath` branch went further: caller-supplied, unconstrained, `isAbsolute`
 * honoured.
 *
 * These tests drive the real filesystem: a scope file IS present in the server's workspace, and the
 * project-scoped call must refuse to read it anyway. A test that passes because the file is missing
 * would prove nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let dbRows: Array<{ content: string; specnumber: string }> = [];

vi.mock('../src/db/connection.js', () => ({
  db: {
    execute: () => Promise.resolve({ rows: dbRows }),
  },
  pool: {},
}));
vi.mock('../src/db/schema.js', () => ({
  projectspecifications: {
    projectId: 'projectid',
    specNumber: 'specnumber',
    title: 'title',
    content: 'content',
  },
}));
vi.mock('../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), audit: vi.fn() },
}));

import { validateScope } from '../src/utils/project-kit.js';

const CONSUMER_PROJECT = 'caec1280-6dda-43a6-a0e1-10a21ccb8045';

// [SCOPE 124 / T018] BEGIN — server-workspace fixture
/** A scope good enough to score well, standing in for the server's own 016-scope-help.md. */
const SERVER_OWNED_SCOPE = [
  '# Spec 016: wxKanban Online Help',
  '',
  '## Overview',
  'The help system gives every screen a written explanation so users stop guessing.',
  '',
  '## Business Problem',
  'Users cannot discover what a screen does, and support answers the same questions repeatedly.',
  '',
  '## Actors',
  '',
  '- Primary: An end user reading help while working',
  '- Secondary: Support staff, who answer fewer repeat questions',
  '',
  '## Success Metrics',
  '',
  '1. 90% of screens carry help content',
  '2. Support tickets asking "what does this do" drop by 50%',
  '3. Help loads in under 2 seconds',
  '',
  '## Scope Boundary',
  'Include per-screen help pages and a searchable index.',
  '',
  '## Out of Scope',
  'Exclude video tutorials and localisation beyond English.',
  '',
  '## Open Questions',
  '',
  '1. None outstanding.',
  '',
].join('\n');

let workspace: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workspace = mkdtempSync(join(tmpdir(), 'wxk-t018-'));
  // Make it look like a real workspace root so resolveWorkspaceRoot() anchors here.
  writeFileSync(join(workspace, '.wxkanban-project.json'), JSON.stringify({ projectId: 'server-own' }));
  const scopeDir = join(workspace, 'specs', 'Project-Scope');
  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(join(scopeDir, '016-scope-help.md'), SERVER_OWNED_SCOPE);
  writeFileSync(join(workspace, 'secret.md'), '# not a scope, and not yours');
  process.chdir(workspace);
  dbRows = [];
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch {
    // Windows keeps temp handles open briefly; a locked temp dir is not a test failure.
  }
});
// [SCOPE 124 / T018] END

describe('SCOPE-124 T018 — a project-scoped caller never reads the server filesystem', () => {
  it('refuses to fall back to the server workspace when the spec is not in the project', async () => {
    dbRows = []; // this consumer has no spec 016

    const result = await validateScope({ specNumber: '016', projectId: CONSUMER_PROJECT });

    // Before the fix this returned status 'valid' with a high score — computed from OUR document.
    expect(result.status).toBe('error');
    expect(result.isValid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.blockingIssues.join(' ')).toContain("not in this project's records");
    // Nothing derived from the server-owned file leaked into the verdict.
    expect(result.checks.hasBusinessProblem).toBe(false);
    expect(result.checks.hasActors).toBe(false);
  });

  it('answers from the project\'s own record when there is one', async () => {
    dbRows = [{ content: SERVER_OWNED_SCOPE, specnumber: '016' }];

    const result = await validateScope({ specNumber: '016', projectId: CONSUMER_PROJECT });

    expect(result.status).toBe('valid');
    expect(result.checks.hasActors).toBe(true);
  });

  it('ignores a caller-supplied filePath when a projectId is present', async () => {
    dbRows = [];

    const result = await validateScope({
      specNumber: '016',
      filePath: 'specs/Project-Scope/016-scope-help.md',
      projectId: CONSUMER_PROJECT,
    });

    expect(result.status).toBe('error');
    expect(result.score).toBe(0);
  });

  it('ignores an absolute filePath pointing outside the scope directory', async () => {
    dbRows = [];

    const result = await validateScope({
      filePath: join(workspace, 'secret.md'),
      projectId: CONSUMER_PROJECT,
    });

    expect(result.status).toBe('error');
    expect(result.score).toBe(0);
  });

  it('still reads the local file for the kit-author path, where there is no projectId', async () => {
    // The fallback is not deleted — with no projectId there is no tenant to confuse, and this is
    // how the kit author validates a scope they have written but not yet pushed.
    const result = await validateScope({ specNumber: '016' });

    expect(result.status).toBe('valid');
    expect(result.filePath).toBe('specs/Project-Scope/016-scope-help.md');
    expect(result.checks.hasActors).toBe(true);
  });

  it('still reads an explicit filePath for the kit-author path', async () => {
    const result = await validateScope({ filePath: 'specs/Project-Scope/016-scope-help.md' });

    expect(result.status).toBe('valid');
  });
});
