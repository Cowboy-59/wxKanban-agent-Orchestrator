#!/usr/bin/env tsx
/**
 * [SCOPE 110 / T006] One-time, idempotent, transactional merge of duplicate
 * auto-captured error records (FR-012).
 *
 * Recomputes each auto row's identity under the FR-008 basis (browser route
 * excluded), groups by (projectid, fingerprint), and merges each group into its
 * EARLIEST record — summed occurrencecount, earliest first-occurrence, latest
 * last-occurrence, most-advanced status, appended internalnotes — writes the
 * recomputed fingerprint onto the survivor, deletes the absorbed rows, and logs
 * every decision. Everything happens in ONE transaction, so a failure leaves the
 * data untouched. Repeatable without harm.
 *
 * MUST run BEFORE the 0053 unique index (applying the constraint to un-merged
 * data fails by design). Run once per target DB (app prod, then hosted MCP) by
 * setting DATABASE_URL for each. Pass --dry-run to report groups without mutating.
 */
import { Client } from "pg";
import { config } from "dotenv";
import { computeErrorFingerprint } from "../src/server/lib/errorFingerprint.js";

config();

interface Row {
  id: string;
  projectid: string;
  status: string;
  details: Record<string, unknown> | null;
  internalnotes: string | null;
  occurrencecount: number;
  firstoccurredat: Date | null;
  lastoccurredat: Date | null;
  createdat: Date;
  errorfingerprint: string | null;
}

// "Most advanced status present in the group" — furthest along the workflow wins.
const STATUS_RANK: Record<string, number> = {
  new: 0,
  triaged: 1,
  needsinfo: 2,
  inprogress: 3,
  declined: 4,
  resolved: 5,
};

function cleanConnectionString(url: string): string {
  try {
    const p = new URL(url);
    p.searchParams.delete("sslmode");
    p.searchParams.delete("ssl");
    return p.toString();
  } catch {
    return url;
  }
}

function fpOf(details: Record<string, unknown> | null): string {
  const d = (details ?? {}) as Record<string, string | undefined>;
  return computeErrorFingerprint({ name: d.name, message: d.message, kind: d.kind, stack: d.stack });
}

const t = (v: Date | null | undefined, fallback: Date): number =>
  (v ? new Date(v) : fallback).getTime();

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const isProduction = process.env.NODE_ENV === "production";
  const client = new Client({
    connectionString: cleanConnectionString(dbUrl),
    ssl: isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query<Row>(
      `SELECT id, projectid, status, details, internalnotes, occurrencecount,
              firstoccurredat, lastoccurredat, createdat, errorfingerprint
       FROM feedbacksubmissions WHERE source = 'auto'`,
    );
    console.log(`auto rows in this DB: ${rows.length}`);

    // Group by projectid + recomputed identity.
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.projectid}::${fpOf(r.details)}`;
      const g = groups.get(key) ?? [];
      g.push(r);
      groups.set(key, g);
    }
    const distinct = groups.size;
    const dupGroups = [...groups.values()].filter((g) => g.length > 1);
    console.log(
      `distinct identities: ${distinct}; groups with duplicates: ${dupGroups.length}`,
    );

    if (dryRun) {
      for (const g of dupGroups) {
        const fp = fpOf(g[0].details);
        console.log(
          `  ${g[0].projectid.slice(0, 8)}/${fp.slice(0, 10)} — ${g.length} rows: ${g
            .map((r) => r.id.slice(0, 8))
            .join(", ")}`,
        );
      }
      console.log(`\n--dry-run — no changes. Post-merge auto rows would be ${distinct}.`);
      return;
    }

    await client.query("BEGIN");
    try {
      let mergedGroups = 0;
      let deleted = 0;
      let recomputed = 0;
      for (const [key, g] of groups) {
        const fp = key.split("::")[1];
        const sorted = g
          .slice()
          .sort((a, b) => t(a.firstoccurredat, a.createdat) - t(b.firstoccurredat, b.createdat));
        const survivor = sorted[0];
        const absorbed = sorted.slice(1);

        if (absorbed.length === 0) {
          // Singleton — rewrite the recomputed fingerprint only if it changed.
          if (survivor.errorfingerprint !== fp) {
            await client.query(
              `UPDATE feedbacksubmissions SET errorfingerprint = $1, updatedat = now() WHERE id = $2`,
              [fp, survivor.id],
            );
            recomputed++;
          }
          continue;
        }

        const sumCount = g.reduce((s, r) => s + (r.occurrencecount ?? 1), 0);
        const firstOcc = g
          .map((r) => r.firstoccurredat ?? r.createdat)
          .reduce((a, b) => (t(a, a) <= t(b, b) ? a : b));
        const lastOcc = g
          .map((r) => r.lastoccurredat ?? r.createdat)
          .reduce((a, b) => (t(a, a) >= t(b, b) ? a : b));
        const status = g
          .map((r) => r.status)
          .reduce((best, s) => ((STATUS_RANK[s] ?? 0) > (STATUS_RANK[best] ?? 0) ? s : best), g[0].status);
        const notes = g.map((r) => r.internalnotes).filter((n): n is string => Boolean(n));
        const mergedNotes = notes.length ? notes.join("\n---\n") : null;

        await client.query(
          `UPDATE feedbacksubmissions
             SET errorfingerprint = $1, occurrencecount = $2, firstoccurredat = $3,
                 lastoccurredat = $4, status = $5, internalnotes = $6, updatedat = now()
           WHERE id = $7`,
          [fp, sumCount, firstOcc, lastOcc, status, mergedNotes, survivor.id],
        );
        await client.query(`DELETE FROM feedbacksubmissions WHERE id = ANY($1::uuid[])`, [
          absorbed.map((r) => r.id),
        ]);
        mergedGroups++;
        deleted += absorbed.length;
        console.log(
          `  merged ${g.length} → survivor ${survivor.id.slice(0, 8)} (count ${sumCount}, status ${status}); deleted ${absorbed
            .map((r) => r.id.slice(0, 8))
            .join(", ")}`,
        );
      }
      await client.query("COMMIT");
      console.log(
        `\nMerge complete: ${mergedGroups} groups merged, ${deleted} rows deleted, ${recomputed} singletons recomputed. Auto rows now ${distinct}.`,
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((e: Error) => {
  console.error(`merge failed: ${e.message}`);
  process.exit(1);
});
