/**
 * SPEC-142 T020 / FR-020: kit upgrade keeps decisions/ project-owned.
 *
 * Drives the REAL consumer upgrade script (wxKanban-agent-Orchestrator/scripts/upgrade-kit.mjs)
 * against a real temp tree, the same way that repo's own preservation suite does: the script is
 * copied into <tmpConsumer>/scripts and imported, minus its trailing main() call.
 * Skipped when the sibling orchestrator checkout is absent.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ORCH_SCRIPT = path.resolve(ROOT, '..', 'wxKanban-agent-Orchestrator', 'scripts', 'upgrade-kit.mjs');
const haveOrch = fs.existsSync(ORCH_SCRIPT);

let tmp: string;
let counter = 0;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit142-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* handle held briefly on Windows */ } });

// [SCOPE 142 / T020] BEGIN — Kit sync keeps decisions/** and settings project-owned (FR-…
function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
// [SCOPE 142 / T020] END

// [SCOPE 142 / T020] BEGIN — Kit sync keeps decisions/** and settings project-owned (FR-…
function snapshotTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, prefix: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else out[rel] = fs.readFileSync(path.join(d, e.name)).toString('base64');
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}
// [SCOPE 142 / T020] END

interface KitModule {
  reconcileStaging: (staging: string, manifest: { files: Record<string, string> }) => { preserved: string[]; replaced: string[] };
  walkRelative: (dir: string) => string[];
}

// [SCOPE 142 / T020] BEGIN — Kit sync keeps decisions/** and settings project-owned (FR-…
async function loadKit(consumerRoot: string): Promise<KitModule> {
  let src = fs.readFileSync(ORCH_SCRIPT, 'utf8');
  const cut = src.indexOf('main().catch');
  expect(cut).toBeGreaterThan(0);
  src = src.slice(0, cut) + '\nexport { reconcileStaging, walkRelative };\n';
  const file = path.join(consumerRoot, 'scripts', `kit-under-test-${counter++}.mjs`);
  write(file, src);
  return (await import(pathToFileURL(file).href)) as KitModule;
}
// [SCOPE 142 / T020] END

describe.skipIf(!haveOrch)('FR-020 upgrade leaves decisions/ byte-for-byte unchanged', () => {
  const LEDGER = '- id: D-0001\n  question: "q é"\n  decision: "d"\r\n';
  const populate = (root: string): void => {
    write(path.join(root, 'decisions/ledger.yaml'), LEDGER);
    write(path.join(root, 'decisions/settings.yaml'), 'gate:\n  mode: enforce\nminimalCode:\n  level: lite\n');
    write(path.join(root, 'decisions/gate-log.jsonl'), '{"a":1}\n');
    write(path.join(root, 'decisions/assumptions.yaml'), '[]\n');
    write(path.join(root, '_wxAI/askgate/gate.mjs'), 'stock v1\n');
  };

  it('does not touch decisions/ even when an archive wrongly carries it', async () => {
    const consumer = path.join(tmp, 'consumer');
    populate(consumer);
    const before = snapshotTree(path.join(consumer, 'decisions'));

    const staging = path.join(tmp, 'staging');
    write(path.join(staging, '_wxAI/askgate/gate.mjs'), 'stock v2\n');
    write(path.join(staging, 'decisions/ledger.yaml'), 'KIT OVERWRITE\n');
    write(path.join(staging, 'decisions/settings.yaml'), 'gate:\n  mode: observe\n');
    write(path.join(staging, 'decisions/new-from-kit.yaml'), 'x\n');

    const kit = await loadKit(consumer);
    const manifest = { files: { '_wxAI/askgate/gate.mjs': 'stale' } };
    const result = kit.reconcileStaging(staging, manifest);

    expect(snapshotTree(path.join(consumer, 'decisions'))).toEqual(before);
    expect(result.preserved.some((p) => p.startsWith('decisions/'))).toBe(false);
    expect(result.replaced.some((p) => p.startsWith('decisions/'))).toBe(false);
    expect(fs.existsSync(path.join(consumer, 'decisions/ledger.yaml.kit-new'))).toBe(false);
    expect(fs.existsSync(path.join(consumer, 'decisions/new-from-kit.yaml'))).toBe(false);
  });

  it('still delivers genuine kit files (the guard is not over-broad)', async () => {
    const consumer = path.join(tmp, 'consumer');
    populate(consumer);
    const staging = path.join(tmp, 'staging');
    write(path.join(staging, '_wxAI/askgate/new.mjs'), 'brand new\n');
    const kit = await loadKit(consumer);
    kit.reconcileStaging(staging, { files: {} });
    expect(fs.readFileSync(path.join(consumer, '_wxAI/askgate/new.mjs'), 'utf8')).toBe('brand new\n');
  });

  it('the no-manifest overwrite loop in applyUpgrade skips project-owned paths', () => {
    const src = fs.readFileSync(ORCH_SCRIPT, 'utf8');
    const loop = src.indexOf('Falling back to a full overwrite');
    expect(loop).toBeGreaterThan(0);
    expect(src.slice(loop, loop + 700)).toContain('isProjectOwned(rel)');
  });
});

describe('FR-020 server and author-side sync never ship decisions/', () => {
  it('the upgrade archive strip list removes decisions', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/server/services/KitProxyService.ts'), 'utf8');
    const block = src.slice(src.indexOf('const UPGRADE_STRIP_FILES'), src.indexOf('] as const;', src.indexOf('const UPGRADE_STRIP_FILES')));
    expect(block).toContain("'decisions'");
  });

  it('sync-to-orchestrator mirrors _wxAI/ and .claude/commands wholesale and never decisions/', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/sync-to-orchestrator.mjs'), 'utf8');
    expect(src).toMatch(/const KIT_DIRS = \[[^\]]*'_wxAI'/);
    expect(src).not.toMatch(/const KIT_DIRS = \[[^\]]*decisions/);
    expect(src).not.toMatch(/CLAUDE_AUTHOR_ONLY_DIRS = new Set\(\[[^\]]*commands/);
  });

  it('the pack-time allowlist covers _wxAI and .claude as directories', () => {
    if (!haveOrch) return;
    const src = fs.readFileSync(path.resolve(ROOT, '..', 'wxKanban-agent-Orchestrator', 'scripts', 'build-release.mjs'), 'utf8');
    expect(src).toMatch(/KIT_INCLUDE_DIRS\s*=\s*\[[^\]]*'_wxAI'[^\]]*'\.claude'/);
    expect(src).not.toMatch(/KIT_INCLUDE_DIRS\s*=\s*\[[^\]]*decisions/);
  });
});
