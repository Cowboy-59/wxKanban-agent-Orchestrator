// Per-file facts with a persistent cache (SCOPE-137 FR-003).
//
// Every link type is extracted from file text. Reading each file once per run,
// and re-reading on later runs only the files whose modification time or size
// changed, is what keeps the hook fast (SC-2: <= 2 s p95 on 5,000 files with a
// warm cache). The cache is keyed by mtime + size, so a change made outside the
// editor — a git checkout, a pull, another tool — is picked up on the next run.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 137 / T003] BEGIN — Facts cache (FR-003): version, location, load and save
// MODIFIED-BY: [SCOPE 137 / T007] — version 2: profile-read (polyglot) and MongoDB facts
// MODIFIED-BY: [SCOPE 137 / T011] — version 3: fences read only as line-start comments
/** Bump when any extractor changes, so stale facts are never reused. */
export const FACTS_VERSION = 3;

export function factsCachePath(root) {
  return join(root, '.wxai', 'impact-index', 'facts.json');
}

function loadCache(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed?.version === FACTS_VERSION && parsed.files && typeof parsed.files === 'object') return parsed.files;
  } catch {
    /* missing or unreadable cache: start empty */
  }
  return {};
}

function saveCache(file, entries) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: FACTS_VERSION, files: entries }));
  } catch {
    /* a cache that cannot be written only costs speed, never correctness */
  }
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T003] BEGIN — Facts cache (FR-003): load every file's facts, re-extracting only what changed
/**
 * Facts for every file: Map(file -> facts), where facts is whatever `extract(src, file)`
 * returns. Unchanged files (same mtime and size as cached) are not read at all.
 * Returns { facts, stats: { files, reused, extracted, removed } }.
 */
export function loadFacts(root, files, extract, { cacheFile = factsCachePath(root), useCache = true } = {}) {
  const cached = useCache ? loadCache(cacheFile) : {};
  const next = {};
  const facts = new Map();
  let reused = 0;
  let extracted = 0;
  for (const file of files) {
    let st;
    try {
      st = statSync(join(root, file));
    } catch {
      continue;
    }
    const hit = cached[file];
    if (hit && hit.m === st.mtimeMs && hit.s === st.size) {
      next[file] = hit;
      facts.set(file, hit.f);
      reused++;
      continue;
    }
    let src;
    try {
      src = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const f = extract(src, file);
    next[file] = { m: st.mtimeMs, s: st.size, f };
    facts.set(file, f);
    extracted++;
  }
  const removed = Object.keys(cached).filter((k) => !(k in next)).length;
  if (useCache && (extracted > 0 || removed > 0 || !existsSync(cacheFile))) saveCache(cacheFile, next);
  return { facts, stats: { files: files.length, reused, extracted, removed } };
}
// [SCOPE 137 / T003] END
