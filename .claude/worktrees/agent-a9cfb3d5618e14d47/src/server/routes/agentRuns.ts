/**
 * Agent run records — SPEC-143 (FR-002, FR-014, FR-017).
 *
 * Mounted at /api/consultant-hub/agent-runs, ahead of the consultant-hub router (app.ts).
 *
 * Who bills a run (FR-017, Amendment A / D2): the server sets agentruns.companyid from the
 * credential that sent the run — the JWT's company, or the company a project API token was
 * issued for — and ignores any companyid in the body. The run's project must be one that
 * company may bill (TimeBillingProjectAccess: its own, or an engaged client project with a live
 * assignment); anything else is 404 and nothing is stored. A project API token is bound to one
 * project and may only send runs for that project (D3).
 *
 * Safety: the body is a strict object (unknown keys rejected) and every string is a short
 * identifier-style value, so there is nowhere to put prompt text or code.
 */
import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { agentruns } from "../../db/schema/agentrun.js";
import { aispecsessions } from "../../db/schema/aispecsession.js";
import { projecttasks } from "../../db/schema/projecttask.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { apiTokenService } from "../services/ApiTokenService.js";
import { TimeBillingProjectAccess } from "../services/TimeBillingProjectAccess.js";
import { NotFoundError } from "../lib/errors.js";
import { verifyToken, extractToken } from "../lib/jwt.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("agent-run-routes");

/** SOC2 CC6.3: writing is open to company staff, reading cost data is management only. */
const WRITE_ROLES: readonly string[] = ["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER", "SYSADMIN"];
const READ_ROLES: readonly string[] = ["ADMIN", "TEAM_MANAGER", "SYSADMIN"];

function hasRole(req: AuthRequest, roles: readonly string[]): boolean {
  return typeof req.usertype === "string" && roles.includes(req.usertype);
}

const label = z.string().regex(/^[A-Za-z0-9._:/@-]{1,100}$/);
const count = z.number().int().min(0).max(2_000_000_000).nullable();
const isoTime = z.string().datetime({ offset: true });

export const agentRunSchema = z.strictObject({
  id: z.uuid(),
  projectid: z.uuid(),
  aispecsessionid: z.uuid().nullable().default(null),
  taskid: z.uuid().nullable().default(null),
  command: label.nullable().default(null),
  kind: z.enum(["session", "subagent", "command"]),
  difficulty: z.enum(["easy", "moderate", "heavy"]).nullable().default(null),
  model: label,
  provider: label,
  route: z.enum(["official"]), // Anthropic only, official client (FR-007, Amendment A)
  inputtokens: count.default(null),
  outputtokens: count.default(null),
  cachereadtokens: count.default(null),
  cachewritetokens: count.default(null),
  activeseconds: count.default(null),
  waitingseconds: count.default(null),
  escalated: z.boolean().default(false),
  comparisonid: z.uuid().nullable().default(null),
  variant: z.enum(["current", "candidate"]).nullable().default(null),
  firstpass: z.boolean().nullable().default(null),
  neverbilled: z.boolean().default(false),
  starttime: isoTime,
  endtime: isoTime.nullable().default(null),
});

const listQuerySchema = z.object({
  projectid: z.uuid(),
  from: isoTime.optional(),
  to: isoTime.optional(),
});

// [SCOPE 143 / T024] BEGIN — billable-project check for agent runs (FR-017)
/** A project the company may not bill is missing, never forbidden (ids reveal nothing). */
async function companyMayBill(companyid: string, projectid: string): Promise<boolean> {
  try {
    await TimeBillingProjectAccess.resolve(companyid, projectid);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
}
// [SCOPE 143 / T024] END

// [SCOPE 143 / T024] BEGIN — JWT or project API token for sending runs (FR-017, D3)
/** The project an API token is bound to, when the request came in on one. */
export const TOKEN_PROJECT = "agentRunTokenProjectId";

/**
 * Accepts the web session (JWT, cookie or header) as authenticateToken does, or a project API
 * token in the Authorization header, the authenticateProjectKitAccess pattern
 * (middleware/projectKitAuth.ts). The token's project is kept in res.locals so the handler can
 * refuse runs for any other project. The token's company must still be its issuer's company.
 */
export async function authenticateRunSender(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const bearer = extractToken(req.headers.authorization);
  if (!bearer) {
    authenticateToken(req, res, next);
    return;
  }
  try {
    verifyToken(bearer);
    authenticateToken(req, res, next);
    return;
  } catch {
    // Not a JWT: try the project API token.
  }
  try {
    const record = await apiTokenService.validateToken(bearer);
    if (!record || (record.expiresat && record.expiresat.getTime() <= Date.now())) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const [user] = await db
      .select({ usertype: userprofiles.usertype, emailaddr: userprofiles.emailaddr, companyid: userprofiles.companyid })
      .from(userprofiles)
      .where(eq(userprofiles.id, record.userid))
      .limit(1);
    if (!user || user.companyid !== record.companyid) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.userid = record.userid;
    req.companyid = record.companyid;
    req.usertype = user.usertype;
    req.email = user.emailaddr;
    res.locals[TOKEN_PROJECT] = record.projectid;
    next();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to validate agent-run token",
    );
    res.status(500).json({ error: "Failed to validate token" });
  }
}
// [SCOPE 143 / T024] END

/**
 * POST /api/consultant-hub/agent-runs — record one run, idempotent by run id.
 */
// [SCOPE 143 / T024] BEGIN — POST: server-set companyid, billable project, token bound to its project (FR-017)
router.post("/", authenticateRunSender, requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!hasRole(req, WRITE_ROLES)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // The billing company comes from the credential, never from the record (FR-017).
    const body: unknown =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? Object.fromEntries(Object.entries(req.body as Record<string, unknown>).filter(([k]) => k !== "companyid"))
        : req.body;
    const parsed = agentRunSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid agent run",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    const run = parsed.data;
    const companyid = req.companyid;

    const tokenProject: unknown = res.locals[TOKEN_PROJECT];
    if (typeof tokenProject === "string" && tokenProject !== run.projectid) {
      res.status(403).json({ error: "API token is scoped to a different project" });
      return;
    }
    if (!(await companyMayBill(companyid, run.projectid))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (run.aispecsessionid) {
      const [session] = await db
        .select({ projectid: aispecsessions.projectid })
        .from(aispecsessions)
        .where(eq(aispecsessions.id, run.aispecsessionid))
        .limit(1);
      if (!session || session.projectid !== run.projectid) {
        res.status(400).json({ error: "aispecsessionid does not belong to the project" });
        return;
      }
    }
    if (run.taskid) {
      const [task] = await db
        .select({ projectid: projecttasks.projectid })
        .from(projecttasks)
        .where(eq(projecttasks.id, run.taskid))
        .limit(1);
      if (!task || task.projectid !== run.projectid) {
        res.status(400).json({ error: "taskid does not belong to the project" });
        return;
      }
    }

    const values = {
      ...run,
      companyid,
      starttime: new Date(run.starttime),
      endtime: run.endtime ? new Date(run.endtime) : null,
    };
    const { id: _id, ...updatable } = values;
    void _id;
    // Re-posting the same id updates the same row, but only for the same project and company,
    // so nobody can overwrite another's record by guessing an id.
    const [saved] = await db
      .insert(agentruns)
      .values(values)
      .onConflictDoUpdate({
        target: agentruns.id,
        set: updatable,
        setWhere: and(eq(agentruns.projectid, run.projectid), eq(agentruns.companyid, companyid)),
      })
      .returning({ id: agentruns.id });

    if (!saved) {
      res.status(409).json({ error: "Run id belongs to another project" });
      return;
    }
    logger.info({ runid: saved.id, projectid: run.projectid, kind: run.kind }, "Agent run recorded");
    res.status(200).json({ success: true, id: saved.id });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to record agent run",
    );
    res.status(500).json({ error: "Failed to record agent run" });
  }
});
// [SCOPE 143 / T024] END

/**
 * GET /api/consultant-hub/agent-runs?projectid&from&to — the caller company's runs for the report.
 */
// [SCOPE 143 / T024] BEGIN — GET: only the caller company's runs (FR-017)
router.get("/", authenticateToken, requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!hasRole(req, READ_ROLES)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "projectid (uuid) is required; from/to must be ISO dates" });
      return;
    }
    const { projectid, from, to } = parsed.data;
    if (!(await companyMayBill(req.companyid, projectid))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const conditions = [eq(agentruns.projectid, projectid), eq(agentruns.companyid, req.companyid)];
    if (from) conditions.push(gte(agentruns.starttime, new Date(from)));
    if (to) conditions.push(lte(agentruns.starttime, new Date(to)));

    const rows = await db
      .select()
      .from(agentruns)
      .where(and(...conditions))
      .orderBy(asc(agentruns.starttime))
      .limit(5000);

    res.status(200).json({
      success: true,
      runs: rows.map((r) => ({
        ...r,
        starttime: r.starttime.toISOString(),
        endtime: r.endtime?.toISOString() ?? null,
        createdat: r.createdat.toISOString(),
      })),
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to read agent runs",
    );
    res.status(500).json({ error: "Failed to read agent runs" });
  }
});
// [SCOPE 143 / T024] END

export default router;
