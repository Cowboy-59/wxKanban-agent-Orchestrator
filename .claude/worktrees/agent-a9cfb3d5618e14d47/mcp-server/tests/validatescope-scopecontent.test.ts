/**
 * SCOPE-124 / T019 (FR-001) — a scope can be validated before it is pushed.
 *
 * T018 closed the filesystem routes for a project-scoped caller, and must stay closed: on the
 * hosted MCP `resolveWorkspaceRoot()` is the wxKanban repository, so reading a caller-supplied path
 * scored another tenant's document. But it left a real gap — buildscope writes the scope file on
 * the CLIENT, so between buildscope and create_specs the document exists only on the caller's disk.
 * `filePath` looked like the way to validate it and was inert (field report 287f076a).
 *
 * `scopeContent` is the route that works without a filesystem: the caller reads their own file and
 * sends the text. These tests prove three things together — that the pre-push case now answers,
 * that the caller's document is what gets scored, and that none of this reopens T018.
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

/** A complete scope — the shape a caller sends after buildscope has written it locally. */
const GOOD_DRAFT = [
  '# Spec 007: Shift Handover Notes',
  '',
  '## Overview',
  'Outgoing crews record what the incoming crew needs to know before the machines change hands.',
  '',
  '## Business Problem',
  'Handover happens verbally at a noisy shift change, so warnings are lost and the same fault is',
  'diagnosed twice on consecutive shifts.',
  '',
  '## Actors',
  '',
  '- Primary: A shift supervisor writing and reading handover notes',
  '- Secondary: The plant manager, who reviews recurring faults across shifts',
  '',
  '## Success Metrics',
  '',
  '1. 95% of shift changes have a written handover within 10 minutes of the change',
  '2. Repeat diagnosis of the same fault drops by 60%',
  '3. A supervisor finds the previous shift note in under 15 seconds',
  '',
  '## Scope Boundary',
  'Include writing, reading, and searching handover notes for a single plant.',
  '',
  '## Out of Scope',
  'Exclude cross-plant reporting and any change to the maintenance work-order system.',
  '',
  '## Open Questions',
  '',
  '1. None outstanding.',
  '',
].join('\n');

/** The same scope with its Actors and Success Metrics still unwritten — a draft that must fail. */
const WEAK_DRAFT = [
  '# Spec 007: Shift Handover Notes',
  '',
  '## Overview',
  'Outgoing crews record what the incoming crew needs to know before the machines change hands.',
  '',
  '## Business Problem',
  'Handover happens verbally at a noisy shift change, so warnings are lost.',
  '',
  '## Actors',
  '',
  '## Success Metrics',
  '',
  '## Scope Boundary',
  '',
  '## Out of Scope',
  '',
  '## Open Questions',
  '',
].join('\n');

let workspace: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workspace = mkdtempSync(join(tmpdir(), 'wxk-t019-'));
  // Make it look like a real workspace root so resolveWorkspaceRoot() anchors here, exactly as the
  // T018 fixture does. The file below is the server's own — it must never be scored for a consumer.
  writeFileSync(join(workspace, '.wxkanban-project.json'), JSON.stringify({ projectId: 'server-own' }));
  const scopeDir = join(workspace, 'specs', 'Project-Scope');
  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(join(scopeDir, '007-server-owned.md'), GOOD_DRAFT);
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

describe('SCOPE-124 T019 — validating a scope that is not in the database yet', () => {
  it('scores a supplied document for a project-scoped caller with no stored record', async () => {
    // The reported case: buildscope has written 007 locally, nothing has been pushed.
    dbRows = [];

    const result = await validateScope({
      specNumber: '007',
      scopeContent: GOOD_DRAFT,
      projectId: CONSUMER_PROJECT,
    });

    expect(result.status).toBe('valid');
    expect(result.isValid).toBe(true);
    expect(result.checks.hasActors).toBe(true);
    expect(result.checks.hasSuccessMetrics).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('reports the real blocking issues in a weak draft rather than refusing to look', async () => {
    dbRows = [];

    const result = await validateScope({
      specNumber: '007',
      scopeContent: WEAK_DRAFT,
      projectId: CONSUMER_PROJECT,
    });

    expect(result.isValid).toBe(false);
    expect(result.checks.hasActors).toBe(false);
    // `checks.hasSuccessMetrics` only asks whether the heading is there, and in this draft it is —
    // empty. The measurable-metrics criterion is the one that judges what is under it.
    expect(result.checks.hasSuccessMetrics).toBe(true);
    expect(result.minimumCriteriaStatus.measurableSuccessMetrics).toBe(false);
    // 'error' means "could not find it"; a draft that was read and failed is 'invalid'.
    expect(result.status).toBe('invalid');
    expect(result.blockingIssues.length).toBeGreaterThan(0);
  });

  it('scores the supplied draft, not the copy already stored for the project', async () => {
    // A caller sending a document is asking about THAT document — normally a draft newer than the
    // record. If the stored copy won, editing then validating would report the pre-edit verdict.
    dbRows = [{ content: GOOD_DRAFT, specnumber: '007' }];

    const result = await validateScope({
      specNumber: '007',
      scopeContent: WEAK_DRAFT,
      projectId: CONSUMER_PROJECT,
    });

    expect(result.isValid).toBe(false);
    expect(result.checks.hasActors).toBe(false);
  });

  it('does not read filePath even when scopeContent is present', async () => {
    // T019 must not become a way back into T018. The path names a well-formed document in the
    // server's own workspace; the content sent is the weak draft. A verdict of 'valid' here would
    // mean the file had been opened.
    dbRows = [];

    const result = await validateScope({
      specNumber: '007',
      scopeContent: WEAK_DRAFT,
      filePath: 'specs/Project-Scope/007-server-owned.md',
      projectId: CONSUMER_PROJECT,
    });

    expect(result.isValid).toBe(false);
    expect(result.checks.hasActors).toBe(false);
  });

  it('echoes filePath as a label so several drafts can be told apart', async () => {
    dbRows = [];

    const result = await validateScope({
      scopeContent: GOOD_DRAFT,
      filePath: 'specs/Project-Scope/007-shift-handover.md',
      projectId: CONSUMER_PROJECT,
    });

    expect(result.filePath).toBe('specs/Project-Scope/007-shift-handover.md');
    expect(result.status).toBe('valid');
  });

  it('says the content was supplied when there is no label to echo', async () => {
    // Without this the result would carry `specs/Project-Scope/unknown-*.md`, which reads as a
    // path the server looked at.
    dbRows = [];

    const result = await validateScope({
      scopeContent: GOOD_DRAFT,
      projectId: CONSUMER_PROJECT,
    });

    expect(result.filePath).toBe('(scopeContent supplied by caller)');
  });

  it('tells a caller with nothing to validate that scopeContent is the pre-push route', async () => {
    // The T018 wording named pushing as the only remedy, so a caller who had passed filePath was
    // sent to create_specs purely to get a verdict.
    dbRows = [];

    const result = await validateScope({
      specNumber: '007',
      filePath: 'specs/Project-Scope/007-server-owned.md',
      projectId: CONSUMER_PROJECT,
    });

    expect(result.status).toBe('error');
    expect(result.score).toBe(0);
    const advice = result.blockingIssues.join(' ');
    expect(advice).toContain('scopeContent');
    expect(advice).toContain('filePath is not read here');
  });
});
