// SessionStart hook (matchers: clear, compact). Adds ONE short line, not the whole state file.
import { readFileSync, existsSync } from 'node:fs';
const p = 'docs/GOD-State.json';
if (existsSync(p)) {
  try {
    const s = JSON.parse(readFileSync(p, 'utf8'));
    if (s.phase && s.phase !== 'done')
      console.log(`A wxG-O-D ${s.mode ?? ''} run is paused at phase "${s.phase}". To continue, run /wxG-O-D --resume (state: ${p}).`);
  } catch {}
}
