#!/usr/bin/env node
// [SCOPE 143 / T026] BEGIN — per-machine store of the project API token used to forward agent runs (FR-018, FR-003)
// The project API token that sends agent runs to wxKanban (SPEC-143 T026, FR-018). Plain Node ESM, no dependencies.
//
//   echo <token> | node _wxAI/routing/token-store.mjs --save --project <uuid> [--root <dir>] [--url <agent-runs url>]
//   node _wxAI/routing/token-store.mjs --check [--root <dir>]     exit 0 when this project has a token stored
//
// The token lives on this machine only: ~/.wxai/agentrun-tokens.json, outside every project tree, so it
// can never be committed or ship in a kit release. It is keyed by project id; each entry also records
// the project's root folder so the forwarder, which runs from a hook with only the folder to go on,
// finds its project without reading .env or any other project file. The token is read from stdin,
// never from the command line (a process list would show it). Nothing here ever prints a token.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const STORE_NAME = 'agentrun-tokens.json';
/**
 * Where the app takes agent runs when the store names no URL (SPEC-143 C1). The app host, the same
 * default as the kit's own (DEFAULT_API_URL in wxkanban-agent/core/orchestrator/kit-update-check.ts).
 * Not wxperts.com: that is the marketing site and answers every path with its home page.
 */
export const DEFAULT_AGENTRUNS_URL = 'https://wxkanban.wxperts.com/api/consultant-hub/agent-runs';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const storeFile = (home = process.env.WXAI_HOME || homedir()) => join(home, '.wxai', STORE_NAME);

/** Folder names compared the way the OS compares them (case-insensitive on Windows). */
export function sameRoot(a, b) {
  const norm = (p) => {
    const r = resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

export function readStore(file = storeFile()) {
  if (!existsSync(file)) return { projects: {} };
  try {
    const s = JSON.parse(readFileSync(file, 'utf8'));
    return s && typeof s === 'object' && s.projects && typeof s.projects === 'object' ? s : { projects: {} };
  } catch {
    return { projects: {} }; // unreadable store: treat as empty, never crash a hook
  }
}

function writeStore(file, store) {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* Windows ignores POSIX modes; the file is under the user's profile */ }
}

/** Save (or replace) the token for a project. Returns the entry without its token. */
export function saveProjectToken({ projectid, token, root, url = null, file = storeFile() }) {
  if (!UUID_RE.test(String(projectid ?? ''))) throw new Error('project id must be a UUID');
  if (typeof token !== 'string' || token.trim().length < 20) throw new Error('token looks too short to be a project API token');
  const store = readStore(file);
  // One project per folder: an older entry for the same folder under another id is dropped.
  for (const [id, e] of Object.entries(store.projects)) {
    if (id !== projectid && e?.root && root && sameRoot(e.root, root)) delete store.projects[id];
  }
  store.projects[projectid] = { token: token.trim(), root: root ? resolve(root) : null, url, savedat: new Date().toISOString() };
  writeStore(file, store);
  return { projectid, root: store.projects[projectid].root, url };
}

/** The entry for a project folder: { projectid, token, url } or null. */
export function findForRoot(root, file = storeFile()) {
  const store = readStore(file);
  for (const [projectid, e] of Object.entries(store.projects)) {
    if (e?.root && e?.token && sameRoot(e.root, root)) return { projectid, token: e.token, url: e.url || DEFAULT_AGENTRUNS_URL };
  }
  return null;
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main(argv) {
  const root = resolve(arg(argv, '--root') ?? process.cwd());
  if (argv.includes('--check')) {
    const e = findForRoot(root);
    process.stdout.write(e ? `Agent-run token: stored for project ${e.projectid} (${storeFile()})\n` : `Agent-run token: not stored for ${root}\n`);
    process.exit(e ? 0 : 1);
  }
  if (argv.includes('--save')) {
    try {
      const saved = saveProjectToken({ projectid: arg(argv, '--project'), token: await readStdin(), root, url: arg(argv, '--url') });
      process.stdout.write(`Agent-run token stored for project ${saved.projectid} (${storeFile()})\n`);
      process.exit(0);
    } catch (e) {
      process.stderr.write(`Agent-run token not stored: ${e instanceof Error ? e.message : e}\n`);
      process.exit(2);
    }
  }
  process.stderr.write('Usage: token-store.mjs --save --project <uuid> [--root <dir>] [--url <url>]  (token on stdin) | --check [--root <dir>]\n');
  process.exit(2);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/token-store.mjs')) main(process.argv.slice(2));
// [SCOPE 143 / T026] END
