#!/usr/bin/env node
/**
 * tools/validate-spec-status.mjs
 *
 * Pre-commit validation: warns when spec.status in DB is stale relative to
 * artifact presence or task completion. Non-blocking (exits 0).
 *
 * Usage:
 *   node tools/validate-spec-status.mjs
 *
 * Add to package.json: "validate-specs": "node tools/validate-spec-status.mjs"
 * Call from pre-commit hook for soft validation.
 */

import pg from 'pg';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function getDbUrl() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  const env = readFileSync(envPath, 'utf8');
  const line = env.split('\n').find(l => l.startsWith('DATABASE_URL='));
  if (!line) return null;
  let url = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  url = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  return url;
}

// Status progression order (higher index = further along)
const STATUS_ORDER = [
  'draft', 'in_review', 'pending_clarification', 'clarified', 'planned',
  'tasks_generated', 'implementing', 'implemented',
  'qa_passed', 'human_tested', 'beta_cleared', 'released',
];

function statusRank(s) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

function deriveMinimumStatus(specDir, taskCount, completedCount) {
  const hasFile = (...parts) => existsSync(join(specDir, ...parts));
  if (taskCount > 0) {
    if (completedCount === taskCount) return 'implemented';
    if (completedCount > 0) return 'implementing';
    return 'tasks_generated';
  }
  if (hasFile('plan.md')) return 'planned';
  if (hasFile('checklists') && readdirSync(join(specDir, 'checklists')).length > 0) return 'clarified';
  return 'draft';
}

function findSpecDir(specnumber) {
  const specsDir = join(ROOT, 'specs');
  const dirs = readdirSync(specsDir).filter(d =>
    statSync(join(specsDir, d)).isDirectory() && /^\d+-.+/.test(d)
  );
  const padded = String(specnumber).padStart(3, '0');
  const match = dirs.find(d => d.startsWith(padded));
  return match ? join(specsDir, match) : null;
}

async function main() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    console.log('validate-specs: .env or DATABASE_URL not found, skipping');
    process.exit(0);
  }

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  let specs;
  try {
    const res = await pool.query(`
      SELECT s.id, s.specnumber, s.title, s.status,
             COUNT(t.id)::int as task_count,
             COUNT(t.id) FILTER (WHERE t.status='completed')::int as completed_count
      FROM specifications s
      LEFT JOIN tasks t ON t.specid = s.id
      GROUP BY s.id ORDER BY s.specnumber
    `);
    specs = res.rows;
  } catch (err) {
    console.log(`validate-specs: DB query failed (${err.message}), skipping`);
    await pool.end();
    process.exit(0);
  }

  const warnings = [];

  for (const spec of specs) {
    if (spec.status === 'deferred') continue;

    const specDir = findSpecDir(spec.specnumber);
    if (!specDir) continue;

    const minStatus = deriveMinimumStatus(specDir, spec.task_count, spec.completed_count);

    if (statusRank(spec.status) < statusRank(minStatus)) {
      warnings.push({
        spec: spec.specnumber,
        title: spec.title,
        current: spec.status,
        expected: minStatus,
        tasks: `${spec.completed_count}/${spec.task_count}`,
      });
    }
  }

  await pool.end();

  if (!warnings.length) {
    console.log('✓ validate-specs: all spec statuses consistent');
    process.exit(0);
  }

  console.log(`\n⚠  validate-specs: ${warnings.length} spec(s) have stale lifecycle status\n`);
  console.log('  Spec  │ Current status      │ Should be ≥          │ Tasks');
  console.log('  ──────┼─────────────────────┼──────────────────────┼──────────');
  for (const w of warnings) {
    const spec    = w.spec.padEnd(5);
    const current = w.current.padEnd(19);
    const expected = w.expected.padEnd(20);
    console.log(`  ${spec} │ ${current} │ ${expected} │ ${w.tasks}`);
  }
  console.log('\n  Run: node tools/sync-spec-status.mjs  to fix\n');

  // Exit 0 — warning only, does not block commit
  process.exit(0);
}

main().catch(err => {
  console.log(`validate-specs: error (${err.message}), skipping`);
  process.exit(0);
});
