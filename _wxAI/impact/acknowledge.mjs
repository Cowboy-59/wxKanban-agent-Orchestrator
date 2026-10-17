#!/usr/bin/env node
// Record a developer's answer to the impact of their OWN hand edit (SCOPE-137 FR-010, FR-013).
//
// The Cockpit calls this when the developer presses Agree or Undo in the agree panel. A hand
// edit's self-agreement is an ACKNOWLEDGMENT (change_impact_ack), never an approval — only the
// AI-edit hook's approve.mjs records approvals.
//
//   node _wxAI/impact/acknowledge.mjs --answer agree|undo --hash <content hash> --actor <name>
//        [--report .wxai/impact.json]
//
// Prints { sent, queued } as JSON. Offline, the record waits in .wxai/impact-queue.jsonl.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAgreementEvent, mcpConnection, mcpSender, projectIdFor, recordAgreement } from './lib/agreement.mjs';

// [SCOPE 137 / T011] BEGIN — Record Agree or Undo for a hand edit (FR-010, FR-013)
export async function acknowledge({ root, report, answer, hash, actor, send = null }) {
  if (!['agree', 'undo'].includes(answer)) return { ok: false, error: 'answer must be agree or undo' };
  if (!hash) return { ok: false, error: 'a content hash is required' };
  const projectId = projectIdFor(root);
  if (!projectId) return { ok: true, sent: false, queued: false, skipped: 'no wxKanban project id configured' };
  const event = buildAgreementEvent({
    projectId,
    actor: actor || 'developer',
    kind: 'acknowledgment',
    answer,
    attended: true,
    entryPoint: 'cockpit',
    report,
    hash,
  });
  if (report.classification?.dataLoss?.length) event.metadata.dataLoss = report.classification.dataLoss;
  const result = await recordAgreement(root, event, send ?? mcpSender(mcpConnection(root)));
  return { ok: true, sent: result.sent, queued: result.queued, rejected: Boolean(result.rejected) };
}

async function main(argv) {
  const arg = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const root = resolve(arg('root') ?? process.cwd());
  const reportPath = resolve(root, arg('report') ?? '.wxai/impact.json');
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, error: `cannot read ${reportPath}` }) + '\n');
    process.exit(2);
  }
  const out = await acknowledge({ root, report, answer: arg('answer'), hash: arg('hash'), actor: arg('actor') });
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(out.ok ? 0 : 2);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/acknowledge.mjs')) main(process.argv.slice(2));
// [SCOPE 137 / T011] END
