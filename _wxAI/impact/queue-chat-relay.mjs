#!/usr/bin/env node
// Queue the agree panel's content for the next PreToolUse hook to relay into chat
// (SCOPE-137 Amendment C / T022, FR-010a).
//
//   node _wxAI/impact/queue-chat-relay.mjs --hash <content hash> --file <rel> [--root <dir>]
//        [--report .wxai/impact.json]
//
// Called by the Cockpit ONLY when the agree panel opens ITSELF at an Impact Boundary (a human's
// own hand edit) — never for the plain-click case, since nothing new happened to report there.
// The content queued is exactly what the panel is showing. The unattended crossing logger queues
// its own entry directly through lib/chat-relay.mjs (hook.mjs already has the report in hand;
// no process to spawn there).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compactReport } from './lib/approvals.mjs';
import { queueChatRelay } from './lib/chat-relay.mjs';

// [SCOPE 137 / T022] BEGIN — CLI: queue one agree-panel prompt for the chat relay (FR-010a)
function main(argv) {
  const arg = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const root = resolve(arg('root') ?? process.cwd());
  const hash = arg('hash');
  const file = arg('file');
  if (!hash || !file) {
    process.stderr.write('Usage: queue-chat-relay.mjs --hash <hash> --file <rel> [--root <dir>] [--report <path>]\n');
    return 2;
  }
  let report = null;
  try {
    const reportPath = resolve(root, arg('report') ?? '.wxai/impact.json');
    report = compactReport(JSON.parse(readFileSync(reportPath, 'utf8')));
  } catch {
    // no report on disk yet; relay the boundary without the affected list rather than failing
  }
  queueChatRelay(root, { source: 'hand', file, files: [file], hash, report });
  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  return 0;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/queue-chat-relay.mjs')) process.exit(main(process.argv.slice(2)));
// [SCOPE 137 / T022] END
