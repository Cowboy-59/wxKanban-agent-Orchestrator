// Named-string links for the Change Impact engine (SCOPE-137 FR-002 (7)).
//
// Some code is wired together only by a string: an MCP tool registered as
// 'project.create_specs' and called by name, an event emitted as 'scope:changed'
// and handled elsewhere, an env var read in two services. No import or table
// links them. Matching is textual, so every such link is labeled Likely.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 137 / T006] BEGIN — Named-string links (FR-002 (7)): recognized key patterns
/** Each pattern yields `kind:key` tokens. Kept narrow on purpose: noise hides real links. */
export const KEY_PATTERNS = [
  { kind: 'tool', re: /['"`](project\.[a-z][a-z0-9_]+)['"`]/g },
  { kind: 'env', re: /process\.env\.([A-Z][A-Z0-9_]{2,})\b/g },
  { kind: 'env', re: /process\.env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g },
  { kind: 'env', re: /import\.meta\.env\.([A-Z][A-Z0-9_]{2,})\b/g },
  { kind: 'event', re: /\.(?:emit|on|once|off|addListener|removeListener)\(\s*['"]([\w:.-]{3,})['"]/g },
  { kind: 'job', re: /(?:\.schedule|registerJob|addJob|\.add)\(\s*['"]([\w:.-]{3,})['"]\s*,/g },
  { kind: 'config', re: /(?:config|settings)\.get\(\s*['"]([\w.-]{3,})['"]/g },
];

/** Keys too common to mean coupling (every service reads them). Linked as one aggregate. */
export const BROAD_THRESHOLD = 25;
// [SCOPE 137 / T006] END

// [SCOPE 137 / T006] BEGIN — Named-string links (FR-002 (7)): key extraction and index
// MODIFIED-BY: [SCOPE 137 / T003] — index builder accepts cached per-file keys
export function extractKeys(src) {
  const keys = new Set();
  for (const { kind, re } of KEY_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) keys.add(`${kind}:${m[1]}`);
  }
  return keys;
}

/** Map(key -> Set(file)) across the given files, plus Map(file -> Set(key)). */
export function scanNamedStrings(root, files, facts = null) {
  const byKey = new Map();
  const byFile = new Map();
  for (const file of files) {
    let keys = facts?.get(file)?.keys ? new Set(facts.get(file).keys) : null;
    if (!keys) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      keys = extractKeys(src);
    }
    if (!keys.size) continue;
    byFile.set(file, keys);
    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k).add(file);
    }
  }
  return { byKey, byFile };
}
// [SCOPE 137 / T006] END

// [SCOPE 137 / T006] BEGIN — Named-string links (FR-002 (7)): links reached from a change set
/**
 * For each key a changed file uses, every other file using the same key is a
 * Likely dependent. A key shared by more than BROAD_THRESHOLD other files is
 * reported once, as an aggregate, so a ubiquitous env var does not bury the rest.
 */
export function namedStringLinks({ changedFiles, index }) {
  const links = [];
  const seen = new Set();
  for (const file of changedFiles) {
    for (const key of index.byFile.get(file) ?? []) {
      const others = [...(index.byKey.get(key) ?? [])].filter((f) => f !== file);
      if (!others.length) continue;
      if (others.length > BROAD_THRESHOLD) {
        links.push({ type: 'named-string', direction: 'dependent', from: file, to: `key:${key}`, via: `key:${key}`, confidence: 'Likely', count: others.length, why: `${others.length} files share ${key}` });
        continue;
      }
      for (const other of others) {
        const k = `${file}|${other}|${key}`;
        if (seen.has(k)) continue;
        seen.add(k);
        links.push({ type: 'named-string', direction: 'dependent', from: file, to: other, via: `key:${key}`, confidence: 'Likely', why: `both use ${key}` });
      }
    }
  }
  return links;
}
// [SCOPE 137 / T006] END
