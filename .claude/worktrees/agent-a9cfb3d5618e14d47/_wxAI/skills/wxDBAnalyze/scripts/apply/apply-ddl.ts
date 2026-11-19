import { classifyStatement, type Classification } from "../core/ddl-classifier.js";
import type { EngineId } from "../core/engine.js";
import type { ApplyMode } from "../core/policy.js";
import { appendLedger, type LedgerEntry } from "./ledger.js";

// [SCOPE 121 / T012] BEGIN — Apply types
export interface PendingStatement {
  sql: string;
  rationale: string;
  findingId: string;
}

export interface ApplyOutcome {
  findingId: string;
  sql: string;
  status: "applied" | "refused" | "skipped" | "failed";
  reason: string;
}

export interface ApplyDeps {
  execute(sql: string): Promise<void>;
  appendLedger(entry: LedgerEntry): Promise<void>;
  now?(): string;
}
// [SCOPE 121 / T012] END

// [SCOPE 121 / T012] BEGIN — Guarded apply
/**
 * Apply pending DDL under the resolved policy.
 *
 * The classification is recomputed HERE. Callers assemble statements from
 * findings, and a finding is model-authored text; trusting a verdict that
 * arrived alongside the statement would make the whitelist advisory. The only
 * classification that gates a write is the one this function derives itself.
 */
export async function applyStatements(opts: {
  engine: EngineId;
  mode: ApplyMode;
  statements: PendingStatement[];
  deps: ApplyDeps;
  approve?: (
    statement: PendingStatement,
    classification: Classification,
  ) => Promise<boolean>;
}): Promise<ApplyOutcome[]> {
  const outcomes: ApplyOutcome[] = [];
  const now = opts.deps.now ?? (() => new Date().toISOString());
  let halted = false;

  for (const statement of opts.statements) {
    if (halted) {
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "skipped",
        reason: "run halted after an earlier statement failed",
      });
      continue;
    }

    if (opts.mode === "manual") {
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "refused",
        reason:
          "policy mode is manual — the statement is emitted for hand " +
          "application and nothing is executed",
      });
      continue;
    }

    const classification = classifyStatement(opts.engine, statement.sql);
    if (classification.class !== "additive-safe") {
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "refused",
        reason: `${classification.class}: ${classification.reason}`,
      });
      continue;
    }

    if (opts.mode === "approve-each") {
      let approved: boolean;
      try {
        approved = opts.approve
          ? await opts.approve(statement, classification)
          : false;
      } catch (error) {
        // A throwing approver means the approval channel itself cannot be
        // trusted — not just for this statement, but for every statement
        // still queued behind it. Continuing to the next one would ask an
        // already-broken mechanism for another verdict. Treat this the same
        // way an execution failure is treated: record it, then halt so the
        // remainder is skipped rather than silently re-attempted.
        const message = error instanceof Error ? error.message : String(error);
        outcomes.push({
          findingId: statement.findingId,
          sql: statement.sql,
          status: "failed",
          reason: `approval callback threw and cannot be trusted: ${message}`,
        });
        halted = true;
        continue;
      }
      if (!approved) {
        outcomes.push({
          findingId: statement.findingId,
          sql: statement.sql,
          status: "skipped",
          reason: opts.approve
            ? "not approved by the operator"
            : "approve-each mode requires an approval callback; none was supplied",
        });
        continue;
      }
    }

    try {
      await opts.deps.execute(statement.sql);
      await opts.deps.appendLedger({
        timestamp: now(),
        sql: statement.sql,
        rationale: statement.rationale,
        findingId: statement.findingId,
        result: "applied",
        mode: opts.mode,
      });
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "applied",
        reason: classification.reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await opts.deps.appendLedger({
        timestamp: now(),
        sql: statement.sql,
        rationale: statement.rationale,
        findingId: statement.findingId,
        result: "failed",
        mode: opts.mode,
      });
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "failed",
        reason: message,
      });
      halted = true;
    }
  }

  return outcomes;
}
// [SCOPE 121 / T012] END

// [SCOPE 121 / T012] BEGIN — Writable connection
/**
 * The single writable connection in this skill. Deliberately separate from the
 * read-only probe path so that "can this code write?" is answerable by looking
 * at which module opened the handle.
 *
 * Transaction mechanism (controller decision, deviating from the brief):
 *
 * The brief's version ran `sql.unsafe(\`begin; ${text}; commit;\`)` — a
 * multi-statement string, which only executes atomically as one round trip
 * under Postgres's SIMPLE query protocol. That is the exact protocol Task 4
 * disabled on the read path (`connect.ts`, `buildReadOnlyConnection`) because
 * it lets several statements ride in one call; reintroducing it here, on the
 * write path, for DDL, is worse.
 *
 * `sql.begin()` was considered and rejected: reading postgres.js's own
 * `begin()` (node_modules/postgres/src/index.js, ~line 234-306) shows it
 * sends an explicit `begin` statement, runs the callback's statements inside
 * that session, then `commit`/`rollback`. Postgres refuses
 * `CREATE INDEX CONCURRENTLY` inside any such explicit transaction block
 * ("CREATE INDEX CONCURRENTLY cannot run inside a transaction block") — and
 * the classifier explicitly whitelists that statement
 * (`ddl-classifier.ts` POSTGRES_RULES: `create (unique )?index concurrently`).
 * Wrapping every apply in `sql.begin()` would make that whitelisted class
 * fail every time it is actually used.
 *
 * Chosen instead: execute the single statement on its own, with no explicit
 * BEGIN/COMMIT sent by this code at all — option (b). Postgres always wraps a
 * lone top-level command in its own implicit transaction: it either fully
 * commits or fully rolls back, which is genuine atomicity for exactly the
 * one statement `classifyStatement` already verified is alone in the string
 * (`isSingleStatement`). Because no explicit `begin` is issued, Postgres does
 * not consider the session to be inside a "transaction block", so
 * `CREATE INDEX CONCURRENTLY` runs the same way it would from `psql` directly
 * — this is the scenario the Postgres docs describe as permitted.
 *
 * `simple: false` is carried over from the read path for the same reason
 * Task 4 set it there: it forces the extended query protocol so a single
 * `sql.unsafe()` call parses exactly one statement, which closes off
 * statement-smuggling via a stray `;` as a second line of defence beneath
 * `classifyStatement`'s own single-statement check.
 */
/**
 * WARNING (SCOPE-121 final wave, I2 — Important): this is a RAW, UNGATED
 * executor. Calling `.execute(sql)` on what this function returns runs `sql`
 * against the live database with no classification, no policy check and no
 * approval step — every one of those gates lives in `applyStatements`
 * (above), which is the ONLY caller this function must ever be reached
 * through. `SKILL.md` §5 states plainly that Phase 1 ships no apply
 * entrypoint at all: nothing in `scripts/cli.ts` imports from this module,
 * so today `createApplyDeps` has no caller in the shipped tool — it exists,
 * fully tested against fake dependencies, for Phase 2 to wire up. An agent
 * asked to "apply this fix" must NOT reach for `createApplyDeps(...).execute(sql)`
 * directly — that bypasses both the classifier and the policy gate. Apply
 * fixes by hand from the report, or route through `applyStatements`.
 */
export async function createApplyDeps(
  url: string,
  ledgerPath: string,
): Promise<ApplyDeps & { close(): Promise<void> }> {
  const { loadPostgresDriver } = await import("../engines/postgres/connect.js");
  const factory = await loadPostgresDriver();
  const sql = factory(url, { prepare: false, max: 1 });

  return {
    async execute(text: string) {
      await sql.unsafe(text, [], { simple: false });
    },
    async appendLedger(entry: LedgerEntry) {
      await appendLedger(ledgerPath, entry);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
// [SCOPE 121 / T012] END
