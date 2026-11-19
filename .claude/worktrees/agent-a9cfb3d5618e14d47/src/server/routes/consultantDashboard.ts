import { Router, Response } from "express";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  companyprojects,
  projecttasks,
  projecttimeentries,
  projectusers,
} from "../../db/schema/index.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { serializeDbError } from "../lib/dbError.js";

const router = Router();
const logger = createLogger("consultant-dashboard-routes");

router.use(authenticateToken);
router.use(requireAuth);

// SCOPE BOUNDARY — this is path (c) of plan.md Gate 5. The customer and external-
// connection halves of SPEC-017 (FR-006, FR-007, FR-010..013) are NOT served here
// because the `customers` table they depend on does not exist. Nothing below reads
// or writes a table that is not already live in production.

interface ProjectRow {
  id: string;
  name: string;
  todocount: number;
  inprogresscount: number;
  donecount: number;
  completionpercent: number;
  nextduedate: string | null;
  isoverdue: boolean;
  priority: string;
}

interface AlertRow {
  id: string;
  kind: "overduetask";
  what: string;
  where: string;
  actionlabel: string;
  actionhref: string;
}

// [SCOPE 017 / T047] BEGIN — Midnight boundary for "today"
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Monday 00:00 of the current week
function startOfWeek(): Date {
  const d = startOfToday();
  const dow = d.getDay(); // 0 = Sunday
  const delta = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - delta);
  return d;
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — First instant of the current billing period
function startOfPeriod(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Exclusive upper bound of the billing period
function endOfPeriod(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}
// [SCOPE 017 / T047] END

// [SCOPE 017 / T047] BEGIN — Consultant Dashboard summary (FR-001, FR-004, FR-008)
// MODIFIED-BY: [SCOPE 017 / T147] — the two project-id filters used
// sql`= ANY(${projectids})`, which 500'd for every consultant who had at least
// one project. Replaced with inArray().
//
// One endpoint, one round trip. The design (specs/017-consultant-dashboard/page.md)
// budgets 3 seconds for the whole screen, so the ledger, the project list and the
// exceptions band are assembled here rather than by four separate client queries.
router.get("/dashboard", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const today = startOfToday();
    const weekStart = startOfWeek();
    const periodStart = startOfPeriod();
    const periodEnd = endOfPeriod();

    // Bind these as ISO strings, never as Date objects. A `sql` template carries
    // no column type, so drizzle cannot encode a Date and hands it to the driver's
    // string encoder — ERR_INVALID_ARG_TYPE, "Received an instance of Date". The
    // ISO form is an unambiguous instant that Postgres casts against the column.
    // Same root cause as T147: raw JS values in a `sql` template need a type.
    const todayTs = today.toISOString();
    const weekStartTs = weekStart.toISOString();
    const periodStartTs = periodStart.toISOString();
    const periodEndTs = periodEnd.toISOString();

    // Projects the consultant owns or is an active member of. Membership is
    // `removedat IS NULL`; a removed member keeps the row but loses the project.
    const projects = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
      })
      .from(companyprojects)
      .leftJoin(
        projectusers,
        and(
          eq(projectusers.projectid, companyprojects.id),
          eq(projectusers.userid, userid),
          isNull(projectusers.removedat),
        ),
      )
      .where(
        and(
          eq(companyprojects.companyid, companyid),
          eq(companyprojects.status, "ACTIVE"),
          or(eq(companyprojects.userid, userid), sql`${projectusers.id} IS NOT NULL`),
        ),
      )
      .groupBy(companyprojects.id, companyprojects.name);

    const projectids = projects.map((p) => p.id);

    // Task rollup per project. Counts are whole-project — "completion" means the
    // project's progress, not the caller's slice of it. Due dates and overdue
    // flags below are the caller's own, because those drive *their* day.
    const taskStats = projectids.length
      ? await db
          .select({
            projectid: projecttasks.projectid,
            todocount: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'open')::int`,
            inprogresscount: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'in_progress')::int`,
            donecount: sql<number>`COUNT(*) FILTER (WHERE ${projecttasks.status} = 'completed')::int`,
            mineduedate: sql<
              string | null
            >`MIN(${projecttasks.duedate}) FILTER (WHERE ${projecttasks.assignedtoid} = ${userid} AND ${projecttasks.status} <> 'completed')`,
            minepriority: sql<
              string | null
            >`MAX(${projecttasks.priority}) FILTER (WHERE ${projecttasks.assignedtoid} = ${userid} AND ${projecttasks.status} <> 'completed')`,
          })
          .from(projecttasks)
          // inArray, not sql`= ANY(${projectids})`. Drizzle interpolates a JS
          // array into a template as a parenthesised bind-param LIST, so ANY()
          // received a scalar (22P02) or a row constructor (42809), never an
          // array. Guarded by tests/unit/consultantDashboardQuery.test.ts.
          .where(inArray(projecttasks.projectid, projectids))
          .groupBy(projecttasks.projectid)
      : [];

    const statsById = new Map(taskStats.map((s) => [s.projectid, s]));
    const todayIso = today.toISOString().slice(0, 10);

    const projectRows: ProjectRow[] = projects
      .map((p) => {
        const s = statsById.get(p.id);
        const todo = s?.todocount ?? 0;
        const inprog = s?.inprogresscount ?? 0;
        const done = s?.donecount ?? 0;
        const total = todo + inprog + done;
        const nextduedate = s?.mineduedate ?? null;
        return {
          id: p.id,
          name: p.name,
          todocount: todo,
          inprogresscount: inprog,
          donecount: done,
          completionpercent: total === 0 ? 0 : Math.round((done / total) * 100),
          nextduedate,
          isoverdue: nextduedate !== null && nextduedate < todayIso,
          priority: s?.minepriority ?? "medium",
        };
      })
      // Anything overdue floats to the top; otherwise least-complete first,
      // because a project at 12% needs the attention a project at 95% does not.
      .sort((a, b) => {
        if (a.isoverdue !== b.isoverdue) return a.isoverdue ? -1 : 1;
        return a.completionpercent - b.completionpercent;
      });

    // Time ledger. `duration` is MINUTES and is NULL while a timer is running,
    // so a running entry contributes nothing until it is stopped.
    const [ledger] = await db
      .select({
        todayminutes: sql<number>`COALESCE(SUM(${projecttimeentries.duration}) FILTER (WHERE ${projecttimeentries.starttime} >= ${todayTs}), 0)::int`,
        todayentrycount: sql<number>`COUNT(*) FILTER (WHERE ${projecttimeentries.starttime} >= ${todayTs} AND ${projecttimeentries.duration} IS NOT NULL)::int`,
        weekminutes: sql<number>`COALESCE(SUM(${projecttimeentries.duration}) FILTER (WHERE ${projecttimeentries.starttime} >= ${weekStartTs}), 0)::int`,
        weekbillableminutes: sql<number>`COALESCE(SUM(${projecttimeentries.duration}) FILTER (WHERE ${projecttimeentries.starttime} >= ${weekStartTs} AND ${projecttimeentries.billable}), 0)::int`,
        periodearnings: sql<string>`COALESCE(SUM((${projecttimeentries.duration}::numeric / 60) * COALESCE(${projecttimeentries.entryrate}, 0)) FILTER (WHERE ${projecttimeentries.billable} AND ${projecttimeentries.starttime} >= ${periodStartTs} AND ${projecttimeentries.starttime} < ${periodEndTs}), 0)::text`,
        periodbillableminutes: sql<number>`COALESCE(SUM(${projecttimeentries.duration}) FILTER (WHERE ${projecttimeentries.billable} AND ${projecttimeentries.starttime} >= ${periodStartTs} AND ${projecttimeentries.starttime} < ${periodEndTs}), 0)::int`,
        unbilledminutes: sql<number>`COALESCE(SUM(${projecttimeentries.duration}) FILTER (WHERE ${projecttimeentries.billable} AND NOT ${projecttimeentries.invoiced}), 0)::int`,
      })
      .from(projecttimeentries)
      .where(
        and(
          eq(projecttimeentries.userid, userid),
          eq(projecttimeentries.companyid, companyid),
        ),
      );

    // Overdue work assigned to the caller — the exceptions band's only source in
    // path (c). Connection failures join it once the connection tables exist.
    const overdue = projectids.length
      ? await db
          .select({
            id: projecttasks.id,
            name: projecttasks.name,
            duedate: projecttasks.duedate,
            projectname: companyprojects.name,
          })
          .from(projecttasks)
          .innerJoin(companyprojects, eq(companyprojects.id, projecttasks.projectid))
          .where(
            and(
              eq(projecttasks.assignedtoid, userid),
              sql`${projecttasks.duedate} IS NOT NULL`,
              sql`${projecttasks.duedate} < ${todayIso}`,
              sql`${projecttasks.status} <> 'completed'`,
              inArray(projecttasks.projectid, projectids), // see the note on the rollup query above
            ),
          )
          .orderBy(projecttasks.duedate)
          .limit(5)
      : [];

    const alerts: AlertRow[] = overdue.map((t) => ({
      id: t.id,
      kind: "overduetask" as const,
      what: t.name,
      where: `${t.projectname} · due ${t.duedate ?? ""}`,
      actionlabel: "Open in Work Hub",
      actionhref: "/dashboard/work-hub",
    }));

    // The rate is a per-entry snapshot (entryrate), not a single company figure,
    // so a fixed "$145/hr" would be a fiction. Report the blended rate actually
    // earned this period, or null when nothing billable was logged.
    const periodEarningsNum = Number(ledger?.periodearnings ?? 0);
    const periodBillableMin = ledger?.periodbillableminutes ?? 0;
    const avghourlyrate =
      periodBillableMin > 0
        ? Math.round((periodEarningsNum / (periodBillableMin / 60)) * 100) / 100
        : null;

    res.json({
      todayminutes: ledger?.todayminutes ?? 0,
      todayentrycount: ledger?.todayentrycount ?? 0,
      weekminutes: ledger?.weekminutes ?? 0,
      weekbillableminutes: ledger?.weekbillableminutes ?? 0,
      periodearnings: periodEarningsNum,
      avghourlyrate,
      unbilledminutes: ledger?.unbilledminutes ?? 0,
      periodstart: periodStart.toISOString().slice(0, 10),
      periodend: new Date(periodEnd.getTime() - 86400000).toISOString().slice(0, 10),
      projects: projectRows,
      alerts,
    });
  } catch (error) {
    logger.error(
      { err: serializeDbError(error) },
      "Failed to build consultant dashboard summary",
    );
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});
// [SCOPE 017 / T047] END

export default router;
