// [SCOPE 083 Amendment A / FR-008] Regression coverage for field report b54b281e.
//
// project.check_for_updates reported currentVersion '0.0.0' — a hardcoded stub
// behind a live TODO — while pointing at a private repository that has no
// releases. The two faults masked each other: '0.0.0' compares as older than
// every release, so the 404 was the only thing keeping updateAvailable false,
// and project.upgrade_mcp acts on that flag by rm -rf'ing inside its own
// working directory.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import { checkForUpdates, installUpdate, compareVersions, type ReleaseInfo } from '../src/utils/github-updater.js';

const SELF_UPGRADE_ENV = 'MCP_ALLOW_SELF_UPGRADE';

function fakeRelease(version: string): ReleaseInfo {
  return {
    version,
    tagName: `v${version}`,
    publishedAt: new Date().toISOString(),
    htmlUrl: 'https://example.invalid/release',
    tarballUrl: 'https://example.invalid/tarball',
    zipballUrl: 'https://example.invalid/zipball',
    body: '',
    prerelease: false,
    draft: false,
  };
}

let envBefore: string | undefined;

beforeEach(() => {
  envBefore = process.env[SELF_UPGRADE_ENV];
  delete process.env[SELF_UPGRADE_ENV];
});

afterEach(() => {
  if (envBefore === undefined) delete process.env[SELF_UPGRADE_ENV];
  else process.env[SELF_UPGRADE_ENV] = envBefore;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getCurrentVersion — no fabricated version', () => {
  it('never reports the 0.0.0 placeholder', async () => {
    // '0.0.0' is not "unknown" — it is a comparable value meaning "older than
    // every release". Reporting it is what armed the upgrade path.
    const status = await checkForUpdates(true);
    expect(status.currentVersion).not.toBe('0.0.0');
  });

  it('reports the version ops pinned for the deployed release', async () => {
    vi.stubEnv('WXKANBAN_VERSION', '9.9.9-test');
    const status = await checkForUpdates(true);
    expect(status.currentVersion).toBe('9.9.9-test');
  });

  it('falls back to the MCP manifest rather than a baked literal', async () => {
    vi.stubEnv('WXKANBAN_VERSION', '');
    const status = await checkForUpdates(true);
    // Resolved from mcp-server/package.json at runtime, so it tracks the build.
    expect(status.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('checkForUpdates — an unmade comparison is reported as unmade', () => {
  it('carries an explicit error when the release cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
    const status = await checkForUpdates(true);
    expect(status.updateAvailable).toBe(false);
    expect(status.error).toBeTruthy();
    // The distinction the field report was about: "unknown" must not read as
    // "you are up to date".
    expect(status.error).toMatch(/unknown/i);
  });

  it('never compares the MCP version against a kit release', async () => {
    // The second route to the same false positive. The repository that actually
    // publishes releases publishes ORCHESTRATOR KIT versions (1.7.x); the MCP
    // server is on its own unrelated 0.x line and ships by pipeline. Comparing
    // them lands on "behind" every time — so correcting the repository URL
    // without this guard would have re-armed exactly what '0.0.0' did.
    vi.stubEnv('WXKANBAN_VERSION', '0.1.1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.7.62', published_at: '2026-09-08T00:00:00Z',
        html_url: 'https://example.invalid', tarball_url: 'https://example.invalid',
        zipball_url: 'https://example.invalid', body: '', prerelease: false, draft: false,
      }),
    }));

    const status = await checkForUpdates(true);

    // A naive comparison of 0.1.1 against 1.7.62 yields "update available".
    expect(compareVersions('0.1.1', '1.7.62')).toBe(-1);
    // The guard must refuse it anyway.
    expect(status.updateAvailable).toBe(false);
    expect(status.currentVersion).toBe('0.1.1');
    expect(status.latestVersion).toBe('1.7.62');
    expect(status.error).toMatch(/different version stream/i);
    // And it points at the tool that answers the question actually being asked.
    expect(status.error).toMatch(/check-kit-version/);
  });

  it('reports throttling as "no check performed", not as a result', async () => {
    // A skipped check previously returned updateAvailable:false with no error,
    // indistinguishable from a measurement.
    const status = await checkForUpdates(false);
    if (status.error) {
      expect(status.error).toMatch(/no check performed|unknown|could not/i);
    }
  });
});

describe('installUpdate — destructive path is off by default', () => {
  it('refuses when self-upgrade is not enabled', async () => {
    const result = await installUpdate(fakeRelease('99.0.0'));
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not enabled/i);
    expect(result.message).toMatch(new RegExp(SELF_UPGRADE_ENV));
  });

  it('touches nothing on the filesystem when it refuses', async () => {
    // The real safety property. installUpdate() rm -rf's entries inside its own
    // working directory; the refusal has to happen before any of that runs.
    const before = readdirSync(process.cwd()).sort();

    const result = await installUpdate(fakeRelease('99.0.0'));
    expect(result.success).toBe(false);

    const after = readdirSync(process.cwd()).sort();
    expect(after).toEqual(before);
    // No backup directory, no staging directory, no half-applied tree.
    expect(after.some((f) => f.includes('.backup-'))).toBe(false);
    expect(existsSync('.update-temp')).toBe(false);
  });

  it('names the hosted deployment as the reason, so the message is actionable', async () => {
    const result = await installUpdate(fakeRelease('99.0.0'));
    expect(result.message).toMatch(/hosted/i);
  });
});

describe('compareVersions — the comparison the placeholder abused', () => {
  it('ranks 0.0.0 below every real release', () => {
    // Retained as a standing reminder of why the placeholder was dangerous:
    // it is not a neutral "unknown", it is the minimum of the ordering.
    expect(compareVersions('0.0.0', '1.7.62')).toBe(-1);
    expect(compareVersions('1.7.62', '1.7.62')).toBe(0);
    expect(compareVersions('1.7.63', '1.7.62')).toBe(1);
  });
});
