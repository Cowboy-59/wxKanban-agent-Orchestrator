// Path aliases for the Change Impact engine (SCOPE-137 FR-002 (1), FR-005).
//
// Projects import through aliases (`@/components/x`, `~/server/y`). An import the
// engine cannot resolve is an edge it never sees, which under-marks silently —
// measured on wxKanban itself: 10 imports through @server/ and @client/ were
// invisible to the SCOPE-111 retest graph. Aliases are read from the project's
// own tsconfig/jsconfig `paths` and its Vite `resolve.alias`, never guessed.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// [SCOPE 137 / T002] BEGIN — Path aliases (FR-005): JSONC reader that respects strings
/**
 * Parse JSON-with-comments. String-aware, so `"./src/*"` is not mistaken for the
 * start of a block comment. Also drops trailing commas. Returns null on failure.
 */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}
// [SCOPE 137 / T002] END

// [SCOPE 137 / T002] BEGIN — Path aliases (FR-005): tsconfig / jsconfig `paths`
/**
 * Read `compilerOptions.paths` from tsconfig.json (or jsconfig.json), following
 * a relative `extends` chain. Returns [{ prefix, targets[] }] with repo-relative
 * targets, e.g. { prefix: '@/', targets: ['src/'] }.
 */
export function tsconfigAliases(root) {
  const aliases = [];
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    let file = join(root, name);
    const seen = new Set();
    while (file && existsSync(file) && !seen.has(file)) {
      seen.add(file);
      const json = parseJsonc(readFileSync(file, 'utf8'));
      if (!json) break;
      const co = json.compilerOptions ?? {};
      const baseDir = join(dirname(file), co.baseUrl ?? '.');
      for (const [key, targets] of Object.entries(co.paths ?? {})) {
        if (!Array.isArray(targets)) continue;
        const prefix = key.replace(/\*$/, '');
        const rel = targets.map((t) => toRepoRel(root, join(baseDir, String(t).replace(/\*$/, ''))));
        if (!aliases.some((a) => a.prefix === prefix)) aliases.push({ prefix, targets: rel, wildcard: key.endsWith('*') });
      }
      file = typeof json.extends === 'string' && json.extends.startsWith('.') ? join(dirname(file), json.extends) : null;
      if (file && !file.endsWith('.json')) file += '.json';
    }
  }
  return aliases;
}
// [SCOPE 137 / T002] END

// [SCOPE 137 / T002] BEGIN — Path aliases (FR-005): Vite resolve.alias (object and array forms)
/**
 * Best-effort read of Vite's resolve.alias without executing the config:
 *   alias: { '@': path.resolve(__dirname, './src') }      object form
 *   alias: [{ find: '@', replacement: '/src' }]            array form
 * Only string targets are understood; anything computed is skipped, not guessed.
 */
export function viteAliases(root) {
  const aliases = [];
  for (const name of ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    const target = (raw) => toRepoRel(root, join(root, raw.replace(/^\.?\//, '')));
    const objectRe = /["']?([@~$\w/.-]+)["']?\s*:\s*(?:path\.)?resolve\(\s*__dirname\s*,\s*["']([^"']+)["']\s*\)/g;
    const literalRe = /["']([@~$\w/.-]+)["']\s*:\s*["'](\.?\/[^"']+)["']/g;
    const arrayRe = /find\s*:\s*["']([^"']+)["']\s*,\s*replacement\s*:\s*(?:(?:path\.)?resolve\(\s*__dirname\s*,\s*)?["']([^"']+)["']/g;
    for (const re of [objectRe, literalRe, arrayRe]) {
      let m;
      while ((m = re.exec(src)) !== null) {
        const key = m[1];
        if (aliases.some((a) => a.prefix === `${key}/`)) continue;
        aliases.push({ prefix: `${key}/`, targets: [target(m[2])], wildcard: true });
      }
    }
    break;
  }
  return aliases;
}
// [SCOPE 137 / T002] END

// [SCOPE 137 / T002] BEGIN — Path aliases (FR-005): merged alias list, longest prefix first
export function loadAliases(root) {
  const merged = [...tsconfigAliases(root)];
  for (const v of viteAliases(root)) if (!merged.some((a) => a.prefix === v.prefix)) merged.push(v);
  return merged.sort((a, b) => b.prefix.length - a.prefix.length);
}
// [SCOPE 137 / T002] END

// [SCOPE 137 / T002] BEGIN — Path aliases (FR-005): repo-relative target with trailing slash
function toRepoRel(root, abs) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  return rel === '' ? '' : `${rel.replace(/\/$/, '')}/`;
}
// [SCOPE 137 / T002] END
