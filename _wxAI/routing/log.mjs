// Routing audit log (SPEC-143 C5, FR-015). Append only: this module never rewrites or deletes a line.
// Plain Node ESM, no dependencies.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROUTING_LOG_REL = join('decisions', 'routing-log.jsonl');
export const EVENTS = ['model-choice', 'escalation', 'refusal', 'comparison', 'proposal', 'approval', 'override'];

export function logEvent(root, event, now = () => new Date().toISOString()) {
  if (!event || !EVENTS.includes(event.event)) {
    throw new Error('logEvent: event must be one of ' + EVENTS.join(', '));
  }
  const line = {
    time: event.time ?? now(),
    event: event.event,
    taskid: event.taskid ?? null,
    command: event.command ?? null,
    from: event.from ?? null,
    to: event.to ?? null,
    reason: event.reason ?? null,
    evidence: event.evidence ?? null,
  };
  const file = join(root, ROUTING_LOG_REL);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(line) + '\n', 'utf8');
  return line;
}
