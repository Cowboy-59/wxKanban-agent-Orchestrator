/**
 * wxKanban MCP Server
 *
 * Replaces the legacy `bd` CLI for task tracking in AI-assisted workflows.
 * Connects directly to PostgreSQL and exposes task/spec management as MCP tools.
 *
 * Registration: .claude/settings.json mcpServers entry
 * Transport: stdio
 * 
 * CLI Mode: --init <project_id>  (scaffold local directory with kit files)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import pg from 'pg';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, createDecipheriv } from 'crypto';


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI Mode: --init flag ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const initMode = args.includes('--init');
const initProjectId = initMode ? args[args.indexOf('--init') + 1] : null;

// Support --dir flag for target directory (defaults to current working directory)
const dirFlagIndex = args.indexOf('--dir');
const initTargetDir = dirFlagIndex !== -1 ? args[dirFlagIndex + 1] : null;

if (initMode && !initProjectId) {
  console.error('Usage: node wxkanban-mcp.mjs --init <project_id> [--dir <target_directory>]');
  process.exit(1);
}



// ── Encrypted Database Configuration ──────────────────────────────────────────
// Database URL is encrypted and embedded - decrypted at runtime using WXKANBAN_API_TOKEN
// To update: encrypt new URL with: node -e "const c=require('crypto'); const k=c.createHash('sha256').update('YOUR_TOKEN').digest(); const iv=c.randomBytes(16); const cipher=c.createCipheriv('aes-256-gcm',k,iv); let e=cipher.update('postgres://...','utf8','hex'); e+=cipher.final('hex'); const auth=cipher.getAuthTag(); console.log('Encrypted:', iv.toString('hex')+':'+auth.toString('hex')+':'+e);"

const ENCRYPTED_DB_URL = '8c9ec7bfce37ad175db311937e1b606a:6aabcde6f9d1fdc06956e54334ee694c:ec9bfd08c65260b2e7aa09e7cf55fe05002f769d50e48540eda0624d8f3035cead6e8e8fd4c2440f969aa0e4b9264efaf4a2a4ca94b98aaa91dbb61f84c90526e78f18c5415216e3057a9944a48299df36f08010135ce10d4092e972caeb58cc3428e399c321431f192ec18598acdd'; // Format: iv:authTag:ciphertext


function decryptDbUrl(encryptedData, token) {
  if (!encryptedData || encryptedData === 'EMBEDDED_ENCRYPTED_URL_PLACEHOLDER') {
    throw new Error('No encrypted database URL configured. Please set ENCRYPTED_DB_URL in the MCP server.');
  }
  if (!token) {
    throw new Error('WXKANBAN_API_TOKEN not set. Cannot decrypt database URL.');
  }
  
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted database URL format. Expected: iv:authTag:ciphertext');
  }
  
  const [ivHex, authTagHex, ciphertext] = parts;
  const key = createHash('sha256').update(token).digest();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}

function getDbUrl() {
  // First try to get token from environment
  let token = process.env.WXKANBAN_API_TOKEN;
  
  // If not in environment, try to read from .env file
  if (!token) {
    const envPath = join(ROOT, '.env');
    if (existsSync(envPath)) {
      const env = readFileSync(envPath, 'utf8');
      const line = env.split('\n').find(l => l.startsWith('WXKANBAN_API_TOKEN='));
      if (line) {
        token = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
      }
    }
  }
  
  if (!token) {
    throw new Error('WXKANBAN_API_TOKEN not found in environment or .env file');
  }
  
  return decryptDbUrl(ENCRYPTED_DB_URL, token);
}

// Lazy initialization - pool is only created when actually needed
// This allows --init mode to run without requiring database credentials
let pool = null;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getDbUrl(), ssl: { rejectUnauthorized: false } });
  }
  return pool;
}


async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(rows) {
  return JSON.stringify(rows, null, 2);
}

// ── Spec phase helpers ────────────────────────────────────────────────────────

const STATUS_TO_PHASE = {
  draft: 'DESIGN', in_review: 'DESIGN', pending_clarification: 'DESIGN',
  clarified: 'DESIGN', planned: 'DESIGN', tasks_generated: 'DESIGN',
  implementing: 'IMPLEMENTATION', implemented: 'IMPLEMENTATION',
  qa_passed: 'QA', human_tested: 'HUMAN_TESTING',
  beta_cleared: 'BETA', released: 'RELEASE',
};

const PHASE_ORDER = ['DESIGN', 'IMPLEMENTATION', 'QA', 'HUMAN_TESTING', 'BETA', 'RELEASE'];

/**
 * When a spec transitions between status values that cross a phase boundary,
 * close the old phase row and open the new one in specificationphases.
 */
async function trackPhaseTransition(specId, fromStatus, toStatus) {
  const fromPhase = STATUS_TO_PHASE[fromStatus] ?? null;
  const toPhase   = STATUS_TO_PHASE[toStatus]   ?? null;
  if (!toPhase || fromPhase === toPhase) return; // no phase boundary crossed

  // Close any open rows for prior phases
  await query(
    `UPDATE specificationphases
     SET exitedat = now()
     WHERE specificationid = $1 AND exitedat IS NULL AND phase != $2`,
    [specId, toPhase]
  );

  // Open the new phase if not already open
  const existing = await query(
    `SELECT id FROM specificationphases
     WHERE specificationid=$1 AND phase=$2 AND exitedat IS NULL`,
    [specId, toPhase]
  );
  if (!existing.rows.length) {
    const { randomUUID } = await import('crypto');
    await query(
      `INSERT INTO specificationphases (id, specificationid, phase, enteredat, createdat)
       VALUES ($1, $2, $3, now(), now())`,
      [randomUUID(), specId, toPhase]
    );
  }
}

/**
 * After a spec status change, check whether the project-level milestone
 * (projects.currentphase) should advance.
 *
 * Project milestones: Design → QA → Beta → Release
 * (Implementation is a spec-level concept, not a project milestone)
 *
 * Thresholds (all non-deferred specs must meet or exceed):
 *   Design → QA:      all specs at 'implemented' or beyond
 *   QA     → Beta:    all specs at 'human_tested' or beyond
 *   Beta   → Release: all specs at 'released'
 */
async function maybeAdvanceProjectPhase(specId) {
  const specRow = await query('SELECT projectid FROM specifications WHERE id=$1', [specId]);
  if (!specRow.rows.length) return;
  const projectid = specRow.rows[0].projectid;

  const projRow = await query('SELECT currentphase FROM projects WHERE id=$1', [projectid]);
  if (!projRow.rows.length) return;
  const currentPhase = projRow.rows[0].currentphase;

  const specs = await query(
    'SELECT status FROM specifications WHERE projectid=$1 AND status != \'deferred\'',
    [projectid]
  );
  if (!specs.rows.length) return;

  const allStatuses = specs.rows.map(r => r.status);

  const PHASE_ORDER = ['Design', 'QA', 'Beta', 'Release'];
  const thresholds = [
    { phase: 'Release', required: new Set(['released']) },
    { phase: 'Beta',    required: new Set(['beta_cleared','released']) },
    { phase: 'QA',      required: new Set(['implemented','qa_passed','human_tested','beta_cleared','released']) },
  ];

  let targetPhase = 'Design';
  for (const { phase, required } of thresholds) {
    if (allStatuses.every(s => required.has(s))) {
      targetPhase = phase;
      break;
    }
  }

  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const targetIdx  = PHASE_ORDER.indexOf(targetPhase);
  if (targetIdx > currentIdx) {
    await query(
      'UPDATE projects SET currentphase=$1, updatedat=now() WHERE id=$2',
      [targetPhase, projectid]
    );
  }
}

function priorityNum(p) {
  // priority: 0=critical, 1=high, 2=medium, 3=low, 4=backlog
  if (typeof p === 'number') {
    return ['critical', 'high', 'medium', 'low', 'backlog'][p] ?? 'medium';
  }
  return p || 'medium';
}

// ── Tool implementations ──────────────────────────────────────────────────────

const tools = {
  // ── wxk_stats ──────────────────────────────────────────────────────────────
  async wxk_stats() {
    const [t, s, d, ready] = await Promise.all([
      query('SELECT status, COUNT(*) as n FROM tasks GROUP BY status ORDER BY status'),
      query('SELECT status, COUNT(*) as n FROM specifications GROUP BY status ORDER BY status'),
      query('SELECT COUNT(*) as n FROM taskdependencies'),
      query(`
        SELECT COUNT(*) as n FROM tasks t
        WHERE t.status NOT IN ('completed','orphaned')
        AND NOT EXISTS (
          SELECT 1 FROM taskdependencies td
          JOIN tasks blocker ON blocker.id = td.blockedbyid
          WHERE td.taskid = t.id AND blocker.status NOT IN ('completed','orphaned')
        )
      `),
    ]);

    const taskStats = Object.fromEntries(t.rows.map(r => [r.status, parseInt(r.n)]));
    const specStats = Object.fromEntries(s.rows.map(r => [r.status, parseInt(r.n)]));
    const total = Object.values(taskStats).reduce((a, b) => a + b, 0);

    return {
      tasks: { ...taskStats, total },
      specs: { ...specStats, total: Object.values(specStats).reduce((a, b) => a + b, 0) },
      dependencies: parseInt(d.rows[0].n),
      ready_tasks: parseInt(ready.rows[0].n),
    };
  },

  // ── wxk_task_list ──────────────────────────────────────────────────────────
  async wxk_task_list({ status, spec_number, limit = 50, search }) {
    let where = ['1=1'];
    const params = [];
    let i = 1;

    if (status) { where.push(`t.status = $${i++}`); params.push(status); }
    if (spec_number) {
      const padded = String(spec_number).padStart(3, '0');
      where.push(`s.specnumber = $${i++}`); params.push(padded);
    }
    if (search) { where.push(`t.name ILIKE $${i++}`); params.push(`%${search}%`); }

    params.push(Math.min(limit, 500));
    const rows = await query(`
      SELECT t.id, t.name, t.status, t.priority, t.sourceoforigin,
             s.specnumber, s.title as spec_title,
             t.createdat, t.updatedat
      FROM tasks t
      LEFT JOIN specifications s ON s.id = t.specid
      WHERE ${where.join(' AND ')}
      ORDER BY s.specnumber NULLS LAST, t.name
      LIMIT $${i}
    `, params);

    return rows.rows;
  },

  // ── wxk_task_show ──────────────────────────────────────────────────────────
  async wxk_task_show({ id }) {
    const [task, blockedby, blocking] = await Promise.all([
      query(`
        SELECT t.*, s.specnumber, s.title as spec_title
        FROM tasks t LEFT JOIN specifications s ON s.id = t.specid
        WHERE t.id = $1 OR t.name ILIKE $2
      `, [id, `[%${id}%]%`]),
      query(`
        SELECT t.id, t.name, t.status FROM taskdependencies td
        JOIN tasks t ON t.id = td.blockedbyid
        WHERE td.taskid = $1
      `, [id]),
      query(`
        SELECT t.id, t.name, t.status FROM taskdependencies td
        JOIN tasks t ON t.id = td.taskid
        WHERE td.blockedbyid = $1
      `, [id]),
    ]);
    if (!task.rows.length) return { error: `Task not found: ${id}` };
    return { task: task.rows[0], blocked_by: blockedby.rows, blocking: blocking.rows };
  },

  // ── wxk_task_create ────────────────────────────────────────────────────────
  async wxk_task_create({ name, description, spec_number, priority = 'medium', status = 'open', source = 'internal' }) {
    // Resolve spec
    let specid = null;
    if (spec_number) {
      const padded = String(spec_number).padStart(3, '0');
      const s = await query('SELECT id FROM specifications WHERE specnumber=$1', [padded]);
      if (s.rows.length) specid = s.rows[0].id;
    }

    // Get default project + user
    // Note: userprofiles uses 'joinedat' (not 'createdat') and 'id' (uuid) for the user UUID
    const [projRow, userRow] = await Promise.all([
      query('SELECT id FROM projects ORDER BY createdat LIMIT 1'),
      query('SELECT id FROM userprofiles WHERE active=true AND id IS NOT NULL ORDER BY joinedat LIMIT 1'),
    ]);

    if (!projRow.rows.length) return { error: 'No project found in database' };
    const projectid = projRow.rows[0].id;
    const createdbyid = userRow.rows.length ? userRow.rows[0].id : null;

    const res = await query(`
      INSERT INTO tasks (projectid, specid, createdbyid, name, description, status, priority, sourceoforigin)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [projectid, specid, createdbyid, name, description ?? null, status, priorityNum(priority), source]);

    return res.rows[0];
  },

  // ── wxk_task_update ────────────────────────────────────────────────────────
  async wxk_task_update({ id, status, priority, name, description, assignedtoid }) {
    const sets = [];
    const params = [];
    let i = 1;

    if (status) { sets.push(`status=$${i++}`); params.push(status); }
    if (priority) { sets.push(`priority=$${i++}`); params.push(priorityNum(priority)); }
    if (name) { sets.push(`name=$${i++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description=$${i++}`); params.push(description); }
    if (assignedtoid !== undefined) { sets.push(`assignedtoid=$${i++}`); params.push(assignedtoid); }
    sets.push('updatedat=now()');

    if (sets.length === 1) return { error: 'No fields to update' };

    params.push(id);
    const res = await query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id=$${i} RETURNING id, name, status, priority, updatedat`,
      params
    );
    if (!res.rows.length) return { error: `Task not found: ${id}` };
    return res.rows[0];
  },

  // ── wxk_task_close ─────────────────────────────────────────────────────────
  async wxk_task_close({ id, reason }) {
    const res = await query(
      'UPDATE tasks SET status=\'completed\', updatedat=now() WHERE id=$1 RETURNING id, name, status',
      [id]
    );
    if (!res.rows.length) return { error: `Task not found: ${id}` };
    return { ...res.rows[0], reason: reason ?? null };
  },

  // ── wxk_task_ready ─────────────────────────────────────────────────────────
  async wxk_task_ready({ spec_number, limit = 30 }) {
    const params = [];
    let where = `t.status NOT IN ('completed','orphaned')
      AND NOT EXISTS (
        SELECT 1 FROM taskdependencies td
        JOIN tasks blocker ON blocker.id = td.blockedbyid
        WHERE td.taskid = t.id AND blocker.status NOT IN ('completed','orphaned')
      )`;

    if (spec_number) {
      const padded = String(spec_number).padStart(3, '0');
      where += ' AND s.specnumber = $1';
      params.push(padded);
    }

    params.push(Math.min(limit, 200));
    const res = await query(`
      SELECT t.id, t.name, t.status, t.priority, s.specnumber
      FROM tasks t
      LEFT JOIN specifications s ON s.id = t.specid
      WHERE ${where}
      ORDER BY t.priority, s.specnumber NULLS LAST, t.name
      LIMIT $${params.length}
    `, params);

    return res.rows;
  },

  // ── wxk_dep_add ────────────────────────────────────────────────────────────
  async wxk_dep_add({ task_id, blocked_by_id }) {
    // Circular check
    const circ = await query(
      `WITH RECURSIVE chain AS (
         SELECT blockedbyid as next FROM taskdependencies WHERE taskid=$1
         UNION ALL
         SELECT td.blockedbyid FROM taskdependencies td JOIN chain c ON td.taskid=c.next
       ) SELECT 1 FROM chain WHERE next=$2 LIMIT 1`,
      [blocked_by_id, task_id]
    );
    if (circ.rows.length) return { error: 'Circular dependency detected' };

    try {
      const res = await query(
        'INSERT INTO taskdependencies (taskid, blockedbyid) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id',
        [task_id, blocked_by_id]
      );
      return res.rows.length
        ? { added: true, id: res.rows[0].id }
        : { added: false, reason: 'already exists' };
    } catch (e) {
      return { error: e.message };
    }
  },

  // ── wxk_dep_remove ─────────────────────────────────────────────────────────
  async wxk_dep_remove({ task_id, blocked_by_id }) {
    const res = await query(
      'DELETE FROM taskdependencies WHERE taskid=$1 AND blockedbyid=$2 RETURNING id',
      [task_id, blocked_by_id]
    );
    return { removed: res.rows.length > 0 };
  },

  // ── wxk_spec_list ──────────────────────────────────────────────────────────
  async wxk_spec_list({ status } = {}) {
    const params = [];
    let where = '1=1';
    if (status) { where = 'status=$1'; params.push(status); }

    const res = await query(`
      SELECT s.id, s.specnumber, s.title, s.status,
             COUNT(t.id) as task_count,
             COUNT(t.id) FILTER (WHERE t.status='completed') as completed_count
      FROM specifications s
      LEFT JOIN tasks t ON t.specid = s.id
      WHERE ${where}
      GROUP BY s.id ORDER BY s.specnumber
    `, params);

    return res.rows;
  },

  // ── wxk_spec_update ────────────────────────────────────────────────────────
  async wxk_spec_update({ spec_number, status }) {
    const valid = ['draft','in_review','pending_clarification','clarified','planned',
      'tasks_generated','implementing','implemented','qa_passed',
      'human_tested','beta_cleared','released','deferred'];
    if (!valid.includes(status)) {
      return { error: `Invalid status "${status}". Valid values: ${valid.join(', ')}` };
    }
    // Fetch current status before update (for phase transition tracking)
    const current = await query(
      'SELECT id, status FROM specifications WHERE specnumber=$1',
      [String(spec_number).padStart(3, '0')]
    );
    if (!current.rows.length) return { error: `Spec ${spec_number} not found in DB` };
    const { id: specId, status: oldStatus } = current.rows[0];

    const res = await query(
      'UPDATE specifications SET status=$1, updatedat=now() WHERE id=$2 RETURNING id, specnumber, title, status',
      [status, specId]
    );

    // Track phase boundary crossing in specificationphases
    await trackPhaseTransition(specId, oldStatus, status);

    // Check if the project-level milestone should advance
    await maybeAdvanceProjectPhase(specId);

    return res.rows[0];
  },

  // ── wxk_spec_create ────────────────────────────────────────────────────────
  // Explicitly create a specification in DB from a scope document
  async wxk_spec_create({ spec_number, title: overrideTitle, status = 'draft' }) {
    const specNumber = String(spec_number).padStart(3, '0');

    // Check if already exists
    const existing = await query('SELECT id, specnumber, title, status FROM specifications WHERE specnumber=$1', [specNumber]);
    if (existing.rows.length) {
      return { already_exists: true, spec: existing.rows[0] };
    }

    // Get project + user
    const [projRow, userRow] = await Promise.all([
      query('SELECT id FROM projects ORDER BY createdat LIMIT 1'),
      query('SELECT id FROM userprofiles WHERE active=true AND id IS NOT NULL ORDER BY joinedat LIMIT 1'),
    ]);
    if (!projRow.rows.length) return { error: 'No project found in database' };
    const projectId = projRow.rows[0].id;
    const userId = userRow.rows.length ? userRow.rows[0].id : null;

    // Look for scope document in specs/Project-Scope/NNN-*.md
    // Use startsWith(specNumber) so "013-scopeAudit.md" matches spec "013"
    const scopeDir = join(ROOT, 'specs', 'Project-Scope');
    let scopeFile = null;
    if (existsSync(scopeDir)) {
      const scopeFiles = readdirSync(scopeDir).filter(f =>
        f.startsWith(specNumber)
      );
      if (scopeFiles.length) scopeFile = join(scopeDir, scopeFiles[0]);
    }

    let title = overrideTitle || `Spec ${specNumber}`;
    let content = '';
    if (scopeFile && existsSync(scopeFile)) {
      content = readFileSync(scopeFile, 'utf8').replace(/^\uFEFF/, '');
      if (!overrideTitle) {
        // Extract title from first # heading; strip trailing # and "Spec NNN:" prefix
        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch) {
          title = titleMatch[1]
            .replace(/#\s*$/, '')
            .replace(/^Scope\s+\d+\s*[—–-]\s*/i, '')
            .replace(/^Spec\s+\d+:\s*/i, '')
            .trim();
        }
      }
    }

    // Get next specorder
    const orderRes = await query(
      'SELECT COALESCE(MAX(specorder), -1) + 1 AS nextorder FROM specifications WHERE projectid=$1',
      [projectId]
    );
    const nextOrder = parseInt(orderRes.rows[0].nextorder) || 0;

    const { randomUUID } = await import('crypto');
    const res = await query(
      `INSERT INTO specifications (id, projectid, specnumber, title, content, status, specorder, isoptional, createdbyid, createdat, updatedat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, now(), now()) RETURNING id, specnumber, title, status`,
      [randomUUID(), projectId, specNumber, title, content, status, nextOrder, userId]
    );

    return {
      created: true,
      spec: res.rows[0],
      scope_doc: scopeFile ? scopeFile.replace(ROOT, '').replace(/\\/g, '/') : null,
    };
  },

  // ── wxk_doc_import ─────────────────────────────────────────────────────────
  // Load spec artifact files (spec.md, plan.md, quickstart.md, tasks.md,
  // checklists/requirements.md, lifecycle.json) into projectdocuments table.
  // Idempotent: upserts by (specid, doctype).
  async wxk_doc_import({ spec_number, dry_run = false }) {
    const specsDir = join(ROOT, 'specs');
    const dirs = readdirSync(specsDir)
      .filter(d => statSync(join(specsDir, d)).isDirectory())
      .filter(d => /^\d+-.+/.test(d));

    const filtered = spec_number
      ? dirs.filter(d => d.startsWith(String(spec_number).padStart(3, '0')))
      : dirs;

    if (!filtered.length) return { error: `No spec directories found matching ${spec_number}` };

    const DOC_MAP = [
      { file: 'spec.md',                    doctype: 'spec' },
      { file: 'plan.md',                    doctype: 'plan' },
      { file: 'quickstart.md',              doctype: 'quickstart' },
      { file: 'tasks.md',                   doctype: 'tasks' },
      { file: 'checklists/requirements.md', doctype: 'checklist' },
      { file: 'lifecycle.json',             doctype: 'lifecycle' },
    ];

    const report = { specs_processed: 0, docs_created: 0, docs_updated: 0, docs_skipped: 0, errors: [] };

    for (const dir of filtered.sort()) {
      const dirPath = join(specsDir, dir);
      const numM = dir.match(/^(\d+)/);
      if (!numM) continue;
      const specNumber = numM[1].padStart(3, '0');

      // Spec must exist in DB
      const specRes = await query(
        'SELECT id, projectid, title FROM specifications WHERE specnumber=$1',
        [specNumber]
      );
      if (!specRes.rows.length) {
        report.errors.push(`Spec ${specNumber}: not in DB — run wxk_spec_create first`);
        continue;
      }
      const { id: specId, projectid, title: specTitle } = specRes.rows[0];

      // Fetch existing docs for this spec
      const existingRes = await query(
        'SELECT id, doctype FROM projectdocuments WHERE specid=$1',
        [specId]
      );
      const existingMap = Object.fromEntries(existingRes.rows.map(r => [r.doctype, r.id]));

      for (const { file, doctype } of DOC_MAP) {
        const fullPath = join(dirPath, file);
        const relPath = `specs/${dir}/${file}`;
        if (!existsSync(fullPath)) continue;

        const content = readFileSync(fullPath, 'utf8');
        const title = `${specTitle} — ${doctype.charAt(0).toUpperCase() + doctype.slice(1)}`;

        if (dry_run) {
          const action = existingMap[doctype] ? 'update' : 'create';
          report[action === 'create' ? 'docs_created' : 'docs_updated']++;
          continue;
        }

        if (existingMap[doctype]) {
          // Update existing
          await query(
            'UPDATE projectdocuments SET content=$1, title=$2, filepath=$3, updatedat=now() WHERE id=$4',
            [content, title, relPath, existingMap[doctype]]
          );
          report.docs_updated++;
        } else {
          // Insert new
          const { randomUUID } = await import('crypto');
          await query(
            `INSERT INTO projectdocuments (id, projectid, specid, doctype, title, content, filepath, isgenerated, createdat, updatedat)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false, now(), now())`,
            [randomUUID(), projectid, specId, doctype, title, content, relPath]
          );
          report.docs_created++;
        }
      }
      report.specs_processed++;
    }

    return report;
  },

  // ── wxk_scope_import ───────────────────────────────────────────────────────
  // Import tasks from a spec's tasks.md into PostgreSQL (idempotent)
  async wxk_scope_import({ spec_number, dry_run = false }) {
    const specsDir = join(ROOT, 'specs');
    const dirs = readdirSync(specsDir)
      .filter(d => statSync(join(specsDir, d)).isDirectory())
      .filter(d => /^\d+-.+/.test(d));

    const filtered = spec_number
      ? dirs.filter(d => d.startsWith(String(spec_number).padStart(3, '0')))
      : dirs;

    if (!filtered.length) return { error: `No spec directories found matching ${spec_number}` };

    const report = { specs_processed: 0, tasks_created: 0, tasks_skipped: 0, deps_added: 0, errors: [] };

    // Get project + user for inserts
    // Note: userprofiles uses 'joinedat' (not 'createdat') and 'id' (uuid) for the user UUID
    const [projRow, userRow] = await Promise.all([
      query('SELECT id FROM projects ORDER BY createdat LIMIT 1'),
      query('SELECT id FROM userprofiles WHERE active=true AND id IS NOT NULL ORDER BY joinedat LIMIT 1'),
    ]);
    const taskProjectId = projRow.rows.length ? projRow.rows[0].id : null;
    const userId = userRow.rows.length ? userRow.rows[0].id : null;

    for (const dir of filtered.sort()) {
      const dirPath = join(specsDir, dir);
      const numM = dir.match(/^(\d+)/);
      if (!numM) continue;
      const specNumber = numM[1].padStart(3, '0');
      const tasksPath = join(dirPath, 'tasks.md');
      if (!existsSync(tasksPath)) continue;

      // Find spec — auto-create from scope document if not in DB
      let specRes = await query('SELECT id FROM specifications WHERE specnumber=$1', [specNumber]);
      let specId;
      if (!specRes.rows.length) {
        // Look for scope document in specs/Project-Scope/NNN-*.md
        // Use startsWith(specNumber) so "013-scopeAudit.md" matches spec "013"
        const scopeDir = join(ROOT, 'specs', 'Project-Scope');
        let scopeFile = null;
        if (existsSync(scopeDir)) {
          const scopeFiles = readdirSync(scopeDir).filter(f =>
            f.startsWith(specNumber)
          );
          if (scopeFiles.length) scopeFile = join(scopeDir, scopeFiles[0]);
        }

        let title = `Spec ${specNumber}`;
        let content = '';
        if (scopeFile && existsSync(scopeFile)) {
          content = readFileSync(scopeFile, 'utf8');
          // Strip BOM if present
          content = content.replace(/^\uFEFF/, '');
          const titleMatch = content.match(/^#\s+(.+)/m);
          if (titleMatch) {
            title = titleMatch[1]
              .replace(/#\s*$/, '')
              .replace(/^Scope\s+\d+\s*[—–-]\s*/i, '')
              .replace(/^Spec\s+\d+:\s*/i, '')
              .trim();
          }
        }

        if (!taskProjectId) {
          report.errors.push(`Spec ${specNumber}: no project found in DB — cannot auto-create spec`);
          continue;
        }

        // Get next specorder
        const orderRes = await query(
          'SELECT COALESCE(MAX(specorder), -1) + 1 AS nextorder FROM specifications WHERE projectid=$1',
          [taskProjectId]
        );
        const nextOrder = parseInt(orderRes.rows[0].nextorder) || 0;

        const { randomUUID } = await import('crypto');
        const newSpecRes = await query(
          `INSERT INTO specifications (id, projectid, specnumber, title, content, status, specorder, isoptional, createdbyid, createdat, updatedat)
           VALUES ($1, $2, $3, $4, $5, 'draft', $6, false, $7, now(), now()) RETURNING id`,
          [randomUUID(), taskProjectId, specNumber, title, content, nextOrder, userId]
        );
        specId = newSpecRes.rows[0].id;
        report.specs_created = (report.specs_created || 0) + 1;
        report.specs_created_list = report.specs_created_list || [];
        report.specs_created_list.push({
          specnumber: specNumber,
          title,
          source: scopeFile ? scopeFile.replace(ROOT, '').replace(/\\/g, '/') : '(no scope doc — empty content)',
        });
      } else {
        specId = specRes.rows[0].id;
      }

      const { tasks, deps } = parseTasksMd(readFileSync(tasksPath, 'utf8'));
      const idMap = {};

      for (const t of tasks) {
        const label = `[${specNumber}-${t.taskId}]`;
        const existing = await query(
          'SELECT id FROM tasks WHERE specid=$1 AND name LIKE $2',
          [specId, `${label}%`]
        );
        if (existing.rows.length) {
          idMap[t.taskId] = existing.rows[0].id;
          report.tasks_skipped++;
          continue;
        }
        if (dry_run) { report.tasks_created++; continue; }

        const taskName = `${label} ${t.desc}`.slice(0, 255);
        try {
          const res = await query(
            `INSERT INTO tasks (projectid, specid, createdbyid, name, description, status, priority, sourceoforigin)
             VALUES ($1,$2,$3,$4,$5,$6,'medium','internal') RETURNING id`,
            [taskProjectId, specId, userId, taskName, t.desc, t.done ? 'completed' : 'open']
          );
          idMap[t.taskId] = res.rows[0].id;
          report.tasks_created++;
        } catch (e) {
          report.errors.push(`${label}: ${e.message}`);
        }
      }

      for (const dep of deps) {
        const blockerId = idMap[dep.blocker];
        const dependentId = idMap[dep.dependent];
        if (!blockerId || !dependentId) continue;
        if (!dry_run) {
          await query(
            'INSERT INTO taskdependencies (taskid, blockedbyid) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [dependentId, blockerId]
          );
        }
        report.deps_added++;
      }
      report.specs_processed++;
    }

    return report;
  },
};

// ── tasks.md parser ───────────────────────────────────────────────────────────

function parseTasksMd(content) {
  const lines = content.split('\n');
  const tasks = [];
  const deps = [];
  let inDeps = false;
  let inCode = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!inDeps && trimmed.startsWith('```')) { inCode = !inCode; continue; }
    if (!inDeps && inCode) continue;
    if (/^##\s+Dep/i.test(trimmed)) { inDeps = true; continue; }

    if (!inDeps) {
      const m = trimmed.match(/^-\s+\[([ xX])\]\s+(.+)/);
      if (!m) continue;
      const done = m[1].toLowerCase() === 'x';
      const rest = m[2];
      const idM = rest.match(/T(\d+)/);
      if (!idM) continue;
      const taskId = `T${idM[1].padStart(3, '0')}`;
      let desc = rest.replace(/^T\d+\s*/, '').replace(/\[P\]\s*/g, '')
        .replace(/\*\*HUMAN TASK\*\*:?\s*/gi, '').replace(/`/g, '').replace(/"/g, '\'').trim().slice(0, 255);
      tasks.push({ taskId, desc, done });
    } else {
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const clean = trimmed.replace(/\(.*?\)/g, '').trim();
      const arrowM = clean.match(/^([\w,\s\-–]+)\s*(?:→|->|—>)\s*([\w,\s]+)$/);
      if (!arrowM) continue;
      const leftTasks = (arrowM[1].match(/T(\d+)[–-]T(\d+)/) ?? null)
        ? (() => {
          const rm = arrowM[1].match(/T(\d+)[–-]T(\d+)/);
          return Array.from({ length: parseInt(rm[2]) - parseInt(rm[1]) + 1 }, (_, i) =>
            `T${String(parseInt(rm[1]) + i).padStart(3, '0')}`);
        })()
        : (arrowM[1].match(/T\d+/g) || []).map(t => `T${t.slice(1).padStart(3, '0')}`);
      const rightTasks = (arrowM[2].match(/T\d+/g) || []).map(t => `T${t.slice(1).padStart(3, '0')}`);
      for (const lt of leftTasks) {
        for (const rt of rightTasks) {
          deps.push({ blocker: lt, dependent: rt });
        }
      }
    }
  }
  return { tasks, deps };
}

// ── MCP Server setup ──────────────────────────────────────────────────────────

const TOOL_DEFS = [
  {
    name: 'wxk_stats',
    description: 'Summary statistics: task counts by status, spec counts, dependency count, ready task count.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'wxk_task_list',
    description: 'List tasks with optional filters. Returns id, name, status, priority, spec info.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'orphaned'], description: 'Filter by status' },
        spec_number: { type: 'string', description: 'Filter by spec number, e.g. "009"' },
        limit: { type: 'number', description: 'Max results (default 50, max 500)' },
        search: { type: 'string', description: 'Search term matched against task name' },
      },
    },
  },
  {
    name: 'wxk_task_show',
    description: 'Show task details including what it is blocked by and what it blocks.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task UUID' } },
      required: ['id'],
    },
  },
  {
    name: 'wxk_task_create',
    description: 'Create a new task. Returns the created task row.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Task name / title' },
        description: { type: 'string', description: 'Detailed description' },
        spec_number: { type: 'string', description: 'Associate with spec, e.g. "009"' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'backlog'], default: 'medium' },
        status: { type: 'string', enum: ['open', 'in_progress', 'completed'], default: 'open' },
        source: { type: 'string', enum: ['internal', 'external', 'ai_proposed'], default: 'internal' },
      },
      required: ['name'],
    },
  },
  {
    name: 'wxk_task_update',
    description: 'Update task fields: status, priority, name, description, assignedtoid.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task UUID' },
        status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'orphaned'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'backlog'] },
        name: { type: 'string' },
        description: { type: 'string' },
        assignedtoid: { type: 'string', description: 'User UUID or null to unassign' },
      },
      required: ['id'],
    },
  },
  {
    name: 'wxk_task_close',
    description: 'Mark a task as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task UUID' },
        reason: { type: 'string', description: 'Optional completion note' },
      },
      required: ['id'],
    },
  },
  {
    name: 'wxk_task_ready',
    description: 'List tasks that are unblocked (no incomplete dependencies). Equivalent to the legacy `bd ready` command.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_number: { type: 'string', description: 'Filter to one spec, e.g. "009"' },
        limit: { type: 'number', description: 'Max results (default 30)' },
      },
    },
  },
  {
    name: 'wxk_dep_add',
    description: 'Add a dependency: task_id depends on blocked_by_id (blocked_by must complete first).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The dependent task UUID' },
        blocked_by_id: { type: 'string', description: 'The blocker task UUID' },
      },
      required: ['task_id', 'blocked_by_id'],
    },
  },
  {
    name: 'wxk_dep_remove',
    description: 'Remove a dependency between two tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        blocked_by_id: { type: 'string' },
      },
      required: ['task_id', 'blocked_by_id'],
    },
  },
  {
    name: 'wxk_spec_list',
    description: 'List specifications with task completion counts.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by spec status (draft, tasks_generated, implemented, etc.)' },
      },
    },
  },
  {
    name: 'wxk_spec_update',
    description: 'Update a specification\'s lifecycle status by spec number.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_number: { type: 'string', description: 'Spec number, e.g. "009"' },
        status: {
          type: 'string',
          enum: ['draft','in_review','pending_clarification','clarified','planned',
            'tasks_generated','implementing','implemented','qa_passed',
            'human_tested','beta_cleared','released','deferred'],
          description: 'New lifecycle status for the specification',
        },
      },
      required: ['spec_number', 'status'],
    },
  },
  {
    name: 'wxk_spec_create',
    description: 'Create a specification record in the DB from its scope document (specs/Project-Scope/NNN-*.md). Idempotent — returns existing spec if already present.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_number: { type: 'string', description: 'Spec number, e.g. "011"' },
        title: { type: 'string', description: 'Override title (default: extracted from scope doc first # heading)' },
        status: {
          type: 'string',
          enum: ['draft', 'in_review', 'clarified', 'planned', 'tasks_generated'],
          description: 'Initial status (default: draft)',
        },
      },
      required: ['spec_number'],
    },
  },
  {
    name: 'wxk_doc_import',
    description: 'Load spec artifact files (spec.md, plan.md, quickstart.md, tasks.md, checklists/requirements.md, lifecycle.json) from specs/NNN-*/ into the projectdocuments table. Idempotent — upserts by (specid, doctype). Run after wxk_scope_import to populate the document store.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_number: { type: 'string', description: 'Import only this spec (e.g. "011"). Omit for all.' },
        dry_run: { type: 'boolean', description: 'If true, report what would be created/updated without writing.' },
      },
    },
  },
  {
    name: 'wxk_scope_import',
    description: 'Import tasks from specs/NNN-*/tasks.md into PostgreSQL. Idempotent — skips existing tasks. Auto-creates spec record from scope doc if not in DB. Replaces the legacy scope-import workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_number: { type: 'string', description: 'Import only this spec (e.g. "009"). Omit for all.' },
        dry_run: { type: 'boolean', description: 'If true, report what would be created without writing.' },
      },
    },
  },
];

const server = new Server(
  { name: 'wxkanban', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = tools[name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  try {
    const result = await handler(args ?? {});
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

// ── Init Mode: Scaffold local directory ─────────────────────────────────────

async function runInitMode(projectId, targetDirArg) {
  console.log(`\n🔧 wxKanban Project Kit — Initializing project ${projectId}...\n`);
  
  // Use provided directory or default to current working directory
  const targetDir = targetDirArg ? resolve(targetDirArg) : process.cwd();
  console.log(`📁 Target directory: ${targetDir}\n`);
  
  // Create target directory if it doesn't exist
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Created target directory: ${targetDir}\n`);
  }
  
  // Change to target directory for initialization
  process.chdir(targetDir);
  console.log(`📂 Working directory changed to: ${process.cwd()}\n`);



  const kitDir = join(targetDir, '_wxAI/commands');
  const toolsDir = join(targetDir, 'tools');
  
  // Check for existing files (non-destructive)
  const existingFiles = [];
  const kitFiles = [
    'task-push.md',
    'task-done.md',
    'wxAI-pipeline.md',
    'autofix-tests.md',
    'autofix-translation.md',
    'sync-cpl.md',
    'sync-starter-kit.md'
  ];
  
  for (const file of kitFiles) {
    const path = join(kitDir, file);
    if (existsSync(path)) existingFiles.push(`_wxAI/commands/${file}`);
  }
  
  if (existsSync(join(toolsDir, 'wxkanban-mcp.mjs'))) {
    existingFiles.push('tools/wxkanban-mcp.mjs');
  }
  
  if (existsSync(join(targetDir, 'ai-settings.json'))) {
    existingFiles.push('ai-settings.json');
  }
  
  if (existsSync(join(targetDir, 'AI.md'))) {
    existingFiles.push('AI.md');
  }
  
  if (existsSync(join(targetDir, '.wxkanban-project.json'))) {
    existingFiles.push('.wxkanban-project.json');
  }
  
  if (existingFiles.length > 0) {
    console.log('⚠️  Existing kit files detected (will not overwrite):');
    for (const f of existingFiles) console.log(`   - ${f}`);
    console.log('');
  }
  
  // Create directories
  if (!existsSync(kitDir)) {
    mkdirSync(kitDir, { recursive: true });
    console.log('📁 Created: _wxAI/commands/');
  }
  
  if (!existsSync(toolsDir)) {
    mkdirSync(toolsDir, { recursive: true });
    console.log('📁 Created: tools/');
  }
  
  // Create .wxkanban-project.json
  const projectConfigPath = join(targetDir, '.wxkanban-project.json');
  if (!existsSync(projectConfigPath)) {
    const config = {
      projectId: projectId,
      kitVersion: '1.0.0',
      primaryAI: 'blackboxai',
      createdAt: new Date().toISOString(),
      kitSource: 'wxkanban-mcp --init'
    };
    writeFileSync(projectConfigPath, JSON.stringify(config, null, 2));
    console.log('📝 Created: .wxkanban-project.json');
  }
  
  // Create AI.md template
  const aiMdPath = join(targetDir, 'AI.md');
  if (!existsSync(aiMdPath)) {
    const aiMdContent = `# AI Project Context

## Project ID
${projectId}

## wxKanban Integration
This project is connected to wxKanban for AI-assisted task management.

## Quick Commands
- Use wxk_task_list to see available tasks
- Use wxk_task_ready to see unblocked tasks
- Use wxk_stats for project overview

## Environment Setup
1. Ensure WXKANBAN_API_TOKEN is set in your environment
2. The MCP server will use this token for authentication
3. Run wxk_scope_import to sync tasks from specs/

## Project Structure
- _wxAI/commands/ — AI command templates
- tools/wxkanban-mcp.mjs — MCP server for wxKanban integration
`;
    writeFileSync(aiMdPath, aiMdContent);
    console.log('📝 Created: AI.md');
  }
  
  // Create ai-settings.json template
  const aiSettingsPath = join(targetDir, 'ai-settings.json');
  if (!existsSync(aiSettingsPath)) {
    const aiSettings = {
      version: '1.0.0',
      projectId: projectId,
      adapters: {
        claude: {
          enabled: true,
          settingsPath: '.claude/settings.json',
          mcpServer: './tools/wxkanban-mcp.mjs'
        },
        blackboxai: {
          enabled: true,
          settingsPath: '_wxAI-global/settings.json',
          commandsDir: '_wxAI/commands'
        },
        cursor: {
          enabled: true,
          settingsPath: '.cursor/settings.json'
        },
        copilot: {
          enabled: true,
          settingsPath: '.github/copilot-settings.json'
        }
      }
    };
    writeFileSync(aiSettingsPath, JSON.stringify(aiSettings, null, 2));
    console.log('📝 Created: ai-settings.json');
  }
  
  // Copy MCP server if not exists
  const mcpSource = join(__dirname, 'wxkanban-mcp.mjs');
  const mcpTarget = join(toolsDir, 'wxkanban-mcp.mjs');
  if (existsSync(mcpSource) && !existsSync(mcpTarget)) {
    const mcpContent = readFileSync(mcpSource, 'utf8');
    writeFileSync(mcpTarget, mcpContent);
    console.log('📝 Created: tools/wxkanban-mcp.mjs');
  }
  
  // Create command templates
  const commandTemplates = {
    'task-push.md': `# Task Push Command

## Usage
Push tasks from local specs/ to wxKanban database.

## Arguments
- spec_number: Optional spec number to limit import (e.g., "011")

## Example
\`\`\`
wxk_scope_import({ spec_number: "011" })
\`\`\`
`,
    'task-done.md': `# Task Done Command

## Usage
Mark a task as completed in wxKanban.

## Arguments
- id: Task UUID
- reason: Optional completion note

## Example
\`\`\`
wxk_task_close({ id: "task-uuid", reason: "Implemented in PR #123" })
\`\`\`
`,
    'wxAI-pipeline.md': `# wxAI Pipeline Command

## Usage
Run the full spec pipeline: specify → clarify → plan → tasks.

## Arguments
- spec_number: Target spec number
- skip_clarify: Skip clarification phase (default: false)

## Example
\`\`\`
// 1. Create spec from scope doc
wxk_spec_create({ spec_number: "011" })

// 2. Import tasks
wxk_scope_import({ spec_number: "011" })

// 3. Import documents
wxk_doc_import({ spec_number: "011" })
\`\`\`
`,
    'autofix-tests.md': `# Autofix Tests Command

## Usage
Run autonomous test-fix pipeline.

## Arguments
- test_pattern: Glob pattern for test files
- max_iterations: Maximum fix attempts (default: 5)

## Example
\`\`\`
autofix_tests({ test_pattern: "**/*.test.ts", max_iterations: 3 })
\`\`\`
`,
    'autofix-translation.md': `# Autofix Translation Command

## Usage
Run MSSQL → PostgreSQL translation pipeline.

## Arguments
- file_path: Path to SQL file to translate

## Example
\`\`\`
autofix_translation({ file_path: "migrations/legacy.sql" })
\`\`\`
`,
    'sync-cpl.md': `# Sync CPL Command

## Usage
Sync with CPL (Common Project Launcher).

## Arguments
- check_only: Only check differences, don't apply (default: false)

## Example
\`\`\`
sync_cpl({ check_only: true })
\`\`\`
`,
    'sync-starter-kit.md': `# Sync Starter Kit Command

## Usage
Sync project with starter kit templates.

## Arguments
- force: Overwrite existing files (default: false)

## Example
\`\`\`
sync_starter_kit({ force: false })
\`\`\`
`
  };
  
  for (const [filename, content] of Object.entries(commandTemplates)) {
    const filepath = join(kitDir, filename);
    if (!existsSync(filepath)) {
      writeFileSync(filepath, content);
      console.log(`📝 Created: _wxAI/commands/${filename}`);
    }
  }
  
  console.log('\n✅ Project kit scaffolding complete!\n');
  console.log('Next steps:');
  console.log('1. Set WXKANBAN_API_TOKEN in your environment or .env file');
  console.log('2. Run: node tools/wxkanban-mcp.mjs (to start MCP server)');
  console.log('3. Or use the wxk_* tools via your AI assistant\n');
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

if (initMode) {
  // Run init mode and exit
  await runInitMode(initProjectId, initTargetDir);
  process.exit(0);

} else {
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
