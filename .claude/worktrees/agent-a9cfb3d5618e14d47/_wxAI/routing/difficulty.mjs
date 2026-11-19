// Difficulty class for a task (SPEC-143 FR-004; contract C3). Deterministic: the same inputs always
// give the same class.
//
//   heavy     touches security, auth, money, schema, migration or production (whatever the file
//             count); more than 5 files; more than 4 acceptance criteria; or already escalated
//   moderate  2 to 5 files, or new logic with branches and tests
//   easy      everything else
//
// classify({ files, acceptanceCriteria, touches, escalated, newLogicWithTests })
//   -> { difficulty, reasons: [..] }
//   files and acceptanceCriteria are a count or a list (its length is used).
//   newLogicWithTests is optional (not in C3's signature): true when the task adds branching
//   logic that ships with tests.
// overrideDifficulty(root, taskid, difficulty, by[, { from, command, reason }])
//   the owner's override; appends an `override` event to decisions/routing-log.jsonl (C5).

import { resolve } from 'node:path';

import { appendRoutingEvent, isTier } from './tiers.mjs';

export const HEAVY_TOUCHES = Object.freeze(['security', 'auth', 'money', 'schema', 'migration', 'production']);
export const HEAVY_FILES_OVER = 5;
export const HEAVY_CRITERIA_OVER = 4;
export const MODERATE_FILES_FROM = 2;

function count(value, name) {
  if (value === undefined || value === null) return 0;
  if (Array.isArray(value)) return value.length;
  const n = Number(value);
  if (typeof value === 'boolean' || !Number.isInteger(n) || n < 0) {
    throw new TypeError(`${name} must be a whole number of 0 or more, or a list (got ${JSON.stringify(value)})`);
  }
  return n;
}

export function classify({ files, acceptanceCriteria, touches = [], escalated = false, newLogicWithTests = false } = {}) {
  const fileCount = count(files, 'files');
  const criteria = count(acceptanceCriteria, 'acceptanceCriteria');
  if (touches !== null && !Array.isArray(touches)) throw new TypeError('touches must be a list');
  const touched = [...new Set((touches ?? []).filter((t) => typeof t === 'string').map((t) => t.trim().toLowerCase()))];

  const heavy = [];
  for (const t of HEAVY_TOUCHES) if (touched.includes(t)) heavy.push(`touches ${t}`);
  if (fileCount > HEAVY_FILES_OVER) heavy.push(`${fileCount} files (more than ${HEAVY_FILES_OVER})`);
  if (criteria > HEAVY_CRITERIA_OVER) heavy.push(`${criteria} acceptance criteria (more than ${HEAVY_CRITERIA_OVER})`);
  if (escalated === true) heavy.push('already escalated');
  if (heavy.length) return { difficulty: 'heavy', reasons: heavy };

  const moderate = [];
  if (fileCount >= MODERATE_FILES_FROM) moderate.push(`${fileCount} files (${MODERATE_FILES_FROM} to ${HEAVY_FILES_OVER})`);
  if (newLogicWithTests === true) moderate.push('new logic with tests');
  if (moderate.length) return { difficulty: 'moderate', reasons: moderate };

  return { difficulty: 'easy', reasons: [`${fileCount} file${fileCount === 1 ? '' : 's'}, no heavy or moderate signal`] };
}

export function overrideDifficulty(root, taskid, difficulty, by, { from = null, command = null, reason = null } = {}) {
  if (!isTier(difficulty)) throw new TypeError(`difficulty must be easy, moderate or heavy (got ${JSON.stringify(difficulty)})`);
  if (typeof taskid !== 'string' || !taskid.trim()) throw new TypeError('taskid is required');
  if (typeof by !== 'string' || !by.trim()) throw new TypeError('by (who made the override) is required');
  if (from !== null && !isTier(from)) throw new TypeError(`from must be easy, moderate or heavy (got ${JSON.stringify(from)})`);
  const event = appendRoutingEvent(root, {
    event: 'override',
    taskid: taskid.trim(),
    command,
    from,
    to: difficulty,
    reason: reason ?? 'owner override of the difficulty class',
    evidence: `by ${by.trim()}`,
  });
  return { difficulty, event };
}

function main(argv) {
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  try {
    if (argv[0] === 'override') {
      const out = overrideDifficulty(resolve(arg('--root') ?? process.cwd()), arg('--task'), arg('--difficulty'), arg('--by'), { from: arg('--from') ?? null });
      process.stdout.write(JSON.stringify(out) + '\n');
      return;
    }
    const touches = (arg('--touches') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const out = classify({
      files: arg('--files') ?? 0,
      acceptanceCriteria: arg('--criteria') ?? 0,
      touches,
      escalated: argv.includes('--escalated'),
      newLogicWithTests: argv.includes('--new-logic-with-tests'),
    });
    process.stdout.write(JSON.stringify(out) + '\n');
  } catch (e) {
    process.stderr.write(`difficulty: ${e instanceof Error ? e.message : e}\n`);
    process.exit(2);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/routing/difficulty.mjs')) main(process.argv.slice(2));
