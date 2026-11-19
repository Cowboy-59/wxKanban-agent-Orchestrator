// Function-level references for the Change Impact engine (SCOPE-137 FR-002 (2), FR-003).
//
// The file-level check says "these files import the file you changed". At the
// ask moment that is too coarse: an importer that uses only a different export
// of the same file is not affected by this change. This narrows the list to the
// importers that actually use a changed export, following re-exports.
//
// Declarations are located with the project's own TypeScript parser when it is
// installed (exact ranges → Confirmed); otherwise a line-based fallback is used
// and its results are labeled Likely. Only run when a person is asked to agree.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// [SCOPE 137 / T003] BEGIN — Function-level references (FR-002 (2)): load the project's TypeScript, if any
// MODIFIED-BY: [SCOPE 137 / T015] — falls back to the TypeScript next to the kit, so a project without one still parses exactly
export function loadTypeScript(root) {
  for (const from of [join(root, 'package.json'), import.meta.url]) {
    try {
      return createRequire(from)('typescript');
    } catch {
      // try the next location
    }
  }
  return null;
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T003] BEGIN — Function-level references (FR-002 (2)): exported declarations and their line ranges
/**
 * Exported top-level declarations: [{ name, start, end }] with 1-based lines.
 * `export default` is named 'default'. Uses the TypeScript AST when available.
 */
export function exportedDeclarations(src, file, ts) {
  if (ts) {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const out = [];
    const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
    for (const st of sf.statements) {
      const mods = ts.canHaveModifiers?.(st) ? ts.getModifiers(st) ?? [] : st.modifiers ?? [];
      const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) || ts.isExportAssignment(st);
      if (!exported && !ts.isExportAssignment(st)) continue;
      const range = { start: line(st.getStart(sf)), end: line(st.end) };
      if (isDefault) out.push({ name: 'default', ...range });
      else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push({ name: d.name.text, ...range });
      } else if (st.name && ts.isIdentifier(st.name)) out.push({ name: st.name.text, ...range });
    }
    return { decls: out, precise: true };
  }
  // Fallback: a declaration runs from its `export` line to the line before the next top-level export.
  const lines = src.split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+(\w+)/);
    if (m) starts.push({ name: /^export\s+default/.test(l) ? 'default' : m[1], start: i + 1 });
    else if (/^export\s+default\b/.test(l)) starts.push({ name: 'default', start: i + 1 });
  });
  const decls = starts.map((s, i) => ({ ...s, end: (starts[i + 1]?.start ?? lines.length + 1) - 1 }));
  return { decls, precise: false };
}

/** Names of exported declarations that intersect any [start, end] line range. */
export function changedExports(decls, ranges) {
  return decls.filter((d) => ranges.some(([a, b]) => a <= d.end && b >= d.start)).map((d) => d.name);
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T003] BEGIN — Function-level references (FR-002 (2)): importers that use the changed exports
const IMPORT_FROM_RE = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const REEXPORT_RE = /export\s+(\*|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/g;

/**
 * Which direct importers of `file` use any of `symbols`, following re-exports.
 * Returns { using: [{ file, symbols, confidence }], notUsing: [file] }.
 */
export function exportUsage({ root, file, symbols, dependents, resolveSpecifier, precise }) {
  const using = new Map(); // importer -> Set(symbol)
  const notUsing = new Set();
  const queue = [[file, new Set(symbols)]];
  const visited = new Set();
  while (queue.length) {
    const [target, syms] = queue.shift();
    const key = `${target}|${[...syms].sort().join(',')}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const importer of dependents.get(target) ?? []) {
      let src;
      try {
        src = readFileSync(join(root, importer), 'utf8');
      } catch {
        continue;
      }
      const hits = new Set();
      IMPORT_FROM_RE.lastIndex = 0;
      let m;
      while ((m = IMPORT_FROM_RE.exec(src)) !== null) {
        if (resolveSpecifier(importer, m[3]) !== target) continue;
        const clause = m[2].trim();
        const ns = clause.match(/\*\s+as\s+(\w+)/)?.[1];
        if (ns) {
          // A namespace import uses an export only where it names it: m.add, or m.default.
          for (const s of syms) if (new RegExp(`\\b${ns}\\.${s}\\b`).test(src)) hits.add(s);
          continue;
        }
        const named = clause.match(/\{([^}]*)\}/)?.[1] ?? '';
        const names = named.split(',').map((p) => p.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '').trim()).filter(Boolean);
        const hasDefault = /^\w+/.test(clause.replace(/^type\s+/, '')) && !clause.startsWith('{');
        for (const s of syms) if (names.includes(s) || (s === 'default' && hasDefault)) hits.add(s);
      }
      // Dynamic imports and require() cannot be narrowed — count them as using everything.
      if (new RegExp(`(?:import|require)\\(\\s*['"][^'"]+['"]`).test(src) && hits.size === 0) {
        const dyn = src.match(/(?:import|require)\(\s*['"]([^'"]+)['"]/g) ?? [];
        if (dyn.some((d) => resolveSpecifier(importer, d.replace(/^(?:import|require)\(\s*['"]|['"]$/g, '')) === target)) {
          for (const s of syms) hits.add(s);
        }
      }
      // Re-exports pass the symbols on to the re-exporter's own importers.
      REEXPORT_RE.lastIndex = 0;
      while ((m = REEXPORT_RE.exec(src)) !== null) {
        if (resolveSpecifier(importer, m[3]) !== target) continue;
        if (m[1] === '*') queue.push([importer, new Set([...syms].filter((s) => s !== 'default'))]);
        else {
          const passed = new Set();
          for (const part of (m[2] ?? '').split(',')) {
            const [orig, alias] = part.trim().split(/\s+as\s+/).map((x) => x.trim());
            if (orig && syms.has(orig)) passed.add(alias || orig);
          }
          if (passed.size) queue.push([importer, passed]);
        }
      }
      if (hits.size) {
        if (!using.has(importer)) using.set(importer, new Set());
        for (const h of hits) using.get(importer).add(h);
        notUsing.delete(importer);
      } else if (!using.has(importer)) notUsing.add(importer);
    }
  }
  return {
    using: [...using].map(([f, s]) => ({ file: f, symbols: [...s], confidence: precise ? 'Confirmed' : 'Likely' })),
    notUsing: [...notUsing],
  };
}
// [SCOPE 137 / T003] END
