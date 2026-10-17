#!/usr/bin/env node
// Who uses the code inside each fence of one file (SCOPE-137 FR-010, the Cockpit's CodeLens).
//
//   node _wxAI/impact/fence-usage.mjs <file> [--root <dir>]
//
// Prints { file, parser, fences: [{ line, endLine, scope, task, title, symbols, usedByFiles,
// usedByScopes, confidence, internal }] }. One engine load per file, then per fence: the
// exports declared inside it, and the files that import those exact exports. A fence that
// exports nothing is marked internal rather than reported as "used by 0".

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractAll, sourceFiles } from './change-impact.mjs';
import { analyzeChange, norm } from './lib/graph.mjs';
import { loadFacts } from './lib/facts.mjs';
import { changedExports, exportedDeclarations, exportUsage, loadTypeScript } from './lib/exports.mjs';
import { FENCE_COMMENT, scanScopes } from './lib/scopes.mjs';

// [SCOPE 137 / T011] BEGIN — Per-fence usage for the Cockpit CodeLens (FR-010)
// Read the way auditfences reads them: a comment at line start (FENCE_COMMENT).
const BEGIN_RE = new RegExp(FENCE_COMMENT + String.raw`\[SCOPE\s+(\d{3})\s*\/\s*(T\d+)\]\s*BEGIN\s*(?:[—-]\s*(.*?))?\s*(?:\*\/|-->)?\s*\x7d?\s*` + '$');
const END_RE = new RegExp(FENCE_COMMENT + String.raw`\[SCOPE\s+(\d{3})\s*\/\s*(T\d+)\]\s*END`);

/** Fences in a source text: [{ line, endLine, scope, task, title }] with 1-based lines. */
export function fencesIn(src) {
  const lines = src.split(/\r?\n/);
  const open = [];
  const out = [];
  lines.forEach((text, i) => {
    const b = BEGIN_RE.exec(text);
    if (b) {
      open.push({ line: i + 1, scope: b[1], task: b[2], title: (b[3] ?? '').trim() });
      return;
    }
    const e = END_RE.exec(text);
    if (e) {
      const at = open.map((f) => `${f.scope}/${f.task}`).lastIndexOf(`${e[1]}/${e[2]}`);
      if (at >= 0) out.push({ ...open.splice(at, 1)[0], endLine: i + 1 });
    }
  });
  return out.sort((a, b) => a.line - b.line);
}

export function fenceUsage({ root, file }) {
  const rel = norm(file);
  const src = readFileSync(join(root, rel), 'utf8');
  const fences = fencesIn(src);
  if (!fences.length) return { file: rel, parser: null, fences: [] };

  const { facts } = loadFacts(root, sourceFiles(root), extractAll, { useCache: true });
  const result = analyzeChange({ root, changedFiles: [rel], files: [...facts.keys()], facts });
  const ts = loadTypeScript(root);
  const { decls, precise } = exportedDeclarations(src, rel, ts);
  const scopesByFile = scanScopes(root, result.files, facts);

  return {
    file: rel,
    parser: ts ? 'typescript' : 'line-fallback',
    fences: fences.map((f) => {
      const symbols = changedExports(decls, [[f.line, f.endLine]]);
      if (!symbols.length) return { ...f, symbols, usedByFiles: 0, usedByScopes: 0, files: [], scopes: [], internal: true, confidence: precise ? 'Confirmed' : 'Likely' };
      const usage = exportUsage({ root, file: rel, symbols, dependents: result.dependents, resolveSpecifier: result.resolveSpecifier, precise });
      const files = usage.using.map((u) => u.file);
      const scopes = [...new Set(files.flatMap((u) => scopesByFile.get(u) ?? []))].sort();
      return {
        ...f,
        symbols,
        usedByFiles: files.length,
        usedByScopes: scopes.length,
        files,
        scopes,
        internal: false,
        confidence: precise && usage.using.every((u) => u.confidence === 'Confirmed') ? 'Confirmed' : 'Likely',
      };
    }),
  };
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const file = argv.find((a, k) => !a.startsWith('--') && argv[k - 1] !== '--root');
  if (!file) {
    process.stderr.write('Usage: fence-usage.mjs <file> [--root <dir>]\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(fenceUsage({ root, file }), null, 2) + '\n');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/fence-usage.mjs')) main(process.argv.slice(2));
// [SCOPE 137 / T011] END
