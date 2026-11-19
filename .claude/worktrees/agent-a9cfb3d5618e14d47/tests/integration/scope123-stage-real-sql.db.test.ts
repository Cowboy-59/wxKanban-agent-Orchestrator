// SCOPE-123 T014 — every per-scope stage statement executed against a REAL Postgres.
//
// The kit's unit tests (wxkanban-agent/tests/unit/stage) prove the rules against an in-memory fake
// that checks SQL by shape. Shape tests cannot catch a bad cast, a jsonb param, or a uuid[] binding
// — the class of bug that shipped the Consultant Dashboard 500 twice. This file runs the real SQL.
//
// SAFETY: everything runs inside ONE transaction that is ALWAYS rolled back; the service's own
// "transactions" become SAVEPOINTs, so nothing can commit. A second connection then asserts that
// nothing persisted. Opt-in only: TEST_DATABASE_URL, or SPEC123_REAL_SQL=1 to use DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import * as stage from "../../wxkanban-agent/core/stage/scope-stage";
import { enforceTool } from "../../wxkanban-agent/core/policy/adapters/mcp-adapter";
import type { ScopeGateChecker, StageDb, StageQueryClient } from "../../wxkanban-agent/core/stage/scope-stage";

loadEnv({ quiet: true });

const url = (process.env.TEST_DATABASE_URL ?? (process.env.SPEC123_REAL_SQL === "1" ? process.env.DATABASE_URL : undefined))
  ?.trim()
  .replace(/[?&]sslmode=[^&]*/, "");
const suite = url ? describe : describe.skip;
const ssl = url && !url.includes("localhost") ? { rejectUnauthorized: false } : false;

const clear: ScopeGateChecker = async () => ({ passed: true, skipped: false, itemCount: 1, blocking: [] });
const advanceOpts = { gates: clear, actor: "scope123-real-sql-test", source: "test", trigger: "task_status" };

suite("SCOPE-123 — per-scope stage SQL against a real database (rolled back)", () => {
  const client = new pg.Client({ connectionString: url, ssl });
  let savepoint = 0;
  const query: StageQueryClient["query"] = async <T,>(sql: string, params?: unknown[]) =>
    (await client.query(sql, params)) as unknown as { rows: T[] };
  const db: StageDb = {
    query,
    transaction: async <T,>(fn: (tx: StageQueryClient) => Promise<T>): Promise<T> => {
      const name = `sp_${++savepoint}`;
      await client.query(`SAVEPOINT ${name}`);
      try {
        const result = await fn({ query });
        await client.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw err;
      }
    },
  };
  let project = "";
  let A = "";
  let B = "";
  let C = "";
  let tasks: string[] = [];

  beforeAll(async () => {
    await client.connect();
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '20s'`);
    await client.query(`SET LOCAL lock_timeout = '3s'`);
    project = (await client.query(`SELECT id FROM companyprojects LIMIT 1`)).rows[0].id;
    const mk = async (num: string) =>
      (await client.query(
        `INSERT INTO projectspecifications (projectid, specnumber, title, content, status)
         VALUES ($1, $2, $3, 'scope123 real-sql test', 'planned') RETURNING id`,
        [project, num, `SCOPE-123 real-sql test ${num}`],
      )).rows[0].id as string;
    A = await mk("Z9123A");
    B = await mk("Z9123B");
    C = await mk("091234");
    tasks = (await client.query(
      `INSERT INTO projecttasks (projectid, specid, name, status)
       VALUES ($1, $2, 'rt t1', 'todo'), ($1, $2, 'rt t2', 'todo') RETURNING id`,
      [project, A],
    )).rows.map((r: { id: string }) => r.id);
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
    const check = new pg.Client({ connectionString: url, ssl });
    await check.connect();
    const left = (await check.query(
      `SELECT count(*)::int AS n FROM projectspecifications WHERE specnumber IN ('Z9123A','Z9123B','091234') AND title LIKE 'SCOPE-123 real-sql test%'`,
    )).rows[0].n;
    const events = (await check.query(`SELECT count(*)::int AS n FROM events WHERE actor = 'scope123-real-sql-test'`)).rows[0].n;
    await check.end();
    expect(left).toBe(0);
    expect(events).toBe(0);
  });

  it("finds scopes by text, by numeric value past non-numeric rows, and by id", async () => {
    expect((await stage.findScopeByRef(db, project, { specNumber: "Z9123A" }))?.id).toBe(A);
    expect((await stage.findScopeByRef(db, project, { specNumber: "91234" }))?.id).toBe(C);
    expect((await stage.findScopeByRef(db, project, { specId: B }))?.specNumber).toBe("Z9123B");
  });

  it("advances Design -> Implementation, writing implicit Design history, the open row and a jsonb event", async () => {
    const result = await stage.advanceScope(db, A, advanceOpts);
    expect(result.steps.map((s) => s.to)).toEqual(["Implementation"]);
    const rows = (await client.query(
      `SELECT phase, exitedat IS NULL AS open FROM specificationphases WHERE specificationid = $1 ORDER BY enteredat`,
      [A],
    )).rows;
    expect(rows).toEqual([{ phase: "Design", open: false }, { phase: "Implementation", open: true }]);
    const ev = (await client.query(
      `SELECT type, metadata->>'to' AS to FROM events WHERE metadata->>'specId' = $1`,
      [A],
    )).rows;
    expect(ev).toEqual([{ type: "stage_transition", to: "Implementation" }]);
    expect(await stage.scopeIdsForTasks(db, tasks)).toEqual([A]);
  });

  it("cascades to Release when the last task closes and every gate is clear, rows strictly ordered", async () => {
    await client.query(`UPDATE projecttasks SET status = 'done' WHERE id = ANY($1::uuid[])`, [tasks]);
    const result = await stage.advanceScope(db, A, advanceOpts);
    expect(result.endStage).toBe("Release");
    const history = await stage.readStageHistory(db, A);
    expect(history.map((h) => h.phase)).toEqual(["Design", "Implementation", "QA", "HumanTesting", "Beta", "Release"]);
    const counts = (await client.query(
      `SELECT count(*)::int AS n, count(DISTINCT enteredat)::int AS d, count(*) FILTER (WHERE exitedat IS NULL)::int AS o
         FROM specificationphases WHERE specificationid = $1`,
      [A],
    )).rows[0];
    expect(counts.o).toBe(1);
    expect(counts.d).toBe(counts.n);
  });

  it("refuses an illegal skip and writes nothing", async () => {
    await expect(
      db.transaction((tx) => stage.writeTransition(tx, { scopeId: B, from: "Design" as never, to: "QA" as never })),
    ).rejects.toBeInstanceOf(stage.IllegalTransitionError);
    expect((await client.query(`SELECT count(*)::int AS n FROM specificationphases WHERE specificationid = $1`, [B])).rows[0].n).toBe(0);
  });

  it("computes the rollup the same way singly and batched", async () => {
    const single = await stage.resolveProjectRollupStage(db, project);
    const batched = await stage.resolveRollupStages(db, [project]);
    expect(batched.get(project)).toBe(single);
  });

  it("backfills idempotently", async () => {
    const plan = (await stage.planBackfill(db, project, clear)).filter((p) => p.scopeId === B);
    expect(plan[0]).toMatchObject({ action: "write", stage: "Design" });
    expect((await stage.applyBackfill(db, project, plan, { actor: "scope123-real-sql-test", source: "test" }))[0]?.outcome).toBe("written");
    expect((await stage.applyBackfill(db, project, plan, { actor: "scope123-real-sql-test", source: "test" }))[0]?.outcome).toBe("skipped-tracked");
    expect((await stage.planBackfill(db, project, clear)).find((p) => p.scopeId === B)?.action).toBe("skip-tracked");
  });

  it("gates MCP tool calls on the named scope's stage", async () => {
    const denied = await enforceTool(db, project, "project.implement", { args: { specNumber: "Z9123A" } });
    expect(denied.allowed).toBe(false);
    expect(denied.refusal?.code).toBe("STAGE_DENIED");
    // Amendment C, decision 10: createspecs re-pushes in any stage.
    const allowed = await enforceTool(db, project, "project.create_specs", { args: { specNumber: "Z9123A" } });
    expect(allowed.allowed).toBe(true);
  });

  it("judges an untracked scope on its inferred stage and writes nothing (Amendment C, decision 9)", async () => {
    const d = (await client.query(
      `INSERT INTO projectspecifications (projectid, specnumber, title, content, status)
       VALUES ($1, 'Z9123D', 'SCOPE-123 real-sql test Z9123D', 'scope123 real-sql test', 'implementing') RETURNING id`,
      [project],
    )).rows[0].id as string;
    await client.query(`INSERT INTO projecttasks (projectid, specid, name, status) VALUES ($1, $2, 'rt d1', 'todo')`, [project, d]);
    await client.query(
      `INSERT INTO projectdocuments (projectid, specid, doctype, title, content) VALUES ($1, $2, 'spec', 'rt doc', 'x')`,
      [project, d],
    );
    const result = await enforceTool(db, project, "project.implement", { args: { specNumber: "Z9123D" } });
    expect(result.allowed).toBe(true);
    expect(result.currentStage).toBe("Implementation");
    expect((await client.query(`SELECT count(*)::int AS n FROM specificationphases WHERE specificationid = $1`, [d])).rows[0].n).toBe(0);
  });

  it("refuses a gated call for another project before reading anything", async () => {
    const result = await enforceTool(db, project, "project.implement", {
      args: { specNumber: "Z9123A" },
      boundProjectId: "00000000-0000-7000-8000-000000000000",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("scope-mismatch");
    expect(result.reason).not.toContain("Z9123A");
  });
});
