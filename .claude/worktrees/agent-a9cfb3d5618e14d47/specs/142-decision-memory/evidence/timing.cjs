// SC-4: wall time of one real hook-tool.mjs process per gate decision (node start included).
//   node timing.cjs <project> <runs> [label]
// Service states: none (file search only), refused (nothing listening), blackholed (no reply).
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const [project, runsArg] = process.argv.slice(2);
const runs = Number(runsArg || 50);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'timing-home-'));
const QUESTIONS = [
  'How are endorsements prorated?',
  'Should the log line use ISO 8601 or epoch milliseconds?',
  'Should I deploy this to App Runner tonight?',
  'Which test file should hold the new parser cases?',
  'Can I load the production customer table locally?',
];
const STATES = {
  none: {},
  refused: { OPENVIKING_URL: 'http://127.0.0.1:9' },
  blackholed: { OPENVIKING_URL: 'http://10.255.255.1:1933' },
};
const pct = (a, p) => a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
const summary = {};
for (const [state, extra] of Object.entries(STATES)) {
  const n = state === 'none' ? runs : Math.max(10, Math.round(runs / 5));
  const times = [];
  let fellBack = 0;
  for (let i = 0; i < n; i++) {
    const q = QUESTIONS[i % QUESTIONS.length];
    const input = JSON.stringify({ session_id: `t-${state}`, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: project, tool_input: { questions: [{ question: q, header: 'Q', options: [{ label: 'A' }, { label: 'B' }] }] } });
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project, HOME: home, USERPROFILE: home, ...extra };
    delete env.WXAI_UNATTENDED;
    if (state === 'none') delete env.OPENVIKING_URL;
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [path.join(project, '_wxAI', 'askgate', 'hook-tool.mjs')], { input, env, encoding: 'utf8' });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (/fallback/.test(r.stdout)) fellBack++;
  }
  times.sort((a, b) => a - b);
  summary[state] = { n, fellBack, p50: Math.round(pct(times, 50)), p95: Math.round(pct(times, 95)), max: Math.round(times[times.length - 1]), within2s: `${times.filter((t) => t <= 2000).length}/${n}` };
}
console.log(JSON.stringify(summary, null, 2));
fs.rmSync(home, { recursive: true, force: true });
