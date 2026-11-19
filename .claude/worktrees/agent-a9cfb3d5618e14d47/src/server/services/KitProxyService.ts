/**
 * KitProxyService — implements spec 019 R14
 *
 * Thin proxy that fetches the orchestrator kit from the
 * Cowboy-59/wxKanban-agent-Orchestrator GitHub release, verifies SHA-256
 * against the sidecar checksum, injects per-project files
 * (.wxkanban-project.json + ai-settings.json) server-side, and streams
 * the re-packaged archive to the caller.
 *
 * Replaces KitGenerationService.ts after the 7-day bake period defined in
 * spec 019 R14 AC6.
 */

import { Response } from 'express';
import crypto from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, promises as fsp, statSync } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import yauzl from 'yauzl';
import archiver from 'archiver';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { projectdocuments } from '../../db/schema/projectdocuments.js';
import { projectkits } from '../../db/schema/projectkit.js';
import { logger } from '../lib/logger.js';
import { apiTokenService } from './ApiTokenService.js';
import { buildMcpJsonDoc } from './mcpRegistration.js'; // [SCOPE 095 / T001]

export type KitPlatform = 'unix' | 'windows';
export type KitArchiveFormat = 'tar.gz' | 'zip';

export interface ReleaseAssets {
  tag: string;
  archiveUrl: string;
  checksumUrl: string;
  format: KitArchiveFormat;
}

export interface VerifiedArchive {
  path: string;
  sha256: string;
  tag: string;
  format: KitArchiveFormat;
}

export interface InjectedArchive {
  path: string;
  sha256: string;
  format: KitArchiveFormat;
  bytes: number;
  /**
   * The per-download API token minted during injection. Surfaced so serve()
   * can return it in the X-API-Token response header (matching the legacy-DB
   * download path) — the client uses it to reveal the token for copy/paste
   * when the kit's .env didn't land on disk (e.g. macOS Finder hides dotfiles).
   * Absent on the upgrade path, which strips .env and mints no token.
   */
  apiToken?: string;
}

export interface ProxyOptions {
  projectId: string;
  userId: string;
  companyId: string;
  version?: string;
  platform: KitPlatform;
}

export interface UpgradeOptions extends ProxyOptions {
  /** Consumer-supplied current version (from .wxkanban-project.json). Falls back to projectkits.kitversion. */
  fromVersion?: string;
  /** Permit serving a target version older than the installed one. Default false (downgrades refused with 409). */
  allowDowngrade?: boolean;
}

export interface ProxyResult {
  tag: string;
  format: KitArchiveFormat;
  shaServed: string;
  bytes: number;
  durationMs: number;
}

export interface UpgradeResult extends ProxyResult {
  fromVersion: string;
  toVersion: string;
}

export interface LatestVersionResult {
  currentVersion: string | null;
  latestVersion: string;
  upgradeAvailable: boolean;
  releaseUrl: string;
  publishedAt: string | null;
}

/**
 * R15 AC2 — paths that must NEVER be in an upgrade archive.
 *
 * Entries may be files OR directories; the strip loop uses `fs.rm` with
 * `recursive: true` so either is removed safely. Adding a directory entry
 * (e.g. `mcp-server`) defends against an upstream archive that still
 * contains the legacy local-MCP tree after the spec 019 / spec 028 cutover.
 */
const UPGRADE_STRIP_FILES = [
  '.wxkanban-project.json',
  'ai-settings.json',
  '.env',
  // [SCOPE 095 / T002] Per-project MCP registration carries a bearer token; a
  // re-download must regenerate it with the freshly minted token, never ship stale.
  '.mcp.json',
  'CLAUDE.md',
  'AI.md',
  'ProjectOverview.md',
  'README.md',
  // [SPEC 028 / T053] Legacy local-MCP tree must not survive a v1.1.0+ upgrade.
  'mcp-server',
  'scripts/setup-mcp.mjs',
  'scripts/mcp-health-check.mjs',
  // SPEC-142: the decision ledger and gate settings are project-owned; never in an upgrade archive.
  'decisions',
] as const;

const ORCH_OWNER = 'Cowboy-59';
const ORCH_REPO = 'wxKanban-agent-Orchestrator';
const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour per R14 implementation contract
const LATEST_RESOLVE_TTL_MS = 60 * 1000; // treat a resolved `latest` tag as fresh for 60s

interface CachedArchive {
  tag: string;
  format: KitArchiveFormat;
  path: string;
  sha256: string;
  cachedAt: number;
}

interface LatestResolution {
  tag: string;
  resolvedAt: number;
}

export class KitProxyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'KitProxyError';
  }
}

export class KitProxyService {
  private static instance: KitProxyService;
  private archiveCache = new Map<string, CachedArchive>();
  private latestResolution: LatestResolution | null = null;

  private constructor() {}

  public static getInstance(): KitProxyService {
    if (!KitProxyService.instance) {
      KitProxyService.instance = new KitProxyService();
    }
    return KitProxyService.instance;
  }

  /**
   * AC1 + AC8: Resolve the orchestrator release and return asset URLs for the
   * requested platform. `undefined` resolves to `latest`. Throws KitProxyError
   * with status 404 (not found), 503 (GitHub unreachable), or 502 (malformed).
   */
  async resolveRelease(version: string | undefined, platform: KitPlatform): Promise<ReleaseAssets> {
    const format = formatFor(platform);

    // Short-circuit: if the caller asked for `latest` and we resolved it
    // < LATEST_RESOLVE_TTL_MS ago, reuse the resolved tag to avoid a GitHub
    // API round-trip. The archive cache in fetchAndVerify handles the rest.
    if (!version && this.latestResolution && Date.now() - this.latestResolution.resolvedAt < LATEST_RESOLVE_TTL_MS) {
      const cached = this.archiveCache.get(`${this.latestResolution.tag}:${format}`);
      // Only short-circuit when the archive cache entry is ALSO valid by
      // fetchAndVerify's rules (CACHE_TTL_MS), not merely present on disk.
      // Otherwise we hand back empty archiveUrl/checksumUrl trusting a cache
      // hit, but fetchAndVerify evicts the stale entry and then fetches the
      // empty URL → "Failed to parse URL from " → HTTP 500. (TTL mismatch:
      // LATEST_RESOLVE_TTL_MS=60s vs CACHE_TTL_MS=1h.)
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS && existsSync(cached.path)) {
        return {
          tag: this.latestResolution.tag,
          archiveUrl: '',    // unused — fetchAndVerify will take the cache hit
          checksumUrl: '',   // unused — cache hit path doesn't re-verify
          format,
        };
      }
    }

    const endpoint = version
      ? `${GITHUB_API}/repos/${ORCH_OWNER}/${ORCH_REPO}/releases/tags/${encodeURIComponent(version)}`
      : `${GITHUB_API}/repos/${ORCH_OWNER}/${ORCH_REPO}/releases/latest`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wxkanban-kit-proxy',
    };
    const token = process.env.GITHUB_KIT_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: globalThis.Response;
    try {
      response = await fetch(endpoint, { headers });
    } catch (err) {
      throw new KitProxyError(503, `kit source unavailable: ${(err as Error).message}`);
    }

    if (response.status === 404) {
      throw new KitProxyError(404, `orchestrator release ${version ?? 'latest'} not found`);
    }
    if (!response.ok) {
      throw new KitProxyError(503, `GitHub API returned ${response.status}`);
    }

    const release = (await response.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    if (!release.tag_name || !Array.isArray(release.assets)) {
      throw new KitProxyError(502, 'malformed GitHub release payload');
    }

    const archiveName = format === 'zip' ? 'kit.zip' : 'kit.tar.gz';
    const checksumName = `${archiveName}.sha256`;
    const archiveAsset = release.assets.find(a => a.name === archiveName);
    const checksumAsset = release.assets.find(a => a.name === checksumName);
    if (!archiveAsset || !checksumAsset) {
      throw new KitProxyError(502, `release ${release.tag_name} missing ${archiveName} or ${checksumName}`);
    }

    if (!version) {
      this.latestResolution = { tag: release.tag_name, resolvedAt: Date.now() };
    }

    return {
      tag: release.tag_name,
      archiveUrl: archiveAsset.browser_download_url,
      checksumUrl: checksumAsset.browser_download_url,
      format,
    };
  }

  /**
   * AC2: Stream archive to temp path, verify SHA-256 against sidecar. Throws
   * KitProxyError(502) on mismatch. Caches verified archive for CACHE_TTL_MS
   * per (tag, format); injection always runs per-request so secrets are never
   * cached.
   */
  async fetchAndVerify(assets: ReleaseAssets): Promise<VerifiedArchive> {
    const cacheKey = `${assets.tag}:${assets.format}`;
    const cached = this.archiveCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS && existsSync(cached.path)) {
      logger.debug({ tag: assets.tag, format: assets.format }, 'kit archive cache hit');
      return { path: cached.path, sha256: cached.sha256, tag: cached.tag, format: cached.format };
    }

    // Defense-in-depth: a cache miss with empty asset URLs means an upstream
    // caller returned a "trust the cache" result that didn't actually hit.
    // Fail loudly here instead of letting fetch('') throw an opaque
    // "Failed to parse URL from " TypeError that surfaces as a bare 500.
    if (!assets.archiveUrl || !assets.checksumUrl) {
      throw new KitProxyError(
        502,
        `kit archive cache miss for ${assets.tag}:${assets.format} but no download URLs were resolved`
      );
    }

    const expectedSha = await this.fetchChecksum(assets.checksumUrl);
    const tempPath = path.join(
      os.tmpdir(),
      `wxkanban-kit-${assets.tag}-${assets.format}-${crypto.randomBytes(6).toString('hex')}.${assets.format === 'zip' ? 'zip' : 'tar.gz'}`
    );

    const response = await fetch(assets.archiveUrl, {
      headers: { 'User-Agent': 'wxkanban-kit-proxy', Accept: 'application/octet-stream' },
      redirect: 'follow',
    });
    if (!response.ok || !response.body) {
      throw new KitProxyError(503, `failed to download archive: HTTP ${response.status}`);
    }

    const hash = crypto.createHash('sha256');
    const hashing = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const out = createWriteStream(tempPath);
    const nodeStream = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>);
    await pipeline(nodeStream, hashing, out);
    const actualSha = hash.digest('hex');

    if (actualSha !== expectedSha) {
      await fsp.unlink(tempPath).catch(() => undefined);
      throw new KitProxyError(502, 'kit integrity check failed (SHA-256 mismatch)');
    }

    this.evictStaleCache();
    this.archiveCache.set(cacheKey, {
      tag: assets.tag,
      format: assets.format,
      path: tempPath,
      sha256: actualSha,
      cachedAt: Date.now(),
    });

    logger.info(
      { tag: assets.tag, format: assets.format, bytes: statSync(tempPath).size, sha256: actualSha },
      'kit archive verified and cached'
    );
    return { path: tempPath, sha256: actualSha, tag: assets.tag, format: assets.format };
  }

  private async fetchChecksum(url: string): Promise<string> {
    const response = await fetch(url, { headers: { 'User-Agent': 'wxkanban-kit-proxy' }, redirect: 'follow' });
    if (!response.ok) {
      throw new KitProxyError(503, `failed to download checksum: HTTP ${response.status}`);
    }
    const text = await response.text();
    // sha256sum output format: "<hash>  <filename>"
    const hash = text.trim().split(/\s+/)[0];
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new KitProxyError(502, 'checksum file is not a valid SHA-256');
    }
    return hash.toLowerCase();
  }

  private evictStaleCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.archiveCache.entries()) {
      if (now - entry.cachedAt >= CACHE_TTL_MS) {
        fsp.unlink(entry.path).catch(() => undefined);
        this.archiveCache.delete(key);
      }
    }
  }

  /**
   * Test/ops hook: purge the in-memory cache and the on-disk temp files.
   */
  async _resetCache(): Promise<void> {
    for (const entry of this.archiveCache.values()) {
      await fsp.unlink(entry.path).catch(() => undefined);
    }
    this.archiveCache.clear();
    this.latestResolution = null;
  }

  /**
   * AC4: Extract archive → write .wxkanban-project.json + ai-settings.json
   * populated with projectId, API token, and encrypted DB URL → re-archive
   * preserving the original format. Result archive is NEVER cached.
   *
   * Returns the path to the injected archive (in os.tmpdir()) plus its size
   * and post-injection SHA-256. Caller is responsible for streaming + cleanup.
   */
  async injectPerProjectFiles(
    verified: VerifiedArchive,
    opts: ProxyOptions
  ): Promise<InjectedArchive> {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wxkanban-inject-'));
    try {
      await this.extractArchive(verified.path, verified.format, workDir);
      const apiToken = await this.writePerProjectFiles(workDir, verified.tag, opts);
      const outPath = path.join(
        os.tmpdir(),
        `wxkanban-kit-injected-${opts.projectId}-${verified.tag}-${crypto.randomBytes(4).toString('hex')}.${verified.format === 'zip' ? 'zip' : 'tar.gz'}`
      );
      await this.repackArchive(workDir, verified.format, outPath);
      const stat = await fsp.stat(outPath);
      const sha256 = await hashFile(outPath);
      return { path: outPath, sha256, format: verified.format, bytes: stat.size, apiToken };
    } finally {
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extractArchive(archivePath: string, format: KitArchiveFormat, destDir: string): Promise<void> {
    if (format === 'tar.gz') {
      await tar.x({ file: archivePath, cwd: destDir });
      return;
    }
    await extractZip(archivePath, destDir);
  }

  private async repackArchive(sourceDir: string, format: KitArchiveFormat, outPath: string): Promise<void> {
    if (format === 'tar.gz') {
      const entries = await fsp.readdir(sourceDir);
      await tar.c({ file: outPath, cwd: sourceDir, gzip: true }, entries);
      return;
    }
    await repackZip(sourceDir, outPath);
  }

  private async writePerProjectFiles(
    destDir: string,
    kitVersion: string,
    opts: ProxyOptions
  ): Promise<string> {
    const createdAt = new Date().toISOString();
    // Phase 11 (spec 028 amendment 2026-05-23): createToken requires projectId
    // so the resulting token lives in mcpapitokens and is accepted by both
    // mcp.wxperts.com AND projectKitAuth on wxkanban.wxperts.com.
    const newToken = await apiTokenService.createToken(
      opts.userId,
      opts.companyId,
      opts.projectId,
      `Kit Download Token ${createdAt}`,
    );
    const apiToken = newToken.token;

    // [SPEC 028 / T050] Hosted MCP — no DB credentials shipped in the kit.
    // mcp.wxperts.com authenticates via WXKANBAN_API_TOKEN bearer only.
    const mcpBaseUrl = process.env.WXKANBAN_MCP_BASE_URL || 'https://mcp.wxperts.com';

    const projectConfig = {
      projectId: opts.projectId,
      version: kitVersion,
      createdAt,
      mode: 'new',
      kitVersion,
      mcpBaseUrl,
      commandsDir: '_wxAI/commands/',
      rulesDir: '_wxAI/rules/',
      vscodeDir: '.vscode/',
    };
    await fsp.writeFile(
      path.join(destDir, '.wxkanban-project.json'),
      JSON.stringify(projectConfig, null, 2) + '\n',
      'utf8'
    );

    const aiSettings = {
      projectId: opts.projectId,
      primaryAi: 'generic',
      mcpServers: {
        wxkanban: {
          transport: 'https',
          url: mcpBaseUrl,
          env: {
            WXKANBAN_MCP_BASE_URL: mcpBaseUrl,
            WXKANBAN_API_TOKEN: apiToken,
            WXKANBAN_PROJECT_ID: opts.projectId,
          },
        },
      },
      customCommands: [],
    };
    await fsp.writeFile(
      path.join(destDir, 'ai-settings.json'),
      JSON.stringify(aiSettings, null, 2) + '\n',
      'utf8'
    );

    const envContent =
`# wxKanban Project Environment (hosted MCP, spec 028)
WXKANBAN_MCP_BASE_URL=${mcpBaseUrl}
WXKANBAN_API_TOKEN=${apiToken}
WXKANBAN_PROJECT_ID=${opts.projectId}
`;
    await fsp.writeFile(path.join(destDir, '.env'), envContent, 'utf8');

    // [SCOPE 095 / T001] BEGIN — register the hosted MCP with Claude Code.
    // Claude Code reads project MCP servers from .mcp.json at the workspace root
    // (NOT ai-settings.json / .env), so a fresh download only connects if this file
    // ships. Write the hardened Streamable-HTTP form with a LITERAL bearer token —
    // Claude Code does not expand ${VAR} from .env, so a literal token is required
    // and no .claude/settings.local.json duplication is needed. Mirrors the
    // orchestrator's scripts/init.mjs::writeClaudeMcpRegistration. Merge-safe:
    // preserve any other mcpServers already present. The file carries a secret and
    // is gitignored (below); the upgrade path strips it (UPGRADE_STRIP_FILES).
    const mcpJsonPath = path.join(destDir, '.mcp.json');
    let existingMcp: unknown;
    try {
      existingMcp = JSON.parse(await fsp.readFile(mcpJsonPath, 'utf8'));
    } catch {
      existingMcp = undefined;
    }
    const mcpDoc = buildMcpJsonDoc(mcpBaseUrl, apiToken, existingMcp);
    await fsp.writeFile(mcpJsonPath, JSON.stringify(mcpDoc, null, 2) + '\n', 'utf8');
    await this.ensureGitignored(destDir, '.mcp.json');
    // [SCOPE 095 / T001] END

    // Spec 019 R14 AC4(c) — overwrite the kit's default ProjectOverview.md
    // with the per-project content from projectdocuments. On miss / empty /
    // DB error: leave the default template that ships in the tarball.
    const projectOverview = await this.fetchProjectOverviewContent(opts.projectId);
    if (projectOverview) {
      await fsp.writeFile(path.join(destDir, 'ProjectOverview.md'), projectOverview, 'utf8');
    }

    return apiToken;
  }

  // [SCOPE 095 / T001] BEGIN — ensure a path is gitignored in the kit archive.
  // .mcp.json carries a project API token, so it must never be committed by the
  // consumer. Mirrors scripts/init.mjs::ensureGitignored (idempotent append).
  private async ensureGitignored(destDir: string, rel: string): Promise<void> {
    const giPath = path.join(destDir, '.gitignore');
    let content = '';
    try {
      content = await fsp.readFile(giPath, 'utf8');
    } catch {
      content = '';
    }
    const already = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .includes(rel);
    if (already) return;
    const sep = content.length && !content.endsWith('\n') ? '\n' : '';
    await fsp.writeFile(
      giPath,
      `${content}${sep}# wxKanban MCP registration (contains a project API token)\n${rel}\n`,
      'utf8'
    );
  }
  // [SCOPE 095 / T001] END

  /**
   * Spec 019 R14 AC4(c) — mirrors KitGenerationService.resolveProjectOverviewContent.
   * Returns the per-project ProjectOverview content from projectdocuments
   * (preferring doctype 'ProjectOverview', falling back to legacy 'overview'),
   * or null if no row exists, content is empty, or the query fails. Callers
   * use null to mean "leave the default template in place".
   */
  private async fetchProjectOverviewContent(projectId: string): Promise<string | null> {
    try {
      const rows = await db
        .select({ doctype: projectdocuments.doctype, content: projectdocuments.content })
        .from(projectdocuments)
        .where(
          and(
            eq(projectdocuments.projectid, projectId),
            isNull(projectdocuments.specid),
            inArray(projectdocuments.doctype, ['ProjectOverview', 'overview'])
          )
        )
        .orderBy(desc(projectdocuments.updatedat));

      const preferred = rows.find(r => r.doctype === 'ProjectOverview') ?? rows[0];
      if (preferred && preferred.content && preferred.content.trim().length > 0) {
        return preferred.content;
      }
      return null;
    } catch (err) {
      logger.warn({ err, projectId }, 'fetchProjectOverviewContent failed; using default template');
      return null;
    }
  }

  /**
   * AC1-5: Full flow. Called by /api/projects/:id/kit/download when
   * KIT_DOWNLOAD_SOURCE=orchestrator. Sets Content-Type, Content-Disposition,
   * X-Kit-Version, X-Kit-Sha256 headers; streams the injected archive to res;
   * emits project.capture_event audit record; cleans up the injected temp file.
   *
   * Errors surface as KitProxyError with HTTP status so the route layer can
   * translate them to response codes (spec R14 error mapping).
   */
  async serve(res: Response, opts: ProxyOptions): Promise<ProxyResult> {
    const startedAt = Date.now();
    const assets = await this.resolveRelease(opts.version, opts.platform);
    const verified = await this.fetchAndVerify(assets);
    const injected = await this.injectPerProjectFiles(verified, opts);

    const ext = injected.format === 'zip' ? 'zip' : 'tar.gz';
    const contentType = injected.format === 'zip' ? 'application/zip' : 'application/gzip';
    const filename = `wxkanban-kit-${opts.projectId}-${assets.tag}.${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Kit-Source', 'orchestrator-proxy');
    res.setHeader('X-Kit-Version', assets.tag);
    res.setHeader('X-Kit-Sha256', injected.sha256);
    // Match the legacy-DB download path: surface the freshly-minted token so the
    // client can reveal it for copy/paste into .env (the file is hidden by Finder
    // on macOS). The raw token is not recoverable server-side after this.
    if (injected.apiToken) {
      res.setHeader('X-API-Token', injected.apiToken);
    }
    res.setHeader('Content-Length', String(injected.bytes));

    try {
      await pipeline(createReadStream(injected.path), res);
    } finally {
      await fsp.unlink(injected.path).catch(() => undefined);
    }
    await this.recordServedVersion(opts.projectId, assets.tag); // [SCOPE 083 / T014] FR-010

    const durationMs = Date.now() - startedAt;
    logger.info(
      {
        projectId: opts.projectId,
        tag: assets.tag,
        format: injected.format,
        bytes: injected.bytes,
        durationMs,
      },
      'kit proxy served'
    );

    // Best-effort audit — never fails the response. sha256 is NOT logged to
    // avoid leaking a fingerprint of per-project secrets.
    void captureKitDownloadEvent({
      projectId: opts.projectId,
      userId: opts.userId,
      tag: assets.tag,
      format: injected.format,
      bytes: injected.bytes,
      durationMs,
    }).catch(err => logger.warn({ err }, 'kit download audit event failed'));

    return { tag: assets.tag, format: injected.format, shaServed: injected.sha256, bytes: injected.bytes, durationMs };
  }

  /**
   * R15 AC1+AC2+AC3+AC4 — kit upgrade (preserve-mode).
   * Same archive resolve/verify path as serve(), but strips per-project files
   * and customizable templates from the staged dir before re-pack so the
   * resulting archive is safe to extract over an existing install.
   *
   * Refuses (409) when no prior projectkits row exists for this project, or
   * when the resolved target is older than the consumer's current version
   * unless allowDowngrade=true.
   */
  async serveUpgrade(res: Response, opts: UpgradeOptions): Promise<UpgradeResult> {
    const startedAt = Date.now();

    const installedRow = await this.getInstalledKitRow(opts.projectId);
    if (!installedRow) {
      throw new KitProxyError(
        409,
        'No prior kit install found for this project. Use /api/projects/:id/kit/download for the initial install.'
      );
    }
    const fromVersion = opts.fromVersion || installedRow.kitversion || 'unknown';

    const assets = await this.resolveRelease(opts.version, opts.platform);

    if (!opts.allowDowngrade && fromVersion !== 'unknown' && compareSemver(assets.tag, fromVersion) < 0) {
      throw new KitProxyError(
        409,
        `Refusing to serve ${assets.tag} over installed ${fromVersion}. Pass ?allowDowngrade=true to override.`
      );
    }

    const verified = await this.fetchAndVerify(assets);
    const stripped = await this.stripForUpgradeArchive(verified);

    const ext = stripped.format === 'zip' ? 'zip' : 'tar.gz';
    const contentType = stripped.format === 'zip' ? 'application/zip' : 'application/gzip';
    const filename = `wxkanban-kit-upgrade-${opts.projectId}-${fromVersion}-to-${assets.tag}.${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Kit-Source', 'orchestrator-proxy');
    res.setHeader('X-Kit-Mode', 'upgrade');
    res.setHeader('X-Kit-Version', assets.tag);
    res.setHeader('X-Kit-FromVersion', fromVersion);
    res.setHeader('X-Kit-Sha256', stripped.sha256);
    res.setHeader('Content-Length', String(stripped.bytes));

    try {
      await pipeline(createReadStream(stripped.path), res);
    } finally {
      await fsp.unlink(stripped.path).catch(() => undefined);
    }
    await this.recordServedVersion(opts.projectId, assets.tag); // [SCOPE 083 / T014] FR-010

    const durationMs = Date.now() - startedAt;
    logger.info(
      {
        projectId: opts.projectId,
        fromVersion,
        toVersion: assets.tag,
        format: stripped.format,
        bytes: stripped.bytes,
        durationMs,
      },
      'kit proxy upgrade served'
    );

    void captureKitUpgradeEvent({
      projectId: opts.projectId,
      userId: opts.userId,
      fromVersion,
      toVersion: assets.tag,
      format: stripped.format,
      bytes: stripped.bytes,
      durationMs,
    }).catch(err => logger.warn({ err }, 'kit upgrade audit event failed'));

    return {
      tag: assets.tag,
      format: stripped.format,
      shaServed: stripped.sha256,
      bytes: stripped.bytes,
      durationMs,
      fromVersion,
      toVersion: assets.tag,
    };
  }

  /**
   * R15 AC8 — cheap "is there an upgrade?" check used by the VSCode
   * folder-open task. Reuses the resolveRelease cache so repeated calls
   * across a workspace are free.
   */
  async latestVersion(opts: Pick<ProxyOptions, 'projectId' | 'platform'>): Promise<LatestVersionResult> {
    const installedRow = await this.getInstalledKitRow(opts.projectId);
    const currentVersion = installedRow?.kitversion ?? null;

    const endpoint = `${GITHUB_API}/repos/${ORCH_OWNER}/${ORCH_REPO}/releases/latest`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wxkanban-kit-proxy',
    };
    const token = process.env.GITHUB_KIT_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: globalThis.Response;
    try {
      response = await fetch(endpoint, { headers });
    } catch (err) {
      throw new KitProxyError(503, `kit source unavailable: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new KitProxyError(503, `GitHub API returned ${response.status}`);
    }
    const release = (await response.json()) as {
      tag_name?: string;
      published_at?: string;
      html_url?: string;
    };
    if (!release.tag_name) {
      throw new KitProxyError(502, 'malformed GitHub release payload');
    }

    if (!opts.platform || opts.platform === 'unix' || opts.platform === 'windows') {
      this.latestResolution = { tag: release.tag_name, resolvedAt: Date.now() };
    }

    return {
      currentVersion,
      latestVersion: release.tag_name,
      upgradeAvailable: currentVersion ? compareSemver(release.tag_name, currentVersion) > 0 : true,
      releaseUrl: release.html_url ?? `https://github.com/${ORCH_OWNER}/${ORCH_REPO}/releases/tag/${release.tag_name}`,
      publishedAt: release.published_at ?? null,
    };
  }

  // [SCOPE 083 / T014] BEGIN — record the version actually served (FR-010)
  // projectkits.kitversion used to be written only when the row was first inserted, so every
  // later upgrade left latest-version reporting the install-day version with
  // upgradeAvailable: true (feedback 6d76a9fb — 150 of 153 rows stale). Runs only after the
  // archive streamed without error. Best effort: never fails a response that already went out.
  private async recordServedVersion(projectId: string, tag: string): Promise<void> {
    const version = tag.replace(/^v/i, '');
    try {
      await db
        .update(projectkits)
        .set({ kitversion: version, updatedat: new Date() })
        .where(eq(projectkits.projectid, projectId));
    } catch (err) {
      logger.warn({ err, projectId, version }, 'recording served kit version failed');
    }
  }
  // [SCOPE 083 / T014] END

  private async getInstalledKitRow(projectId: string): Promise<{ kitversion: string | null } | null> {
    try {
      const [row] = await db
        .select({ kitversion: projectkits.kitversion })
        .from(projectkits)
        .where(eq(projectkits.projectid, projectId))
        .limit(1);
      return row ?? null;
    } catch (err) {
      logger.warn({ err, projectId }, 'getInstalledKitRow failed');
      return null;
    }
  }

  /**
   * R15 AC2 — extract → delete strip-list files → repack. Result is safe to
   * extract over an existing install.
   */
  private async stripForUpgradeArchive(verified: VerifiedArchive): Promise<InjectedArchive> {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wxkanban-upgrade-'));
    try {
      await this.extractArchive(verified.path, verified.format, workDir);
      for (const relPath of UPGRADE_STRIP_FILES) {
        // recursive: true lets the same call remove files OR directories (mcp-server tree, per T053).
        await fsp.rm(path.join(workDir, relPath), { force: true, recursive: true }).catch(() => undefined);
      }
      const outPath = path.join(
        os.tmpdir(),
        `wxkanban-kit-upgrade-${verified.tag}-${crypto.randomBytes(4).toString('hex')}.${verified.format === 'zip' ? 'zip' : 'tar.gz'}`
      );
      await this.repackArchive(workDir, verified.format, outPath);
      const stat = await fsp.stat(outPath);
      const sha256 = await hashFile(outPath);
      return { path: outPath, sha256, format: verified.format, bytes: stat.size };
    } finally {
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export const kitProxyService = KitProxyService.getInstance();

/**
 * AC3: Derive platform from ?platform= query param (authoritative) or
 * User-Agent fallback. Default: 'unix'.
 */
export function derivePlatform(
  queryPlatform: string | undefined,
  userAgent: string | undefined
): KitPlatform {
  if (queryPlatform === 'unix' || queryPlatform === 'windows') return queryPlatform;
  if (userAgent && /windows/i.test(userAgent)) return 'windows';
  return 'unix';
}

export function formatFor(platform: KitPlatform): KitArchiveFormat {
  return platform === 'windows' ? 'zip' : 'tar.gz';
}

export const ORCHESTRATOR_REPO = { owner: ORCH_OWNER, repo: ORCH_REPO } as const;

async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function extractZip(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('yauzl.open returned no zipfile'));

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const entryPath = path.join(destDir, entry.fileName);

        // Reject path traversal — any entry that escapes destDir.
        const resolved = path.resolve(entryPath);
        if (!resolved.startsWith(path.resolve(destDir) + path.sep) && resolved !== path.resolve(destDir)) {
          return reject(new Error(`zip entry escapes destination: ${entry.fileName}`));
        }

        if (/\/$/.test(entry.fileName)) {
          fsp.mkdir(entryPath, { recursive: true }).then(() => zipfile.readEntry()).catch(reject);
          return;
        }

        fsp.mkdir(path.dirname(entryPath), { recursive: true }).then(() => {
          zipfile.openReadStream(entry, (readErr, readStream) => {
            if (readErr || !readStream) return reject(readErr ?? new Error('openReadStream failed'));
            const ws = createWriteStream(entryPath);
            readStream.on('error', reject);
            ws.on('error', reject);
            ws.on('close', () => zipfile.readEntry());
            readStream.pipe(ws);
          });
        }).catch(reject);
      });

      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });
}

async function captureKitUpgradeEvent(meta: {
  projectId: string;
  userId: string;
  fromVersion: string;
  toVersion: string;
  format: KitArchiveFormat;
  bytes: number;
  durationMs: number;
}): Promise<void> {
  const mcpUrl = process.env.MCP_HTTP_URL || 'http://localhost:3002';
  const response = await fetch(`${mcpUrl}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'project.capture_event',
      args: {
        projectId: meta.projectId,
        type: 'manual_note',
        source: 'kit-proxy',
        actor: meta.userId,
        rawContent: `Kit upgraded via proxy: ${meta.fromVersion} → ${meta.toVersion} (${meta.format})`,
        metadata: {
          event: 'kit_upgrade',
          fromVersion: meta.fromVersion,
          toVersion: meta.toVersion,
          format: meta.format,
          bytes: meta.bytes,
          durationMs: meta.durationMs,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`MCP capture_event returned ${response.status}`);
  }
}

/**
 * Compare two semver-ish tags ("v0.1.9", "v0.2.0", "0.1.10").
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Non-numeric tags compare lexically as a fallback.
 */
function compareSemver(a: string, b: string): number {
  const norm = (s: string) => s.replace(/^v/, '').split('.').map(p => parseInt(p, 10));
  const aParts = norm(a);
  const bParts = norm(b);
  if (aParts.some(Number.isNaN) || bParts.some(Number.isNaN)) {
    return a.localeCompare(b);
  }
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

async function captureKitDownloadEvent(meta: {
  projectId: string;
  userId: string;
  tag: string;
  format: KitArchiveFormat;
  bytes: number;
  durationMs: number;
}): Promise<void> {
  const mcpUrl = process.env.MCP_HTTP_URL || 'http://localhost:3002';
  const response = await fetch(`${mcpUrl}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'project.capture_event',
      args: {
        projectId: meta.projectId,
        type: 'manual_note',
        source: 'kit-proxy',
        actor: meta.userId,
        rawContent: `Kit downloaded via proxy: ${meta.tag} (${meta.format})`,
        metadata: {
          event: 'kit_download',
          tag: meta.tag,
          format: meta.format,
          bytes: meta.bytes,
          durationMs: meta.durationMs,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`MCP capture_event returned ${response.status}`);
  }
}

function repackZip(sourceDir: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', () => resolve());
    out.on('error', reject);
    archive.on('error', reject);
    archive.pipe(out);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
