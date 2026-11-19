#!/usr/bin/env node
// Decision search (SPEC-142, contract C2). One async function, backends behind it.
//
//   search(question, { root, mainRepoRoot, threshold, backends, globalRoot, budgetMs }) -> SearchResult
//
//   SearchResult = { status: 'answered'|'context'|'none', hit, context, backend, fellBack, elapsedMs }
//
// Rules (FR-008, FR-016, FR-017):
//   - repo ledger first, read from `mainRepoRoot` (never a worktree copy), then linked repos named in
//     decisions/settings.yaml `links`, then the global tier;
//   - only answer-eligible entries (Agreed/Added/Changed, approved, not superseded, evidence not
//     unknown) scoring at or above `threshold` answer; the repo tier beats the global tier;
//   - everything else that is relevant but may not answer goes in `context` (evidence:unknown,
//     below-threshold, Declined/Parked); superseded entries appear nowhere;
//   - a non-file backend has a 2000 ms budget; on timeout, error or unavailable the file backend
//     runs and `fellBack` is true.
//
// Global tier: a directory holding decisions/ledger.yaml in the same format, default ~/.wxai
// (override with options.globalRoot). Backends are plain objects: { name, available(), search(query, scopes) }
// where scopes = [{ tier, name, root, label? }]; see file.mjs for the item shape they return.
//
// CLI (used by /wxLedger search):  node _wxAI/askgate/search.mjs "<question>" [--root <dir>] [--json]

import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileBackend } from './file.mjs';
import { isAnswerEligible, readLedger } from './ledger.mjs';
import { GLOBAL_NAMESPACE, repoNamespace } from './openviking.mjs';
import { loadGlobalEntries } from './global.mjs';
import { readSettings } from './settings.mjs';

export const BACKEND_BUDGET_MS = 2000;
const CONTEXT_FLOOR = 0.2;
const CONTEXT_MAX = 5;

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`backend did not answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
// [SCOPE 142 / T006] END

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function buildScopes({ mainRepoRoot, globalRoot, links }) {
// [SCOPE 142 / T006] END
  const scopes = [{ tier: 'repo', name: 'repo', root: mainRepoRoot }];
  for (const link of links ?? []) {
    const root = isAbsolute(link) ? link : resolve(mainRepoRoot, link);
    scopes.push({ tier: 'repo', name: `link:${link}`, root, label: `linked repo ${link}` });
  }
  scopes.push({ tier: 'global', name: 'global', root: globalRoot });
  return scopes;
}

/** Namespace string for a non-file backend (contract C2 scopeNames). */
// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function scopeName(scope) {
  return scope.tier === 'global' ? GLOBAL_NAMESPACE : repoNamespace(scope.root);
}
// [SCOPE 142 / T006] END

/**
 * Never trust a backend for eligibility: look every hit up by id in the real ledger (repo tier, D-nnnn),
 * the global ledger, or the approved global patterns (G-nnnn), and drop what is not found.
 */
// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function rederive(rawItems, scopes, learningsPath) {
  const ledgers = new Map();
  const ledgerOf = (root) => {
    if (!ledgers.has(root)) {
      try {
        ledgers.set(root, readLedger(root));
      } catch {
        ledgers.set(root, []);
      }
    }
    return ledgers.get(root);
  };
  let patterns = null;
  const out = [];
  for (const hit of Array.isArray(rawItems) ? rawItems : []) {
    if (!hit || typeof hit.id !== 'string') continue;
    const tier = hit.tier === 'global' ? 'global' : 'repo';
    if (/^G-\d+$/.test(hit.id) && tier === 'global') {
      patterns ??= loadGlobalEntries(learningsPath);
      if (patterns.some((p) => p.id === hit.id)) out.push({ ...hit, tier, eligible: true, superseded: false });
      continue;
    }
    for (const scope of scopes.filter((s) => s.tier === tier)) {
      const entries = ledgerOf(scope.root);
      const entry = entries.find((e) => e.id === hit.id);
      if (!entry) continue;
      out.push({ ...hit, tier, eligible: isAnswerEligible(entry, entries), superseded: entries.some((o) => o.supersedes === entry.id), kind: entry.kind, evidence: entry.evidence });
      break;
    }
  }
  return out;
}
// [SCOPE 142 / T006] END

const byScore = (a, b) => b.score - a.score;
const publicItem = (i) => ({ id: i.id, tier: i.tier, score: i.score, text: i.text });

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export async function search(question, options = {}) {
// [SCOPE 142 / T006] END
  const started = Date.now();
  const mainRepoRoot = resolve(options.mainRepoRoot ?? options.root ?? process.cwd());
  const settings = readSettings(mainRepoRoot);
  const threshold = typeof options.threshold === 'number' ? options.threshold : settings.gate.matchThreshold;
  const globalRoot = options.globalRoot ?? join(homedir(), '.wxai');
  const budget = options.budgetMs ?? BACKEND_BUDGET_MS;
  const scopes = buildScopes({ mainRepoRoot, globalRoot, links: settings.links });
  const backends = options.backends?.length ? options.backends : [fileBackend];

  let items = null;
  let used = 'file';
  let fellBack = false;
  for (const backend of backends) {
    if (backend.name === 'file') {
      items = await backend.search(question, scopes);
      used = 'file';
      break;
    }
    try {
      const up = await withTimeout(Promise.resolve(backend.available()), budget);
      if (!up) throw new Error('unavailable');
      const left = Math.max(1, budget - (Date.now() - started));
      items = await withTimeout(Promise.resolve(backend.search(question, scopes.map(scopeName))), left);
      items = rederive(items, scopes, options.globalLearningsPath);
      used = backend.name;
      break;
    } catch {
      fellBack = true;
    }
  }
  if (items === null) {
    items = fileBackend.search(question, scopes);
    used = 'file';
    fellBack = fellBack || backends.length > 0;
  }

  const live = items.filter((i) => !i.superseded);
  const answerers = live.filter((i) => i.eligible === true && i.score >= threshold);
  const best = (tier) => answerers.filter((i) => i.tier === tier).sort(byScore)[0] ?? null;
  const winner = best('repo') ?? best('global');
  const context = live
    .filter((i) => i !== winner && i.score >= CONTEXT_FLOOR)
    .sort(byScore)
    .slice(0, CONTEXT_MAX)
    .map(publicItem);

  return {
    status: winner ? 'answered' : context.length ? 'context' : 'none',
    hit: winner ? publicItem(winner) : null,
    context,
    backend: used,
    fellBack,
    elapsedMs: Date.now() - started,
  };
}

// ---- CLI -----------------------------------------------------------------------------------

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
async function runCli(argv) {
  const words = [];
  let root = process.cwd();
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i] ?? '.');
    else if (argv[i] === '--json') json = true;
    else words.push(argv[i]);
  }
  const question = words.join(' ').trim();
  if (!question) {
    process.stderr.write('usage: search.mjs "<question>" [--root <dir>] [--json]\n');
    return 2;
  }
  const r = await search(question, { root });
  if (json) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`status: ${r.status}  (backend ${r.backend}${r.fellBack ? ', fell back' : ''}, ${r.elapsedMs} ms)\n`);
  if (r.hit) process.stdout.write(`\nANSWER  ${r.hit.tier}  score ${r.hit.score}\n${r.hit.text}\n`);
  for (const c of r.context) process.stdout.write(`\ncontext  ${c.tier}  score ${c.score}\n${c.text}\n`);
  return 0;
}
// [SCOPE 142 / T006] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/search.mjs')) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
