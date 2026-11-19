import { Router, Response } from "express";
import { db } from "../../db/client.js";
import { companythemeprofiles } from "../../db/schema/companythemeprofile.js";
import { projectthemes } from "../../db/schema/projecttheme.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { eq, and } from "drizzle-orm";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLogger } from "../lib/logger.js";
import { v7 as uuidv7 } from "uuid";
import { projectThemeSchema, parseAppType } from "./projectTheme.js";
import type { ProjectTheme } from "../../shared/theme-tokens.js";

const router = Router();
const logger = createLogger("company-theme-profiles-routes");

// GET /api/admin/theme-profiles — list this company's ≤3 theme profiles.
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
          id: companythemeprofiles.id,
          apptype: companythemeprofiles.apptype,
          theme: companythemeprofiles.theme,
          updatedat: companythemeprofiles.updatedat,
        })
        .from(companythemeprofiles)
        .where(eq(companythemeprofiles.companyid, companyId));
      return res.json({ profiles: rows });
    } catch (err) {
      logger.error({ err, companyId }, "Failed to list company theme profiles");
      return res.status(500).json({ error: "Failed to list theme profiles" });
    }
  },
);

// POST /api/admin/theme-profiles — upsert the company default theme for an app type
// (the "save as company theme" action). Body: { appType, theme }.
router.post(
  "/",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const apptype = parseAppType(req.body?.appType);
    const parsed = projectThemeSchema.safeParse(req.body?.theme);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid theme payload", details: parsed.error.issues });
    }
    try {
      const [profile] = await db
        .insert(companythemeprofiles)
        .values({
          id: uuidv7(),
          companyid: companyId,
          apptype,
          theme: parsed.data as ProjectTheme,
          createdbyid: userId ?? null,
        })
        .onConflictDoUpdate({
          target: [companythemeprofiles.companyid, companythemeprofiles.apptype],
          set: { theme: parsed.data as ProjectTheme, createdbyid: userId ?? null, updatedat: new Date() },
        })
        .returning({ id: companythemeprofiles.id, apptype: companythemeprofiles.apptype, updatedat: companythemeprofiles.updatedat });
      logger.info({ companyId, apptype }, "Company theme profile upserted");
      return res.json({ profile });
    } catch (err) {
      logger.error({ err, companyId, apptype }, "Failed to save company theme profile");
      return res.status(500).json({ error: "Failed to save theme profile" });
    }
  },
);

// POST /api/admin/theme-profiles/promote — promote a project's theme (for an app
// type) to the company-wide default. Body: { projectId, appType }. Tenant-guarded.
router.post(
  "/promote",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const projectId = String(req.body?.projectId ?? "").trim();
    const apptype = parseAppType(req.body?.appType);
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
    try {
      const [project] = await db
        .select({ id: companyprojects.id })
        .from(companyprojects)
        .where(and(eq(companyprojects.id, projectId), eq(companyprojects.companyid, companyId)))
        .limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const [src] = await db
        .select({ theme: projectthemes.theme })
        .from(projectthemes)
        .where(and(eq(projectthemes.projectid, projectId), eq(projectthemes.apptype, apptype)))
        .limit(1);
      if (!src?.theme) {
        return res.status(400).json({ error: `Project has no ${apptype} theme to promote.` });
      }

      const [profile] = await db
        .insert(companythemeprofiles)
        .values({
          id: uuidv7(),
          companyid: companyId,
          apptype,
          theme: src.theme,
          createdbyid: userId ?? null,
        })
        .onConflictDoUpdate({
          target: [companythemeprofiles.companyid, companythemeprofiles.apptype],
          set: { theme: src.theme, createdbyid: userId ?? null, updatedat: new Date() },
        })
        .returning({ id: companythemeprofiles.id, apptype: companythemeprofiles.apptype });
      logger.info({ companyId, projectId, apptype }, "Promoted project theme to company-wide");
      return res.json({ profile });
    } catch (err) {
      logger.error({ err, companyId, projectId }, "Failed to promote theme");
      return res.status(500).json({ error: "Failed to promote theme" });
    }
  },
);

// DELETE /api/admin/theme-profiles/:apptype — clear the company default for a type.
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
        .delete(companythemeprofiles)
        .where(
          and(
            eq(companythemeprofiles.companyid, companyId),
            eq(companythemeprofiles.apptype, apptype),
          ),
        );
      return res.json({ cleared: apptype });
    } catch (err) {
      logger.error({ err, companyId, apptype }, "Failed to clear company theme profile");
      return res.status(500).json({ error: "Failed to clear theme profile" });
    }
  },
);

export default router;
