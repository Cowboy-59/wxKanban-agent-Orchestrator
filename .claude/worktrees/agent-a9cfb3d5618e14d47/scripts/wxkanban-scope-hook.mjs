#!/usr/bin/env node
// [SCOPE 058 / T018] BEGIN — git-hook helper for the scope check-out/check-in trap.
// [SCOPE 058 / T019] MODIFIED-BY — post-merge release half (parseScopeFromMergeSubject + merge path).
// Invoked by the thin .husky/post-checkout and post-merge hooks. Keeps the DB claim
// in sync when a scope/NNN-* branch is created/switched (claim) or merged (release),
// no matter whether the branch op came from wxAIGit or raw git. Best-effort and
// NON-BLOCKING: any failure (no creds, MCP down, no curl/fetch) warns and exits 0,
// never breaking the developer's git operation. Never steals an existing claim —
// forcing stays a deliberate Cockpit/ADMIN action.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pure: parse the 3-digit scope number from a `scope/NNN-...` branch ref.
export function parseScopeFromBranch(branch) {
  const m = /^scope\/(\d{3})-/.exec((branch ?? '').trim());
  return m ? m[1] : null;
}

// Pure: parse the scope number from a merge commit subject
// ("Merge branch 'scope/NNN-...'" — git's default merge message).
export function parseScopeFromMergeSubject(subject) {
  const m = /[Mm]erge branch '?scope\/(\d{3})-/.exec(subject ?? '');
  return m ? m[1] : null;
}

// Pure: turn a checkout_scope result into a warning line (or null when nothing to say).
export function checkoutWarning(result, spec) {
  if (!result || result.ok !== false) return null;
  if (result.status === 'conflict') {
    const holder = result.heldBy?.name ?? 'another developer';
    return `⚠ wxKanban: scope ${spec} is checked out by ${holder} — you may be duplicating effort.`;
  }
  if (result.status === 'forbidden') {
    return `⚠ wxKanban: your engagement is not assigned scope ${spec}.`;
  }
  return null;
}

function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function readEnvVar(root, key) {
  if (process.env[key]) return process.env[key];
  try {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
      if (line.trimStart().startsWith('#')) continue;
      const m = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`).exec(line);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
  return undefined;
}

async function callTool(base, token, tool, args) {
  const res = await fetch(`${base.replace(/\/+$/, '')}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool, args }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const env = await res.json();
  const inner = env?.content?.[0]?.text;
  return typeof inner === 'string' ? JSON.parse(inner) : null;
}

async function main() {
  if (process.env.WXKANBAN_NO_GIT_HOOKS === '1') return;
  const event = process.argv[2]; // 'checkout' | 'merge'
  let root;
  try {
    root = git('rev-parse --show-toplevel', process.cwd());
  } catch {
    return; // not a git repo
  }

  let spec = null;
  if (event === 'checkout') {
    let branch = '';
    try { branch = git('symbolic-ref --short HEAD', root); } catch { return; }
    spec = parseScopeFromBranch(branch);
  } else if (event === 'merge') {
    let subject = '';
    try { subject = git('log -1 --format=%s', root); } catch { return; }
    spec = parseScopeFromMergeSubject(subject);
  }
  if (!spec) return; // not a scope branch — no-op

  const token = readEnvVar(root, 'WXKANBAN_API_TOKEN');
  const project = readEnvVar(root, 'WXKANBAN_PROJECT_ID');
  const base = readEnvVar(root, 'WXKANBAN_MCP_BASE_URL') || 'https://mcp.wxperts.com';
  if (!token || !project) return; // not linked — nothing to sync

  if (event === 'checkout') {
    const result = await callTool(base, token, 'project.checkout_scope', { projectId: project, specNumber: spec });
    const warn = checkoutWarning(result, spec);
    if (warn) process.stderr.write(warn + '\n');
  } else {
    await callTool(base, token, 'project.checkin_scope', { projectId: project, specNumber: spec });
  }
}

// Only run main() when invoked as a script (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith('wxkanban-scope-hook.mjs')) {
  main().catch(() => undefined).finally(() => process.exit(0));
}
// [SCOPE 058 / T018] END
