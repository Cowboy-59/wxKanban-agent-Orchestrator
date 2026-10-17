// Code → scope through fences for the Change Impact engine (SCOPE-137 FR-002 (8)).
//
// Every code unit is fenced `[SCOPE nnn / Tnnn] BEGIN … END` (SCOPE-026). Reading
// those fences tells the engine which scope owns a file — the input the Impact
// Boundary rule needs ("the change reaches another scope's code", FR-006).
// Fences are only ever READ here; they are written by the orchestrator alone.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 137 / T006] BEGIN — Code → scope (FR-002 (8)): fence reader
// MODIFIED-BY: [SCOPE 137 / T003] — scope map accepts cached per-file fences
// MODIFIED-BY: [SCOPE 137 / T011] — a fence is a comment at line start, as auditfences reads it; fence text inside a string is not one
// Labels must be Tnnn — an FR-nnn label is not a fence (auditfences matches T\d+).
// The comment openers match fence-emitter.ts COMMENT_PREFIX: //, --, <!--, #, /*, and the JSX opener
// (\x7b is its brace, escaped so brace-counting tools stay balanced).
export const FENCE_COMMENT = String.raw`^[ \t]*(?:\/\/|--|<!--|#|\/\*|\x7b\/\*)[ \t]*`;
export const FENCE_RE = new RegExp(`${FENCE_COMMENT}\\[SCOPE\\s+(\\d{3})\\s*\\/\\s*T\\d+\\]\\s*BEGIN`, 'gm');
export const FENCE_END_RE = new RegExp(`${FENCE_COMMENT}\\[SCOPE\\s+(\\d{3})\\s*\\/\\s*(T\\d+)\\]\\s*END`);

/** Scopes fenced in a source text, in first-seen order. */
export function fencedScopes(src) {
  const scopes = [];
  FENCE_RE.lastIndex = 0;
  let m;
  while ((m = FENCE_RE.exec(src)) !== null) if (!scopes.includes(m[1])) scopes.push(m[1]);
  return scopes;
}

/** Map(file -> [scope]) for every file that carries at least one fence. Uses cached facts when given (T003). */
export function scanScopes(root, files, facts = null) {
  const byFile = new Map();
  for (const file of files) {
    let scopes = facts?.get(file)?.scopes;
    if (!scopes) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      scopes = src.includes('[SCOPE') ? fencedScopes(src) : [];
    }
    if (scopes.length) byFile.set(file, scopes);
  }
  return byFile;
}
// [SCOPE 137 / T006] END

// [SCOPE 137 / T006] BEGIN — Code → scope (FR-002 (8)): scope links for a change
/**
 * Scope links for a change: the scopes the changed files belong to (dependency),
 * and every scope owning a file the change reaches (dependent), with the files
 * that put it there. Unfenced files are not guessed at — they simply carry no
 * scope, and the report says how many reached files had none.
 */
export function scopeLinks({ changedFiles, reachedFiles, scopesByFile }) {
  const links = [];
  const own = new Set();
  for (const f of changedFiles) {
    for (const s of scopesByFile.get(f) ?? []) {
      own.add(s);
      links.push({ type: 'scope', direction: 'dependency', from: f, to: `scope:${s}`, confidence: 'Confirmed' });
    }
  }
  const reachedScopes = new Map(); // scope -> Set(file)
  let unfenced = 0;
  for (const f of reachedFiles) {
    const scopes = scopesByFile.get(f);
    if (!scopes) {
      unfenced++;
      continue;
    }
    for (const s of scopes) {
      if (!reachedScopes.has(s)) reachedScopes.set(s, new Set());
      reachedScopes.get(s).add(f);
    }
  }
  for (const [s, files] of reachedScopes) {
    links.push({
      type: 'scope',
      direction: 'dependent',
      from: changedFiles.join(', '),
      to: `scope:${s}`,
      via: [...files].slice(0, 5).join(', ') + (files.size > 5 ? ` (+${files.size - 5})` : ''),
      confidence: 'Confirmed',
      files: [...files],
      otherScope: own.size > 0 && !own.has(s),
    });
  }
  return { links, ownScopes: [...own], reachedScopes: [...reachedScopes.keys()], unfencedReached: unfenced };
}
// [SCOPE 137 / T006] END
