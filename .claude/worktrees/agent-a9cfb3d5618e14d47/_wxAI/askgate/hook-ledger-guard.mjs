#!/usr/bin/env node
// Claude Code PreToolUse hook: agents never write decisions/ledger.yaml (SPEC-142 FR-002).
//
// Denies Edit, Write, MultiEdit and NotebookEdit aimed at a decisions/ledger.yaml, and Bash commands
// that redirect into it, tee/sed -i/mv/cp/rm/truncate it, or use PowerShell write cmdlets on it.
// A hook deny holds in every permission mode, bypass included. The ledger script's own writes
// happen inside node (not through a tool call), and `node _wxAI/askgate/ledger.mjs append ...` does
// not match any write pattern, so it is allowed. Reads (cat, grep, check) are allowed.
//
// Output: the deny JSON on stdout, or nothing ("no opinion") for every other call.

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// The ledger, and the owner's review list of KAIN's answers (Amendment A): both owner-path only.
const LEDGER_RE = /decisions[\\/](?:ledger|kain-replies)\.yaml(?![\w-]|\.\w)/i;

export const DENY_MESSAGE =
  'decisions/ledger.yaml is append-only and is written only by the ledger script, never directly by an agent. ' +
  'Entries are added with: node _wxAI/askgate/ledger.mjs append --file <entry.json> --approved-by <who>, ' +
  'and only for a decision the owner approved. Do not edit, overwrite, move or delete the ledger.';

export const DENY_REPLIES_MESSAGE =
  "decisions/kain-replies.yaml is the owner's review list of KAIN's answers. Only the bridge (a KAIN answer in the room) and the owner's review " +
  '(node _wxAI/askgate/kain.mjs review <KR-id> approve|change|reject) write it. Do not edit, overwrite, move or delete it.';

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const messageFor = (text) => (/kain-replies\.yaml/i.test(String(text ?? '')) && !/ledger\.yaml/i.test(String(text ?? '')) ? DENY_REPLIES_MESSAGE : DENY_MESSAGE);

// [SCOPE 142 / T003] BEGIN — Deny direct agent writes to decisions/ledger.yaml (FR-002)
export function isLedgerPath(p) {
  return typeof p === 'string' && LEDGER_RE.test(p.replace(/\\/g, '/').replace(/\//g, '/'));
}
// [SCOPE 142 / T003] END

// [SCOPE 142 / T003] BEGIN — Deny direct agent writes to decisions/ledger.yaml (FR-002)
function segments(command) {
  return command.split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
}
// [SCOPE 142 / T003] END

/** A path word naming the decisions folder itself, or a glob inside it ("decisions", "./decisions/", "decisions/*"). */
const DIR_WORD_RE = /^(?:.*[\\/])?decisions(?:[\\/](?:\*.*)?)?$/i;
const REMOVERS = new Set(['rm', 'rmdir', 'mv', 'del', 'rd', 'erase', 'remove-item', 'move-item', 'rename-item', 'ri', 'mi']);

/** True when a Bash command would delete or move the whole decisions folder (found live: rm -rf decisions). */
// [SCOPE 142 / T003] BEGIN — Deny direct agent writes to decisions/ledger.yaml (FR-002)
export function bashRemovesDecisionsDir(command) {
  for (const seg of segments(String(command))) {
    const words = seg.split(/\s+/).map((w) => w.replace(/^["'`]|["'`]$/g, ''));
    let head = (words[0] ?? '').replace(/^.*[\\/]/, '').toLowerCase();
    let args = words.slice(1);
    if (head === 'git' && /^(rm|mv|clean)$/i.test(args[0] ?? '')) {
      head = 'rm';
      args = args.slice(1);
    }
    if (REMOVERS.has(head) && args.some((a) => DIR_WORD_RE.test(a))) return true;
  }
  return false;
}
// [SCOPE 142 / T003] END

/** True when a Bash command would write, replace, move or delete the ledger. */
// [SCOPE 142 / T003] BEGIN — Deny direct agent writes to decisions/ledger.yaml (FR-002)
// MODIFIED-BY: [SCOPE 142 / T003] — removing or moving the whole decisions folder counts too
export function bashWritesLedger(command) {
  if (bashRemovesDecisionsDir(command)) return true;
  if (!LEDGER_RE.test(String(command))) return false;
  // 1. a redirect whose target is the ledger:  > file, >> file, 1>file, &> file
  if (/(?:^|[^<>=\-])\d*&?>>?\s*["']?(?:[^\s;|&"']*[\\/])?decisions[\\/](?:ledger|kain-replies)\.yaml(?![\w-]|\.\w)/i.test(command)) return true;
  for (const seg of segments(command)) {
    if (!LEDGER_RE.test(seg)) continue;
    const words = seg.split(/\s+/).map((w) => w.replace(/^["'`]|["'`]$/g, ''));
    const head = (words[0] ?? '').replace(/^.*[\\/]/, '').toLowerCase();
    const last = words[words.length - 1] ?? '';
    if (head === 'tee') return true;
    if (head === 'sed' && words.some((w) => /^-[A-Za-z]*i|^--in-place/.test(w))) return true;
    if ((head === 'perl' || head === 'ruby') && words.some((w) => /^-[A-Za-z]*i/.test(w))) return true;
    if (head === 'mv' || head === 'rm' || head === 'del' || head === 'truncate' || head === 'shred' || head === 'unlink') return true;
    if (head === 'cp' && isLedgerPath(last)) return true;
    if (head === 'dd' && words.some((w) => /^of=/.test(w) && isLedgerPath(w))) return true;
    if (/^(set-content|add-content|out-file|clear-content|remove-item|move-item|copy-item|new-item|rename-item)$/i.test(head)) return true;
    if (words.some((w) => /^(set-content|add-content|out-file|clear-content|remove-item)$/i.test(w))) return true;
    // an inline interpreter writing to it
    if (/\b(?:node|python3?|ruby|perl)\b.*\b(?:writeFile|appendFile|open\s*\(|write_text|File\.write)/i.test(seg) && !/_wxAI[\\/]askgate[\\/]ledger\.mjs/i.test(seg)) return true;
  }
  return false;
}
// [SCOPE 142 / T003] END

/** Decide one hook call. Returns the deny JSON, or null for "no opinion". */
// [SCOPE 142 / T003] BEGIN — Deny direct agent writes to decisions/ledger.yaml (FR-002)
export function decideLedgerGuard(input) {
  if (input?.hook_event_name && input.hook_event_name !== 'PreToolUse') return null;
  const tool = input?.tool_name;
  const ti = input?.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    if (isLedgerPath(ti.file_path) || isLedgerPath(ti.notebook_path)) return deny(messageFor(ti.file_path ?? ti.notebook_path));
    return null;
  }
  if (tool === 'Bash') return bashWritesLedger(ti.command ?? '') ? deny(messageFor(ti.command)) : null;
  return null;
}
// [SCOPE 142 / T003] END

// [SCOPE 142 / T003] BEGIN — Deny direct agent writes to decisions/ledger.yaml (FR-002)
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // not a hook call; no opinion
  }
  const out = decideLedgerGuard(input);
  if (out) process.stdout.write(JSON.stringify(out));
}
// [SCOPE 142 / T003] END

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/askgate/hook-ledger-guard.mjs')) main();

