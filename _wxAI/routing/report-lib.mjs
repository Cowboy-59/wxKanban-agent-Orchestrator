// Shared helpers for the cost report, proposals and comparison (SPEC-143 C1, C4).
// Plain Node ESM, no dependencies.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUN_LOG_REL = join('decisions', 'agentrun-log.jsonl');
const HERE = dirname(fileURLToPath(import.meta.url));

export function readRunLog(root) {
  const p = join(root, RUN_LOG_REL);
  if (!existsSync(p)) return [];
  const out = [];
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    try {
      const r = JSON.parse(raw);
      if (r && typeof r === 'object') out.push(r);
    } catch {
      /* a torn line is skipped */
    }
  }
  return out;
}

export function loadPrices(path = join(HERE, 'prices.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Price equivalent in USD for one record, or null when the model has no price or no token is known.
export function costOf(rec, prices) {
  const price = prices && prices.models ? prices.models[rec.model] : undefined;
  if (!price) return null;
  const i = num(rec.inputtokens);
  const o = num(rec.outputtokens);
  const c = num(rec.cachereadtokens);
  const w = num(rec.cachewritetokens);
  if (i === null && o === null && c === null && w === null) return null;
  return ((i ?? 0) * price.input + (o ?? 0) * price.output + (c ?? 0) * price.cacheRead + (w ?? 0) * (price.cacheWrite ?? 0)) / 1e6;
}

export const n0 = (v) => num(v) ?? 0;
