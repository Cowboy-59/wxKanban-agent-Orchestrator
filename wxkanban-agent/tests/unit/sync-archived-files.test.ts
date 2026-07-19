// Spec 103 / T007 — reconcile on-disk spec/scope files to the DB archived status.
//
// Verifies syncArchivedFiles:
//   (a) moves a DB-archived group's files into specs/_archive/
//   (b) restores a group whose files are archived on disk but no longer archived in DB
//   (c) is a no-op when disk already matches the DB
//   (d) collects (never throws) when cockpit_summary is unreachable
//   (e) dry-run reports candidates without touching the filesystem

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const callMcpToolMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../core/orchestrator/mcp-client', () => ({
  callMcpTool: callMcpToolMock,
  callMcpToolWithEnvelope: vi.fn(),
  McpClientError: class McpClientError extends Error {},
}));

const { syncArchivedFiles } = await import('../../core/orchestrator/sync-archived-files');

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'wxk-arch-sync-'));
}

function seedLive(root: string, specNumber: string, slug: string): void {
  const scopeDir = join(root, 'specs', 'Project-Scope');
  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(join(scopeDir, `${specNumber}-${slug}.md`), `# Scope ${specNumber}\n`);
  const specDir = join(root, 'specs', `${specNumber}-${slug}`);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'spec.md'), `# Spec ${specNumber}\n`);
}

function seedArchived(root: string, specNumber: string, slug: string): void {
  const scopeDir = join(root, 'specs', '_archive', 'Project-Scope');
  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(join(scopeDir, `${specNumber}-${slug}.md`), `# Scope ${specNumber}\n`);
  const specDir = join(root, 'specs', '_archive', `${specNumber}-${slug}`);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'spec.md'), `# Spec ${specNumber}\n`);
}

function mockArchived(nums: string[]): void {
  callMcpToolMock.mockImplementation(async (...args: unknown[]) => {
    if ((args[0] as string) === 'project.cockpit_summary') return { archivedSpecNumbers: nums };
    return {};
  });
}

describe('syncArchivedFiles', () => {
  beforeEach(() => callMcpToolMock.mockReset());

  it('archives a DB-archived group whose files are still live', async () => {
    const root = makeRoot();
    seedLive(root, '103', 'archive-scope');
    mockArchived(['103']);

    const res = await syncArchivedFiles({ projectId: 'p1', projectRoot: root });

    expect(res.archived).toEqual(['103']);
    expect(res.unarchived).toEqual([]);
    expect(res.errors).toEqual([]);
    expect(existsSync(join(root, 'specs', 'Project-Scope', '103-archive-scope.md'))).toBe(false);
    expect(existsSync(join(root, 'specs', '_archive', 'Project-Scope', '103-archive-scope.md'))).toBe(true);
    expect(existsSync(join(root, 'specs', '_archive', '103-archive-scope', 'spec.md'))).toBe(true);
  });

  it('restores a group archived on disk but no longer archived in the DB', async () => {
    const root = makeRoot();
    seedArchived(root, '103', 'archive-scope');
    mockArchived([]); // DB says nothing is archived → the on-disk one was restored

    const res = await syncArchivedFiles({ projectId: 'p1', projectRoot: root });

    expect(res.unarchived).toEqual(['103']);
    expect(res.archived).toEqual([]);
    expect(existsSync(join(root, 'specs', 'Project-Scope', '103-archive-scope.md'))).toBe(true);
    expect(existsSync(join(root, 'specs', '_archive', '103-archive-scope'))).toBe(false);
  });

  it('is a no-op when the disk already matches the DB', async () => {
    const root = makeRoot();
    seedArchived(root, '103', 'archive-scope'); // already archived on disk
    mockArchived(['103']); // DB agrees it is archived

    const res = await syncArchivedFiles({ projectId: 'p1', projectRoot: root });

    expect(res.archived).toEqual([]);
    expect(res.unarchived).toEqual([]);
    expect(res.errors).toEqual([]);
  });

  it('collects (never throws) when cockpit_summary is unreachable', async () => {
    const root = makeRoot();
    seedLive(root, '103', 'archive-scope');
    callMcpToolMock.mockImplementationOnce(async () => {
      throw new Error('MCP down');
    });

    const res = await syncArchivedFiles({ projectId: 'p1', projectRoot: root });

    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toContain('cockpit_summary');
    // Files untouched.
    expect(existsSync(join(root, 'specs', 'Project-Scope', '103-archive-scope.md'))).toBe(true);
  });

  it('dry-run reports candidates without moving files', async () => {
    const root = makeRoot();
    seedLive(root, '103', 'archive-scope');
    mockArchived(['103']);

    const res = await syncArchivedFiles({ projectId: 'p1', projectRoot: root, dryRun: true });

    expect(res.archived).toEqual(['103']);
    // Nothing actually moved.
    expect(existsSync(join(root, 'specs', 'Project-Scope', '103-archive-scope.md'))).toBe(true);
    expect(existsSync(join(root, 'specs', '_archive'))).toBe(false);
  });
});
