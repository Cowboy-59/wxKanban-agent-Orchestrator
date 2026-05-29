/**
 * Spec 042 / T011 + T015 + T031 — project resolution & linking.
 *
 * Mirrors the server's resolution precedence and the "not linked" rejections
 * that drive the cockpit's no-project state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveProjectContext } from '../src/services/projectContext';

const VALID_UUID = 'ba924193-0335-4080-9fa6-33cd6b81300a';

function makeProject(opts: { projectId?: string; mcpBaseUrl?: string; mcpHttpUrl?: string; mcpHttpPort?: number; activeScope?: string }): string {
  const root = mkdtempSync(join(tmpdir(), 'wxk-ctx-'));
  const wxk: Record<string, unknown> = {};
  if (opts.projectId !== undefined) wxk.projectId = opts.projectId;
  if (opts.mcpBaseUrl !== undefined) wxk.mcpBaseUrl = opts.mcpBaseUrl;
  if (opts.mcpHttpUrl !== undefined) wxk.mcpHttpUrl = opts.mcpHttpUrl;
  if (opts.mcpHttpPort !== undefined) wxk.mcpHttpPort = opts.mcpHttpPort;
  writeFileSync(join(root, '.wxkanban-project.json'), JSON.stringify(wxk));
  if (opts.activeScope !== undefined) {
    mkdirSync(join(root, '.wxai'), { recursive: true });
    writeFileSync(join(root, '.wxai', 'project.json'), JSON.stringify({ activeScope: opts.activeScope }));
  }
  return root;
}

const created: string[] = [];
function track(root: string): string {
  created.push(root);
  return root;
}

beforeEach(() => {
  created.length = 0;
});
afterEach(() => {
  for (const r of created) rmSync(r, { recursive: true, force: true });
});

describe('resolveProjectContext', () => {
  it('resolves a valid UUID project and reads active scope', () => {
    const root = track(makeProject({ projectId: VALID_UUID, mcpBaseUrl: 'https://mcp.wxperts.com', activeScope: '042' }));
    const ctx = resolveProjectContext([root]);
    expect(ctx).not.toBeNull();
    expect(ctx!.projectId).toBe(VALID_UUID);
    expect(ctx!.mcpBaseUrl).toBe('https://mcp.wxperts.com');
    expect(ctx!.activeScope).toBe('042');
  });

  it('reads the hosted endpoint from mcpBaseUrl (the key init.mjs writes — spec 028)', () => {
    const root = track(makeProject({ projectId: VALID_UUID, mcpBaseUrl: 'https://mcp.wxperts.com' }));
    expect(resolveProjectContext([root])!.mcpBaseUrl).toBe('https://mcp.wxperts.com');
  });

  it('mcpBaseUrl wins over legacy mcpHttpUrl/mcpHttpPort', () => {
    const root = track(makeProject({
      projectId: VALID_UUID,
      mcpBaseUrl: 'https://mcp.wxperts.com',
      mcpHttpUrl: 'http://localhost:3002',
      mcpHttpPort: 3004,
    }));
    expect(resolveProjectContext([root])!.mcpBaseUrl).toBe('https://mcp.wxperts.com');
  });

  it('falls back to legacy mcpHttpUrl when mcpBaseUrl absent (old project files)', () => {
    const root = track(makeProject({ projectId: VALID_UUID, mcpHttpUrl: 'http://localhost:3002' }));
    expect(resolveProjectContext([root])!.mcpBaseUrl).toBe('http://localhost:3002');
  });

  it('rejects the stale tools/ fixture (projectId test-project-123) as not linked', () => {
    const root = track(makeProject({ projectId: 'test-project-123' }));
    expect(resolveProjectContext([root])).toBeNull();
  });

  it('rejects a non-UUID projectId as not linked', () => {
    const root = track(makeProject({ projectId: 'not-a-uuid' }));
    expect(resolveProjectContext([root])).toBeNull();
  });

  it('returns null when no .wxkanban-project.json exists', () => {
    const empty = track(mkdtempSync(join(tmpdir(), 'wxk-empty-')));
    expect(resolveProjectContext([empty])).toBeNull();
  });

  it('derives mcpBaseUrl from mcpHttpPort when no explicit url', () => {
    const root = track(makeProject({ projectId: VALID_UUID, mcpHttpPort: 3010 }));
    expect(resolveProjectContext([root])!.mcpBaseUrl).toBe('http://localhost:3010');
  });

  it('multi-root: returns the first folder that carries a valid linked project', () => {
    const unlinked = track(mkdtempSync(join(tmpdir(), 'wxk-unlinked-')));
    const linked = track(makeProject({ projectId: VALID_UUID }));
    const ctx = resolveProjectContext([unlinked, linked]);
    expect(ctx!.projectRoot).toBe(linked);
  });
});
