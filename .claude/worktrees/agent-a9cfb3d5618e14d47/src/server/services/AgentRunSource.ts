import { sql } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('agent-run-source');

// [SCOPE 005 / T006] BEGIN — agentruns availability probe (table is SPEC-143's, not always deployed)
const RECHECK_MISSING_MS = 10 * 60 * 1000;

let availableCached = false;
let missingCheckedAt = 0;

/**
 * True when SPEC-143's `agentruns` table exists. A `true` answer is cached for the process
 * lifetime; a `false` answer is re-checked at most every 10 minutes. The table is read with raw
 * SQL so this file never imports SPEC-143's schema module.
 */
export async function isAgentRunsAvailable(): Promise<boolean> {
  if (availableCached) return true;
  if (missingCheckedAt !== 0 && Date.now() - missingCheckedAt < RECHECK_MISSING_MS) return false;
  try {
    const result = await db.execute(sql`SELECT to_regclass('public.agentruns') IS NOT NULL AS ok`);
    const row = (result.rows as Array<{ ok?: boolean }>)[0];
    const ok = row?.ok === true;
    if (ok) availableCached = true;
    else missingCheckedAt = Date.now();
    return ok;
  } catch (err) {
    missingCheckedAt = Date.now();
    logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'agentruns probe failed');
    return false;
  }
}

/** Test hook: forget the cached probe result. */
export function resetAgentRunsAvailabilityCache(): void {
  availableCached = false;
  missingCheckedAt = 0;
}
// [SCOPE 005 / T006] END

// [SCOPE 005 / T006] BEGIN — run note lines: the five fields allowed in an automatic note (FR-006)
/** The only facts an automatic note may carry. No prompt text, code or file contents. */
export interface RunNoteLine {
  command: string | null;
  task: string | null;
  scope: string | null;
  model: string | null;
  minutes: number;
}

interface RunRow {
  command: string | null;
  task: string | null;
  scope: string | null;
  model: string | null;
  activeseconds: number | string | null;
}

/**
 * Runs of ONE project, billed to ONE company, that started in [since, until] and were not
 * flagged never-billed, in start order. Other projects and other companies' runs are never read,
 * so a note cannot carry another client's data — on an engaged client project the consultant's
 * note shows the consultant's runs only (MODIFIED-BY: [SCOPE 143 / T027], agentruns.companyid).
 */
export async function listRunNoteLines(projectid: string, companyid: string, since: Date, until: Date): Promise<RunNoteLine[]> {
  if (!(await isAgentRunsAvailable())) return [];
  const result = await db.execute(sql`
    SELECT r.command AS command,
           t.name AS task,
           s.specnumber AS scope,
           r.model AS model,
           r.activeseconds AS activeseconds
    FROM agentruns r
    LEFT JOIN projecttasks t ON t.id = r.taskid
    LEFT JOIN projectspecifications s ON s.id = t.specid
    WHERE r.projectid = ${projectid}
      AND r.companyid = ${companyid}
      AND r.starttime >= ${since}
      AND r.starttime <= ${until}
      AND r.neverbilled = false
    ORDER BY r.starttime ASC
  `);
  return (result.rows as unknown as RunRow[]).map((r) => ({
    command: r.command ?? null,
    task: r.task ?? null,
    scope: r.scope ?? null,
    model: r.model ?? null,
    minutes: Math.ceil(Number(r.activeseconds ?? 0) / 60),
  }));
}

/** `<command> · <task> · <scope> · <model> · <n> min`, with "—" for a missing part. */
export function formatRunNoteLine(line: RunNoteLine): string {
  const part = (v: string | null): string => (v && v.trim() ? v.trim() : '—');
  return [part(line.command), part(line.task), part(line.scope), part(line.model), `${line.minutes} min`].join(' · ');
}
// [SCOPE 005 / T006] END
