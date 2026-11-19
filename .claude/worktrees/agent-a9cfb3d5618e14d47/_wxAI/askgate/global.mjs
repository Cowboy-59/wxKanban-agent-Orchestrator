// Global tier for the ask-gate (SPEC-142, FR-018, task T018).
//
// Seeded from ~/.wxai/god-learnings.md: '## Topic' sections holding '- **Pattern:** ...' bullets.
// Entries are {id:'G-nnnn', tier:'global', text, topic}. The file is only ever READ here.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GLOBAL_NAMESPACE, repoNamespace } from "./openviking.mjs";

// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function defaultGodLearningsPath(home = homedir()) {
  return join(home, ".wxai", "god-learnings.md");
}
// [SCOPE 142 / T018] END

/** Parse the learnings markdown. Each entry also carries `line` (1-based) of its Pattern bullet. */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function parseGodLearnings(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  let topic = null;
  let cur = null;
  const flush = () => {
    if (!cur) return;
    cur.text = cur.parts.join(" ").replace(/\s+/g, " ").trim();
    delete cur.parts;
    if (cur.text) entries.push(cur);
    cur = null;
  };
  lines.forEach((raw, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h) {
      flush();
      topic = h[1];
      return;
    }
    const p = /^-\s+\*\*Pattern:\*\*\s*(.*)$/.exec(raw);
    if (p) {
      flush();
      if (topic !== null) cur = { topic, line: i + 1, parts: [p[1]] };
      return;
    }
    if (!cur) return;
    // Continuation: indented, non-bullet text belongs to the pattern; anything else ends it.
    if (/^\s{2,}\S/.test(raw) && !/^\s*-\s/.test(raw)) cur.parts.push(raw.trim());
    else flush();
  });
  flush();
  return entries.map((e, n) => ({
    id: `G-${String(n + 1).padStart(4, "0")}`,
    tier: "global",
    text: e.text,
    topic: e.topic,
    line: e.line,
  }));
}
// [SCOPE 142 / T018] END

// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function loadGlobalEntries(path = defaultGodLearningsPath()) {
  let md;
  try {
    md = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return parseGodLearnings(md);
}
// [SCOPE 142 / T018] END

// ---- project-detail check -------------------------------------------------------------------

const KNOWN_PROJECT_NAMES = ["wxKanban", "wxperts", "wxAI", "wxStack", "YappChatt", "EverettCash", "Everett"];
const RULES = [
  { kind: "scope-number", re: /\bSCOPE[-\s]?\d{1,4}\b/gi },
  { kind: "spec-number", re: /\bSPEC[-\s]?\d{1,4}\b/gi },
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  { kind: "windows-path", re: /\b[A-Za-z]:[\\/][^\s"'`)]+/g },
  { kind: "home-path", re: /(?:^|[\s(])~[\\/][^\s"'`)]+/g },
  { kind: "file-path", re: /(?:^|[\s(`"'])(?:\.{1,2}[\\/])?[\w.-]+(?:[\\/][\w.-]+)+\.[A-Za-z0-9]{1,5}\b/g },
  { kind: "deep-path", re: /(?:^|[\s(`"'])[\w.-]+(?:[\\/][\w.-]+){3,}/g },
];

/**
 * Returns [{ kind, match }] for each project-specific detail found in text. `extraNames` lets the
 * caller add project names to look for. An empty array means clean.
 */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function findProjectDetail(text, extraNames = []) {
  const found = [];
  const seen = new Set();
  const add = (kind, match) => {
    const m = match.trim();
    const key = `${kind}|${m.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ kind, match: m });
    }
  };
  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) add(kind, m[0]);
  }
  for (const name of [...KNOWN_PROJECT_NAMES, ...extraNames]) {
    if (!name) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`, "i").test(text)) add("project-name", name);
  }
  return found;
}
// [SCOPE 142 / T018] END

/** Check a set of global entries; returns [{ id, line, kinds[] }] for flagged ones only. */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function checkGlobal(entries, extraNames = []) {
  const flagged = [];
  for (const e of entries) {
    const hits = findProjectDetail(e.text, extraNames);
    if (hits.length) flagged.push({ id: e.id, line: e.line ?? null, topic: e.topic, hits });
  }
  return flagged;
}
// [SCOPE 142 / T018] END

// ---- search source --------------------------------------------------------------------------

const STOP = new Set("a an and are as at be by for from has have how in is it its of on or that the this to was we what when which who will with you your do does should can not no if then than so".split(" "));
const tokens = (s) =>
  new Set(
    s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => t.replace(/(ing|ed|es|s)$/, "")),
  );

/** Score 0..1: share of the query's tokens found in the entry. Plain and explainable. */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function scoreEntry(queryTokens, text) {
  if (!queryTokens.size) return 0;
  const et = tokens(text);
  let hit = 0;
  for (const t of queryTokens) if (et.has(t)) hit += 1;
  return hit / queryTokens.size;
}
// [SCOPE 142 / T018] END

/**
 * The global tier as a search source: { tier, entries, search(query) } where search returns
 * [{ id, tier:'global', score, text }] best first. Pass `entries` to inject, else the file is read.
 */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function globalSource(opts = {}) {
// [SCOPE 142 / T018] END
  const entries = opts.entries ?? loadGlobalEntries(opts.path);
  return {
    tier: "global",
    entries,
    search(query, limit = 5) {
      const qt = tokens(query);
      return entries
        .map((e) => ({ id: e.id, tier: "global", score: scoreEntry(qt, e.text), text: e.text }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}

// ---- cross-repo rule (contract C3) ----------------------------------------------------------

/**
 * Ledger roots this repo may read: always its own, plus ONLY the roots named in settings `links`.
 * Nothing else is readable. Pass the result of readSettings(root).
 */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function readableLedgerRoots(root, settings) {
  const links = Array.isArray(settings?.links) ? settings.links.filter((l) => typeof l === "string" && l) : [];
  return [root, ...links.filter((l) => l !== root)];
}
// [SCOPE 142 / T018] END

/** OpenViking namespaces this repo may search: its own, linked repos' (if linked), and 'global'. */
// [SCOPE 142 / T018] BEGIN — Global tier: seed from god-learnings, repo links, no cross-…
export function readableNamespaces(root, settings) {
  return [...readableLedgerRoots(root, settings).map(repoNamespace), GLOBAL_NAMESPACE];
}
// [SCOPE 142 / T018] END
