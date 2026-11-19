// File-search backend (SPEC-142, contract C2). The default backend and the fallback.
//
// Backend shape: { name, available(), search(query, scopes) }.
//   scopes  = [{ tier: 'repo'|'global', name, root, label? }], searched in the order given;
//             `root` is a directory holding decisions/ledger.yaml (the repo's MAIN path).
//   returns = [{ id, tier, score, text, eligible, superseded, kind, evidence }]
//             one item per ledger entry with score > 0. `eligible` is the FR-008 rule
//             (isAnswerEligible); search.mjs decides what may answer. Superseded entries are
//             flagged so no caller can serve them.
//
// Scoring is deterministic: normalized token overlap (Jaccard) after a small stop-word list and
// light stemming. 0..1, rounded to 3 places.

import { isAnswerEligible, readLedger } from './ledger.mjs';

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'into', 'about',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'done', 'have', 'has', 'had',
  'how', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'should', 'would', 'could', 'can', 'may', 'might', 'shall', 'will', 'must',
  'we', 'you', 'they', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'our', 'your', 'their',
  'there', 'then', 'than', 'so', 'if', 'not', 'no', 'yes', 'any', 'all', 'some', 'use', 'used', 'using',
]);

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function stem(w) {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
// [SCOPE 142 / T006] END

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function tokenize(text) {
  const out = new Set();
  for (const w of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}
// [SCOPE 142 / T006] END

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const t of a) if (b.has(t)) both++;
  return both / (a.size + b.size - both);
}
// [SCOPE 142 / T006] END

/** 0..1: how well `query` matches one ledger entry. The entry's own question counts most. */
// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function scoreEntry(query, entry) {
  const q = tokenize(query);
  const onQuestion = jaccard(q, tokenize(entry.question));
  const onBody = 0.9 * jaccard(q, tokenize(`${entry.question} ${entry.decision}`));
  return Math.round(Math.max(onQuestion, onBody) * 1000) / 1000;
}
// [SCOPE 142 / T006] END

/** The entry's FULL text, as returned to an agent with its id. */
// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function entryText(entry, label) {
  const lines = [
    `${entry.id} [${entry.kind}, evidence ${entry.evidence}, approved by ${entry.approved_by}, ${entry.date}]${label ? ` (${label})` : ''}`,
    `Scope: ${entry.scope}`,
    `Question: ${entry.question}`,
    `Decision: ${entry.decision}`,
  ];
  if (entry.rationale) lines.push(`Rationale: ${entry.rationale}`);
  if (entry.source) lines.push(`Source: ${entry.source}`);
  if (entry.supersedes) lines.push(`Supersedes: ${entry.supersedes}`);
  return lines.join('\n');
}
// [SCOPE 142 / T006] END

export const fileBackend = {
  name: 'file',
  available: () => true,
  search(query, scopes) {
    const items = [];
    for (const scope of scopes ?? []) {
      let entries;
      try {
        entries = readLedger(scope.root);
      } catch {
        continue; // an unreadable ledger answers nothing; /wxLedger check reports it
      }
      for (const entry of entries) {
        const score = scoreEntry(query, entry);
        if (score <= 0) continue;
        items.push({
          id: entry.id,
          tier: scope.tier,
          score,
          text: entryText(entry, scope.label),
          eligible: isAnswerEligible(entry, entries),
          superseded: entries.some((o) => o.supersedes === entry.id),
          kind: entry.kind,
          evidence: entry.evidence,
        });
      }
    }
    return items;
  },
};

export default fileBackend;
