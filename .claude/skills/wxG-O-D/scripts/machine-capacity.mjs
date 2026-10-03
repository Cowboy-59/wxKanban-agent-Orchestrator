#!/usr/bin/env node
/**
 * machine-capacity.mjs  (wxKanban kit skill: wxG-O-D)
 * --------------------------------------------------------------------------
 * Estimates how many AI agents this machine can run at once. The agents
 * think in the cloud, so an agent on its own costs the machine very little.
 * The load comes from what agents run locally: builds, tests, browsers,
 * Docker, and dev servers. The rule of thumb is about 2 CPU threads and 5 GB
 * of memory per busy agent, after a reserve for the system, editor, and Docker.
 *
 *   node .claude/skills/wxG-O-D/scripts/machine-capacity.mjs
 *   node .../machine-capacity.mjs --cap=5 --json
 *   node .../machine-capacity.mjs --write=docs/GOD-Estimate-Input.json
 *
 * Options (all optional):
 *   --threads-per-agent=<n>  CPU threads per agent (default 2)
 *   --gb-per-agent=<n>       memory per agent, in GB (default 5)
 *   --reserve-gb=<n>         memory kept for the system, editor, and Docker (default 12)
 *   --headroom-gb=<n>        free memory kept spare right now (default 4)
 *   --cap=<n>                the user's own limit; both results are capped to it
 *   --json                   print the numbers as JSON instead of the summary
 *   --write=<file>           set "maxAgents" (the machine maximum) and a
 *                            "machine" block in that estimate input, keeping
 *                            everything else as it was
 *
 * The limits, each at least 1:
 *   by CPU             = floor(threads / threads per agent)
 *   by memory, max     = floor((total GB - reserve) / GB per agent)  other apps closed
 *   by memory, now     = floor((free GB - headroom) / GB per agent)  free memory already
 *                                                                   leaves out running apps
 *   machine maximum    = min(by CPU, by memory max), then the cap
 *   right now          = min(by CPU, by memory now), then the cap
 *
 * These are estimates, not measurements. A Claude plan's usage limits or the
 * human reviewer are often the real ceiling. The estimator never reads the
 * machine itself: this script writes maxAgents into its input first, so the
 * same input still gives the same numbers. Plain Node 18+, no dependencies.
 * --------------------------------------------------------------------------
 */
import os from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GB = 1024 ** 3;
const NUMBER_FLAGS = {
  'threads-per-agent': { key: 'threadsPerAgent', def: 2, min: 0, open: true },
  'gb-per-agent': { key: 'gbPerAgent', def: 5, min: 0, open: true },
  'reserve-gb': { key: 'reserveGB', def: 12, min: 0 },
  'headroom-gb': { key: 'headroomGB', def: 4, min: 0 },
};

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opt = { cap: null, json: false, write: null };
  for (const flag of Object.values(NUMBER_FLAGS)) opt[flag.key] = flag.def;
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) fail(`Unknown argument: ${argv[i]}`);
    const [, name, inline] = m;
    if (name === 'json') {
      if (inline !== undefined) fail('--json takes no value.');
      opt.json = true;
      continue;
    }
    const flag = NUMBER_FLAGS[name];
    if (!flag && name !== 'cap' && name !== 'write') fail(`Unknown option: --${name}`);
    // The value is "--name=value" or the next argument, but never the next option.
    const value = inline ?? (argv[i + 1]?.startsWith('--') ? undefined : argv[++i]);
    if (value === undefined || value === '') fail(`--${name} needs a value.`);
    if (name === 'write') { opt.write = value; continue; }
    const n = Number(value);
    if (name === 'cap') {
      if (!Number.isInteger(n) || n < 1) fail('--cap must be a whole number of agents, 1 or more.');
      opt.cap = n;
      continue;
    }
    if (!Number.isFinite(n) || n < flag.min || (flag.open && n === flag.min)) {
      fail(`--${name} must be a number ${flag.open ? 'above' : 'of at least'} ${flag.min}.`);
    }
    opt[flag.key] = n;
  }
  return opt;
}

function measure(opt) {
  const cpus = os.cpus();
  const threads = cpus.length || (os.availableParallelism ? os.availableParallelism() : 1);
  const cpu = (cpus[0]?.model || 'unknown CPU').replace(/\s+/g, ' ').trim();
  const totalGB = os.totalmem() / GB;
  const freeGB = os.freemem() / GB;

  const atLeastOne = (x) => Math.max(1, Math.floor(x));
  const byCpu = atLeastOne(threads / opt.threadsPerAgent);
  const byMemoryMax = atLeastOne((totalGB - opt.reserveGB) / opt.gbPerAgent);
  const byMemoryNow = atLeastOne((freeGB - opt.headroomGB) / opt.gbPerAgent);

  // The smallest limit wins; on a tie the CPU is named, since it cannot be freed up.
  const pick = (memory, memoryName) => {
    let value = Math.min(byCpu, memory);
    let limitedBy = byCpu <= memory ? 'CPU threads' : memoryName;
    if (opt.cap !== null && opt.cap < value) {
      value = opt.cap;
      limitedBy = 'your cap';
    }
    return { value, limitedBy };
  };
  const max = pick(byMemoryMax, 'total memory');
  const now = pick(byMemoryNow, 'free memory');

  return {
    checked: new Date().toISOString().slice(0, 10),
    cpu,
    threads,
    totalGB: round1(totalGB),
    freeGB: round1(freeGB),
    threadsPerAgent: opt.threadsPerAgent,
    gbPerAgent: opt.gbPerAgent,
    reserveGB: opt.reserveGB,
    headroomGB: opt.headroomGB,
    byCpu,
    byMemoryMax,
    byMemoryNow,
    cap: opt.cap,
    machineMax: max.value,
    machineMaxLimitedBy: max.limitedBy,
    rightNow: now.value,
    rightNowLimitedBy: now.limitedBy,
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function summary(m) {
  const agents = (n) => `${n} agent${n === 1 ? '' : 's'}`;
  const uncapped = Math.min(m.byCpu, m.byMemoryMax);
  const lines = [
    'Machine capacity for AI agents (an estimate)',
    '',
    `  CPU:     ${m.cpu}, ${m.threads} threads`,
    `  Memory:  ${m.totalGB} GB in total, ${m.freeGB} GB free now`,
    `  Per agent: ${m.threadsPerAgent} threads and ${m.gbPerAgent} GB. Kept back: ${m.reserveGB} GB for the system,`,
    `  editor, and Docker, and ${m.headroomGB} GB of free memory right now.`,
    '',
    `  Limit by CPU:                    ${agents(m.byCpu)}  (${m.threads} threads / ${m.threadsPerAgent})`,
    `  Limit by memory, apps closed:    ${agents(m.byMemoryMax)}  ((${m.totalGB} - ${m.reserveGB}) GB / ${m.gbPerAgent})`,
    `  Limit by memory, right now:      ${agents(m.byMemoryNow)}  ((${m.freeGB} - ${m.headroomGB}) GB / ${m.gbPerAgent})`,
  ];
  if (m.cap !== null) lines.push(`  Your cap:                        ${agents(m.cap)}`);
  lines.push(
    '',
    `  Machine maximum: ${agents(m.machineMax)}, limited by ${m.machineMaxLimitedBy}` +
      (m.machineMaxLimitedBy === 'your cap' ? ` (the machine allows ${uncapped})` : ''),
    `  Right now:       ${agents(m.rightNow)}, limited by ${m.rightNowLimitedBy}`,
    '',
    '  These are estimates, not measurements. The agents think in the cloud; the load on this',
    '  machine is what they run here: builds, tests, browsers, Docker, and dev servers. A Claude',
    '  plan\'s usage limits or the human reviewer may be the real ceiling.',
  );
  return lines.join('\n');
}

// Sets maxAgents and machine in an estimate input, keeping the other keys, their
// order, the indent, the line endings, and the final newline as they were.
function writeInput(path, m) {
  const file = resolve(process.cwd(), path);
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    fail(`Estimate input not found: ${file}`);
  }
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  let cfg;
  try {
    cfg = JSON.parse(raw.slice(bom.length));
  } catch (err) {
    fail(`Estimate input is not valid JSON: ${err.message}`);
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail('Estimate input must be a JSON object.');

  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const indentMatch = /^([ \t]+)"/m.exec(raw);
  // A file written on one line stays on one line.
  const indent = indentMatch ? indentMatch[1] : raw.trim().includes('\n') ? 2 : 0;
  const finalNewline = /\n$/.test(raw);

  const { checked, cpu, threads, totalGB, freeGB, threadsPerAgent, gbPerAgent, reserveGB, headroomGB,
    byCpu, byMemoryMax, byMemoryNow, cap, machineMax, machineMaxLimitedBy, rightNow } = m;
  const added = {
    maxAgents: machineMax,
    machine: {
      checked, cpu, threads, totalGB, freeGB, threadsPerAgent, gbPerAgent, reserveGB, headroomGB,
      byCpu, byMemoryMax, byMemoryNow, ...(cap !== null ? { cap } : {}),
      machineMax, limitedBy: machineMaxLimitedBy, rightNow,
    },
  };

  // New keys go after "sweep" or "teams" (or before "workPackages"), so they sit with the team settings.
  const keys = Object.keys(cfg);
  const anchor = ['sweep', 'teams'].find((k) => k in cfg);
  const out = {};
  const addMissing = () => {
    for (const [k, v] of Object.entries(added)) if (!(k in cfg) && !(k in out)) out[k] = v;
  };
  for (const k of keys) {
    if (!anchor && k === 'workPackages') addMissing();
    out[k] = k in added ? added[k] : cfg[k];
    if (k === anchor) addMissing();
  }
  addMissing();

  const text = JSON.stringify(out, null, indent).replace(/\n/g, eol);
  writeFileSync(file, bom + text + (finalNewline ? eol : ''), 'utf8');
  return file;
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const m = measure(opt);
  if (opt.json) console.log(JSON.stringify(m, null, 2));
  else console.log(summary(m));
  if (opt.write) {
    const file = writeInput(opt.write, m);
    const done = `✓ Set "maxAgents": ${m.machineMax} and the "machine" block in ${file}`;
    if (opt.json) console.error(done); // keep stdout pure JSON
    else console.log(`\n${done}`);
  }
}

main();
