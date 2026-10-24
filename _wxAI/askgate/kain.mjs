#!/usr/bin/env node
// KAIN's answers, awaiting the owner's review (SPEC-142 Amendment A, FR-022 to FR-025).
//
//   node _wxAI/askgate/kain.mjs list [--root <dir>] [--json]
//   node _wxAI/askgate/kain.mjs review <KR-nnnn> approve|reject [--root <dir>]
//   node _wxAI/askgate/kain.mjs review <KR-nnnn> change "<the owner's answer>" [--root <dir>]
//   ... review ... --approved-by "<name>"   the Room Approver who reviewed (SPEC-144 FR-008);
//                                            the ledger's approved_by and the reply's reviewedBy
//
// In a project-agent room KAIN may answer a parked question acting as the owner, so the work goes
// on. Its answer is recorded here, never in the ledger, and never answers a later question. The
// owner reviews each one: approve or change appends a ledger entry through the ledger script
// (approved_by: owner); reject appends nothing. Every verdict is queued for the room
// (.wxai/room-outbox.jsonl, drained by the bridge) so KAIN sees how the owner judged it: that is
// how KAIN learns to answer as the owner.
//
// This file is written only by route.mjs (a KAIN answer, which the bridge attributes) and by the
// review here; the ledger guard denies direct agent writes to it. Plain Node, no dependencies.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AGENT_APPROVERS, appendEntry, parseLedgerText } from './ledger.mjs';
import { logOutcome } from './log.mjs';

export const REPLIES_REL = join('decisions', 'kain-replies.yaml');
export const OUTBOX_REL = join('.wxai', 'room-outbox.jsonl');
export const VERDICTS = { approve: 'approved', change: 'changed', reject: 'rejected' };
const HEADER = "# KAIN's answers awaiting the owner's review (SPEC-142 Amendment A). Written only by _wxAI/askgate/kain.mjs and route.mjs.\n";
const FIELDS = ['id', 'dq', 'by', 'unit', 'blocks', 'question', 'answer', 'time', 'status', 'ownerAnswer', 'ledgerId', 'reviewedAt', 'reviewedBy'];

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
export function repliesPath(root) {
  return join(resolve(root ?? process.cwd()), REPLIES_REL);
}
// [SCOPE 142 / T024] END

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
export function readReplies(root) {
  const file = repliesPath(root);
  if (!existsSync(file)) return [];
  return parseLedgerText(readFileSync(file, 'utf8'));
}
// [SCOPE 142 / T024] END

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
function writeReplies(root, list) {
  const file = repliesPath(root);
  mkdirSync(dirname(file), { recursive: true });
  const body = list
    .map((r) => FIELDS.filter((k) => r[k] !== undefined).map((k, i) => `${i === 0 ? '- ' : '  '}${k}: ${r[k] === null ? 'null' : JSON.stringify(String(r[k]))}`).join('\n'))
    .join('\n');
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${HEADER}${body}${body ? '\n' : ''}`, 'utf8');
  renameSync(tmp, file);
}
// [SCOPE 142 / T024] END

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
function nextId(list) {
  let max = 0;
  for (const r of list) {
    const m = /^KR-(\d+)$/.exec(r?.id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `KR-${String(max + 1).padStart(4, '0')}`;
}
// [SCOPE 142 / T024] END

/** Record one KAIN answer to a queue item as pending review. Returns the new reply. */
// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
export function recordKainReply(root, { dq, by = 'KAIN', unit = null, blocks = [], question, answer, time = new Date().toISOString() }) {
  if (!question || !String(answer ?? '').trim()) throw new Error('a KAIN reply needs the question and an answer');
  const list = readReplies(root);
  const reply = {
    id: nextId(list), dq, by, unit, blocks: (Array.isArray(blocks) ? blocks : []).join(','),
    question: String(question), answer: String(answer).trim(), time, status: 'pending',
  };
  writeReplies(root, [...list, reply]);
  logOutcome(root, { time, session: null, intercept: 'room', question: reply.question, outcome: 'kain-answered', class: 'blocker', ledgerId: null, score: null, dqId: dq, krId: reply.id, by });
  return reply;
}
// [SCOPE 142 / T024] END

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
export function pendingReplies(root) {
  return readReplies(root).filter((r) => r.status === 'pending');
}
// [SCOPE 142 / T024] END

/** The room line that tells KAIN how the owner judged one reply (FR-024). */
// [SCOPE 142 / T026] BEGIN — Verdict posts to the room and the KAIN contract section (FR-024)
// MODIFIED-BY: [SCOPE 144 / T010] — names the Room Approver who reviewed, when one is recorded
export function verdictText(r) {
  const judged = r.status === 'approved' ? 'approved it'
    : r.status === 'changed' ? `changed it to: "${r.ownerAnswer}"`
    : 'rejected it';
  const units = r.status === 'approved' ? '' : String(r.blocks || '').split(',').filter(Boolean).join(', ');
  const who = r.reviewedBy && r.reviewedBy !== 'owner' ? `the owner (${r.reviewedBy})` : 'the owner';
  return `${r.id} (${r.dq}) "${r.question}" — ${r.by} answered "${r.answer}"; ${who} ${judged}.${units ? ` Check the work done under it: ${units}.` : ''}`;
}
// [SCOPE 142 / T026] END

// [SCOPE 142 / T026] BEGIN — Verdict posts to the room and the KAIN contract section (FR-024)
function queueForRoom(root, text, time) {
  const file = join(resolve(root), OUTBOX_REL);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ time, text })}\n`, 'utf8');
}
// [SCOPE 142 / T026] END

/**
 * The owner's verdict on one pending reply. `by` must be the owner: KAIN never reviews itself.
 * Returns { ok, id, verdict, ledgerId, recheck } where recheck lists the units that went on under
 * an answer the owner changed or rejected.
 */
// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
// MODIFIED-BY: [SCOPE 144 / T010] — approvedBy (the Room Approver's name) is the ledger approved_by and the reply's reviewedBy
export function reviewReply(root, id, verdict, { ownerAnswer, by = 'owner', approvedBy, now = () => new Date().toISOString() } = {}) {
  if (by !== 'owner') return { ok: false, error: `only the owner reviews KAIN's replies (${by} cannot)` };
  const reviewer = typeof approvedBy === 'string' && approvedBy.trim() ? approvedBy.trim() : 'owner';
  if (AGENT_APPROVERS.includes(reviewer.toLowerCase())) return { ok: false, error: `only the owner reviews KAIN's replies (${reviewer} cannot)` };
  if (!VERDICTS[verdict]) return { ok: false, error: `verdict must be approve, change or reject (got ${JSON.stringify(verdict)})` };
  if (verdict === 'change' && !String(ownerAnswer ?? '').trim()) return { ok: false, error: 'change needs the owner\'s answer' };
  const list = readReplies(root);
  const r = list.find((x) => x.id === id);
  if (!r) return { ok: false, error: `no KAIN reply ${id}` };
  if (r.status !== 'pending') return { ok: false, error: `${id} is already ${r.status}` };
  const time = now();
  let ledgerId = null;
  if (verdict !== 'reject') {
    const decision = verdict === 'change' ? String(ownerAnswer).trim() : r.answer;
    const rationale = verdict === 'change'
      ? `The owner changed ${r.by}'s answer (${id}: "${r.answer}")`
      : `${r.by} answered as the owner (${id}); the owner approved it`;
    const entry = appendEntry(root, {
      scope: r.unit || 'unscoped', question: r.question, decision, rationale,
      kind: 'Agreed', evidence: 'confirmed', source: `decisions/kain-replies.yaml#${id}`, date: time.slice(0, 10), supersedes: null,
    }, reviewer);
    ledgerId = entry.id;
  }
  r.status = VERDICTS[verdict];
  if (verdict === 'change') r.ownerAnswer = String(ownerAnswer).trim();
  r.ledgerId = ledgerId;
  r.reviewedAt = time;
  r.reviewedBy = reviewer;
  writeReplies(root, list);
  queueForRoom(root, verdictText(r), time);
  logOutcome(root, { time, session: null, intercept: 'review', question: r.question, outcome: `kain-${r.status}`, class: null, ledgerId, score: null, dqId: r.dq, krId: id });
  const recheck = verdict === 'approve' ? [] : String(r.blocks || '').split(',').filter(Boolean);
  return { ok: true, id, verdict: r.status, ledgerId, reviewedBy: reviewer, recheck };
}
// [SCOPE 142 / T024] END

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
// MODIFIED-BY: [SCOPE 144 / T010] — review takes --approved-by <name>
function runCli(argv) {
  const words = [];
  let root = process.cwd();
  let json = false;
  let approvedBy;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i] ?? '.');
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--approved-by') approvedBy = argv[++i];
    else words.push(argv[i]);
  }
  const [cmd, id, verdict, ...rest] = words;
  const out = (s) => process.stdout.write(`${s}\n`);
  if (cmd === 'list') {
    const pending = pendingReplies(root);
    if (json) return out(JSON.stringify(pending, null, 2)), 0;
    if (!pending.length) return out('No KAIN replies awaiting review.'), 0;
    out(`${pending.length} KAIN repl${pending.length === 1 ? 'y' : 'ies'} awaiting your review, oldest first:`);
    for (const r of pending) {
      out(`\n${r.id}  (${r.dq}, ${r.time})${r.blocks ? `  units that went on under it: ${r.blocks}` : ''}`);
      out(`  Question: ${r.question}`);
      out(`  ${r.by} answered: ${r.answer}`);
    }
    out('\nReview each: kain.mjs review <KR-id> approve | change "<your answer>" | reject');
    return 0;
  }
  if (cmd === 'review') {
    const res = reviewReply(root, id, verdict, { ownerAnswer: rest.join(' '), approvedBy });
    out(JSON.stringify(res));
    return res.ok ? 0 : 1;
  }
  process.stderr.write('usage: kain.mjs list [--json] | review <KR-id> approve|change "<answer>"|reject [--root <dir>]\n');
  return 2;
}
// [SCOPE 142 / T024] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/kain.mjs')) {
  process.exitCode = runCli(process.argv.slice(2));
}
