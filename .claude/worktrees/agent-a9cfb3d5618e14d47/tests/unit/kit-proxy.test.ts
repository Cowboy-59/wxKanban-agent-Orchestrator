/**
 * KitProxyService unit tests — spec 019 R14
 *
 * Covers happy-path + key failure modes for resolveRelease, fetchAndVerify,
 * injectPerProjectFiles, and the platform-derivation helpers. Integration
 * (hitting the real GitHub release) is deferred to the dogfood run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { promises as fsp, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import archiver from 'archiver';
import {
  kitProxyService,
  KitProxyError,
  derivePlatform,
  formatFor,
} from '../../src/server/services/KitProxyService';

// ─── Mock ApiTokenService + KitEncryptionService ──────────────────────────────
// injectPerProjectFiles calls both; stub them so tests don't need a DB or env key.
vi.mock('../../src/server/services/ApiTokenService', () => ({
  apiTokenService: {
    createToken: vi.fn().mockResolvedValue({
      token: 'test-token-abc123',
      record: { id: 'rec-1', name: 'Test' },
    }),
  },
}));

vi.mock('../../src/server/services/KitEncryptionService', () => ({
  kitEncryptionService: {
    encryptDatabaseUrl: vi.fn().mockReturnValue({
      iv: 'iv-hex',
      authTag: 'tag-hex',
      encrypted: 'ciphertext-hex',
    }),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTestTarGz(contents: Record<string, string>): Promise<string> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kit-proxy-test-src-'));
  for (const [rel, body] of Object.entries(contents)) {
    const abs = path.join(workDir, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, body, 'utf8');
  }
  const outPath = path.join(os.tmpdir(), `kit-proxy-test-${crypto.randomBytes(4).toString('hex')}.tar.gz`);
  await tar.c({ file: outPath, cwd: workDir, gzip: true }, Object.keys(contents).map(r => r.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i));
  await fsp.rm(workDir, { recursive: true, force: true });
  return outPath;
}

async function makeTestZip(contents: Record<string, string>): Promise<string> {
  const outPath = path.join(os.tmpdir(), `kit-proxy-test-${crypto.randomBytes(4).toString('hex')}.zip`);
  return new Promise<string>((resolve, reject) => {
    const out = createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', () => resolve(outPath));
    out.on('error', reject);
    archive.on('error', reject);
    archive.pipe(out);
    for (const [rel, body] of Object.entries(contents)) {
      archive.append(body, { name: rel });
    }
    archive.finalize();
  });
}

async function sha256File(filePath: string): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function mockFetch(handlers: Array<(url: string) => Response | Promise<Response>>) {
  let call = 0;
  const fn = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === 'string' ? url : url.toString();
    const handler = handlers[call++];
    if (!handler) throw new Error(`mockFetch: unexpected extra call to ${u}`);
    return handler(u);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KitProxyService — helpers', () => {
  it('derivePlatform: explicit query param wins over UA', () => {
    expect(derivePlatform('windows', 'Mozilla/5.0 (Linux)')).toBe('windows');
    expect(derivePlatform('unix', 'Mozilla/5.0 (Windows NT 10.0)')).toBe('unix');
  });

  it('derivePlatform: UA fallback when no query param', () => {
    expect(derivePlatform(undefined, 'Mozilla/5.0 (Windows NT 10.0; Win64)')).toBe('windows');
    expect(derivePlatform(undefined, 'Mozilla/5.0 (X11; Linux x86_64)')).toBe('unix');
  });

  it('derivePlatform: default to unix when nothing provided', () => {
    expect(derivePlatform(undefined, undefined)).toBe('unix');
  });

  it('derivePlatform: ignores invalid query value and falls back to UA', () => {
    expect(derivePlatform('bogus', 'Mozilla/5.0 (Windows NT 10.0)')).toBe('windows');
    expect(derivePlatform('', undefined)).toBe('unix');
  });

  it('formatFor: windows → zip, unix → tar.gz', () => {
    expect(formatFor('windows')).toBe('zip');
    expect(formatFor('unix')).toBe('tar.gz');
  });
});

describe('KitProxyService — resolveRelease', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path: returns asset URLs for requested platform', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.1.0',
            assets: [
              { name: 'kit.tar.gz', browser_download_url: 'https://example.com/kit.tar.gz' },
              { name: 'kit.tar.gz.sha256', browser_download_url: 'https://example.com/kit.tar.gz.sha256' },
              { name: 'kit.zip', browser_download_url: 'https://example.com/kit.zip' },
              { name: 'kit.zip.sha256', browser_download_url: 'https://example.com/kit.zip.sha256' },
            ],
          }),
          { status: 200 }
        ),
    ]);

    const assets = await kitProxyService.resolveRelease('v0.1.0', 'unix');
    expect(assets.tag).toBe('v0.1.0');
    expect(assets.format).toBe('tar.gz');
    expect(assets.archiveUrl).toBe('https://example.com/kit.tar.gz');
    expect(assets.checksumUrl).toBe('https://example.com/kit.tar.gz.sha256');
  });

  it('404: throws KitProxyError(404) when release not found', async () => {
    mockFetch([() => new Response('not found', { status: 404 })]);

    await expect(kitProxyService.resolveRelease('v9.9.9', 'unix')).rejects.toMatchObject({
      name: 'KitProxyError',
      status: 404,
    });
  });

  it('503: throws KitProxyError(503) when GitHub is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));

    await expect(kitProxyService.resolveRelease('v0.1.0', 'unix')).rejects.toMatchObject({
      name: 'KitProxyError',
      status: 503,
    });
  });

  it('502: throws KitProxyError(502) when release is missing required asset', async () => {
    mockFetch([
      () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.1.0',
            assets: [{ name: 'kit.tar.gz', browser_download_url: 'https://example.com/kit.tar.gz' }],
            // missing .sha256 sidecar
          }),
          { status: 200 }
        ),
    ]);

    await expect(kitProxyService.resolveRelease('v0.1.0', 'unix')).rejects.toMatchObject({
      name: 'KitProxyError',
      status: 502,
    });
  });
});

describe('KitProxyService — fetchAndVerify', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path: downloads, hashes, verifies, caches', async () => {
    const archivePath = await makeTestTarGz({ 'README.md': 'hello' });
    const expectedSha = await sha256File(archivePath);
    const archiveBytes = await fsp.readFile(archivePath);

    mockFetch([
      () => new Response(`${expectedSha}  kit.tar.gz\n`, { status: 200 }),
      () => new Response(archiveBytes, { status: 200 }),
    ]);

    const verified = await kitProxyService.fetchAndVerify({
      tag: 'v0.1.0',
      archiveUrl: 'https://example.com/kit.tar.gz',
      checksumUrl: 'https://example.com/kit.tar.gz.sha256',
      format: 'tar.gz',
    });
    expect(verified.sha256).toBe(expectedSha);
    expect(verified.tag).toBe('v0.1.0');
    expect(verified.format).toBe('tar.gz');

    await fsp.unlink(archivePath).catch(() => undefined);
  });

  it('502: SHA-256 mismatch rejects archive', async () => {
    const archivePath = await makeTestTarGz({ 'README.md': 'hello' });
    const archiveBytes = await fsp.readFile(archivePath);
    const wrongSha = '0'.repeat(64);

    mockFetch([
      () => new Response(`${wrongSha}  kit.tar.gz\n`, { status: 200 }),
      () => new Response(archiveBytes, { status: 200 }),
    ]);

    await expect(
      kitProxyService.fetchAndVerify({
        tag: 'v0.1.0',
        archiveUrl: 'https://example.com/kit.tar.gz',
        checksumUrl: 'https://example.com/kit.tar.gz.sha256',
        format: 'tar.gz',
      })
    ).rejects.toMatchObject({ name: 'KitProxyError', status: 502 });

    await fsp.unlink(archivePath).catch(() => undefined);
  });

  it('cache hit: second call returns cached archive without re-downloading', async () => {
    const archivePath = await makeTestTarGz({ 'README.md': 'hello' });
    const expectedSha = await sha256File(archivePath);
    const archiveBytes = await fsp.readFile(archivePath);

    const fetchFn = mockFetch([
      () => new Response(`${expectedSha}  kit.tar.gz\n`, { status: 200 }),
      () => new Response(archiveBytes, { status: 200 }),
    ]);

    const first = await kitProxyService.fetchAndVerify({
      tag: 'v0.1.0',
      archiveUrl: 'https://example.com/kit.tar.gz',
      checksumUrl: 'https://example.com/kit.tar.gz.sha256',
      format: 'tar.gz',
    });
    const firstCalls = fetchFn.mock.calls.length;

    const second = await kitProxyService.fetchAndVerify({
      tag: 'v0.1.0',
      archiveUrl: 'https://example.com/kit.tar.gz',
      checksumUrl: 'https://example.com/kit.tar.gz.sha256',
      format: 'tar.gz',
    });
    expect(second.path).toBe(first.path);
    expect(fetchFn.mock.calls.length).toBe(firstCalls); // no additional fetches

    await fsp.unlink(archivePath).catch(() => undefined);
  });
});

describe('KitProxyService — stale-cache short-circuit regression', () => {
  // Regression for the "Failed to parse URL from " HTTP 500 seen on
  // `node scripts/upgrade-kit.mjs`. resolveRelease's latest-short-circuit
  // returned empty archiveUrl/checksumUrl whenever the cached archive file
  // still existed on disk, trusting fetchAndVerify to take a cache hit. But
  // the short-circuit only checked existsSync, while fetchAndVerify also
  // enforces CACHE_TTL_MS (1h) vs the short-circuit's LATEST_RESOLVE_TTL_MS
  // (60s) gate. A >1h-old-but-still-present archive → empty URLs → fetch('').
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetchAndVerify: cache miss with empty URLs throws KitProxyError(502), not a URL-parse TypeError', async () => {
    await expect(
      kitProxyService.fetchAndVerify({
        tag: 'v1.5.4',
        archiveUrl: '',
        checksumUrl: '',
        format: 'tar.gz',
      })
    ).rejects.toMatchObject({ name: 'KitProxyError', status: 502 });
  });

  it('resolveRelease: does not short-circuit to empty URLs when the cached archive is older than CACHE_TTL', async () => {
    const releaseJson = JSON.stringify({
      tag_name: 'v1.5.4',
      assets: [
        { name: 'kit.tar.gz', browser_download_url: 'https://example.com/kit.tar.gz' },
        { name: 'kit.tar.gz.sha256', browser_download_url: 'https://example.com/kit.tar.gz.sha256' },
        { name: 'kit.zip', browser_download_url: 'https://example.com/kit.zip' },
        { name: 'kit.zip.sha256', browser_download_url: 'https://example.com/kit.zip.sha256' },
      ],
    });

    // Build the test archive under real timers (tar/fs streaming) before
    // switching to fake timers for the TTL math.
    const archivePath = await makeTestTarGz({ 'README.md': 'hello' });
    const expectedSha = await sha256File(archivePath);
    const archiveBytes = await fsp.readFile(archivePath);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    mockFetch([
      () => new Response(releaseJson, { status: 200 }),                    // resolveRelease #1 (latest)
      () => new Response(`${expectedSha}  kit.tar.gz\n`, { status: 200 }), // fetchAndVerify checksum
      () => new Response(archiveBytes, { status: 200 }),                   // fetchAndVerify archive
      () => new Response(releaseJson, { status: 200 }),                    // latestVersion refresh
      () => new Response(releaseJson, { status: 200 }),                    // resolveRelease #2 (must NOT be empty)
    ]);

    // T0: populate latestResolution + archive cache.
    const first = await kitProxyService.resolveRelease(undefined, 'unix');
    expect(first.archiveUrl).toBe('https://example.com/kit.tar.gz');
    await kitProxyService.fetchAndVerify(first);

    // >1h passes: the cache entry is stale but its temp file still exists
    // (eviction only runs inside fetchAndVerify, which hasn't re-run).
    vi.advanceTimersByTime(61 * 60 * 1000);

    // latestVersion refreshes latestResolution WITHOUT re-caching an archive,
    // re-arming the buggy short-circuit.
    await kitProxyService.latestVersion({ projectId: 'p1', platform: 'unix' });

    // Pre-fix: this returned empty URLs (then 500'd in fetchAndVerify).
    // Post-fix: falls through to a real resolve and returns usable URLs.
    const second = await kitProxyService.resolveRelease(undefined, 'unix');
    expect(second.archiveUrl).toBe('https://example.com/kit.tar.gz');
    expect(second.checksumUrl).toBe('https://example.com/kit.tar.gz.sha256');

    vi.useRealTimers();
    await fsp.unlink(archivePath).catch(() => undefined);
  });
});

describe('KitProxyService — injectPerProjectFiles', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
  });

  it('tar.gz round-trip: extracts, injects, repacks, per-project files present', async () => {
    const archivePath = await makeTestTarGz({
      'README.md': 'kit readme',
      'wxkanban-agent/package.json': '{}',
    });
    const sha = await sha256File(archivePath);

    const injected = await kitProxyService.injectPerProjectFiles(
      { path: archivePath, sha256: sha, tag: 'v0.1.0', format: 'tar.gz' },
      { projectId: 'proj-xyz', userId: 'user-1', companyId: 'comp-1', platform: 'unix' }
    );
    expect(injected.bytes).toBeGreaterThan(0);
    expect(injected.format).toBe('tar.gz');

    // Verify the injected archive contains both per-project files.
    const verifyDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kit-verify-'));
    await tar.x({ file: injected.path, cwd: verifyDir });
    const projectCfg = JSON.parse(await fsp.readFile(path.join(verifyDir, '.wxkanban-project.json'), 'utf8'));
    const aiSettings = JSON.parse(await fsp.readFile(path.join(verifyDir, 'ai-settings.json'), 'utf8'));
    expect(projectCfg.projectId).toBe('proj-xyz');
    expect(projectCfg.kitVersion).toBe('v0.1.0');
    // Spec 028 hosted-MCP shape: per-project secrets live under
    // mcpServers.wxkanban.env (no more runtime.* / databaseUrlEncrypted —
    // the kit ships no DB credentials).
    expect(aiSettings.mcpServers.wxkanban.env.WXKANBAN_API_TOKEN).toBe('test-token-abc123');
    expect(aiSettings.mcpServers.wxkanban.env.WXKANBAN_PROJECT_ID).toBe('proj-xyz');

    // Verify the original file survived the round trip.
    const readme = await fsp.readFile(path.join(verifyDir, 'README.md'), 'utf8');
    expect(readme).toBe('kit readme');

    await fsp.unlink(archivePath).catch(() => undefined);
    await fsp.unlink(injected.path).catch(() => undefined);
    await fsp.rm(verifyDir, { recursive: true, force: true });
  });

  it('zip round-trip: extracts, injects, repacks, per-project files present', async () => {
    const archivePath = await makeTestZip({
      'README.md': 'kit readme',
      'wxkanban-agent/package.json': '{}',
    });
    const sha = await sha256File(archivePath);

    const injected = await kitProxyService.injectPerProjectFiles(
      { path: archivePath, sha256: sha, tag: 'v0.1.0', format: 'zip' },
      { projectId: 'proj-xyz', userId: 'user-1', companyId: 'comp-1', platform: 'windows' }
    );
    expect(injected.format).toBe('zip');

    // Extract and verify
    const verifyDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kit-verify-zip-'));
    const { default: yauzl } = await import('yauzl');
    await new Promise<void>((resolve, reject) => {
      yauzl.open(injected.path, { lazyEntries: true }, (err, zf) => {
        if (err || !zf) return reject(err ?? new Error('open failed'));
        zf.readEntry();
        zf.on('entry', (entry) => {
          const abs = path.join(verifyDir, entry.fileName);
          if (/\/$/.test(entry.fileName)) {
            fsp.mkdir(abs, { recursive: true }).then(() => zf.readEntry()).catch(reject);
            return;
          }
          fsp.mkdir(path.dirname(abs), { recursive: true }).then(() => {
            zf.openReadStream(entry, (e, rs) => {
              if (e || !rs) return reject(e);
              const ws = createWriteStream(abs);
              ws.on('close', () => zf.readEntry());
              rs.pipe(ws);
            });
          }).catch(reject);
        });
        zf.on('end', resolve);
        zf.on('error', reject);
      });
    });

    const projectCfg = JSON.parse(await fsp.readFile(path.join(verifyDir, '.wxkanban-project.json'), 'utf8'));
    expect(projectCfg.projectId).toBe('proj-xyz');

    await fsp.unlink(archivePath).catch(() => undefined);
    await fsp.unlink(injected.path).catch(() => undefined);
    await fsp.rm(verifyDir, { recursive: true, force: true });
  });
});
