// The kit release mirrors the FILESYSTEM into a PUBLIC release, so a gitignored secret inside a
// mirrored directory still ships (v1.7.83 and v1.7.84 shipped wxkanban-agent/.wxai/.entitlement).
// These tests pin the name rules, the scan, and that sync-to-orchestrator.mjs still uses both.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const GATE_FILE = join(ROOT, 'scripts', 'release-secret-gate.mjs');
const SYNC = readFileSync(join(ROOT, 'scripts', 'sync-to-orchestrator.mjs'), 'utf8');

interface GateModule {
  isSecretName(name: string): boolean;
  findSecretPaths(dirs: string[], base: string): string[];
}
const gate = (await import(pathToFileURL(GATE_FILE).href)) as GateModule;

describe('isSecretName', () => {
  it.each([
    '.entitlement',
    '.auth_token',
    '.mcp.json',
    'agent-room.json',
    'remote-session.lock',
    '.env',
    '.env.production',
    '.env.local',
    'server.pem',
    'private.key',
    'store.p12',
    'store.pfx',
    'andy_accessKeys.csv',
    'prod-credentials.csv',
    '.ENTITLEMENT',
    // [SCOPE 143 / T026] agent-run metering files
    'agentrun-tokens.json',
    'agentrun-log.jsonl',
    'agentrun-forwarded.txt',
    'agentrun-forward.lock',
  ])('blocks %s', (name) => {
    expect(gate.isSecretName(name)).toBe(true);
  });

  it.each([
    'project.json',
    'project.schema.json',
    'package.json',
    'kit-update-check.json',
    '.env.example',
    '.env.sample',
    'keys.md',
    'keyboard.ts',
    'monkey.ts',
    'entitlement-cache.ts',
    'credentials.md',
    'settings.json',
  ])('allows %s', (name) => {
    expect(gate.isSecretName(name)).toBe(false);
  });
});

describe('findSecretPaths', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('finds a nested secret, reports it relative to the base, and ignores clean files', () => {
    const base = mkdtempSync(join(tmpdir(), 'wx-secret-gate-'));
    dirs.push(base);
    mkdirSync(join(base, 'wxkanban-agent', '.wxai'), { recursive: true });
    mkdirSync(join(base, '_wxAI', 'rules'), { recursive: true });
    writeFileSync(join(base, 'wxkanban-agent', '.wxai', '.entitlement'), 'x');
    writeFileSync(join(base, 'wxkanban-agent', '.wxai', 'project.json'), '{}');
    writeFileSync(join(base, '_wxAI', 'rules', 'git.md'), 'rule');

    const found = gate.findSecretPaths([join(base, 'wxkanban-agent'), join(base, '_wxAI')], base);
    expect(found).toEqual(['wxkanban-agent/.wxai/.entitlement']);
  });

  it('does not descend into node_modules or .git', () => {
    const base = mkdtempSync(join(tmpdir(), 'wx-secret-gate-'));
    dirs.push(base);
    mkdirSync(join(base, 'kit', 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(base, 'kit', '.git'), { recursive: true });
    writeFileSync(join(base, 'kit', 'node_modules', 'pkg', 'test.pem'), 'x');
    writeFileSync(join(base, 'kit', '.git', 'config.key'), 'x');

    expect(gate.findSecretPaths([join(base, 'kit')], base)).toEqual([]);
  });

  it('returns an empty list for a directory that does not exist', () => {
    expect(gate.findSecretPaths([join(tmpdir(), 'wx-secret-gate-does-not-exist')], tmpdir())).toEqual([]);
  });
});

describe('sync-to-orchestrator.mjs uses both layers', () => {
  it('copyFilter rejects secret names before it allows anything', () => {
    const fn = SYNC.slice(SYNC.indexOf('function copyFilter'));
    const body = fn.slice(0, fn.indexOf('\nfunction ask('));
    const secret = body.indexOf('isSecretName(name)');
    const allow = body.indexOf('name !== ');
    expect(secret, 'copyFilter no longer calls isSecretName').toBeGreaterThan(-1);
    expect(allow).toBeGreaterThan(secret);
  });

  it('the staged-tree gate runs after the copy and before anything is committed', () => {
    const main = SYNC.slice(SYNC.indexOf('async function main()'));
    const rootCopy = main.indexOf('for (const f of KIT_FILES)');
    const gateCall = main.indexOf('assertNoSecretPaths(');
    const gitAdd = main.indexOf("['add', '--'");
    expect(rootCopy, 'root-file copy loop not found').toBeGreaterThan(-1);
    expect(gateCall, 'main no longer calls assertNoSecretPaths').toBeGreaterThan(rootCopy);
    expect(gitAdd).toBeGreaterThan(gateCall);
  });

  it('has no override flag for the secret gate', () => {
    expect(SYNC).not.toMatch(/allow-secret|skip-secret|--force-secret/);
  });
});
