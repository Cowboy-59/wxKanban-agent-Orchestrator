#!/usr/bin/env node
// Record the developer's answer to a change the Change Impact hook stopped (SCOPE-137 FR-008).
//
// Run it ONLY after the developer has answered in chat. Their words go into the
// agreement log with the approval, so the record shows what was actually said.
//
//   node _wxAI/impact/approve.mjs --hash <hash> --answer approve --quote "<the developer's words>"
//   node _wxAI/impact/approve.mjs --hash <hash> --answer decline --quote "<the developer's words>"
//   add --data-loss to approve a change flagged as possible data loss (the developer must
//   have been told it may lose data, and agreed to that specifically)
//
// An approval allows the SAME edit, retried once, within 30 minutes. A different
// edit, or the same file changed differently, is checked again from scratch.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildAgreementEvent, mcpConnection, mcpSender, projectIdFor, recordAgreement } from './lib/agreement.mjs';
import { grantApproval, readPending } from './lib/approvals.mjs';

// [SCOPE 137 / T009] BEGIN — Record a developer's answer to a stopped AI edit (FR-008, FR-013)
// MODIFIED-BY: [SCOPE 137 / T017] — windowsHide on the git spawn (no console window on Windows)
function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function whoAmI(root) {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { windowsHide: true, cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (name) return name;
  } catch {
    // no git identity
  }
  return process.env.USER ?? process.env.USERNAME ?? 'developer';
}

export async function approve({ root, hash, answer, quote, dataLoss = false, actor = whoAmI(root), send = null }) {
  if (!hash || !['approve', 'decline'].includes(answer) || !quote?.trim()) {
    return { ok: false, code: 2, message: 'Need --hash, --answer approve|decline, and --quote with the developer\'s words.' };
  }
  const pending = readPending(root, hash);
  if (!pending) {
    return { ok: false, code: 2, message: `No stopped change with hash ${hash}. Retry the edit so the hook can show it again.` };
  }
  const stops = pending.report.classification?.decision === 'stop';
  if (answer === 'approve' && stops && !dataLoss) {
    return {
      ok: false,
      code: 2,
      message: 'This change was flagged as possible data loss. Tell the developer exactly what may be lost, and record their approval with --data-loss only if they agree to that.',
    };
  }
  if (answer === 'approve') grantApproval(root, { hash, files: pending.files, actor, quote: quote.trim(), dataLoss });

  const projectId = projectIdFor(root);
  let logged = { sent: false, queued: false, skipped: 'no wxKanban project id configured' };
  if (projectId) {
    const event = buildAgreementEvent({
      projectId,
      actor,
      kind: 'approval',
      answer,
      attended: true,
      entryPoint: 'hook',
      report: pending.report,
      hash,
    });
    event.metadata.quote = quote.trim().slice(0, 500);
    if (stops) event.metadata.dataLoss = pending.report.classification.dataLoss;
    logged = await recordAgreement(root, event, send ?? mcpSender(mcpConnection(root)));
  }
  return {
    ok: true,
    code: 0,
    message: answer === 'approve'
      ? `Approved. Retry the same edit now; the approval is used once and expires in 30 minutes.`
      : 'Declined. Do not retry this edit; propose a different change instead.',
    logged,
  };
}

async function main(argv) {
  const root = resolve(arg(argv, 'root') ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const result = await approve({
    root,
    hash: arg(argv, 'hash'),
    answer: arg(argv, 'answer'),
    quote: arg(argv, 'quote'),
    dataLoss: argv.includes('--data-loss'),
    actor: arg(argv, 'actor') ?? undefined,
  });
  const where = result.logged?.sent ? 'recorded in wxKanban' : result.logged?.queued ? 'queued for wxKanban (offline)' : result.logged?.skipped ?? '';
  process.stdout.write(`${result.message}${where ? ` Agreement log: ${where}.` : ''}\n`);
  process.exit(result.code);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/approve.mjs')) main(process.argv.slice(2));
// [SCOPE 137 / T009] END
