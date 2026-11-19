// Per mode: which hook decided each of the four steps, read from the transcript's hook attachments.
const fs = require('fs');
const path = require('path');
const os = require('os');
const S = __dirname;
const root = path.join(os.homedir(), '.claude', 'projects');
const find = (sid) => {
  for (const d of fs.readdirSync(root)) {
    const f = path.join(root, d, `${sid}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
};
const rows = [];
const PFX = process.argv[2] || 'mode';
for (const mode of ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']) {
  const out = JSON.parse(fs.readFileSync(path.join(S, `${PFX}-${mode}.out.json`), 'utf8'));
  const file = find(out.session_id);
  fs.copyFileSync(file, path.join(S, `${PFX}-${mode}.transcript.jsonl`));
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const uses = [];
  const hooks = {};
  const results = {};
  for (const r of lines) {
    const a = r.attachment;
    if (a && /hook/.test(a.type) && a.toolUseID) {
      (hooks[a.toolUseID] ??= []).push(`${a.type}:${a.hookName}:${(a.blockingError?.blockingError ?? a.content ?? a.stderr ?? '').toString().replace(/\s+/g, ' ').slice(0, 70)}`);
    }
    const c = r.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === 'tool_use' && b.name !== 'ToolSearch') uses.push(b);
      if (b.type === 'tool_result') results[b.tool_use_id] = (typeof b.content === 'string' ? b.content : JSON.stringify(b.content)).replace(/\s+/g, ' ').slice(0, 90);
    }
  }
  rows.push({ mode, steps: uses.map((u) => ({ tool: u.name, target: (u.input.file_path ?? u.input.command ?? u.input.questions?.[0]?.question ?? '').toString().replace(/.*mode-[A-Za-z]+[\\/]/, ''), hooks: hooks[u.id] ?? [], result: results[u.id] })) });
}
for (const r of rows) {
  console.log(`\n## ${r.mode}`);
  for (const s of r.steps) {
    console.log(`- ${s.tool} ${s.target.slice(0, 50)}`);
    for (const h of s.hooks) console.log(`    hook: ${h}`);
    console.log(`    result: ${s.result}`);
  }
}
fs.writeFileSync(path.join(S, `${PFX}-attribution.json`), JSON.stringify(rows, null, 2));
