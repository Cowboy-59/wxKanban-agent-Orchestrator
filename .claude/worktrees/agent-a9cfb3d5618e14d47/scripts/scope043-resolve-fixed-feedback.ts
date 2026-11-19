#!/usr/bin/env tsx
/**
 * [SCOPE 043 close-out] Mark verified-fixed feedback as resolved.
 *
 * WHY THIS EXISTS: no MCP tool can set `resolved`. `triage_feedback` only sets
 * 'triaged', `answer_feedback` handles needs-info, and `manage_my_feedback` hides
 * or deletes your OWN rows. Status transitions live in FeedbackTriageService,
 * reachable only from the SysAdmin screen — so closing items out in bulk means
 * either N clicks or this. Same shape as scope043-restamp-wxperts-feedback.ts.
 *
 * SCOPE: exactly the four IDs below, each verified against current code on
 * 2026-08-03 — not a heuristic sweep. Measured that day: 93 rows in the sink,
 * 0 resolved, 0 declined. Nothing had ever been closed.
 *
 * Idempotent: rows already resolved are left alone and reported as skipped.
 * Env: DATABASE_URL (points at PRODUCTION). Pass --dry-run to report only.
 */
import { Client } from "pg";
import { config } from "dotenv";

config();

/** Each entry records the evidence that closed it, so the audit trail is readable. */
const VERIFIED_FIXED: Array<{ id: string; title: string; evidence: string }> = [
  {
    id: "493ef493-3622-4a58-8963-21d5980b79fe",
    title: "Kit command stubs call removed tool project.get_command_prompt",
    evidence:
      "project.get_command_prompt is exposed in mcp-server/src/auth/role-checker.ts and is used by implement Phase 4.",
  },
  {
    id: "9cd91ed8-a5d0-4435-8709-450c54887d09",
    title: "Kit v1.7.32 omits shared/ — @wxkanban/preflight unresolvable",
    evidence: "shared/ is present in the published wxKanban-agent-Orchestrator repo (v1.7.44).",
  },
  {
    id: "3c171d00-da16-4ad1-abc3-096cb388638c",
    title: "Kit v1.7.34 template ships vulnerable nodemailer ^8.0.5 and esbuild ^0.28.0",
    evidence:
      "Kit root manifest now nodemailer ^9.0.3, esbuild ^0.28.1. nodemailer appears only in the root manifest, so the three-manifest regression trap does not apply to it.",
  },
  {
    id: "cd77cc2e-0f40-4be1-929c-bf753ccc1437",
    title: "project.implement is dead code — artifactDir hard-coded to undefined",
    evidence:
      "mcp-server/src/server.ts now sources tasks from projecttasks via scoped.selectScoped; the hard-coded artifactDir path is described in past tense in the handler comment.",
  },
];

function clean(u: string): string {
  try {
    const p = new URL(u);
    p.searchParams.delete("sslmode");
    p.searchParams.delete("ssl");
    return p.toString();
  } catch {
    return u;
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const ids = VERIFIED_FIXED.map((f) => f.id);

  const c = new Client({ connectionString: clean(dbUrl), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows: before } = await c.query<{ id: string; status: string; title: string }>(
      `SELECT id, status, title FROM feedbacksubmissions WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    const found = new Set(before.map((r) => r.id));
    for (const f of VERIFIED_FIXED) {
      const row = before.find((r) => r.id === f.id);
      if (!row) {
        console.log(`MISSING  ${f.id}  (not in feedbacksubmissions — refusing to invent it)`);
      } else if (row.status === "resolved") {
        console.log(`SKIP     ${f.id}  already resolved`);
      } else {
        console.log(`RESOLVE  ${f.id}  ${row.status} -> resolved  | ${row.title.slice(0, 70)}`);
      }
    }

    const actionable = before.filter((r) => r.status !== "resolved").map((r) => r.id);
    if (actionable.length === 0) {
      console.log("\nNothing to do.");
      return;
    }
    if (dryRun) {
      console.log(`\n--dry-run: would resolve ${actionable.length} row(s). No write performed.`);
      return;
    }

    // Guard: only ever touches the explicit id list, never a predicate that could widen.
    const { rowCount } = await c.query(
      `UPDATE feedbacksubmissions
          SET status = 'resolved', updatedat = now()
        WHERE id = ANY($1::uuid[])
          AND status <> 'resolved'`,
      [actionable],
    );
    console.log(`\nResolved ${rowCount} row(s).`);
    if (found.size !== ids.length) {
      console.log(`NOTE: ${ids.length - found.size} id(s) were not found and were skipped.`);
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
