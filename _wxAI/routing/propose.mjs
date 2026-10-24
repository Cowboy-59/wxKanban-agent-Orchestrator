// Tier proposals (SPEC-143 C6, FR-013). Reads comparison records (C1 with a comparisonid) and
// returns proposals. It never writes settings: only the owner applies a proposal.
//
// A comparison is two runs sharing a comparisonid. Each run carries variant 'current' or
// 'candidate' and a firstpass boolean (set by compare.mjs). A proposal needs, per class
// (difficulty) and model pair: n >= 5 comparisons, a lower cost per task for the candidate, and a
// first-pass rate no more than 5 points worse. flagged = true when the candidate is worse at all
// on first pass, so the owner reads the evidence before approving.

import { costOf, loadPrices } from './report-lib.mjs';

export const MIN_COMPARISONS = 5;
export const MAX_PASS_DROP = 5;

export function buildProposals(records, prices = loadPrices()) {
  const byId = new Map();
  for (const r of records) {
    if (!r.comparisonid) continue;
    if (!byId.has(r.comparisonid)) byId.set(r.comparisonid, []);
    byId.get(r.comparisonid).push(r);
  }
  const groups = new Map();
  for (const runs of byId.values()) {
    const cur = runs.find((r) => r.variant === 'current');
    const cand = runs.find((r) => r.variant === 'candidate');
    if (!cur || !cand) continue;
    if (typeof cur.firstpass !== 'boolean' || typeof cand.firstpass !== 'boolean') continue;
    const cc = costOf(cur, prices);
    const kc = costOf(cand, prices);
    if (cc === null || kc === null) continue;
    const cls = cur.difficulty ?? 'unknown';
    const key = [cls, cur.model, cand.model].join('|');
    if (!groups.has(key)) groups.set(key, { class: cls, from: cur.model, to: cand.model, n: 0, fc: 0, tc: 0, fp: 0, tp: 0 });
    const g = groups.get(key);
    g.n += 1;
    g.fc += cc;
    g.tc += kc;
    g.fp += cur.firstpass ? 1 : 0;
    g.tp += cand.firstpass ? 1 : 0;
  }
  const proposals = [];
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  for (const g of groups.values()) {
    if (g.n < MIN_COMPARISONS) continue;
    const costFrom = g.fc / g.n;
    const costTo = g.tc / g.n;
    const passFrom = (g.fp / g.n) * 100;
    const passTo = (g.tp / g.n) * 100;
    if (!(costTo < costFrom)) continue;
    if (passFrom - passTo > MAX_PASS_DROP) continue;
    proposals.push({
      class: g.class,
      from: g.from,
      to: g.to,
      comparisons: g.n,
      costPerTask: { from: round(costFrom, 4), to: round(costTo, 4) },
      firstPassRate: { from: round(passFrom, 1), to: round(passTo, 1) },
      flagged: passTo < passFrom,
    });
  }
  proposals.sort((a, b) => (a.class + a.from + a.to).localeCompare(b.class + b.from + b.to));
  return proposals;
}

export function proposalsMarkdown(proposals) {
  if (!proposals.length) {
    return ['No tier proposals yet: a class needs at least ' + MIN_COMPARISONS + ' comparisons, a lower cost per finished task, and a first-pass rate no more than ' + MAX_PASS_DROP + ' points worse.'];
  }
  const lines = [
    'Proposals only. Nothing is changed until the owner approves one through the owner-only path.',
    '',
    '| Class | From | To | Comparisons | Cost per task (from, to) | First-pass % (from, to) | Flag |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const p of proposals) {
    lines.push(`| ${p.class} | ${p.from} | ${p.to} | ${p.comparisons} | $${p.costPerTask.from}, $${p.costPerTask.to} | ${p.firstPassRate.from}, ${p.firstPassRate.to} | ${p.flagged ? 'quality slightly lower: review' : 'none'} |`);
  }
  return lines;
}
