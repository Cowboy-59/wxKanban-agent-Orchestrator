// Model tier table (SPEC-143 FR-005, FR-006; contract C2).
//
// Kit default: _wxAI/routing/tiers.default.json  { tiers: {easy, moderate, heavy}, commands: {<command>: tier} }
// Project override: decisions/settings.yaml (project-owned, agents may not write these sections)
//
//   models:
//     tiers:                 # missing keys fall back to the kit default
//       easy: claude-haiku-5-5
//     commands:              # per-command override of the command's declared tier
//       dbpush: easy
//
// Anthropic only (FR-007, Amendment A): a project tier must name a Claude model (claude-...).
// Any other model id is refused: the tier falls back to the kit's Claude model for that class
// and a `refusal` event is logged. There is no allowedProviders setting.
//
// resolveTier({ difficulty, command, root, log }) -> { model, tier, source: 'project' | 'kit' }
//   tier: an explicit difficulty wins; otherwise the project's commands entry, then the kit's,
//   then 'moderate' for a command nobody declared. source is 'project' when the project settings
//   chose the tier or the model, 'kit' otherwise. log: false skips the refusal event.
// escalate(tier) -> the next tier up; heavy stays heavy.
// shouldEscalate(failedTestCycles) -> true once a task has failed its tests twice.
//
// The settings file is parsed with a small YAML subset reader (block maps, block lists, flow
// [lists] and {maps}, quoted scalars, comments). A file that will not parse falls back to the kit
// default for models, the safe side.
//
// Nothing here writes decisions/settings.yaml. The only write is appendRoutingEvent, an append to
// decisions/routing-log.jsonl in the C5 shape through log.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logEvent } from './log.mjs';

export const TIERS = Object.freeze(['easy', 'moderate', 'heavy']);
export const UNDECLARED_COMMAND_TIER = 'moderate';
export const ESCALATE_AFTER_FAILED_CYCLES = 2;
export const ROUTING_EVENTS = Object.freeze(['model-choice', 'escalation', 'refusal', 'comparison', 'proposal', 'approval', 'override']);

const MODEL_ID_RE = /^[A-Za-z0-9][\w.:/-]*$/;
const CLAUDE_MODEL_RE = /^claude-[a-z0-9][a-z0-9.-]*$/i;

/** True for a Claude model id (claude-...), the only kind a tier may name (FR-007). */
export const isClaudeModel = (m) => typeof m === 'string' && CLAUDE_MODEL_RE.test(m.trim());
const KIT_DEFAULT_FILE = fileURLToPath(new URL('./tiers.default.json', import.meta.url));

export const isTier = (t) => typeof t === 'string' && TIERS.includes(t);

export function settingsFile(root) {
  return join(resolve(root ?? process.cwd()), 'decisions', 'settings.yaml');
}

export function routingLogFile(root) {
  return join(resolve(root ?? process.cwd()), 'decisions', 'routing-log.jsonl');
}

/** The kit default tier table, validated. Throws when the kit file itself is broken. */
export function kitDefaults() {
  const raw = JSON.parse(readFileSync(KIT_DEFAULT_FILE, 'utf8'));
  for (const t of TIERS) {
    if (!isClaudeModel(raw?.tiers?.[t])) {
      throw new Error(`${KIT_DEFAULT_FILE}: tiers.${t} is missing or not a Claude model id`);
    }
  }
  const commands = {};
  for (const [name, tier] of Object.entries(raw.commands ?? {})) {
    if (!isTier(tier)) throw new Error(`${KIT_DEFAULT_FILE}: commands.${name} is "${tier}", not easy, moderate or heavy`);
    commands[name] = tier;
  }
  return { tiers: { easy: raw.tiers.easy, moderate: raw.tiers.moderate, heavy: raw.tiers.heavy }, commands };
}

// ---------------------------------------------------------------------------------------------
// YAML subset reader

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquote(s) {
  const v = s.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) return v.slice(1, -1);
  return v;
}

function splitFlow(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const c of body) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (depth !== 0 || quote) throw new Error('unbalanced flow collection');
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p, i, all) => p || i < all.length - 1);
}

const KEY_RE = /^("[^"]*"|'[^']*'|[^\s"'#][^]*?)\s*:(?:\s+(.*)|\s*$)/;

function parseInline(raw) {
  const v = raw.trim();
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new Error(`bad flow list: ${v}`);
    return splitFlow(v.slice(1, -1)).map(parseInline);
  }
  if (v.startsWith('{')) {
    if (!v.endsWith('}')) throw new Error(`bad flow map: ${v}`);
    const out = {};
    for (const part of splitFlow(v.slice(1, -1))) {
      const m = KEY_RE.exec(part);
      if (!m) throw new Error(`bad flow map entry: ${part}`);
      out[unquote(m[1])] = m[2] === undefined ? null : parseInline(m[2]);
    }
    return out;
  }
  if (v === '' || v === '~' || v === 'null') return null;
  return unquote(v);
}

function parseBlock(lines, start, indent) {
  const first = lines[start];
  if (/^-(\s|$)/.test(first.text)) {
    const list = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent && /^-(\s|$)/.test(lines[i].text)) {
      const rest = lines[i].text.slice(1).trimStart();
      if (!rest) {
        if (i + 1 < lines.length && lines[i + 1].indent > indent) {
          const [val, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
          list.push(val);
          i = next;
        } else {
          list.push(null);
          i++;
        }
      } else if (KEY_RE.test(rest) && !/^[[{"']/.test(rest)) {
        const inner = indent + (lines[i].text.length - rest.length);
        const copy = lines.slice();
        copy[i] = { indent: inner, text: rest };
        const [val, next] = parseBlock(copy, i, inner);
        list.push(val);
        i = next;
      } else {
        list.push(parseInline(rest));
        i++;
      }
    }
    return [list, i];
  }
  const map = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const m = KEY_RE.exec(lines[i].text);
    if (!m || /^-(\s|$)/.test(lines[i].text)) throw new Error(`cannot read line: ${lines[i].text}`);
    const key = unquote(m[1]);
    if (m[2] !== undefined && m[2].trim() !== '') {
      map[key] = parseInline(m[2]);
      i++;
    } else if (i + 1 < lines.length && lines[i + 1].indent > indent) {
      const [val, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
      map[key] = val;
      i = next;
    } else if (i + 1 < lines.length && lines[i + 1].indent === indent && /^-(\s|$)/.test(lines[i + 1].text)) {
      const [val, next] = parseBlock(lines, i + 1, indent);
      map[key] = val;
      i = next;
    } else {
      map[key] = null;
      i++;
    }
  }
  if (i < lines.length && lines[i].indent > indent) throw new Error(`unexpected indent: ${lines[i].text}`);
  return [map, i];
}

/** Parse the YAML subset into plain values. Throws on text it cannot read. */
export function parseYamlSubset(text) {
  const lines = [];
  for (const rawLine of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    if (/\t/.test(rawLine.match(/^\s*/)[0])) throw new Error('tab indentation');
    const line = stripComment(rawLine).replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^(---|\.\.\.)$/.test(line.trim())) continue;
    lines.push({ indent: line.length - line.trimStart().length, text: line.trim() });
  }
  if (!lines.length) return {};
  if (lines[0].indent !== 0) throw new Error('document does not start at column 0');
  const [doc, end] = parseBlock(lines, 0, 0);
  if (end !== lines.length || Array.isArray(doc)) throw new Error('settings must be one top-level map');
  return doc;
}

// ---------------------------------------------------------------------------------------------
// Routing settings

function normalizeModels(raw) {
  const out = { tiers: {}, commands: {}, refused: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.tiers && typeof raw.tiers === 'object' && !Array.isArray(raw.tiers)) {
    for (const t of TIERS) {
      const m = raw.tiers[t];
      if (typeof m !== 'string' || !MODEL_ID_RE.test(m.trim())) continue;
      if (isClaudeModel(m)) out.tiers[t] = m.trim();
      else out.refused[t] = m.trim();
    }
  }
  if (raw.commands && typeof raw.commands === 'object' && !Array.isArray(raw.commands)) {
    for (const [name, tier] of Object.entries(raw.commands)) {
      if (isTier(tier)) out.commands[name] = tier;
    }
  }
  return out;
}

const emptyModels = () => ({ tiers: {}, commands: {}, refused: {} });

/** Routing settings from settings text: { models: {tiers, commands, refused}, readable }. */
export function parseRoutingSettings(text) {
  let doc;
  try {
    doc = parseYamlSubset(text);
  } catch {
    return { models: emptyModels(), readable: false };
  }
  return { models: normalizeModels(doc.models), readable: true };
}

/** The project's routing settings; a missing file is an empty override. */
export function readRoutingSettings(root) {
  const file = settingsFile(root);
  if (!existsSync(file)) return { models: emptyModels(), readable: true, present: false };
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { models: emptyModels(), readable: false, present: true };
  }
  return { ...parseRoutingSettings(text), present: true };
}

function lookupCommand(map, command) {
  if (!command) return undefined;
  const want = String(command).trim().replace(/^\//, '').toLowerCase();
  for (const [name, tier] of Object.entries(map)) {
    if (name.replace(/^\//, '').toLowerCase() === want) return tier;
  }
  return undefined;
}

export function resolveTier({ difficulty, command, root, log = true } = {}) {
  if (difficulty !== undefined && difficulty !== null && !isTier(difficulty)) {
    throw new TypeError(`difficulty must be easy, moderate or heavy (got ${JSON.stringify(difficulty)})`);
  }
  if (!difficulty && !command) throw new TypeError('resolveTier needs a difficulty or a command');
  const kit = kitDefaults();
  const project = readRoutingSettings(root).models;
  let tier = difficulty;
  let tierFromProject = false;
  if (!tier) {
    const fromProject = lookupCommand(project.commands, command);
    if (fromProject) {
      tier = fromProject;
      tierFromProject = true;
    } else {
      tier = lookupCommand(kit.commands, command) ?? UNDECLARED_COMMAND_TIER;
    }
  }
  const projectModel = project.tiers[tier];
  if (log && project.refused[tier]) {
    appendRoutingEvent(root, {
      event: 'refusal',
      taskid: null,
      command: command ?? null,
      from: project.refused[tier],
      to: kit.tiers[tier],
      reason: `models.tiers.${tier} names ${project.refused[tier]}, which is not a Claude model; the kit's Claude model is used`,
      evidence: 'Anthropic only: a Claude model on the official Claude client (FR-007, Amendment A)',
    });
  }
  return {
    model: projectModel ?? kit.tiers[tier],
    tier,
    source: projectModel || tierFromProject ? 'project' : 'kit',
  };
}

export function escalate(tier) {
  if (!isTier(tier)) throw new TypeError(`tier must be easy, moderate or heavy (got ${JSON.stringify(tier)})`);
  return TIERS[Math.min(TIERS.indexOf(tier) + 1, TIERS.length - 1)];
}

export function shouldEscalate(failedTestCycles) {
  const n = Number(failedTestCycles);
  if (!Number.isInteger(n) || n < 0) throw new TypeError(`failedTestCycles must be a whole number of 0 or more (got ${JSON.stringify(failedTestCycles)})`);
  return n >= ESCALATE_AFTER_FAILED_CYCLES;
}

/**
 * One escalation decision for a task. When the task has failed its tests twice it moves one tier
 * up and an `escalation` event is logged (C5). The caller resets its failed-cycle count after an
 * escalation and records escalated = true on the run (C1).
 * Returns { tier, model, escalated, from }.
 */
export function escalateTask({ root, taskid = null, command = null, tier, failedTestCycles, log = true } = {}) {
  if (!isTier(tier)) throw new TypeError(`tier must be easy, moderate or heavy (got ${JSON.stringify(tier)})`);
  if (!shouldEscalate(failedTestCycles)) {
    return { tier, model: resolveTier({ difficulty: tier, root }).model, escalated: false, from: tier };
  }
  const next = escalate(tier);
  const fromModel = resolveTier({ difficulty: tier, root }).model;
  const toModel = resolveTier({ difficulty: next, root }).model;
  if (log) {
    appendRoutingEvent(root, {
      event: 'escalation',
      taskid,
      command,
      from: `${tier} (${fromModel})`,
      to: `${next} (${toModel})`,
      reason: next === tier ? `failed tests ${failedTestCycles} times; already heavy, stays heavy` : `failed tests ${failedTestCycles} times`,
      evidence: `failedTestCycles=${failedTestCycles}`,
    });
  }
  return { tier: next, model: toModel, escalated: true, from: tier };
}

/**
 * Append one audit event to decisions/routing-log.jsonl in the C5 shape, through log.mjs
 * (logEvent). Values are sent as strings or null so the line never carries an object.
 */
export function appendRoutingEvent(root, event) {
  if (!ROUTING_EVENTS.includes(event?.event)) throw new TypeError(`event must be one of ${ROUTING_EVENTS.join(', ')}`);
  const str = (v) => (v === undefined || v === null ? null : String(v));
  return logEvent(resolve(root ?? process.cwd()), {
    time: event.time,
    event: event.event,
    taskid: str(event.taskid),
    command: str(event.command),
    from: str(event.from),
    to: str(event.to),
    reason: str(event.reason),
    evidence: str(event.evidence),
  });
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const d = argv.indexOf('--difficulty');
  const c = argv.indexOf('--command');
  try {
    const out = resolveTier({ root, difficulty: d >= 0 ? argv[d + 1] : undefined, command: c >= 0 ? argv[c + 1] : undefined });
    process.stdout.write(JSON.stringify(out) + '\n');
  } catch (e) {
    process.stderr.write(`tiers: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/tiers.mjs')) main(process.argv.slice(2));
