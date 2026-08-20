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
import crypto from 'node:crypto';
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
    ' writeKitManifest, reconcileStaging, walkRelative, classifyFile, reportChanges, isPreserveTree, applyUpgrade, cleanupStaleAfterExtract };\n';
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
  const snapshot = m.snapshotBeforeUpgrade(archive);
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
  // main() merges here, while staging still holds the kit's own package.json. The
  // harness omitted this step while claiming to mirror the sequence, which is why
  // the merge defect had no test that could see it.
  m.mergePackageJson(snapshot.dir, staging);
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

  it('kit dependency and script updates still arrive on the SECOND upgrade', async (ctx) => {
    // From the second upgrade onward, reconcileStaging classifies a customized
    // package.json as `modified` and deliberately does NOT write the kit's copy to
    // the root. mergePackageJson read its kit half FROM the root, so `before` and
    // `kit` were the same bytes: it found nothing of the kit's to apply and returned
    // null without a word. Kit-owned dependency bumps and newly shipped scripts
    // stopped arriving for every consumer past their first upgrade.
    //
    // The test above cannot catch that. It extracts straight over the root first,
    // which puts the kit's package.json exactly where the broken code expected to
    // find it — the test constructs the state the function needs in order to work.
    const consumer = path.join(tmp, 'consumer');
    buildConsumer(consumer);

    const k1 = path.join(tmp, 'mk1');
    const k2 = path.join(tmp, 'mk2');
    buildKitTree(k1, 1);
    buildKitTree(k2, 2);
    // v2 of the KIT's package.json: a dependency range it owns, plus a script it
    // newly ships. Neither can reach the consumer except through the merge.
    write(
      path.join(k2, 'package.json'),
      JSON.stringify(
        {
          name: 'kit',
          scripts: { 'build:server': 'tsc', 'kit:start': 'node scripts/kit-start.mjs' },
          dependencies: { express: '4.20.1' },
        },
        null,
        2
      ) + '\n'
    );
    const a1 = makeArchive(k1, path.join(tmp, 'mk1.tar.gz'), 'tar.gz');
    const a2 = makeArchive(k2, path.join(tmp, 'mk2.tar.gz'), 'tar.gz');
    if (!a1 || !a2) ctx.skip('no tar archiver on this platform');

    await upgrade(consumer, a1, { firstRun: true });   // establishes the manifest baseline
    await upgrade(consumer, a2, { firstRun: false });  // reconcile path — the one that regressed

    const pkg = JSON.parse(fs.readFileSync(path.join(consumer, 'package.json'), 'utf8'));

    // The consumer's half is still theirs.
    expect(pkg.name).toBe('customer');
    expect(pkg.dependencies['@me/lib']).toBe('file:local/lib');
    expect(pkg.scripts['dev:mine']).toBe('vite');
    expect(pkg.scripts['build:server']).toBe('esbuild custom'); // their collision still wins

    // ...and the kit's half actually arrived.
    expect(pkg.dependencies.express).toBe('4.20.1');
    expect(pkg.scripts['kit:start']).toBe('node scripts/kit-start.mjs');
  });
});

/** Hash every file under `dir`, so "nothing changed" can be asserted rather than assumed. */
function treeFingerprint(dir) {
  const out = {};
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else out[child] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, child))).digest('hex');
    }
  };
  walk('');
  return out;
}

/** The minimum a real applyUpgrade() touches beyond the archive. */
function buildUpgradeableConsumer(consumerRoot) {
  buildConsumer(consumerRoot);
  write(
    path.join(consumerRoot, '.wxkanban-project.json'),
    JSON.stringify({ projectId: 'p1', version: 'v1', kitVersion: 'v1' }, null, 2) + '\n'
  );
}

describe('[SPEC 121 / T013] the dry run models the real run', () => {
  it('writes absolutely nothing into the project', async (ctx) => {
    // The claim `--dry-run` makes is "Nothing was changed". Before T013 that claim was
    // false before the dry-run branch was even reached: services were stopped and, on a
    // pre-v1.1.0 kit, mcp-server/ was deleted. Assert the claim instead of trusting it.
    const consumer = path.join(tmp, 'consumer');
    buildUpgradeableConsumer(consumer);

    const k1 = path.join(tmp, 'dk1');
    buildKitTree(k1, 1);
    const a1 = makeArchive(k1, path.join(tmp, 'dk1.tar.gz'), 'tar.gz');
    if (!a1) ctx.skip('no tar archiver on this platform');

    const m = await loadKit(consumer);
    const before = treeFingerprint(consumer);
    // An empty fingerprint would make the comparison below pass for the wrong reason.
    expect(Object.keys(before).length).toBeGreaterThan(3);

    // A copy of the archive per call: applyUpgrade unlinks it when it finishes.
    const arch = path.join(tmp, 'dk1-run.tar.gz');
    fs.copyFileSync(a1, arch);
    await m.applyUpgrade({
      download: { archivePath: arch, toVersion: 'v2', fromVersion: 'v1', source: 'test' },
      manifest: null,
      dryRun: true,
      assumeYes: true,
    });

    expect(treeFingerprint(consumer)).toEqual(before);
  });

  it('previews the deletions the dist cutover triggers, which it used to miss entirely', async (ctx) => {
    // cleanupStaleAfterExtract decides from `wxkanban-agent/dist/cli.cjs` being present.
    // The dry run asked the root BEFORE the overlay, so when the INCOMING archive is what
    // introduces dist/, the preview saw no dist, reported zero source-tree deletions, and
    // the real run then removed six directories the user was never warned about.
    const consumer = path.join(tmp, 'consumer');
    buildUpgradeableConsumer(consumer);
    // Raw source trees the cutover prunes once the compiled bundle lands.
    write(path.join(consumer, 'wxkanban-agent/core/thing.ts'), 'source\n');
    write(path.join(consumer, 'wxkanban-agent/services/svc.ts'), 'source\n');

    const kit = path.join(tmp, 'dk2');
    buildKitTree(kit, 2);
    write(path.join(kit, 'wxkanban-agent/dist/cli.cjs'), 'compiled\n'); // the flip
    const arch = makeArchive(kit, path.join(tmp, 'dk2.tar.gz'), 'tar.gz');
    if (!arch) ctx.skip('no tar archiver on this platform');

    const m = await loadKit(consumer);

    // Root has no dist/ yet — the state the old preview judged from.
    expect(fs.existsSync(path.join(consumer, 'wxkanban-agent/dist/cli.cjs'))).toBe(false);
    expect(m.cleanupStaleAfterExtract({ dryRun: true })).not.toContain('wxkanban-agent/core');

    const run = path.join(tmp, 'dk2-run.tar.gz');
    fs.copyFileSync(arch, run);
    const result = await m.applyUpgrade({
      download: { archivePath: run, toVersion: 'v2', fromVersion: 'v1', source: 'test' },
      manifest: null,
      dryRun: true,
      assumeYes: true,
    });

    expect(result.deleted).toContain('wxkanban-agent/core');
    expect(result.deleted).toContain('wxkanban-agent/services');
    // ...and it still wrote nothing while saying so.
    expect(fs.existsSync(path.join(consumer, 'wxkanban-agent/core/thing.ts'))).toBe(true);
  });

  it('names the writes that are not file replacements', async (ctx) => {
    // The manifest, package.json, .wxkanban-project.json and init all write, and the
    // preview modelled none of them — so its counts read as the whole story when they
    // were a subset. Each must now appear by name.
    const consumer = path.join(tmp, 'consumer');
    buildUpgradeableConsumer(consumer);

    const kit = path.join(tmp, 'dk3');
    buildKitTree(kit, 2);
    const arch = makeArchive(kit, path.join(tmp, 'dk3.tar.gz'), 'tar.gz');
    if (!arch) ctx.skip('no tar archiver on this platform');

    const m = await loadKit(consumer);
    const run = path.join(tmp, 'dk3-run.tar.gz');
    fs.copyFileSync(arch, run);
    const result = await m.applyUpgrade({
      download: { archivePath: run, toVersion: 'v9', fromVersion: 'v1', source: 'test' },
      manifest: null,
      dryRun: true,
      assumeYes: true,
    });

    const said = result.alsoWrites.join(' | ');
    expect(said).toMatch(/kit-manifest\.json/);
    expect(said).toMatch(/package\.json/);
    expect(said).toMatch(/\.wxkanban-project\.json version to v9/);
    expect(said).toMatch(/init\.mjs/);
    expect(said).toMatch(/snapshot/);
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
