// SC-2: replay every gate-log line in the live test projects against that project's own ledger.
// An "answered" line is wrong if its entry is missing, superseded, unknown-evidence, not owner
// approved, a non-answering kind, or came from another repo without a link.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const S = process.argv[2];
const { readLedger, isAnswerEligible } = await import(pathToFileURL('E:/AI_Development/wxperts/wxKanban/_wxAI/askgate/ledger.mjs').href);
let lines = 0, answered = 0, wrong = 0;
const outcomes = {};
for (const d of readdirSync(S)) {
  const log = join(S, d, 'decisions', 'gate-log.jsonl');
  if (!existsSync(log)) continue;
  const entries = readLedger(join(S, d));
  for (const raw of readFileSync(log, 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(raw);
    lines++;
    outcomes[e.outcome] = (outcomes[e.outcome] ?? 0) + 1;
    if (e.outcome !== 'answered') continue;
    answered++;
    const hit = entries.find((x) => x.id === e.ledgerId);
    const ok = hit && isAnswerEligible(hit, entries);
    if (!ok) { wrong++; console.log('WRONG', d, e.ledgerId, e.question); }
  }
}
console.log(JSON.stringify({ projects: readdirSync(S).filter((d) => existsSync(join(S, d, 'decisions', 'gate-log.jsonl'))).length, lines, answered, wrong, outcomes }));
