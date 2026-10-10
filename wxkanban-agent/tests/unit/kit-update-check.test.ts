// [SCOPE 083 Amendment A / FR-006 + FR-007] Regression coverage for field report
// b54b281e: the session-start kit check reported "no update" when it had in fact
// never run, and disabled itself entirely in any consumer with untracked files
// under the kit paths.
//
// These tests drive the real module against real temp directories and real git
// repositories — no mocking of fs or child_process. The defect they cover was
// invisible to a typecheck and to any test that ran in the author repo, so the
// consumer shape is constructed explicitly.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

interface CacheShape {
  checkedAt: number;
  upgradeAvailable: boolean;
  authorRepo: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  outcome: string;
  lastError: string | null;
}

let tmp: string;
let cwdBefore: string;

function makeTemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kit-update-check-'));
}

/** A project the kit would recognize as an install (has a projectId). */
function writeProjectConfig(root: string): void {
  fs.writeFileSync(
    path.join(root, '.wxkanban-project.json'),
    JSON.stringify({ projectId: 'ba924193-0335-4080-9fa6-33cd6b81300a' }),
  );
}

/** The author-only marker: scripts/ is never mirrored to the orchestrator. */
function writeAuthorMarker(root: string): void {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'sync-to-orchestrator.mjs'), '// author only\n');
}

/**
 * The exact consumer shape that produced the field defect: a git repo whose
 * working tree is dirty under the kit paths purely because the kit's own
 * dependencies are installed there and nothing gitignores them.
 */
function makeDirtyConsumerRepo(root: string): void {
  spawnSync('git', ['init', '-q'], { cwd: root, windowsHide: true });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, windowsHide: true });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root, windowsHide: true });
  fs.mkdirSync(path.join(root, 'wxkanban-agent', 'node_modules', 'left-pad'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'wxkanban-agent', 'node_modules', 'left-pad', 'index.js'),
    'module.exports = 1;\n',
  );
  fs.mkdirSync(path.join(root, 'mcp-server', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'mcp-server', 'dist', 'server.js'), '// built\n');
}

function readCache(root: string): CacheShape {
  return JSON.parse(
    fs.readFileSync(path.join(root, '.wxai', 'kit-update-check.json'), 'utf8'),
  ) as CacheShape;
}

/** Fresh module each time — ensureKitUpToDate is once-per-process by design. */
async function freshEnsure(): Promise<() => void> {
  vi.resetModules();
  const mod = await import('../../core/orchestrator/kit-update-check.js');
  return mod.ensureKitUpToDate;
}

beforeEach(() => {
  tmp = makeTemp();
  cwdBefore = process.cwd();
  process.chdir(tmp);
  delete process.env['WXKANBAN_NO_KIT_UPDATE_CHECK'];
  delete process.env['WXKANBAN_API_TOKEN'];
});

afterEach(() => {
  process.chdir(cwdBefore);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('isAuthorCheckout — FR-007', () => {
  it('treats the marker file as the author repo', async () => {
    writeProjectConfig(tmp);
    writeAuthorMarker(tmp);

    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();

    const cache = readCache(tmp);
    expect(cache.authorRepo).toBe(true);
    expect(cache.outcome).toBe('author-repo');
  });

  it('does NOT treat a consumer with untracked kit files as the author repo', async () => {
    // THE FIELD DEFECT. Pre-amendment, `git status --porcelain -- wxkanban-agent
    // mcp-server _wxAI` returned lines for the untracked node_modules/ and dist/
    // below, so this repo was classified as the kit author and the check never
    // ran. No marker file is present, so the correct answer is "consumer".
    writeProjectConfig(tmp);
    makeDirtyConsumerRepo(tmp);

    // Assert the precondition the old heuristic keyed on is genuinely present,
    // so this test cannot silently pass by failing to reproduce the setup.
    const porcelain = spawnSync(
      'git',
      ['status', '--porcelain', '--', 'wxkanban-agent', 'mcp-server', '_wxAI'],
      { cwd: tmp, encoding: 'utf8', windowsHide: true },
    );
    expect(porcelain.stdout.trim().length).toBeGreaterThan(0);

    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();
    await new Promise((r) => setTimeout(r, 50));

    const cache = readCache(tmp);
    expect(cache.authorRepo).toBe(false);
    expect(cache.outcome).not.toBe('author-repo');
  });

  it('does not require a git repository at all', async () => {
    // No `git init` here. The old heuristic shelled out to git on every session
    // start; the marker check has no such dependency.
    writeProjectConfig(tmp);
    writeAuthorMarker(tmp);

    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();

    expect(readCache(tmp).outcome).toBe('author-repo');
  });
});

describe('check outcome — FR-006', () => {
  it('records a missing token as a failed check, not as "no update"', async () => {
    // Pre-amendment this returned without writing anything at all, so the
    // Cockpit had no state to show and the network path re-ran every session.
    writeProjectConfig(tmp);
    makeDirtyConsumerRepo(tmp);

    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();
    await new Promise((r) => setTimeout(r, 50));

    const cache = readCache(tmp);
    expect(cache.outcome).toBe('failed');
    expect(cache.lastError).toMatch(/token/i);
    expect(cache.upgradeAvailable).toBe(false);
  });

  it('records an unreachable server as failed, distinguishably from up-to-date', async () => {
    writeProjectConfig(tmp);
    // Point at a port nothing is listening on so the request genuinely fails.
    fs.writeFileSync(
      path.join(tmp, '.env'),
      'WXKANBAN_API_URL=http://127.0.0.1:1\nWXKANBAN_API_TOKEN=test-token\n',
    );

    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();
    await new Promise((r) => setTimeout(r, 500));

    const cache = readCache(tmp);
    expect(cache.outcome).toBe('failed');
    expect(cache.lastError).toBeTruthy();
    expect(cache.currentVersion).toBeNull();
    expect(cache.latestVersion).toBeNull();

    // The whole point: this record and a genuine "you are current" record are
    // no longer the same bytes. Everything else about them still matches.
    expect(cache.upgradeAvailable).toBe(false);
    expect(cache.authorRepo).toBe(false);
  });

  it('writes nothing when the folder is not a kit install', async () => {
    // No .wxkanban-project.json. That is "not a kit", not "a check that failed",
    // and it must stay a silent no-op.
    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();
    await new Promise((r) => setTimeout(r, 50));

    expect(fs.existsSync(path.join(tmp, '.wxai', 'kit-update-check.json'))).toBe(false);
  });

  it('honors the opt-out env var', async () => {
    writeProjectConfig(tmp);
    process.env['WXKANBAN_NO_KIT_UPDATE_CHECK'] = '1';

    const ensureKitUpToDate = await freshEnsure();
    ensureKitUpToDate();
    await new Promise((r) => setTimeout(r, 50));

    expect(fs.existsSync(path.join(tmp, '.wxai', 'kit-update-check.json'))).toBe(false);
  });
});

// [SCOPE 083 Amendment B / FR-011] Field reports 6d76a9fb + 83738c5e + ecacc0c6: the server
// kept answering currentVersion 1.7.61 / upgradeAvailable true after a real upgrade to
// 1.7.74, the check trusted it, and the Cockpit re-ran the upgrade every start. A stock
// consumer never even got that far — the check defaulted to http://localhost:3001.
describe('local version decides — FR-011', () => {
  let server: http.Server;
  let hits: number;
  let baseUrl: string;
  // Exactly what production returned for the reporting project.
  const staleServerAnswer = {
    currentVersion: '1.7.61',
    latestVersion: 'v1.7.74',
    upgradeAvailable: true,
    releaseUrl: 'https://example.invalid/v1.7.74',
    publishedAt: null,
  };

  beforeEach(async () => {
    hits = 0;
    server = http.createServer((_req, res) => {
      hits++;
      res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify(staleServerAnswer));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  function writeConfig(extra: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(tmp, '.wxkanban-project.json'),
      JSON.stringify({ projectId: 'a899b6e4-e528-4390-b02e-ed490b3337ee', ...extra }),
    );
  }
  async function waitForCache(): Promise<CacheShape> {
    const file = path.join(tmp, '.wxai', 'kit-update-check.json');
    for (let i = 0; i < 40 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 50));
    return readCache(tmp);
  }

  it('is current when the local kit already has the latest, whatever the server recorded', async () => {
    writeConfig({ kitVersion: '1.7.74' });
    fs.writeFileSync(path.join(tmp, '.env'), `WXKANBAN_API_URL=${baseUrl}\nWXKANBAN_API_TOKEN=t\n`);

    (await freshEnsure())();
    const cache = await waitForCache();

    expect(cache.outcome).toBe('checked');
    expect(cache.upgradeAvailable).toBe(false);
    expect(cache.currentVersion).toBe('1.7.74');
    expect(cache.latestVersion).toBe('v1.7.74');
  });

  it('still reports an upgrade when the local kit is genuinely behind', async () => {
    writeConfig({ kitVersion: '1.7.70' });
    fs.writeFileSync(path.join(tmp, '.env'), `WXKANBAN_API_URL=${baseUrl}\nWXKANBAN_API_TOKEN=t\n`);

    (await freshEnsure())();
    const cache = await waitForCache();

    expect(cache.upgradeAvailable).toBe(true);
    expect(cache.currentVersion).toBe('1.7.70');
  });

  it('falls back to wxkanbanApiUrl from .wxkanban-project.json when no env var names the API', async () => {
    writeConfig({ kitVersion: '1.7.74', wxkanbanApiUrl: baseUrl });
    fs.writeFileSync(path.join(tmp, '.env'), 'WXKANBAN_API_TOKEN=t\n');

    (await freshEnsure())();
    const cache = await waitForCache();

    expect(hits).toBe(1);
    expect(cache.outcome).toBe('checked');
  });

  it('does not replay a cached "update available" once the local kit has caught up', async () => {
    writeConfig({ kitVersion: '1.7.74' });
    fs.mkdirSync(path.join(tmp, '.wxai'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.wxai', 'kit-update-check.json'),
      JSON.stringify({
        checkedAt: Date.now(), upgradeAvailable: true, authorRepo: false,
        currentVersion: '1.7.61', latestVersion: 'v1.7.74', releaseUrl: null,
        outcome: 'checked', lastError: null,
      }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    (await freshEnsure())();
    await new Promise((r) => setTimeout(r, 50));

    expect(errSpy.mock.calls.flat().join(' ')).not.toMatch(/Update available/);
    expect(hits).toBe(0); // fresh cache: no network call
    errSpy.mockRestore();
  });
});
