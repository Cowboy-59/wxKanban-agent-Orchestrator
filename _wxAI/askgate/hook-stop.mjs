#!/usr/bin/env node
// Claude Code Stop hook: the Ask Gate's plain-text intercept (SPEC-142 FR-006).
//
// Proven by the T001 spike (specs/142-decision-memory/spike-stop-hook.md): stdin carries
// last_assistant_message (transcript_path as the fallback) and stop_hook_active; printing
// {"decision":"block","reason":"..."} with exit 0 makes the agent continue from `reason`;
// exit 0 with no decision lets it stop.
//
// When the agent's final message ends in a question, or in a request for a decision without a
// "?" ("Please confirm...", "Let me know which..."), the same gate flow runs as for the
// AskUserQuestion tool. In enforce mode a question the ledger answers blocks the stop and hands the
// agent the decision. An uncovered question that is not a blocker is assumed (the agent is told to
// choose the default) only in an unattended run; with a person present it reaches them, like a
// blocker. Observe mode never blocks.
//
// Loop guard: not a blanket stop_hook_active check (that lets a second, different question through).
// Each session keeps the hashes of the questions the gate already handed back THIS turn; only the
// same question asked again is let through. A new turn (stop_hook_active false) starts a fresh set.
// Claude Code also caps consecutive stop-hook continuations (8 by default).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { logUnchecked, nobodyToAnswer, runGate } from './gate.mjs';

export { nobodyToAnswer };

export const TURN_STATE_REL = join('.wxai', 'askgate-stop-turns.json');
const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_QUESTIONS = 4;

// ---------- the final message ----------

/** Text of the last assistant message: last_assistant_message, else the transcript's last text. */
// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
export function finalAssistantText(input) {
  if (typeof input?.last_assistant_message === 'string') return input.last_assistant_message;
  const file = input?.transcript_path;
  if (typeof file !== 'string' || !existsSync(file)) return '';
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split('\n');
  } catch {
    return '';
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const msg = row?.message ?? row;
    if ((row?.type ?? msg?.role) !== 'assistant') continue;
    const content = msg?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : '';
    if (text.trim()) return text;
  }
  return '';
}
// [SCOPE 142 / T009] END

// ---------- trailing questions ----------

const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)]|[A-Za-z][.)])\s+/;
const strip = (l) => l.replace(/^\s*(?:>\s*)?(?:[-*+•]|\d+[.)])?\s*/, '').replace(/[*_`~\s]+$/g, '').replace(/^[*_`~]+/, '').trim();

/** A request for a decision phrased without a "?" (spike limit 4). */
export const REQUEST_RE = new RegExp(
  [
    '^(?:please\\s+)?(?:confirm|approve|advise|decide|choose|pick|select|tell me|let me know)\\b',
    '\\blet me know (?:which|whether|if|what|how|when)\\b',
    '\\b(?:please )?(?:confirm|approve) (?:that|whether|if|which|the|this|before)\\b',
    '\\b(?:waiting|wait) (?:for|on) your (?:approval|go-ahead|decision|answer|confirmation|input|call)\\b',
    '\\bi need your (?:approval|go-ahead|decision|answer|confirmation|input)\\b',
    '\\b(?:your call|up to you|your choice)\\b',
    '\\bwhich (?:would you|do you) (?:prefer|like|want)\\b',
  ].join('|'),
  'i',
);

// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
function lastSentences(line, n = 2) {
  const parts = line.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(-n).join(' ');
}
// [SCOPE 142 / T009] END

/**
 * "Before I write the calculation: how are endorsements prorated?" -> the question after the colon.
 * A lead-in dilutes the ledger match score enough to miss a decision that answers it.
 */
// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
export function withoutLeadIn(text) {
  const m = /^[^?:]{3,}:\s+(.+\?)["')\]]*$/.exec(text);
  if (!m || m[1].split(/\s+/).length < 3) return text;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1);
}
// [SCOPE 142 / T009] END

/**
 * The question candidates the final message ends with: [{ text, options, detectedBy }].
 * Trailing option lists ("1. A  2. B") are kept as the question's options.
 */
// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
export function trailingQuestions(message) {
  const lines = String(message ?? '').replace(/\r/g, '').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const options = [];
  while (lines.length && LIST_ITEM.test(lines[lines.length - 1]) && !/\?\s*[*_`]*\s*$/.test(lines[lines.length - 1])) {
    options.unshift(strip(lines.pop()));
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  }
  const whole = String(message ?? '').trim();
  const found = [];
  while (lines.length && found.length < MAX_QUESTIONS) {
    const raw = lines[lines.length - 1];
    if (!raw.trim()) {
      lines.pop();
      continue;
    }
    const line = strip(raw);
    let detectedBy = null;
    if (/\?["')\]]*$/.test(line)) detectedBy = 'question-mark';
    else if (REQUEST_RE.test(line)) detectedBy = 'request';
    if (!detectedBy) break;
    // The question sentence is what is classified; the wider texts are only searched, and the best
    // answered hit wins (gate.mjs searchCandidates). A preface sentence must not hide a decision.
    const sentence = lastSentences(line, 1);
    const text = detectedBy === 'question-mark' ? withoutLeadIn(sentence) : sentence;
    const searchTexts = [sentence, lastSentences(line, 2), line];
    if (!found.length) {
      const blank = lines.map((l) => !l.trim()).lastIndexOf(true);
      searchTexts.push(lines.slice(blank + 1).map(strip).join(' '), whole);
    }
    found.unshift({ text, options: [], detectedBy, searchTexts: [...new Set(searchTexts.filter((t) => t && t !== text))] });
    lines.pop();
  }
  if (found.length && options.length) found[found.length - 1].options = options.map((label) => ({ label }));
  return found;
}
// [SCOPE 142 / T009] END

// ---------- the per-session, per-turn repeat guard ----------

// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
export const questionHash = (text) => createHash('sha256').update(String(text).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
// [SCOPE 142 / T009] END

// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
function readTurns(root) {
  try {
    return JSON.parse(readFileSync(join(root, TURN_STATE_REL), 'utf8'));
  } catch {
    return {};
  }
}
// [SCOPE 142 / T009] END

// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
function writeTurns(root, state) {
  const file = join(root, TURN_STATE_REL);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2) + '\n');
    renameSync(`${file}.tmp`, file);
  } catch {
    // losing the guard state only means one extra continuation; Claude Code's own cap still holds
  }
}
// [SCOPE 142 / T009] END

/** The hashes already handed back this turn, after starting a fresh set on a new turn. */
// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
export function turnHashes(root, session, stopHookActive, nowMs = Date.now()) {
  const state = readTurns(root);
  for (const [k, v] of Object.entries(state)) if (!(nowMs - (v?.at ?? 0) < STATE_TTL_MS)) delete state[k];
  if (!stopHookActive || !state[session]) state[session] = { at: nowMs, hashes: [] };
  return { state, set: new Set(state[session].hashes) };
}
// [SCOPE 142 / T009] END

// ---------- the decision ----------

/** The JSON to print for one Stop call, or null to let the agent stop silently. */
// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
// MODIFIED-BY: [SCOPE 142 / T009] — an uncovered question is assumed only when nobody is there to answer it
export async function decideStop(input, { root, deps, now, budgetMs, nowMs, assume } = {}) {
// [SCOPE 142 / T009] END
  if (input?.hook_event_name && input.hook_event_name !== 'Stop' && input.hook_event_name !== 'SubagentStop') return null;
  const candidates = trailingQuestions(finalAssistantText(input));
  if (!candidates.length) return null;
  const session = input.session_id ?? 'no-session';
  const { state, set } = turnHashes(root, session, input.stop_hook_active === true, nowMs);

  const fresh = candidates.filter((c) => !set.has(questionHash(c.text)));
  if (!fresh.length) {
    // The same question again after the gate answered it this turn: let it reach the developer.
    writeTurns(root, state);
    await logUnchecked(candidates, { root, session: input.session_id ?? null, intercept: 'stop', deps }, 'asked again after the gate answered it this turn');
    return { systemMessage: 'Ask Gate: the agent asked again after the gate answered it; passed to the developer.' };
  }

  let gate;
  try {
    const mayAssume = typeof assume === 'boolean' ? assume : await nobodyToAnswer(root);
    gate = await runGate(fresh, { root, session: input.session_id ?? null, intercept: 'stop', deps, now, budgetMs, assume: mayAssume });
  } catch (e) {
    await logUnchecked(fresh, { root, session: input.session_id ?? null, intercept: 'stop', deps }, `gate error: ${e instanceof Error ? e.message : e}`);
    return { systemMessage: `Ask Gate: could not run (${e instanceof Error ? e.message : e}); the question goes to the developer unchecked.` };
  }
  if (gate.decision !== 'stop') {
    writeTurns(root, state);
    return { systemMessage: gate.status };
  }
  for (const c of fresh) state[session].hashes.push(questionHash(c.text));
  state[session].at = nowMs ?? Date.now();
  writeTurns(root, state);
  return { decision: 'block', reason: gate.reason, systemMessage: gate.status };
}

// [SCOPE 142 / T009] BEGIN — Ask Gate on plain-text questions: Stop hook, or the fallbac…
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // not a hook call; let it stop
  }
  const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
  let out = null;
  try {
    out = await decideStop(input, { root });
  } catch (e) {
    out = { systemMessage: `Ask Gate: could not run (${e instanceof Error ? e.message : e}).` };
  }
  if (out) process.stdout.write(JSON.stringify(out), () => process.exit(0));
  else process.exit(0);
}
// [SCOPE 142 / T009] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/hook-stop.mjs')) main();
