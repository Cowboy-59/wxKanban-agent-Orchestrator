#!/usr/bin/env node
// god-loop.mjs — run a wxG-O-D --create job one phase per FRESH Claude Code session.
// Each session starts with empty context (same effect as /clear), so tokens don't snowball.
//
//   node scripts/god-loop.mjs                 # up to 20 sessions
//   node scripts/god-loop.mjs --max=5         # stop after 5 sessions
//   node scripts/god-loop.mjs --model=sonnet  # cheaper model for build phases
//   node scripts/god-loop.mjs -- --permission-mode acceptEdits   # extra args for claude
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash < 0 ? argv : argv.slice(0, dash);
const extra = dash < 0 ? [] : argv.slice(dash + 1);
const opt = (k, d) => (own.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const MAX = Number(opt('max', 20));
const MODEL = opt('model', '');
const STATE = join(process.cwd(), 'docs', 'GOD-State.json');

const PROMPT =
  '/wxG-O-D --resume  TOKEN-BUDGET MODE: complete ONLY the next phase (or the next unit if the ' +
  'phase is large), commit it locally, write docs/GOD-State.json, then STOP. Do not start the next ' +
  'phase. Delegate heavy reading/implementation to subagents and keep only their summaries.';

const read = () => (existsSync(STATE) ? readFileSync(STATE, 'utf8') : null);

for (let i = 1; i <= MAX; i++) {
  const before = read();
  if (!before) { console.error('No docs/GOD-State.json — start the run first with /wxG-O-D --create.'); process.exit(1); }
  const s = JSON.parse(before);
  if (s.phase === 'done') { console.log('G.O.D. run is done.'); process.exit(0); }

  console.log(`\n=== session ${i}/${MAX} — resuming at phase: ${s.phase ?? '?'} ===\n`);
  const args = ['-p', ...(MODEL ? ['--model', MODEL] : []), ...extra];
  const r = spawnSync('claude', args, {
    input: PROMPT,                       // prompt via stdin: no Windows quoting problems
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) { console.error(`claude exited ${r.status}; stopping.`); process.exit(r.status ?? 1); }

  if (read() === before) {           // no progress = blocked or waiting on you; don't burn tokens
    console.log('State did not change — G.O.D. is blocked or needs you. Check docs/GOD-Decisions.md.');
    process.exit(2);
  }
}
console.log(`Reached --max=${MAX} sessions; run again to continue.`);
