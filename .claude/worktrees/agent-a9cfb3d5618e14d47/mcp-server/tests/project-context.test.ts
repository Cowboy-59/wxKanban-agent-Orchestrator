/**
 * SCOPE-097 / T007 — resolveProjectContext precedence.
 *
 * FR-001: the authenticated token's project is the authoritative default when a
 * project-scoped call omits projectId — ranked above the WXKANBAN_PROJECT_ID env
 * var and the .wxkanban-project.json file, and below an explicit args projectId.
 * FR-004: a token-resolved project reports source 'token'.
 *
 * DB-free: resolveProjectContext is a pure function. File resolution is exercised
 * indirectly via an isolated cwd that has no project file up-tree, so the env/
 * token/args precedence is deterministic.
 */
import { describe, it, expect } from 'vitest';
import { resolveProjectContext } from '../src/utils/project-context.js';

const ARGS_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';
const ENV_ID = '33333333-3333-4333-8333-333333333333';

// A cwd with no .wxkanban-project.json anywhere up to the drive root, so file
// resolution never fires and the precedence under test is isolated.
const NO_FILE_CWD = '/__wx097_no_project_dir__';

describe('resolveProjectContext precedence (SCOPE-097)', () => {
  it('explicit args projectId wins over token, env, and file', () => {
    const r = resolveProjectContext(
      { projectId: ARGS_ID },
      { tokenProjectId: TOKEN_ID, env: { WXKANBAN_PROJECT_ID: ENV_ID }, cwd: NO_FILE_CWD },
    );
    expect(r).toEqual({ projectId: ARGS_ID, source: 'args' });
  });

  it("uses the token's project when args omit projectId (above env)", () => {
    const r = resolveProjectContext(
      {},
      { tokenProjectId: TOKEN_ID, env: { WXKANBAN_PROJECT_ID: ENV_ID }, cwd: NO_FILE_CWD },
    );
    expect(r).toEqual({ projectId: TOKEN_ID, source: 'token' });
  });

  it('falls through to env when there is no token (dev-bypass / local)', () => {
    const r = resolveProjectContext(
      undefined,
      { env: { WXKANBAN_PROJECT_ID: ENV_ID }, cwd: NO_FILE_CWD },
    );
    expect(r).toEqual({ projectId: ENV_ID, source: 'env' });
  });

  it('ignores a non-uuid token and continues down the chain', () => {
    const r = resolveProjectContext(
      undefined,
      { tokenProjectId: 'not-a-uuid', env: { WXKANBAN_PROJECT_ID: ENV_ID }, cwd: NO_FILE_CWD },
    );
    expect(r).toEqual({ projectId: ENV_ID, source: 'env' });
  });

  it('resolves to none when nothing supplies a project', () => {
    const r = resolveProjectContext(undefined, { env: {}, cwd: NO_FILE_CWD });
    expect(r.source).toBe('none');
    expect(r.projectId).toBeUndefined();
  });
});
