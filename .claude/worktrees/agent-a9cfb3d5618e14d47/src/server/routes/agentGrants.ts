/**
 * Project agent grants — the per-project checkbox. SCOPE-134 / T027.
 *
 * Admin-only to change, and mounted on its own path rather than added to
 * `PATCH /api/projects/:id`, which is open to ANY authenticated company user. Granting an
 * agent access to a project is a security decision, not a project field.
 *
 * Follows the testing-settings precedent: `guardProject` first, so a project in another
 * company is reported as 404 rather than 403 and the status cannot be used to confirm
 * that an id exists elsewhere.
 *
 * SPEC-145 adds "Allow remote" beside it: `PUT /:projectId/remote-access`, for a company
 * ADMIN or the project's TEAM_MANAGER, audited (SCOPE-132 Amendment B, FR-036).
 *
 * SPEC-154 adds the Autopilot switch beside both: `PUT /:projectId/autopilot`, same actor
 * rule, refused while Allow remote is off (SCOPE-132 Amendment H, FR-001).
 */
import { Router, Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { db } from "../../db/client.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { projectRemoteAccessService } from "../services/ProjectRemoteAccessService.js";
import { projectAutopilotService } from "../services/ProjectAutopilotService.js"; // [SCOPE 154 / T002]
import { consultingCompaniesReaching } from "../lib/agentReach.js"; // [SCOPE 152 / T010]
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("agent-grant-routes");

// [SCOPE 134 / T027] BEGIN — agent grant routes
// MODIFIED-BY: [SCOPE 145 / T002] — agent-access also returns allowRemote and canManageRemote
const agentNameSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

/** A project in another company is missing, never forbidden. */
async function guardProject(req: AuthRequest, res: Response, projectId: string): Promise<boolean> {
  if (!req.companyid) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const [row] = await db
    .select({ id: companyprojects.id })
    .from(companyprojects)
    .where(and(eq(companyprojects.id, projectId), eq(companyprojects.companyid, req.companyid)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return false;
  }
  return true;
}

function isAdmin(req: AuthRequest): boolean {
  return req.usertype === "ADMIN";
}

/**
 * GET /api/projects/:projectId/agent-access
 *
 * Returns every agent the COMPANY has a token for, each flagged with whether this project
 * is granted. Returning the roster rather than just the grants is what lets the UI render
 * a checkbox per agent — a list of grants alone cannot show an unticked box.
 */
router.get(
  "/:projectId/agent-access",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    try {
      // MODIFIED-BY: [SCOPE 152 / T008, T010] — no per-Project tick; who can reach it instead (FR-069, FR-072)
      // MODIFIED-BY: [SCOPE 154 / T002] — also returns autopilotEnabled (FR-001)
      const [project, canManageRemote, reachableBy, autopilotProject] = await Promise.all([
        projectRemoteAccessService.project(projectId),
        projectRemoteAccessService.canManage(projectId, {
          userid: req.userid as string,
          usertype: req.usertype,
        }),
        consultingCompaniesReaching(projectId),
        projectAutopilotService.project(projectId),
      ]);
      return res.json({
        // SPEC-145 FR-002: the switch and whether this user may change it, decided here.
        allowRemote: project?.allowremote ?? false,
        canManageRemote,
        // SPEC-152 FR-072: consulting companies with a live whole-Project assignment on an
        // active engagement. Companies only, never people.
        reachableBy,
        // SPEC-154 FR-001: same canManage rule as remote, so no separate canManageAutopilot.
        autopilotEnabled: autopilotProject?.autopilotenabled ?? false,
      });
    } catch (err) {
      logger.error({ err, projectId }, "failed to read agent access");
      return res.status(500).json({ error: "failed to read agent access" });
    }
  },
);

/** PUT /api/projects/:projectId/agent-access/:agentname — tick the box. Admin only. */
router.put(
  "/:projectId/agent-access/:agentname",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Only an administrator can change agent access" });
    }
    const parsed = agentNameSchema.safeParse(String(req.params.agentname));
    if (!parsed.success) return res.status(400).json({ error: "invalid agent name" });
    // MODIFIED-BY: [SCOPE 152 / T008] — the per-Project tick is retired (FR-069)
    return res.status(410).json({
      error: "use_signin",
      message: "Per-project agent ticks are retired. K.A.I.N. reaches what its signed-in person reaches; use Allow remote.",
    });
  },
);

/**
 * DELETE /api/projects/:projectId/agent-access/:agentname — untick. Admin only.
 *
 * Takes effect on the agent's NEXT call: the grant is re-read every time rather than
 * cached, so an agent already working stops rather than finishing what it started.
 */
router.delete(
  "/:projectId/agent-access/:agentname",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Only an administrator can change agent access" });
    }
    const parsed = agentNameSchema.safeParse(String(req.params.agentname));
    if (!parsed.success) return res.status(400).json({ error: "invalid agent name" });
    // MODIFIED-BY: [SCOPE 152 / T008] — the per-Project tick is retired (FR-069)
    return res.status(410).json({
      error: "use_signin",
      message: "Per-project agent ticks are retired. Turn Allow remote off to stop K.A.I.N. on this project.",
    });
  },
);
// [SCOPE 134 / T027] END

// [SCOPE 145 / T002] BEGIN — "Allow remote" route (FR-002; SOC 2 CC6.3, CC7.2)
const remoteAccessSchema = z.object({ allowRemote: z.boolean() }).strict();

/**
 * PUT /api/projects/:projectId/remote-access  { allowRemote }
 *
 * A company ADMIN, or a TEAM_MANAGER on this project. The project must be the caller's
 * company's (404 otherwise, as above). A change writes one audit row; the same value again
 * changes and records nothing.
 */
router.put(
  "/:projectId/remote-access",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    const parsed = remoteAccessSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid request", detail: "Body is { allowRemote: boolean }." });
    }
    try {
      const actor = { userid: req.userid as string, usertype: req.usertype };
      if (!(await projectRemoteAccessService.canManage(projectId, actor))) {
        return res.status(403).json({
          error: "forbidden",
          message: "Only a company ADMIN or this project's TEAM_MANAGER can change Allow remote.",
        });
      }
      const project = await projectRemoteAccessService.project(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const result = await projectRemoteAccessService.setAllowRemote(project, parsed.data.allowRemote, actor.userid);
      logger.info({ projectId, allowRemote: result.allowRemote, changed: result.changed }, "allow remote set");
      return res.json(result);
    } catch (err) {
      logger.error({ err, projectId }, "failed to set allow remote");
      return res.status(500).json({ error: "failed to set allow remote" });
    }
  },
);
// [SCOPE 145 / T002] END

// [SCOPE 154 / T002] BEGIN — Autopilot switch route (FR-001; SOC 2 CC6.3, CC7.2)
const autopilotSchema = z.object({ autopilotEnabled: z.boolean() }).strict();

/**
 * PUT /api/projects/:projectId/autopilot  { autopilotEnabled }
 *
 * Same actor rule as "Allow remote": a company ADMIN, or a TEAM_MANAGER on this project.
 * Refused with 400 when turning it on while Allow remote is off. A change writes one audit
 * row; the same value again changes and records nothing.
 */
router.put(
  "/:projectId/autopilot",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    const parsed = autopilotSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid request", detail: "Body is { autopilotEnabled: boolean }." });
    }
    try {
      const actor = { userid: req.userid as string, usertype: req.usertype };
      if (!(await projectAutopilotService.canManage(projectId, actor))) {
        return res.status(403).json({
          error: "forbidden",
          message: "Only a company ADMIN or this project's TEAM_MANAGER can change Autopilot.",
        });
      }
      const project = await projectAutopilotService.project(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const result = await projectAutopilotService.setAutopilotEnabled(project, parsed.data.autopilotEnabled, actor.userid);
      if ("error" in result) {
        // [SCOPE 154 / T012] FR-012: release gate closed — not yet exposable in any environment.
        const message =
          result.error === "release_gate_closed"
            ? "Autopilot is not yet available in this environment."
            : "Turn Allow remote on before enabling Autopilot.";
        return res.status(400).json({ error: result.error, message });
      }
      logger.info({ projectId, autopilotEnabled: result.autopilotEnabled, changed: result.changed }, "autopilot set");
      return res.json(result);
    } catch (err) {
      logger.error({ err, projectId }, "failed to set autopilot");
      return res.status(500).json({ error: "failed to set autopilot" });
    }
  },
);
// [SCOPE 154 / T002] END

export default router;
