#!/usr/bin/env node
// Capture hook entry (SPEC-143 FR-003). Registered for SubagentStop, PostToolUse (Agent) and Stop.
// Reads the hook JSON from stdin, hands the few fields it needs to a DETACHED worker and exits at once
// (each node hook costs ~250 ms; the transcript parsing happens in the worker). Never blocks, never
// prints, always exits 0. Plain Node ESM, no dependencies.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const event = i.hook_event_name;
    if (!['SubagentStop', 'PostToolUse', 'Stop'].includes(event)) return;
    if (event === 'PostToolUse' && i.tool_name !== 'Agent') return;
    const r = i.tool_response ?? {};
    const payload = {
      event,
      root: process.env.CLAUDE_PROJECT_DIR || i.cwd || process.cwd(),
      sessionId: i.session_id,
      transcriptPath: i.transcript_path,
      agentId: i.agent_id ?? r.agentId ?? null,
      agentType: i.agent_type ?? r.agentType ?? null,
      agentTranscriptPath: i.agent_transcript_path ?? null,
      status: r.status ?? null,
    };
    const worker = join(dirname(fileURLToPath(import.meta.url)), 'capture-worker.mjs');
    const child = spawn(process.execPath, [worker, Buffer.from(JSON.stringify(payload)).toString('base64')], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
  } catch { /* a capture failure must never break a session */ }
});
