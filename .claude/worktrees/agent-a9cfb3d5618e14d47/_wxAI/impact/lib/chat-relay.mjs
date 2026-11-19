// Chat relay queue for Impact Boundary / crossing prompts raised outside an AI edit
// (SCOPE-137 Amendment C, FR-010a).
//
// FR-008's AI-edit hook already gets its impact list into the Claude Code chat panel by
// DENYING the tool call with the list as the deny reason: Claude reads that reason and relays
// it into chat as its own message. The self-opening agree panel (a human's own hand edit) and
// the unattended-run crossing logger are not themselves a PreToolUse call Claude is making, so
// there is nothing for either of them to deny. Instead, each queues the same content here, and
// the hook drains the queue on its NEXT invocation — any tool call at all — and hands it to
// Claude as additionalContext (or folds it into whatever it was already going to say), which
// Claude then relays into chat the same way. This reuses the existing file-based hook/relay
// pattern rather than inventing a new transport (no HTTP callback, no websocket).
//
// This queue carries no approval state of its own — only the text to show. Whichever surface
// (the VS Code panel's Agree/Undo, or a "yes" typed in chat) the developer answers from still
// resolves through the SAME single-use record `acknowledge.mjs`/`approve.mjs` already key on
// file + change hash, so there is no second approval path and no duplicate agreement-log entry.

import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 137 / T022] BEGIN — Queue + drain: one relay entry per self-opened boundary or crossing (FR-010a)
export const RELAY_FILE = join('.wxai', 'impact-chat-relay.jsonl');
/** A queued prompt nobody read within this long relays once more rather than silently vanishing. */
export const RELAY_STALE_MS = 24 * 60 * 60 * 1000;

/** Queue one prompt's content for the next PreToolUse hook call to relay into chat. */
export function queueChatRelay(root, entry) {
  const file = join(root, RELAY_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

/**
 * Everything queued since the last drain, cleared as it is read so nothing relays twice. Safe to
 * call on every hook invocation, including ones that end up with no opinion of their own.
 */
export function drainChatRelay(root, { now = Date.now() } = {}) {
  const file = join(root, RELAY_FILE);
  if (!existsSync(file)) return [];
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  try {
    unlinkSync(file);
  } catch {
    // another process may have drained it first; what was already read here still relays once
  }
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && now - Date.parse(e.at) < RELAY_STALE_MS);
}
// [SCOPE 137 / T022] END

// [SCOPE 137 / T022] BEGIN — The chat text: FR-002's affected list and confidence labels (FR-010a)
function reachedLines(report, max = 15) {
  const seen = new Set();
  const lines = [];
  for (const l of report?.links ?? []) {
    if (l.direction !== 'dependent' || String(l.to).includes(':') || seen.has(l.to)) continue;
    seen.add(l.to);
    lines.push(`  - ${l.to} (${l.type}, ${l.confidence})`);
  }
  const more = lines.length > max ? [`  - … and ${lines.length - max} more (see .wxai/impact-summary.md)`] : [];
  return [...lines.slice(0, max), ...more];
}

/** One queued entry, rendered exactly like FR-008's existing hook text. */
export function renderRelayEntry(entry) {
  const r = entry.report ?? null;
  const files = (entry.files ?? (entry.file ? [entry.file] : [])).filter(Boolean);
  const lines =
    entry.source === 'unattended'
      ? [`Change Impact: an unattended run crossed an Impact Boundary in ${files.join(', ') || '(unknown file)'}.`]
      : [`Change Impact: your edit to ${files.join(', ') || '(unknown file)'} crossed an Impact Boundary.`];
  for (const reason of r?.classification?.reasons ?? []) lines.push(`  - Boundary: ${reason.detail}`);
  if (r?.summary?.affected !== undefined) {
    lines.push(`Affected files: ${r.summary.affected}`);
    lines.push(...reachedLines(r));
  }
  if (entry.source === 'unattended') {
    lines.push(
      '',
      'Informational only — this did not wait for an answer (FR-009\'s "0 waits" guarantee). It is also listed at the next checkpoint.',
    );
  } else {
    lines.push(
      '',
      'Show the developer this in chat; the agree panel is open in VS Code too — whichever they answer first settles it.',
      `If they answer here, record their own words with: node _wxAI/impact/acknowledge.mjs --answer agree --hash ${entry.hash} --actor "<name>"  (or --answer undo)`,
    );
  }
  return lines.join('\n');
}

/** Every queued entry as one block, in the order they were queued. */
export function renderChatRelay(entries) {
  return entries.map(renderRelayEntry).join('\n\n');
}
// [SCOPE 137 / T022] END

// [SCOPE 137 / T022] BEGIN — One answer per hash, whichever surface it comes from first (FR-010a)
export const RESOLVED_FILE = join('.wxai', 'impact-chat-relay-resolved.json');
const RESOLVED_TTL_MS = RELAY_STALE_MS;

function readResolved(root, now) {
  const file = join(root, RESOLVED_FILE);
  if (!existsSync(file)) return [];
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((r) => now - Date.parse(r.at) < RESOLVED_TTL_MS) : [];
  } catch {
    return [];
  }
}

/** Has this hash already been answered (from either the agree panel or chat)? */
export function isRelayResolved(root, hash, { now = Date.now() } = {}) {
  return readResolved(root, now).some((r) => r.hash === hash);
}

/**
 * Record that this hash is answered, so the OTHER surface's own answer for the same hash is a
 * no-op instead of a second agreement-log entry. acknowledge.mjs calls this once it has sent
 * (or queued) the developer's answer — from either the panel's Agree/Undo or a chat reply that
 * ran the same command.
 */
export function markRelayResolved(root, hash, { now = Date.now() } = {}) {
  const file = join(root, RESOLVED_FILE);
  const list = readResolved(root, now).filter((r) => r.hash !== hash);
  list.push({ hash, at: new Date(now).toISOString() });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
}
// [SCOPE 137 / T022] END
