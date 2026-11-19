// Gate audit log (SPEC-142, contract C4): decisions/gate-log.jsonl, append only.
//
// One JSON object per intercepted question:
//   {"time","session","intercept":"tool|stop|god","question","outcome","class","ledgerId","score","wouldHaveAnswered","mode"}
// This module only ever appends; it has no function that rewrites or removes a line.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function logPath(root) {
  return join(resolve(root ?? process.cwd()), 'decisions', 'gate-log.jsonl');
}
// [SCOPE 142 / T006] END

/**
 * Append one event as one line. `time` is filled in when missing. Returns { ok, file } or
 * { ok:false, error }; it never throws, so a logging failure cannot break the question flow.
 */
// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function logOutcome(root, event) {
  const file = logPath(root);
  try {
    mkdirSync(dirname(file), { recursive: true });
    const line = { time: new Date().toISOString(), ...(event ?? {}) };
    appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8');
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
// [SCOPE 142 / T006] END
