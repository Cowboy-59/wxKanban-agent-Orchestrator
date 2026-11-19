// SCOPE-107 / T005 — Block Library routes. A company-scoped collection of named,
// drag-drop-composed block trees. Any member may save; only an ADMIN may rename/delete.
// Tenant-isolated by req.companyid (mirrors themeTemplates.ts).

import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../../db/client.js";
import { themeblocks } from "../../db/schema/themeblock.js";
import { eq, and, desc } from "drizzle-orm";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLogger } from "../lib/logger.js";
import { presignBlockImageUpload } from "../lib/marketing-assets-s3.js";
import { v7 as uuidv7 } from "uuid";
import type { BlockNode } from "../../shared/block-model.js";

const router = Router();
const logger = createLogger("theme-block-routes");

// A block node is a recursive tree; validate the shape loosely (the app owns the format).
const blockNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    props: z.record(z.string(), z.unknown()),
    children: z.array(blockNodeSchema).optional(),
  }),
);
const saveBlockSchema = z.object({
  name: z.string().min(1).max(120),
  block: z.object({ nodes: z.array(blockNodeSchema) }),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// GET /api/themes/blocks — list this company's saved blocks (any member).
router.get(
  "/api/themes/blocks",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    try {
      const blocks = await db
        .select({
          id: themeblocks.id,
          name: themeblocks.name,
          block: themeblocks.block,
          updatedat: themeblocks.updatedat,
        })
        .from(themeblocks)
        .where(eq(themeblocks.companyid, companyId))
        .orderBy(desc(themeblocks.updatedat));
      return res.json({ blocks });
    } catch (err) {
      logger.error({ err, companyId }, "Failed to list blocks");
      return res.status(500).json({ error: "Failed to list blocks" });
    }
  },
);

// POST /api/themes/blocks — save a new named block (any member).
router.post(
  "/api/themes/blocks",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    const userId = req.userid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const parsed = saveBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid block payload", details: parsed.error.issues });
    }
    try {
      const [row] = await db
        .insert(themeblocks)
        .values({
          id: uuidv7(),
          companyid: companyId,
          name: parsed.data.name,
          block: parsed.data.block as { nodes: BlockNode[] },
          createdbyid: userId ?? null,
        })
        .returning({ id: themeblocks.id, name: themeblocks.name });
      logger.info({ companyId, blockId: row?.id }, "Block saved");
      return res.status(201).json({ block: row });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "A block with that name already exists" });
      }
      logger.error({ err, companyId }, "Failed to save block");
      return res.status(500).json({ error: "Failed to save block" });
    }
  },
);

// PATCH /api/themes/blocks/:id — rename (ADMIN only).
router.patch(
  "/api/themes/blocks/:id",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const id = String(req.params.id);
    const name = String(req.body?.name ?? "").trim();
    if (!name || name.length > 120) return res.status(400).json({ error: "valid name required" });
    try {
      const [row] = await db
        .update(themeblocks)
        .set({ name, updatedat: new Date() })
        .where(and(eq(themeblocks.id, id), eq(themeblocks.companyid, companyId)))
        .returning({ id: themeblocks.id, name: themeblocks.name });
      if (!row) return res.status(404).json({ error: "Block not found" });
      return res.json({ renamed: row });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "A block with that name already exists" });
      }
      logger.error({ err, companyId, id }, "Failed to rename block");
      return res.status(500).json({ error: "Failed to rename block" });
    }
  },
);

// DELETE /api/themes/blocks/:id — delete (ADMIN only).
router.delete(
  "/api/themes/blocks/:id",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const id = String(req.params.id);
    try {
      const [row] = await db
        .delete(themeblocks)
        .where(and(eq(themeblocks.id, id), eq(themeblocks.companyid, companyId)))
        .returning({ id: themeblocks.id });
      if (!row) return res.status(404).json({ error: "Block not found" });
      return res.json({ deleted: row });
    } catch (err) {
      logger.error({ err, companyId, id }, "Failed to delete block");
      return res.status(500).json({ error: "Failed to delete block" });
    }
  },
);

// [SCOPE 108 / T009] BEGIN — POST /api/themes/blocks/image/presign — presigned browser→S3 upload
const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive(),
});
router.post(
  "/api/themes/blocks/image/presign",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid upload request", details: parsed.error.issues });
    }
    try {
      const result = await presignBlockImageUpload(parsed.data);
      return res.json(result);
    } catch (err) {
      logger.error({ err, companyId }, "Failed to presign block image upload");
      const message = err instanceof Error ? err.message : "Failed to presign upload";
      return res.status(400).json({ error: message });
    }
  },
);
// [SCOPE 108 / T009] END

export default router;
