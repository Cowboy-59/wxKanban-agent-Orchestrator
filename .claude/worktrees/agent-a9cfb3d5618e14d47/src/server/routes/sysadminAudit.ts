import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq, gte, like, lte, sql, type SQL } from "drizzle-orm";
import { db } from "~/db/client.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { validateQuery } from "../middleware/validation.js";

const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 147 / T006] BEGIN — query contract for the SysAdmin audit trail (FR-006)
export const sysadminAuditQuerySchema = z.object({
  actor: z.string().uuid().optional(),
  action: z.string().regex(/^sysadmin_[a-z0-9_]+$/).optional(),
  targetType: z.string().min(1).max(50).optional(),
  targetId: z.string().min(1).max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SysadminAuditQuery = z.infer<typeof sysadminAuditQuerySchema>;
// [SCOPE 147 / T006] END

// [SCOPE 147 / T006] BEGIN — GET /api/sysadmin/audit: SysAdmin action records, newest first
/**
 * Lists companyauditlogs rows whose action starts sysadmin_ — SysAdmin actions only, never every
 * company's audit rows. `timestamp` is stored without a time zone in UTC, so from/to compare as UTC.
 */
router.get("/", validateQuery(sysadminAuditQuerySchema), async (_req: AuthRequest, res: Response, next) => {
  try {
    const q = res.locals.query as SysadminAuditQuery;
    const where: SQL[] = [like(companyauditlogs.action, "sysadmin\\_%")];
    if (q.actor) where.push(eq(companyauditlogs.changedby, q.actor));
    if (q.action) where.push(eq(companyauditlogs.action, q.action));
    if (q.targetType) where.push(sql`${companyauditlogs.newvalue} -> 'target' ->> 'type' = ${q.targetType}`);
    if (q.targetId) where.push(sql`${companyauditlogs.newvalue} -> 'target' ->> 'id' = ${q.targetId}`);
    if (q.from) where.push(gte(companyauditlogs.timestamp, new Date(q.from)));
    if (q.to) where.push(lte(companyauditlogs.timestamp, new Date(q.to)));

    const rows = await db
      .select({
        id: companyauditlogs.id,
        timestamp: companyauditlogs.timestamp,
        action: companyauditlogs.action,
        changedby: companyauditlogs.changedby,
        actoremail: userprofiles.emailaddr,
        previousvalue: companyauditlogs.previousvalue,
        newvalue: companyauditlogs.newvalue,
        description: companyauditlogs.description,
      })
      .from(companyauditlogs)
      .leftJoin(userprofiles, eq(userprofiles.id, companyauditlogs.changedby))
      .where(and(...where))
      .orderBy(desc(companyauditlogs.timestamp))
      .limit(q.limit)
      .offset(q.offset);

    res.json({ success: true, data: rows, paging: { limit: q.limit, offset: q.offset, returned: rows.length } });
  } catch (error) {
    next(error);
  }
});
// [SCOPE 147 / T006] END

export default router;
