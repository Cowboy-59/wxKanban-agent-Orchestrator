/**
 * [SPEC 121 / T012] Regression suite for consumer-file preservation on upgrade.
 *
 * These tests exist because unit tests could not have caught the original defect:
 * the loss was latent (node_modules survives an overwritten package.json, so
 * builds stay green until a later npm install prunes the tree) and it happened
 * in a child process running a system archiver. So the suite drives the REAL
 * script against a REAL archive on a REAL temporary tree — no mocks of fs or of
 * the extractor, because a mocked extractor is precisely what would have passed
 * while the shipped one destroyed twelve consumers' work.
 *
 * `root` inside upgrade-kit.mjs is derived from the module's own location, so
 * each test copies the script into <tmpConsumer>/scripts/ and imports it there.
 * Only the trailing `main()` auto-run line is removed; every function under test
 * is byte-identical to the shipped one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REAL_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'upgrade-kit.mjs'
);

let tmp;
let harnessCounter = 0;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit121-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows can hold a handle briefly; a leaked temp dir must not fail a run */
  }
});

/** Copy the shipped script into the fake consumer and import it. */
async function loadKit(consumerRoot) {
  let src = fs.readFileSync(REAL_SCRIPT, 'utf8');
  const cut = src.indexOf('main().catch');
  expect(cut, 'main() invocation should be present in the shipped script').toBeGreaterThan(0);
  src = src.slice(0, cut);
  src +=
    '\nexport { snapshotBeforeUpgrade, extractArchive, mergePackageJson, readKitManifest,' +
    ' writeKitManifest, reconcileStaging, walkRelative, classifyFile, reportChanges, isPreserveTree };\n';
  const dir = path.join(consumerRoot, 'scripts');
  fs.mkdirSync(dir, { recursive: true });
  // Unique filename per load: ESM caches modules by URL.
  const file = path.join(dir, `kit-under-test-${harnessCounter++}.mjs`);
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Build an archive of `dir` in the requested format, returning its path. */
function makeArchive(dir, out, format) {
  if (format === 'zip') {
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${path.join(dir, '*')}' -DestinationPath '${out}' -Force`],
      { windowsHide: true }
    );
    if (r.status !== 0) return null; // no PowerShell (Linux CI) — caller skips
    return out;
  }
  // Mirror resolveTarBinary(): a bare `tar` on a Windows PATH is often GNU tar
  // from WSL/msys, which reads `C:` as a remote host and fails. The product
  // prefers the system bsdtar, so the test must build with the same one.
  const winTar = 'C:\\Windows\\System32\\tar.exe';
  const tarBin = process.platform === 'win32' && fs.existsSync(winTar) ? winTar : 'tar';
  const r = spawnSync(tarBin, ['-czf', out, '.'], { cwd: dir, windowsHide: true });
  return r.status === 0 ? out : null;
}

/**
 * A consumer that has done all three things the field reports describe:
 * edited a kit script, added a file of their own, customized package.json.
 */
function buildConsumer(consumerRoot) {
  write(path.join(consumerRoot, '.claude/wxConversion/scripts/split.py'), 'STOCK v1\n');
  write(path.join(consumerRoot, '_wxAI/rules/house.md'), 'stock rule v1\n');
  write(path.join(consumerRoot, '_wxAI/MY-OWN.md'), 'project-only file\n');
  write(
    path.join(consumerRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'customer',
        scripts: { 'dev:mine': 'vite', 'build:server': 'esbuild custom' },
        dependencies: { '@me/lib': 'file:local/lib', express: '4.18.2' },
      },
      null,
      2
    ) + '\n'
  );
}

/** The kit archive contents for v1 (matching stock) and v2 (a genuine update). */
function buildKitTree(dir, version) {
  write(path.join(dir, '.claude/wxConversion/scripts/split.py'), version === 1 ? 'STOCK v1\n' : 'STOCK v2 improved\n');
  write(path.join(dir, '_wxAI/rules/house.md'), version === 1 ? 'stock rule v1\n' : 'stock rule v2\n');
  write(
    path.join(dir, 'package.json'),
    JSON.stringify(
      { name: 'kit', scripts: { 'build:server': 'tsc' }, dependencies: { express: '4.19.2' } },
      null,
      2
    ) + '\n'
  );
  if (version === 2) write(path.join(dir, '_wxAI/BRAND-NEW.md'), 'new in v2\n');
}

/**
 * Drive one full upgrade round. Returns the change set reconcile produced.
 * Mirrors main()'s sequence: snapshot → extract to staging → reconcile → manifest.
 */
async function upgrade(consumerRoot, archive, { firstRun }) {
  const m = await loadKit(consumerRoot);
  const staging = path.join(consumerRoot, '.wxai', `stg-${Math.abs(archive.length)}-${firstRun ? 1 : 2}`);
  fs.rmSync(staging, { recursive: true, force: true });
  m.snapshotBeforeUpgrade(archive);
  m.extractArchive(archive, staging);

  const manifest = m.readKitManifest();
  let changes;
  if (manifest) {
    changes = m.reconcileStaging(staging, manifest);
  } else {
    // No baseline: historic overwrite, which the snapshot is there to cover.
    const written = [];
    for (const rel of m.walkRelative(staging)) {
      const dest = path.join(consumerRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(staging, rel), dest);
      written.push(rel);
    }
    changes = { preserved: [], kitNew: [], replaced: written, counts: {} };
  }
  m.writeKitManifest(staging, firstRun ? 'v1' : 'v2');
  fs.rmSync(staging, { recursive: true, force: true });
  return { m, changes };
}

const FORMATS = ['tar.gz', 'zip'];

describe.each(FORMATS)('preservation on upgrade [%s archive]', (format) => {
  it('does not overwrite a consumer-modified kit file, and reports it', async (ctx) => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);

    const k1 = path.join(tmp, 'k1');
    const k2 = path.join(tmp, 'k2');
    buildKitTree(k1, 1);
    buildKitTree(k2, 2);
    const a1 = makeArchive(k1, path.join(tmp, `k1.${format}`), format);
    const a2 = makeArchive(k2, path.join(tmp, `k2.${format}`), format);
    if (!a1 || !a2) ctx.skip(`no ${format} archiver on this platform`);

    // Round 1 establishes the manifest baseline.
    await upgrade(consumer, a1, { firstRun: true });

    // The consumer edits a kit script — the work the field reports lost.
    const patched = path.join(consumer, '.claude/wxConversion/scripts/split.py');
    write(patched, 'CUSTOMER PATCH\n');

    const { changes } = await upgrade(consumer, a2, { firstRun: false });

    expect(fs.readFileSync(patched, 'utf8')).toBe('CUSTOMER PATCH\n');
    expect(changes.preserved).toContain('.claude/wxConversion/scripts/split.py');
    expect(fs.existsSync(`${patched}.kit-new`)).toBe(true);
    expect(fs.readFileSync(`${patched}.kit-new`, 'utf8')).toBe('STOCK v2 improved\n');
  });

  it('still delivers genuine updates and new files', async (ctx) => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const k1 = path.join(tmp, 'k1');
    const k2 = path.join(tmp, 'k2');
    buildKitTree(k1, 1);
    buildKitTree(k2, 2);
    const a1 = makeArchive(k1, path.join(tmp, `k1.${format}`), format);
    const a2 = makeArchive(k2, path.join(tmp, `k2.${format}`), format);
    if (!a1 || !a2) ctx.skip(`no ${format} archiver on this platform`);

    await upgrade(consumer, a1, { firstRun: true });
    await upgrade(consumer, a2, { firstRun: false });

    expect(fs.readFileSync(path.join(consumer, '_wxAI/rules/house.md'), 'utf8')).toBe('stock rule v2\n');
    expect(fs.readFileSync(path.join(consumer, '_wxAI/BRAND-NEW.md'), 'utf8')).toBe('new in v2\n');
  });

  it('never deletes-and-replaces a directory, so project-only files survive', async (ctx) => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const k1 = path.join(tmp, 'k1');
    const k2 = path.join(tmp, 'k2');
    buildKitTree(k1, 1);
    buildKitTree(k2, 2);
    const a1 = makeArchive(k1, path.join(tmp, `k1.${format}`), format);
    const a2 = makeArchive(k2, path.join(tmp, `k2.${format}`), format);
    if (!a1 || !a2) ctx.skip(`no ${format} archiver on this platform`);

    // A file of the consumer's own, inside a directory the kit also populates.
    write(path.join(consumer, '_wxAI/rules/MY-RULE.md'), 'mine\n');

    await upgrade(consumer, a1, { firstRun: true });
    await upgrade(consumer, a2, { firstRun: false });

    expect(fs.readFileSync(path.join(consumer, '_wxAI/rules/MY-RULE.md'), 'utf8')).toBe('mine\n');
    expect(fs.readFileSync(path.join(consumer, '_wxAI/MY-OWN.md'), 'utf8')).toBe('project-only file\n');
  });
});

describe('package.json merge', () => {
  it('keeps consumer scripts and dependencies, including file: deps', async (ctx) => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const kit = path.join(tmp, 'kit');
    buildKitTree(kit, 2);
    const archive = makeArchive(kit, path.join(tmp, 'kit.tar.gz'), 'tar.gz');
    if (!archive) ctx.skip('no tar archiver on this platform');

    const m = await loadKit(consumer);
    const snap = m.snapshotBeforeUpgrade(archive);
    m.extractArchive(archive, consumer); // worst case: straight overwrite
    expect(JSON.parse(fs.readFileSync(path.join(consumer, 'package.json'), 'utf8')).name).toBe('kit');

    m.mergePackageJson(snap.dir);
    const merged = JSON.parse(fs.readFileSync(path.join(consumer, 'package.json'), 'utf8'));

    expect(merged.name).toBe('customer');
    expect(merged.dependencies['@me/lib']).toBe('file:local/lib');
    expect(merged.scripts['dev:mine']).toBe('vite');
    // A consumer script that collides with a kit script is kept, not replaced.
    expect(merged.scripts['build:server']).toBe('esbuild custom');
    // Kit-owned dependency versions still track the kit.
    expect(merged.dependencies.express).toBe('4.19.2');
  });
});

describe('at-risk reporting', () => {
  it('returns a non-zero code when files are at risk, and zero when acknowledged', async () => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const m = await loadKit(consumer);

    expect(m.reportChanges({ preserved: [], deleted: [], replaced: ['a'], kitNew: [] })).toBe(0);
    expect(m.reportChanges({ preserved: ['x.py'], deleted: [], replaced: [], kitNew: ['x.py.kit-new'] })).toBe(2);
    expect(m.reportChanges({ preserved: [], deleted: ['gone.md'], replaced: [], kitNew: [] })).toBe(2);
    expect(
      m.reportChanges({ preserved: ['x.py'], deleted: [], replaced: [], kitNew: [], acknowledged: true })
    ).toBe(0);
  });

  it('recognises the declared customizable trees', async () => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const m = await loadKit(consumer);

    expect(m.isPreserveTree('.claude/wxConversion/scripts/split.py')).toBe(true);
    expect(m.isPreserveTree('_wxAI/rules/house.md')).toBe(true);
    expect(m.isPreserveTree('wxkanban-agent/core/thing.ts')).toBe(false);
  });
});

describe('snapshot', () => {
  it('captures every file the archive would overwrite, byte-identical', async (ctx) => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const kit = path.join(tmp, 'kit');
    buildKitTree(kit, 2);
    const archive = makeArchive(kit, path.join(tmp, 'kit.tar.gz'), 'tar.gz');
    if (!archive) ctx.skip('no tar archiver on this platform');

    const m = await loadKit(consumer);
    const original = fs.readFileSync(path.join(consumer, '.claude/wxConversion/scripts/split.py'));
    const snap = m.snapshotBeforeUpgrade(archive);

    const saved = path.join(snap.dir, '.claude/wxConversion/scripts/split.py');
    expect(fs.existsSync(saved)).toBe(true);
    expect(fs.readFileSync(saved).equals(original)).toBe(true);
  });

  it('refuses to proceed when the archive cannot be read', async () => {
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);
    const m = await loadKit(consumer);

    // die() exits the process; assert via a child so the suite survives.
    const probe = path.join(tmp, 'probe.mjs');
    fs.writeFileSync(
      probe,
      `const m = await import(${JSON.stringify(
        `file://${path.join(consumer, 'scripts', `kit-under-test-${harnessCounter - 1}.mjs`).replace(/\\/g, '/')}`
      )});\nm.snapshotBeforeUpgrade('${path.join(tmp, 'does-not-exist.tar.gz').replace(/\\/g, '/')}');\n`
    );
    const r = spawnSync('node', [probe], { encoding: 'utf8', windowsHide: true });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Refusing to extract unprotected/);
  });
});
