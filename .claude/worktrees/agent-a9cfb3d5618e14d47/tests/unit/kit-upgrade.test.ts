/**
 * KitProxyService R15 unit tests — kit upgrade (preserve-mode).
 *
 * Covers AC1, AC2, AC3, AC4, AC8, AC9 from spec 019 R15:
 *   - refuse-without-prior-install (AC1)
 *   - customizable-template-strip + per-project-file-strip (AC2)
 *   - response-header presence (AC3)
 *   - audit emission (AC4)
 *   - latestVersion up-to-date / upgrade-available (AC8)
 *   - downgrade refusal (AC9)
 *
 * Consumer-side AC5/AC6/AC7 tests live in the orchestrator repo with the
 * scripts they cover.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { promises as fsp, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import archiver from 'archiver';
import {
  kitProxyService,
  KitProxyError,
} from '../../src/server/services/KitProxyService';

// ─── Stub the services that pull in src/server/config.ts on import ──────────
// (config.ts calls process.exit(1) when env vars are missing — unavoidable in
// a unit-test runner without a real .env). Mocking these short-circuits the
// chain that would otherwise drag config.ts into the import graph.
vi.mock('../../src/server/services/ApiTokenService', () => ({
  apiTokenService: { createToken: vi.fn() },
}));
vi.mock('../../src/server/services/KitEncryptionService', () => ({
  kitEncryptionService: { encryptDatabaseUrl: vi.fn() },
}));

// ─── DB mock — projectkits row lookup drives AC1 + AC9 behavior ──────────────
const mockProjectKitsRow: { kitversion: string | null } | null = { kitversion: 'v0.1.8' };
let projectKitsResult: { kitversion: string | null } | null = mockProjectKitsRow;

vi.mock('../../src/db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (projectKitsResult ? [projectKitsResult] : []),
        }),
      }),
    }),
  },
}));

vi.mock('../../src/db/schema/projectkit.js', () => ({
  projectkits: { kitversion: {}, projectid: {} },
}));

vi.mock('../../src/db/schema/projectdocuments.js', () => ({
  projectdocuments: {},
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeKitTarGz(contents: Record<string, string>): Promise<string> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kit-upgrade-test-src-'));
  for (const [rel, body] of Object.entries(contents)) {
    const abs = path.join(workDir, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, body, 'utf8');
  }
  const outPath = path.join(os.tmpdir(), `kit-upgrade-test-${crypto.randomBytes(4).toString('hex')}.tar.gz`);
  const topEntries = Object.keys(contents).map(r => r.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i);
  await tar.c({ file: outPath, cwd: workDir, gzip: true }, topEntries);
  await fsp.rm(workDir, { recursive: true, force: true });
  return outPath;
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

function makeMockRes() {
  // Use a real PassThrough Writable so node:stream/promises pipeline() works.
  // Attach the Express-shaped setHeader/getHeader API on top.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PassThrough } = require('node:stream');
  const headers: Record<string, string> = {};
  const writes: Buffer[] = [];
  const stream = new PassThrough();
  stream.on('data', (chunk: Buffer) => writes.push(chunk));
  (stream as any).setHeader = (k: string, v: string) => { headers[k] = String(v); return stream; };
  (stream as any).getHeader = (k: string) => headers[k];
  (stream as any).headersSent = false;
  return { res: stream, headers, writes };
}

// ─── AC1: refuse without prior install ───────────────────────────────────────

describe('serveUpgrade — AC1 (refuse without prior install)', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
    projectKitsResult = null; // simulate "no prior install"
  });

  afterEach(() => {
    projectKitsResult = mockProjectKitsRow;
    vi.unstubAllGlobals();
  });

  it('throws KitProxyError(409) when no projectkits row exists', async () => {
    const { res } = makeMockRes();
    await expect(kitProxyService.serveUpgrade(res, {
      projectId: 'no-such-project',
      userId: 'u1',
      companyId: 'c1',
      platform: 'unix',
    })).rejects.toMatchObject({
      name: 'KitProxyError',
      status: 409,
    });
  });
});

// ─── AC9: downgrade refusal ──────────────────────────────────────────────────

describe('serveUpgrade — AC9 (downgrade refusal)', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
    projectKitsResult = { kitversion: 'v0.2.0' }; // installed > target
  });

  afterEach(() => {
    projectKitsResult = mockProjectKitsRow;
    vi.unstubAllGlobals();
  });

  it('throws KitProxyError(409) when target < installed and allowDowngrade is false', async () => {
    mockFetch([
      () => new Response(JSON.stringify({
        tag_name: 'v0.1.0',
        assets: [
          { name: 'kit.tar.gz', browser_download_url: 'https://example.com/kit.tar.gz' },
          { name: 'kit.tar.gz.sha256', browser_download_url: 'https://example.com/kit.tar.gz.sha256' },
        ],
      }), { status: 200 }),
    ]);

    const { res } = makeMockRes();
    await expect(kitProxyService.serveUpgrade(res, {
      projectId: 'p1',
      userId: 'u1',
      companyId: 'c1',
      version: 'v0.1.0',
      platform: 'unix',
    })).rejects.toMatchObject({
      name: 'KitProxyError',
      status: 409,
    });
  });
});

// ─── AC2 + AC3 + AC4: strip files + headers + audit ──────────────────────────

describe('serveUpgrade — AC2/AC3/AC4 (strip + headers + audit)', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
    projectKitsResult = { kitversion: 'v0.1.8' };
  });

  afterEach(() => {
    projectKitsResult = mockProjectKitsRow;
    vi.unstubAllGlobals();
  });

  it('strips per-project files + customizable templates and emits headers + audit', async () => {
    // Build a fake "release" tarball that contains all the files we expect to strip
    // plus some kit-internal files we expect to survive.
    const archivePath = await makeKitTarGz({
      // strip targets
      '.wxkanban-project.json': '{}',
      'ai-settings.json': '{}',
      '.env': 'X=Y',
      'CLAUDE.md': '# CLAUDE template',
      'AI.md': '# AI template',
      'ProjectOverview.md': '# overview template',
      'README.md': '# kit readme',
      // survivors
      'wxkanban-agent/package.json': '{}',
      'mcp-server/dist/index-http.js': '// mcp',
      'scripts/init.mjs': '// init',
      'bin/wxkanban-agent.cmd': '@echo off',
      '_wxAI/rules/index.md': '# rules',
      '.vscode/tasks.json': '{}',
      'package.json': '{}',
      'package-lock.json': '{}',
    });
    const archiveSha = await sha256File(archivePath);
    const archiveBytes = await fsp.readFile(archivePath);

    let auditCallBody: string | null = null;

    mockFetch([
      // resolveRelease
      () => new Response(JSON.stringify({
        tag_name: 'v0.1.10',
        assets: [
          { name: 'kit.tar.gz', browser_download_url: 'https://example.com/kit.tar.gz' },
          { name: 'kit.tar.gz.sha256', browser_download_url: 'https://example.com/kit.tar.gz.sha256' },
        ],
      }), { status: 200 }),
      // fetchChecksum
      () => new Response(`${archiveSha}  kit.tar.gz\n`, { status: 200 }),
      // fetchArchive
      () => new Response(archiveBytes, { status: 200, headers: { 'content-type': 'application/gzip' } }),
      // captureKitUpgradeEvent — capture the audit call
      (_url) => new Response('{}', { status: 200 }),
    ]);

    // Wrap fetch so we capture the audit call body
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/call') && init?.body) {
        auditCallBody = String(init.body);
      }
      return originalFetch(url, init);
    };

    const { res, headers, writes } = makeMockRes();
    const result = await kitProxyService.serveUpgrade(res, {
      projectId: 'proj-1',
      userId: 'user-1',
      companyId: 'company-1',
      version: 'v0.1.10',
      fromVersion: 'v0.1.8',
      platform: 'unix',
    });

    // AC3 — headers present
    expect(headers['X-Kit-Mode']).toBe('upgrade');
    expect(headers['X-Kit-Version']).toBe('v0.1.10');
    expect(headers['X-Kit-FromVersion']).toBe('v0.1.8');
    expect(headers['X-Kit-Sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['Content-Type']).toBe('application/gzip');

    // Result echoes from/to
    expect(result.fromVersion).toBe('v0.1.8');
    expect(result.toVersion).toBe('v0.1.10');

    // AC2 — extract the streamed body and verify strip-list files are gone, survivors are present
    const streamedArchive = Buffer.concat(writes);
    const extractDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kit-upgrade-verify-'));
    const tempArchive = path.join(os.tmpdir(), `verify-${crypto.randomBytes(4).toString('hex')}.tar.gz`);
    await fsp.writeFile(tempArchive, streamedArchive);
    await tar.x({ file: tempArchive, cwd: extractDir });

    // mcp-server/** is stripped too (spec 028 / T053 — the legacy local-MCP
    // tree must not survive a v1.1.0+ upgrade now that MCP is hosted).
    const stripped = ['.wxkanban-project.json', 'ai-settings.json', '.env', 'CLAUDE.md', 'AI.md', 'ProjectOverview.md', 'README.md', 'mcp-server/dist/index-http.js'];
    for (const f of stripped) {
      await expect(fsp.access(path.join(extractDir, f))).rejects.toThrow();
    }
    const survivors = ['wxkanban-agent/package.json', 'scripts/init.mjs', 'bin/wxkanban-agent.cmd', '_wxAI/rules/index.md', '.vscode/tasks.json', 'package.json', 'package-lock.json'];
    for (const f of survivors) {
      await expect(fsp.access(path.join(extractDir, f))).resolves.toBeUndefined();
    }

    // AC4 — audit event was emitted with the right metadata
    expect(auditCallBody).not.toBeNull();
    const auditPayload = JSON.parse(auditCallBody!);
    expect(auditPayload.tool).toBe('project.capture_event');
    expect(auditPayload.args.projectId).toBe('proj-1');
    expect(auditPayload.args.metadata.event).toBe('kit_upgrade');
    expect(auditPayload.args.metadata.fromVersion).toBe('v0.1.8');
    expect(auditPayload.args.metadata.toVersion).toBe('v0.1.10');
    // SHA-256 must NOT be in audit payload (per AC4)
    expect(auditCallBody).not.toContain(headers['X-Kit-Sha256']);

    await fsp.rm(extractDir, { recursive: true, force: true });
    await fsp.unlink(tempArchive).catch(() => undefined);
    await fsp.unlink(archivePath).catch(() => undefined);
  });
});

// ─── AC8: latestVersion up-to-date / upgrade-available ───────────────────────

describe('latestVersion — AC8', () => {
  beforeEach(async () => {
    await kitProxyService._resetCache();
    vi.unstubAllGlobals();
    projectKitsResult = { kitversion: 'v0.1.8' };
  });

  afterEach(() => {
    projectKitsResult = mockProjectKitsRow;
    vi.unstubAllGlobals();
  });

  it('reports upgradeAvailable=true when latest > current', async () => {
    mockFetch([
      () => new Response(JSON.stringify({
        tag_name: 'v0.1.10',
        published_at: '2026-05-23T14:00:00Z',
        html_url: 'https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases/tag/v0.1.10',
      }), { status: 200 }),
    ]);

    const result = await kitProxyService.latestVersion({ projectId: 'p1', platform: 'unix' });
    expect(result.currentVersion).toBe('v0.1.8');
    expect(result.latestVersion).toBe('v0.1.10');
    expect(result.upgradeAvailable).toBe(true);
    expect(result.releaseUrl).toContain('v0.1.10');
    expect(result.publishedAt).toBe('2026-05-23T14:00:00Z');
  });

  it('reports upgradeAvailable=false when current == latest', async () => {
    projectKitsResult = { kitversion: 'v0.1.10' };
    mockFetch([
      () => new Response(JSON.stringify({
        tag_name: 'v0.1.10',
        published_at: '2026-05-23T14:00:00Z',
        html_url: 'https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/releases/tag/v0.1.10',
      }), { status: 200 }),
    ]);

    const result = await kitProxyService.latestVersion({ projectId: 'p1', platform: 'unix' });
    expect(result.upgradeAvailable).toBe(false);
  });

  it('reports upgradeAvailable=true with currentVersion=null when no install row exists', async () => {
    projectKitsResult = null;
    mockFetch([
      () => new Response(JSON.stringify({
        tag_name: 'v0.1.10',
        published_at: '2026-05-23T14:00:00Z',
        html_url: 'https://example.com',
      }), { status: 200 }),
    ]);

    const result = await kitProxyService.latestVersion({ projectId: 'p1', platform: 'unix' });
    expect(result.currentVersion).toBeNull();
    expect(result.upgradeAvailable).toBe(true);
  });
});
