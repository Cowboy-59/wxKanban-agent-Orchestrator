#!/usr/bin/env node
/**
 * tools/sync-spec-status.mjs
 *
 * One-shot retroactive sync: derives correct specification status from
 * artifact presence + task completion, updates specifications.status,
 * and populates the specificationphases history table.
 *
 * Usage:
 *   node tools/sync-spec-status.mjs          # apply changes
 *   node tools/sync-spec-status.mjs --dry-run # preview only
 */

import pg from 'pg';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ── DB connection (same pattern as wxkanban-mcp.mjs) ─────────────────────────

function getDbUrl() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) throw new Error('.env not found in repo root');
  const env = readFileSync(envPath, 'utf8');
  const line = env.split('\n').find(l => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not in .env');
  let url = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  url = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  return url;
}

const pool = new pg.Pool({ connectionString: getDbUrl(), ssl: { rejectUnauthorized: false } });

async function query(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

// ── Status / Phase helpers ─────────────────────────────────────────────────────

const STATUS_TO_PHASE = {
  draft: 'DESIGN',
  in_review: 'DESIGN',
  pending_clarification: 'DESIGN',
  clarified: 'DESIGN',
  planned: 'DESIGN',
  tasks_generated: 'DESIGN',
  implementing: 'IMPLEMENTATION',
  implemented: 'IMPLEMENTATION',
  qa_passed: 'QA',
  human_tested: 'HUMAN_TESTING',
  beta_cleared: 'BETA',
  released: 'RELEASE',
  deferred: null,
};

// Phase order for determining which phases to retroactively close
const PHASE_ORDER = ['DESIGN', 'IMPLEMENTATION', 'QA', 'HUMAN_TESTING', 'BETA', 'RELEASE'];

function phaseIndex(phase) {
  return PHASE_ORDER.indexOf(phase);
}

// ── Artifact-based status derivation ──────────────────────────────────────────

function deriveStatusFromArtifacts(specDir, taskCount, completedCount) {
  const hasFile = (...parts) => existsSync(join(specDir, ...parts));

  if (!hasFile('spec.md') && !hasFile('Scope.md')) return null; // not a real spec dir

  if (taskCount > 0) {
    if (completedCount === taskCount) return 'implemented';
    if (completedCount > 0) return 'implementing';
    return 'tasks_generated';
  }

  if (hasFile('plan.md')) return 'planned';

  if (hasFile('checklists') && readdirSync(join(specDir, 'checklists')).length > 0) {
    return 'clarified';
  }

  return 'draft';
}

// ── Find spec directory by specnumber ─────────────────────────────────────────

function findSpecDir(specnumber) {
  const specsDir = join(ROOT, 'specs');
  const dirs = readdirSync(specsDir).filter(d => {
    return statSync(join(specsDir, d)).isDirectory() && /^\d+-.+/.test(d);
  });
  const padded = String(specnumber).padStart(3, '0');
  const match = dirs.find(d => d.startsWith(padded));
  return match ? join(specsDir, match) : null;
}

// ── Specificationphases management ────────────────────────────────────────────

async function getExistingPhases(specId) {
  const res = await query(
    `SELECT phase, enteredat, exitedat FROM specificationphases WHERE specificationid=$1 ORDER BY enteredat`,
    [specId]
  );
  return res.rows;
}

/**
 * Retroactively creates phase history rows for a spec.
 * Uses spec.createdat as the DESIGN entry point and spec.updatedat as
 * the approximate transition timestamp for later phases.
 */
async function createRetroactivePhaseHistory(spec, targetPhase, existingPhases) {
  const existingPhaseNames = new Set(existingPhases.map(p => p.phase));
  const targetIndex = phaseIndex(targetPhase);
  const rows = [];

  for (let i = 0; i <= targetIndex; i++) {
    const phase = PHASE_ORDER[i];
    if (existingPhaseNames.has(phase)) continue; // already exists

    const isCurrentPhase = i === targetIndex;
    const enteredat = i === 0 ? spec.createdat : spec.updatedat;
    const exitedat = isCurrentPhase ? null : spec.updatedat;

    rows.push({ phase, enteredat, exitedat });
  }

  for (const row of rows) {
    if (DRY_RUN) {
      console.log(`  [dry-run] INSERT specificationphases phase=${row.phase} enteredat=${row.enteredat.toISOString()} exitedat=${row.exitedat?.toISOString() ?? 'null'}`);
    } else {
      await query(
        `INSERT INTO specificationphases (id, specificationid, phase, enteredat, exitedat, createdat)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [randomUUID(), spec.id, row.phase, row.enteredat, row.exitedat]
      );
    }
  }

  return rows.length;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== sync-spec-status ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  // Load all specs with task counts
  const res = await query(`
    SELECT s.id, s.specnumber, s.title, s.status, s.createdat, s.updatedat,
           COUNT(t.id)::int as task_count,
           COUNT(t.id) FILTER (WHERE t.status='completed')::int as completed_count
    FROM specifications s
    LEFT JOIN tasks t ON t.specid = s.id
    GROUP BY s.id ORDER BY s.specnumber
  `);

  if (!res.rows.length) {
    console.log('No specifications found in DB.');
    await pool.end();
    return;
  }

  const changes = [];
  const errors = [];

  for (const spec of res.rows) {
    const specDir = findSpecDir(spec.specnumber);
    if (!specDir) {
      errors.push(`Spec ${spec.specnumber}: no directory found in specs/`);
      continue;
    }

    const targetStatus = deriveStatusFromArtifacts(specDir, spec.task_count, spec.completed_count);
    if (!targetStatus) {
      errors.push(`Spec ${spec.specnumber}: could not derive status (no spec.md found)`);
      continue;
    }

    const targetPhase = STATUS_TO_PHASE[targetStatus];
    const currentPhase = STATUS_TO_PHASE[spec.status] ?? 'DESIGN';
    const existingPhases = await getExistingPhases(spec.id);

    const statusChanged = spec.status !== targetStatus;
    const phaseRowsNeeded = existingPhases.length < (phaseIndex(targetPhase) + 1);

    if (!statusChanged && !phaseRowsNeeded) {
      changes.push({
        specnumber: spec.specnumber,
        title: spec.title,
        from: spec.status,
        to: targetStatus,
        phaseRows: 0,
        action: 'no-change',
      });
      continue;
    }

    // Update status
    if (statusChanged) {
      if (!DRY_RUN) {
        await query(
          `UPDATE specifications SET status=$1, updatedat=now() WHERE id=$2`,
          [targetStatus, spec.id]
        );
      }
    }

    // Retroactively create phase history
    const phaseRowsCreated = await createRetroactivePhaseHistory(spec, targetPhase, existingPhases);

    changes.push({
      specnumber: spec.specnumber,
      title: spec.title,
      from: spec.status,
      to: targetStatus,
      currentPhase,
      targetPhase,
      phaseRows: phaseRowsCreated,
      action: statusChanged ? 'updated' : 'phase-only',
      tasks: `${spec.completed_count}/${spec.task_count}`,
    });
  }

  // Print summary table
  console.log('┌──────┬─────────────────────────────────┬────────────────────┬────────────────────┬────────────┬────────────┬───────────┐');
  console.log('│ Spec │ Title                           │ From               │ To                 │ Phase      │ Tasks      │ Action    │');
  console.log('├──────┼─────────────────────────────────┼────────────────────┼────────────────────┼────────────┼────────────┼───────────┤');

  for (const c of changes) {
    const spec  = c.specnumber.padEnd(4);
    const title = c.title.substring(0, 31).padEnd(31);
    const from  = (c.from ?? '').padEnd(18);
    const to    = (c.to ?? '').padEnd(18);
    const phase = (c.targetPhase ?? '').padEnd(10);
    const tasks = (c.tasks ?? '').padEnd(10);
    const act   = c.action.padEnd(9);
    console.log(`│ ${spec} │ ${title} │ ${from} │ ${to} │ ${phase} │ ${tasks} │ ${act} │`);
  }
  console.log('└──────┴─────────────────────────────────┴────────────────────┴────────────────────┴────────────┴────────────┴───────────┘');

  const updated = changes.filter(c => c.action === 'updated').length;
  const phaseOnly = changes.filter(c => c.action === 'phase-only').length;
  const noChange = changes.filter(c => c.action === 'no-change').length;

  console.log(`\nSummary: ${updated} status updates, ${phaseOnly} phase-only updates, ${noChange} no-change`);

  if (errors.length) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  ⚠ ${e}`));
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No changes written. Remove --dry-run to apply.');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
