/**
 * Banner Studio — SysAdmin tracked-links CRUD (SCOPE-070 / SPEC-068)
 *
 * Manage tracked links as a first-class, reusable entity — the same /r/:code works in
 * a banner <a><img>, a plain text link, or an email CTA. All routes require SYSADMIN.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { db } from "../db/client.js";
import { marketinglinks } from "../../db/schema/marketinglinks.js";
import {
  generateLinkCode,
  isAllowedDestinationHost,
  buildRedirectUrl,
} from "../lib/marketing-links.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-links-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 070 / T004] BEGIN — SysAdmin tracked-links CRUD
const createSchema = z.object({
  destinationurl: z.string().url().max(1000),
  campaignid: z.string().uuid().optional(),
  utmsource: z.string().max(80).optional(),
  utmmedium: z.string().max(80).optional(),
  utmcampaign: z.string().max(120).optional(),
});

const updateSchema = z.object({
  destinationurl: z.string().url().max(1000).optional(),
  campaignid: z.string().uuid().optional(),
  utmsource: z.string().max(80).optional(),
  utmmedium: z.string().max(80).optional(),
  utmcampaign: z.string().max(120).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

function withRedirect(row: typeof marketinglinks.$inferSelect) {
  return { ...row, redirectUrl: buildRedirectUrl(row.code) };
}

/** GET /api/sysadmin/marketing/links — list links (with clickcount + redirect URL). */
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, campaignid } = req.query;
    const conds: SQL[] = [];
    if (typeof status === "string")
      conds.push(eq(marketinglinks.status, status));
    if (typeof campaignid === "string")
      conds.push(eq(marketinglinks.campaignid, campaignid));
    const rows = await db
      .select()
      .from(marketinglinks)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(marketinglinks.createdat));
    res.json({ links: rows.map(withRedirect) });
  } catch (err) {
    logger.error({ err }, "list links failed");
    res.status(500).json({ error: "Failed to list links." });
  }
});

/** POST /api/sysadmin/marketing/links — create a standalone tracked link. */
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid link payload." });
    return;
  }
  const d = parsed.data;
  if (!isAllowedDestinationHost(d.destinationurl)) {
    res.status(400).json({ error: "Destination URL host is not allowed." });
    return;
  }
  try {
    let link: typeof marketinglinks.$inferSelect | undefined;
    for (let attempt = 0; attempt < 3 && !link; attempt++) {
      try {
        [link] = await db
          .insert(marketinglinks)
          .values({
            companyid: req.companyid ?? null,
            campaignid: d.campaignid ?? null,
            code: generateLinkCode(),
            destinationurl: d.destinationurl,
            utmsource: d.utmsource ?? null,
            utmmedium: d.utmmedium ?? null,
            utmcampaign: d.utmcampaign ?? null,
            createdbyid: req.userid ?? null,
          })
          .returning();
      } catch (e) {
        if ((e as { cause?: { code?: string } })?.cause?.code === "23505")
          continue;
        throw e;
      }
    }
    if (!link) {
      res.status(500).json({ error: "Failed to allocate a link code." });
      return;
    }
    res.status(201).json({ link: withRedirect(link) });
  } catch (err) {
    logger.error({ err }, "create link failed");
    res.status(500).json({ error: "Failed to create link." });
  }
});

/** GET /api/sysadmin/marketing/links/:id — link detail. */
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(marketinglinks)
      .where(eq(marketinglinks.id, req.params.id));
    if (!row) {
      res.status(404).json({ error: "Link not found." });
      return;
    }
    res.json({ link: withRedirect(row) });
  } catch (err) {
    logger.error({ err }, "get link failed");
    res.status(500).json({ error: "Failed to load link." });
  }
});

/** PATCH /api/sysadmin/marketing/links/:id — update destination/UTM/status. */
router.patch("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid link payload." });
    return;
  }
  const d = parsed.data;
  if (d.destinationurl !== undefined && !isAllowedDestinationHost(d.destinationurl)) {
    res.status(400).json({ error: "Destination URL host is not allowed." });
    return;
  }
  try {
    const [row] = await db
      .update(marketinglinks)
      .set({
        ...(d.destinationurl !== undefined
          ? { destinationurl: d.destinationurl }
          : {}),
        ...(d.campaignid !== undefined ? { campaignid: d.campaignid } : {}),
        ...(d.utmsource !== undefined ? { utmsource: d.utmsource } : {}),
        ...(d.utmmedium !== undefined ? { utmmedium: d.utmmedium } : {}),
        ...(d.utmcampaign !== undefined ? { utmcampaign: d.utmcampaign } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        updatedat: new Date(),
      })
      .where(eq(marketinglinks.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Link not found." });
      return;
    }
    res.json({ link: withRedirect(row) });
  } catch (err) {
    logger.error({ err }, "update link failed");
    res.status(500).json({ error: "Failed to update link." });
  }
});

/** DELETE /api/sysadmin/marketing/links/:id — archive the link. */
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await db
      .update(marketinglinks)
      .set({ status: "archived", updatedat: new Date() })
      .where(eq(marketinglinks.id, req.params.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Link not found." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "archive link failed");
    res.status(500).json({ error: "Failed to archive link." });
  }
});
// [SCOPE 070 / T004] END

export default router;
