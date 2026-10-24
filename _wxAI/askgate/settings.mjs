// Decision Memory settings (SPEC-142, contract C3): decisions/settings.yaml, project-owned.
//
//   gate:
//     mode: observe          # observe (default) | enforce
//     matchThreshold: 0.75   # 0..1
//   minimalCode:
//     level: on              # on (default) | lite | off
//   links: []                # repo roots whose ledgers this repo may read
//
// readSettings(root) returns these defaults when the file is missing or a value is invalid.
// A small restricted YAML subset: two nested sections, scalars, and a list for `links`.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DEFAULT_SETTINGS = Object.freeze({
  gate: Object.freeze({ mode: 'observe', matchThreshold: 0.75 }),
  minimalCode: Object.freeze({ level: 'on' }),
  links: Object.freeze([]),
});

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function settingsPath(root) {
  return join(resolve(root ?? process.cwd()), 'decisions', 'settings.yaml');
}
// [SCOPE 142 / T006] END

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function scalar(raw) {
  let v = raw.replace(/\s+#.*$/, '').trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) v = v.slice(1, -1);
  return v;
}
// [SCOPE 142 / T006] END

/** Parse settings text into a plain object (no validation). */
// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function parseSettingsText(text) {
  const out = {};
  let section = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([A-Za-z]+):(?:\s+(.*))?$/.exec(line);
    if (top) {
      section = top[1];
      const rest = top[2] === undefined ? '' : scalar(top[2]);
      if (rest === '[]') out[section] = [];
      else if (rest) out[section] = rest;
      else out[section] = section === 'links' ? [] : {};
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && section && Array.isArray(out[section])) {
      out[section].push(scalar(item[1]));
      continue;
    }
    const kv = /^\s+([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv && section && out[section] && typeof out[section] === 'object' && !Array.isArray(out[section])) {
      out[section][kv[1]] = scalar(kv[2]);
    }
  }
  return out;
}
// [SCOPE 142 / T006] END

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
export function readSettings(root) {
  const settings = { gate: { ...DEFAULT_SETTINGS.gate }, minimalCode: { ...DEFAULT_SETTINGS.minimalCode }, links: [] };
  const file = settingsPath(root);
  if (!existsSync(file)) return settings;
  let raw;
  try {
    raw = parseSettingsText(readFileSync(file, 'utf8'));
  } catch {
    return settings;
  }
  const mode = raw.gate?.mode;
  if (mode === 'observe' || mode === 'enforce') settings.gate.mode = mode;
  const th = Number(raw.gate?.matchThreshold);
  if (raw.gate?.matchThreshold !== undefined && Number.isFinite(th) && th >= 0 && th <= 1) settings.gate.matchThreshold = th;
  const level = raw.minimalCode?.level;
  if (level === 'on' || level === 'lite' || level === 'off') settings.minimalCode.level = level;
  if (Array.isArray(raw.links)) settings.links = raw.links.filter((l) => typeof l === 'string' && l.trim());
  return settings;
}
// [SCOPE 142 / T006] END
