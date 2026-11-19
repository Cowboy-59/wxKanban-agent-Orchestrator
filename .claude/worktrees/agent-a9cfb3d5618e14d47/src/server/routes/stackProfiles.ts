import { Router, Response } from "express";
import { db } from "../../db/client.js";
import { companystackprofiles } from "../../db/schema/companystackprofile.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { projectdocuments } from "../../db/schema/projectdocuments.js";
import { eq, and, isNull } from "drizzle-orm";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLogger } from "../lib/logger.js";
import { v7 as uuidv7 } from "uuid";
import { parseAppTypeFromStackMarkdown } from "../../shared/stack-defaults.js";

// [SCOPE 057 / T004] BEGIN — router + logger for the company stack-profiles admin API
const router = Router();
const logger = createLogger("stack-profiles-routes");
// [SCOPE 057 / T004] END

// [SCOPE 057 / T004] BEGIN — GET /api/admin/stack-profiles (list the company's ≤3 profiles)
// Tenant-isolated read: only the caller's own companyid (T005). Returns one entry
// per app type that has a profile (web/desktop/mobile).
router.get(
  "/",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    try {
      const rows = await db
        .select({
          id: companystackprofiles.id,
          apptype: companystackprofiles.apptype,
          content: companystackprofiles.content,
          updatedat: companystackprofiles.updatedat,
          createdbyid: companystackprofiles.createdbyid,
        })
        .from(companystackprofiles)
        .where(eq(companystackprofiles.companyid, companyId));
      return res.json({ profiles: rows });
    } catch (err) {
      logger.error({ err, companyId }, "Failed to list company stack profiles");
      return res.status(500).json({ error: "Failed to list stack profiles" });
    }
  },
);
// [SCOPE 057 / T004] END

// [SCOPE 057 / T004] BEGIN — GET /api/admin/stack-profiles/promotable
// Lists this company's projects that have a captured ProjectStack document, so the
// ADMIN can pick which project's stack/style to promote (app type known from the doc).
router.get(
  "/promotable",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    try {
      const rows = await db
        .select({
          projectId: companyprojects.id,
          projectName: companyprojects.name,
          content: projectdocuments.content,
        })
        .from(projectdocuments)
        .innerJoin(companyprojects, eq(projectdocuments.projectid, companyprojects.id))
        .where(
          and(
            eq(companyprojects.companyid, companyId),
            eq(projectdocuments.doctype, "ProjectStack"),
            isNull(projectdocuments.specid),
          ),
        );
      const projects = rows.map((r) => ({
        projectId: r.projectId,
        projectName: r.projectName,
        apptype: parseAppTypeFromStackMarkdown(r.content ?? ""),
      }));
      return res.json({ projects });
    } catch (err) {
      logger.error({ err, companyId }, "Failed to list promotable projects");
      return res.status(500).json({ error: "Failed to list promotable projects" });
    }
  },
);
// [SCOPE 057 / T004] END

// [SCOPE 057 / T002] BEGIN — POST /api/admin/stack-profiles/promote { projectId }
// Promote a project's captured stack/style to the company-wide default for its app
// type. App type is derived from the project's ProjectStack doc; the profile is
// upserted per (companyid, apptype) so re-promoting the same type overwrites in
// place. Non-destructive (T006): writes only companystackprofiles — never any
// project's ProjectStack doc. Tenant-isolated + ADMIN-gated (T005).
router.post(
  "/promote",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const projectId = (req.body?.projectId as string | undefined)?.trim();
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    try {
      // Tenant guard: the project must belong to the caller's company.
      const [project] = await db
        .select({ id: companyprojects.id })
        .from(companyprojects)
        .where(and(eq(companyprojects.id, projectId), eq(companyprojects.companyid, companyId)))
        .limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const [doc] = await db
        .select({ content: projectdocuments.content })
        .from(projectdocuments)
        .where(
          and(
            eq(projectdocuments.projectid, projectId),
            eq(projectdocuments.doctype, "ProjectStack"),
            isNull(projectdocuments.specid),
          ),
        )
        .limit(1);
      if (!doc?.content) {
        return res
          .status(400)
          .json({ error: "Project has no captured Stack & Style to promote." });
      }

      const apptype = parseAppTypeFromStackMarkdown(doc.content);
      if (!apptype) {
        return res
          .status(400)
          .json({ error: "Could not determine the project's application type from its stack." });
      }

      const [profile] = await db
        .insert(companystackprofiles)
        .values({
          id: uuidv7(),
          companyid: companyId,
          apptype,
          content: doc.content,
          createdbyid: userId ?? null,
        })
        .onConflictDoUpdate({
          target: [companystackprofiles.companyid, companystackprofiles.apptype],
          set: { content: doc.content, createdbyid: userId ?? null, updatedat: new Date() },
        })
        .returning({
          id: companystackprofiles.id,
          apptype: companystackprofiles.apptype,
          updatedat: companystackprofiles.updatedat,
        });

      logger.info({ companyId, projectId, apptype }, "Promoted project stack to company-wide");
      return res.json({ profile });
    } catch (err) {
      logger.error({ err, companyId, projectId }, "Failed to promote stack to company-wide");
      return res.status(500).json({ error: "Failed to promote stack" });
    }
  },
);
// [SCOPE 057 / T002] END

// [SCOPE 057 / T004] BEGIN — DELETE /api/admin/stack-profiles/:apptype (clear)
// Clears the company's profile for one app type. Non-destructive to projects (T006):
// only removes the companystackprofiles row. Tenant-isolated + ADMIN-gated (T005).
router.delete(
  "/:apptype",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const apptype = String(req.params.apptype || "").toLowerCase();
    try {
      await db
        .delete(companystackprofiles)
        .where(
          and(
            eq(companystackprofiles.companyid, companyId),
            eq(companystackprofiles.apptype, apptype),
          ),
        );
      return res.json({ cleared: apptype });
    } catch (err) {
      logger.error({ err, companyId, apptype }, "Failed to clear company stack profile");
      return res.status(500).json({ error: "Failed to clear stack profile" });
    }
  },
);
// [SCOPE 057 / T004] END

// [SCOPE 057 / T004] BEGIN — router export
export default router;
// [SCOPE 057 / T004] END
