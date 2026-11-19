#!/usr/bin/env node
// What an amendment to a scope could affect (SCOPE-137 FR-011 — the /buildscope impact step).
//
//   node _wxAI/impact/scope-impact.mjs <NNN>                      show it (text)
//   node _wxAI/impact/scope-impact.mjs <NNN> --json               the same, as JSON
//   add --no-cache to write nothing at all (not even the facts cache)
//   node _wxAI/impact/scope-impact.mjs <NNN> --record --answer approve|decline
//        --quote "<the developer's words>" [--draft <file with the amended scope text>]
//
// Shown before /buildscope writes an edit or amendment: the specs that implement the scope, the
// code fenced to it, and the scopes that depend on it. The developer's answer is recorded in the
// agreement log as an approval of the AI's change (entry point "buildscope").
//
// Fences carry the SPEC folder number, not always the scope's own (CLAUDE.md: SCOPE-045's code
// is fenced 046–050). So "code fenced to the scope" is every fence labeled with the scope's
// number or with any implementing spec's number.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractAll, sourceFiles } from './change-impact.mjs';
import { loadFacts } from './lib/facts.mjs';
import { buildAgreementEvent, changeHash, mcpConnection, mcpSender, projectIdFor, recordAgreement } from './lib/agreement.mjs';
import { readImpactMode } from './lib/classify.mjs';

// [SCOPE 137 / T012] BEGIN — Scope impact: implementing specs, fenced code, dependent scopes (FR-011)
// MODIFIED-BY: [SCOPE 137 / T013] — --no-cache, so wxBrainstorm can show it without writing anything
const pad = (n) => String(n).replace(/^(SCOPE|SPEC)-/i, '').padStart(3, '0');
const SCOPE_DIR = join('specs', 'Project-Scope');

/**
 * The scope's document. The early scopes (1:1 with their spec, before scope files existed) have
 * only a spec folder, so fall back to its spec.md.
 */
function scopeFile(root, nnn) {
  const dir = join(root, SCOPE_DIR);
  const name = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${nnn}-`) && f.endsWith('.md')) : null;
  if (name) return `${SCOPE_DIR.replace(/\\/g, '/')}/${name}`;
  const specs = join(root, 'specs');
  const folder = existsSync(specs) ? readdirSync(specs).find((d) => d.startsWith(`${nnn}-`) && existsSync(join(specs, d, 'spec.md'))) : null;
  return folder ? `specs/${folder}/spec.md` : null;
}

const linesOf = (text, label) =>
  text.split(/\r?\n/).filter((l) => new RegExp(`^\\*\\*${label}\\*\\*\\s*:`, 'i').test(l));
const numbersIn = (line) => [...line.replace(/^\*\*[^*]+\*\*\s*:/, '').matchAll(/\b(\d{3})\b/g)].map((m) => m[1]);

/** Specs that implement the scope: its **Implemented By** lines, and any spec saying it implements it. */
export function implementingSpecs(root, nnn, scopeText) {
  const specs = new Set(linesOf(scopeText, 'Implemented By').flatMap((l) => [...l.matchAll(/SPEC-(\d{3})/gi)].map((m) => m[1])));
  const dir = join(root, 'specs');
  for (const d of existsSync(dir) ? readdirSync(dir) : []) {
    const m = /^(\d{3})-/.exec(d);
    if (!m) continue;
    const spec = join(dir, d, 'spec.md');
    if (!existsSync(spec)) continue;
    const head = readFileSync(spec, 'utf8').split(/\r?\n/).slice(0, 15).join('\n');
    // `**Implements**: SCOPE-045` today; `**Parent Scope**: spec 045` in the older specs.
    if (m[1] !== nnn && new RegExp(`\\*\\*(?:Implements|Parent Scope)\\*\\*\\s*:\\s*(?:SCOPE-|spec\\s+)?${nnn}\\b`, 'i').test(head)) specs.add(m[1]);
  }
  return [...specs].sort().map((n) => {
    const folder = (existsSync(dir) ? readdirSync(dir) : []).find((d) => d.startsWith(`${n}-`));
    return { spec: n, folder: folder ? `specs/${folder}` : null };
  });
}

/** Scopes whose **Depends On** line names this scope. */
export function dependentScopes(root, nnn) {
  const dir = join(root, SCOPE_DIR);
  const out = [];
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const m = /^(\d{3})-.*\.md$/.exec(f);
    if (!m || m[1] === nnn) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    if (linesOf(text, 'Depends On').some((l) => numbersIn(l).includes(nnn))) {
      const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? f;
      out.push({ scope: m[1], title, file: `${SCOPE_DIR.replace(/\\/g, '/')}/${f}` });
    }
  }
  return out;
}

export function scopeImpact({ root, scope, useCache = true }) {
  const nnn = pad(scope);
  const file = scopeFile(root, nnn);
  if (!file) return { scope: nnn, found: false };
  const text = readFileSync(join(root, file), 'utf8');
  const specs = implementingSpecs(root, nnn, text);
  // A 1:1 legacy scope with no scope file is its own spec folder.
  if (!file.startsWith(SCOPE_DIR.replace(/\\/g, '/')) && !specs.some((s) => s.spec === nnn)) {
    specs.unshift({ spec: nnn, folder: file.replace(/\/spec\.md$/, '') });
  }
  const labels = new Set([nnn, ...specs.map((s) => s.spec)]);
  const { facts } = loadFacts(root, sourceFiles(root), extractAll, { useCache });
  const fenced = [];
  for (const [f, fact] of facts) {
    const hit = (fact.scopes ?? []).filter((s) => labels.has(s));
    if (hit.length) fenced.push({ file: f, labels: hit, shared: (fact.scopes ?? []).filter((s) => !labels.has(s)) });
  }
  fenced.sort((a, b) => a.file.localeCompare(b.file));
  return {
    scope: nnn,
    found: true,
    file,
    title: /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? file,
    specs,
    fencedFiles: fenced,
    dependents: dependentScopes(root, nnn),
  };
}

export function renderScopeImpact(r, max = 25) {
  if (!r.found) return `Change Impact: no scope file for SCOPE-${r.scope} under specs/Project-Scope/.`;
  const lines = [`Change Impact for an amendment to SCOPE-${r.scope} (${r.title}):`];
  lines.push(`- Specs that implement it: ${r.specs.length ? r.specs.map((s) => `SPEC-${s.spec}${s.folder ? ` (${s.folder})` : ''}`).join(', ') : 'none yet'}`);
  lines.push(`- Code fenced to it: ${r.fencedFiles.length} file(s)${r.fencedFiles.some((f) => f.shared.length) ? `, ${r.fencedFiles.filter((f) => f.shared.length).length} of them shared with other scopes` : ''}`);
  for (const f of r.fencedFiles.slice(0, max)) lines.push(`    - ${f.file}${f.shared.length ? ` (also SCOPE-${f.shared.join(', SCOPE-')})` : ''}`);
  if (r.fencedFiles.length > max) lines.push(`    - … and ${r.fencedFiles.length - max} more`);
  lines.push(`- Scopes that depend on it: ${r.dependents.length ? r.dependents.map((d) => `SCOPE-${d.scope} (${d.title})`).join('; ') : 'none'}`);
  return lines.join('\n');
}

/** The report shape the agreement log takes, built from a scope impact. */
export function asReport(r, root) {
  const mode = readImpactMode(root).mode;
  const reasons = [
    ...r.dependents.map((d) => ({ kind: 'dependent-scope', scope: d.scope, detail: `SCOPE-${d.scope} depends on this scope` })),
    ...(r.specs.length ? [{ kind: 'implementing-specs', detail: `implemented by SPEC-${r.specs.map((s) => s.spec).join(', SPEC-')}` }] : []),
  ];
  return {
    changedFiles: [r.file],
    broad: false,
    summary: { affected: r.fencedFiles.length },
    links: r.fencedFiles.map((f) => ({ type: 'scope', direction: 'dependent', from: r.file, to: f.file, confidence: 'Confirmed' })),
    scopes: { ownScopes: [r.scope], reachedScopes: r.dependents.map((d) => d.scope) },
    classification: { mode, decision: 'ask', boundary: true, reasons, dataLoss: [], ownScopes: [r.scope], signoff: { checked: false, reason: 'not asked for a scope amendment' } },
  };
}

export async function recordScopeAnswer({ root, scope, answer, quote, draft = null, actor, send = null }) {
  if (!['approve', 'decline'].includes(answer) || !quote?.trim()) return { ok: false, error: 'need --answer approve|decline and --quote with the developer\'s words' };
  const r = scopeImpact({ root, scope });
  if (!r.found) return { ok: false, error: `no scope file for SCOPE-${pad(scope)}` };
  const projectId = projectIdFor(root);
  if (!projectId) return { ok: true, sent: false, queued: false, skipped: 'no wxKanban project id configured' };
  const content = draft ?? readFileSync(join(root, r.file), 'utf8');
  const event = buildAgreementEvent({
    projectId, actor, kind: 'approval', answer, attended: true, entryPoint: 'buildscope',
    report: asReport(r, root), hash: changeHash([{ file: r.file, content }]),
  });
  event.metadata.quote = quote.trim().slice(0, 500);
  const out = await recordAgreement(root, event, send ?? mcpSender(mcpConnection(root)));
  return { ok: true, sent: out.sent, queued: out.queued };
}

async function main(argv) {
  const arg = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const root = resolve(arg('root') ?? process.cwd());
  const scope = argv.find((a) => /^(SCOPE-)?\d{1,3}$/i.test(a));
  if (!scope) {
    process.stderr.write('Usage: scope-impact.mjs <NNN> [--json] | --record --answer approve|decline --quote "..." [--draft <file>]\n');
    process.exit(2);
  }
  if (argv.includes('--record')) {
    const draftPath = arg('draft');
    const out = await recordScopeAnswer({
      root, scope, answer: arg('answer'), quote: arg('quote'), actor: arg('actor') ?? process.env.USERNAME ?? process.env.USER ?? 'developer',
      draft: draftPath ? readFileSync(resolve(root, draftPath), 'utf8') : null,
    });
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(out.ok ? 0 : 2);
  }
  // --no-cache: read-only, nothing written (wxBrainstorm step 3, FR-012).
  const r = scopeImpact({ root, scope, useCache: !argv.includes('--no-cache') });
  process.stdout.write((argv.includes('--json') ? JSON.stringify(r, null, 2) : renderScopeImpact(r)) + '\n');
  process.exit(r.found ? 0 : 1);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/scope-impact.mjs')) main(process.argv.slice(2));
// [SCOPE 137 / T012] END
