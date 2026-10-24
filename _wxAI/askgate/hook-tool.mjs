#!/usr/bin/env node
// Claude Code PreToolUse hook on AskUserQuestion: the Ask Gate's question-tool intercept (SPEC-142 FR-005).
//
// Reads the hook JSON on stdin, takes the question text(s) from tool_input.questions, and runs the
// gate (gate.mjs). It runs in every permission mode, bypass included: a hook deny holds where a
// permission prompt would not (memory: canUseTool is shadowed by bypass).
//
//   enforce, answered               -> deny; the reason carries the decision text + ID
//   enforce, assumption, unattended -> deny; the instruction to choose the default and continue
//   blocker, a person present for an
//   uncovered question, or observe  -> no decision: the question reaches the developer as usual
//   always                          -> systemMessage: "Ask Gate: memory service up|down (file fallback)"
//
// The hook never answers "allow", and it only ever looks at AskUserQuestion, so on any other tool
// it has no opinion; the SCOPE-137 impact hook's decisions are untouched (FR-012).
// Any failure lets the question through and says so: a broken gate must never hide a question.

import { resolve } from 'node:path';
import { logUnchecked, nobodyToAnswer, runGate } from './gate.mjs';

export const TOOL_NAME = 'AskUserQuestion';

/** [{ text, options }] from an AskUserQuestion tool_input; tolerant of older single-question shapes. */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
export function questionsFrom(toolInput) {
  const qs = Array.isArray(toolInput?.questions) ? toolInput.questions : toolInput?.question ? [toolInput] : [];
  return qs.map((q) => ({
    text: typeof q === 'string' ? q : typeof q?.question === 'string' ? q.question : '',
    options: Array.isArray(q?.options) ? q.options : [],
  }));
}
// [SCOPE 142 / T008] END

const deny = (reason, systemMessage) => ({
  systemMessage,
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

/** The JSON to print for one hook call, or null for "no opinion". `deps` lets tests replace modules. */
// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
// MODIFIED-BY: [SCOPE 142 / T009] — an uncovered question is assumed only when nobody is there to answer it
export async function decideAskCall(input, { root, deps, now, budgetMs, assume } = {}) {
// [SCOPE 142 / T008] END
  if (input?.hook_event_name !== 'PreToolUse' || input.tool_name !== TOOL_NAME) return null;
  const mayAssume = typeof assume === 'boolean' ? assume : await nobodyToAnswer(root);
  const gate = await runGate(questionsFrom(input.tool_input), {
    root, session: input.session_id ?? null, intercept: 'tool', deps, now, budgetMs, assume: mayAssume,
  });
  if (gate.decision === 'stop') return deny(gate.reason, gate.status);
  const out = { systemMessage: gate.status };
  if (gate.note) out.hookSpecificOutput = { hookEventName: 'PreToolUse', additionalContext: gate.note };
  return out;
}

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // not a hook call; no opinion
  }
  const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
  let out;
  try {
    out = await decideAskCall(input, { root });
  } catch (e) {
    await logUnchecked(questionsFrom(input.tool_input), { root, session: input.session_id ?? null, intercept: 'tool' }, `gate error: ${e instanceof Error ? e.message : e}`);
    out = { systemMessage: `Ask Gate: could not run (${e instanceof Error ? e.message : e}); the question goes to the developer unchecked.` };
  }
  if (out) process.stdout.write(JSON.stringify(out), () => process.exit(0));
  else process.exit(0);
}
// [SCOPE 142 / T008] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/hook-tool.mjs')) main();
