#!/usr/bin/env node
// Claude Code PreToolUse hook: agents never change the models: or allowedProviders: sections of
// decisions/settings.yaml (SPEC-143 FR-005, FR-007; contract C2).
//
// Edit, Write and MultiEdit on decisions/settings.yaml are simulated against the file on disk:
// the call is denied when the result would change either protected section (added, removed,
// re-indented or edited), and allowed when only other sections change (gate:, minimalCode:,
// links:, ...). Comment-only and blank-line changes inside a section are not changes.
// NotebookEdit on the file is denied (its result cannot be simulated).
// Bash: every shell write to decisions/settings.yaml (redirect, tee, sed -i, mv, cp onto it, rm,
// PowerShell write cmdlets, an inline interpreter writing it) is denied, because its effect on the
// protected sections cannot be read from the command. The message points to the Edit tool, which
// this hook checks precisely. Reads are allowed.
//
// Output: the deny JSON on stdout, or nothing ("no opinion") for every other call.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { parseRoutingSettings } from './tiers.mjs';

export const PROTECTED_SECTIONS = Object.freeze(['models', 'allowedProviders']);

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SETTINGS_RE = /decisions[\\/]settings\.ya?ml(?![\w-]|\.\w)/i;
const BARE_SETTINGS_RE = /(?:^|[\s"'=/\\])settings\.ya?ml(?![\w-]|\.\w)/i;

export const DENY_MESSAGE =
  'The models: and allowedProviders: sections of decisions/settings.yaml decide which AI models and providers ' +
  "may work on this project's code. Only the project owner changes them, by editing the file by hand; an agent " +
  'may not add, remove or edit them. Other sections (gate:, minimalCode:, links:) can still be changed with the Edit tool.';

export const DENY_BASH_MESSAGE =
  'Shell commands may not write decisions/settings.yaml: the models: and allowedProviders: sections are changed ' +
  'only by the project owner, by hand, and a shell write cannot be checked to leave them alone. To change another ' +
  'section (gate:, minimalCode:, links:), use the Edit tool on that section.';

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

export function isSettingsPath(p) {
  return typeof p === 'string' && SETTINGS_RE.test(p.replace(/\\/g, '/'));
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** The protected sections as normalized text: { models, allowedProviders }; '' when absent. */
export function protectedBlocks(text) {
  const out = Object.fromEntries(PROTECTED_SECTIONS.map((s) => [s, []]));
  let section = null;
  for (const raw of String(text ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = stripComment(raw).replace(/\s+$/, '');
    if (!line.trim()) continue;
    const top = /^(["']?)([^\s"'#:-][^"':]*)\1\s*:/.exec(line);
    if (top && !/^\s/.test(line)) section = top[2].trim();
    if (section && PROTECTED_SECTIONS.includes(section)) out[section].push(line);
  }
  return Object.fromEntries(PROTECTED_SECTIONS.map((s) => [s, out[s].join('\n')]));
}

/** True when going from `before` to `after` changes a protected section. */
export function changesProtected(before, after) {
  const a = protectedBlocks(before);
  const b = protectedBlocks(after);
  if (PROTECTED_SECTIONS.some((s) => a[s] !== b[s])) return true;
  const pa = parseRoutingSettings(before);
  const pb = parseRoutingSettings(after);
  return JSON.stringify([pa.models, pa.allowedProviders]) !== JSON.stringify([pb.models, pb.allowedProviders]);
}

function replaceText(text, oldStr, newStr, all) {
  if (oldStr === '') return text === '' ? newStr : null;
  if (!text.includes(oldStr)) return null;
  if (all) return text.split(oldStr).join(newStr);
  const at = text.indexOf(oldStr);
  return text.slice(0, at) + newStr + text.slice(at + oldStr.length);
}

const mentionsProtected = (s) => /\b(models|allowedProviders)\b/.test(String(s ?? ''));

/** Apply one edit; when it cannot be placed, fall back to a conservative text check. */
function applyEdit(text, edit) {
  const oldStr = String(edit.old_string ?? '');
  const newStr = String(edit.new_string ?? '');
  let next = replaceText(text, oldStr, newStr, edit.replace_all === true);
  if (next === null && text.includes('\r\n')) next = replaceText(text.replace(/\r\n/g, '\n'), oldStr.replace(/\r\n/g, '\n'), newStr.replace(/\r\n/g, '\n'), edit.replace_all === true);
  if (next !== null) return { text: next, unsure: false };
  const blocks = Object.values(protectedBlocks(text)).join('\n');
  const oldLines = oldStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const touchesBlock = oldLines.some((l) => blocks.includes(stripComment(l).trim()) && stripComment(l).trim());
  return { text, unsure: touchesBlock || mentionsProtected(oldStr) || mentionsProtected(newStr) };
}

function readCurrent(filePath, cwd) {
  const full = isAbsolute(filePath) ? filePath : resolve(cwd ?? process.cwd(), filePath);
  try {
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  } catch {
    return null;
  }
}

/** Decide an Edit / Write / MultiEdit / NotebookEdit call on the settings file. */
export function editChangesProtected(tool, ti, cwd, currentText) {
  if (tool === 'NotebookEdit') return true;
  const before = currentText !== undefined ? currentText : readCurrent(ti.file_path, cwd);
  if (before === null) return true; // cannot read the file: do not let the change through unchecked
  if (tool === 'Write') return changesProtected(before, String(ti.content ?? ''));
  const edits = tool === 'MultiEdit' ? (Array.isArray(ti.edits) ? ti.edits : []) : [ti];
  let text = before;
  for (const e of edits) {
    const r = applyEdit(text, e ?? {});
    if (r.unsure) return true;
    text = r.text;
  }
  return changesProtected(before, text);
}

function segments(command) {
  return command.split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
}

/** True when a Bash command would write, replace, move or delete decisions/settings.yaml. */
export function bashWritesSettings(command) {
  const cmd = String(command ?? '');
  const named = SETTINGS_RE.test(cmd) || (BARE_SETTINGS_RE.test(cmd) && /\bdecisions\b/i.test(cmd));
  if (!named) return false;
  const target = (w) => SETTINGS_RE.test(w) || /^["']?settings\.ya?ml["']?$/i.test(w);
  if (/(?:^|[^<>=\-])\d*&?>>?\s*["']?(?:[^\s;|&"']*[\\/])?(?:decisions[\\/])?settings\.ya?ml(?![\w-]|\.\w)/i.test(cmd)) return true;
  for (const seg of segments(cmd)) {
    if (!SETTINGS_RE.test(seg) && !BARE_SETTINGS_RE.test(seg)) continue;
    const words = seg.split(/\s+/).map((w) => w.replace(/^["'`]|["'`]$/g, ''));
    const head = (words[0] ?? '').replace(/^.*[\\/]/, '').toLowerCase();
    const last = words[words.length - 1] ?? '';
    if (head === 'tee') return true;
    if (head === 'sed' && words.some((w) => /^-[A-Za-z]*i|^--in-place/.test(w))) return true;
    if ((head === 'perl' || head === 'ruby') && words.some((w) => /^-[A-Za-z]*i/.test(w))) return true;
    if (['mv', 'rm', 'del', 'truncate', 'shred', 'unlink'].includes(head)) return true;
    if (head === 'git' && words.some((w) => /^(checkout|restore|apply|mv|rm)$/.test(w))) return true;
    if ((head === 'cp' || head === 'install' || head === 'ln') && target(last)) return true;
    if (head === 'dd' && words.some((w) => /^of=/.test(w) && target(w.slice(3)))) return true;
    if (/^(set-content|add-content|out-file|clear-content|remove-item|move-item|copy-item|new-item|rename-item)$/i.test(head)) return true;
    if (words.some((w) => /^(set-content|add-content|out-file|clear-content|remove-item|move-item|rename-item)$/i.test(w))) return true;
    if (/\b(?:node|python3?|ruby|perl|deno|bun)\b.*\b(?:writeFile|appendFile|createWriteStream|open\s*\(|write_text|File\.write|rename|unlink|rm)/i.test(seg)) return true;
  }
  return false;
}

/** Decide one hook call. Returns the deny JSON, or null for "no opinion". */
export function decideSettingsGuard(input, { currentText } = {}) {
  if (input?.hook_event_name && input.hook_event_name !== 'PreToolUse') return null;
  const tool = input?.tool_name;
  const ti = input?.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    if (!isSettingsPath(ti.file_path) && !isSettingsPath(ti.notebook_path)) return null;
    return editChangesProtected(tool, ti, input?.cwd, currentText) ? deny(DENY_MESSAGE) : null;
  }
  if (tool === 'Bash') return bashWritesSettings(ti.command ?? '') ? deny(DENY_BASH_MESSAGE) : null;
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // not a hook call; no opinion
  }
  const out = decideSettingsGuard(input);
  if (out) process.stdout.write(JSON.stringify(out));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/hook-settings-guard.mjs')) main();
