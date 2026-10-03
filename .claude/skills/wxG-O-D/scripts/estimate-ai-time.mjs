#!/usr/bin/env node
/**
 * estimate-ai-time.mjs  (wxKanban kit skill: wxG-O-D)
 * --------------------------------------------------------------------------
 * Deterministic "real AI time" estimate. Schedules the plan's work packages
 * across N parallel AI-agent lanes plus human review lanes, honouring the
 * dependency graph, and reports time to completion for each team size.
 *
 *   node .claude/skills/wxG-O-D/scripts/estimate-ai-time.mjs
 *   node .../estimate-ai-time.mjs path/to/input.json path/to/output.md
 *
 * Defaults: reads  docs/GOD-Estimate-Input.json
 *           writes docs/GOD-Estimate.md
 *
 * Team sizes, from the input:
 *  - "teams": [2, 3] schedules exactly those sizes (the default when "teams"
 *    is missing). The report shows each one.
 *  - "teams": "sweep", or a "sweep": { "from": 2, "to": 12 } block, schedules
 *    every size in the range (default 2 to 12, or to maxAgents if higher) and
 *    picks two options. A "sweep" block wins over a "teams" list.
 *      Option 1, quickest: the fewest expected working days; on a tie, the
 *        smaller team.
 *      Option 2, machine maximum: "maxAgents", the most agents the machine
 *        can run. The range is widened to include it. Without maxAgents,
 *        Option 2 is left out and the report says why.
 *    Recommended: Option 1 when it is no larger than maxAgents, otherwise
 *    Option 2. When both are the same team, the report shows one. The main
 *    tables show only the options; a "Team-size sweep" section shows every size.
 *  - "maxAgents" and "machine" (the machine it was checked on, only echoed in
 *    the report) are written by machine-capacity.mjs --write. This script never
 *    reads the machine itself, so the same input gives the same numbers.
 *
 * The model (also printed into the output, so the customer can see it):
 *  - A work package (WP) is agent work followed by human review. Its
 *    dependents start only after the review is done.
 *  - Agent hours come from the complexity rate table (or a per-WP override),
 *    inflated by coordination overhead for every agent beyond the first.
 *  - Review hours are human time on `reviewers` lanes (default 1). With more
 *    agents the reviewer is often the limit, and the report says so.
 *  - Ready WPs are dispatched longest-remaining-path first.
 *  - Expected uses the base rates; pessimistic multiplies each WP by its
 *    uncertainty factor.
 *
 * Same input, same numbers. Plain Node 18+, no dependencies.
 * --------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const IN_PATH = resolve(process.cwd(), process.argv[2] || 'docs/GOD-Estimate-Input.json');
const OUT_PATH = resolve(process.cwd(), process.argv[3] || 'docs/GOD-Estimate.md');

// Agent and human-review hours per work package, by complexity. These are the
// defaults the input file can override; they assume one agent does one WP end
// to end (code, tests, docs) and a human reviews it before anything builds on it.
const DEFAULT_RATES = {
  XS: { agent: 0.5, review: 0.25 },
  S: { agent: 1.5, review: 0.5 },
  M: { agent: 4, review: 1 },
  L: { agent: 10, review: 2 },
  XL: { agent: 24, review: 4 },
};
const DEFAULT_UNCERTAINTY = { low: 1.25, medium: 1.5, high: 2 };

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function loadInput() {
  let raw;
  try {
    raw = readFileSync(IN_PATH, 'utf8');
  } catch {
    fail(`Estimate input not found: ${IN_PATH}. Write it first (see SKILL.md step 7).`);
  }
  let cfg;
  try {
    // Skip a byte-order mark: some Windows editors add one, and machine-capacity.mjs --write keeps it.
    cfg = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (err) {
    fail(`Estimate input is not valid JSON: ${err.message}`);
  }

  const rates = { ...DEFAULT_RATES, ...(cfg.rates || {}) };
  const uncertainty = { ...DEFAULT_UNCERTAINTY, ...(cfg.uncertaintyMultipliers || {}) };
  let maxAgents = null;
  if (cfg.maxAgents !== undefined && cfg.maxAgents !== null) {
    if (!Number.isInteger(cfg.maxAgents) || cfg.maxAgents < 1) fail('maxAgents must be a whole number of agents, 1 or more.');
    maxAgents = cfg.maxAgents;
  }
  const machine = cfg.machine && typeof cfg.machine === 'object' && !Array.isArray(cfg.machine) ? cfg.machine : null;

  // A misspelled "sweep" must not quietly fall back to the 2- and 3-agent default.
  const teamsSweep = typeof cfg.teams === 'string' && cfg.teams.trim().toLowerCase() === 'sweep';
  if (typeof cfg.teams === 'string' && !teamsSweep) fail(`teams must be a list such as [2, 3], or "sweep" (found "${cfg.teams}").`);
  let teams;
  let sweep = null;
  if (teamsSweep || (cfg.sweep !== undefined && cfg.sweep !== null && cfg.sweep !== false)) {
    const s = cfg.sweep || true;
    if (s !== true && (typeof s !== 'object' || Array.isArray(s))) fail('sweep must be true or { "from": 2, "to": 12 }.');
    const from = s === true || s.from === undefined ? 2 : s.from;
    const to = s === true || s.to === undefined ? Math.max(12, maxAgents ?? 0) : s.to;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      fail('sweep needs whole numbers with 1 <= from <= to, e.g. { "from": 2, "to": 12 }.');
    }
    // Option 2 must be in the range, so the range always reaches maxAgents.
    sweep = { from: Math.min(from, maxAgents ?? from), to: Math.max(to, maxAgents ?? to) };
    teams = [];
    for (let n = sweep.from; n <= sweep.to; n++) teams.push(n);
  } else {
    teams = Array.isArray(cfg.teams) && cfg.teams.length ? cfg.teams : [2, 3];
  }
  const reviewers = Number.isInteger(cfg.reviewers) && cfg.reviewers > 0 ? cfg.reviewers : 1;
  const hoursPerDay = cfg.hoursPerDay > 0 ? cfg.hoursPerDay : 8;
  const workDaysPerWeek = [5, 6, 7].includes(cfg.workDaysPerWeek) ? cfg.workDaysPerWeek : 5;
  const overhead = cfg.coordinationOverheadPerExtraAgent >= 0 ? cfg.coordinationOverheadPerExtraAgent : 0.1;

  if (!teams.every((n) => Number.isInteger(n) && n > 0)) fail('teams must be positive integers, e.g. [2, 3], or "sweep".');
  if (cfg.startDate && Number.isNaN(Date.parse(cfg.startDate))) fail(`startDate is not a date: ${cfg.startDate}`);

  const list = cfg.workPackages;
  if (!Array.isArray(list) || list.length === 0) fail('workPackages must be a non-empty array.');

  const wps = [];
  const seen = new Set();
  for (const w of list) {
    if (!w || typeof w.id !== 'string' || !w.id) fail('Every work package needs a string "id".');
    if (seen.has(w.id)) fail(`Duplicate work package id: ${w.id}`);
    seen.add(w.id);
    const rate = rates[w.complexity];
    if (!rate && !(w.agentHours >= 0)) {
      fail(`${w.id}: complexity "${w.complexity}" is not in the rate table (${Object.keys(rates).join(', ')}) and no agentHours override is given.`);
    }
    const level = w.uncertainty || 'medium';
    if (!(level in uncertainty)) fail(`${w.id}: uncertainty must be one of ${Object.keys(uncertainty).join(', ')}.`);
    wps.push({
      id: w.id,
      title: w.title || '',
      phase: w.phase || 'Unphased',
      complexity: w.complexity || '-',
      agentHours: w.agentHours >= 0 ? w.agentHours : rate.agent,
      reviewHours: w.reviewHours >= 0 ? w.reviewHours : rate ? rate.review : 0,
      uncertainty: level,
      deps: Array.isArray(w.dependsOn) ? w.dependsOn : [],
    });
  }
  for (const w of wps) {
    for (const d of w.deps) if (!seen.has(d)) fail(`${w.id} depends on unknown work package ${d}.`);
  }

  return {
    customer: cfg.customer || '',
    startDate: cfg.startDate || null,
    teams, sweep, maxAgents, machine, reviewers, hoursPerDay, workDaysPerWeek, overhead, rates, uncertainty, wps,
  };
}

// Kahn's algorithm; a leftover node means a cycle, which no schedule can satisfy.
function topoOrder(wps) {
  const indeg = new Map(wps.map((w) => [w.id, w.deps.length]));
  const succ = successors(wps);
  const queue = wps.filter((w) => w.deps.length === 0).map((w) => w.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const s of succ.get(id)) {
      indeg.set(s, indeg.get(s) - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  if (order.length !== wps.length) {
    const stuck = wps.filter((w) => !order.includes(w.id)).map((w) => w.id);
    fail(`Dependency cycle among: ${stuck.join(', ')}`);
  }
  return order;
}

function successors(wps) {
  const succ = new Map(wps.map((w) => [w.id, []]));
  for (const w of wps) for (const d of w.deps) succ.get(d).push(w.id);
  return succ;
}

// Longest remaining path (agent + review hours) from each WP to the end of the plan.
function remainingPath(wps, order, dur) {
  const succ = successors(wps);
  const rank = new Map();
  for (const id of [...order].reverse()) {
    let best = 0;
    for (const s of succ.get(id)) best = Math.max(best, rank.get(s));
    rank.set(id, dur.get(id).a + dur.get(id).r + best);
  }
  return rank;
}

function schedule(input, order, agents, pessimistic) {
  const { wps, reviewers, overhead, uncertainty } = input;
  const inflate = 1 + overhead * (agents - 1);
  const dur = new Map(wps.map((w) => {
    const f = pessimistic ? uncertainty[w.uncertainty] : 1;
    return [w.id, { a: w.agentHours * inflate * f, r: w.reviewHours * f }];
  }));
  const rank = remainingPath(wps, order, dur);
  const byRank = (x, y) => rank.get(y) - rank.get(x) || x.localeCompare(y);
  const succ = successors(wps);

  const waiting = new Map(wps.map((w) => [w.id, w.deps.length]));
  let ready = wps.filter((w) => w.deps.length === 0).map((w) => w.id);
  let reviewQueue = [];
  const agentFree = new Array(agents).fill(0);
  const reviewerFree = new Array(reviewers).fill(0);
  const events = [];
  const finish = new Map();
  let agentBusy = 0;
  let reviewBusy = 0;
  let t = 0;

  while (finish.size < wps.length) {
    ready.sort(byRank);
    for (let i = 0; i < agents && ready.length; i++) {
      if (agentFree[i] > t) continue;
      const id = ready.shift();
      const a = dur.get(id).a;
      agentFree[i] = t + a;
      agentBusy += a;
      events.push({ t: t + a, kind: 'agent', id });
    }
    reviewQueue.sort(byRank);
    for (let j = 0; j < reviewers && reviewQueue.length; j++) {
      if (reviewerFree[j] > t) continue;
      const id = reviewQueue.shift();
      const r = dur.get(id).r;
      reviewerFree[j] = t + r;
      reviewBusy += r;
      events.push({ t: t + r, kind: 'review', id });
    }
    if (events.length === 0) fail('Scheduler stalled — check the dependency graph.');

    events.sort((x, y) => x.t - y.t);
    t = events[0].t;
    while (events.length && events[0].t === t) {
      const ev = events.shift();
      if (ev.kind === 'agent') {
        reviewQueue.push(ev.id);
        continue;
      }
      finish.set(ev.id, t);
      for (const s of succ.get(ev.id)) {
        waiting.set(s, waiting.get(s) - 1);
        if (waiting.get(s) === 0) ready.push(s);
      }
    }
  }

  const makespan = Math.max(...finish.values());
  const critical = Math.max(...rank.values());
  const agentUse = makespan ? agentBusy / (agents * makespan) : 0;
  const reviewUse = makespan ? reviewBusy / (reviewers * makespan) : 0;
  // Each of these is a floor no schedule can beat; the highest one is what the plan is waiting on.
  const floors = [
    ['dependency chain', critical],
    ['agent capacity', agentBusy / agents],
    ['human review', reviewBusy / reviewers],
  ];
  const limitedBy = floors.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  return { agents, makespan, finish, agentBusy, reviewBusy, agentUse, reviewUse, limitedBy };
}

function criticalChain(input, order) {
  const dur = new Map(input.wps.map((w) => [w.id, { a: w.agentHours, r: w.reviewHours }]));
  const rank = remainingPath(input.wps, order, dur);
  const succ = successors(input.wps);
  const roots = input.wps.filter((w) => w.deps.length === 0).map((w) => w.id);
  let id = roots.sort((x, y) => rank.get(y) - rank.get(x))[0];
  const chain = [];
  while (id) {
    chain.push(id);
    id = succ.get(id).sort((x, y) => rank.get(y) - rank.get(x))[0];
  }
  return { chain, hours: rank.get(chain[0]) };
}

function workingDays(hours, hoursPerDay) {
  return hours > 0 ? Math.ceil(hours / hoursPerDay - 1e-9) : 0;
}

// Working day N (1-based) counted from the start date, skipping weekend days.
function dateForWorkingDay(start, n, workDaysPerWeek) {
  if (!start || n < 1) return null;
  const off = workDaysPerWeek === 7 ? [] : workDaysPerWeek === 6 ? [0] : [0, 6];
  const d = new Date(`${start}T00:00:00Z`);
  while (off.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  for (let count = 1; count < n;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!off.includes(d.getUTCDay())) count++;
  }
  return d.toISOString().slice(0, 10);
}

const h = (x, places = 1) => Number(x.toFixed(places)).toString();
const pct = (x) => `${Math.round(x * 100)}%`;
const aiAgents = (n) => `${n} AI agent${n === 1 ? '' : 's'}`;
const agents = (n) => `${n} agent${n === 1 ? '' : 's'}`;

// Sweep only. Results are in team-size order, so the first lowest is the smaller team on a tie.
function chooseOptions(input, results) {
  const days = (r) => workingDays(r.exp.makespan, input.hoursPerDay);
  const quickest = results.reduce((best, r) => (days(r) < days(best) ? r : best));
  const machine = input.maxAgents ? results.find((r) => r.exp.agents === input.maxAgents) : null;
  const recommended = !machine || quickest.exp.agents <= input.maxAgents ? quickest : machine;
  const rec = (r) => (r === recommended ? ' (recommended)' : '');
  if (machine === quickest) {
    return {
      quickest, machine, recommended, same: true, shown: [quickest],
      labels: ['Quickest and machine maximum (recommended)'], heads: [agents(quickest.exp.agents)],
    };
  }
  const shown = machine ? [quickest, machine] : [quickest];
  return {
    quickest, machine, recommended, same: false, shown,
    labels: [`Option 1, quickest${rec(quickest)}`, `Option 2, machine maximum${rec(machine)}`].slice(0, shown.length),
    heads: shown.map((r, i) => `${agents(r.exp.agents)} (Option ${i + 1})`),
  };
}

function render(input, results, chain, options) {
  const { hoursPerDay, workDaysPerWeek, reviewers, overhead, rates, uncertainty, wps, startDate } = input;
  const days = (hrs) => workingDays(hrs, hoursPerDay);
  const weeks = (hrs) => (Math.round((days(hrs) / workDaysPerWeek) * 10) / 10).toString();
  const date = (hrs) => dateForWorkingDay(startDate, days(hrs), workDaysPerWeek);
  const range = (r) => `${days(r.exp.makespan)}–${days(r.pes.makespan)} working days`;
  const who = `${reviewers} human reviewer${reviewers === 1 ? '' : 's'}`;
  const phases = [...new Set(wps.map((w) => w.phase))];
  const today = new Date().toISOString().slice(0, 10);
  const src = relative(process.cwd(), IN_PATH).replace(/\\/g, '/');
  const shown = options ? options.shown : results;
  // A list of teams keeps its old wording; a sweep can reach 1 agent, so it says "1 AI agent".
  const team = (n) => (options ? aiAgents(n) : `${n} AI agents`);
  const out = [];

  // With labels, an "Option" column leads each row.
  const summaryTable = (rows, labels) => {
    const lead = (cell) => (labels ? `| ${cell} ` : '');
    const lines = [
      `${lead('Option')}| Team | Expected | Pessimistic |${startDate ? ' Expected finish |' : ''} AI agent hours | Human review hours | Agent use | Reviewer use | Limited by |`,
      `${labels ? '|---' : ''}|---|---|---|${startDate ? '---|' : ''}---|---|---|---|---|`,
    ];
    rows.forEach(({ exp, pes }, i) => {
      const finishCell = startDate ? ` ${date(exp.makespan)} |` : '';
      lines.push(
        `${lead(labels?.[i])}| ${team(exp.agents)} + ${who} | ${days(exp.makespan)} working days (${weeks(exp.makespan)} wk) ` +
        `| ${days(pes.makespan)} working days (${weeks(pes.makespan)} wk) |${finishCell} ${h(exp.agentBusy)} | ${h(exp.reviewBusy)} ` +
        `| ${pct(exp.agentUse)} | ${pct(exp.reviewUse)} | ${exp.limitedBy} |`,
      );
    });
    return lines;
  };

  out.push(`# ${input.customer ? `${input.customer} — ` : ''}AI Delivery Time Estimate`, '');
  out.push(`> Generated ${today} by \`estimate-ai-time.mjs\` from \`${src}\`. Same input, same numbers:`);
  out.push('> edit the input and re-run the script to update this file.', '');

  out.push('## Summary', '');
  if (options) {
    out.push(optionsText(options, range), '');
    if (input.maxAgents) out.push(machineText(input), '');
  }
  out.push(...summaryTable(shown, options?.labels));
  out.push('');
  out.push(`Working day = ${hoursPerDay} hours; week = ${workDaysPerWeek} working days${startDate ? `; start ${startDate}` : ''}. ` +
    'Hours are totals across all lanes; elapsed time is the working-day columns.', '');

  out.push('## Phase milestones (expected)', '');
  out.push(`| Phase | ${(options ? options.heads : results.map((r) => `${r.exp.agents} agents`)).join(' | ')} |`);
  out.push(`|---|${shown.map(() => '---').join('|')}|`);
  for (const p of phases) {
    const ids = wps.filter((w) => w.phase === p).map((w) => w.id);
    const cells = shown.map(({ exp }) => {
      const end = Math.max(...ids.map((id) => exp.finish.get(id)));
      const d = date(end);
      return `day ${days(end)}${d ? ` (${d})` : ''}`;
    });
    out.push(`| ${p} | ${cells.join(' | ')} |`);
  }
  out.push('');

  if (options) {
    out.push('## Team-size sweep', '');
    out.push(`Every team size from ${input.sweep.from} to ${input.sweep.to} AI agents, scheduled on the same plan:`, '');
    out.push(...summaryTable(results));
    out.push('');
    out.push(sweepText(input, results, options, days), '');
  }

  out.push('## Critical path', '');
  out.push(`${chain.chain.join(' → ')}`, '');
  out.push(`${h(chain.hours)} hours of agent and review work sit on this one chain, about ${days(chain.hours)} working days ` +
    'before coordination overhead. No team size finishes faster than this; shortening it means splitting a package on it ' +
    'or removing a dependency.', '');

  out.push('## How this was calculated', '');
  out.push('- Each work package is AI-agent work followed by human review; anything that depends on it waits for the review.');
  out.push(`- Agents work in parallel lanes. Each agent beyond the first adds ${pct(overhead)} coordination overhead to all agent work (merges, integration, shared context).`);
  out.push(`- Review runs on ${who}. More agents produce work faster than one reviewer can approve it; "Limited by: human review" means adding agents will not help.`);
  out.push('- Ready packages are started longest-remaining-path first.');
  out.push(`- Pessimistic multiplies each package's hours by its uncertainty: ${Object.entries(uncertainty).map(([k, v]) => `${k} ×${v}`).join(', ')}.`);
  if (options) {
    out.push(`- Every team size from ${input.sweep.from} to ${input.sweep.to} agents was scheduled. Option 1 is the size with the fewest expected working days ` +
      '(on a tie, the smaller team). Option 2 is the most agents the machine can run. The recommendation is Option 1 when the ' +
      'machine can run it, otherwise Option 2.');
    if (input.maxAgents) {
      out.push(`- The machine maximum is the input's \`maxAgents\`${input.machine ? ', written there by `machine-capacity.mjs` after it checked the machine' : ''}. ` +
        'This estimate never reads the machine itself, so the same input gives the same numbers on any machine.');
    }
  }
  out.push('- Not included: customer sign-off turnaround at phase gates, environment or access delays, holidays.', '');
  out.push('| Complexity | AI agent hours | Human review hours |', '|---|---|---|');
  for (const [k, v] of Object.entries(rates)) out.push(`| ${k} | ${h(v.agent, 2)} | ${h(v.review, 2)} |`);
  out.push('');

  out.push('## Work package inputs', '');
  out.push('| WP | Title | Phase | Complexity | Agent h | Review h | Uncertainty | Depends on |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const w of wps) {
    out.push(`| ${w.id} | ${w.title} | ${w.phase} | ${w.complexity} | ${h(w.agentHours, 2)} | ${h(w.reviewHours, 2)} | ${w.uncertainty} | ${w.deps.join(', ') || '—'} |`);
  }
  out.push('');
  return out.join('\n');
}

// The "Options" line at the top of a sweep report.
function optionsText(o, range) {
  const team = (r) => `${aiAgents(r.exp.agents)}, ${range(r)}`;
  if (o.same) {
    return `**Options.** The quickest team is also the most agents this machine can run: ${team(o.quickest)}. ` +
      `**Recommended: ${aiAgents(o.quickest.exp.agents)}.**`;
  }
  const one = `Option 1, the quickest team: ${team(o.quickest)}.`;
  if (!o.machine) {
    return `**Options.** ${one} Option 2, the machine maximum, is not shown because the input has no \`maxAgents\` ` +
      `(\`machine-capacity.mjs --write\` adds it). **Recommended: Option 1, ${aiAgents(o.quickest.exp.agents)}.**`;
  }
  const two = `Option 2, the most agents this machine can run: ${team(o.machine)}.`;
  const why = o.recommended === o.quickest
    ? `**Recommended: Option 1, ${aiAgents(o.quickest.exp.agents)}.** It is the quickest team, and the machine can run it.`
    : `**Recommended: Option 2, ${aiAgents(o.machine.exp.agents)}.** The quickest team needs more agents than this machine can run.`;
  return `**Options.** ${one} ${two} ${why}`;
}

// Echoes the machine check recorded in the input; the estimator itself never reads the machine.
function machineText({ maxAgents, machine: m }) {
  let line = `**Machine maximum:** ${aiAgents(maxAgents)}`;
  if (m && m.limitedBy && m.machineMax === maxAgents) line += `, limited by ${m.limitedBy}`;
  line += '.';
  if (m) {
    const hw = [Number.isFinite(m.threads) && `${m.threads} threads`, Number.isFinite(m.totalGB) && `${m.totalGB} GB memory`].filter(Boolean);
    line += ` Checked${m.checked ? ` ${m.checked}` : ''}${m.cpu ? ` on ${m.cpu}` : ''}${hw.length ? ` (${hw.join(', ')})` : ''}.`;
    if (Number.isInteger(m.machineMax) && m.machineMax !== maxAgents) line += ` That check found ${m.machineMax}; the input sets ${maxAgents}.`;
  }
  return line;
}

// One sentence on where extra agents stop helping.
function sweepText(input, results, o, days) {
  const d = (r) => days(r.exp.makespan);
  const q = o.quickest;
  const first = results[0];
  const last = results[results.length - 1];
  if (results.length === 1) {
    return `Only one team size, ${aiAgents(q.exp.agents)}, was swept, so there is nothing to compare it with. ` +
      'Widen the sweep ("sweep": { "from": …, "to": … }) to see where extra agents stop helping.';
  }
  if (q === last) {
    return `The largest size swept, ${aiAgents(q.exp.agents)}, was the quickest, so extra agents had not yet stopped helping. ` +
      'Widen the sweep ("sweep": { "to": … }) to find where they do.';
  }
  const next = results[results.indexOf(q) + 1];
  const reason = {
    'dependency chain': 'the plan is limited by the dependency chain, so added agents mostly wait',
    'human review': 'the plan is limited by human review, so added agents wait for approval (a second reviewer helps more)',
  }[next.exp.limitedBy] || 'added agents give no gain';
  const overheadNote = input.overhead > 0 ? `, and each one adds ${pct(input.overhead)} coordination overhead` : '';
  const smaller = q === first && first.exp.agents > 1 ? ` Teams smaller than ${first.exp.agents} were not swept.` : '';
  return `Extra agents stop helping after ${q.exp.agents}: ${next.exp.agents} agents take ${d(next)} working days` +
    `${last !== next ? ` and ${last.exp.agents} take ${d(last)}` : ''}, against ${d(q)} for ${q.exp.agents}. ` +
    `Past that point ${reason}${overheadNote}.${smaller}`;
}

function main() {
  const input = loadInput();
  const order = topoOrder(input.wps);
  const results = input.teams.map((n) => ({
    exp: schedule(input, order, n, false),
    pes: schedule(input, order, n, true),
  }));
  const chain = criticalChain(input, order);
  const options = input.sweep ? chooseOptions(input, results) : null;
  writeFileSync(OUT_PATH, render(input, results, chain, options), 'utf8');
  const span = ({ exp, pes }) => `${workingDays(exp.makespan, input.hoursPerDay)}–${workingDays(pes.makespan, input.hoursPerDay)} working days`;
  const size = (n) => (options ? agents(n) : `${n} agents`); // a list of teams keeps its old wording
  for (const r of results) console.log(`  ${size(r.exp.agents)}: ${span(r)} (limited by ${r.exp.limitedBy})`);
  if (options) {
    const { quickest: q, machine: m, recommended: rec } = options;
    if (options.same) {
      console.log(`  Quickest and machine maximum: ${agents(q.exp.agents)} (${span(q)})`);
      console.log(`  Recommended: ${agents(q.exp.agents)}`);
    } else {
      console.log(`  Option 1, quickest: ${agents(q.exp.agents)} (${span(q)})`);
      console.log(m ? `  Option 2, machine maximum: ${agents(m.exp.agents)} (${span(m)})`
        : '  Option 2, machine maximum: not shown (no maxAgents in the input; run machine-capacity.mjs --write)');
      console.log(`  Recommended: Option ${rec === q ? 1 : 2}, ${agents(rec.exp.agents)}`);
    }
  }
  console.log(`✓ Wrote ${OUT_PATH}`);
}

main();
