#!/usr/bin/env node
// Agent cost report and forecast (SPEC-143 C4, FR-011, FR-012).
//
// Reads decisions/agentrun-log.jsonl (C1) and writes docs/agent-cost-report.md and .json.
// Prices come from prices.json. Dollar figures are PRICE EQUIVALENTS (what the same tokens would
// cost at API list price); a subscription run is not billed per token.
// When .wxai/remote-session.lock names a live pid, one summary line goes to .wxai/room-outbox.jsonl.
//
//   node report.mjs [--root <dir>] [--agents N --hours H] [--project <name>] [--no-bridge]
//
// Plain Node ESM, no dependencies, no console output except the CLI's one-line result.

import { existsSync, mkdirSync, readFileSync, openSync, writeSync, closeSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { costOf, loadPrices, n0, readRunLog } from './report-lib.mjs';
import { buildProposals, proposalsMarkdown } from './propose.mjs';

export const LOCK_REL = join('.wxai', 'remote-session.lock');
export const OUTBOX_REL = join('.wxai', 'room-outbox.jsonl');

const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
const r4 = (v) => (v === null ? null : Math.round(v * 10000) / 10000);

function blank() {
  return { runs: 0, inputtokens: 0, outputtokens: 0, cachereadtokens: 0, cachewritetokens: 0, activeseconds: 0, waitingseconds: 0, escalated: 0, cost: 0, pricedRuns: 0 };
}

function add(acc, rec, prices) {
  acc.runs += 1;
  acc.inputtokens += n0(rec.inputtokens);
  acc.outputtokens += n0(rec.outputtokens);
  acc.cachereadtokens += n0(rec.cachereadtokens);
  acc.cachewritetokens += n0(rec.cachewritetokens);
  acc.activeseconds += n0(rec.activeseconds);
  acc.waitingseconds += n0(rec.waitingseconds);
  if (rec.escalated === true) acc.escalated += 1;
  const c = costOf(rec, prices);
  if (c !== null) {
    acc.cost += c;
    acc.pricedRuns += 1;
  }
}

function group(records, keyFn, prices) {
  const m = new Map();
  for (const rec of records) {
    const k = keyFn(rec) ?? 'unknown';
    if (!m.has(k)) m.set(k, blank());
    add(m.get(k), rec, prices);
  }
  return m;
}

function finish(acc) {
  const tokens = acc.inputtokens + acc.outputtokens + acc.cachereadtokens + acc.cachewritetokens;
  const hours = acc.activeseconds / 3600;
  return {
    runs: acc.runs,
    tokens,
    inputtokens: acc.inputtokens,
    outputtokens: acc.outputtokens,
    cachereadtokens: acc.cachereadtokens,
    cachewritetokens: acc.cachewritetokens,
    activeHours: r2(hours),
    waitingHours: r2(acc.waitingseconds / 3600),
    tokensPerActiveHour: hours > 0 ? Math.round(tokens / hours) : null,
    priceEquivalentUsd: r4(acc.cost),
    unpricedRuns: acc.runs - acc.pricedRuns,
    escalated: acc.escalated,
  };
}

const mapObj = (m) => Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, finish(v)]));

// Overwrites a generated report file (docs/ output only; never settings).
function putFile(path, text) {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

export function liveSession(root, pidAlive) {
  const p = join(root, LOCK_REL);
  if (!existsSync(p)) return false;
  const alive =
    pidAlive ??
    ((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return !!e && e.code === 'EPERM';
      }
    });
  try {
    const held = JSON.parse(readFileSync(p, 'utf8'));
    return typeof held.pid === 'number' && alive(held.pid);
  } catch {
    return false;
  }
}

function forecast(byModel, agents, hours) {
  if (!(agents > 0) || !(hours > 0)) return null;
  const agentHours = agents * hours;
  const rates = [];
  for (const [model, v] of Object.entries(byModel)) {
    if (v.activeHours > 0 && v.unpricedRuns === 0) {
      rates.push({ model, usdPerHour: v.priceEquivalentUsd / v.activeHours, tokensPerHour: v.tokensPerActiveHour ?? 0 });
    }
  }
  const assumptions = [
    'Rates are measured from the logged runs: price-equivalent dollars and tokens per ACTIVE agent-hour, per model.',
    'The range runs from the cheapest to the dearest measured model; a real mix lands between.',
    'Waiting time is not counted. Agents are assumed to work in parallel at the same rate as one agent.',
    'Dollar figures are API list-price equivalents, not an invoice for subscription runs.',
  ];
  if (!rates.length) {
    return { agents, hoursEach: hours, agentHours, available: false, assumptions: [...assumptions, 'No fully priced model with active time is logged yet, so no range can be given.'] };
  }
  const lo = rates.reduce((a, b) => (a.usdPerHour <= b.usdPerHour ? a : b));
  const hi = rates.reduce((a, b) => (a.usdPerHour >= b.usdPerHour ? a : b));
  return {
    agents,
    hoursEach: hours,
    agentHours,
    available: true,
    usd: { low: r2(lo.usdPerHour * agentHours), high: r2(hi.usdPerHour * agentHours), lowModel: lo.model, highModel: hi.model },
    tokens: {
      low: Math.round(Math.min(...rates.map((r) => r.tokensPerHour)) * agentHours),
      high: Math.round(Math.max(...rates.map((r) => r.tokensPerHour)) * agentHours),
    },
    assumptions,
  };
}

export function buildReport({ root, agents = 0, hours = 0, prices = loadPrices(), now = () => new Date().toISOString(), project } = {}) {
  const all = readRunLog(root);
  const isCmp = (r) => r.neverbilled === true || !!r.comparisonid;
  const records = all.filter((r) => !isCmp(r));
  const cmpRecs = all.filter(isCmp);
  const cmpTotal = blank();
  for (const rec of cmpRecs) add(cmpTotal, rec, prices);
  const total = blank();
  for (const rec of records) add(total, rec, prices);
  const byModel = mapObj(group(records, (r) => r.model, prices));
  const byTier = mapObj(group(records, (r) => r.difficulty, prices));
  const windowVals = records.map((r) => r.windowburn).filter((v) => typeof v === 'number' && Number.isFinite(v));

  // Billable: active minutes per task, no tokens. Comparison runs are never billed.
  const billable = new Map();
  for (const rec of records) {
    if (rec.neverbilled === true) continue;
    const k = rec.taskid ?? '(no task)';
    billable.set(k, (billable.get(k) ?? 0) + n0(rec.activeseconds));
  }

  const comparisons = new Map();
  for (const rec of cmpRecs) {
    if (!rec.comparisonid) continue;
    if (!comparisons.has(rec.comparisonid)) comparisons.set(rec.comparisonid, []);
    comparisons.get(rec.comparisonid).push({
      variant: rec.variant ?? null,
      model: rec.model ?? null,
      route: rec.route ?? null,
      taskid: rec.taskid ?? null,
      difficulty: rec.difficulty ?? null,
      firstpass: typeof rec.firstpass === 'boolean' ? rec.firstpass : null,
      priceEquivalentUsd: r4(costOf(rec, prices)),
    });
  }

  const proposals = buildProposals(all, prices);
  const json = {
    generatedAt: now(),
    project: project ?? basename(root),
    priceSource: { source: prices.source, asOf: prices.asOf },
    note: 'Dollar figures are price equivalents at API list price, not what a subscription charges.',
    totals: finish(total),
    comparisonSpend: { note: "Sampled extra cost of comparison runs. Not project work, not billed, not in the totals or the forecast.", ...finish(cmpTotal) },
    windowBurn: windowVals.length
      ? { available: true, average: r2(windowVals.reduce((a, b) => a + b, 0) / windowVals.length) }
      : { available: false, value: 'unavailable' },
    perModel: byModel,
    priceEquivalentPerTier: byTier,
    byDifficulty: byTier,
    perCommand: mapObj(group(records, (r) => r.command, prices)),
    billable: {
      note: 'Active minutes per task. No tokens. Waiting time and comparison runs are excluded.',
      tasks: Object.fromEntries([...billable.entries()].sort().map(([k, s]) => [k, { activeMinutes: Math.round(s / 6) / 10, hours: r2(s / 3600) }])),
    },
    comparisons: Object.fromEntries(comparisons),
    proposals,
    forecast: forecast(byModel, agents, hours),
  };
  return { json, md: toMarkdown(json) };
}

function tbl(head, rows) {
  if (!rows.length) return ['None yet.'];
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |')];
}
const usd = (v) => (v === null || v === undefined ? 'n/a' : '$' + v);
const fig = (k, v) => [k, v.runs, v.tokens, v.activeHours, v.tokensPerActiveHour ?? 'n/a', usd(v.priceEquivalentUsd), v.unpricedRuns, v.escalated];
const FIG_HEAD = ['Key', 'Runs', 'Tokens', 'Active hours', 'Tokens / active hour', 'Price equivalent', 'Unpriced runs', 'Escalated'];

function toMarkdown(j) {
  const t = j.totals;
  const L = [];
  L.push(`# ${j.project} — Agent Cost Report`, '', `Generated ${j.generatedAt}. ${j.note}`, `Prices: ${j.priceSource.source} (as of ${j.priceSource.asOf}).`, '');
  L.push(
    '## Totals',
    '',
    `- Runs: ${t.runs}`,
    `- Tokens: ${t.tokens} (input ${t.inputtokens}, output ${t.outputtokens}, cache read ${t.cachereadtokens}, cache write ${t.cachewritetokens})`,
    `- Active hours: ${t.activeHours}; waiting hours: ${t.waitingHours}`,
    `- Price equivalent: ${usd(t.priceEquivalentUsd)} (${t.unpricedRuns} runs unpriced)`,
    `- Comparison spend (not in totals): ${j.comparisonSpend.runs} runs, ${j.comparisonSpend.tokens} tokens, ${usd(j.comparisonSpend.priceEquivalentUsd)} price equivalent`,
    `- Window burn: ${j.windowBurn.available ? j.windowBurn.average : 'unavailable'}`,
    '',
  );
  L.push('## Tokens per active agent-hour, per model', '', ...tbl(FIG_HEAD, Object.entries(j.perModel).map(([k, v]) => fig(k, v))), '');
  L.push('## Price equivalent per tier', '', ...tbl(FIG_HEAD, Object.entries(j.priceEquivalentPerTier).map(([k, v]) => fig(k, v))), '');
  L.push('## By difficulty', '', ...tbl(FIG_HEAD, Object.entries(j.byDifficulty).map(([k, v]) => fig(k, v))), '');
  L.push('## Per command', '', ...tbl(FIG_HEAD, Object.entries(j.perCommand).map(([k, v]) => fig(k, v))), '');
  L.push('## Billable view', '', j.billable.note, '', ...tbl(['Task', 'Active minutes', 'Hours'], Object.entries(j.billable.tasks).map(([k, v]) => [k, v.activeMinutes, v.hours])), '');
  const crow = [];
  for (const [id, runs] of Object.entries(j.comparisons)) {
    for (const r of runs) crow.push([id, r.variant ?? '', r.model ?? '', r.route ?? '', r.difficulty ?? '', r.firstpass === null ? 'n/a' : r.firstpass ? 'yes' : 'no', usd(r.priceEquivalentUsd)]);
  }
  L.push('## Comparisons', '', ...tbl(['Comparison', 'Variant', 'Model', 'Route', 'Class', 'First pass', 'Price equivalent'], crow), '');
  L.push('## Proposals', '', ...proposalsMarkdown(j.proposals), '');
  L.push('## Forecast', '');
  if (!j.forecast) {
    L.push('Not requested. Run with `--agents N --hours H`.');
  } else {
    const f = j.forecast;
    L.push(`${f.agents} agents x ${f.hoursEach} hours = ${f.agentHours} agent-hours.`);
    if (f.available) {
      L.push('', `- Price equivalent: ${usd(f.usd.low)} (${f.usd.lowModel}) to ${usd(f.usd.high)} (${f.usd.highModel})`, `- Tokens: ${f.tokens.low} to ${f.tokens.high}`);
    }
    L.push('', 'Assumptions:', ...f.assumptions.map((a) => '- ' + a));
  }
  L.push('');
  return L.join('\n');
}

// One line, versioned, no client content and no per-client tokens (C4).
export function bridgeSummary(json) {
  const t = json.totals;
  const f = json.forecast && json.forecast.available ? `forecast ${json.forecast.agents}x${json.forecast.hoursEach}h ${usd(json.forecast.usd.low)}-${usd(json.forecast.usd.high)}` : 'forecast n/a';
  return `[agent-cost v1] ${json.project}: ${t.runs} runs, ${t.tokens} tokens, ${t.activeHours} active h, price-equivalent ${usd(t.priceEquivalentUsd)}, ${f}, ${json.proposals.length} proposals pending`.replace(/\s*\r?\n\s*/g, ' ');
}

export function writeReport(opts) {
  const { root } = opts;
  const { json, md } = buildReport(opts);
  mkdirSync(join(root, 'docs'), { recursive: true });
  putFile(join(root, 'docs', 'agent-cost-report.md'), md);
  putFile(join(root, 'docs', 'agent-cost-report.json'), JSON.stringify(json, null, 2) + '\n');
  let bridge = false;
  if (!opts.noBridge && liveSession(root, opts.pidAlive)) {
    const file = join(root, OUTBOX_REL);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({ time: (opts.now ?? (() => new Date().toISOString()))(), text: bridgeSummary(json) }) + '\n', 'utf8');
    bridge = true;
  }
  return { json, md, bridge };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[k] = true;
    else {
      o[k] = next;
      i++;
    }
  }
  return o;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const a = parseArgs(process.argv.slice(2));
  const root = resolve(typeof a.root === 'string' ? a.root : process.cwd());
  const res = writeReport({ root, agents: Number(a.agents) || 0, hours: Number(a.hours) || 0, project: typeof a.project === 'string' ? a.project : undefined, noBridge: !!a['no-bridge'] });
  process.stdout.write(JSON.stringify({ ok: true, runs: res.json.totals.runs, bridgeQueued: res.bridge, md: 'docs/agent-cost-report.md', json: 'docs/agent-cost-report.json' }) + '\n');
}
